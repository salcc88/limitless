const configureBtn = document.getElementById("configure-btn");
const statusSpan = document.getElementById("status");

// Connect to the service worker
const port = chrome.runtime.connect({ name: "popup" });

port.onMessage.addListener((msg) => {
  if (msg.type === "updateStatusInPopup") {
    statusSpan.textContent = msg.disabledStatus ? 'Inactive' : 'Active';
    statusSpan.classList.toggle('off', msg.disabledStatus);
  }
});

// Open dashboard
configureBtn.addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("dashboard/index.html") });
});

