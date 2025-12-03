document.addEventListener("DOMContentLoaded", () => {
    // get elements
    const siteList = document.getElementById("site-list");
    const addNewButton = document.getElementById("add-site");
    const newDomainInput = document.getElementById("domain-entry");
    const peekSelect = document.getElementById("peek-time");
    const timerToggle = document.getElementById("timer-toggle")
    const killSwitchToggle = document.getElementById("kill-switch");
    const dashSections = document.querySelectorAll(".killswitch-can-disable")
    // schedule elements
    const allWeekToggle = document.getElementById("all-week-toggle");
    const weekContainer = document.querySelector(".all-week-can-disable");
    const allDayToggle = document.getElementById("all-day-toggle");
    const dayTimeContainer = document.querySelector(".all-day-can-disable");
    const weekCheckboxes = document.querySelectorAll(".day-checkbox");
    const startSelect = document.getElementById("start-time");
    const endSelect = document.getElementById("end-time");

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
        for (let min = 0; min < 60; min += 30) {
          // Format value as 24-hour string for storage
          const hour24 = hour.toString().padStart(2, "0");
          const mm = min.toString().padStart(2, "0");
          const value = `${hour24}:${mm}`;
        
          // Format label as 12-hour for display
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
    function getWeekScheduleMask() {
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
    function updateDisabledWeekStyles() {
      if (!weekContainer) return;
      weekContainer.classList.toggle("disabled", allWeekToggle.checked);
      weekCheckboxes.forEach(box => box.disabled = allWeekToggle.checked);
    }
    function updateDisabledDayStyles() {
      if (!dayTimeContainer) return;
      dayTimeContainer.classList.toggle("disabled", allDayToggle.checked);
    }
    function updateWeekSchedule(mask) {
      weekScheduleMask = mask;
      setWeekScheduleMask(weekScheduleMask);
      saveConfiguration("weekSchedule", weekScheduleMask)
    }

    // style helper for kill switch
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

        // initialize to defaults if not found
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

        for (const [key, defaultValue] of Object.entries(defaults)) {
          const value = (typeof data[key] === "undefined") ? defaultValue : data[key];

          // write default to storage if missing
          if (typeof data[key] === "undefined") {
            chrome.storage.local.set({ [key]: defaultValue });
          }
        
          // assign to the actual variables your UI reads
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

    function saveWebsites() {
      chrome.storage.local.get(["websites"], (data) => {
        const storedWebsiteData = data.websites || [];
        const updatedData = websites.map(site => {
          const stored = storedWebsiteData.find(s => s.domain === site.domain);
          return {
            ...site,
            usage: stored ? stored.usage : site.usage || 0
          };
        });
        chrome.storage.local.set({ websites: updatedData });
      });
    }
    function saveConfiguration(key, value) {
      chrome.storage.local.set({ [key]: value});
      
      chrome.runtime.sendMessage({
        type: "settingsUpdated",
      });
    }

    function renderSites() {
      siteList.innerHTML = "";
      const fragment = document.createDocumentFragment();

      if (!websites || websites.length === 0) {
        const li = document.createElement("li");
        li.classList.add("subtext");
        li.textContent = "No limits set.";
        siteList.appendChild(li);
      } else {
        websites.forEach((site, index) => {
          const li = document.createElement("li");
          li.dataset.index = String(index);

          const domainSpan = document.createElement("span"); // website name
          domainSpan.textContent = site.domain;
          domainSpan.classList.add("site-name", "base-text");

          const timeSelect = document.createElement("select"); // time limit
          timeSelect.id = "time-select" + index;
          timeSelect.ariaLabel = "Daily time limit.";
          timeSelect.classList.add("base-text");
          timeSelect.dataset.type = "timeSelect";

          for (let i = 0; i <= 180; i += 5) { // Add timer options, 0 to 180 minutes
            const option = document.createElement("option");
            option.value = String(i);
            option.textContent = i + " min";
            if (String(i) === String(site.timeLimit || 0)) option.selected = true;
            timeSelect.appendChild(option);
          }

          // Construct toggle switch checkbox
          const toggleWrapper = document.createElement("label");
          toggleWrapper.classList.add("toggle-switch");

          const peekCheckbox = document.createElement("input");
          peekCheckbox.type = "checkbox";
          peekCheckbox.ariaLabel = "Toggle Peek Mode.";
          peekCheckbox.id = "peek-check" + index;
          peekCheckbox.checked = !!site.peekMode;
          peekCheckbox.dataset.type = "peekCheckbox";

          const sliderSpan = document.createElement("span");
          sliderSpan.classList.add("switch-slider");

          toggleWrapper.append(peekCheckbox, sliderSpan);

          // delete button
          const deleteBtn = document.createElement("button");
          deleteBtn.textContent = "Delete";
          deleteBtn.classList.add("delete");

          const timeLeftSpan = document.createElement("span"); // time left display
          timeLeftSpan.classList.add("time-left", "subtext");
          timeLeftSpan.dataset.type = "timeLeft";

          const usage = Number(site.usage || 0);
          const timeLimit = Number(site.timeLimit || 0);
          const remaining = Math.floor(Math.max(timeLimit - usage, 0));
          timeLeftSpan.textContent = `${remaining} min`;

          li.append(domainSpan, timeSelect, toggleWrapper, timeLeftSpan, deleteBtn);
          fragment.appendChild(li);
        });
      }

      siteList.appendChild(fragment);
    }

    siteList.addEventListener("change", (e) => { // event listeners for config changes
      const li = e.target.closest("li");
      if (!li) return;
      const index = Number(li.dataset.index);
      const site = websites[index];
      if (!site) return;

      if (e.target.matches('select') && e.target.dataset.type === "timeSelect") {
        site.timeLimit = Number(e.target.value);
        saveWebsites();
        const timeSpan = li.querySelector('[data-type="timeLeft"]');
        if (timeSpan) {
          const usage = Number(site.usage || 0);
          const remaining = Math.floor(Math.max(site.timeLimit - usage, 0));
          timeSpan.textContent = `${remaining} min`;
        }
        return;
      }
    
      if (e.target.matches('input[type="checkbox"]') && e.target.dataset.type === "peekCheckbox") {
        site.peekMode = !!e.target.checked;
        saveWebsites();
        return
      }
    });

    siteList.addEventListener("click", (e) => {
      if (!e.target.matches('button.delete')) return;
      const li = e.target.closest("li");
      if (!li) return;
      const index = Number(li.dataset.index);
      const site = websites[index];
      if (!site) return;

      const confirmed = confirm(`Are you sure you want to remove the limit for ${site.domain}?`);
      if (!confirmed) return;
        
      websites.splice(index, 1);
      saveWebsites();
      renderSites();
    });

    // input listeners

    // timer toggle
    timerToggle.addEventListener("change", () => {
      showTimer = timerToggle.checked;
      saveConfiguration("showTimer", showTimer);
    })

    //domain input
    newDomainInput.addEventListener("input", () => {
      addNewButton.disabled = newDomainInput.value.trim() === "";
    })
    newDomainInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && addNewButton.disabled === false) {
        addNewButton.click();
      }
    });

    // add new button
    addNewButton.addEventListener("click", () => {
      const rawInput = newDomainInput.value.toLowerCase().trim(); // remove whitespace
      if (!rawInput) return;
      const cleanedInput = rawInput.replace(/^www\./, "").replace(/\/$/, ""); // remove www. and trailing slash
      if (websites.find(site => site.domain === cleanedInput)) {
        alert("You already have a limit for this domain.");
        return;
      }
      websites.push({ 
        domain: cleanedInput, 
        timeLimit: 60, 
        peekMode: false,
        usage: 0
      });
      saveWebsites();
      renderSites();
      newDomainInput.value = "";
      addNewButton.disabled = true;
    });

    // peek mode toggle
    peekSelect.addEventListener("change", () => {
      peekDuration = Number(peekSelect.value);
      saveConfiguration("peekDuration", peekDuration);
    });

    // schedule - times of day
    startSelect.addEventListener("change", () => { // save and update timer when limit is changed
      scheduleStart = startSelect.value;
      saveConfiguration("scheduleStart", scheduleStart);
    });
    endSelect.addEventListener("change", () => { // save and update timer when limit is changed
      scheduleEnd = endSelect.value;
      saveConfiguration("scheduleEnd", scheduleEnd);
    });
    allDayToggle.addEventListener("change", () => {
      allDay = allDayToggle.checked;
      saveConfiguration("allDay", allDay);
      updateDisabledDayStyles()
    });
    // Schedule - week toggles
    weekCheckboxes.forEach(box => {
      box.addEventListener("change", () => {
        const mask = getWeekScheduleMask();
        updateWeekSchedule(mask)
      });
    });
    allWeekToggle.addEventListener("change", () => {
      allWeek = allWeekToggle.checked;
      saveConfiguration("allWeek", allWeek);
      updateDisabledWeekStyles();
    });

    // Kill switch
    killSwitchToggle.addEventListener("change", () => {
      disableAll = killSwitchToggle.checked;
      saveConfiguration("disableAll", disableAll);
      updateDisabledSectionStyles();
    })

    document.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const el = document.activeElement;

        if (el && el.type === "checkbox") {
          el.checked = !el.checked;
          el.dispatchEvent(new Event("change")); // trigger change listeners
          e.preventDefault();
        }
      }
    })

    loadAll();
});
