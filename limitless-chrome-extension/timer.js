document.addEventListener("DOMContentLoaded", () => {
  // content-scripts/timer.js
  let timerBox = null;
  let timerNumber = null;
  let domainSpan = null;

  let timeString = "0m";
  let domainString = "";
  let isTimerDisabled = false;
  let showTimer = true;

  const flashingTimes = new Set(["5m","4m","3m","2m","1m","<1m"]);

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
      renderTimer();
      chrome.storage.local.set({ showTimer: false });
      chrome.runtime.sendMessage({ type: "disableShowTimer" });
    });
    timerBox.appendChild(closeBtn);

    document.body.appendChild(timerBox);

    makeDraggable(timerBox);
  }

  function makeDraggable(el) {
    let isDragging = false;
    let offsetX = 0;
    let offsetY = 0;
    
    // Start dragging
    el.addEventListener("mousedown", (e) => {
      // Prevent dragging when clicking the close button
      if (e.target.id === "limitless-close-button" || e.target.closest("#limitless-close-button")) return;
    
      isDragging = true;
      const rect = el.getBoundingClientRect();
      offsetX = e.clientX - rect.left;
      offsetY = e.clientY - rect.top;
      el.style.transition = "none"; // optional: remove transitions while dragging
      el.style.cursor = "grabbing";
    });
  
    // Dragging
    document.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      el.style.left = e.clientX - offsetX + "px";
      el.style.top = e.clientY - offsetY + "px";
    });
  
    // Stop dragging
    document.addEventListener("mouseup", () => {
      if (isDragging) {
        isDragging = false;
        el.style.transition = ""; // restore any transitions
        el.style.cursor = "grab";
      }
    });
  }

  function renderTimer() {
    if (isTimerDisabled || !showTimer || timeString === "0m") {
      if (timerBox) { 
        timerBox.remove(); 
        timerBox = null;
      }
      return;
    }

    if (!timerBox) createTimerBox();

    if (timerNumber.textContent !== timeString) {
      timerNumber.textContent = timeString;

      if (flashingTimes.has(timeString)) {
        timerNumber.classList.add("flashing");
      }
    }
    
    domainSpan.textContent = domainString;
  };

  const port = chrome.runtime.connect({ name: "timer" });

  port.onMessage.addListener((msg) => {
    if (msg.type === "timerUpdate") {
      domainString = msg.domainString;
      timeString = msg.timeString;
      isTimerDisabled = msg.isTimerDisabled;
      showTimer = msg.showTimer;
      renderTimer();
    }
  });

  function cleanupTimerBox() {
    if (timerBox) {
      timerBox.remove();
      timerBox = null;
      timerNumber = null;
      domainSpan = null;
    }
  }

  document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    cleanupTimerBox();
  }
});

  // Pagehide fires on unload and bfcache
  window.addEventListener("pagehide", cleanupTimerBox);
});
