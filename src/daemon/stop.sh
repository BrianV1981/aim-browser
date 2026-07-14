#!/usr/bin/env bash
set -euo pipefail

CDP_PORT="${CDP_PORT:-9222}"
CDP_PROFILE_DIR="${CDP_PROFILE_DIR:-$HOME/.cache/aim-browser-profile}"
PID_FILE="$CDP_PROFILE_DIR/.aim-browser-cdp.pid"

kill_pid_if_ours() {
  local pid="$1"
  [[ -n "$pid" ]] || return 1
  [[ "$pid" =~ ^[0-9]+$ ]] || return 1
  kill -0 "$pid" 2>/dev/null || return 1

  local cmdline
  cmdline="$(tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null || true)"
  if [[ "$cmdline" != *"--remote-debugging-port=$CDP_PORT"* ]]; then
    return 1
  fi
  if [[ "$cmdline" != *"--user-data-dir=$CDP_PROFILE_DIR"* ]]; then
    return 1
  fi

  kill "$pid" 2>/dev/null || true
  for _ in $(seq 1 20); do
    kill -0 "$pid" 2>/dev/null || return 0
    sleep 0.25
  done
  kill -9 "$pid" 2>/dev/null || true
  sleep 0.25
  kill -0 "$pid" 2>/dev/null && return 1 || return 0
}

STOPPED=0
if [[ -f "$PID_FILE" ]]; then
  PID="$(cat "$PID_FILE" 2>/dev/null || true)"
  if kill_pid_if_ours "$PID"; then
    STOPPED=1
  fi
fi

# Fallback: use listening process PID on the CDP port, but only if cmdline matches this launcher profile+port.
LISTEN_PID="$(ss -H -lntp "sport = :$CDP_PORT" 2>/dev/null | sed -n 's/.*pid=\([0-9]\+\).*/\1/p' | head -n 1 || true)"
if [[ -n "$LISTEN_PID" ]]; then
  if kill_pid_if_ours "$LISTEN_PID"; then
    STOPPED=1
  fi
fi

rm -f "$PID_FILE"

if ss -H -lntp "sport = :$CDP_PORT" 2>/dev/null | grep -q ":$CDP_PORT"; then
  echo "[aim-browser] WARNING: something is still listening on :$CDP_PORT after stop attempt" >&2
  ss -H -lntp "sport = :$CDP_PORT" 2>/dev/null || true
  exit 1
fi

if [[ "$STOPPED" -eq 1 ]]; then
  echo "[aim-browser] Chromium CDP stopped (no listener on :$CDP_PORT)."
else
  echo "[aim-browser] No matching aim-browser Chromium process found; port is already free."
fi