// Scrapes job data from LinkedIn job detail pages

function scrapeJobData() {
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
    t(document.querySelector('a[class*="company-name"]')) ||
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

  const descriptionEl =
    document.querySelector('.jobs-description__content .jobs-box__html-content') ||
    document.querySelector('#job-details') ||
    document.querySelector('.jobs-description-content__text') ||
    document.querySelector('[class*="description__text"]') ||
    document.querySelector('.description__text');

  const description = descriptionEl?.innerText?.trim() || '';

  return { title, company, description };
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'scrapeJob') {
    const data = scrapeJobData();
    sendResponse(data);
  }
  return true;
});
