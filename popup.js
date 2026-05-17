// State
let tailoredText = '';
let currentJob = { company: '', title: '' };
let mainInitialized = false;
let isGeneratingLatex = false;

// ── Boot ──────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  const data = await storage('get', ['user_name', 'api_key', 'master_doc']);
  const isSetup = data.user_name && data.api_key && data.master_doc;
  showScreen(isSetup ? 'main' : 'onboarding');
  if (isSetup) initMain();
});

// ── Screen routing ────────────────────────────────────────────────────────

function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  document.getElementById(`screen-${name}`).classList.remove('hidden');
}

// ── Onboarding ────────────────────────────────────────────────────────────

document.getElementById('btn-save-setup').addEventListener('click', async () => {
  const name  = document.getElementById('user-name').value.trim();
  const key   = document.getElementById('api-key-onboard').value.trim();
  const doc   = document.getElementById('master-doc-onboard').value.trim();
  const notes = document.getElementById('agent-notes-onboard').value.trim();
  const err   = document.getElementById('onboard-error');

  if (!name)                      return showError(err, 'Please enter your name.');
  if (!key.startsWith('sk-')) return showError(err, 'OpenAI API key should start with sk-.');
  if (!doc)                       return showError(err, 'Please paste your master career document.');

  err.textContent = '';
  await storage('set', { user_name: name, api_key: key, master_doc: doc, agent_notes: notes });
  showScreen('main');
  initMain();
});

// ── Main screen ───────────────────────────────────────────────────────────

async function initMain() {
  if (!mainInitialized) {
    mainInitialized = true;

    document.getElementById('btn-settings').addEventListener('click', () => { initSettings(); showScreen('settings'); });
    document.getElementById('btn-history').addEventListener('click', () => { initHistory(); showScreen('history'); });
    document.getElementById('btn-tailor').addEventListener('click', tailorResume);

    document.getElementById('job-title').addEventListener('input', e => {
      currentJob.title = e.target.textContent.trim();
    });
    document.getElementById('job-company').addEventListener('input', e => {
      currentJob.company = e.target.textContent.trim();
    });
  }

  // Scrape job on every visit to main screen; fall back to last saved job
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.url?.includes('linkedin.com/jobs')) {
      const job = await scrapeCurrentTab(tab.id);
      if (job?.description) {
        await storage('set', { last_job: job });
        showJobCard(job, '');
      } else {
        document.getElementById('scrape-note').textContent = 'Click a job listing to load its description.';
      }
    } else {
      await loadLastJob();
    }
  } catch {
    await loadLastJob();
  }
}

async function tailorResume() {
  const errEl = document.getElementById('main-error');
  errEl.textContent = '';
  hideEl('result-area');

  const data = await storage('get', ['master_doc', 'agent_notes', 'api_key']);
  if (!data.api_key)    return showError(errEl, 'No API key found. Check Settings.');
  if (!data.master_doc) return showError(errEl, 'No master career document found. Check Settings.');

  let jdText = '';
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.url?.includes('linkedin.com/jobs')) {
      const job = await scrapeCurrentTab(tab.id);
      jdText = job?.description || '';
      if (job?.company) { currentJob.company = job.company; document.getElementById('job-company').textContent = job.company; }
      if (job?.title)   { currentJob.title = job.title; document.getElementById('job-title').textContent = job.title; }
      if (jdText) await storage('set', { last_job: job });
    }
    if (!jdText) {
      // Fall back to last saved job
      const stored = await storage('get', ['last_job']);
      if (stored.last_job?.description) {
        jdText = stored.last_job.description;
        if (!currentJob.company && stored.last_job.company) { currentJob.company = stored.last_job.company; document.getElementById('job-company').textContent = stored.last_job.company; }
        if (!currentJob.title  && stored.last_job.title)   { currentJob.title   = stored.last_job.title;   document.getElementById('job-title').textContent   = stored.last_job.title; }
      } else {
        return showError(errEl, 'No job description found. Navigate to a LinkedIn job listing first.');
      }
    }
  } catch (e) {
    return showError(errEl, `Scrape error: ${e?.message || e}`);
  }

  showEl('status-area');
  setStatus('Analyzing with OpenAI...');
  const btn = document.getElementById('btn-tailor');
  btn.disabled = true;

  const jdTrimmed = jdText.length > 6000 ? jdText.slice(0, 6000) + '\n[truncated]' : jdText;
  const prompt = buildPrompt(jdTrimmed, data.master_doc, data.agent_notes || '');

  let responseText;
  try {
    responseText = await callOpenAI(data.api_key, prompt);
  } catch (e) {
    hideEl('status-area');
    return showError(errEl, `API error: ${e.message}`);
  } finally {
    btn.disabled = false;
  }

  const parsed = parseResponse(responseText);
  tailoredText = parsed.tailoredText;

  setStatus('Done!', true);

  // Match score badge
  const badge = document.getElementById('match-badge');
  if (parsed.matchScore !== null) {
    const color = parsed.matchScore >= 80 ? '#10b981' : parsed.matchScore >= 60 ? '#f59e0b' : '#ef4444';
    badge.textContent = `${parsed.matchScore}% match`;
    badge.style.background = color;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }

  // Track badge
  const trackBadge = document.getElementById('track-badge');
  if (parsed.roleType) {
    trackBadge.textContent = `${parsed.roleType} track`;
    trackBadge.classList.remove('hidden');
  } else {
    trackBadge.classList.add('hidden');
  }

  // Gap analysis
  const gapSection = document.getElementById('gap-section');
  if (parsed.gapAnalysis) {
    const gapList = document.getElementById('gap-list');
    gapList.innerHTML = '';
    parsed.gapAnalysis.split('\n').filter(l => l.trim()).forEach(line => {
      const div = document.createElement('div');
      div.className = 'gap-item';
      div.textContent = line.replace(/^[-•*]\s*/, '');
      gapList.appendChild(div);
    });
    gapSection.classList.remove('hidden');
  } else {
    gapSection.classList.add('hidden');
  }

  showEl('result-area');
  document.getElementById('btn-download').onclick = downloadPDF;
  isGeneratingLatex = false;
  const overleafBtn = document.getElementById('btn-overleaf');
  overleafBtn.textContent = 'Open in Overleaf';
  overleafBtn.disabled = false;
  overleafBtn.onclick = handleOverleaf;

  await logApplication({
    company: currentJob.company,
    title: currentJob.title,
    matchScore: parsed.matchScore,
    roleType: parsed.roleType,
    date: new Date().toISOString()
  });
}

// ── Prompt ────────────────────────────────────────────────────────────────

function buildPrompt(jdText, masterDoc, agentNotes) {
  const trackInstruction = `Detect the role type from the job description: AI (LLM/NLP/GenAI/agentic systems), DA (analytics/BI/SQL/dashboards), or ML (modeling/research/MLOps). Assemble the resume emphasizing experiences, skills, and projects most relevant to the detected type.`;

  const agentSection = agentNotes
    ? `AGENT NOTES — follow these hard constraints exactly:\n${agentNotes}\n\n`
    : '';

  return `You are a professional resume writer. Follow these rules without exception:

1. ZERO FABRICATION — every claim must come directly from the master document. Do not invent metrics, scope, or projects.
2. NO PLACEHOLDERS — never output text like [Your Name], [City], [Date], [relevant skill], or any bracket-enclosed template text. If a piece of information is not in the master document, omit that field or section entirely.
3. NO PADDING — do not write vague generic bullets ("collaborated on processes", "employed best practices") unless the master document provides specific supporting detail. A short resume with strong specific bullets beats a long resume with filler.
4. REFRAME, DON'T INVENT — you may rephrase existing bullets to incorporate JD keywords, but the underlying fact must exist in the master document.
5. STAR FORMAT — write every bullet as: strong action verb + what you did (specific technology/method) + measurable result or impact. Example: "Reduced reporting query time by 40% by building dbt models that replaced 6 manual SQL scripts." If the master document has no metric for a bullet, use action + specific context instead of a vague statement. Never invent a number.
6. SKILLS — copy the full Technical Skills section from the master document verbatim, then reorder categories to put the most JD-relevant ones first. Never drop individual skills or entire categories.
7. NO META-TEXT — do not add any commentary, explanation, notes, or closing remarks anywhere in your output. Any sentence beginning with "This resume", "Note:", "I have", "The above", or "This format" is strictly forbidden. The output ends at the last line of the resume — nothing after it.

${agentSection}${trackInstruction}

MASTER CAREER DOCUMENT:
${masterDoc}

JOB DESCRIPTION:
${jdText}

Tasks:
1. Include ALL experience entries from the master document — never drop a position. Reorder bullets within each position to lead with the most JD-relevant ones, but keep every job.
2. Select the most relevant projects (can omit less relevant ones).
3. Rewrite bullets to use JD keywords — only where the underlying fact is in the master document.
4. Score the match 0–100 based on how well the candidate's actual background fits the JD.
5. List up to 3 gaps (JD requirements absent from the master doc), or "None".

Output in EXACTLY this format:

ROLE_TYPE: [AI|DA|ML]
MATCH_SCORE: [0-100]

GAP_ANALYSIS:
[bullet list, one per line, or "None"]

TAILORED_RESUME:
[Only include sections with real data from the master document. No placeholder text of any kind. Contact info only if present in the master document.]`;
}

// ── Response parser ───────────────────────────────────────────────────────

function parseResponse(text) {
  const roleMatch   = text.match(/ROLE_TYPE:\s*(AI|DA|ML)/i);
  const scoreMatch  = text.match(/MATCH_SCORE:\s*(\d+)/i);
  const gapStart    = text.indexOf('GAP_ANALYSIS:');
  const resumeStart = text.indexOf('TAILORED_RESUME:');

  const roleType   = roleMatch?.[1]?.toUpperCase() || null;
  const matchScore = scoreMatch ? Math.min(100, Math.max(0, parseInt(scoreMatch[1]))) : null;

  let gapAnalysis = '';
  if (gapStart !== -1 && resumeStart !== -1) {
    const raw = text.slice(gapStart + 'GAP_ANALYSIS:'.length, resumeStart).trim();
    if (raw.toLowerCase() !== 'none') gapAnalysis = raw;
  }

  let tailoredText = '';
  if (resumeStart !== -1) {
    tailoredText = text.slice(resumeStart + 'TAILORED_RESUME:'.length).trim();
  } else {
    tailoredText = text;
  }

  // Strip trailing meta-commentary GPT adds after the resume content
  const trailingPatterns = [
    /\n(?:This resume|Note:|Note that|The above|This format|This tailored|Please note).+$/si,
    /\n---+\s*$.*/si,
    /\nI (?:have|hope|tried).+$/si,
  ];
  for (const pattern of trailingPatterns) {
    tailoredText = tailoredText.replace(pattern, '').trim();
  }

  return { roleType, matchScore, gapAnalysis, tailoredText };
}

// ── Open in Overleaf ──────────────────────────────────────────────────────

async function handleOverleaf() {
  if (isGeneratingLatex || !tailoredText) return;
  isGeneratingLatex = true;

  const btn = document.getElementById('btn-overleaf');
  btn.textContent = 'Generating...';
  btn.disabled = true;

  const data = await storage('get', ['api_key', 'latex_template']);
  try {
    const text = await callOpenAI(data.api_key, buildLatexPrompt(tailoredText, data.latex_template || ''));
    const latex = text.replace(/^```(?:latex)?\n?/, '').replace(/\n?```$/, '').trim();

    // POST to Overleaf's public "Open in Overleaf" endpoint — opens a new tab
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = 'https://www.overleaf.com/docs';
    form.target = '_blank';

    const snipInput = document.createElement('input');
    snipInput.type = 'hidden';
    snipInput.name = 'snip';
    snipInput.value = latex;
    form.appendChild(snipInput);

    const nameInput = document.createElement('input');
    nameInput.type = 'hidden';
    nameInput.name = 'snip_name';
    nameInput.value = 'resume.tex';
    form.appendChild(nameInput);

    document.body.appendChild(form);
    form.submit();
    document.body.removeChild(form);

    btn.textContent = 'Opened!';
    setTimeout(() => { btn.textContent = 'Open in Overleaf'; }, 2000);
  } catch (e) {
    btn.textContent = 'Error — retry';
    setTimeout(() => { btn.textContent = 'Open in Overleaf'; }, 2500);
  } finally {
    isGeneratingLatex = false;
    btn.disabled = false;
  }
}

function buildLatexPrompt(resumeText, latexTemplate) {
  if (latexTemplate) {
    return `You are given a LaTeX resume template and a tailored resume (plain text) that signals which content is most relevant for a target role. Produce a modified LaTeX document following these rules exactly:

1. Keep the preamble, \\newcommand definitions, and heading/contact block EXACTLY as in the template — do not change a single character.
2. Keep the Education section exactly as-is.
3. For Experience: include ALL positions in the same order. Within each position, keep ALL original bullet points word-for-word from the template — do not rewrite, summarize, or remove any bullet. Only reorder bullets so the most JD-relevant ones (based on the tailored resume text) appear first.
4. For Projects: include only projects that appear in the tailored resume text. For each included project, keep ALL original bullet points word-for-word from the template — do not rewrite or drop any bullet. Only reorder bullets so the most JD-relevant ones appear first.
5. For Technical Skills: reorder skill categories so the most JD-relevant appear first. Keep every skill from the template unchanged.
6. Use the exact same LaTeX commands as the template (\\resumeSubheading, \\resumeItem, \\resumeProjectHeading, etc.).
7. Output only the complete compilable LaTeX source — no explanation, no code fences, no markdown.

LATEX TEMPLATE:
${latexTemplate}

TAILORED RESUME TEXT (use only to determine relevance ordering — never replace template content with this):
${resumeText}`;
  }

  // Fallback if no template stored
  return `Convert the following resume text into a complete, compilable sb2nov LaTeX document. Use these commands:
\\resumeSubheading{Title}{Dates}{Organization}{Location}
\\resumeProjectHeading{\\textbf{Name} $|$ \\emph{Stack}}{Dates}
\\resumeItem{bullet}
\\resumeItemListStart ... \\resumeItemListEnd
\\resumeSubHeadingListStart ... \\resumeSubHeadingListEnd
Output only the complete LaTeX source — no explanation, no code fences.

RESUME TEXT:
${resumeText}`;
}

// ── PDF Download ──────────────────────────────────────────────────────────

async function downloadPDF() {
  if (!tailoredText) return;

  const data = await storage('get', ['user_name']);
  const userName = (data.user_name || 'Resume').replace(/\s+/g, '_');
  const company  = (currentJob.company || 'Company').replace(/\s+/g, '_');

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });

  const margin     = 50;
  const maxWidth   = doc.internal.pageSize.getWidth() - margin * 2;
  const lineHeight = 14;
  const pageHeight = doc.internal.pageSize.getHeight();

  doc.setFontSize(10.5);
  const lines = doc.splitTextToSize(tailoredText, maxWidth);
  let y = margin;

  lines.forEach(line => {
    if (y + lineHeight > pageHeight - margin) { doc.addPage(); y = margin; }
    const isHeader = /^[A-Z][A-Z\s]{2,}$/.test(line.trim()) && line.trim().length < 40;
    doc.setFont('helvetica', isHeader ? 'bold' : 'normal');
    doc.text(line, margin, y);
    y += lineHeight;
  });

  doc.save(`${company}_${userName}.pdf`);
}

// ── Settings ──────────────────────────────────────────────────────────────

async function initSettings() {
  const data = await storage('get', ['user_name', 'api_key', 'master_doc', 'agent_notes', 'latex_template']);
  document.getElementById('settings-name').value             = data.user_name       || '';
  document.getElementById('settings-api-key').value          = data.api_key         || '';
  document.getElementById('settings-master-doc').value       = data.master_doc      || '';
  document.getElementById('settings-agent-notes').value      = data.agent_notes     || '';
  document.getElementById('settings-latex-template').value   = data.latex_template  || '';

  document.getElementById('btn-save-settings').onclick = async () => {
    const name     = document.getElementById('settings-name').value.trim();
    const key      = document.getElementById('settings-api-key').value.trim();
    const doc      = document.getElementById('settings-master-doc').value.trim();
    const notes    = document.getElementById('settings-agent-notes').value.trim();
    const latex    = document.getElementById('settings-latex-template').value.trim();
    const err      = document.getElementById('settings-error');
    const ok       = document.getElementById('settings-success');

    if (!name) return showError(err, 'Name is required.');
    if (key && !key.startsWith('sk-')) return showError(err, 'OpenAI API key should start with sk-.');

    err.textContent = '';
    const toSave = { user_name: name, agent_notes: notes, latex_template: latex };
    if (key) toSave.api_key    = key;
    if (doc) toSave.master_doc = doc;
    await storage('set', toSave);

    ok.classList.remove('hidden');
    setTimeout(() => ok.classList.add('hidden'), 2000);
  };

  document.getElementById('btn-back-settings').onclick = () => showScreen('main');
}

// ── History ───────────────────────────────────────────────────────────────

async function logApplication(entry) {
  const data = await storage('get', ['app_log']);
  const log = data.app_log || [];
  log.unshift(entry);
  if (log.length > 50) log.splice(50);
  await storage('set', { app_log: log });
}

async function initHistory() {
  const data = await storage('get', ['app_log']);
  const log = data.app_log || [];
  const container = document.getElementById('history-list');

  renderHistory(container, log);

  document.getElementById('btn-back-history').onclick = () => showScreen('main');

  const clearBtn = document.getElementById('btn-clear-history');
  clearBtn.textContent = '✕';
  delete clearBtn.dataset.confirming;

  clearBtn.onclick = async () => {
    if (clearBtn.dataset.confirming) {
      await storage('set', { app_log: [] });
      renderHistory(container, []);
      clearBtn.textContent = '✕';
      delete clearBtn.dataset.confirming;
    } else {
      clearBtn.dataset.confirming = '1';
      clearBtn.textContent = 'Sure?';
      setTimeout(() => {
        clearBtn.textContent = '✕';
        delete clearBtn.dataset.confirming;
      }, 3000);
    }
  };
}

function renderHistory(container, log) {
  if (!log.length) {
    container.innerHTML = '<div class="log-empty">No applications logged yet.</div>';
    return;
  }

  container.innerHTML = log.map(entry => {
    const date = entry.date ? new Date(entry.date).toLocaleDateString() : '';
    const score = entry.matchScore !== null && entry.matchScore !== undefined ? `${entry.matchScore}%` : '';
    const scoreColor = entry.matchScore >= 80 ? '#10b981' : entry.matchScore >= 60 ? '#f59e0b' : '#ef4444';
    const track = entry.roleType || '';
    return `
      <div class="log-entry">
        <div class="log-main">
          <span class="log-title">${entry.title || 'Unknown role'}</span>
          <span class="log-company">${entry.company || ''}</span>
        </div>
        <div class="log-meta">
          ${score ? `<span class="log-score" style="color:${scoreColor}">${score}</span>` : ''}
          ${track ? `<span class="log-track">${track}</span>` : ''}
          <span class="log-date">${date}</span>
        </div>
      </div>`;
  }).join('');
}

// ── Job card helpers ──────────────────────────────────────────────────────

function showJobCard(job, note) {
  if (job.title)   { document.getElementById('job-title').textContent = job.title; currentJob.title = job.title; }
  if (job.company) { document.getElementById('job-company').textContent = job.company; currentJob.company = job.company; }
  document.getElementById('scrape-note').textContent = note;
}

async function loadLastJob() {
  const stored = await storage('get', ['last_job']);
  if (stored.last_job?.title || stored.last_job?.company) {
    showJobCard(stored.last_job, 'Last saved job — navigate to LinkedIn to refresh.');
  } else {
    document.getElementById('scrape-note').textContent = 'Navigate to a LinkedIn job listing to auto-fill.';
  }
}

// ── LinkedIn scraper ──────────────────────────────────────────────────────

async function scrapeCurrentTab(tabId) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      function t(el) { return el?.innerText?.trim() || ''; }

      let title =
        t(document.querySelector('.job-details-jobs-unified-top-card__job-title h1')) ||
        t(document.querySelector('.jobs-unified-top-card__job-title h1')) ||
        t(document.querySelector('h1.t-24')) ||
        t(document.querySelector('h1[class*="job-title"]')) ||
        t(document.querySelector('[class*="top-card"] h1')) ||
        t(document.querySelector('h1'));

      let company =
        t(document.querySelector('.job-details-jobs-unified-top-card__company-name a')) ||
        t(document.querySelector('.jobs-unified-top-card__company-name a')) ||
        t(document.querySelector('.topcard__org-name-link')) ||
        t(document.querySelector('[class*="company-name"] a')) ||
        t(document.querySelector('[class*="hiring-company"] a')) ||
        t(document.querySelector('a[href*="/company/"]'));

      // Fallback: parse document.title ("Job Title at Company | LinkedIn")
      if (!title || !company) {
        const raw = (document.title || '').replace(/\s*\|\s*LinkedIn.*$/i, '').trim();
        const atIdx = raw.search(/\s+at\s+/i);
        if (atIdx !== -1) {
          if (!title)   title   = raw.slice(0, atIdx).trim();
          if (!company) company = raw.slice(atIdx).replace(/^\s+at\s+/i, '').replace(/\s+in\s+.+$/i, '').trim();
        }
      }

      const descEl =
        document.querySelector('#job-details') ||
        document.querySelector('.jobs-description__content') ||
        document.querySelector('.jobs-description-content__text') ||
        document.querySelector('[class*="jobs-description"]') ||
        document.querySelector('[class*="job-description"]') ||
        document.querySelector('[class*="description__text"]');

      let description = t(descEl);

      if (!description) {
        let best = null, bestLen = 200;
        document.querySelectorAll('div, section, article').forEach(el => {
          const txt = el.innerText?.trim() || '';
          if (txt.length > bestLen && el.children.length < 40 &&
              /responsibilit|qualif|requirement|experience|skill/i.test(txt)) {
            best = el; bestLen = txt.length;
          }
        });
        description = t(best);
      }

      return { title, company, description };
    }
  });
  return results?.[0]?.result || {};
}

// ── OpenAI API (called directly from popup — avoids MV3 service worker kills) ──

async function callOpenAI(apiKey, prompt) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message || `API error ${response.status}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

// ── Helpers ───────────────────────────────────────────────────────────────

function storage(action, data) {
  return new Promise(resolve => {
    if (action === 'get') chrome.storage.local.get(data, resolve);
    else chrome.storage.local.set(data, () => resolve());
  });
}

function showError(el, msg) { el.textContent = msg; }

function setStatus(msg, done = false) {
  document.getElementById('status-text').textContent = msg;
  document.getElementById('spinner').classList.toggle('done', done);
}
function showEl(id) { document.getElementById(id).classList.remove('hidden'); }
function hideEl(id) { document.getElementById(id).classList.add('hidden'); }