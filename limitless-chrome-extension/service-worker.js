// Service worker for Limitless Extension

// In-memory maps
const activeTabTimes = {}; // last timestamp per active tab
const tabVisibility = {}; // visibility state per tabId
const peekStartTimes = {}; // key: tabId, value: timestamp when peek started
const notifiedThresholds = {}; // Tracks if user has been notified for 10, 5, 1 min left
const peekNotified = {}; // Tracks if user has been notified about peek mode per tabId

const blueColor = "#43DABE";
const orangeColor = "#FFC66B";
const redColor = "#FF6B6B";
const grayColor = "#1D1D1D";

// Calculate remaining time
function calculateTimeLeft(site) {
  if (!site) return 0;
  return Math.max((site.timeLimit || 0) - (site.usage || 0), 0);
}

// Notify the user when X time is left
function sendTimeLeftNotification(domain, minutesLeft) {
  chrome.notifications.create(`limitless-${domain}-${minutesLeft}`, {
    type: "basic",
    iconUrl: "assets/icons/icon128.png",
    title: "Limitless",
    silent: true,
    message: `You have ${minutesLeft} minutes left for ${domain}`,
    priority: 2
  });
}

// Track usage only for the tab if it's visible
async function trackUsage(tabId, url) {
  if (typeof tabId !== "number") return;

  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab.active || tabVisibility[tabId] === false) return;

    const domain = new URL(url).hostname.replace("www.", "");
    chrome.storage.local.get(["websites"], (data) => {
      let websites = data.websites || [];
      const site = websites.find(w => w.domain === domain);
      if (!site) return;

      const now = Date.now();
      const lastTime = activeTabTimes[tabId] || now;
      const diffMinutes = (now - lastTime) / 1000 / 60;
      site.usage = (site.usage || 0) + diffMinutes;
      activeTabTimes[tabId] = now;

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
    let websites = data.websites || [];
    const site = websites.find(w => w.domain === domain);
    if (!site) {
      chrome.action.setBadgeText({ text: "" });
      chrome.action.setBadgeBackgroundColor({ color: blueColor });
      return;
    }

    const timeLeft = calculateTimeLeft(site);

    // Notification checks
    // initialize tracking object for notifications
    if (!notifiedThresholds[domain]) {
      notifiedThresholds[domain] = { 10: false, 5: false, 1: false };
    }

    // Trigger thresholds only when transitioning downward
    if (timeLeft <= 10 && !notifiedThresholds[domain][10] && timeLeft > 9) {
      sendTimeLeftNotification(domain, 10);
      notifiedThresholds[domain][10] = true;
    }

    if (timeLeft <= 5 && !notifiedThresholds[domain][5] && timeLeft > 4) {
      sendTimeLeftNotification(domain, 5);
      notifiedThresholds[domain][5] = true;
    }

    if (timeLeft <= 1 && !notifiedThresholds[domain][1] && timeLeft > 0.9) {
      sendTimeLeftNotification(domain, 1);
      notifiedThresholds[domain][1] = true;
    }

    //Badge logic
    let text = "";
    let color = blueColor;

    if (timeLeft > 1) {
        text = Math.floor(timeLeft) + "m";
        if (timeLeft <= 15) color = orangeColor;
    } else if (timeLeft > 0) {
        text = "<1m";
        color = redColor;
    } else {
        text = "0m";
        color = grayColor;
    }

    chrome.action.setBadgeText({ text });
    chrome.action.setBadgeBackgroundColor({ color });
  });
}

// Block a website if limit reached
function checkAndBlock(tabId, url) {
  const domain = new URL(url).hostname.replace("www.", "");
  chrome.storage.local.get(["websites", "peekDuration"], (data) => {
    let websites = data.websites || [];
    const site = websites.find(w => w.domain === domain);
    if (!site) return;

    const timeLeft = calculateTimeLeft(site);
    const peekDuration = data.peekDuration || 0.5; // minutes

    if (timeLeft > 0) {
      return;
    }

    if (site.peekMode) { // peek mode delay before block
      const now = Date.now();
      if (!peekStartTimes[tabId]) {
        peekStartTimes[tabId] = now;
        peekNotified[tabId] = false;
      }

      // Notify ONCE when Peek Mode begins
      if (!peekNotified[tabId]) {
        const text =
          peekDuration < 1 
          ? `${peekDuration * 60} seconds`
          : `${peekDuration > 1 ? "2 minutes" : "minute"}`

        chrome.notifications.create(`limitless-peek-${tabId}`, {
          type: "basic",
          iconUrl: "assets/icons/icon128.png",
          title: "Limitless",
          silent: true,
          message: `You're in Peek Mode for the next ${text}`,
          priority: 2
        });

        peekNotified[tabId] = true;
      }

      const elapsedPeekTime = (now - peekStartTimes[tabId]) / 1000 / 60;
      if (elapsedPeekTime >= peekDuration) { // block site after peek time
        chrome.tabs.update(tabId, {
          url: chrome.runtime.getURL(`blockedScreen/index.html?site=${domain}`)
        });
        delete peekStartTimes[tabId]; // reset for next peek
      }
    } else { // No peek mode, block immediately
      chrome.tabs.update(tabId, {
        url: chrome.runtime.getURL(`blockedScreen/index.html?site=${domain}`)
      });
    }
  });
}

// --- DAILY RESET FUNCTIONALITY ---
function resetDailyUsage() {
  const today = new Date().toDateString();
  chrome.storage.local.get(["lastReset", "websites"], (data) => {
    if (data.lastReset !== today) {
      const websites = data.websites || [];
      const resetWebsites = websites.map(site => ({ ...site, usage: 0 }));

      chrome.storage.local.set({
        websites: resetWebsites,
        lastReset: today
      }, () => {

        // Reset notification thresholds
        for (const domain in notifiedThresholds) {
          notifiedThresholds[domain] = { 10: false, 5: false, 1: false };
        }

        // Refresh badge for active tab if necessary
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0] && tabs[0].url) {
            updateBadge(tabs[0].id, tabs[0].url);
          }
        });
      });
    }
  });
}

// Schedule next midnight alarm
function scheduleMidnightReset() {
  const now = new Date();
  const nextMidnight = new Date();
  nextMidnight.setHours(24,0,0,0); // next calendar day midnight
  const msUntilMidnight = nextMidnight.getTime() - now.getTime();

  chrome.alarms.create("midnightReset", { when: Date.now() + msUntilMidnight });
}

// Listeners for immediate updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url) {
    trackUsage(tabId, tab.url);
    updateBadge(tabId, tab.url);
    checkAndBlock(tabId, tab.url);
  }
});

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const tab = await chrome.tabs.get(activeInfo.tabId);
  if (tab.url) {
    trackUsage(tab.id, tab.url);
    updateBadge(tab.id, tab.url);
    checkAndBlock(tab.id, tab.url);
  }
});

// Listen for visibility messages from content script
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "tab-visibility" && sender.tab) {
    tabVisibility[sender.tab.id] = !!msg.visible;
    activeTabTimes[sender.tab.id] = Date.now(); // reset last active time
  }

  if (msg.type === "getTimeLeft" && msg.domain) {
    chrome.storage.local.get(["websites"], (data) => {
      let websites = data.websites || [];
      const site = websites.find(w => w.domain === msg.domain);
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
  return false;
});

// Periodic badge updates for active tab
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create("updateBadge", { periodInMinutes: 5 / 60 });
  chrome.action.setBadgeBackgroundColor({ color: blueColor });
  chrome.action.setBadgeText({ text: "" });

  const today = new Date().toDateString(); // Initialize lastReset date
  chrome.storage.local.get(["lastReset"], (data) => {
    if (!data.lastReset) {
      chrome.storage.local.set({ lastReset: today });
    }
  });

  scheduleMidnightReset(); // schedule next reset
});

chrome.runtime.onStartup.addListener(() => {
  resetDailyUsage(); // reset on browser startup
  scheduleMidnightReset(); // schedule next reset
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "updateBadge") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0] || !tabs[0].url) return;
      const tabId = tabs[0].id;
      const url = tabs[0].url;

      trackUsage(tabId, url);
      updateBadge(tabId, url);
      checkAndBlock(tabId, url);
    });
  } else if (alarm.name === "midnightReset") {
    resetDailyUsage();
    scheduleMidnightReset(); // schedule for the next midnight
  }
});
