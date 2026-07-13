# aim-browser

[![CI](https://github.com/BrianV1981/aim-browser/actions/workflows/ci.yml/badge.svg)](https://github.com/BrianV1981/aim-browser/actions/workflows/ci.yml)

**Persistent headed Chromium CDP engine + agent skill for the A.I.M. ecosystem.**

> **Agent directive:** Prefer a real headed browser over headless spoofing. Enterprise anti-bot stacks fingerprint headless tooling; `aim-browser` attaches to a genuine Desktop Chromium profile over CDP.

| | |
|--|--|
| **Version** | `1.1.0` — see `VERSION` / `VERSION.md` |
| **License** | MIT |
| **Repo** | Private — `BrianV1981/aim-browser` |
| **Preservation freeze** | `preserve/main-pre-professional-cleanup-20260712` @ pre-1.1.0 tip |

---

## Architecture

| Layer | Path | Role |
|-------|------|------|
| **Engine** | `src/cdp-client.js` | Pure Node CDP client (`ws` only — no Puppeteer/Playwright) |
| **Daemon** | `src/daemon/*.sh` | Start/stop/check headed Chromium on **loopback** `:9222` |
| **Skill** | `aim-browser.skill/` | Agent CLI for exploration (`run.js` flag chains) |

```text
Agent skill / cron script
        │
        ▼
   AimBrowser (CDP)
        │  HTTP+WS 127.0.0.1:9222
        ▼
  Headed Chromium + user-data-dir profile
```

### Why headed?

Network/TLS fingerprinting and passive JS challenges (Akamai, Cloudflare, PerimeterX / HUMAN, DataDome) routinely block headless drivers. A minimized real Chrome with a durable profile clears many of those checks without injecting a “stealth” stack into the page.

### Business context (Moat + Delta)

Built for high-value protected sources where bot defense is itself a signal. Daily state change (**delta**) behind a expensive **moat** often maps to commercial intent (e.g. listings leaving market). Use only on Operator-approved targets and within applicable law/ToS.

---

## Quick start

### Requirements

- Node.js **18+**
- Chromium or Google Chrome (`BROWSER_BIN` override supported)
- Linux or WSL with a display session for headed mode

### Install

```bash
git clone https://github.com/BrianV1981/aim-browser.git
cd aim-browser
npm install
```

As a dependency of another private project:

```bash
npm install github:BrianV1981/aim-browser
```

```javascript
import { AimBrowser, startDaemon, stopDaemon, checkDaemon } from 'aim-browser';
```

### Daemon lifecycle

```bash
npm run daemon:start   # headed Chromium, loopback CDP
npm run daemon:check   # fail if not loopback / not healthy
npm run daemon:stop    # kill only matching profile+port
```

Environment (selected):

| Variable | Default | Notes |
|----------|---------|--------|
| `CDP_PORT` | `9222` | |
| `CDP_ADDR` | `127.0.0.1` | Non-loopback **refused** |
| `CDP_PROFILE_DIR` | `~/.cache/aim-browser-profile` | Treat as sensitive |
| `BROWSER_BIN` | auto-detect | |
| `AIM_BROWSER_START_MINIMIZED` | `1` | |
| `AIM_BROWSER_NO_SANDBOX` | `0` | Opt-in only |

### Engine example

```javascript
import { AimBrowser, startDaemon, stopDaemon } from 'aim-browser';

startDaemon();
const browser = new AimBrowser();
await browser.connect();
await browser.send('Page.enable');

const tab = await browser.openTab('https://example.com');
await browser.connect(tab.id);
await browser.waitReady();
await browser.solvePerimeterX(); // no-op if captcha absent

const axTree = await browser.getAccessibilityTree();
console.log(axTree);

await browser.closeTab(tab.id);
await browser.close();
stopDaemon();
```

### Agent skill CLI

```bash
npm run skill -- --start --open "https://example.com" --elements
# or:
node aim-browser.skill/scripts/run.js --check
```

Full flag reference: `aim-browser.skill/SKILL.md`.

**Multi-CLI skill install:** link/copy `aim-browser.skill/` into Gemini/AGY, Grok (`.grok/skills/`), or OpenCode (`.opencode/skills/`) skill roots. Preserve YAML frontmatter.

---

## Testing

```bash
npm test
```

Unit tests mock `fetch` and `ws` — no local Chromium required.  
TDD mandate: change `AimBrowser` only with matching updates in `tests/cdp-client.test.js`.

---

## Security

See **`SECURITY.md`**. Summary:

- CDP must remain **loopback-only**
- Profile directory may hold live sessions — do not commit or share casually
- `--eval` / skill flags have full page authority of the profile user

---

## Versioning & preservation

| File | Role |
|------|------|
| `VERSION` | Single-line semver |
| `VERSION.md` | Control log + preservation branches |
| `CHANGELOG.md` | Release notes |

Large cleanups freeze `master` first, e.g.  
`preserve/main-pre-professional-cleanup-20260712`.

---

## A.I.M. ecosystem

Part of **A.I.M. (Actual Intelligent Memory)** agent tooling:

- Flagship engine: [aim-agy](https://github.com/BrianV1981/aim-agy)  
- Related vessels: aim-grok, aim-opencode, aim-connect  
- Historical root (frozen): [aim](https://github.com/BrianV1981/aim)

---

## Support

☕ [Buy Me a Coffee](https://buymeacoffee.com/brianv1981)

MIT © BrianV1981
