document.addEventListener("DOMContentLoaded", () => {
    const siteList = document.getElementById("site-list");
    const addNewButton = document.getElementById("add-site");
    const newDomainInput = document.getElementById("domain-entry");
    const peekSelect = document.getElementById("peek-time");

    let websites = [];
    let peekDuration = 0.5; // default 30 seconds

    // Construct start and end time selects
    const startSelect = document.getElementById("start-time");
    const endSelect = document.getElementById("end-time");

    function generateTimeOptions(selectElement) {
      for (let hour = 0; hour < 24; hour++) {
        for (let min = 0; min < 60; min += 30) {
          // Format value as 24-hour string for storage
          const hh24 = hour.toString().padStart(2, "0");
          const mm = min.toString().padStart(2, "0");
          const value = `${hh24}:${mm}`;
        
          // Format label as 12-hour for display
          let hh12 = hour % 12;
          if (hh12 === 0) hh12 = 12;
          const period = hour < 12 ? "AM" : "PM";
          const label = `${hh12}:${mm} ${period}`;
        
          const option = document.createElement("option");
          option.value = value;      // keep 24-hour format for storage
          option.textContent = label; // show 12-hour format to user
          selectElement.appendChild(option);
        }
      }
    }

    generateTimeOptions(startSelect);
    generateTimeOptions(endSelect);

    // Optional: set default values
    startSelect.value = "09:00";
    endSelect.value = "17:30";

    function loadAll() {
      chrome.storage.local.get(["websites", "peekDuration"], (data) => {
        websites = Array.isArray(data.websites) ? data.websites : [];
    
        if (typeof data.peekDuration !== "undefined") {
          peekDuration = Number(data.peekDuration);
        } else {
          peekDuration = 0.5; 
          chrome.storage.local.set({ peekDuration });
        }

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

    function savePeekDuration(value) {
      peekDuration = Number(value);
      chrome.storage.local.set({ peekDuration });
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

        const domainSpan = document.createElement("span");
        domainSpan.textContent = site.domain;
        domainSpan.classList.add("site-name", "base-text");

        const timeSelect = document.createElement("select");
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

        const timeLeftSpan = document.createElement("span");
        timeLeftSpan.dataset.index = String(index);
        timeLeftSpan.classList.add("time-left", "subtext");

        li.append(domainSpan, timeSelect, toggleWrapper, timeLeftSpan, deleteBtn);
        siteList.appendChild(li);

        function updateTimeLeft() {
          const timeLeft = Math.max((site.timeLimit || 0) - (site.usage || 0), 0);
          timeLeftSpan.textContent = `${timeLeft > 1 ? Math.floor(timeLeft) : 0} min`;
        }

        updateTimeLeft();

        timeSelect.addEventListener("change", () => {
          site.timeLimit = Number(timeSelect.value);
          saveWebsites();
          updateTimeLeft();
        });

        peekCheckbox.addEventListener("change", () => {
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

    peekSelect.addEventListener("change", () => {
      peekValue = Number(peekSelect.value);
      savePeekDuration(peekValue);
      peekSelect.value = String(peekValue);
    });

    loadAll();
});
