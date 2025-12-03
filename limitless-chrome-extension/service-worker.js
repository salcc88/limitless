// Limitless Extension
// Copyright 2025 Sal Costa
// https://salcosta.dev

// In-memory maps
const activeTabTimes = {}; // last timestamp per active tab
const tabVisibility = {}; // visibility state per tabId
const peekStartTimes = {}; // key: tabId, value: timestamp when peek started
const peekNotified = {}; // Tracks if user has been notified about peek mode per tabId
const notificationsSent = {};

const blueColor = "#75f8e0";
const orangeColor = "#FFC66B";
const redColor = "#FF6B6B";
const grayColor = "#1D1D1D";

// check if disabled
async function getStorage(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, resolve);
  });
}
function timeStringToMinutes(str) {
  const [h, m] = str.split(":").map(Number);
  return h * 60 + m;
}
async function checkIfDisabled( { notifyTimer = true } = {}) {
  const data = await getStorage([
    "disableAll",
    "allWeek",
    "allDay",
    "weekSchedule",
    "scheduleStart",
    "scheduleEnd",
    "showTimer", // only used for messaging
  ]);

  if (data.disableAll) { // Kill switch active
    //TIMER DEBUG
    //if (notifyTimer) sendIsDisabledToTimer(true, data.showTimer);
    return true; 
  }

  const now = new Date();
  const currentDay = now.getDay(); 
  const currentTime = now.getHours() * 60 + now.getMinutes();

  // Days allowed
  const mask = data.allWeek ? 0b1111111 : Number(data.weekSchedule || 0);
  const isDayAllowed = !!(mask & (1 << currentDay));

  // Time allowed
  let isTimeAllowed = true;
  if (!data.allDay) {
    const start = timeStringToMinutes(data.scheduleStart || "09:00");
    const end = timeStringToMinutes(data.scheduleEnd || "17:30");
    isTimeAllowed = currentTime >= start && currentTime <= end;
  }

  let isDisabled = !(isDayAllowed && isTimeAllowed);
  //TIMER DEBUG
  //if (notifyTimer) sendIsDisabledToTimer(isDisabled, data.showTimer);
  return isDisabled;
}

// Calculate remaining time
function calculateTimeLeft(site) {
  if (!site) return 0;
  return Math.max((site.timeLimit || 0) - (site.usage || 0), 0);
}

// get url path with trimmed www. and trailing slash
function normalizeUrl(url) {
  const fullUrl = new URL(url);
  const normalizedUrl = (fullUrl.hostname.replace("www.", "") + fullUrl.pathname).replace(/\/$/, "");
  return (normalizedUrl);
}

// get best matching site for a url path
function getMatchingSite(normalizedUrl, websites) {
  return websites.reduce((best, site) => {
    if (normalizedUrl.startsWith(site.domain)) {
      return !best || site.domain.length > best.domain.length ? site : best;
    }
    return best;
  }, null);
}

function initializeNotificationMap(websites) {
  websites.forEach(site => {
    const key = site.domain;
    if (!notificationsSent[key]) {
      notificationsSent[key] = { 10: false, 5: false, 1: false };
    }
  });
}
// Notify the user when X time is left
function sendTimeLeftNotification(domain, minutesLeft) {
  chrome.notifications.create(`limitless-${domain}-${minutesLeft}`, {
    type: "basic",
    iconUrl: "assets/icons/icon128.png",
    title: "Limitless",
    silent: true,
    message: `You have ${minutesLeft} minute${minutesLeft === 1 ? '' : 's'} left for ${domain}`,
    priority: 2
  });
}

// floating timer messaging
//TIMER DEBUG
// function sendTimeLeftToTimer(domain, timeLeft) {
//   chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
//     if (!tabs[0] || !tabs[0].url.startsWith("http")) return;
// 
//     chrome.tabs.sendMessage(tabs[0].id, { type: "timerUpdateTime", domain, timeLeft }, () => {
//       if (chrome.runtime.lastError) {
//         console.error("sendMessage failed:", chrome.runtime.lastError.message);
//       } else {
//         console.log("sendTimeLeftToTimer sent", domain, timeLeft);
//       }
//     });
//   });
// }
// 
// function sendIsDisabledToTimer(disabled, showTimer) {
//   chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
//     if (!tabs[0] || !tabs[0].url.startsWith("http")) return;
// 
//     chrome.tabs.sendMessage(tabs[0].id, { 
//       type: "timerUpdateDisabled", 
//       disabled, 
//       showTimer 
//     }, () => {
//       if (chrome.runtime.lastError) {
//         console.log("Pre-existing tabs could not be injected. Re-open these tabs to start using timers.");
//       }
//     });
//   });
// }


// Track usage only for the tab if it's visible
async function trackUsage(tabId, url, storageData) {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab.active || tabVisibility[tabId] === false) return;

    const normalizedFullPath = normalizeUrl(url);
    let websites = storageData.websites || [];
    const site = getMatchingSite(normalizedFullPath, websites);
    if (!site) return;

    const now = Date.now();
    const lastTime = activeTabTimes[tabId] || now;
    const diffMinutes = (now - lastTime) / 1000 / 60;

    site.usage = (site.usage || 0) + diffMinutes;
    activeTabTimes[tabId] = now;

    chrome.storage.local.set({ websites });
  } catch (err) {
  }
}

// Update badge for a site
async function updateBadge(url, storageData) {
  const normalizedFullPath = normalizeUrl(url);
  let websites = storageData.websites || [];
  const site = getMatchingSite(normalizedFullPath, websites);
  if (!site) {
    chrome.action.setBadgeText({ text: "" });
    chrome.action.setBadgeBackgroundColor({ color: blueColor });
    return;
  }

  const timeLeft = calculateTimeLeft(site);

  // Send notifications if thresholds are crossed downward
  [10, 5, 1].forEach(threshold => {
    if (
      timeLeft <= threshold &&
      !notificationsSent[normalizedFullPath][threshold] &&
      timeLeft > threshold - 1
    ) {
      sendTimeLeftNotification(site.domain, threshold);
      notificationsSent[normalizedFullPath][threshold] = true;
    }
  });

  //Badge logic
  let text = "";
  let color = blueColor;

  if (timeLeft > 1) {
    text = Math.floor(timeLeft) + "m";
    if (timeLeft <= 10) color = orangeColor;
  } else if (timeLeft > 0) {
    text = "<1m";
    color = redColor;
  } else {
    text = "0m";
    color = grayColor;
  }

  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color });
  //TIMER DEBUG
  // sendTimeLeftToTimer(site.domain, text);
}

// Block a website if limit reached
async function checkAndBlock(tabId, url, storageData) {
  const normalizedFullPath = normalizeUrl(url);
  let websites = storageData.websites || [];
  const site = getMatchingSite(normalizedFullPath, websites);
  if (!site) return;

  const timeLeft = calculateTimeLeft(site);
  const peekDuration = storageData.peekDuration || 0.25; // minutes

  if (timeLeft > 0) return;

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
        url: chrome.runtime.getURL(`blockedScreen/index.html?site=${site.domain}`)
      });
      delete peekStartTimes[tabId]; // reset for next peek
    }
  } else { // No peek mode, block immediately
    chrome.tabs.update(tabId, {
      url: chrome.runtime.getURL(`blockedScreen/index.html?site=${site.domain}`)
    });
  };
};

async function coreOperations() {
  try {
    const disabled = await checkIfDisabled();
    if (disabled) return;

    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs.length || !tabs[0].url) return;

    const storageData = await getStorage(["websites", "peekDuration"]);
    await trackUsage(tabs[0].id, tabs[0].url, storageData);
    await checkAndBlock(tabs[0].id, tabs[0].url, storageData);
    await updateBadge(tabs[0].url, storageData);
  } catch (err) { console.error('core operations failed');
  }
};

async function resetDailyUsage() {
  const today = new Date().toDateString();
  const storageData = await getStorage(["websites", "lastReset"]);

  if (storageData.lastReset !== today) {
    const websites = storageData.websites || [];
    const resetWebsites = websites.map(site => ({ 
      ...site, 
      usage: 0
    }));

    await new Promise((resolve) =>
      chrome.storage.local.set({ websites: resetWebsites, lastReset: today }, resolve)
    );

    Object.keys(notificationsSent).forEach(key => {
      notificationsSent[key] = { 10: false, 5: false, 1: false };
    });
    
    // Refresh badge for active tab if necessary
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0] && tabs[0].url) {
      await updateBadge(tabs[0].url, {websites: resetWebsites });
    }
  }
};

// Schedule next midnight alarm
function scheduleMidnightReset() {
  const now = new Date();
  const nextMidnight = new Date();
  nextMidnight.setHours(24,0,0,0); // next calendar day midnight
  const msUntilMidnight = nextMidnight.getTime() - now.getTime();

  chrome.alarms.create("midnightReset", { when: Date.now() + msUntilMidnight });
}

// Update when tab is activated or updated
chrome.tabs.onUpdated.addListener(async () => {
  await coreOperations();
});

chrome.tabs.onActivated.addListener(async () => {
  await coreOperations();
});

// Clean up state when a tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  delete peekStartTimes[tabId];
  delete peekNotified[tabId];
  delete tabVisibility[tabId];
  delete activeTabTimes[tabId];
});

// send disabled status to popup and listen for visiblity messages
chrome.runtime.onMessage.addListener(async (msg, sender, sendResponse) => {
  // TIMER DEBUG
  // if (msg.type === "settingsUpdated") {
  //   const storageData = await getStorage(["websites"]);
  //   initializeNotificationMap(storageData.websites || []);
  //   await coreOperations();
  //   return false; 
  // }
  if (msg.type === "tabVisibility" && sender.tab) {
    tabVisibility[sender.tab.id] = !!msg.visible;
    activeTabTimes[sender.tab.id] = Date.now(); // reset last active time
    return false;
  }
});

// Periodic badge updates for active tab
chrome.runtime.onInstalled.addListener(async () => {
  chrome.alarms.create("updateAll", { periodInMinutes: 5 / 60 }); // every 5 seconds

  chrome.notifications.create(`limitless-install`, {
    type: "basic",
    iconUrl: "assets/icons/icon128.png",
    title: "Limitless",
    silent: true,
    requireInteraction: true,
    message: `Thanks for using Limitless! Be sure to pin the extension to the toolbar to see your live website timers.`,
    priority: 2
  });

  const today = new Date().toDateString(); // Initialize lastReset date
  const storageData = await getStorage(["lastReset", "websites"]);
  initializeNotificationMap(storageData.websites || []);

  if (!storageData.lastReset) {
    chrome.storage.local.set({ lastReset: today });
  }
  scheduleMidnightReset(); // schedule next reset
});

chrome.runtime.onStartup.addListener( async () => {
  await resetDailyUsage(); // check for reset on browser startup
  scheduleMidnightReset(); // schedule next reset
  const storageData = await getStorage(["websites"]);
  initializeNotificationMap(storageData.websites || []);
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === "popup") {
    (async () => {
      // Get the latest status right when the popup connects
      const status = await checkIfDisabled({ notifyTimer: false });
      port.postMessage({ type: "updateStatusInPopup", disabledStatus: status });
    })();
  }
});


chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "updateAll") {
    await coreOperations();
  } else if (alarm.name === "midnightReset") {
    resetDailyUsage();
    scheduleMidnightReset(); // schedule for the next midnight
  }
});
