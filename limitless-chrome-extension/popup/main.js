const siteList = document.getElementById("site-list");
const configureBtn = document.getElementById("configure-btn");

function calculateTimeLeft(site) {
    if (!site) return 0;
    return Math.max((site.timeLimit || 0) - (site.usage || 0), 0);
}

function renderSites() {
    chrome.storage.local.get(["websites"], (data) => {
        const websites = data.websites || [];
        siteList.innerHTML = "";

        websites.forEach((site) => {
            const li = document.createElement("li");
            li.textContent = site.domain + " - ";

            const timeLeftSpan = document.createElement("span");

            function updateTimeLeft() {
                const left = calculateTimeLeft(site);
                timeLeftSpan.textContent = left > 1 ? Math.floor(left) + "m" : (left > 0 ? "<1m" : "0m");
            }

            updateTimeLeft();
            setInterval(updateTimeLeft, 5000); // update every 5 seconds

            li.appendChild(timeLeftSpan);
            siteList.appendChild(li);
        });
    });
}

configureBtn.addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("dashboard/index.html") });
});

renderSites();
