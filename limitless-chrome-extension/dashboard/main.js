document.addEventListener("DOMContentLoaded", () => {
    const siteList = document.getElementById("site-list");
    const addBtn = document.getElementById("add-site");
    const newDomainInput = document.getElementById("new-domain");
    const globalPeekSelect = document.getElementById("peek-time"); // global Sneak Peek duration

    let websites = [];
    let globalPeekTime = null;

    // --- Load initial data: websites + globalPeekTime ---
    function loadAll() {
        chrome.storage.local.get(["websites", "globalPeekTime"], (data) => {
            websites = Array.isArray(data.websites) ? data.websites : [];
            globalPeekTime = (typeof data.globalPeekTime !== "undefined") ? Number(data.globalPeekTime) : null;

            if (globalPeekTime === null) {
                const opt = globalPeekSelect.querySelector("option");
                globalPeekTime = opt ? Number(opt.value) : 0.5;
                chrome.storage.local.set({ globalPeekTime });
            }

            globalPeekSelect.value = String(globalPeekTime);
            renderSites();
        });
    }

    function saveWebsites() {
        chrome.storage.local.set({ websites });
    }

    function saveGlobalPeekTime(value) {
        globalPeekTime = Number(value);
        chrome.storage.local.set({ globalPeekTime });
    }

    // --- Calculate remaining time based on stored usage ---
    function calculateTimeLeft(site) {
        if (!site) return 0;
        return Math.max((site.timeLimit || 0) - (site.usage || 0), 0);
    }

    function renderSites() {
        siteList.innerHTML = "";

        websites.forEach((site, idx) => {
            const li = document.createElement("li");
            const domainSpan = document.createElement("span");
            domainSpan.textContent = site.domain;

            const timeSelect = document.createElement("select");
            for (let i = 0; i <= 180; i += 5) {
                const option = document.createElement("option");
                option.value = String(i);
                option.textContent = i + " min";
                if (i === (site.timeLimit || 0)) option.selected = true;
                timeSelect.appendChild(option);
            }

            const peekCheckbox = document.createElement("input");
            peekCheckbox.type = "checkbox";
            peekCheckbox.checked = !!site.peekMode;

            const deleteBtn = document.createElement("button");
            deleteBtn.textContent = "Delete";
            deleteBtn.classList.add("delete-btn");
            deleteBtn.dataset.index = String(idx);

            const timeLeftSpan = document.createElement("span");
            timeLeftSpan.style.marginLeft = "10px";
            timeLeftSpan.dataset.index = String(idx);

            li.append(domainSpan, timeSelect, peekCheckbox, deleteBtn, timeLeftSpan);
            siteList.appendChild(li);

            updateTimeLeftForIndex(idx);

            timeSelect.addEventListener("change", () => {
                websites[idx].timeLimit = Number(timeSelect.value);
                saveWebsites();
                updateTimeLeftForIndex(idx);
            });

            peekCheckbox.addEventListener("change", () => {
                websites[idx].peekMode = peekCheckbox.checked;
                if (peekCheckbox.checked) {
                    websites[idx].peekTime = globalPeekTime;
                }
                saveWebsites();
            });
        });
    }

    function updateTimeLeftForIndex(idx) {
        const span = siteList.querySelector(`span[data-index="${idx}"]`);
        if (!span) return;
        const site = websites[idx];
        if (!site) {
            span.textContent = "";
            return;
        }
        const left = calculateTimeLeft(site);
        span.textContent = `Time left: ${left > 1 ? Math.floor(left) : (left > 0 ? "<1" : "0")} min`;
    }

    function updateAllTimeLeft() {
        chrome.storage.local.get(["websites"], (data) => {
            websites = Array.isArray(data.websites) ? data.websites : [];
            for (let i = 0; i < websites.length; i++) updateTimeLeftForIndex(i);
        });
    }

    setInterval(updateAllTimeLeft, 5000); // sync every 5 seconds

    siteList.addEventListener("click", (e) => {
        if (!e.target.classList.contains("delete-btn")) return;
        const idx = Number(e.target.dataset.index);
        if (Number.isNaN(idx)) return;
        websites.splice(idx, 1);
        saveWebsites();
        renderSites();
    });

    addBtn.addEventListener("click", () => {
        const raw = newDomainInput.value.trim();
        if (!raw) return;
        const cleaned = raw.startsWith("www.") ? raw.replace(/^www\./, "") : raw;
        websites.push({ domain: cleaned, timeLimit: 60, peekMode: false });
        saveWebsites();
        renderSites();
        newDomainInput.value = "";
        addBtn.disabled = true;
    });

    newDomainInput.addEventListener("input", () => {
        addBtn.disabled = !newDomainInput.value.trim();
    });

    globalPeekSelect.addEventListener("change", () => {
        saveGlobalPeekTime(Number(globalPeekSelect.value));
        saveWebsites();
    });

    loadAll();
});
