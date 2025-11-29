document.addEventListener("DOMContentLoaded", () => {
    const siteList = document.getElementById("site-list");
    const addBtn = document.getElementById("add-site");
    const newDomainInput = document.getElementById("new-domain");
    const globalPeekSelect = document.getElementById("peek-time"); // global Sneak Peek duration

    // in-memory websites array (kept in sync with storage)
    let websites = [];
    let globalPeekTime = null; // persisted global peek duration

    // --- Helper: calculate remaining time (ignores peek time) ---
    function calculateTimeLeft(site) {
        if (!site) return 0;
        const limit = site.timeLimit || 0;
        const usage = site.usage || 0;
        if (site.lastVisit) {
            const extra = (Date.now() - site.lastVisit) / 1000 / 60;
            return Math.max(limit - (usage + extra), 0);
        }
        return Math.max(limit - usage, 0);
    }

    // --- Load initial data: websites + globalPeekTime ---
    function loadAll() {
        chrome.storage.local.get(["websites", "globalPeekTime"], (data) => {
            websites = Array.isArray(data.websites) ? data.websites : [];
            // If globalPeekTime exists in storage use it, otherwise default to first option
            globalPeekTime = (typeof data.globalPeekTime !== "undefined") ? Number(data.globalPeekTime) : null;

            // If not set, infer default from the select element's first non-empty option
            if (globalPeekTime === null) {
                const opt = globalPeekSelect.querySelector("option");
                globalPeekTime = opt ? Number(opt.value) : 0.5;
                // persist default so subsequent loads are consistent
                chrome.storage.local.set({ globalPeekTime });
            }

            // set the select to persisted value (ensure it's a string match)
            globalPeekSelect.value = String(globalPeekTime);

            renderSites();
        });
    }

    // --- Persist websites array ---
    function saveWebsites() {
        chrome.storage.local.set({ websites });
    }

    // --- Persist global peek time ---
    function saveGlobalPeekTime(value) {
        globalPeekTime = Number(value);
        chrome.storage.local.set({ globalPeekTime });
    }

    // --- Render list of sites ---
    function renderSites() {
        siteList.innerHTML = "";

        websites.forEach((site, idx) => {
            const li = document.createElement("li");

            // Domain text
            const domainSpan = document.createElement("span");
            domainSpan.textContent = site.domain;

            // Time limit dropdown (0–180 min every 5)
            const timeSelect = document.createElement("select");
            for (let i = 0; i <= 180; i += 5) {
                const option = document.createElement("option");
                option.value = String(i);
                option.textContent = i + " min";
                if (i === (site.timeLimit || 0)) option.selected = true;
                timeSelect.appendChild(option);
            }

            // Peek Mode checkbox
            const peekCheckbox = document.createElement("input");
            peekCheckbox.type = "checkbox";
            peekCheckbox.checked = !!site.peekMode;

            // Delete button
            const deleteBtn = document.createElement("button");
            deleteBtn.textContent = "Delete";
            deleteBtn.classList.add("delete-btn");
            deleteBtn.dataset.index = String(idx);

            // Time-left display
            const timeLeftSpan = document.createElement("span");
            timeLeftSpan.style.marginLeft = "10px";
            timeLeftSpan.dataset.index = String(idx);

            // Attach row elements
            li.append(domainSpan, timeSelect, peekCheckbox, deleteBtn, timeLeftSpan);
            siteList.appendChild(li);

            // --- Initialize displayed time-left for this row ---
            updateTimeLeftForIndex(idx);

            // --- Handlers that modify in-memory 'websites' and persist once ---
            timeSelect.addEventListener("change", () => {
                websites[idx].timeLimit = Number(timeSelect.value);
                saveWebsites();
                updateTimeLeftForIndex(idx);
            });

            peekCheckbox.addEventListener("change", () => {
                websites[idx].peekMode = peekCheckbox.checked;
                if (peekCheckbox.checked) {
                    // enable peek and assign the current globalPeekTime
                    websites[idx].peekTime = globalPeekTime;
                } else {
                    // when disabled, leave peekTime present (no harm) or remove if preferred
                    // delete websites[idx].peekTime;
                }
                saveWebsites();
            });
        });
    }

    // --- Update time-left text for a single index (uses in-memory websites) ---
    function updateTimeLeftForIndex(idx) {
        const span = siteList.querySelector(`span[data-index="${idx}"]`);
        if (!span) return;
        const site = websites[idx];
        if (!site) {
            span.textContent = "";
            return;
        }
        const left = calculateTimeLeft(site);
        span.textContent = `Time left: ${left > 1 ? Math.floor(left) : 0} min`;
    }

    // --- Global update (used by interval) ---
    function updateAllTimeLeft() {
        for (let i = 0; i < websites.length; i++) updateTimeLeftForIndex(i);
    }

    // single global timer instead of per-row intervals
    setInterval(updateAllTimeLeft, 60000);

    // --- Delete site (delegated) ---
    siteList.addEventListener("click", (e) => {
        if (!e.target.classList.contains("delete-btn")) return;
        const idx = Number(e.target.dataset.index);
        if (Number.isNaN(idx)) return;
        websites.splice(idx, 1);
        saveWebsites();
        renderSites();
    });

    // --- Add site ---
    addBtn.addEventListener("click", () => {
        const raw = newDomainInput.value.trim();
        if (!raw) return;
        const cleaned = raw.startsWith("www.") ? raw.replace(/^www\./, "") : raw;
        // Add using current globalPeekTime
        websites.push({
            domain: cleaned,
            timeLimit: 60,
            peekMode: false,
            peekTime: globalPeekTime
        });
        saveWebsites();
        renderSites();
        newDomainInput.value = "";
        addBtn.disabled = true;
    });

    newDomainInput.addEventListener("input", () => {
        addBtn.disabled = !newDomainInput.value.trim();
    });

    // --- Global Peek select change: persist and apply to all peek-enabled sites ---
    globalPeekSelect.addEventListener("change", () => {
        const newVal = Number(globalPeekSelect.value);
        saveGlobalPeekTime(newVal);

        // apply to all sites that have peekMode enabled
        let changed = false;
        websites.forEach(site => {
            if (site.peekMode) {
                site.peekTime = newVal;
                changed = true;
            }
        });
        if (changed) saveWebsites();
    });

    // --- Initial load ---
    loadAll();
});
