// content-scripts/timer.js
let timerBox = null;
let timerNumber = null;
let domainSpan = null;

let timeString = "0m";
let domainString = "";
let isTimerDisabled = false;
let showTimer = true;

const flashingTimes = new Set(["5m","4m","3m","2m","1m","<1m"]);

let dragState = { isDragging: false, el: null, offsetX: 0, offsetY: 0 };
document.addEventListener("mousemove", (e) => {
  if (!dragState.isDragging) return;
  const { el, offsetX, offsetY } = dragState;
  el.style.left = e.clientX - offsetX + "px";
  el.style.top = e.clientY - offsetY + "px";
});

document.addEventListener("mouseup", () => {
  if (dragState.isDragging) {
    dragState.isDragging = false;
    dragState.el.style.transition = "";
    dragState.el.style.cursor = "grab";
    dragState.el = null;
  }
});

function createTimerBox() {
  if (timerBox) return;

  timerBox = document.createElement("div");
  timerBox.id = "limitless-timer-box";
  timerBox.setAttribute("aria-hidden", "true");

  // inner content
  domainSpan = document.createElement("span");
  domainSpan.id = "limitless-domain-span";
  timerBox.appendChild(domainSpan);

  timerNumber = document.createElement("h2");
  timerNumber.id = "limitless-timer-number";
  timerBox.appendChild(timerNumber);

  const remainingSpan = document.createElement("span");
  remainingSpan.id = "limitless-timer-span";
  remainingSpan.textContent = "remaining";
  timerBox.appendChild(remainingSpan);

  const closeBtn = document.createElement("button");
  closeBtn.id = 'limitless-close-button';
  closeBtn.setAttribute("aria-label", "Hide Timer");
  closeBtn.title = 'Hide Timer';
  closeBtn.innerHTML = `
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none">
      <line x1="18" y1="6" x2="6" y2="18"/>
      <line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  `;
  closeBtn.addEventListener("click", () => {
    showTimer = false;
    cleanupTimerBox();
    chrome.storage.local.set({ showTimer: false });
    chrome.runtime.sendMessage({ type: "disableShowTimer" });
  });
  timerBox.appendChild(closeBtn);

  document.body.appendChild(timerBox);

  makeDraggable(timerBox);
}

function makeDraggable(el) {
  el.addEventListener("mousedown", (e) => {
    if (e.target.closest("#limitless-close-button")) return;
    const rect = el.getBoundingClientRect();
    dragState.isDragging = true;
    dragState.el = el;
    dragState.offsetX = e.clientX - rect.left;
    dragState.offsetY = e.clientY - rect.top;
    el.style.transition = "none";
    el.style.cursor = "grabbing";
  });
}

function renderTimer() {
  if (isTimerDisabled || !showTimer || timeString === "0m") {
    cleanupTimerBox();
    return;
  }

  if (!timerBox) createTimerBox();

  if (timerNumber.textContent !== timeString) {
    timerNumber.textContent = timeString;
    if (flashingTimes.has(timeString)) {
      timerNumber.classList.add("flashing");
    }
  }
  
  if (domainSpan.textContent !== domainString) {
    domainSpan.textContent = domainString;
  }
};

const port = chrome.runtime.connect({ name: "timer" });

port.onMessage.addListener((msg) => {
  if (msg.type === "timerUpdate") {
    domainString = msg.domainString;
    timeString = msg.timeString;
    isTimerDisabled = msg.isTimerDisabled;
    showTimer = msg.showTimer;
    if (document.body) renderTimer();
    else document.addEventListener("DOMContentLoaded", renderTimer, { once: true });
  }
});

function cleanupTimerBox() {
  if (!timerBox) return;
  timerBox.remove();
  timerBox = null;
  timerNumber = null;
  domainSpan = null;
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    cleanupTimerBox();
  }
});

// Pagehide fires on unload and bfcache
window.addEventListener("pagehide", cleanupTimerBox);

