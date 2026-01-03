// Limitless Extension
// Copyright 2026 Sal Costa
// https://salcosta.dev

const debugLogs = false;

// --------------
//self.debugSetUsage = function({domain, usage}) {
//  if (!domain || !usage) {
//    console.warn("format: debugSetUsage({ domain: \"website.com\", usage: 60 })");
//    return;
//  }
//
//  const site = websitesCache.find(s => s.domain === domain);
//  if (!site) {
//    console.warn(`debugSetUsage: no site found for domain "${domain}"`);
//    return;
//  }
//
//  site.usage = usage;
//  websiteChangesMade = true;
//  console.log(`debugSetUsage: Set usage for ${domain} to ${usage} minutes`);
//}
// ----------------

// In-memory maps, using tabs as keys
const activeTabTimes = {}; // last timestamp per active tab
const tabEngaged = {}; // engaged state per tabId (active tab + window focus + not minimzed)
const notificationsSent = {}; // notifiation records for X time left
const blockedUrl = {}; // tab url that gets blocked
const activePeeks = {}; // tabs actively in peek mode

let websitesCache = [];
let websitesCacheInitialized = false;
let websiteChangesMade = false;

let coreOpsRunning = false; 

// badge state
const prevBadgeState = {};

// Timer state
const timerPorts = {};
const timerStrings = {};
const prevTimerStrings = {};
const prevTimerDisabled = {isTimerDisabled: false, showTimer: true};
let isTimerDisabled = false;
let showTimer = true;

const blueColor = '#43dabe'; // blue-highlight 
const orangeColor = "#FFC66B";
const redColor = "#FF6B6B";
const grayColor = "#1D1D1D";

if (debugLogs) {
  console.log("SW wake:", Date.now());
  self.addEventListener("activate", () => console.log("SW activated"));
}

async function getStorage(keys) {
  return new Promise((resolve) => { chrome.storage.local.get(keys, resolve) });
}

// check if website cache is initialized
async function ensureWebsitesCache() {
  if (!websitesCacheInitialized) {
    const data = await getStorage(["websites"]);
    websitesCache = data.websites || [];
    websitesCacheInitialized = true;
    if (debugLogs) console.log('websitesCache has been (re)initialized');
  }
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

function startPeek(tabId, durationMinutes) {
  const originalUrl = blockedUrl[tabId];
  if (!originalUrl) return;

  // Create a new Peek Session
  activePeeks[tabId] = {
    startedAt: Date.now(),
    duration: durationMinutes
  };

  chrome.tabs.update(tabId, { url: originalUrl });

  const text =
    durationMinutes < 1 
    ? `${durationMinutes * 60} seconds`
    : `minute`
  chrome.notifications.create(`limitless-peek-${tabId}`, {
    type: "basic",
    iconUrl: "assets/icons/icon128.png",
    title: "Limitless",
    silent: true,
    message: `You're in Peek Mode for the next ${text}`,
    priority: 2
  });
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
function updateBigTimerStrings(activeTabId, domainString = "", timeString = "0m", { force = false } = {}) {
  if (!activeTabId) return;
  const prev = prevTimerStrings[activeTabId] || {};
  const needsUpdate = prev.domainString !== domainString || prev.timeString !== timeString;
  if (!needsUpdate && !force) return;

  timerStrings[activeTabId] = { domainString, timeString };

  const port = timerPorts[activeTabId];
  if (!port || port.disconnected) return;

  if (debugLogs) console.log('%c--- big timer strings', 'color: yellow', domainString, timeString);

  try { 
    port.postMessage({
      type: "timerUpdate",
      domainString,
      timeString,
      isTimerDisabled,
      showTimer
    }); 
    prevTimerStrings[activeTabId] = { domainString, timeString };
  } catch (err) {
    if (debugLogs) console.warn(`Failed to send timerUpdate to tab ${activeTabId}:`, err.message);
  }
}
function updateBigTimerDisable() { // update visiblity vars
  const needsUpdate = prevTimerDisabled.isTimerDisabled !== isTimerDisabled || prevTimerDisabled.showTimer !== showTimer;
  if (!needsUpdate) return;

  Object.entries(timerPorts).forEach(([tabId, port]) => {
    if (!port || port.disconnected) return;

    const domainString = prevTimerStrings[tabId]?.domainString ?? "";
    const timeString = prevTimerStrings[tabId]?.timeString ?? "0m";

    if (debugLogs) console.log('%c--- big timer disabled', 'color: lime', isTimerDisabled, !showTimer);

    try {
      port.postMessage({
        type: "timerUpdate",
        domainString,
        timeString,
        isTimerDisabled,
        showTimer
      });
    } catch (err) {
      if (debugLogs) console.warn(`Failed to send disabled timerUpdate to tab ${activeTabId}:`, err.message);
    }
  });

  prevTimerDisabled.isTimerDisabled = isTimerDisabled;
  prevTimerDisabled.showTimer = showTimer;
}

// Track usage only for the tab if it's being engaged
async function trackUsage(tabId, site) {
  try {
    if (debugLogs) console.log('%ctrack usage', 'color: purple', site?.domain, site?.usage);
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
  if (debugLogs) console.log('%cupdate badge', 'color: purple', site?.domain, site?.usage);
  const timeLeftCeil = Math.ceil(timeLeft);
  let numberHours = Math.floor(timeLeftCeil / 60);
  let numberMinutes = timeLeftCeil % 60;

  //send notifications for each threshold, prevent spam within minute thresholds
  if (site && timeLeftCeil > 0 && timeLeftCeil <= 10) {
    if (!notificationsSent[site.domain]) {
      notificationsSent[site.domain] = { 10: false, 5: false, 4: false, 3: false, 2: false, 1: false };
    }

    [10, 5, 4, 3, 2, 1].forEach(threshold => {
      if (
        timeLeftCeil <= threshold &&
        !notificationsSent[site.domain][threshold] &&
        timeLeftCeil > threshold - 1
      ) {
        sendTimeLeftNotification(site.domain, threshold);
        notificationsSent[site.domain][threshold] = true;
      }
    });
  }

  // badge and timer string logic
  let text = "";
  let timeString = "0m";
  let color = blueColor;

  if (site) {
    if (numberHours > 0) {
      text = numberMinutes > 0 ? `${numberHours}h${String(numberMinutes).padStart(2, "0")}` : `${numberHours}h`;
      timeString = numberMinutes > 0 ? `${numberHours}h ${numberMinutes}m` : text;
      color = blueColor;
    } else {
      if (timeLeftCeil > 1) {
        text = `${numberMinutes}m`;
        color = numberMinutes <= 10 ? orangeColor : blueColor;
      } else if (timeLeftCeil === 1) {
        text = "1m";
        color = redColor;
      } else {
        text = "0m";
        color = grayColor;
      }
      timeString = text;
    }
  } else { // !site or forced
    text = "";
    timeString = "0m";
    color = blueColor;
  }

  const prevTimer = prevTimerStrings[tabId];
  if (
    (force || !prevTimer || prevTimer.timeString !== timeString)
    && (showTimer === true && isTimerDisabled === false)
  ) {
    let timerDomainString = site?.domain || "";
    updateBigTimerStrings(tabId, timerDomainString, timeString, { force });
  }
    
  const prev = prevBadgeState[tabId] || {};
  if (force || prev.text !== text) {
    chrome.action.setBadgeText({ text });
    chrome.action.setBadgeBackgroundColor({ color });
    prevBadgeState[tabId] = {text};
  }
}

// Block a website if limit reached
async function blockWebsite(activeTab, site) {

  const activePeek = activePeeks[activeTab.id];
  if (activePeek) {
    const elapsed = (Date.now() - activePeek.startedAt) / 1000 / 60;

    if (elapsed >= activePeek.duration) {
      delete activePeeks[activeTab.id];
      blockedUrl[activeTab.id] = activeTab.url;
      chrome.tabs.update(activeTab.id, {
        url: chrome.runtime.getURL(`blockedScreen/index.html?pm=${site.peekMode}&site=${site.domain}`)
      });
    }
    return;
  }

  blockedUrl[activeTab.id] = activeTab.url;
  chrome.tabs.update(activeTab.id, {
    url: chrome.runtime.getURL(`blockedScreen/index.html?pm=${site.peekMode}&site=${site.domain}`)
  });
};

async function coreOperations({ forceAll = false } = {}) {
  if (coreOpsRunning) return;
  coreOpsRunning = true;
  
  try {
    await ensureWebsitesCache();
    if (await checkIfDisabled()) return;

    if (!forceAll) { // exit if no engaged tabs or active peeks and not forced
      const activeTabId = Object.keys(tabEngaged).find(id => {
        const numId = Number(id);
        return tabEngaged[numId] || activePeeks[numId];
      });
      if (!activeTabId) return;
    }

    const windowInfo = await chrome.windows.getCurrent({ populate: true }).catch(err => {
      if (err.message.includes("No current window")) return null;
      throw err;
    });
    if (!windowInfo) return;

    const activeTab = windowInfo.tabs?.find(tab => tab.active && tab.url);
    if (!activeTab) return;

    const site = validateWebsite(activeTab.url, websitesCache || []);

    const isEngagedOrPeek = tabEngaged[activeTab.id] || activePeeks[activeTab.id];

    if (debugLogs) console.log('%ccore operations run', 'color: orange', (site && isEngagedOrPeek));

    if (forceAll || site && isEngagedOrPeek) {
      const timeLeft = calculateTimeLeft(site);

      if (site && timeLeft <= 0) {
        await blockWebsite(activeTab, site);
      }
      await updateBadge(activeTab.id, site, timeLeft, { force: forceAll});
    }
    if (site && isEngagedOrPeek) {
      await trackUsage(activeTab.id, site);
    }

  } catch (err) { 
    if (debugLogs) console.error('core operations failed: ', err); 
  } finally {
    coreOpsRunning = false;
  }
};

async function writeUpdates() {
  if (websiteChangesMade) {
    if (debugLogs) console.log('%c!!!!!!!!!!!!!!!! Writing Updates', 'color: red');
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
  websitesCacheInitialized = true;
  await new Promise((resolve) => chrome.storage.local.set({ websites: resetWebsites, lastReset: today }, resolve));

  // reset notification log
  Object.keys(notificationsSent).forEach(key => { delete notificationsSent[key] });
  Object.keys(prevBadgeState).forEach(key => delete prevBadgeState[key]);
  Object.keys(timerStrings).forEach(key => delete timerStrings[key]);
  Object.keys(prevTimerStrings).forEach(key => delete prevTimerStrings[key]);
  Object.keys(activeTabTimes).forEach(key => delete activeTabTimes[key]);

  //reset badge and big timer:
  chrome.action.setBadgeText({ text: "" });
  chrome.action.setBadgeBackgroundColor({ color: blueColor });
  Object.keys(timerPorts).forEach(tabId => {
    updateBigTimerStrings(tabId, "", "0m", { force: true });
  });
};

// Schedule next midnight alarm
function scheduleMidnightReset() {
  const now = new Date();
  const nextMidnight = new Date();
  nextMidnight.setHours(24,0,0,0); // next calendar day midnight
  const minutesToMidnight = nextMidnight.getTime() - now.getTime();

  chrome.alarms.create("midnightReset", { when: Date.now() + minutesToMidnight });
}

// Update when tab is activated or updated
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => { // calls on reload, url change
  if (changeInfo.url) {
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
  delete tabEngaged[tabId];
  delete activeTabTimes[tabId];
  delete blockedUrl[tabId];
  delete activePeeks[tabId];
  delete timerPorts[tabId];
  delete timerStrings[tabId];
  delete prevTimerStrings[tabId];
  delete prevBadgeState[tabId];
});

// send disabled status to popup and listen for visiblity messages
chrome.runtime.onMessage.addListener(async (msg, sender) => {
  await ensureWebsitesCache();
  
  if (msg.type === "tabEngaged") {
    if (debugLogs) console.log('Engaged State', msg.engaged);
    tabEngaged[sender.tab.id] = !!msg.engaged;
    activeTabTimes[sender.tab.id] = Date.now(); // reset last active time
  }
  if (msg.type === "startPeek") {
    const tabId = sender.tab?.id;
    if (!tabId || !blockedUrl[tabId]) return;
    startPeek(tabId, msg.duration);
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
    websitesCacheInitialized = true;
  }
});

chrome.runtime.onInstalled.addListener(async () => {
  const data = await getStorage(["websites"]);
  websitesCache = data.websites || [];
  websitesCacheInitialized = true;
  
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
  websitesCacheInitialized = true;
  await resetDailyUsage(); // check for pending reset on browser startup
  scheduleMidnightReset(); 
});

chrome.runtime.onConnect.addListener(async (port) => {
  await ensureWebsitesCache();
  
  if (port.name === "popup") {
    (async () => {
      // Get status right when the popup connects
      const status = await checkIfDisabled();
      try { port.postMessage({ type: "updateStatusInPopup", disabledStatus: status }); }
      catch (err) { }
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
    } catch (err) {
      if (debugLogs) console.warn("Failed to post initial timer state:", err);
    }

    // Clean up on disconnect
    port.onDisconnect.addListener(() => {
      if (chrome.runtime.lastError) {
        if (debugLogs) console.warn("Port disconnect error:", chrome.runtime.lastError.message);
      }
      delete timerPorts[tabId];
    });
  }
});


chrome.alarms.onAlarm.addListener(async (alarm) => {
  await ensureWebsitesCache();
  
  if (alarm.name === "midnightReset") {
    await resetDailyUsage();
    scheduleMidnightReset(); // schedule for the next midnight
    await coreOperations();
    return;
  } else if (alarm.name === "updateAll") { await coreOperations() }
  if (alarm.name === "writeAll") { await writeUpdates() }
});
