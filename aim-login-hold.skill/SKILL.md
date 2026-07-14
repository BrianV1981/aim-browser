---
name: aim-login-hold
description: >
  Open a URL and wait for Operator human login or CAPTCHA. Continues when --ready-file is touched
  or URL matches --until-url-includes. Does not capture passwords. Default visible window.
---

# aim-login-hold

```bash
# Operator logs in in the window, then:
#   touch /tmp/aim-login-ready
npm run login-hold -- \
  --url "https://example.com/login" \
  --ready-file /tmp/aim-login-ready \
  --max-wait-ms 300000

# Or wait until redirected:
npm run login-hold -- --url "…" --until-url-includes "/dashboard"
```

## Security

- Never ask the agent to type Operator passwords into logs.
- Profile may retain session cookies — treat `CDP_PROFILE_DIR` as a vault.
- Default **stop-after-session** still applies (cookies saved on disk profile).
