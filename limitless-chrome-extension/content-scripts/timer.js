// content-scripts/timer.js
let timerWrapper = null;
let timerNumber = null;
let domainSpan = null;

let timeString = "0m";
let domainString = "";
let isTimerDisabled = false;
let showTimer = true;

const fontUrl = chrome.runtime.getURL("assets/font/plus-jakarta-sans-500.woff2");

const flashingTimes = new Set(["5m","4m","3m","2m","1m"]);

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

function createTimer() {
  if (timerWrapper) return;

  timerWrapper = document.createElement("div");
  timerWrapper.id = "limitless-timer-wrapper";
  timerWrapper.style.position = "fixed";
  timerWrapper.style.top = "20px";
  timerWrapper.style.left = "20px";
  timerWrapper.style.zIndex = "999999";
  timerWrapper.style.cursor = "grab";
  const shadow = timerWrapper.attachShadow({ mode: "closed" });

  const timerStyle = document.createElement("style");
  timerStyle.textContent = `
    @font-face {
      font-family: "Plus Jakarta Sans";
      src: url("${fontUrl}") format("woff2");
      font-weight: 500;
      font-style: normal;
      font-display: swap;
    }

    #limitless-timer-box {
      color-scheme: light dark;

      --text: #1D1D1D;
      --gray: #939393;
      --blue: #3BC4AB;
      --bg: #FFFFFF;
      --bg-rgb: 255,255,255;
      --base-shadow: 0 2px 12px rgba(0,0,0,0.3);

      font-family: "Plus Jakarta Sans", sans-serif !important;

      min-width: 130px;
      box-sizing: border-box !important;
      overflow: hidden;
      padding: 24px 0px 16px 0px;
      background-color: rgba(var(--bg-rgb), 0.95);
      border: 3px solid var(--blue);
      border-radius: 8px;
      pointer-events: auto;
      box-shadow: var(--base-shadow);
      display: flex;
      flex-direction: column;
      align-items: center;
      user-select: none;
    }
    #limitless-timer-box:active {
      cursor: grabbing;
    }
    #limitless-timer-box > #limitless-domain-span,
    #limitless-timer-box > #limitless-timer-span { 
      font-family: 'Plus Jakarta Sans', sans-serif !important;
      font-weight: 500 !important;
      color: var(--gray) !important;
      font-size: 14px !important;
      line-height: 20px !important;
      padding: 0 4px !important;
      text-align: center;
    }
    #limitless-timer-box > #limitless-timer-number { 
      font-size: 32px !important;
      line-height: 32px !important;
      margin: 0 !important;
      font-family: 'Plus Jakarta Sans', sans-serif !important;
      font-weight: 500 !important;
      color: var(--blue) !important;
     }
     #limitless-timer-box > #limitless-timer-number.flashing {
      animation: flashing 2000ms ease-out infinite;
     }

    #limitless-timer-box > #limitless-close-button {
      position: absolute;
      top: 2px;
      right: 2px;
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: none;
      box-shadow: none;
      border: none;
      cursor: pointer;
      padding: 0;
      flex: 0;
      border-radius: 0;
      transition: opacity 150ms;
    }
    #limitless-timer-box > #limitless-close-button:hover {
      opacity: 0.5;
    }
    #limitless-timer-box > #limitless-close-button svg line {
      stroke: var(--gray);
      stroke-width: 2px;
    }

    @media (prefers-color-scheme: dark) {
      #limitless-timer-box {
        --text: #FFFFFF;
        --gray: #a4b7b4;
        --blue: #43DABE; /* blue-highlight */
        --bg: #1d1d1d;
        --bg-rgb: 29,29,29;

        --base-shadow: 0 2px 12px rgba(0,0,0,0.7);
      }
    }

    @keyframes flashing {
      0%, 50% { opacity: 1; }
      25% { opacity: 0.3; }
    }

  `
  shadow.appendChild(timerStyle);

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
    cleanupTimer();
    chrome.storage.local.set({ showTimer: false });
    chrome.runtime.sendMessage({ type: "disableShowTimer" });
  });
  timerBox.appendChild(closeBtn);

  shadow.appendChild(timerBox);

  document.body.appendChild(timerWrapper);

  makeDraggable(timerWrapper);
}

function makeDraggable(el) {
  el.addEventListener("mousedown", (e) => {
    if (e.composedPath().some(el => el?.id === "limitless-close-button")) return;
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
    cleanupTimer();
    return;
  }

  if (!timerWrapper) createTimer();

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

function cleanupTimer() {
  if (!timerWrapper) return;
  timerWrapper.remove();
  timerWrapper = null;
  timerNumber = null;
  domainSpan = null;
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    cleanupTimer();
  }
});

// Pagehide fires on unload and bfcache
window.addEventListener("pagehide", cleanupTimer);

