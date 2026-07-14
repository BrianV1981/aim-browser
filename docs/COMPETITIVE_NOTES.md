# Competitive notes — agent / headed browser systems

**Status:** Second-pass research (2026-07-13)  
**Scope:** Product/architecture ideas for **aim-browser** (engine + thin skills).  
**Not in scope:** Business verticals, scoring systems, or deployment playbooks outside this package.

---

## How to read this doc

| Column | Meaning |
|--------|---------|
| **Steal** | Worth implementing (engine or skill) |
| **Adapt** | Good idea; reshape to A.I.M. (minimize, stop-after-session, no LLM-in-engine) |
| **Ignore** | Wrong product shape for us |
| **Out of scope** | Patterns that belong outside this package |

**aim-browser positioning (locked):**

> A **local headed CDP tool** with **one-verb agent skills**.  
> Not a full autonomous browser agent. Not hosted stealth cloud.  
> This package is a generic tool; product-specific workflows live elsewhere.

---

## Landscape map (2026)

```text
                    more autonomous / LLM-in-loop
                              ▲
                              │
              browser-use     │     (full agent loop)
                              │
         Stagehand ───────────┼── hybrid (code + NL act/extract)
                              │
   agent-browser / Playwright │     deterministic CLI + snapshots
                              │
   chrome-devtools-mcp ───────┼── attach/debug + many tools
                              │
   aim-browser (us) ──────────┴── thin CDP + skill verbs (deterministic skills)
                              │
                    less autonomous / no LLM in engine
```

Buckets used by industry roundups:

1. **OSS agent frameworks** — Browser Use, Stagehand, Skyvern, …  
2. **Agent CLIs / MCP** — agent-browser, Playwright MCP, Chrome DevTools MCP  
3. **Managed infra** — Browserbase, Browser Use Cloud, Firecrawl, Steel, …  
4. **Consumer AI browsers** — Comet / Atlas / Dia class (product, not our layer)

We compete (and borrow) in **1–2**. We do **not** need to win **3–4**.

---

## Comparison matrix

| Dimension | aim-browser (today) | browser-use | Stagehand | Chrome DevTools MCP | agent-browser (Vercel) |
|-----------|---------------------|-------------|-----------|---------------------|------------------------|
| **Stars (order)** | small | ~104k | ~23.5k | ~47k | high (Labs) |
| **Lang** | Node ESM | Python | TypeScript | TypeScript (Puppeteer) | Rust CLI + Node |
| **License** | MIT | MIT | MIT | Apache-2.0 | (check repo LICENSE) |
| **Primary user** | A.I.M. agents + Operator | Autonomous agents | Devs shipping workflows | Coding agents (IDE/CLI) | Coding agents |
| **LLM inside product?** | No (skills are deterministic) | Yes (core) | Optional / selective | No (agent brings LLM) | Optional `chat` |
| **Browser mode** | Headed daemon default | Headed/cloud/stealth options | Local or Browserbase | Headed default; headless flag | Headless default; `--headed` |
| **Transport** | Raw CDP (`ws`) | Playwright-class stack | CDP-native direction | Puppeteer + DevTools | CDP CLI daemon |
| **Agent surface** | SKILL.md + `run.js` flags | Python `Agent` + skill install + CLI | `act` / `extract` / `agent` | MCP tools (+ slim mode) | CLI + MCP + skills |
| **Structured extract** | Heuristic (google-ai) | Agent-driven | **Zod schemas** first-class | Snapshots / eval | `get` / `read` / snapshot refs |
| **Session / profile** | Durable `user-data-dir` | Real profile examples + cloud | Profiles via Browserbase/local | Dedicated MCP profile or attach | Profiles, state save, vault |
| **Auth story** | Manual / profile reuse | Profile + cloud captcha | Framework + infra | Attach live Chrome (login once) | Strong: state, vault, allowlist |
| **Captcha / bot** | `solvePerimeterX` hold | Push to cloud stealth | Infra-dependent | Not the product focus | Plugins / providers |
| **Desk / Operator UX** | **Minimize + stop-after-session** | Not a design center | Not a design center | Can attach existing window | Headed opt-in |
| **Monetization** | n/a (tooling) | OSS + Cloud | OSS + Browserbase | Free; Google usage stats opt-out | Free CLI (Vercel ecosystem) |
| **Closest relative to us** | — | Opposite: agent-first | Closest **API taste** | Closest **attach model** | Closest **CLI density** |

---

# Pass 1 targets (issue #7 E4)

## 1. browser-use — [github.com/browser-use/browser-use](https://github.com/browser-use/browser-use)

### Architecture (10 lines)

1. Python library: `Agent(task=…, llm=…)` runs a multi-step loop.  
2. Each step: observe page → LLM chooses action → execute → repeat.  
3. Ships **skills** directory + `browser-use skill install` for coding agents.  
4. Separate **CLI vs library** mental model (one-off agent tasks vs embed in code).  
5. Open-source agent free; **Cloud** sells stealth, proxies, captcha, scale, integrations.  
6. Custom tools via `@tools.action` registration.  
7. Supports real Chrome profile reuse for auth.  
8. Public benchmarks (WebVoyager-class / Odysseys claims) used as marketing.  
9. Optimized hosted models (`ChatBrowserUse` / `bu-*`) for speed.  
10. Explicit production advice: “Chrome is memory-heavy → use our cloud.”

### What they do better than us

- End-to-end **open-ended** web tasks (“fill this application”).  
- Agent install path for Claude Code / Cursor / etc.  
- Narrative: OSS harness, paid reliability layer.  
- Community gravity (stars, examples, demos).

### What we do better (keep)

- **No LLM tax** for known workflows (google-ai is a fixed URL + extract).  
- Operator desk: minimize + **kill browser after session**.  
- Tiny Node CDP surface (no Playwright/Puppeteer dependency).  
- Predictable cost/latency for scheduled skills.

### Five ideas worth stealing

| # | Idea | Map to |
|---|------|--------|
| 1 | **Skill install one-liner** for agent hosts | C1 vessel install script |
| 2 | **CLI vs library** FAQ (“one-off → skill; production → import engine”) | README + each SKILL.md |
| 3 | **Custom tools registration** pattern (extend without forking) | Future engine plugin hooks (low priority) |
| 4 | **OSS vs paid split** (if ever productizing infra) | Private ops later — not now |
| 5 | **Real-profile auth examples** (documented, careful) | B4 login-hold + SECURITY |

### Three things we will *not* become

1. An autonomous multi-step LLM browser agent as the default product.  
2. A captcha/stealth cloud.  
3. A benchmark-chasing WebVoyager competitor.

### Steal / Adapt / Ignore

| | |
|--|--|
| **Steal** | Skill install UX; CLI-vs-library docs |
| **Adapt** | Profile auth examples under login-hold + security warnings |
| **Ignore** | Continuous LLM step loop as core architecture |

---

## 2. Stagehand — [github.com/browserbase/stagehand](https://github.com/browserbase/stagehand)

### Architecture (10 lines)

1. TypeScript **SDK for browser agents** (Python port exists).  
2. Core verbs: **`act`**, **`extract`**, **`agent`** (plus observe-class APIs in docs).  
3. Hybrid: write code when stable; NL when page is unfamiliar.  
4. **`extract(instruction, zodSchema)`** → structured data as first-class.  
5. **Auto-caching / self-healing**: replay without LLM until page breaks.  
6. CDP-oriented engine path (marketed as automation-optimized).  
7. Local browser or **Browserbase** hosted browsers.  
8. `npx create-browser-app` onboarding.  
9. Priority order stated by maintainers: reliability → extensibility → speed → cost.  
10. Monetization: free MIT SDK, paid browser infra.

### What they do better than us

- Cleanest **primitive API** in the category.  
- Schema-validated extraction (production reliability).  
- Cache/replay to cut LLM cost on repeat paths.  
- Clear “code vs NL” story for maintainability.

### What we do better (keep)

- Skills that need **zero LLM** (google-ai wait+scrape).  
- Daemon lifecycle tailored to multi-CLI A.I.M. vessels.  
- Explicit anti-popup Operator policy.

### Five ideas worth stealing

| # | Idea | Map to |
|---|------|--------|
| 1 | **`extract` + schema** for page-fetch / news / maps | A1, A3, B2 JSON contracts |
| 2 | **Cache repeatable extractions** (TTL) | C3 query cache (already planned) |
| 3 | **Self-heal only on failure** (don’t LLM every step) | Optional later; keep default deterministic |
| 4 | **Tiny verb surface** in docs (`open/wait/extract/stop`) | Skill suite naming |
| 5 | **Preview / dry-run** before destructive acts | B3 form-fill `--submit` gate |

### Three things we will *not* become

1. An NL-first automation framework requiring API keys for core paths.  
2. Browserbase-dependent.  
3. A monorepo SDK the size of Stagehand packages/.

### Steal / Adapt / Ignore

| | |
|--|--|
| **Steal** | Schema extract pattern; cache on stable queries |
| **Adapt** | Hybrid only at **skill** layer (optional LLM skill later), not engine |
| **Ignore** | Full `agent.execute` open-ended planner as default |

**Closest API cousin:** Stagehand’s `extract` is the best model for **aim-page-fetch** and structured google-* outputs.

---

## 3. Chrome DevTools MCP — [github.com/ChromeDevTools/chrome-devtools-mcp](https://github.com/ChromeDevTools/chrome-devtools-mcp)

### Architecture (10 lines)

1. MCP server: coding agents get Chrome DevTools power.  
2. Uses **Puppeteer** under the hood for reliable waits/actions.  
3. Default: **start headed Chrome** with a dedicated profile under `~/.cache/…`.  
4. **`--browser-url=http://127.0.0.1:9222`** attach to running instance (Antigravity pattern).  
5. **`--autoConnect`** (Chrome 144+) to user-enabled remote debugging.  
6. **`--slim`**: only ~3 tools (navigate, script, screenshot) to cut token bloat.  
7. Full mode: large tool set (input, network, performance, heap, lighthouse, …).  
8. Category flags to disable tool groups (performance, network, …).  
9. Security: content exposed to MCP client; path restrictions; optional usage stats (opt-out).  
10. Ships **skills/plugins** for Claude/Gemini/etc., not only raw tools.

### What they do better than us

- Ubiquitous **MCP install** across agent IDEs.  
- Attach-to-live-Chrome for “I already logged in.”  
- Slim vs full tool profiles (context budget).  
- Performance/debug tooling we will never own.

### What we do better (keep)

- Smaller, **task-shaped** skills (google-ai) vs 20–50 generic tools.  
- No Puppeteer dependency; pure `ws` CDP.  
- Stop-after-session default (MCP often leaves browser up).  
- Loopback enforcement already in daemon.

### Five ideas worth stealing

| # | Idea | Map to |
|---|------|--------|
| 1 | **`--browser-url` / attach mode** documented as first-class | daemon already is CDP; document `connect` recipes |
| 2 | **Slim tool profile** vs full browser skill | Keep google-ai thin; don’t dump all CDP flags into one skill |
| 3 | **Category toggles** (expose only what skill needs) | Future MCP wrapper optional |
| 4 | **Screenshot defaults that shrink tokens** (jpeg/webp, max width) | A4 screenshot-url + google-ai proof |
| 5 | **Skills + tools together** (plugin install) | C1 vessel install of `*.skill/` |

### Three things we will *not* become

1. A full DevTools/performance suite.  
2. Puppeteer-based (we stay pure CDP unless forced).  
3. Google usage-stats product surface.

### Steal / Adapt / Ignore

| | |
|--|--|
| **Steal** | Slim vs full surface; attach-running-Chrome docs |
| **Adapt** | Optional future `aim-browser-mcp` with **core profile only** |
| **Ignore** | Heap snapshots, Lighthouse-as-core, CrUX |

**Note:** Comparisons claim full Chrome MCP tool schemas can be **huge** (~token heavy). Validates our **one-verb skills** strategy.

---

# Pass 2 — honorable mentions

## 4. agent-browser (Vercel Labs) — [github.com/vercel-labs/agent-browser](https://github.com/vercel-labs/agent-browser)

### Why it matters

- **Rust-native CLI**, agent-first commands.  
- **Accessibility snapshot + `@eN` refs** (click by ref, not brittle CSS).  
- Dense feature set: sessions, profiles, state encryption, auth vault, domain allowlist, action confirmation, MCP profiles, `diff`, `batch`, `read` (markdown-friendly fetch).  
- Default headless; **`--headed`** opt-in (inverse of our default — interesting).  
- `connect` / `--cdp` / `--auto-connect` to existing Chrome.

### Five ideas worth stealing

| # | Idea | Map to |
|---|------|--------|
| 1 | **Snapshot + ref IDs** for interaction | aim-browser skill `--elements` evolution |
| 2 | **Domain allowlist** + action confirm | B3 form-fill safety |
| 3 | **State save/load** + encryption | B4 login-hold / profile hygiene |
| 4 | **`diff snapshot` / `diff url`** | B5 web-diff almost directly |
| 5 | **MCP tool profiles** (`core` vs `all`) | Future MCP; keep core small |
| 6 | **`read` without full browser** when possible | Hybrid: page-fetch HTTP first, browser fallback |
| 7 | **Annotated screenshots** (numbered labels = refs) | A4 + multimodal agents |

### Ignore

- Becoming a 100-command CLI kitchen sink.  
- React DevTools / vitals as product core.

**Closest CLI cousin:** If Stagehand is API taste, agent-browser is **CLI density + safety rails**.

---

## 5. Playwright (+ Playwright MCP)

### Why it matters

- Industrial standard for waits, selectors, multi-browser.  
- MCP/server integrations for coding agents.  
- Accessibility snapshots as agent input (shared idea with agent-browser).  
- Hybrid production pattern: **Playwright for 80% deterministic steps**, AI for 20%.

### Steal / Adapt / Ignore

| | |
|--|--|
| **Steal** | Wait semantics documentation quality; a11y snapshot thinking |
| **Adapt** | “Deterministic skill first, AI only when blocked” = our skill suite philosophy |
| **Ignore** | Adopting Playwright as dependency (conflicts with pure-CDP thesis) |

---

## 6. BrowserOS / agentic Chromium products

### Why it matters

- Product shape: **browser is the agent host** (vs agent drives external Chrome).  
- Privacy-first marketing vs ChatGPT Atlas / Perplexity Comet class.

### Steal / Adapt / Ignore

| | |
|--|--|
| **Steal** | Nothing urgent for aim-browser engine |
| **Adapt** | Seamless headed / isolation narrative (we have SEAMLESS_HEADED.md) |
| **Ignore** | Forking Chromium |

---

## 7. SERP / AI Overview APIs (SerpApi, Bright Data, Scrape.do, Firecrawl, …)

### Why it matters

- Commercial **Google AI Overview / SERP JSON** without local browser.  
- Complements or replaces browser for **high-volume** search.

### Steal / Adapt / Ignore

| | |
|--|--|
| **Steal** | Structured output schemas for AI answers + citations |
| **Adapt** | Optional backend behind google-ai skill later (`--provider serp|live`) — **private config** |
| **Ignore** | Making aim-browser a SERP reseller |

**Positioning:** Live headed AI Mode (`udm=50`) is **qualitatively different** from classic AI Overview APIs; both can coexist. Volume → API; fidelity/Operator desk → aim-google-ai.

---

# Cross-cutting themes (second pass)

## Theme A — Autonomy spectrum

| Approach | Cost | Reliability | aim-browser choice |
|----------|------|-------------|-------------------|
| Full LLM agent each step | High tokens | Variable | **No** as default |
| Hybrid code + NL | Medium | Better | Optional future skill only |
| Deterministic skill verbs | Low | High if maintained | **Yes (default)** |

Industry consensus (2026 blogs): use AI for unknown paths; code for known. **Our skill suite is the “known path” productization.**

## Theme B — Context budget

- Huge MCP tool lists burn tokens (Chrome DevTools MCP full set).  
- Winners offer **slim/core profiles**.  
- **Validation:** many thin skills > one fat browser skill.

## Theme C — Session & auth

Everyone hits the same wall: fresh browsers mean re-login. Patterns:

| Pattern | Who | Our map |
|---------|-----|---------|
| Durable user-data-dir | us, CDT MCP | Already |
| State JSON save/load | agent-browser | B4 / future |
| Attach live logged-in Chrome | CDT MCP, agent-browser | Document + optional |
| Cloud stealth + captcha | browser-use cloud | Out of scope |
| Human login hold | us (planned) | B4 |

## Theme D — Operator desk

Almost **nobody** optimizes for “don’t cover my editor.”  
Our **minimize + re-minimize + stop-after-session** is a real product differentiator for **solo Operator / multi-agent desk**, not for cloud farms.

## Theme E — Monetization patterns (if ever)

| Pattern | Example | For us |
|---------|---------|--------|
| OSS harness + paid browsers | browser-use, Stagehand/Browserbase | Only if productizing infra |
| Free tool, sell agent IDE | Vercel-adjacent | No |
| Free MCP, collect telemetry | Chrome DevTools MCP | Opt-out if we MCP |
| Stay focused local tool | aim-browser | Fits product |

---

# Idea backlog → aim-browser roadmap

Prioritized against issue **#7** workstreams.  
Legend: **E** engine · **S** skill · **G** glue · **X** out of scope

| Priority | Idea | Source | Layer | Ticket map |
|----------|------|--------|-------|------------|
| P0 | Schema-shaped JSON extracts | Stagehand | S | A1–A5 contracts |
| P0 | Query/result TTL cache | Stagehand / us C3 | E/S | C3 |
| P0 | Skill install script for vessels | browser-use | G | C1 |
| P0 | CLI vs import engine docs | browser-use | G | README |
| P1 | Snapshot + ref interaction | agent-browser | E/S | aim-browser.skill |
| P1 | `diff` skill (snapshot/url) | agent-browser | S | B5 |
| P1 | Domain allowlist / confirm submit | agent-browser | S | B3 |
| P1 | Attach/connect docs (`:9222`) | CDT MCP | G | README / SEAMLESS |
| P1 | Slim vs full surface discipline | CDT MCP | S | all skills |
| P1 | Token-cheap screenshots | CDT MCP / agent-browser | S | A4 |
| P2 | State save/load encrypted | agent-browser | E | B4 |
| P2 | Annotated screenshot labels | agent-browser | E | A4 |
| P2 | Optional MCP **core** server | CDT / agent-browser | E | new issue later |
| P2 | HTTP `read` then browser fallback | agent-browser | S | A1 |
| P3 | NL `act` only inside one experimental skill | Stagehand | S | not default |
| — | Stealth cloud / captcha farm | browser-use cloud | X | non-goal |
| — | Full autonomous Agent class | browser-use | — | **non-goal** |

---

# Non-goals (explicit after second pass)

1. **Feature parity** with browser-use, Stagehand, or agent-browser.  
2. **LLM-in-engine** requirement for core skills.  
3. **Hosted browser cloud** as aim-browser’s business.  
4. **Chromium fork** / agentic browser OS.  
5. **SERP API resale** as the primary product path.  
6. Site-specific scrapers or proprietary vertical workflows in this package.

---

# Recommended Operator study path (hands-on)

| Day | Action | Output |
|-----|--------|--------|
| 1 | Skim Stagehand quickstart + `extract` examples | List schema fields we want on page-fetch |
| 2 | Skim agent-browser snapshot/ref + security flags | Notes for `--elements` v2 + form-fill |
| 3 | Install Chrome DevTools MCP **slim** against our `:9222` daemon | Does attach work with aim-browser daemon? |
| 4 | Read browser-use “CLI vs library” + skill install | Draft `scripts/install-skills.sh` |
| 5 | Decide: any P1 engine change before A1 page-fetch? | Comment on #7 |

---

# aim-browser SWOT (honest)

| | |
|--|--|
| **Strengths** | Headed-by-default for real fingerprint; pure CDP; A.I.M. skill packaging; Operator desk policy; google-ai live-proven |
| **Weaknesses** | Tiny community; no schema extract stdlib; no snapshot-ref system; no MCP; no self-heal cache yet |
| **Opportunities** | Skill suite (#7); cache; attach docs; optional slim MCP; best-in-class desk UX |
| **Threats** | Agents standardize on browser-use/CDT MCP and never load our skills; Google DOM churn; ToS/enforcement |

**Strategic bet:** Stay the **best local deterministic headed cog for A.I.M.** Steal schema/cache/safety/install UX. Do not chase autonomous-agent market share.

---

# References (public)

- [browser-use/browser-use](https://github.com/browser-use/browser-use)  
- [browserbase/stagehand](https://github.com/browserbase/stagehand)  
- [ChromeDevTools/chrome-devtools-mcp](https://github.com/ChromeDevTools/chrome-devtools-mcp)  
- [vercel-labs/agent-browser](https://github.com/vercel-labs/agent-browser)  
- Industry comparisons (2026): Firecrawl “best browser agents”, Stagehand vs Browser Use writeups, MCP browser server roundups  
- Internal: `docs/AIM_GOOGLE_AI.md`, `docs/SEAMLESS_HEADED.md`, issue [#7](https://github.com/BrianV1981/aim-browser/issues/7)

---

## Changelog

| Date | Pass | Notes |
|------|------|-------|
| 2026-07-13 | 1 | Top-3 shortlist on issue #7 E4 |
| 2026-07-13 | 2 | This file: deep notes, matrix, pass-2 mentions, idea backlog → #7 |

*Update this file when a hands-on spike changes a Steal/Ignore decision.*
