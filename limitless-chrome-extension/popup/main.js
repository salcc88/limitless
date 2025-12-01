const configureBtn = document.getElementById("configure-btn");

// ask for disabled status
chrome.runtime.sendMessage({ type: "CHECK_DISABLED" }, (res) => {
  const disabled = res?.disabled;
  const statusSpan = document.getElementById("status");

  statusSpan.textContent = disabled ? 'Inactive' : 'Active';
  statusSpan.classList.toggle('off', disabled);
});

// Open dashboard
configureBtn.addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("dashboard/index.html") });
});

