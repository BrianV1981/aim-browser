---
name: aim-browser
description: >
  Shared Co-Pilot Chromium CDP engine & CLI for AGY, Grok, and OpenCode:
  live aim-connect Browser split-pane streaming, multi-subagent tab isolation
  (--tab <lease>), <5ms zero-VLM self-healing Website Maps (--map-record /
  --map-click / --map-type), DOM/AX extraction, and human login handoff.
---

# `aim-browser` — Co-Pilot CDP Engine & Multi-Agent Playbook

Cross-platform Node.js Chromium CDP engine (`127.0.0.1:9222`) shared directly with the Operator's **`🌐 Browser`** split-pane inside `aim-connect`. Prefer one-verb skills (`aim-page-fetch`, `aim-google-ai`, `aim-google-web`, `aim-login-hold`, etc.) for single-shot lookups; use `aim-browser` whenever you need live interactive browsing, multi-tab subagent work, form automation, or recurring Website Maps.

> [!IMPORTANT]
> **WHY USE `aim-browser` IN CLI / TMUX SESSIONS**
> - Unlike `agy`'s `/browser` command (which requires an interactive desktop Chrome `v144+` allow-prompt and single-session lock), `aim-browser` runs natively on Linux, WSL2, and Windows 11 (`src/daemon.js`), streams live into the Operator's **`🌐 Browser`** split-pane with real-time `🤖` cursor HUD pills, and lets parallel subagents work simultaneously in isolated background tabs.

---

## 1. The 3 Mandatory Co-Pilot Rules

1. **Always Isolate Your Tab (`--tab <lease>`):**
   Pass `--tab <subagent-or-task-name>` (for example `--tab market-brief` or `--tab subagent-1`). Leased tabs run with `stealFocus: false` so parallel subagents **never** hijack the Operator's active tab or stomp each other, while emitting live cursor HUD events for your tab chip.
2. **Never `--stop` a Shared Session:**
   `--start` is idempotent. When your subagent finishes a temporary tab, clean up ONLY your tab via `--release-tab <lease>` — **never** run `--stop` unless the Operator explicitly asks to shut down the entire browser daemon.
3. **Human-in-the-Loop Login / 2FA Handoff (`--request-human` & `🎮 Control ON`):**
   Never bypass or solve CAPTCHAs/2FA yourself. Run `--tab <lease> --request-human "2FA required on portal"` to flag your leased tab in `leases.json` (triggering `aim-connect`'s `✋ Waiting` alert & takeover banner), let the Operator complete sign-in via **`🎮 Control ON`** or **`🔑 Type / 2FA`**, and clear with `--clear-human` once you resume on the authenticated cookie session. Use `--ephemeral` with `--tab <lease>` when scraping untrusted external URLs so subagents run in a zero-cookie sandbox without touching the Operator's authenticated profile.

---

## 2. Invoking From Any Repository

Run directly from **any** working directory using `${AIM_BROWSER_ROOT:-$HOME/aim-browser}`:

```bash
BROWSER_CLI="${AIM_BROWSER_ROOT:-$HOME/aim-browser}/aim-browser.skill/scripts/run.js"

# 1. Start headless CDP daemon (--headless=new, idempotent) + open isolated tab + get single-turn JSON snapshot:
node "$BROWSER_CLI" --start --tab agent-work --open "https://finance.yahoo.com" --snapshot --json

# 2. Type & click inside your leased tab without stealing focus from other tabs:
node "$BROWSER_CLI" --tab agent-work --type 0 "NVDA" --keypress enter --wait 1500 --snapshot --json

# 3. Untrusted web research in a cookie-isolated ephemeral browserContext:
node "$BROWSER_CLI" --tab research-1 --ephemeral --open "https://example.org" --snapshot --json

# 4. Release & close only your leased tab (and dispose ephemeral context if used) when done:
node "$BROWSER_CLI" --release-tab agent-work
```

---

## 3. Zero-VLM Fast Path & Self-Healing Website Maps (`< 5ms`, `0` Vision Tokens)

95% of navigation and layout checks require **zero screenshots or vision models**:

1. **Single-Turn Agent Snapshot (`--snapshot --json`, `< 10ms`):** Returns `{ url, title, elements, layout, consoleErrors, failedRequests, activeDialog, childPopups }` in one call so you see interactive coordinates, JS exceptions, and `4xx/5xx` API failures without multiple shell turns. Use `--elements`, `--content`, or `--content-ax` for lightweight text-only reads.
2. **Popup & Mobile Overflow Math:** Use `--check-occlusion <x> <y>` (`document.elementFromPoint`) to detect modal/cookie blockers and `--check-layout` to detect horizontal CSS overflow deterministically.
3. **Self-Healing Website Maps (`~/.cache/aim-browser/maps/<domain>.json`):**
   On recurring portals or `localhost` apps, record multi-anchor landmarks once so repeat visits run in `< 5ms` and automatically self-heal if CSS classes change:
   ```bash
   # Visit #1 — Record landmarks by element index or CSS selector:
   node "$BROWSER_CLI" --tab clerk --map-record searchInput 0 --map-record submitBtn "#search-btn"

   # Visits #2..N — Auto-heals drifted CSS via ARIA/text/heading anchors & dismisses blocking modals:
   node "$BROWSER_CLI" --tab clerk --url "https://portal.example.com" \
     --map-type searchInput "vasquez" \
     --map-click submitBtn
   ```

---

## 4. CLI Flag Reference (Executed Left → Right)

- **Lifecycle:** `--start` (`--headless=new` default) · `--start-minimized` · `--start-visible` · `--show` · `--minimize` · `--maximize` · `--check` · `--stop`
- **Multi-Tab, Handoff & Ephemeral Leases:** `--tab <lease|new>` · `--ephemeral` · `--actor <name>` · `--session <name>` · `--request-human "<reason>"` · `--clear-human` · `--leases` · `--release-tab <lease>` · `--list` / `--tabs` · `--open <url>` · `--use <index>` · `--close [<index>]`
- **Navigate & Wait:** `--url <url>` · `--wait-ready` · `--wait-selector <css>` · `--wait <ms>` · `--scroll-to-bottom`
- **Discover, Telemetry & Layout Math:** `--snapshot` (`--json`) · `--elements` · `--content` · `--content-ax` · `--html` · `--check-occlusion <x> <y>` · `--check-layout` · `--accept-dialog [<text>]` · `--dismiss-dialog` · `--screenshot <path>` (`--fullpage`)
- **Self-Healing Site Maps:** `--map-record <key> <selector|index>` · `--map-click <key>` · `--map-type <key> <text>` · `--map-show [<domain>]`
- **Interact:** `--click <css|index>` · `--tap <index>` · `--tapxy <x> <y>` · `--taptestid <id>` · `--type <index> <text>` · `--textbox <text>` · `--keytype <text>` · `--keypress <enter|tab|backspace|escape>` · `--keycombo ctrl+enter`
- **Advanced:** `--eval "<js>"` · `--frame <id|main>` · `--block-media` · `--spy <regex>` · `--dlpath <dir>` · `--upload <css> <file>` · `--resize <w> <h>`

## 5. Programmatic Node.js API

```javascript
import {
  AimBrowser,
  startDaemonAsync,
  acquireTabLease,
  recordLandmark,
  actOnLandmark,
} from 'aim-browser';
```
