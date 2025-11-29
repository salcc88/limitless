// Service worker for Limitless Extension

// In-memory maps
const activeTabLastTime = {}; // key: tabId, value: last timestamp for usage
const peekStartTimes = {};    // key: tabId, value: timestamp when peek started

// Calculate remaining time (in minutes) based on usage
function calculateTimeLeft(site) {
    if (!site) return 0;
    return Math.max((site.timeLimit || 0) - (site.usage || 0), 0);
}

// Track usage only for the active tab
async function trackUsage(url, tabId) {
    if (typeof tabId !== "number") return;

    try {
        const tab = await chrome.tabs.get(tabId);
        if (!tab.active) return;

        const domain = new URL(url).hostname.replace("www.", "");
        chrome.storage.local.get(["websites"], (data) => {
            const websites = data.websites || [];
            const site = websites.find(w => w.domain === domain);
            if (!site) return;

            const now = Date.now();
            const lastTime = activeTabLastTime[tabId] || now;
            const diffMinutes = (now - lastTime) / 1000 / 60;

            site.usage = (site.usage || 0) + diffMinutes;

            activeTabLastTime[tabId] = now;

            chrome.storage.local.set({ websites });
        });
    } catch (err) {
        console.error("Failed to get tab in trackUsage:", err);
    }
}

// Update badge for a site
function updateBadge(tabId, url) {
    const domain = new URL(url).hostname.replace("www.", "");
    chrome.storage.local.get(["websites"], (data) => {
        const site = data.websites?.find(w => w.domain === domain);
        if (!site) {
            chrome.action.setBadgeText({ text: "" });
            chrome.action.setBadgeBackgroundColor({ color: "#008000" });
            return;
        }

        const timeLeft = calculateTimeLeft(site);
        let text = "";
        let color = "#008000";

        if (timeLeft > 1) {
            text = Math.floor(timeLeft) + "m";
            if (timeLeft <= 15) color = "#FFA500"; // orange warning
        } else if (timeLeft > 0) {
            text = "<1m";
            color = "#FFA500"; // orange
        } else {
            text = "0m";
            color = "#FF0000"; // red
        }

        chrome.action.setBadgeText({ text });
        chrome.action.setBadgeBackgroundColor({ color });
    });
}

// Check and block with Peek Mode consideration
function checkAndBlock(tabId, url) {
    const domain = new URL(url).hostname.replace("www.", "");
    chrome.storage.local.get(["websites"], (data) => {
        const websites = data.websites || [];
        const site = websites.find(w => w.domain === domain);
        if (!site) return;

        const timeLeft = calculateTimeLeft(site);

        if (timeLeft <= 0) {
            if (site.peekMode) {
                const now = Date.now();
                if (!peekStartTimes[tabId]) peekStartTimes[tabId] = now;
                const elapsed = (now - peekStartTimes[tabId]) / 1000 / 60; // minutes
                if (elapsed >= (site.peekTime || 0.5)) {
                    chrome.tabs.update(tabId, {
                        url: chrome.runtime.getURL(`blockedScreen/index.html?site=${domain}`)
                    });
                }
            } else {
                // Block immediately if not in peek mode
                chrome.tabs.update(tabId, {
                    url: chrome.runtime.getURL(`blockedScreen/index.html?site=${domain}`)
                });
            }
        } else {
            // Reset peekStart if main timer is > 0
            if (peekStartTimes[tabId]) delete peekStartTimes[tabId];
        }
    });
}

// Immediate listeners for tab updates/activation
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === "complete" && tab.url) {
        trackUsage(tab.url, tabId);
        updateBadge(tabId, tab.url);
        checkAndBlock(tabId, tab.url);
    }
});

chrome.tabs.onActivated.addListener(async (activeInfo) => {
    try {
        const tab = await chrome.tabs.get(activeInfo.tabId);
        if (tab.url) {
            trackUsage(tab.url, tab.id);
            updateBadge(tab.id, tab.url);
            checkAndBlock(tab.id, tab.url);
        }
    } catch (err) {
        console.error("Failed to get tab on activation:", err);
    }
});

// Expose timeLeft and websites to popup/dashboard
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "getTimeLeft" && msg.domain) {
        chrome.storage.local.get(["websites"], (data) => {
            const site = data.websites?.find(w => w.domain === msg.domain);
            sendResponse(site ? calculateTimeLeft(site) : 0);
        });
        return true;
    }

    if (msg.type === "getWebsites") {
        chrome.storage.local.get(["websites"], (data) => {
            sendResponse(data.websites || []);
        });
        return true;
    }
});

// Periodic alarm for active tab updates (every 5 seconds)
chrome.runtime.onInstalled.addListener(() => {
    chrome.alarms.create("updateBadge", { periodInMinutes: 5 / 60 });
    chrome.action.setBadgeBackgroundColor({ color: "#008000" });
    chrome.action.setBadgeText({ text: "" });
});

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "updateBadge") {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (!tabs[0] || !tabs[0].url) return;
            const tabId = tabs[0].id;
            const url = tabs[0].url;

            trackUsage(url, tabId);
            updateBadge(tabId, url);
            checkAndBlock(tabId, url);
        });
    }
});
