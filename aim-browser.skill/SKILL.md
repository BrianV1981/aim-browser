---
name: aim-browser
description: >
  Headed Chromium CDP CLI: tabs, navigate, click/type, extract, screenshots,
  optional captcha hold helper. Use for general page exploration when a one-verb
  skill is not enough. Not Puppeteer/Playwright.
---

# aim-browser

Agent CLI on the **aim-browser** engine. Prefer **one-verb skills** (google-ai, page-fetch, …) when they fit; use this skill for open-ended exploration.

## Defaults

| Policy | Behavior |
|--------|----------|
| Window | **Minimized** (`--start-visible` / `--visible` to watch) |
| After new tab | Re-minimized (Chrome often un-minimizes) |
| CDP | Loopback only (`127.0.0.1`) |
| Profile | Sensitive — do not log cookies/secrets |

Prefer the **daemon** over ad-hoc headless Chrome.

## Setup

```bash
cd /path/to/aim-browser && npm install
npm run skill -- --start    # or: node aim-browser.skill/scripts/run.js --start
npm run skill -- --check
```

Install into a vessel: `npm run install-skills -- <skills-dir> --mode symlink`  
(or link `aim-browser.skill` into the host skills path).

## Flags (left → right; tab state kept)

**Lifecycle:** `--start` · `--start-minimized` · `--start-visible` · `--show` · `--minimize` · `--maximize` · `--check` · `--stop`

**Tabs:** `--list` · `--open <url>` · `--use <index>` · `--close [<index>]`

**Navigate / wait:** `--url <url>` · `--wait-ready` · `--wait-selector <css>` · `--wait <ms>` · `--scroll-to-bottom` · `--solve-px`

**Discover:** `--elements` · `--content` · `--content-ax` · `--html` · `--screenshot <path>` · `--fullpage` · `--imgsave <path>`

**Interact:** `--click` · `--tap` · `--tapxy` · `--taptestid` · `--type` · `--textbox` · `--keytype` · `--keypress` · `--keycombo`

**Env / advanced:** `--eval "<js>"` · `--block-media` · `--spy <pattern>` · `--dlpath` · `--upload` · `--resize` · `--interactive` / `--repl`

## Examples

```bash
npm run skill -- --start --open "https://example.com" --elements

npm run skill -- \
  --url "https://example.com" \
  --type 2 "query" \
  --keypress enter \
  --wait-selector ".results" \
  --screenshot /tmp/results.png
```

## Engine (scripts)

After exploration, permanent jobs import the package:

```javascript
import { AimBrowser, startDaemon, stopDaemon } from 'aim-browser';
```

See repo `README.md` and `SECURITY.md`. Seamless headed (Xvfb): `docs/SEAMLESS_HEADED.md`.
