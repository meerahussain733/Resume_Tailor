// Scrapes job data from LinkedIn, Indeed, and Handshake job pages

function scrapeJobData() {
  function t(el) { return el?.innerText?.trim() || ''; }

  const url = window.location.href;
  const isIndeed = url.includes('indeed.com');
  const isHandshake = url.includes('joinhandshake.com');

  let title = '', company = '', description = '';

  if (isIndeed) {
    title =
      t(document.querySelector('h1[data-testid="jobsearch-JobInfoHeader-title"]')) ||
      t(document.querySelector('h1.jobsearch-JobInfoHeader-title')) ||
      t(document.querySelector('h1[class*="title"]')) ||
      t(document.querySelector('h1'));

    company =
      t(document.querySelector('[data-testid="inlineHeader-companyName"] a')) ||
      t(document.querySelector('[data-testid="inlineHeader-companyName"]')) ||
      t(document.querySelector('.jobsearch-InlineCompanyRating-companyHeader a')) ||
      t(document.querySelector('[class*="companyName"] a')) ||
      t(document.querySelector('[class*="companyName"]'));

    description =
      t(document.querySelector('#jobDescriptionText')) ||
      t(document.querySelector('[id*="jobDescription"]'));

    // Title/company fallback from document.title: "Job Title - Company | Indeed"
    if (!title || !company) {
      const raw = (document.title || '').replace(/\s*\|\s*Indeed.*$/i, '').trim();
      const dashIdx = raw.lastIndexOf(' - ');
      if (dashIdx !== -1) {
        if (!title)   title   = raw.slice(0, dashIdx).trim();
        if (!company) company = raw.slice(dashIdx + 3).trim();
      }
    }

  } else if (isHandshake) {
    title =
      t(document.querySelector('h1[class*="job-title"]')) ||
      t(document.querySelector('h1[class*="title"]')) ||
      t(document.querySelector('h1'));

    company =
      t(document.querySelector('[class*="employer-profile"] h2')) ||
      t(document.querySelector('[class*="employer-name"] a')) ||
      t(document.querySelector('[class*="employer-name"]')) ||
      t(document.querySelector('a[href*="/employers/"]'));

    description =
      t(document.querySelector('[class*="job-description"]')) ||
      t(document.querySelector('[class*="posting-description"]')) ||
      t(document.querySelector('[class*="description"]'));

    // Fallback from document.title: "Job Title at Company | Handshake"
    if (!title || !company) {
      const raw = (document.title || '').replace(/\s*\|\s*Handshake.*$/i, '').trim();
      const atIdx = raw.search(/\s+at\s+/i);
      if (atIdx !== -1) {
        if (!title)   title   = raw.slice(0, atIdx).trim();
        if (!company) company = raw.slice(atIdx).replace(/^\s+at\s+/i, '').trim();
      }
    }

  } else {
    // LinkedIn
    title =
      t(document.querySelector('.job-details-jobs-unified-top-card__job-title h1')) ||
      t(document.querySelector('.jobs-unified-top-card__job-title h1')) ||
      t(document.querySelector('h1.t-24')) ||
      t(document.querySelector('h1[class*="job-title"]')) ||
      t(document.querySelector('[class*="top-card"] h1')) ||
      t(document.querySelector('h1'));

    company =
      t(document.querySelector('.job-details-jobs-unified-top-card__company-name a')) ||
      t(document.querySelector('.jobs-unified-top-card__company-name a')) ||
      t(document.querySelector('.topcard__org-name-link')) ||
      t(document.querySelector('a[class*="company-name"]')) ||
      t(document.querySelector('a[href*="/company/"]'));

    // LinkedIn title fallback from document.title: "Job Title at Company | LinkedIn"
    if (!title || !company) {
      const raw = (document.title || '').replace(/\s*\|\s*LinkedIn.*$/i, '').trim();
      const atIdx = raw.search(/\s+at\s+/i);
      if (atIdx !== -1) {
        if (!title)   title   = raw.slice(0, atIdx).trim();
        if (!company) company = raw.slice(atIdx).replace(/^\s+at\s+/i, '').replace(/\s+in\s+.+$/i, '').trim();
      }
    }

    description =
      t(document.querySelector('.jobs-description__content .jobs-box__html-content')) ||
      t(document.querySelector('#job-details')) ||
      t(document.querySelector('.jobs-description-content__text')) ||
      t(document.querySelector('[class*="description__text"]')) ||
      t(document.querySelector('.description__text'));
  }

  // Universal fallback: find the biggest content block that looks like a JD
  if (!description) {
    let best = null, bestLen = 200;
    document.querySelectorAll('div, section, article').forEach(el => {
      const txt = el.innerText?.trim() || '';
      if (txt.length > bestLen && el.children.length < 40 &&
          /responsibilit|qualif|requirement|experience|skill/i.test(txt)) {
        best = el; bestLen = txt.length;
      }
    });
    if (best) description = t(best);
  }

  return { title, company, description };
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'scrapeJob') {
    const data = scrapeJobData();
    sendResponse(data);
  }
  return true;
});
