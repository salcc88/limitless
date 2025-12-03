document.addEventListener("DOMContentLoaded", () => {
  // content-scripts/timer.js
  let timerBox;

  let timeString = "";
  let domainString = "";
  let isDisabled = false;
  let showTimer = true;

  function createTimerBox() {
    if (timerBox) return;

    timerBox = document.createElement("div");
    timerBox.id = "timer-box";

    // inner content
    const domainSpan = document.createElement("span");
    domainSpan.id = "domain-span";
    timerBox.appendChild(domainSpan);

    const timerNumber = document.createElement("h2");
    timerNumber.id = "timer-number";
    timerBox.appendChild(timerNumber);

    const remainingSpan = document.createElement("span");
    remainingSpan.id = "timer-span";
    remainingSpan.textContent = "remaining";
    timerBox.appendChild(remainingSpan);

    const closeBtn = document.createElement("button");
    closeBtn.id = 'close-button';
    closeBtn.ariaLabel = 'Hide Timer';
    closeBtn.title = 'Hide Timer';
    closeBtn.innerHTML = `
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none">
        <line x1="18" y1="6" x2="6" y2="18" stroke="#1D1D1D" stroke-width="2"/>
        <line x1="6" y1="6" x2="18" y2="18" stroke="#1D1D1D" stroke-width="2"/>
      </svg>
    `;
    closeBtn.addEventListener("click", () => {
      console.log('minimize');
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
      if (e.target.id === "close-button" || e.target.closest("#close-button")) return;
    
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
    if (isDisabled || !showTimer || timeString === "0m" || !timeString) {
      if (timerBox) { timerBox.remove(); }
      return;
    }

    if (!timerBox) createTimerBox();
    const number = timerBox.querySelector("#timer-number");
    const website = timerBox.querySelector("#domain-span");
    number.textContent = timeString;
    website.textContent = domainString;
  };

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "timerUpdateTime") {
      timeString = msg.timeLeft;
      domainString = msg.domain;
      renderTimer();
    }
    if (msg.type === "timerUpdateDisabled") {
      isDisabled = msg.disabled;
      showTimer = msg.showTimer;
      renderTimer();
    }
  });

  // cleanup on page unload
  window.addEventListener("beforeunload", () => {
    if (timerBox) timerBox.remove();
  });
});
