document.addEventListener("DOMContentLoaded", () => {
    const siteList = document.getElementById("site-list");
    const addNewButton = document.getElementById("add-site");
    const newDomainInput = document.getElementById("domain-entry");
    const peekSelect = document.getElementById("peek-time");

    let websites = [];
    let peekDuration = 0.25; // default 15 seconds

    function loadAll() {
      chrome.storage.local.get(["websites", "peekDuration"], (data) => {
        websites = Array.isArray(data.websites) ? data.websites : [];
    
        if (typeof data.peekDuration !== "undefined") {
          peekDuration = Number(data.peekDuration);
        } else {
          peekDuration = 0.25; 
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
      websites.forEach((site, index) => {
        const li = document.createElement("li");
        const domainSpan = document.createElement("span");
        domainSpan.textContent = site.domain;
        domainSpan.classList.add("site-name");
        const timeSelect = document.createElement("select");
        timeSelect.id = "time-select" + index;

        for (let i = 0; i <= 180; i += 5) { // Add timer options, 0 to 180 minutes
          const option = document.createElement("option");
          option.value = String(i);
          option.textContent = i + " min";
          if (i === (site.timeLimit || 0)) option.selected = true;
          timeSelect.appendChild(option);
        }

        const peekCheckbox = document.createElement("input");
        peekCheckbox.type = "checkbox";
        peekCheckbox.id = "peek-check" + index;
        peekCheckbox.checked = !!site.peekMode;

        const deleteBtn = document.createElement("button");
        deleteBtn.textContent = "Delete";
        deleteBtn.classList.add("delete");
        deleteBtn.dataset.index = String(index);

        const timeLeftSpan = document.createElement("span");
        timeLeftSpan.dataset.index = String(index);
        timeLeftSpan.classList.add("time-left");

        li.append(domainSpan, timeSelect, peekCheckbox, timeLeftSpan, deleteBtn);
        siteList.appendChild(li);

        function updateTimeLeft() {
          const timeLeft = Math.max((site.timeLimit || 0) - (site.usage || 0), 0);
          timeLeftSpan.textContent = `Time left: ${timeLeft > 1 ? Math.floor(timeLeft) : 0} min`;
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
          const confirmed = confirm(`Are you sure you want to delete the time limit for ${site.domain}?`);
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
      const cleanedInput = rawInput.replace(/^www\./, ""); // remove www.
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
