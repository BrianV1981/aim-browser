# Security Policy — aim-browser

## Design assumptions

1. **CDP must stay on loopback.** The daemon refuses non-loopback `CDP_ADDR` and fails checks if the listener is not `127.0.0.1` / `::1`. Do not publish port `9222` to the LAN or internet.
2. **The browser profile is high-value.** Default profile: `~/.cache/aim-browser-profile`. It may contain cookies, sessions, and local storage for commercial sites. Treat it like a secret vault; do not commit it.
3. **Full page authority.** `evaluate` / `--eval` and native input can act as the logged-in user. Run only on Operator-approved targets.
4. **`--no-sandbox`** is opt-in via `AIM_BROWSER_NO_SANDBOX=1` and is logged as a warning. Prefer a normal Chromium sandbox.

## Reporting

This repository is **private**. Report vulnerabilities to the Operator (repo owner) out-of-band. Do not open public issues with exploit detail.

## Hardening checklist (operators)

- [ ] Confirm `src/daemon/check.sh` reports loopback-only CDP  
- [ ] Profile dir mode is restrictive (`chmod 700` applied at start)  
- [ ] No reverse-proxy exposes `9222`  
- [ ] Cron jobs use the engine daemon helpers, not ad-hoc `--remote-debugging-address=0.0.0.0`  
