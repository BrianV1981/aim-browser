# Agent reporting — aim-browser skill suite

When reporting live browser/search results to an Operator or another agent:

## Required fields

```text
FROM: <your session / vessel id>
REPLY_TO: <parent session if any>
SKILL: aim-google-ai | aim-page-fetch | aim-google-web | …
QUERY_OR_URL: <exact input>
EXIT: 0 | n
SCREENSHOT: </absolute/path.png or none>
CACHED: yes|no
SUMMARY: <2–5 lines grounded in skill output only>
```

## Rules

1. **Never invent** titles, scores, addresses, or AI answers — only quote skill stdout/JSON.  
2. Prefer a **screenshot** path when the claim is contested.  
3. On failure: report stderr + exit code — do not fill gaps with model knowledge.  
4. Mark `CACHED: yes` when JSON includes `"cached": true`.  
5. Suite default: Chromium **stopped after session** unless `--keep-open` was used.

## Example

```text
FROM: my-orchestrator
SKILL: aim-google-news
QUERY_OR_URL: open source agent browser
EXIT: 0
SCREENSHOT: /tmp/aim-google-news.png
CACHED: no
SUMMARY: Extracted headlines from Google News; top item …
```
