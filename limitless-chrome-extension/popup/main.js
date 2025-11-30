const siteList = document.getElementById("site-list");
const configureBtn = document.getElementById("configure-btn");

// Calculate remaining time for a site (ignores peek)
function calculateTimeLeft(site) {
  if (!site) return 0;
  const limit = site.timeLimit || 0;
  const usage = site.usage || 0;
  return Math.max(limit - usage, 0);
}

// Render list of websites
function renderSites() {
  chrome.storage.local.get(["websites"], (data) => {
    siteList.innerHTML = "";
    const websites = data.websites || [];

    websites.forEach(site => {
      const li = document.createElement("li");
      li.textContent = site.domain + ":";

      const timeLeftSpan = document.createElement("span");
      function updateTimeLeft() {
        const timeLeft = calculateTimeLeft(site);
        timeLeftSpan.textContent = `Time left: ${timeLeft > 1 ? Math.floor(timeLeft) : 0} min`;
      }

      updateTimeLeft();
      setInterval(updateTimeLeft, 5000); // update every 5 seconds

      li.appendChild(timeLeftSpan);
      siteList.appendChild(li);
    });
  });
}

// Open dashboard
configureBtn.addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("dashboard/index.html") });
});

// Initial render
renderSites();
