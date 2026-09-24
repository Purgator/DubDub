# DubDub

*Every word. Always the same dub.*

A Chrome extension that replaces every word on every website with **dub**, **dubb**, **duub**, **dub dub** — or something stronger for longer words. The same word always turns into the exact same dub, everywhere, every time, so pages stay readable-ish instead of turning into random noise.

> "The quick brown fox jumps over the lazy dog."
> → "Dub dub dubub dub duub dubb dub dub dubb dub dubb."

## Features

- **Translates the whole web, live** — headlines, articles, buttons, everything. Dynamic content (infinite scroll, chat apps, SPAs) gets dubbed as it appears.
- **Always the same word → the same dub** — a deterministic algorithm (a hash of the word, no randomness, no network, no dictionary file) means "banana" is always the same dub on every site, every visit, forever.
- **Stronger dubs for longer words** — short words stay a simple `dub`; longer ones escalate into `dubb`, `duub`, `dub dub`, all the way to `dub duub dub` for the really long ones.
- **Casing is preserved** — `Hello` → `Dub`, `HELLO` → `DUB`, so dubbed pages still *look* like sentences.
- **One switch for everywhere, one switch per site** — turn DubDub off globally from the popup, or just for the site you're currently on (e.g. keep it on for fun browsing, off for your webmail).
- **Built-in translator** — type a word or short sentence into the popup and see its DubDub translation instantly, with a copy button.
- **Lightweight and battery-friendly** — no background page, no network requests, no tracking. The initial pass on a page is spread over idle time so it never blocks scrolling, and page updates are batched to one check per animation frame.

## How the language works

DubDub has exactly one rule: **the same word always produces the same dub.** There's no dictionary — a word is lower-cased and hashed, and that hash deterministically picks:

1. A "strength" tier based on the word's length (longer word → stronger tier, with a little hash-based variety so it's not too mechanical).
2. One of a few dub variants in that tier: `dub`, `dubb`, `duub`, `dub dub`, `dubdub`, `dub dub dub`, and so on.

The original word's capitalization is then re-applied, and everything else on the page (punctuation, spacing, HTML) stays exactly where it was. That's it — it's a toy language, not a translator, and it's not meant to be more complicated than that.

## Install (no technical skills needed)

DubDub isn't on the Chrome Web Store, so it installs from a release ZIP — it only takes a couple of minutes.

**Step 1 — Download**

- Go to the [**latest release**](https://github.com/Purgator/DubDub/releases/latest).
- Under **Assets**, click **DubDub.zip** — it lands in your Downloads folder.

**Step 2 — Unzip it somewhere permanent**

- Right-click the ZIP → **Extract All…** (Windows) or double-click it (Mac).
- Move the extracted folder somewhere it can stay forever, like your Documents folder.
  ⚠️ Chrome loads the extension **from this folder** — if you delete or move it later, the extension stops working.

**Step 3 — Load it in Chrome**

1. Open Chrome and type `chrome://extensions` in the address bar, press Enter.
2. Turn on the **Developer mode** switch (top-right corner of the page).
3. Click **Load unpacked** and select the folder you extracted (the one that contains `manifest.json`).

**That's it.** Open any website and watch it turn into dubs. Click the DubDub icon in the toolbar (pin it via the puzzle-piece icon 🧩 next to the address bar if you don't see it) to:

- Turn DubDub off everywhere, or just on the site you're currently viewing.
- Translate any word or short sentence to DubDub.

> **Updating later:** download the new ZIP from the [releases page](https://github.com/Purgator/DubDub/releases), replace the folder's contents, then click the ↻ refresh icon on the DubDub card in `chrome://extensions`.

### Firefox

DubDub also works on Firefox (121+) as a temporary add-on: open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on…**, and select the ZIP (no need to unzip). Firefox doesn't grant website access at install time, so open the DubDub popup and click **Grant access** once — and reload any tabs that were already open. Temporary add-ons are removed when Firefox restarts.

## For developers

DubDub is plain Manifest V3, no build step, no dependencies.

```bash
git clone https://github.com/Purgator/DubDub.git
```

Then load the cloned folder as an unpacked extension (`chrome://extensions` → Developer mode → Load unpacked), same as above.

### Files

| File | Role |
| --- | --- |
| `manifest.json` | Manifest V3 definition |
| `dub.js` | The DubDub language: hashing, tiers, casing — shared by the content script and the popup |
| `content.js` | Walks the page's text nodes, dubs them, restores them when disabled, watches for DOM changes |
| `popup.html/css/js` | Toolbar popup: global toggle, per-site toggle, translator, exception list |
| `icons/` | Extension icons |
| `tools/gen-icons.js` | Regenerates `icons/*.png` from code (zero dependencies) — run `node tools/gen-icons.js` after changing it |
| `test/test.js` | Unit tests for `dub.js` — run `node test/test.js` (or `npm test` from `test/`) |
| `test/manual.html` | Manual harness to eyeball `content.js` in a real page (dubbing, disable/restore, dynamic content) without loading the actual extension |
| `test/popup-harness.html` | Same idea for the popup, with the `chrome.*` APIs stubbed |

### Settings

Stored in `chrome.storage.sync`:

- `enabled` (boolean) — the global on/off switch.
- `exceptions` (string array of hostnames) — sites where DubDub is turned off even when `enabled` is true. Subdomains of a listed host are included automatically.

### Running the tests

```bash
node test/test.js
```

Pure unit tests for the language in `dub.js` — determinism, casing, punctuation handling. No browser, no dependencies.

### Manual harnesses

`test/manual.html` and `test/popup-harness.html` stub out just enough of the `chrome.*` extension APIs to run `content.js` and `popup.js` in a plain browser tab, so you can eyeball dubbing, disable/restore, dynamic content, and the popup UI without loading the real extension. Open them directly, or serve the repo with any static file server.

## License

DubDub is free software, released under the [GNU General Public License v3.0](LICENSE): you can use, study, share and improve it, and derivative works must stay under the same license.
