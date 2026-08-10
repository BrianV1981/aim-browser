# aim-browser

[![CI](https://github.com/BrianV1981/aim-browser/actions/workflows/ci.yml/badge.svg)](https://github.com/BrianV1981/aim-browser/actions/workflows/ci.yml)
[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-support%20solo%20dev-FFDD00?style=flat&logo=buy-me-a-coffee&logoColor=black)](https://www.buymeacoffee.com/BrianV1981)

**Headed Chromium CDP engine + thin agent skill suite for A.I.M.**  
Version **1.3.1** · MIT · `BrianV1981/aim-browser`  
**Suite name:** *aim-browser skill suite* (see `docs/SKILL_SUITE.md`)

---

## Built by one person — not a SaaS

> **I am a solo developer.** No corporate budget, no VC runway, no product team. I build and share so more of us can **own our stacks** instead of renting every layer until the terms change.

**Slogans I actually mean:**

| | |
|--|--|
| **Own your stack.** | Open source is the answer when the alternative is another meter, seat, or gate. |
| **Ask, don’t thrash.** | A.I.M. agents should *ask* (Operator, tools, memory) instead of thrashing the project until something sticks. |

If that resonates, a coffee helps more than you might think:

<p align="center">
  <a href="https://www.buymeacoffee.com/BrianV1981" target="_blank" rel="noopener noreferrer">
    <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" height="50" />
  </a>
</p>

**Why this exists as open source (the short version):**

- **Paywall fatigue is real.** Build a stack, get comfortable, then watch the good parts get metered, locked, or re-skinned as a new plan.
- **I have felt that rug-pull.** I am not alone. Plenty of us have woken up to news that a daily pipeline was changed, gated, or effectively taken away—not because we failed, but because someone else’s product roadmap moved. When a workflow you relied on stops being *yours*, you rebuild. That is why I care about **portable tools and skills** that live on *your* machine, not one vendor’s property.
- **Micro-transactions add up.** “Just $X/seat/month” times every CLI, host, model, and dashboard is how independence dies by a thousand cuts.
- **Hope, not hype.** Share the wrenches. Keep the soul of the stack local. Optional coffee is not a paywall—it is how a solo builder keeps shipping without turning every repo into a trap.

MIT means you can fork, self-host, and walk away with the code. Coffee is optional gratitude, never required access.

---

## Agent: read this first

This README is the **operator manual for agents**. Humans can skim it; **you (the agent) must follow it** when browsing, searching, or extracting from the live web via this package.

| Rule | Do |
|------|-----|
| **1. Prefer a skill over the raw engine** | One-verb skills (`google-ai`, …) for known jobs; full `skill` CLI only for exploration |
| **2. Never invent web results** | Always run a skill or engine live; cite screenshot paths when available |
| **3. Headed, not headless** | Use the daemon / skill starters — do not spawn ad-hoc headless Chrome for these workflows |
| **4. Stay off the Operator desk** | Default is **minimized**; re-minimize after tab open; **stop Chromium after the session** |
| **5. Loopback only** | CDP on `127.0.0.1` only — never expose the debug port |
| **6. Operator-approved targets only** | Respect ToS, law, and Operator policy; no credential theft; no hammering Google |

**Taxonomy**

```text
aim-browser          = TOOL (engine + daemon)
  └── *.skill/       = SKILLS (how agents should call the tool)
```

- **Engine** = importable CDP API for production scripts  
- **Skill** = short playbook + CLI an agent loads for one job  

---

## Which skill do I use? (decision tree)

```text
Need Google AI Mode answer (conversational)? ──► aim-google-ai      npm run google-ai
Need classic blue links / web-only SERP?     ──► aim-google-web     npm run google-web
Need news headlines?                         ──► aim-google-news    npm run google-news
Need main text from a known URL?             ──► aim-page-fetch     npm run page-fetch
Need PNG proof of a URL?                     ──► aim-screenshot-url npm run screenshot-url
Need YouTube title/channel/meta?             ──► aim-youtube-meta   npm run youtube-meta
Need multi-turn AI Mode chat?                ──► aim-google-ai-chat npm run google-ai-chat
Need Maps place card?                        ──► aim-maps-place     npm run maps-place
Need allowlisted form fill?                  ──► aim-form-fill      npm run form-fill
Need Operator to log in, then continue?      ──► aim-login-hold     npm run login-hold
Need page text diff / change detect?         ──► aim-web-diff       npm run web-diff
Explore DOM / click / eval / PX hold?        ──► aim-browser skill  npm run skill
Build a long-running custom job?             ──► import engine from 'aim-browser'
Gmail / Drive / Calendar API?                ──► NOT this package → aim-google (Workspace CLI)
```

---

## Skills matrix (suite status)

| Skill | Status | Agent command (from repo root) | One job | Full playbook |
|-------|--------|--------------------------------|---------|----------------|
| **aim-browser** | **shipping** | `npm run skill -- <flags…>` | Explore tabs, DOM, input, screenshots | `aim-browser.skill/SKILL.md` |
| **aim-google-ai** | **shipping** | `npm run google-ai -- "query"` | Google **AI Mode** (`udm=50`) | `aim-google-ai.skill/SKILL.md` |
| **aim-page-fetch** | **shipping** | `npm run page-fetch -- <url>` | URL → main text + meta | `aim-page-fetch.skill/SKILL.md` |
| **aim-google-web** | **shipping** | `npm run google-web -- "q"` | Classic SERP `udm=14` | `aim-google-web.skill/SKILL.md` |
| **aim-google-news** | **shipping** | `npm run google-news -- "q"` | News headlines | `aim-google-news.skill/SKILL.md` |
| **aim-screenshot-url** | **shipping** | `npm run screenshot-url -- <url>` | URL → PNG | `aim-screenshot-url.skill/SKILL.md` |
| **aim-youtube-meta** | **shipping** | `npm run youtube-meta -- <url\|id>` | YT metadata | `aim-youtube-meta.skill/SKILL.md` |
| **aim-google-ai-chat** | **shipping** | `npm run google-ai-chat -- "q" --follow-up "…"` | Multi-turn AI Mode | `aim-google-ai-chat.skill/SKILL.md` |
| **aim-maps-place** | **shipping** | `npm run maps-place -- "place"` | Maps place card | `aim-maps-place.skill/SKILL.md` |
| **aim-form-fill** | **shipping** | `npm run form-fill -- --allow-host …` | Allowlisted fill | `aim-form-fill.skill/SKILL.md` |
| **aim-login-hold** | **shipping** | `npm run login-hold -- --ready-file …` | Human login gate | `aim-login-hold.skill/SKILL.md` |
| **aim-web-diff** | **shipping** | `npm run web-diff -- --url …` | Snapshot diff | `aim-web-diff.skill/SKILL.md` |

Status board (what ships vs planned): `docs/SKILL_SUITE.md`

### Install skills into a vessel

From this **package root**, install creates host folders named by skill id (**no** `.skill` suffix), e.g. `aim-google-ai/`, not `aim-google-ai.skill/`.

```bash
cd /path/to/aim-browser
npm install

# Grok — user-global
npm run install-skills -- "${HOME}/.grok/skills" --mode symlink
# Grok — project-local
npm run install-skills -- /path/to/project/.grok/skills --mode symlink

# AGY / Antigravity — user-global
npm run install-skills -- "${HOME}/.gemini/antigravity-cli/skills" --mode symlink
# AGY — project-local
npm run install-skills -- /path/to/project/.gemini/skills --mode symlink

# OpenCode
npm run install-skills -- /path/to/project/.opencode/skills --mode symlink
```

Dual-vessel policy: [`docs/VESSEL_DUAL_COMPAT.md`](docs/VESSEL_DUAL_COMPAT.md).

**Engine root:** run skill CLIs from this package root, or set `AIM_BROWSER_ROOT` to it so `src/` resolves.

---

## Standing Operator policies (every skill)

Agents **must** honor these unless the Operator overrides in-chat.

| Policy | Default | Override |
|--------|---------|----------|
| Window | **Minimized** (do not cover the desk) | `--visible` / `--start-visible` / `AIM_BROWSER_START_MINIMIZED=0` |
| After new tab | **Re-minimize** (Chrome often un-minimizes on `/json/new`) | only if `--visible` |
| After skill session | **Stop daemon / close Chromium** | `--keep-open` / `--no-stop` |
| CDP bind | `127.0.0.1` only | none — non-loopback refused |
| Profile | `~/.cache/aim-browser-profile` (sensitive) | `CDP_PROFILE_DIR` |
| Results | Live only — no fabrication | — |

**Seamless headed** (real Chrome, zero window on `:0`): see `docs/SEAMLESS_HEADED.md` (`DISPLAY=:99` / Xvfb).

---

## Prerequisites (before any skill)

1. **cwd** = aim-browser **repo root** (or install that includes `src/` + `*.skill/`).  
2. Node.js **18+**, `npm install` done.  
3. Chromium/Chrome available (`BROWSER_BIN` if nonstandard).  
4. Display for headed mode (Operator seat or Xvfb).  

```bash
cd /path/to/aim-browser
npm install
```

### Install skills into agent hosts

| Host | User-global | Project-local |
|------|-------------|-----------------|
| **Grok** | `~/.grok/skills/aim-google-ai/` | `<project>/.grok/skills/…` |
| **AGY** | `~/.gemini/antigravity-cli/skills/…` | `<project>/.gemini/skills/…` |
| **OpenCode** | — | `<project>/.opencode/skills/…` |

Always run CLIs from the **aim-browser package root** (or set `AIM_BROWSER_ROOT`) so relative imports to `src/` resolve.

### Design rules (packaging)

1. No machine-local absolute homes or operator usernames in skills/docs.  
2. Install dest name = skill id (strip source `.skill` suffix).  
3. Dual vessel: keep Grok **and** AGY install examples.  
4. Prefer `$HOME` / `~` / `/path/to/…` in docs.
---

## How to run — shipping skills

### A. Google AI Mode (`aim-google-ai`) — preferred for “what does Google AI say?”

```bash
# Standard: start minimized → answer → screenshot optional → STOP daemon
npm run google-ai -- "your query here"

# With proof artifact for reports
npm run google-ai -- --screenshot /tmp/aim-google-ai.png --timeout-ms 120000 "your query"

# Custom CDP port (if 9222 busy)
npm run google-ai -- --port 9333 "your query"

# Leave browser up for a second query in the same session
npm run google-ai -- --keep-open "first query"
npm run google-ai -- --no-start --keep-open "follow-up"   # still default-stop unless keep-open
npm run daemon:stop   # when finished with keep-open chains
```

**Agent parsing**

1. Stderr = progress (`Starting…`, `Stopping daemon…`).  
2. Stdout = markdown answer + sources.  
3. After `---JSON---` = machine JSON: `{ query, title, url, answer, sources[], screenshot? }`.  
4. Exit `0` = success; non-zero = fatal (daemon still stopped if stop-after default).  

**Do not**

- Invent an AI Mode answer without running this.  
- Leave Chromium running after a one-shot (default already stops — don’t pass `--keep-open` casually).  
- Confuse with **aim-google** (Gmail/Drive API).  

Full flags: `aim-google-ai.skill/SKILL.md`.

---

### B. General exploration (`aim-browser` skill) — DOM / click / eval

Flags run **left → right** and keep tab state.

```bash
# Health
npm run skill -- --check

# Start minimized daemon, open page, list interactables
npm run skill -- --start --open "https://example.com" --elements

# Content / screenshot
npm run skill -- --url "https://example.com" --content --screenshot /tmp/page.png

# Stop when you started with --keep-style long sessions
npm run skill -- --stop
# or
npm run daemon:stop
```

**Common flag groups** (see `aim-browser.skill/SKILL.md` for full list):

| Intent | Flags |
|--------|--------|
| Lifecycle | `--start`, `--start-visible`, `--show`, `--minimize`, `--check`, `--stop` |
| Tabs | `--open <url>`, `--list`, `--use <i>`, `--close` |
| Wait | `--wait-ready`, `--wait-selector <css>`, `--wait <ms>` |
| Discover | `--elements`, `--content`, `--content-ax`, `--html` |
| Act | `--click`, `--type`, `--keypress`, `--eval` |
| Proof | `--screenshot <path>` |
| Captcha assist | `--solve-px` (PerimeterX-style press-and-hold; best-effort) |

**When to use this vs google-ai**

| Situation | Use |
|-----------|-----|
| Need AI Mode narrative + sources | `google-ai` |
| Need to inspect a specific URL’s DOM | `skill` |
| Building a new extractor before a thin skill exists | `skill` then graduate to skill script |
| Production cron with fixed steps | **import engine** (below), not ad-hoc flag soup |

---

### C. Daemon only (shared lifecycle)

```bash
npm run daemon:start   # minimized headed Chromium, CDP loopback
npm run daemon:check
npm run daemon:stop
```

Skills call this for you when needed. Prefer skill entrypoints over manual daemon juggling unless debugging.

---

## How to report results (aim-communicate / Operator)

When another agent or the Operator needs proof:

```text
FROM: <your session>
REPLY_TO: <theirs if any>
SKILL: aim-google-ai | aim-browser | …
QUERY_OR_URL: …
EXIT: 0|n
SCREENSHOT: /tmp/….png   (if taken)
SUMMARY: <2–5 lines from answer, no fabrication>
```

Attach or path-reference the screenshot file. Prefer quoting JSON `answer` / `sources` over paraphrasing if contested.

---

## Engine import (production scripts — not first choice for chat agents)

Use when you are writing a **durable script**, not answering a one-off Operator question.

```javascript
import { AimBrowser, startDaemon, stopDaemon, checkDaemon } from 'aim-browser';

startDaemon(); // minimized by default
const browser = new AimBrowser();
try {
  await browser.connect();
  const tab = await browser.openTab('https://example.com');
  await browser.connect(tab.id);
  await browser.waitReady();
  await browser.minimizeWindow().catch(() => {});
  // … evaluate / screenshot / etc.
} finally {
  await browser.close().catch(() => {});
  stopDaemon(); // always clean up unless Operator wants a long-lived daemon
}
```

API surface: `src/cdp-client.js` / `src/index.js`.  
Tests: `npm test` (mocked CDP — no Chrome required).

---

## Configuration (env)

| Variable | Default | Agent note |
|----------|---------|------------|
| `CDP_PORT` | `9222` | Use another port if busy; pass `--port` to skills |
| `CDP_ADDR` | `127.0.0.1` | Non-loopback **refused** |
| `CDP_PROFILE_DIR` | `~/.cache/aim-browser-profile` | Cookies/sessions — treat as secret vault |
| `BROWSER_BIN` | auto | Override Chromium path |
| `AIM_BROWSER_START_MINIMIZED` | `1` | `0` = start visible |
| `DISPLAY` | session | Set to Xvfb display for seamless headed |
| `AIM_BROWSER_NO_SANDBOX` | `0` | Opt-in only; prefer sandboxed Chrome |

---

## Architecture (short)

```text
  Agent loads SKILL.md  ──►  npm run <skill> / node *.skill/scripts/run.js
                                    │
                                    ▼
                           startDaemon() if needed (minimized)
                                    │
                                    ▼
                           AimBrowser  ──CDP ws──►  headed Chromium
                                    │
                                    ▼
                           extract / screenshot / markdown+JSON
                                    │
                                    ▼
                           stopDaemon() by default (close session)
```

| Layer | Path |
|-------|------|
| Engine | `src/cdp-client.js`, `src/index.js` |
| Daemon | `src/daemon/{start,stop,check}.sh` |
| Skills | `aim-*.skill/` (see matrix above) |

Pure Node CDP (`ws` only) — **no** Puppeteer/Playwright dependency.

---

## Security (mandatory)

See **`SECURITY.md`**.

- CDP **loopback only**  
- Profile dir may contain live logins — do not commit, copy, or log secrets  
- `--eval` and skill actions run **as the profile user**  
- form-fill / login-hold (planned) require allowlists and Operator awareness  

---

## Docs map (deeper reading)

| Doc | When an agent opens it |
|-----|------------------------|
| `aim-google-ai.skill/SKILL.md` | Running AI Mode search |
| `aim-browser.skill/SKILL.md` | Full flag reference / exploration |
| `docs/SKILL_SUITE.md` | Suite name + status board |
| `docs/AGENT_REPORTING.md` | FROM/SKILL/SCREENSHOT report template |
| `docs/AIM_GOOGLE_AI.md` | AI Mode URL design (`udm=50` / `udm=14`) |
| `docs/SEAMLESS_HEADED.md` | Xvfb / off-desk headed |
| `docs/COMPETITIVE_NOTES.md` | Engineering research only — not runtime procedure |
| `SECURITY.md` | Threat model / hardening |

---

## What this package is **not**

| Not | Use instead |
|-----|-------------|
| Autonomous LLM “browser agent” (browser-use shape) | Deterministic skills here + your agent’s reasoning |
| Gmail/Drive/Calendar API | **aim-google** Workspace CLI |
| Hosted stealth/captcha cloud | Out of scope |
| Excuse to skip Operator policy / ToS | — |

---

## Versioning

| File | Role |
|------|------|
| `VERSION` | Semver line |
| `package.json` → `version` | npm |
| `VERSION.md` / `CHANGELOG.md` | Narrative |

Current: **1.3.1**.

---

## Support

Solo-built. No corporate dollars. Optional coffee if this saved you a subscription or a rug-pull:

**[Buy Me a Coffee →](https://www.buymeacoffee.com/BrianV1981)**

---

<!-- AIM_ECOSYSTEM_START -->
### 🧬 The A.I.M. Ecosystem

Modular A.I.M. (Actual Intelligent Memory) repositories. **Flagship engine: [aim-agy](https://github.com/BrianV1981/aim-agy).**

**Active vessels (CLI hosts):**
- **[aim-agy](https://github.com/BrianV1981/aim-agy)** — Core engine / *soul* (Antigravity CLI). *Flagship.* Shared nested `aim-agy_os/` ships here first.
- **[aim-grok](https://github.com/BrianV1981/aim-grok)** — Grok CLI vessel (hybrid memory, GitOps, wiki, fleet orchestration tooling).
- **[aim-opencode](https://github.com/BrianV1981/aim-opencode)** — OpenCode CLI vessel.
- **[aim-codex](https://github.com/BrianV1981/aim-codex)** — OpenAI Codex CLI vessel (greenfield nested soul + Codex overlays; primary `main`).

**Tools & workspaces:**
- **[aim-connect](https://github.com/BrianV1981/aim-connect)** — Self-hosted remote workspace web UI.
- **[aim-tmux-dashboard](https://github.com/BrianV1981/aim-tmux-dashboard)** — Terminal multi-session monitor.
- **[aim-browser](https://github.com/BrianV1981/aim-browser)** — Headed Chromium CDP engine + browser **skill suite**.
- **[aim-google](https://github.com/BrianV1981/aim-google)** — Google Workspace CLI (Gmail, Drive, Calendar, …).
- **[aim-flight-recorder](https://github.com/BrianV1981/aim-flight-recorder)** — Forensic Markdown session extractor.
- **[aim-boardroom](https://github.com/BrianV1981/aim-boardroom)** — Multi-agent orchestration room (OS multiplexing + artifacts).
- **[aim-skills](https://github.com/BrianV1981/aim-skills)** — **Skills index / multi-CLI install registry** (agy, grok, opencode, codex).

**DNA, comms & lore:**
- **[aim-coagents](https://github.com/BrianV1981/aim-coagents)** — DNA bank for sovereign co-agent blueprints.
- **[aim-knowledge](https://github.com/BrianV1981/aim-knowledge)** — Public Obsidian vault / deep-lore archive.
- **[aim-chalkboard](https://github.com/BrianV1981/aim-chalkboard)** — Optional cross-host async git mailbox (PoC; default same-host comms = **aim-communicate** skill).

**Deprecated / not maintained:**
- **[aim](https://github.com/BrianV1981/aim)** — Original **Gemini CLI** framework. Deprecated after loss of practical subscription access; **Great Migration → aim-agy**.
- **[aim-swarm](https://github.com/BrianV1981/aim-swarm)** — Legacy Python swarm factory → use **aim-coagents** + aim-agy spawn.
- **aim-claude / Anthropic-line vessels** — **Done.** Operator does not develop against Anthropic. Use **aim-agy / aim-grok / aim-opencode / aim-codex**.

Full map: see **aim-skills** `docs/AIM_ECOSYSTEM_MAP.md` or Operator artifact `AIM_ECOSYSTEM_MAP.md`.
<!-- AIM_ECOSYSTEM_END -->

