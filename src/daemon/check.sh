#!/usr/bin/env bash
set -euo pipefail

CDP_PORT="${CDP_PORT:-9222}"
CDP_ADDR="${CDP_ADDR:-127.0.0.1}"

echo "[aim-browser] Listener check:"
SS_LINE="$(ss -H -lntp "sport = :$CDP_PORT" 2>/dev/null | head -n 1 || true)"
if [[ -z "$SS_LINE" ]]; then
  echo "[aim-browser] FAIL: no listener on :$CDP_PORT"
  exit 1
fi

echo "$SS_LINE"

LOCAL_COL="$(awk '{print $4}' <<<"$SS_LINE")"
if [[ "$LOCAL_COL" != "127.0.0.1:$CDP_PORT" && "$LOCAL_COL" != "[::1]:$CDP_PORT" ]]; then
  echo "[aim-browser] SECURITY FAIL: CDP bound to '$LOCAL_COL' (expected 127.0.0.1:$CDP_PORT or [::1]:$CDP_PORT)"
  exit 2
fi

echo
echo "[aim-browser] /json/version check:"
JSON="$(curl -s --max-time 5 "http://$CDP_ADDR:$CDP_PORT/json/version")"
printf '%s' "$JSON" | head -c 600
echo

WS_URL="$(printf '%s' "$JSON" | sed -n 's/.*"webSocketDebuggerUrl"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')"
if [[ -z "$WS_URL" ]]; then
  echo "[aim-browser] FAIL: webSocketDebuggerUrl missing"
  exit 1
fi
if [[ "$WS_URL" != *"127.0.0.1"* && "$WS_URL" != *"localhost"* && "$WS_URL" != *"[::1]"* ]]; then
  echo "[aim-browser] FAIL: websocket endpoint is not loopback: $WS_URL"
  exit 1
fi

echo "[aim-browser] OK"