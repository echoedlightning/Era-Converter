(() => {
  const api = typeof browser !== "undefined" ? browser : chrome;

  const DEFAULT_SETTINGS = {
    enabled: true,
    convertCE: true,
    convertBCE: true,
    convertBP: true,
    adjustBPMath: false,
    convertSpelledOutBP: false,
    traditionalOrder: false,
    filterMode: "all",
    filterListText: "",
  };

  const els = {
    enabled: document.getElementById("enabled"),
    convertCE: document.getElementById("convertCE"),
    convertBCE: document.getElementById("convertBCE"),
    convertBP: document.getElementById("convertBP"),
    adjustBPMath: document.getElementById("adjustBPMath"),
    convertSpelledOutBP: document.getElementById("convertSpelledOutBP"),
    traditionalOrder: document.getElementById("traditionalOrder"),
    rules: document.getElementById("rules"),
    bpSubRules: document.getElementById("bpSubRules"),
    modePills: document.getElementById("modePills"),
    modeAll: document.getElementById("modeAll"),
    modeWhitelist: document.getElementById("modeWhitelist"),
    modeBlacklist: document.getElementById("modeBlacklist"),
    filterStatus: document.getElementById("filterStatus"),
    openOptions: document.getElementById("openOptions"),
    reloadPage: document.getElementById("reloadPage"),
    count: document.getElementById("count"),
    versionTag: document.getElementById("versionTag"),
  };

  const manifest = api.runtime.getManifest();
  if (els.versionTag) els.versionTag.textContent = `v${manifest.version}`;

  function applyDisabledState() {
    els.rules.classList.toggle("disabled", !els.enabled.checked);
    els.bpSubRules.classList.toggle("disabled", !els.convertBP.checked);
  }

  function updateModePillHighlight(mode) {
    els.modePills.querySelectorAll(".mode-pill").forEach((pill) => {
      const input = pill.querySelector("input");
      pill.classList.toggle("selected", input.value === mode);
    });
  }

  async function getActiveTab() {
    const [tab] = await api.tabs.query({ active: true, currentWindow: true });
    return tab || null;
  }

  async function refreshLiveStatus() {
    const tab = await getActiveTab();
    if (!tab || !tab.id) return;

    let response = null;
    try {
      response = await api.tabs.sendMessage(tab.id, {
        type: "era-converter-get-status",
      });
    } catch (e) {
      // Content script isn't loaded on this page (e.g. a browser settings
      // page, PDF viewer, or a tab open before the extension was installed).
    }

    if (!response) {
      els.filterStatus.textContent = "unavailable on this page";
      els.filterStatus.className = "filter-status";
      els.count.textContent = "Reload the page if you just installed or updated the extension.";
      return;
    }

    els.filterStatus.textContent = response.hostAllowed ? "active here" : "blocked here";
    els.filterStatus.className = "filter-status " + (response.hostAllowed ? "active" : "inactive");

    if (!response.hostAllowed) {
      els.count.textContent = `${response.hostname} is excluded by your site filter`;
    } else if (response.count > 0) {
      els.count.textContent = `${response.count} date${response.count === 1 ? "" : "s"} converted on this page`;
    } else {
      els.count.textContent = "No matching dates found on this page";
    }
  }

  function load() {
    api.storage.local.get(DEFAULT_SETTINGS).then((stored) => {
      const settings = { ...DEFAULT_SETTINGS, ...stored };
      els.enabled.checked = settings.enabled;
      els.convertCE.checked = settings.convertCE;
      els.convertBCE.checked = settings.convertBCE;
      els.convertBP.checked = settings.convertBP;
      els.adjustBPMath.checked = settings.adjustBPMath;
      els.convertSpelledOutBP.checked = settings.convertSpelledOutBP;
      els.traditionalOrder.checked = settings.traditionalOrder;

      const mode = settings.filterMode || "all";
      const modeInput = document.querySelector(`input[name="filterMode"][value="${mode}"]`);
      if (modeInput) modeInput.checked = true;
      updateModePillHighlight(mode);

      applyDisabledState();
    });

    refreshLiveStatus();
  }

  function save(key, value) {
    api.storage.local.set({ [key]: value });
  }

  els.enabled.addEventListener("change", () => {
    save("enabled", els.enabled.checked);
    applyDisabledState();
  });
  els.convertCE.addEventListener("change", () => save("convertCE", els.convertCE.checked));
  els.convertBCE.addEventListener("change", () => save("convertBCE", els.convertBCE.checked));
  els.convertBP.addEventListener("change", () => {
    save("convertBP", els.convertBP.checked);
    applyDisabledState();
  });
  els.adjustBPMath.addEventListener("change", () =>
    save("adjustBPMath", els.adjustBPMath.checked)
  );
  els.convertSpelledOutBP.addEventListener("change", () =>
    save("convertSpelledOutBP", els.convertSpelledOutBP.checked)
  );
  els.traditionalOrder.addEventListener("change", () =>
    save("traditionalOrder", els.traditionalOrder.checked)
  );

  els.modePills.addEventListener("change", (e) => {
    if (e.target.name !== "filterMode") return;
    save("filterMode", e.target.value);
    updateModePillHighlight(e.target.value);
  });

  els.openOptions.addEventListener("click", () => {
    api.runtime.openOptionsPage();
  });

  els.reloadPage.addEventListener("click", async () => {
    const tab = await getActiveTab();
    if (!tab || !tab.id) return;
    els.reloadPage.disabled = true;
    els.reloadPage.textContent = "Reloading...";
    try {
      await api.tabs.reload(tab.id);
    } catch (e) {
      /* ignore */
    }
    window.close();
  });

  load();
})();
