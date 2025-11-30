// Send visibility state to the service worker
function reportVisibility() {
  chrome.runtime.sendMessage({
    type: "tab-visibility",
    visible: document.visibilityState === "visible"
  });
}

// Listen for visibility changes
document.addEventListener("visibilitychange", reportVisibility);

// Initial report
reportVisibility();
