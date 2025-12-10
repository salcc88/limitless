let prevIsEngaged = null

async function reportEngagedState() {
  const isVisible = document.visibilityState === "visible"; // active tab & not minimized
  const isFocused = document.hasFocus(); // window is focused (not switched to another app)
  const isEngaged = isVisible && isFocused;

  if (isEngaged === prevIsEngaged) return;
  prevIsEngaged = isEngaged;

  try {
    chrome.runtime.sendMessage({
      type: "tabEngaged",
      engaged: isEngaged
    });
  } catch (err) {}
}

// Listen for tab visibility changes (switching tabs, minimizing window)
document.addEventListener("visibilitychange", reportEngagedState);
window.addEventListener("focus", reportEngagedState);
window.addEventListener("blur", reportEngagedState);

// Initial state on load
reportEngagedState();