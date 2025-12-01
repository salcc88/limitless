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

    if (websites.length === 0) {
      const li = document.createElement("li");
      li.classList.add("subtext");
      li.textContent = "No limits set.";
      siteList.appendChild(li);
      return;
    }

    websites.forEach(site => {
      const li = document.createElement("li");

      const websiteSpan = document.createElement("span");
      websiteSpan.classList.add("subtext");
      websiteSpan.textContent = site.domain + ":";

      const timeLeftSpan = document.createElement("span");
      timeLeftSpan.classList.add("subtext");
      function updateTimeLeft() {
        const timeLeft = calculateTimeLeft(site);
        timeLeftSpan.textContent = `${timeLeft > 1 ? Math.floor(timeLeft) : 0} min left`;
      }

      updateTimeLeft();
      setInterval(updateTimeLeft, 5000); // update every 5 seconds

      li.append(websiteSpan, timeLeftSpan);
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
