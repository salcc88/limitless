const configureBtn = document.getElementById("configure-btn");

// ask for disabled status
chrome.runtime.sendMessage({ type: "checkStatusForPopup" }, (res) => {
  if (chrome.runtime.lastError) {
    console.warn("Popup closed before response:", chrome.runtime.lastError.message);
    return;
  }
  const disabled = res?.disabled;
  const statusSpan = document.getElementById("status");
  statusSpan.textContent = disabled ? 'Inactive' : 'Active';
  statusSpan.classList.toggle('off', disabled);
});

// Open dashboard
configureBtn.addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("dashboard/index.html") });
});

