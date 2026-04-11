let prevIsEngaged = null

function getEngagedState() {
  const isVisible = document.visibilityState === "visible"; // active tab & not minimized
  const isFocused = document.hasFocus(); // window is focused (not switched to another app)
  return isVisible && isFocused;
}

async function reportEngagedState() {
  const isEngaged = getEngagedState();

  if (isEngaged === prevIsEngaged) return;
  prevIsEngaged = isEngaged;

  try {
    chrome.runtime.sendMessage({
      type: "tabEngaged",
      engaged: isEngaged
    }, (response) => {
      // handle if sw is not running
      if (chrome.runtime.lastError) {
        // retry after 1s
        setTimeout(() => {
          if (document.visibilityState === "visible") {
            reportEngagedState();
          }
        }, 1000);
      }
    });
  } catch (err) {
    setTimeout(() => {
      if (document.visibilityState === "visible") {
        reportEngagedState();
      }
    }, 1000);
  }
}

// Listen for tab visibility changes (switching tabs, minimizing window)
document.addEventListener("visibilitychange", reportEngagedState);
window.addEventListener("focus", reportEngagedState);
window.addEventListener("blur", reportEngagedState);

chrome.runtime.onMessage.addListener((msg, sendResponse) => {
  if (msg?.type !== "pingEngagement") return;
  const isEngaged = getEngagedState();
  prevIsEngaged = isEngaged;
  sendResponse({ engaged: isEngaged });
});

// Initial state on load
reportEngagedState();