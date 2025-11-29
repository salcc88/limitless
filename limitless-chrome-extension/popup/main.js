const siteList = document.getElementById("site-list");
const configureBtn = document.getElementById("configure-btn");

// Calculate remaining time for a site (ignores Sneak Peek)
function calculateTimeLeft(site) {
    if (!site) return 0;

    const limit = site.timeLimit; // ignore peekTime here
    let usage = site.usage || 0;
    if (site.lastVisit) {
        usage += (Date.now() - site.lastVisit) / 1000 / 60; // ms → minutes
    }

    return Math.max(limit - usage, 0);
}

// Render the list of websites in the popup
function renderSites() {
    chrome.storage.local.get(["websites"], (data) => {
        siteList.innerHTML = "";
        const websites = data.websites || [];

        websites.forEach((site) => {
            const li = document.createElement("li");
            li.textContent = site.domain + " - ";

            const timeLeftSpan = document.createElement("span");

            function updateTimeLeft() {
                const timeLeft = calculateTimeLeft(site);
                const display = timeLeft > 1 ? Math.floor(timeLeft) + "m" : "1m";
                timeLeftSpan.textContent = display;
            }

            updateTimeLeft();
            setInterval(updateTimeLeft, 60000); // update every minute

            li.appendChild(timeLeftSpan);
            siteList.appendChild(li);
        });
    });
}

// Open the full dashboard page
configureBtn.addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("dashboard/index.html") });
});

// Initial render
renderSites();
