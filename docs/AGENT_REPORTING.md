# Agent reporting — aim-browser skill suite

When reporting live browser/search results (aim-communicate, Operator briefs, multi-agent threads):

## Required fields

```text
FROM: <your vessel/session id>
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
2. Prefer attaching or path-linking **screenshot** when claim is contested.  
3. If skill failed, report stderr message and exit code — do not fill gaps with model knowledge.  
4. Mark `CACHED: yes` when JSON includes `"cached": true`.  
5. Default suite policy: browser was **stopped after session** unless `--keep-open` was used.

## Example

```text
FROM: aim-grok
SKILL: aim-google-news
QUERY_OR_URL: FIFA scores
EXIT: 0
SCREENSHOT: /tmp/aim-google-news-fifa.png
CACHED: no
SUMMARY: Extracted 12 headlines from Google News tbm=nws; top item …
```
