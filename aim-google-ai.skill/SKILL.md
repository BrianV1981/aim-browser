---
name: aim-google-ai
description: >
  Simple A.I.M. skill: run a Google search in AI Mode (udm=50) via aim-browser
  headed CDP, wait for the AI answer, and return structured text + sources.
  Use when the Operator wants Google AI Mode results, not classic blue links only.
---

# aim-google-ai

## Purpose

Thin skill **paired with `aim-browser`**. It does not reimplement CDP.

1. Ensures the headed Chromium daemon is up (minimized by default).  
2. Opens Google **AI Mode**: `https://www.google.com/search?q=…&udm=50`  
3. Waits for the AI response (not just the shell SERP).  
4. Prints **markdown + JSON** (answer text, sources, title, url).

Classic organic SERP without AI: use `aim-browser` with a normal Google URL, or `udm=14` (web-only).

## Prerequisites

- Repo root of **aim-browser** (this monorepo layout), Node 18+, Chromium.  
- Skill lives next to the engine: `aim-google-ai.skill/` + `src/`.

```bash
cd /path/to/aim-browser
npm install
```

## Usage

```bash
# From aim-browser repo root
node aim-google-ai.skill/scripts/run.js "latest live concerts Tampa Bay"

# Explicit flags
node aim-google-ai.skill/scripts/run.js --query "weather Tampa FL" --timeout-ms 90000

# Reuse already-running daemon (default: start if needed, leave running)
node aim-google-ai.skill/scripts/run.js --no-start "best pizza Ybor"

# Stop daemon when finished
node aim-google-ai.skill/scripts/run.js --stop-after "..." 

# Watch mode (show browser window)
node aim-google-ai.skill/scripts/run.js --visible "..."
```

npm convenience (from package root):

```bash
npm run google-ai -- "your query here"
```

## Output

- Human markdown on stdout (answer + source list).  
- Machine block: JSON after `---JSON---` for agents to parse.  
- Optional screenshot: `--screenshot /tmp/google-ai.png`

## Notes for agents

- **Do not** invent search results — always run this skill (or aim-browser) live.  
- Google AI Mode DOM changes often; if extraction is empty, use `--screenshot` and fall back to `--content` via aim-browser.  
- Respect Operator ToS/policy; do not hammer Google.  
- Default window policy matches aim-browser: **minimized** unless `--visible`.  
- Seamless headed (Xvfb): see `docs/SEAMLESS_HEADED.md` + `DISPLAY=:99`.

## Related

| Tool | Role |
|------|------|
| `aim-browser` | General CDP / exploration |
| `aim-google` (Go CLI) | Gmail/Drive/Calendar Workspace API — **not** Search AI Mode |
| `aim-google-ai` | This skill — Search **AI Mode** only |
