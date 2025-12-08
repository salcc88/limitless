// Limitless Extension
// Copyright 2025 Sal Costa
// https://salcosta.dev

// In-memory maps
const activeTabTimes = {}; // last timestamp per active tab
const tabEngaged = {}; // engaged state per tabId (active tab + window focus + not minimzed)
const peekStartTimes = {}; // key: tabId, value: timestamp when peek started
const peekNotified = {}; // Tracks if user has been notified about peek mode per tabId
const notificationsSent = {};

let websitesCache = [];
let websiteChangesMade = false;

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

async function getStorage(keys) {
  return new Promise((resolve) => { chrome.storage.local.get(keys, resolve) });
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

function calculateTimeLeft(site) {
  if (!site) return 0;
  return Math.max((site.timeLimit || 0) - (site.usage || 0), 0);
}

// get url path with trimmed www. and trailing slash
function normalizeUrl(url) {
  if (!url || !url.startsWith("http")) return null;
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

// Notify the user when X time is left
function sendTimeLeftNotification(domain, minutesLeft) {
  chrome.notifications.create(`limitless-${domain}-${minutesLeft}`, {
    type: "basic",
    iconUrl: "assets/icons/icon128.png",
    title: "Limitless",
    silent: true,
    message: `You have ${minutesLeft} minute${minutesLeft === 1 ? '' : 's'} left on ${domain}`,
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
        prevTimerDisabled[tabId] = { isTimerDisabled, showTimer };
      } catch {
        delete timerPorts[tabId];
        delete prevTimerDisabled[tabId];
      }
    }
  });
}

// Track usage only for the tab if it's being engaged
async function trackUsage(tabId, site) {
  try {
    console.log('track usage');
    const now = Date.now();
    const lastTime = activeTabTimes[tabId] || now;
    const diffMinutes = (now - lastTime) / 1000 / 60;

    //cached site
    site.usage = (site.usage || 0) + diffMinutes;
    activeTabTimes[tabId] = now;
    websiteChangesMade = true; // set flag for write Updates
  } catch (err) {
  }
}

// Update badge for a site and send info to the timer
async function updateBadge(tabId, site, timeLeft, { force = false } = {}) {
  console.log('update badge');
  let text = "";
  let timeString = "0m";
  let color = blueColor;

  if (site) {
    let numberHours = Math.floor(timeLeft / 60);
    let numberMinutes = Math.floor(timeLeft % 60);
    
    //send notifications for each threshold, prevent spam within minute thresholds
    [10, 5, 4, 3, 2, 1].forEach(threshold => {
      if (!notificationsSent[site.domain]) {
        notificationsSent[site.domain] = { 10: false, 5: false, 4: false, 3: false, 2: false, 1: false };
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
      } else {
        text = "0m";
        color = grayColor;
      }
      timeString = text;
    }

    updateBigTimerStrings(tabId, site.domain, timeString, { force });

  } else { // for when !site and forced
    text = "";
    color = blueColor;
    timeString = "0m"
  }

  const prev = prevBadgeState[tabId] || {};
  if (force || prev.text !== text) {
    chrome.action.setBadgeText({ text });
    chrome.action.setBadgeBackgroundColor({ color });
    prevBadgeState[tabId] = {text};
  }
}

// Block a website if limit reached
async function blockWebsite(tabId, site) {

  if (site.peekMode) { // peek mode delay before block, fix later
    const now = Date.now();
    if (!peekStartTimes[tabId]) {
      peekStartTimes[tabId] = now;
      peekNotified[tabId] = false;
    }

    const data = await getStorage(["peekDuration"]);

    // Notify ONCE when Peek Mode begins
    if (!peekNotified[tabId]) {
      const text =
        data.peekDuration < 1 
        ? `${data.peekDuration * 60} seconds`
        : `${data.peekDuration} minute`
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
    if (elapsedPeekTime >= data.peekDuration) { // block site after peek time
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
    if (await checkIfDisabled()) return;

    const windowInfo = await chrome.windows.getCurrent({ populate: true }).catch(err => {
      if (err.message.includes("No current window")) return null;
      throw err;
    });
    if (!windowInfo) return;

    const activeTab = windowInfo.tabs?.find(tab => tab.active && tab.url);
    if (!activeTab) return;

    const site = validateWebsite(activeTab.url, websitesCache || []);
    const timeLeft = calculateTimeLeft(site);

    if (site) { console.log('core operations go', tabEngaged[activeTab.id]); }

    if (forceAll || site && tabEngaged[activeTab.id]) {
      await updateBadge(activeTab.id, site, timeLeft, { force: forceAll});
    }
    if (site && tabEngaged[activeTab.id]) {
      if (timeLeft <= 0) {
        await blockWebsite(activeTab.id, site);
      }
      await trackUsage(activeTab.id, site);
    }

  } catch (err) { console.error('core operations failed: ', err); }
};

async function writeUpdates() {
  if (websiteChangesMade) {
    console.log('Writing Updates!')
    await new Promise(resolve =>
      chrome.storage.local.set({ websites: websitesCache }, resolve)
    );
    websiteChangesMade = false;
  }
}

async function resetDailyUsage() {
  const today = new Date().toDateString();
  const data = await getStorage(["websites", "lastReset"]);
  if (data.lastReset === today) return; // not a new day yet

  const websites = data.websites || [];
  const resetWebsites = websites.map(site => ({ 
    ...site, 
    usage: 0
  }));

  // reset cache and storage
  websitesCache = resetWebsites;
  await new Promise((resolve) => chrome.storage.local.set({ websites: resetWebsites, lastReset: today }, resolve));

  // reset notification log
  Object.keys(notificationsSent).forEach(key => { delete notificationsSent[key] });

  //reset badge and big timer:
  chrome.action.setBadgeText({ text: "" });
  chrome.action.setBadgeBackgroundColor({ color: blueColor });
  updateBigTimerStrings(null, "", "0m", { force: true });
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
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => { // calls on reload, url change
  if (changeInfo.status === "loading") { // might not have valid url when loadng TODO
    await coreOperations({ forceAll: true });
  }
});
chrome.tabs.onActivated.addListener(async () => { // Force to keep timers displaying
  await coreOperations({ forceAll: true });
  await writeUpdates(); // fresh sync on tab switch
});
chrome.windows.onFocusChanged.addListener(async (windowId) => { // updates between multiple windows
  if (windowId === chrome.windows.WINDOW_ID_NONE) return; // no window is focused
  await coreOperations({ forceAll: true }); 
});

// Clean up state when a tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  delete peekStartTimes[tabId];
  delete peekNotified[tabId];
  delete tabEngaged[tabId];
  delete activeTabTimes[tabId];
});

// send disabled status to popup and listen for visiblity messages
chrome.runtime.onMessage.addListener(async (msg, sender, sendResponse) => {
  if (msg.type === "tabEngaged") {
    console.log('Report Engaged State', msg.engaged);
    tabEngaged[sender.tab.id] = !!msg.engaged;
    activeTabTimes[sender.tab.id] = Date.now(); // reset last active time
    return false;
  }
  if (msg.type === "disableShowTimer") {
    showTimer = false;
  }
  if (msg.type === "dashWebsitesUpdated") {
    const data = await getStorage(["websites"]);
    const updatedWebsites = data.websites || [];
    websitesCache = updatedWebsites.map(updatedSite => {
      const existingSite = (websitesCache || []).find(site => site.domain === updatedSite.domain);
      return {
        ...updatedSite,
        usage: existingSite?.usage ?? 0 // preserve usage if it exists
      };
    });
  }
});

chrome.runtime.onInstalled.addListener(async () => {
  chrome.alarms.create("updateAll", { periodInMinutes: 5 / 60 }); // every 5 seconds
  chrome.alarms.create("writeAll", { periodInMinutes: 15 / 60 }); // every 15 seconds

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
  chrome.storage.local.set({ lastReset: today });
  scheduleMidnightReset(); // schedule next reset
});

chrome.runtime.onStartup.addListener( async () => {
  const data = await getStorage(["websites"]);
  websitesCache = data.websites || [];
  await resetDailyUsage(); // check for pending reset on browser startup
  scheduleMidnightReset(); 
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === "popup") {
    (async () => {
      // Get status right when the popup connects
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
    } catch {
      delete timerPorts[tabId];
      delete timerStrings[tabId];
    }

    // Clean up on disconnect
    port.onDisconnect.addListener(() => {
      try {
        if (chrome.runtime.lastError) {
          console.warn("Port disconnect error:", err.message);
        }
      } catch (err) {}
      delete timerPorts[tabId];
      delete timerStrings[tabId];
    });
  }
});


chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "midnightReset") {
    await resetDailyUsage();
    scheduleMidnightReset(); // schedule for the next midnight
    return;
  } else if (alarm.name === "updateAll") { await coreOperations() }
  if (alarm.name === "writeAll") { await writeUpdates() }
});
