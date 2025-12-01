const siteList = document.getElementById("site-list");
const configureBtn = document.getElementById("configure-btn");

// Calculate remaining time for a site (ignores peek)
function calculateTimeLeft(site) {
  if (!site) return 0;
  const limit = site.timeLimit || 0;
  const usage = site.usage || 0;
  return Math.max(limit - usage, 0);
}
function getMatchingSite(normalizedFullPath, websites) {
  const matches = websites.filter(w => normalizedFullPath.startsWith(w.domain));
  if (!matches.length) return null;
  matches.sort((a, b) => b.domain.length - a.domain.length);
  return matches[0];
}

// ask for disabled status
chrome.runtime.sendMessage({ type: "CHECK_DISABLED" }, (res) => {
  const disabled = res?.disabled;
  const statusSpan = document.getElementById("status");

  statusSpan.textContent = disabled ? 'Inactive' : 'Active';
  statusSpan.classList.toggle('off', disabled);
});

// Open dashboard
configureBtn.addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("dashboard/index.html") });
});

