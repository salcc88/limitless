// Service worker for Limitless Extension

// Calculate remaining time for a site (in minutes)
function calculateTimeLeft(site) {
    if (!site) return 0;

    let limit = site.timeLimit; // regular daily limit in minutes
    if (site.peekMode) limit = site.peekTime; // Sneak Peek override

    let usage = site.usage || 0;
    if (site.lastVisit) {
        usage += (Date.now() - site.lastVisit) / 1000 / 60; // ms → minutes
    }

    return Math.max(limit - usage, 0);
}

// Track usage when a tab is updated or activated
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === "complete" && tab.url) {
        trackUsage(tab.url);
        updateBadge(tabId, tab.url);
        checkAndBlock(tabId, tab.url);
    }
});

chrome.tabs.onActivated.addListener(async (activeInfo) => {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab.url) {
        trackUsage(tab.url);
        updateBadge(tab.id, tab.url);
        checkAndBlock(tab.id, tab.url);
    }
});

// Track usage for a site
function trackUsage(url) {
    const domain = new URL(url).hostname.replace("www.", "");
    chrome.storage.local.get(["websites"], (data) => {
        let websites = data.websites || [];
        const site = websites.find(w => w.domain === domain);
        if (!site) return;

        const now = Date.now();
        if (site.lastVisit) {
            const diffMinutes = (now - site.lastVisit) / 1000 / 60;
            site.usage = (site.usage || 0) + diffMinutes;
        }
        site.lastVisit = now;

        chrome.storage.local.set({ websites });
    });
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
        let text = '1m'; // default for ≤ 1 min
        let color = '#008000'; // green

        if (timeLeft > 60) {
            text = Math.floor(timeLeft / 60) + 'h';
            color = '#008000';
        } else if (timeLeft > 1) {
            text = Math.floor(timeLeft) + 'm';
            if (timeLeft <= 15) color = '#FFA500';
        } else {
            text = '1m'; // show "1m" even if < 1 min
            color = '#FF0000';
        }

        chrome.action.setBadgeText({ text });
        chrome.action.setBadgeBackgroundColor({ color });
    });
}

// Block a website if limit exceeded
function checkAndBlock(tabId, url) {
    const domain = new URL(url).hostname.replace("www.", "");
    chrome.storage.local.get(["websites"], (data) => {
        const websites = data.websites || [];
        const site = websites.find(w => w.domain === domain);
        if (!site) return;

        if (calculateTimeLeft(site) <= 0) {
            chrome.tabs.update(tabId, {
                url: chrome.runtime.getURL(`blockedScreen/index.html?site=${domain}`)
            });
        }
    });
}

// Expose timeLeft and full websites to popup/dashboard
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

// Set up periodic alarm for badge updates
chrome.runtime.onInstalled.addListener(() => {
    chrome.alarms.create("updateBadge", { periodInMinutes: 1 });
    chrome.action.setBadgeBackgroundColor({ color: "#008000" });
    chrome.action.setBadgeText({ text: "" });
});

// Alarm listener for periodic badge updates
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "updateBadge") {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (!tabs[0] || !tabs[0].url) return;
            updateBadge(tabs[0].id, tabs[0].url);
        });
    }
});
