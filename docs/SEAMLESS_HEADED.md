# Seamless headed Chromium (no desktop interruption)

## The problem

Agents need a **real headed** browser (anti-bot fingerprint, real profile, human-like input).  
Operators need their **primary desktop** free — no Chromium tab jumping over the editor.

Minimized on `DISPLAY=:0` helps but still:

- Steals a taskbar/dock slot  
- Can still flash focus on some WMs  
- Shares the same session cookies surface as “your” interactive browser if the same profile is used  

What you want is closer to: **headed for the web, headless for the human.**

---

## Design goal

| Requirement | Solution class |
|-------------|----------------|
| Real Chrome (not headless spoof) | Headed Chromium binary |
| CDP for agents | `--remote-debugging-port` on loopback |
| Operator not interrupted | **Separate display / VM / compositor** — not your `:0` seat |
| Optional peek | VNC/noVNC, Xephyr window, or `--show` only when asked |

---

## Option ladder (easiest → heaviest)

### 1. Minimized on main display (what we ship today)

```bash
npm run skill -- --start          # default minimized
npm run skill -- --start-visible  # only when you want to watch
```

**Pros:** Zero infra.  
**Cons:** Still lives on your desktop session; not fully “seamless.”

---

### 2. Virtual framebuffer Xvfb (recommended first step) ⭐

Run a **fake X server** offscreen. Chromium is fully headed to X, but nothing draws on your seat.

```bash
# One-time: sudo apt install xvfb
Xvfb :99 -screen 0 1920x1080x24 -ac +extension GLX +render -noreset &
export DISPLAY=:99
export CDP_PORT=9222
export CDP_PROFILE_DIR="$HOME/.cache/aim-browser-profile-xvfb"
export AIM_BROWSER_START_MINIMIZED=0   # no need to minimize; nothing is on your desk

cd /home/kingb/aim-browser
npm run daemon:start
npm run daemon:check
```

Agent pipeline (same CDP API):

```bash
DISPLAY=:99 node aim-browser.skill/scripts/run.js --start --open "https://example.com" --elements
```

**Peek when curious:**

```bash
# optional: x11vnc -display :99 -localhost -rfbport 5900
# then vncviewer localhost:5900  OR  noVNC in a browser
```

**Pros:** Real headed flags, cheap, no VM, CDP unchanged.  
**Cons:** Not a full “desktop OS”; some GPU/WebGL edge cases; audio usually none.

**Wire into skill (future PR):**

```bash
# Conceptual
npm run skill -- --display :99 --start
# or AIM_BROWSER_DISPLAY=:99
```

---

### 3. Nested window (Xephyr) — headed in a box

```bash
# sudo apt install xserver-xephyr
Xephyr :98 -screen 1280x800 &
DISPLAY=:98 openbox &   # or just chromium
DISPLAY=:98 npm run daemon:start
```

You get a **single window** on your desktop that contains the whole agent desktop — only interrupts if you open that window.

**Pros:** Easy mental model.  
**Cons:** Still a rectangle on your seat if mapped.

---

### 4. Dedicated user session / second seat

- Separate Linux user `aim-browser` with its own graphical session or Xvfb unit  
- systemd user service: `aim-browser-cdp.service`  
- Agents only talk to `127.0.0.1:9222`  

**Pros:** Profile isolation (cookies don’t mix with personal Chrome).  
**Cons:** Setup and permissions.

---

### 5. Lightweight VM with GUI (KVM / VirtualBox / cloud desktop)

Full Windows or Linux guest, Chrome inside, CDP tunnel:

```text
Host agent  --SSH local forward-->  guest:9222
```

**Pros:** Strongest isolation; Windows fingerprint if needed.  
**Cons:** RAM/CPU; more moving parts; not “one flag” yet.

---

### 6. Remote headed farm

- Browserless-style CDP endpoints, or scrapers on a small always-on box  
- Agent on your laptop never starts local GUI  

**Pros:** Zero local popup forever.  
**Cons:** Network trust, cost, latency.

---

## What we should *not* do

| Approach | Why not (for this product) |
|----------|----------------------------|
| Pure `--headless=new` as default | Undermines the “real browser” moat thesis |
| `CDP_ADDR=0.0.0.0` | Remote browser takeover risk |
| Shared personal profile on automation | Mixes agent scrapes with your bank/email session |

---

## Recommended product path for aim-browser

### Phase A (done / nearly done)
- Default **minimized** on Operator seat  
- Explicit **watch** flags (`--start-visible`, `--show`)

### Phase B (high value, moderate effort)
1. `AIM_BROWSER_DISPLAY` / `--display :99` passed through daemon + skill  
2. `scripts/xvfb-up.sh` / `xvfb-down.sh` (start Xvfb if missing)  
3. Optional `npm run daemon:start:seamless` = Xvfb + visible-to-X + CDP  
4. Document VNC peek  

### Phase C (isolation)
1. Separate profile dir always for seamless mode  
2. systemd unit under a dedicated user  
3. Optional VM compose file  

---

## Answer to “is seamless headed hard?”

| Layer | Hard? |
|-------|--------|
| Stop covering your desktop (minimize default) | **No** — one env/flag (shipped) |
| Real headed off your seat (Xvfb) | **Low** — one package + `DISPLAY=:99` |
| First-class skill flags + auto Xvfb | **Medium** — a focused ticket |
| Full isolated VM desktop | **Higher** — worth it only if profile/OS fingerprint isolation matters |

**Pragmatic recommendation:**  
Use **minimized by default** day-to-day; implement **Phase B Xvfb “seamless headed”** next so agents stay headed for anti-bot **without ever mapping a window on `:0`**.

---

## Sketch: future skill surface

```bash
# Operator never sees a window
node run.js --seamless --start --open "https://…" --elements

# Expands to roughly:
#   ensure Xvfb on :99
#   DISPLAY=:99 AIM_BROWSER_START_MINIMIZED=0 start.sh
#   CDP on 127.0.0.1:9222
```

No change to `AimBrowser` CDP logic — only **where** the pixels go.
