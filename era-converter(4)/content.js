(() => {
  const DEFAULT_SETTINGS = {
    enabled: true,
    convertCE: true,
    convertBCE: true,
    convertBP: true,
    adjustBPMath: false, // BP -> real calendar year (e.g. "3000 BP" -> "1051 BC")
    convertSpelledOutBP: false, // "12,000 Before Present" -> "12,000 BC"
    traditionalOrder: false, // "AD 500" instead of "500 AD" (BC/BCE always stay after the year)
    filterMode: "all", // "all" | "whitelist" | "blacklist"
    filterListText: "", // newline-separated list of domains
  };

  const SKIP_TAGS = new Set([
    "SCRIPT",
    "STYLE",
    "NOSCRIPT",
    "TEXTAREA",
    "INPUT",
    "CODE",
    "PRE",
  ]);

  // ---- Regexes ---------------------------------------------------------
  // Word-boundary based so "RACE", "SCEptre", etc. are never touched.
  // Optional periods handle "C.E.", "B.C.E.", "B.P." style notation too.
  //
  // Note: these deliberately do NOT guard against a leading "-" (as in a
  // genuinely negative figure) because a hyphen is far more commonly a
  // range separator ("300,000-130,000 BP") than a minus sign in real text.
  // The \b boundaries still prevent the regex from restarting mid-number.

  const RE_BCE = /\bB\.?C\.?E\.?\b/g;

  // Optionally captures a leading number (+ trailing space) so CE -> AD
  // can be reordered ("500 CE" -> "AD 500") when that option is on.
  const RE_CE = /(\b\d[\d,]*(?:\.\d+)?\s*)?\bC\.?E\.?\b/g;

  // Two numbers sharing a single trailing CE, e.g. "1250-1500 CE" - both
  // ends share one "AD" label placed once, matching the original style.
  const RE_CE_RANGE =
    /\b(\d[\d,]*(?:\.\d+)?)(\s*(?:[-\u2010\u2011\u2012\u2013\u2014\u2015]|to)\s*)(\d[\d,]*(?:\.\d+)?)\s*\bC\.?E\.?\b/g;

  // Bare abbreviation, no adjacent number required.
  const RE_BP_BARE = /\bB\.?P\.?\b/g;

  // Two numbers sharing a single trailing BP, e.g. "300,000-130,000 BP" or
  // "12,000 to 8,000 years BP" - both ends get converted individually.
  const RE_BP_RANGE =
    /\b(\d[\d,]*(?:\.\d+)?)(\s*(?:[-\u2010\u2011\u2012\u2013\u2014\u2015]|to)\s*)(\d[\d,]*(?:\.\d+)?)\s*(?:years?|yrs?\.?)?\s*B\.?P\.?\b/g;

  // A single number (with optional "years"/"yrs") directly before BP/B.P.
  const RE_BP_NUMBERED =
    /\b(\d[\d,]*(?:\.\d+)?)\s*(?:years?|yrs?\.?)?\s*B\.?P\.?\b/g;

  // Spelled-out "Before Present" directly after a number - simple shorten
  // to "BC" (label only, no math - see convertSpelledOutBP option).
  const RE_SPELLED_BP =
    /(\b\d[\d,]*(?:\.\d+)?\s*(?:years?|yrs?\.?)?\s*)Before\s+Present\b/gi;

  // Same idea as RE_BP_RANGE but for the spelled-out phrase.
  const RE_SPELLED_BP_RANGE =
    /\b(\d[\d,]*(?:\.\d+)?)(\s*(?:[-\u2010\u2011\u2012\u2013\u2014\u2015]|to)\s*)(\d[\d,]*(?:\.\d+)?)\s*(?:years?|yrs?\.?)?\s*Before\s+Present\b/gi;

  // node -> original (untouched) text, captured the first time we see it.
  const originals = new WeakMap();
  let settings = { ...DEFAULT_SETTINGS };
  let replacementCount = 0;
  let scanScheduled = false;
  let effectiveEnabled = true;

  // ---- Site filter -------------------------------------------------------

  function normalizeHost(raw) {
    let s = raw.trim().toLowerCase();
    if (!s) return "";
    s = s.replace(/^[a-z]+:\/\//, "");
    s = s.split("/")[0];
    s = s.split(":")[0];
    s = s.replace(/^www\./, "");
    return s;
  }

  function parseFilterList(text) {
    return text
      .split(/\r?\n/)
      .map(normalizeHost)
      .filter(Boolean);
  }

  function hostMatchesList(hostname, list) {
    const h = hostname.toLowerCase().replace(/^www\./, "");
    return list.some((entry) => h === entry || h.endsWith("." + entry));
  }

  function isHostAllowed(s) {
    if (s.filterMode === "whitelist") {
      return hostMatchesList(location.hostname, parseFilterList(s.filterListText));
    }
    if (s.filterMode === "blacklist") {
      return !hostMatchesList(location.hostname, parseFilterList(s.filterListText));
    }
    return true;
  }

  function recomputeEffectiveEnabled() {
    effectiveEnabled = settings.enabled && isHostAllowed(settings);
  }

  // ---- Conversion logic --------------------------------------------------

  function withCommas(n) {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  // Converts a "years before present" figure into a real calendar year.
  // Present = 1950 (the standard radiocarbon-dating reference point).
  // Uses astronomical year counting internally so year 0 is correctly
  // skipped (1 BC is immediately followed by 1 AD, there is no year 0).
  function bpToCalendarYear(n) {
    const astronomical = 1950 - n;
    if (astronomical >= 1) {
      return { label: "AD", value: astronomical };
    }
    return { label: "BC", value: 1 - astronomical };
  }

  function formatAD(value, s) {
    const v = withCommas(value);
    return s.traditionalOrder ? `AD ${v}` : `${v} AD`;
  }

  function formatBPValue(n, s) {
    const { label, value } = bpToCalendarYear(n);
    return label === "AD" ? formatAD(value, s) : `${withCommas(value)} BC`;
  }

  function convertText(text, s) {
    let out = text;

    if (s.convertBCE) {
      out = out.replace(RE_BCE, "BC");
    }

    if (s.convertCE) {
      out = out.replace(RE_CE_RANGE, (match, num1, sep, num2) => {
        return s.traditionalOrder ? `AD ${num1}${sep}${num2}` : `${num1}${sep}${num2} AD`;
      });
      out = out.replace(RE_CE, (match, numPart) => {
        if (numPart) {
          return s.traditionalOrder ? `AD ${numPart.trim()}` : `${numPart}AD`;
        }
        return "AD";
      });
    }

    if (s.convertBP) {
      if (s.convertSpelledOutBP) {
        out = out.replace(RE_SPELLED_BP_RANGE, (match, num1, sep, num2) => `${num1}${sep}${num2} BC`);
        out = out.replace(RE_SPELLED_BP, (match, prefix) => `${prefix}BC`);
      }

      if (s.adjustBPMath) {
        // Ranges first ("NUM1-NUM2 BP") so both ends get converted.
        out = out.replace(RE_BP_RANGE, (match, num1Str, sep, num2Str) => {
          const n1 = Math.round(parseFloat(num1Str.replace(/,/g, "")));
          const n2 = Math.round(parseFloat(num2Str.replace(/,/g, "")));
          if (Number.isNaN(n1) || Number.isNaN(n2)) return match;
          const a = bpToCalendarYear(n1);
          const b = bpToCalendarYear(n2);
          if (a.label === b.label) {
            // Shared label stated once, matching the original range style.
            if (a.label === "AD" && s.traditionalOrder) {
              return `AD ${withCommas(a.value)}${sep}${withCommas(b.value)}`;
            }
            return `${withCommas(a.value)}${sep}${withCommas(b.value)} ${a.label}`;
          }
          // Straddles the BC/AD boundary - state each label explicitly.
          return `${formatBPValue(n1, s)}${sep}${formatBPValue(n2, s)}`;
        });

        // Then any remaining single "NUM BP" not part of a matched range.
        out = out.replace(RE_BP_NUMBERED, (match, numStr) => {
          const n = Math.round(parseFloat(numStr.replace(/,/g, "")));
          if (Number.isNaN(n)) return match;
          return formatBPValue(n, s);
        });

        // Anything left without an attached number falls back to a plain swap.
        out = out.replace(RE_BP_BARE, "BC");
      } else {
        out = out.replace(RE_BP_BARE, "BC");
      }
    }

    return out;
  }

  function shouldSkip(parent) {
    let el = parent;
    while (el) {
      if (el.nodeType === 1) {
        if (SKIP_TAGS.has(el.tagName)) return true;
        if (el.isContentEditable) return true;
      }
      el = el.parentElement;
    }
    return false;
  }

  function processTextNode(node) {
    const parent = node.parentElement;
    if (!parent || shouldSkip(parent)) return;

    let original = originals.get(node);
    if (original === undefined) {
      original = node.nodeValue;
      originals.set(node, original);
    }

    // Cheap bail-out: skip the regex work if there's no capital B or C at all.
    if (original.indexOf("B") === -1 && original.indexOf("C") === -1) return;

    const next = effectiveEnabled ? convertText(original, settings) : original;
    if (next !== node.nodeValue) {
      if (next !== original) replacementCount++;
      node.nodeValue = next;
    }
  }

  function walkAndProcess(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        return n.nodeValue && n.nodeValue.length
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT;
      },
    });
    let n;
    while ((n = walker.nextNode())) {
      processTextNode(n);
    }
  }

  const api = typeof browser !== "undefined" ? browser : chrome;

  function fullScan() {
    recomputeEffectiveEnabled();
    replacementCount = 0;
    if (document.body) walkAndProcess(document.body);
    reportCount();
  }

  function reportCount() {
    try {
      api.storage.local.set({
        lastPageCount: replacementCount,
        hostAllowed: isHostAllowed(settings),
      });
    } catch (e) {
      /* ignore */
    }
  }

  function scheduleScan() {
    if (scanScheduled) return;
    scanScheduled = true;
    requestAnimationFrame(() => {
      scanScheduled = false;
      fullScan();
    });
  }

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === "characterData" || m.type === "childList") {
        scheduleScan();
        return;
      }
    }
  });

  function startObserving() {
    if (!document.body) return;
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  function init() {
    api.storage.local
      .get(DEFAULT_SETTINGS)
      .then((stored) => {
        settings = { ...DEFAULT_SETTINGS, ...stored };
        fullScan();
        startObserving();
      })
      .catch(() => {
        fullScan();
        startObserving();
      });

    api.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      let changed = false;
      for (const key of Object.keys(DEFAULT_SETTINGS)) {
        if (changes[key]) {
          settings[key] = changes[key].newValue;
          changed = true;
        }
      }
      if (changed) fullScan();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  api.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message && message.type === "era-converter-get-status") {
      sendResponse({
        count: replacementCount,
        hostAllowed: isHostAllowed(settings),
        hostname: location.hostname,
      });
    }
  });
})();
