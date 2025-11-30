// Send visibility state to the service worker
function reportVisibility() {
  try {
    chrome.runtime.sendMessage({
      type: "tab-visibility",
      visible: document.visibilityState === "visible"
    });
  } catch (e) {
    console.warn("Failed to send visibility message:", e);
  }
}


// Listen for visibility changes
document.addEventListener("visibilitychange", reportVisibility);

// Initial report
reportVisibility();
