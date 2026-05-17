// MV3 requires a service worker — API calls are made directly from popup.js instead.
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'ping') { sendResponse({ alive: true }); }
});
