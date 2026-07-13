---
name: aim-browser
description: >
  Persistent headed Chromium CDP engine for A.I.M. agents — explore pages, test
  selectors, solve behavioral captchas, and drive a real browser profile without
  Puppeteer/Playwright.
---

# aim-browser Skill

## Overview

This skill is the **agent CLI** on top of the `aim-browser` engine. It drives a
**persistent, headed** Desktop Chromium instance (via the local lifecycle daemon)
over the Chrome DevTools Protocol (CDP).

**Paradigm:** real browsers beat headless spoofing. Prefer the daemon (`--start`)
over ad-hoc headless Chrome.

Agents use this skill to explore hostile/protected DOMs, discover selectors, and
validate flows **before** writing cron/production scripts that import `AimBrowser`
from the engine package.

## Prerequisites

1. Linux/WSL with Chromium or Google Chrome installed (or set `BROWSER_BIN`).  
2. From the **aim-browser repo root** (or any install that includes `src/` + skill):

```bash
# Preferred: headed daemon (loopback CDP only)
node aim-browser.skill/scripts/run.js --start
node aim-browser.skill/scripts/run.js --check
```

Equivalent npm scripts (from package root):

```bash
npm run daemon:start
npm run daemon:check
npm run daemon:stop
```

**Do not** expose CDP on non-loopback interfaces. The daemon refuses non-loopback binds.

## Installation (multi-CLI)

```bash
git clone https://github.com/BrianV1981/aim-browser.git
cd aim-browser && npm install
```

Link the skill directory into your agent host as appropriate:

| CLI | Pattern |
|-----|---------|
| Gemini / AGY | `gemini skills link /path/to/aim-browser/aim-browser.skill` (or host-equivalent) |
| Grok | Copy/link under project `.grok/skills/aim-browser/` or Operator skill path |
| OpenCode | Copy/link under `.opencode/skills/aim-browser/` |

Always preserve YAML frontmatter in `SKILL.md`.

## Command Line Flags

`scripts/run.js` executes flags left → right and keeps tab state across the chain.

### Lifecycle
- `--start` — Boot headed Chromium daemon **minimized** (default — does **not** cover Operator work).  
- `--start-minimized` — Explicit same as default.  
- `--start-visible` — Watch mode: show window + bring to front.  
- `--show` / `--visible` — Un-minimize + bring to front (mid-run peek).  
- `--minimize` / `--maximize` — Window state via CDP.  
- `--check` / `--stop` — Health / shutdown.

Env: `AIM_BROWSER_START_MINIMIZED=0` or `--start-visible` for watch mode.  
Seamless headed without any popup on your seat: see `docs/SEAMLESS_HEADED.md` (virtual display / Xvfb).

### Tabs
- `--list` / `--tabs` — List tabs.  
- `--open <url>` — New tab.  
- `--use <index>` — Switch tab.  
- `--close [<index>]` — Close tab.

### Navigation & waiting
- `--url <url>` — Navigate + wait ready.  
- `--wait-ready` / `--wait-selector <css>` / `--wait <ms>`  
- `--scroll-to-bottom` — Lazy-load scroll.  
- `--solve-px` — PerimeterX / “Press & Hold” native mouse hold.

### Discovery
- `--elements` — Interactable elements index.  
- `--content` / `--content-ax` / `--html`  
- `--screenshot <path> [--fullpage]` / `--imgsave <path>`

### Interaction
- `--click <css|index>` / `--tap <index>` / `--tapxy <x> <y>` / `--taptestid <id>`  
- `--type <index> <text>` / `--textbox <text>` / `--keytype` / `--keypress` / `--keycombo`

### Environment
- `--dlpath` / `--upload` / `--resize` / `--maximize` / `--minimize`  
- `--eval "<js>"` — Arbitrary page JS (full session authority).  
- `--block-media` / `--spy <url-pattern>`  
- `--interactive` / `--repl` — Node REPL with `browser` global.

## Examples

```bash
# Discovery
node aim-browser.skill/scripts/run.js --start --open "https://example.com" --elements

# Interaction chain
node aim-browser.skill/scripts/run.js \
  --url "https://example.com" \
  --type 2 "search query" \
  --keypress enter \
  --wait-selector ".results-container" \
  --screenshot "/tmp/results.png"
```

## Production scripts

After exploration, write permanent jobs against the **engine**, not one-off skill flags:

```javascript
import { AimBrowser, startDaemon, stopDaemon } from 'aim-browser';

startDaemon();
const browser = new AimBrowser();
await browser.connect();
// ...
await browser.close();
stopDaemon();
```

See the repo `README.md` and `SECURITY.md`.
