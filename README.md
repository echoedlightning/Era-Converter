# Era Notation Converter

A Firefox extension that rewrites era notation as you browse:

- `CE` → `AD`
- `BCE` → `BC`
- `BP` (Before Present) → `BC`

It also catches punctuated forms like `C.E.`, `B.C.E.`, and `B.P.`. Word boundaries are used throughout, so it never touches things like "RACE" or "SCEptre" — only standalone era abbreviations are matched.

## Options (toggle in the popup)

**Traditional word order** — off by default, the extension converts in place ("500 CE" → "500 AD"). Turn this on and it instead writes "AD 500", matching the traditional convention of putting AD *before* the year. BC and BCE always stay *after* the year either way, since that's standard in both styles.

**Adjust the year (under BP)** — off by default, `BP → BC` is a plain label swap that leaves the number untouched ("3,000 BP" → "3,000 BC"). Turn this on and it instead computes the real calendar year and swaps in that number too, e.g. "3,000 BP" → "1051 BC", or "1,200 BP" → "750 AD" if the math lands after year 1. See "The BP math" below for how this is calculated. It also understands "3,000 years BP" / "3,000 yrs BP" phrasing.

**Catch spelled-out phrasing (under BP)** — off by default. When on, it also matches the fully spelled-out phrase "Before Present" *when it directly follows a number* (e.g. "12,000 Before Present" or "12,000 years Before Present") and shortens just that phrase to "BC" — "12,000 Before Present" → "12,000 BC". This is a simple label shorten, not the year math above (so it stays "12,000 BC" even with the year-adjustment option also on) — the number and any "years" wording are left exactly as they were. "Before Present" with no adjacent number (e.g. a glossary entry defining the term) is left alone.

## The BP math

"Before Present" counts backward from 1950 (the radiocarbon-dating reference point), while BC/AD count from year 1 — and there's no year 0 (1 BC is immediately followed by AD 1). So converting a BP figure into a real calendar year isn't just subtraction by 1950; a small correction is needed once you cross into BC:

- If `1950 − BP` comes out to 1 or more, that's the AD year directly.
- Otherwise, the BC year is `1 − (1950 − BP)`.

For example, 2,000 BP works out to 51 BC, not 50 BC — a common source of off-by-one errors. The extension handles this correction automatically when "Adjust the year" is turned on.

**Date ranges:** "300,000–130,000 BP" (a single shared "BP" covering both ends of a range) converts both numbers correctly — e.g. "298,051–128,051 BC" — rather than only converting the number directly touching "BP". The same applies to CE ranges like "1250–1500 CE" → "AD 1250–1500" (with traditional word order on) or "1250–1500 AD" (without). Both hyphens and en-dashes are recognized, as well as "12,000 to 8,000 BP" phrasing. Large computed years get thousands separators added for readability (e.g. "678,051 BC").

## Site filter (whitelist / blacklist)

By default the extension runs on every page. In the popup, under "Site filter," you can switch to:

- **Only these** (whitelist) — the extension only runs on the domains you list.
- **Except these** (blacklist) — the extension runs everywhere *except* the domains you list.

The popup also shows a small status pill ("active here" / "blocked here") telling you whether the current tab is covered.

Click **"Edit site list →"** to open a dedicated full-page editor (the extension's Options page) where you can type or paste domains directly, one per line — like editing a plain text file. A **"+ Add current tab"** button fills in the domain of whichever page is currently active for you. Just the bare domain is needed (e.g. `example.com`); listing a domain automatically covers its subdomains (`www.example.com`, `blog.example.com`, etc.) too, and pasted URLs are cleaned up automatically. Remember to click **Save**.

## Reload button

Setting changes apply live to the current page without needing a reload. The **"Reload page to apply"** button in the popup is there for convenience — for example, to re-run the conversion cleanly after switching several options at once, or if a page's dynamic content didn't get picked up automatically. If the button doesn't seem to do anything, check that Firefox isn't blocking the reload on a restricted page (like `about:` pages or the Add-ons Manager) — the extension can't run there at all.

## Install (temporary, for testing)

1. Open Firefox and go to `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…**.
3. Select the `manifest.json` file inside this folder.
4. The extension icon will appear in the toolbar. It's active immediately on open tabs after you reload them.

This temporary install lasts until Firefox is closed. To install permanently, the extension needs to be signed by Mozilla (see below).

## Install (permanent)

Firefox requires extensions to be signed to stay installed across restarts. To get a signed `.xpi`:

1. Zip the contents of this folder (not the folder itself) into `era-converter.zip`.
2. Create a free account at https://addons.mozilla.org/developers/ and submit it either for self-distribution ("unlisted") or public listing.
3. Once Mozilla signs it, download the resulting `.xpi` and open it in Firefox, or drag it into a Firefox window, to install.

## Usage

Click the toolbar icon to:

- Toggle the whole extension on/off.
- Toggle each conversion rule (CE, BCE, BP) independently — for example, if you only want `BP → BC` and want to leave `CE` alone.
- See how many replacements were made on the current page.

Changes take effect immediately on the current page (no reload needed) since the content script re-scans the page whenever a setting changes. Newly loaded pages pick up your saved preferences automatically.

## Notes on the conversions

- `BP` uses 1950 as its reference point (it's the radiocarbon-dating convention), while `BC` counts back from year 1. This extension only swaps the **label**, not the underlying number — a date given as "3000 BP" will simply read "3000 BC" without adjusting the number. If you need the actual calendar math (roughly `BC year ≈ BP year − 1950`), that would require a separate, more careful conversion since BP figures are often approximate/rounded.
- `AD` is conventionally placed *before* the year (e.g. "AD 500") while `CE` goes after ("500 CE"). This extension swaps the label in place without reordering, so you may end up with "500 AD" rather than the traditional "AD 500". Let me know if you'd like an option that also reorders the year.

## Files

- `manifest.json` — extension manifest (Manifest V3, Firefox-compatible). Declares `data_collection_permissions: { required: ["none"] }`, since this extension collects and transmits no data at all — everything happens locally in the page.
- `content.js` — scans page text and performs the replacements, including the site filter check
- `popup.html` / `popup.css` / `popup.js` — toolbar popup for quick settings and status
- `options.html` / `options.css` / `options.js` — full-page site list editor (opened from the popup)
- `icons/` — toolbar icons
