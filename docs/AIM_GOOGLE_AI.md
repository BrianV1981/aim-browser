# aim-google-ai design notes

Thin skill on **aim-browser**: one job — Google **AI Mode** → answer + sources.

Not **aim-google** (Workspace API CLI).

## Why separate from aim-browser

| aim-browser | aim-google-ai |
|-------------|-----------------|
| Full CDP surface | One verb |
| Many flags | `npm run google-ai -- "query"` |
| Generic engine | Google DOM / wait isolated here |

## URL modes

```text
https://www.google.com/search?q=<query>&udm=50
```

| `udm` | Mode |
|-------|------|
| *(none)* | Default SERP (may include AI Overview) |
| `50` | **AI Mode** |
| `14` | Web-only (no AI Overview) — see **aim-google-web** |

DOM for AI answers is **unstable**. Extraction is heuristic. Prefer `--screenshot` when extract looks empty or wrong.

## Pipeline

```text
start daemon if needed (minimized)
  → open udm=50
  → wait for AI content
  → extract → markdown + ---JSON---
  → optional screenshot
  → stop daemon (default)
```

See `aim-google-ai.skill/SKILL.md` for flags and agent rules.
