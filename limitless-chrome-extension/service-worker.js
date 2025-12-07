// Limitless Extension
// Copyright 2025 Sal Costa
// https://salcosta.dev

// In-memory maps
const activeTabTimes = {}; // last timestamp per active tab
const tabVisibility = {}; // visibility state per tabId
const peekStartTimes = {}; // key: tabId, value: timestamp when peek started
const peekNotified = {}; // Tracks if user has been notified about peek mode per tabId
const notificationsSent = {};

// badge state
const prevBadgeState = {};

// Timer state
const timerPorts = {};
const timerStrings = {}
const prevTimerStrings = {}
let isTimerDisabled = false;  // whether timers are currently disabled
let showTimer = true;       // whether to show timer (from storage)
const prevTimerDisabled = {}

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
async function checkIfDisabled() {
  const data = await getStorage([
    "disableAll",
    "allWeek",
    "allDay",
    "weekSchedule",
    "scheduleStart",
    "scheduleEnd",
    "showTimer", // only used for messaging
  ]);

  showTimer = data.showTimer ?? true;

  if (data.disableAll) { // Kill switch active
    isTimerDisabled = true;
    updateBigTimerDisable();
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
  isTimerDisabled = isDisabled;
  updateBigTimerDisable();
  return isDisabled;
}

// Calculate remaining time
function calculateTimeLeft(site) {
  if (!site) return 0;
  return Math.max((site.timeLimit || 0) - (site.usage || 0), 0);
}

// get url path with trimmed www. and trailing slash
function normalizeUrl(url) {
  if (!url || !url.startsWith("http")) {
    return null; 
  }
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
function validateWebsite(url, websites) {
  const normalizedUrl = normalizeUrl(url);
  if (!normalizedUrl) return null;
  const matchingSite = getMatchingSite(normalizedUrl, websites);
  if (!matchingSite) return null;
  return matchingSite;
}

function initializeNotificationMap(websites) {
  websites.forEach(site => {
    const key = site.domain;
    if (!notificationsSent[key]) {
      notificationsSent[key] = { 10: false, 5: false, 4: false, 3: false, 2: false, 1: false };
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
function updateBigTimerStrings(activeTabId = null, domainString = "", timeString = "0m", { force = false } = {}) {
  if (activeTabId) {
    timerStrings[activeTabId] = { domainString, timeString };
  }

  Object.entries(timerPorts).forEach(([tabId, port]) => {
    if (!port) return;

    const { domainString: domain = "", timeString: time = "0m" } = timerStrings[tabId] || {};

    const timerMessage = {
      type: "timerUpdate",
      domainString: activeTabId === Number(tabId) ? domainString : domain,
      timeString: activeTabId === Number(tabId) ? timeString : time,
      isTimerDisabled,
      showTimer
    }

    const prev = prevTimerStrings[tabId];
    if (
      force ||
      !prev ||
      prev.domainString !== timerMessage.domainString ||
      prev.timeString !== timerMessage.timeString
    ) {
      try { 
        port.postMessage(timerMessage) 
        prevTimerStrings[tabId] = timerMessage; 
        console.log('message stringsbig', timerMessage);
      } catch {
        console.warn('couldnt post message updatebigstrings');
        delete timerPorts[tabId];
        delete timerStrings[tabId];
        delete prevTimerStrings[tabId];
      }
    }
  });
}
function updateBigTimerDisable() { // update visiblity vars
  Object.entries(timerPorts).forEach(([tabId, port]) => {
    if (!port) return;
    console.log('bigTimerDisable');

    const domainString = prevTimerStrings[tabId]?.domainString ?? "";
    const timeString = prevTimerStrings[tabId]?.timeString ?? "0m";

    const timerMessage = {
      type: "timerUpdate",
      domainString,
      timeString,
      isTimerDisabled,
      showTimer
    }

    const prev = prevTimerDisabled[tabId];
    if (
      !prev || 
      prev.isTimerDisabled !== isTimerDisabled || 
      prev.showTimer !== showTimer
    ) {
      try {
        port.postMessage(timerMessage);
        console.log('message disabledbig', timerMessage);
        prevTimerDisabled[tabId] = { isTimerDisabled, showTimer };
      } catch {
        console.warn('couldnt post message updatebigdisabel');
        delete timerPorts[tabId];
        delete prevTimerDisabled[tabId];
      }
    }
  });
}

// Track usage only for the tab if it's visible
async function trackUsage(activeTab, websites, site) {
  try {
    if (!site || !activeTab || tabVisibility[activeTab.tabId] === false) return;

    const now = Date.now();
    const lastTime = activeTabTimes[tabId] || now;
    const diffMinutes = (now - lastTime) / 1000 / 60;

    site.usage = (site.usage || 0) + diffMinutes;
    activeTabTimes[activeTab.tabId] = now;

    chrome.storage.local.set({ websites });
  } catch (err) {
  }
}

// Update badge for a site
async function updateBadge(tabId, site, timeLeft, { force = false } = {}) {
  if (!tabId) return;
  console.log('update Badge');

  let text = "";
  let timeString = "0m";
  let color = blueColor;
  
  if (site) {
    let numberHours = Math.floor(timeLeft / 60);
    let numberMinutes = Math.floor(timeLeft % 60);
    
    //send notifications for each threshold
    [10, 5, 4, 3, 2, 1].forEach(threshold => {
      if (!notificationsSent[site.domain]) {
        notificationsSent[site.domain] = { 10: false, 5: false, 4: false, 3: false, 2: false, 1: false }; // initialize safely
      }

      if (
        Math.floor(timeLeft) <= threshold &&
        !notificationsSent[site.domain][threshold] &&
        Math.floor(timeLeft) > threshold - 1
      ) {
        sendTimeLeftNotification(site.domain, threshold);
        notificationsSent[site.domain][threshold] = true;
      }
    });

    //Badge logic
    if (numberHours > 0) {
      if (numberMinutes > 0) {
        text = `${numberHours}h${String(numberMinutes).padStart(2, "0")}`;
        timeString = `${numberHours}h ${numberMinutes}m`; // for timer
      } else {
        text = `${numberHours}h`;
        timeString = text;
      } 
    } else { // if no hour
      if (timeLeft % 60 >= 1) {
        text = `${numberMinutes}m`;
        if (numberMinutes <= 10) { color = orangeColor; }
      } else if (timeLeft % 60 > 0) {
        text = "<1m";
        color = redColor;
      }
      else {
        text = "0m";
        color = grayColor;
      }
      timeString = text;
    }
  } else {
    text = "";
    color = blueColor;
    timeString = "0m"
  }

  const prev = prevBadgeState[tabId] || {};
  console.log('is setting badge?', prev.text !== text || force);
  if (force || prev.text !== text) {
    chrome.action.setBadgeText({ text });
    chrome.action.setBadgeBackgroundColor({ color });
    prevBadgeState[tabId] = {text};
  }

  if (site) {
    console.log('bigTimerStrings', site.domain, timeString);
    updateBigTimerStrings(tabId, site.domain, timeString, { force });
  }
}

// Block a website if limit reached
function checkAndBlock(tabId, storageData, timeLeft, site) {
  if (!site) return;
  if (timeLeft > 0) return; // not blocked

  const peekDuration = storageData.peekDuration || 0.25; // minutes

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

async function coreOperations({ forceAll = false } = {}) {
  try {
    const disabled = await checkIfDisabled();
    if (disabled) return;

    const windowInfo = await chrome.windows.getCurrent({ populate: true }).catch(err => {
      if (err.message.includes("No current window")) return null;
      throw err;
    });
    if (!windowInfo) return;

    const activeTab = windowInfo.tabs?.find(tab => tab.active && tab.url);
    if (!activeTab) return;
    const storageData = await getStorage(["websites", "peekDuration"]);
    const site = validateWebsite(activeTab.url, storageData.websites || []);
    const timeLeft = calculateTimeLeft(site);

    if (forceAll || (site && timeLeft <= 0)) {
      checkAndBlock(activeTab.id, storageData, timeLeft, site, { force: forceAll });
    }
    await trackUsage(activeTab, storageData.websites, site);
    await updateBadge(activeTab.id, site, timeLeft, { force: forceAll}); 

  } catch (err) { console.error('core operations failed: ', err); }
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
      notificationsSent[key] = { 10: false, 5: false, 4: false, 3: false, 2: false, 1: false };
    });
  
    //reset badge and big timer:
    chrome.action.setBadgeText({ text: ""});
    chrome.action.setBadgeBackgroundColor(blueColor);
    updateBigTimerStrings(null, "", "0m", { force: true });
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
  await coreOperations({ forceAll: true });
});
chrome.tabs.onActivated.addListener(async () => {
  await coreOperations({ forceAll: true });
});
chrome.windows.onFocusChanged.addListener(async (windowId) => { // updates between multiple windows
  if (windowId === chrome.windows.WINDOW_ID_NONE) return; // no window is focused
  await coreOperations({ forceAll: true }); 
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
  if (msg.type === "tabVisibility" && sender.tab) {
    tabVisibility[sender.tab.id] = !!msg.visible;
    activeTabTimes[sender.tab.id] = Date.now(); // reset last active time
    return false;
  }
  if (msg.type === "disableShowTimer") {
    showTimer = false;
  }
});

// Periodic badge updates for active tab
chrome.runtime.onInstalled.addListener(async () => {
  chrome.alarms.create("updateAll", { periodInMinutes: 5 / 60 }); // every 5 seconds

  chrome.notifications.create(`limitless-install`, {
    type: "basic",
    iconUrl: "assets/icons/icon128.png",
    title: "Thanks for using Limitless!",
    silent: true,
    requireInteraction: true,
    message: `Be sure to pin the extension to the toolbar to see your live website timers.`,
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
      const status = await checkIfDisabled();
      try { port.postMessage({ type: "updateStatusInPopup", disabledStatus: status }); }
      catch (err) { console.error(err) }
    })();
  }
  if (port.name === "timer" && port.sender?.tab?.id != null) {
    const tabId = port.sender.tab.id;
    timerPorts[tabId] = port;

    // Send initial state for this tab
    const { domainString = "", timeString = "0m" } = timerStrings[tabId] || {};
    try {
      port.postMessage({
        type: "timerUpdate",
        domainString,
        timeString,
        isTimerDisabled,
        showTimer
      });
      console.log('port message:', prevTimerStrings[tabId]?.domainString, prevTimerStrings[tabId]?.timeString );
    } catch {
      console.log('port name timer listener');
      delete timerPorts[tabId];
      delete timerStrings[tabId];
    }

    // Clean up on disconnect
    port.onDisconnect.addListener(() => {
      const err = chrome.runtime.lastError; // ← THIS IS THE IMPORTANT PART
      if (err) console.warn("Port disconnect error:", err.message);
      delete timerPorts[tabId];
      delete timerStrings[tabId];
    });
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
