# aim-google-ai — brainstorm & design

## Idea

Pair **aim-browser** (headed CDP) with a **tiny skill** that only does one job:

> Run a Google query in **AI Mode** and return the AI answer + sources.

Name: **`aim-google-ai`** (skill folder: `aim-google-ai.skill/`).

Not to be confused with **`aim-google`** (Go CLI for Gmail/Drive/Calendar Workspace APIs).

---

## Why a separate skill?

| Concern | aim-browser | aim-google-ai |
|---------|-------------|-----------------|
| Surface area | Full CDP Swiss army knife | One verb: search AI Mode |
| Agent UX | Many flags | `run.js "query"` |
| Prompt bloat | Large SKILL.md | Small SKILL.md |
| Evolution | Engine stays generic | Google DOM hacks isolated here |

Agents that only need “what does Google AI Mode say?” should not load the full browser skill.

---

## How Google AI Mode is addressed

Public URL pattern (as of mid‑2026):

```text
https://www.google.com/search?q=<query>&udm=50
```

| `udm` | Mode |
|-------|------|
| *(none)* | Default SERP (may include AI Overview) |
| `50` | **AI Mode** (conversational AI search) |
| `14` | Web results without AI Overview (opposite use case) |

DOM for the AI answer is **unstable**. Extraction is heuristic (main text + external links). Always allow `--screenshot` for debugging.

---

## Pipeline

```text
aim-google-ai
    │  start daemon if needed (minimized by default)
    ▼
aim-browser AimBrowser  ──CDP──►  headed Chromium
    │
    ▼
open udm=50 URL → wait for answer (not "Thinking…") → extract → markdown+JSON
```

Fits **seamless headed** later: same skill, `DISPLAY=:99` / `--seamless` (see `SEAMLESS_HEADED.md`).

---

## Future enhancements (not in v0)

1. Multi-turn AI Mode follow-ups (type into AI Mode chat box).  
2. Structured “citations only” mode.  
3. Region/language flags (`hl`, `gl`).  
4. Rate-limit / cache layer for Operator costs.  
5. Standalone mini-repo if packaging separate from aim-browser is needed.  
6. Wire into aim-communicate reports: agents cite live AI Mode answers with screenshot paths.

---

## Install into agent hosts

```bash
# Example Grok
cp -a aim-google-ai.skill /path/to/project/.grok/skills/aim-google-ai

# Example OpenCode
cp -a aim-google-ai.skill /path/to/project/.opencode/skills/aim-google-ai
```

Skill expects to run with cwd or relative import to aim-browser `src/` (current layout: sibling under same repo).
