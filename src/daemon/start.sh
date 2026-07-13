#!/usr/bin/env bash
set -euo pipefail

CDP_PORT="${CDP_PORT:-9222}"
CDP_ADDR="${CDP_ADDR:-127.0.0.1}"
CDP_PROFILE_DIR="${CDP_PROFILE_DIR:-$HOME/.cache/aim-browser-profile}"
CDP_LOG_FILE="${CDP_LOG_FILE:-$HOME/.cache/aim-browser-profile/logs/cdp.log}"
BROWSER_BIN="${BROWSER_BIN:-}"
PID_FILE="$CDP_PROFILE_DIR/.aim-browser-cdp.pid"

if [[ "$CDP_ADDR" != "127.0.0.1" && "$CDP_ADDR" != "::1" && "$CDP_ADDR" != "localhost" ]]; then
  echo "[aim-browser] Refusing non-loopback CDP_ADDR='$CDP_ADDR' (must be 127.0.0.1, ::1, or localhost)" >&2
  exit 1
fi

# Chromium expects an IP for --remote-debugging-address.
if [[ "$CDP_ADDR" == "localhost" ]]; then
  CDP_ADDR="127.0.0.1"
fi

if [[ -z "$BROWSER_BIN" ]]; then
  for candidate in chromium-browser chromium google-chrome google-chrome-stable chrome; do
    if command -v "$candidate" >/dev/null 2>&1; then
      BROWSER_BIN="$candidate"
      break
    fi
  done
fi

if [[ -z "$BROWSER_BIN" ]]; then
  echo "[aim-browser] No Chromium/Chrome binary found. Install one or set BROWSER_BIN." >&2
  exit 1
fi

# Desktop session environment handling.
# - Under WSL/WSLg, inject the common defaults if missing.
# - Under native Linux, preserve the existing session env and only fill conservative gaps.
if grep -qiE '(microsoft|wsl)' /proc/version 2>/dev/null; then
  export DISPLAY="${DISPLAY:-:0}"
  export WAYLAND_DISPLAY="${WAYLAND_DISPLAY:-wayland-0}"
  export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
else
  export DISPLAY="${DISPLAY:-:0}"
  export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
  if [[ -z "${DBUS_SESSION_BUS_ADDRESS:-}" && -S "$XDG_RUNTIME_DIR/bus" ]]; then
    export DBUS_SESSION_BUS_ADDRESS="unix:path=$XDG_RUNTIME_DIR/bus"
  fi
  if [[ -z "${XAUTHORITY:-}" && -f "$XDG_RUNTIME_DIR/gdm/Xauthority" ]]; then
    export XAUTHORITY="$XDG_RUNTIME_DIR/gdm/Xauthority"
  fi
fi

mkdir -p "$CDP_PROFILE_DIR" "$(dirname "$CDP_LOG_FILE")"
chmod 700 "$CDP_PROFILE_DIR" || true

# Remove stale lock artifacts from prior unclean exits.
rm -f "$CDP_PROFILE_DIR"/Singleton* 2>/dev/null || true

# Fail closed if anything already owns the target port.
EXISTING_LINE="$(ss -H -lntp "sport = :$CDP_PORT" 2>/dev/null | head -n 1 || true)"
if [[ -n "$EXISTING_LINE" ]]; then
  EXISTING_LOCAL="$(awk '{print $4}' <<<"$EXISTING_LINE")"
  echo "[aim-browser] Refusing to start: port :$CDP_PORT already in use by '$EXISTING_LOCAL'" >&2
  echo "[aim-browser] Existing listener: $EXISTING_LINE" >&2
  exit 1
fi

EXTRA_FLAGS=()
if [[ "${AIM_BROWSER_NO_SANDBOX:-0}" == "1" ]]; then
  echo "[aim-browser] WARNING: launching with --no-sandbox (AIM_BROWSER_NO_SANDBOX=1)" >&2
  EXTRA_FLAGS+=(--no-sandbox)
fi
# Default VISIBLE so Operator/agents can watch the pipeline.
# Cron/headless-host: AIM_BROWSER_START_MINIMIZED=1 or skill flag --start-minimized
if [[ "${AIM_BROWSER_START_MINIMIZED:-0}" == "1" ]]; then
  echo "[aim-browser] Starting minimized (AIM_BROWSER_START_MINIMIZED=1)" >&2
  EXTRA_FLAGS+=(--start-minimized)
else
  echo "[aim-browser] Starting visible (set AIM_BROWSER_START_MINIMIZED=1 to hide)" >&2
fi


LAUNCH_ATTACHED="${AIM_BROWSER_LAUNCH_ATTACHED:-0}"
if [[ "$LAUNCH_ATTACHED" == "1" ]]; then
  "$BROWSER_BIN" \
    "${EXTRA_FLAGS[@]}" \
    --disable-dev-shm-usage \
    --remote-debugging-address="$CDP_ADDR" \
    --remote-debugging-port="$CDP_PORT" \
    --user-data-dir="$CDP_PROFILE_DIR" \
    --no-first-run \
    --no-default-browser-check \
    about:blank \
    >"$CDP_LOG_FILE" 2>&1 &
else
  nohup "$BROWSER_BIN" \
    "${EXTRA_FLAGS[@]}" \
    --disable-dev-shm-usage \
    --remote-debugging-address="$CDP_ADDR" \
    --remote-debugging-port="$CDP_PORT" \
    --user-data-dir="$CDP_PROFILE_DIR" \
    --no-first-run \
    --no-default-browser-check \
    about:blank \
    >"$CDP_LOG_FILE" 2>&1 &
fi

BROWSER_PID=$!
echo "$BROWSER_PID" > "$PID_FILE"

for _ in $(seq 1 20); do
  SS_LINE="$(ss -H -lntp "sport = :$CDP_PORT" 2>/dev/null | head -n 1 || true)"
  if [[ -n "$SS_LINE" ]]; then
    break
  fi
  sleep 1
done

SS_LINE="$(ss -H -lntp "sport = :$CDP_PORT" 2>/dev/null | head -n 1 || true)"
if [[ -z "$SS_LINE" ]]; then
  echo "[aim-browser] CDP did not start on $CDP_ADDR:$CDP_PORT" >&2
  echo "[aim-browser] Binary: $BROWSER_BIN" >&2
  echo "--- tail $CDP_LOG_FILE ---" >&2
  tail -n 80 "$CDP_LOG_FILE" >&2 || true
  rm -f "$PID_FILE"
  exit 1
fi

LOCAL_COL="$(awk '{print $4}' <<<"$SS_LINE")"
if [[ "$LOCAL_COL" != "$CDP_ADDR:$CDP_PORT" && "$LOCAL_COL" != "[::1]:$CDP_PORT" ]]; then
  echo "[aim-browser] SECURITY FAIL: CDP bound to '$LOCAL_COL' (expected $CDP_ADDR:$CDP_PORT). Stopping." >&2
  kill "$BROWSER_PID" 2>/dev/null || true
  sleep 1
  kill -9 "$BROWSER_PID" 2>/dev/null || true
  rm -f "$PID_FILE"
  exit 2
fi

echo "[aim-browser] CDP listening on $LOCAL_COL (binary: $BROWSER_BIN, pid: $BROWSER_PID)"