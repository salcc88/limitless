document.addEventListener("DOMContentLoaded", () => {
    // get elements
    const siteList = document.getElementById("site-list");
    const addNewButton = document.getElementById("add-site");
    const newDomainInput = document.getElementById("domain-entry");
    const peekSelect = document.getElementById("peek-time");
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
    let peekDuration = 0.5; // default 30 seconds
    let weekScheduleMask = 0b0000000;
    let allWeek = true;
    let allDay = true
    let scheduleStart = "09:00"; 
    let scheduleEnd = "17:30";
    let disableAll = false

    // Construct start and end time selects
    function generateTimeOptions(selectElement) {
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
          option.value = value;      // keep 24-hour format for storage
          option.textContent = label; // show 12-hour format to user
          selectElement.appendChild(option);
        }
      }
    }
    generateTimeOptions(startSelect);
    generateTimeOptions(endSelect);

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
        "disableAll",
      ], (data) => {

        function loadDataAndCheck( key, defaultValue ) {
          const storageValue = data[key];
          if (typeof storageValue === 'undefined') {
            chrome.storage.local.set({ [key]: defaultValue });
            return defaultValue;
          }
          return storageValue;
        }

        // initialize to defaults if not found
        websites = Array.isArray(data.websites) ? data.websites : [];
        peekDuration = Number(loadDataAndCheck("peekDuration", 0.5));
        allWeek = loadDataAndCheck("allWeek", true);
        allDay = loadDataAndCheck("allDay", true);
        weekScheduleMask = Number(loadDataAndCheck("weekSchedule", 0b0000000));
        scheduleStart = String(loadDataAndCheck("scheduleStart", "09:00"));
        scheduleEnd = String(loadDataAndCheck("scheduleEnd", "17:30"));
        disableAll = loadDataAndCheck("disableAll", false);

        //Set ui values
        allWeekToggle.checked = allWeek;
        allDayToggle.checked = allDay;
        killSwitchToggle.checked = disableAll;
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
    }

    function renderSites() {
      siteList.innerHTML = "";

      if (websites.length === 0) {
        const li = document.createElement("li");
        li.classList.add("subtext");
        li.textContent = "No limits set.";
        siteList.appendChild(li);
        return;
      }

      websites.forEach((site, index) => {
        const li = document.createElement("li");

        const domainSpan = document.createElement("span"); // website name
        domainSpan.textContent = site.domain;
        domainSpan.classList.add("site-name", "base-text");

        const timeSelect = document.createElement("select"); // time limit
        timeSelect.id = "time-select" + index;
        timeSelect.classList.add("base-text");

        for (let i = 0; i <= 180; i += 5) { // Add timer options, 0 to 180 minutes
          const option = document.createElement("option");
          option.value = String(i);
          option.textContent = i + " min";
          if (i === (site.timeLimit || 0)) option.selected = true;
          timeSelect.appendChild(option);
        }

        // Construct toggle switch checkbox
        const toggleWrapper = document.createElement("label");
        toggleWrapper.classList.add("toggle-switch");

        const peekCheckbox = document.createElement("input");
        peekCheckbox.type = "checkbox";
        peekCheckbox.id = "peek-check" + index;
        peekCheckbox.checked = !!site.peekMode;

        const sliderSpan = document.createElement("span");
        sliderSpan.classList.add("switch-slider");

        toggleWrapper.append(peekCheckbox, sliderSpan);

        // delete button
        const deleteBtn = document.createElement("button");
        deleteBtn.textContent = "Delete";
        deleteBtn.classList.add("delete");
        deleteBtn.dataset.index = String(index);

        const timeLeftSpan = document.createElement("span"); // time left display
        timeLeftSpan.dataset.index = String(index);
        timeLeftSpan.classList.add("time-left", "subtext");

        li.append(domainSpan, timeSelect, toggleWrapper, timeLeftSpan, deleteBtn);
        siteList.appendChild(li);

        function updateTimeLeft() {
          const timeLeft = Math.max((site.timeLimit || 0) - (site.usage || 0), 0);
          timeLeftSpan.textContent = `${timeLeft > 1 ? Math.floor(timeLeft) : 0} min`;
        }

        updateTimeLeft();

        timeSelect.addEventListener("change", () => { // save and update timer when limit is changed
          site.timeLimit = Number(timeSelect.value);
          saveWebsites();
          updateTimeLeft();
        });

        peekCheckbox.addEventListener("change", () => { // update peek mode
          site.peekMode = peekCheckbox.checked;
          saveWebsites();
        });

        deleteBtn.addEventListener("click", () => {
          const confirmed = confirm(`Are you sure you want to remove the limit for ${site.domain}?`);
          if (!confirmed) return; // user canceled
          websites.splice(index, 1);
          saveWebsites();
          renderSites();
        });
      });
    }

    // input listeners

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
