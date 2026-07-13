(() => {
  const api = typeof browser !== "undefined" ? browser : chrome;

  const DEFAULT_SETTINGS = {
    filterMode: "all",
    filterListText: "",
  };

  const els = {
    siteList: document.getElementById("siteList"),
    save: document.getElementById("save"),
    status: document.getElementById("status"),
    addCurrentSite: document.getElementById("addCurrentSite"),
    modeCards: document.querySelectorAll(".mode-card"),
    versionTag: document.getElementById("versionTag"),
  };

  const manifest = api.runtime.getManifest();
  if (els.versionTag) els.versionTag.textContent = `v${manifest.version}`;

  function normalizeHost(raw) {
    let s = raw.trim().toLowerCase();
    if (!s) return "";
    s = s.replace(/^[a-z]+:\/\//, "");
    s = s.split("/")[0];
    s = s.split(":")[0];
    s = s.replace(/^www\./, "");
    return s;
  }

  function highlightMode(mode) {
    els.modeCards.forEach((card) => {
      const input = card.querySelector("input");
      card.classList.toggle("selected", input.value === mode);
    });
  }

  function currentMode() {
    const checked = document.querySelector('input[name="filterMode"]:checked');
    return checked ? checked.value : "all";
  }

  function load() {
    api.storage.local.get(DEFAULT_SETTINGS).then((stored) => {
      const settings = { ...DEFAULT_SETTINGS, ...stored };
      const modeInput = document.querySelector(
        `input[name="filterMode"][value="${settings.filterMode}"]`
      );
      if (modeInput) modeInput.checked = true;
      highlightMode(settings.filterMode);
      els.siteList.value = settings.filterListText;
    });
  }

  function showStatus(text) {
    els.status.textContent = text;
    els.status.classList.add("visible");
    clearTimeout(showStatus._t);
    showStatus._t = setTimeout(() => {
      els.status.classList.remove("visible");
    }, 2200);
  }

  function save() {
    const lines = els.siteList.value
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const cleaned = lines.map(normalizeHost).filter(Boolean).join("\n");
    els.siteList.value = cleaned;

    api.storage.local
      .set({
        filterMode: currentMode(),
        filterListText: cleaned,
      })
      .then(() => showStatus("Saved"));
  }

  els.modeCards.forEach((card) => {
    card.addEventListener("click", () => {
      const input = card.querySelector("input");
      input.checked = true;
      highlightMode(input.value);
    });
  });

  els.save.addEventListener("click", save);

  els.siteList.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      save();
    }
  });

  els.addCurrentSite.addEventListener("click", async () => {
    try {
      const [tab] = await api.tabs.query({ active: true, lastFocusedWindow: true });
      if (!tab || !tab.url) return;
      const host = normalizeHost(new URL(tab.url).hostname);
      if (!host) return;

      const existing = els.siteList.value
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      if (!existing.includes(host)) {
        existing.push(host);
        els.siteList.value = existing.join("\n");
      }
    } catch (e) {
      /* ignore - e.g. no active tab, or a page URL that can't be parsed */
    }
  });

  load();
})();
