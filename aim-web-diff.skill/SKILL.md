---
name: aim-web-diff
description: >
  Snapshot page main text twice (interval) or compare to baseline JSON. Exit 0=unchanged, 2=changed, 1=error.
  Uses aim-browser headed CDP. Stop-after-session default.
---

# aim-web-diff

```bash
# Establish baseline
npm run web-diff -- --url "https://example.com" --save-baseline /tmp/ex-base.json

# Compare later
npm run web-diff -- --url "https://example.com" --baseline /tmp/ex-base.json
echo $?   # 0 same, 2 changed

# Two captures in one run
npm run web-diff -- --url "https://example.com" --interval-ms 5000
```
