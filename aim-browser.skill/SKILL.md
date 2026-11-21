---
name: aim-browser
description: >
  Headed Chromium CDP CLI: tabs, navigate, click/type, extract, screenshots,
  optional captcha hold helper. Use for general page exploration when a one-verb
  skill is not enough. Not Puppeteer/Playwright.
---

# aim-browser

Agent CLI on the **aim-browser** engine. Prefer **one-verb skills** (google-ai, page-fetch, etc.) when they fit; use this skill for open-ended exploration.

> [!IMPORTANT] 
> **TACTICAL DISTINCTION (Native `/browser` vs `aim-browser`)**
> - Use the **Native `/browser` subagent** (via slash command) for interactive pair-programming on the Operator's visible screen, where stealth is not required.
> - Use **`aim-browser`** (this repo) for hostile extraction, background batch-scraping, and bypassing advanced bot heuristics (Cloudflare, Datadome).
>
> **WINDOWS 11 EXECUTION MANDATE**
> The `aim-browser` daemon scripts (`start.sh`, `check.sh`) are fundamentally designed for Linux. When operating on an Antigravity Windows 11 environment, you MUST execute `aim-browser` commands exclusively through the WSL bridge (e.g., `wsl bash -c "npm run skill -- ..."`) rather than attempting native PowerShell execution.

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

**Tabs & Subagent Leases:** `--list` · `--open <url>` · `--use <index>` · `--close [<index>]` · `--tab <lease|new>` · `--actor <name>` · `--leases` · `--release-tab <lease>`

**Navigate / wait:** `--url <url>` · `--wait-ready` · `--wait-selector <css>` · `--wait <ms>` · `--scroll-to-bottom` · `--solve-px`

**Discover & Layout Math:** `--elements` · `--content` · `--content-ax` · `--html` · `--check-occlusion <x> <y>` · `--check-layout` · `--screenshot <path>` · `--fullpage` · `--imgsave <path>`

**Self-Healing Site Maps (`0` VLM tokens):** `--map-record <key> <selector|index>` · `--map-click <key>` · `--map-type <key> <text>` · `--map-show [<domain>]`

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
