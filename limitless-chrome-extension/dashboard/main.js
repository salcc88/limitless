document.addEventListener("DOMContentLoaded", () => {
  // get elements
  const siteList = document.getElementById("site-list");
  const addNewButton = document.getElementById("add-site");
  const newDomainInput = document.getElementById("domain-entry");
  const peekSelect = document.getElementById("peek-select");
  const timerToggle = document.getElementById("timer-toggle")
  const killSwitchToggle = document.getElementById("kill-switch");
  const dashSections = document.querySelectorAll(".killswitch-can-disable")
  // elements for schedule section
  const allWeekToggle = document.getElementById("all-week-toggle");
  const weekContainer = document.querySelector(".all-week-can-disable");
  const allDayToggle = document.getElementById("all-day-toggle");
  const dayTimeContainer = document.querySelector(".all-day-can-disable");
  const weekCheckboxes = document.querySelectorAll(".day-checkbox");
  const startSelect = document.getElementById("start-select");
  const endSelect = document.getElementById("end-select");

  // copyright
  const year = new Date().getFullYear();
  document.getElementById("copyright").textContent = `Created by Sal Costa \u00A9 ${year}`;

  let websites = [];
  let peekDuration = 0.25; // default 15 seconds
  let weekScheduleMask = 0b0000000;
  let allWeek = true;
  let allDay = true
  let scheduleStart = "09:00"; 
  let scheduleEnd = "17:30";
  let showTimer = true;
  let disableAll = false;

  // Construct start and end time selects
  function generateTimeOptions(startSelect, endSelect) {
    const fragment = document.createDocumentFragment();
    for (let hour = 0; hour < 24; hour++) {
      for (let min = 0; min < 60; min += 30) { // 24h string
        const hour24 = hour.toString().padStart(2, "0");
        const mm = min.toString().padStart(2, "0");
        const value = `${hour24}:${mm}`;
      
        // 12h string for ui
        let hour12 = hour % 12;
        if (hour12 === 0) hour12 = 12;
        const period = hour < 12 ? "AM" : "PM";
        const label = `${hour12}:${mm} ${period}`;
      
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
      
        fragment.appendChild(option);
      }
    }
  
    startSelect.appendChild(fragment.cloneNode(true));
    endSelect.appendChild(fragment.cloneNode(true));
  }
  generateTimeOptions(startSelect, endSelect);

  // week schedule helpers
  function getWeekScheduleMask() { // convert bitmask
    return Array.from(weekCheckboxes).reduce((mask, box) => {
      const dayIndex = parseInt(box.value);
      return box.checked ? mask | (1 << dayIndex) : mask;
    }, 0);
  }
  function setWeekScheduleMask(mask) {
    weekCheckboxes.forEach(box => {
      const dayIndex = parseInt(box.value);
      box.checked = !!(mask & (1 << dayIndex));
    });
  }
  function updateWeekSchedule(mask) { //updates ui and storage for week schedule
    weekScheduleMask = mask;
    setWeekScheduleMask(weekScheduleMask);
    saveConfiguration("weekSchedule", weekScheduleMask)
  }

  function updateDisabledWeekStyles() {
    if (!weekContainer) return;
    weekContainer.classList.toggle("disabled", allWeekToggle.checked);
    weekCheckboxes.forEach(box => box.disabled = allWeekToggle.checked);
  }
  function updateDisabledDayStyles() {
    if (!dayTimeContainer) return;
    dayTimeContainer.classList.toggle("disabled", allDayToggle.checked);
  }
  function updateDisabledSectionStyles() {
    if (!dashSections) return;
    dashSections.forEach( section => { 
      section.classList.toggle("disabled", disableAll);
    });
  }

  function loadAll() {
    chrome.storage.local.get([
      "websites", 
      "peekDuration",
      "allWeek",
      "weekSchedule", 
      "scheduleStart", 
      "scheduleEnd",
      "allDay",
      "showTimer",
      "disableAll",
    ], (data) => {
      websites = Array.isArray(data.websites) ? data.websites : [];
      const defaults = {
        peekDuration: 0.25,
        allWeek: true,
        allDay: true,
        weekSchedule: 0b0000000,
        scheduleStart: "09:00",
        scheduleEnd: "17:30",
        showTimer: true,
        disableAll: false,
      };
      // initialize to defaults if not found
      for (const [key, defaultValue] of Object.entries(defaults)) {
        const isUndefined = typeof data[key] === "undefined";
        const value = isUndefined ? defaultValue : data[key];
        
        if (isUndefined) {
          chrome.storage.local.set({ [key]: defaultValue });
        }
      
        // set storage values
        if (key === "peekDuration") { peekDuration = value; } 
        else if (key === "showTimer") { showTimer = value; }
        else if (key === "allWeek") { allWeek = value; } 
        else if (key === "allDay") { allDay = value; } 
        else if (key === "weekSchedule") { weekScheduleMask = value; } 
        else if (key === "scheduleStart") { scheduleStart = value; } 
        else if (key === "scheduleEnd") { scheduleEnd = value; } 
        else if (key === "disableAll") { disableAll = value; }
      }
      //Set ui values
      allWeekToggle.checked = allWeek;
      allDayToggle.checked = allDay;
      killSwitchToggle.checked = disableAll;
      timerToggle.checked = showTimer;
      updateDisabledWeekStyles();
      updateDisabledDayStyles();
      updateDisabledSectionStyles();
      setWeekScheduleMask(weekScheduleMask);
      startSelect.value = String(scheduleStart);
      endSelect.value = String(scheduleEnd);
      peekSelect.value = String(peekDuration);
      renderSites();
    });
  }

  function saveConfiguration(key, value) {
    chrome.storage.local.set({ [key]: value }, () => {
      if (key === "websites") { 
        chrome.runtime.sendMessage({ type: "dashWebsitesUpdated" });
      }
    });
  }

  const limitTimesFragment = document.createDocumentFragment();
  for (let i = 0; i <= 180; i += 5) {
    const option = document.createElement("option");
    option.value = String(i);
    option.textContent = i + " min";
    limitTimesFragment.appendChild(option);
  }
  
  function renderSites() {
    if (!websites || websites.length === 0) { // If no websites
      siteList.innerHTML = "";
      const li = document.createElement("li");
      li.classList.add("subtext", "no-limits-set");
      li.textContent = "No limits set.";
      siteList.appendChild(li);
      return;
    } 

    siteList.innerHTML = "";
    const fragment = document.createDocumentFragment();

    websites.forEach((site) => {
      const li = document.createElement("li");
      li.dataset.domain = site.domain;

      const domainSpan = document.createElement("span"); // website name
      domainSpan.textContent = site.domain;
      domainSpan.classList.add("site-name", "base-text");

      const timeSelect = document.createElement("select"); // time limit
      timeSelect.name = "time-limit";
      timeSelect.setAttribute("aria-label", "Daily Time Limit");
      timeSelect.classList.add("base-text");
      timeSelect.dataset.type = "timeSelect";
      timeSelect.dataset.domain = site.domain;
      timeSelect.appendChild(limitTimesFragment.cloneNode(true));
      timeSelect.value = String(site.timeLimit || 0);
     
      // Construct peekmode toggle switch checkbox
      const toggleWrapper = document.createElement("label");
      toggleWrapper.classList.add("toggle-switch");

      const peekCheckbox = document.createElement("input");
      peekCheckbox.type = "checkbox";
      peekCheckbox.setAttribute("aria-label", "Toggle Peek Mode");
      peekCheckbox.name = "peek-mode";
      peekCheckbox.checked = !!site.peekMode;
      peekCheckbox.dataset.type = "peekCheckbox";
      peekCheckbox.dataset.domain = site.domain;

      const sliderSpan = document.createElement("span");
      sliderSpan.classList.add("switch-slider");
      toggleWrapper.append(peekCheckbox, sliderSpan);
      // delete button
      const deleteBtn = document.createElement("button");
      deleteBtn.textContent = "Delete";
      deleteBtn.classList.add("delete");
      deleteBtn.dataset.domain = site.domain;
      // time left display
      const timeLeftSpan = document.createElement("span"); 
      timeLeftSpan.classList.add("time-left", "subtext");
      timeLeftSpan.dataset.type = "timeLeft";
      timeLeftSpan.dataset.domain = site.domain;
      const usage = Number(site.usage || 0);
      const timeLimit = Number(site.timeLimit || 0);
      const remaining = Math.ceil(Math.max(timeLimit - usage, 0));
      timeLeftSpan.textContent = `${remaining} min`;

      li.append(domainSpan, timeSelect, toggleWrapper, timeLeftSpan, deleteBtn);
      fragment.appendChild(li);
    });
    siteList.appendChild(fragment);
  }

  // settings change listeners
  document.getElementById("dashboard-wrap").addEventListener("change", (e) => {
    const settingId = e.target.id;

    switch (settingId) {
      case "timer-toggle":
        showTimer = timerToggle.checked;
        saveConfiguration("showTimer", showTimer);
        return;
      case "peek-select":
        peekDuration = Number(peekSelect.value);
        saveConfiguration("peekDuration", peekDuration);
        return;
      case "all-day-toggle":
        allDay = allDayToggle.checked;
        saveConfiguration("allDay", allDay);
        updateDisabledDayStyles();
        return;
      case "start-select":
        scheduleStart = startSelect.value;
        saveConfiguration("scheduleStart", scheduleStart);
        return;
      case "end-select":
        scheduleEnd = endSelect.value;
        saveConfiguration("scheduleEnd", scheduleEnd);
        return;
      case "all-week-toggle":
        allWeek = allWeekToggle.checked;
        saveConfiguration("allWeek", allWeek);
        updateDisabledWeekStyles();
        return;
      case "kill-switch":
        disableAll = killSwitchToggle.checked;
        saveConfiguration("disableAll", disableAll);
        updateDisabledSectionStyles();
        return;
    }

    if (e.target.classList.contains("day-checkbox")) {
      updateWeekSchedule(getWeekScheduleMask());
      return;
    }

    // change events inside siteList - limit time and peekmode toggle
    const li = e.target.closest("li");
    if (!li) return;
    const domain = li.dataset.domain;
    const site = websites.find(s => s.domain === domain);
    if (!site) return;

    if (e.target.matches('select[data-type="timeSelect"]')) {
      site.timeLimit = Number(e.target.value);
      saveConfiguration("websites", websites);

      const timeSpan = li.querySelector('[data-type="timeLeft"]');
      if (timeSpan) {
        const usage = Number(site.usage || 0);
        const remaining = Math.ceil(Math.max(site.timeLimit - usage, 0));
        timeSpan.textContent = `${remaining} min`;
      }
      return;
    }
    
    if (e.target.matches('input[data-type="peekCheckbox"]')) {
      site.peekMode = !!e.target.checked;
      saveConfiguration("websites", websites);
      return;
    }
  });

  //new website domain input
  newDomainInput.addEventListener("input", () => {
    addNewButton.disabled = newDomainInput.value.trim() === "";
  })
  newDomainInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && addNewButton.disabled === false) {
      addNewButton.click();
    }
  });

  // add new website
  addNewButton.addEventListener("click", () => {
    const rawInput = newDomainInput.value.toLowerCase().trim(); // remove whitespace
    if (!rawInput) return;
    let cleanedInput = rawInput.toLowerCase().replace(/^https?:\/\/(www\.)?|^www\./, "").replace(/\/$/, "");  // remove http(s)://www. and trailing slash
    const includesExtension = cleanedInput.includes('.');
    if (!includesExtension) {
      cleanedInput = cleanedInput + ".com";
    }
    if (websites.find(site => site.domain === cleanedInput)) {
      alert("You already have a limit for this website.");
      return;
    }
    websites.push({ 
      domain: cleanedInput, 
      timeLimit: 60, 
      peekMode: false,
      usage: 0
    });
    saveConfiguration("websites", websites)
    renderSites();
    newDomainInput.value = "";
    addNewButton.disabled = true;
  });

  // delete website
  siteList.addEventListener("click", (e) => {
    if (!e.target.matches('button.delete')) return;
    const li = e.target.closest("li");
    if (!li) return;
    const domain = li.dataset.domain;
    const site = websites.find(s => s.domain === domain);
    if (!site) return;
    const confirmed = confirm(`Are you sure you want to remove the limit for ${site.domain}?`);
    if (!confirmed) return;
      
    websites = websites.filter(s => s.domain !== domain);
    saveConfiguration("websites", websites);
    renderSites();
  });
  
  // allow click with enter on everything
  document.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const el = document.activeElement;
      if (el && el.type === "checkbox") {
        el.checked = !el.checked;
        el.dispatchEvent(new Event("change")); 
        e.preventDefault();
      }
    }
  })

  // update timer toggle UI when X button is clicked on timer
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "disableShowTimer") {
      showTimer = false;
      if (timerToggle) timerToggle.checked = false;
    }
  });
  loadAll();
});
