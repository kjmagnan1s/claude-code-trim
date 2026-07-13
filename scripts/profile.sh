#!/usr/bin/env bash
# Profile a Claude Code install: capture the real API payload one request carries.
#
# Spawns the logging proxy, then a throwaway CHILD `claude -p` session from the
# target project dir routed through it. The child is the measurement subject;
# the session running this script is never measured, so nothing recurses.
# The proxy forwards to the endpoint the user's CLI normally talks to (their
# existing ANTHROPIC_BASE_URL, or api.anthropic.com), so gateway users keep
# their routing.
#
# Usage: profile.sh [target-project-dir] [out-dir]
# Env:   PORT (default 8787), PROBE_MODEL (default haiku, keeps the probe cheap),
#        PROBE_TIMEOUT seconds (default 90)
# Stdout: path to the largest capture file (the full payload).
set -euo pipefail

TARGET_DIR="${1:-$PWD}"
OUT_DIR="${2:-$(mktemp -d /tmp/trim-profile.XXXXXX)}"
PORT="${PORT:-8787}"
PROBE_MODEL="${PROBE_MODEL:-haiku}"
PROBE_TIMEOUT="${PROBE_TIMEOUT:-90}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Bedrock/Vertex CLIs don't route through ANTHROPIC_BASE_URL; the proxy would
# capture nothing. Say so instead of failing mysteriously.
if [ "${CLAUDE_CODE_USE_BEDROCK:-}" = "1" ] || [ "${CLAUDE_CODE_USE_VERTEX:-}" = "1" ]; then
  echo "This install uses Bedrock/Vertex, which bypasses ANTHROPIC_BASE_URL; the proxy cannot capture its traffic." >&2
  exit 1
fi

# Forward captured traffic to wherever this CLI normally talks (gateway-safe).
UPSTREAM="${ANTHROPIC_BASE_URL:-https://api.anthropic.com}"

if command -v lsof >/dev/null 2>&1 && lsof -nP -i ":$PORT" >/dev/null 2>&1; then
  echo "port $PORT is busy; rerun with PORT=<free port>" >&2
  exit 1
fi

mkdir -p "$OUT_DIR/captures"
CAPTURE_DIR="$OUT_DIR/captures" PORT="$PORT" UPSTREAM="$UPSTREAM" \
  node "$SCRIPT_DIR/proxy.mjs" 2>"$OUT_DIR/proxy.log" &
PROXY_PID=$!
trap 'kill "$PROXY_PID" 2>/dev/null || true' EXIT INT TERM
sleep 1

if ! kill -0 "$PROXY_PID" 2>/dev/null; then
  echo "proxy failed to start:" >&2
  cat "$OUT_DIR/proxy.log" >&2
  exit 1
fi

# One naturally-single-turn message forces one full request through the proxy.
# Watchdog kills a hung probe after PROBE_TIMEOUT seconds.
(
  cd "$TARGET_DIR" &&
  ANTHROPIC_BASE_URL="http://127.0.0.1:$PORT" \
    claude -p "Reply with exactly: ok" --model "$PROBE_MODEL"
) >"$OUT_DIR/probe.log" 2>&1 &
PROBE_PID=$!
(
  sleep "$PROBE_TIMEOUT"
  kill "$PROBE_PID" 2>/dev/null || true
) &
WATCHDOG_PID=$!
wait "$PROBE_PID" 2>/dev/null || true
kill "$WATCHDOG_PID" 2>/dev/null || true

kill "$PROXY_PID" 2>/dev/null || true
wait "$PROXY_PID" 2>/dev/null || true
trap - EXIT INT TERM

LARGEST="$(ls -S "$OUT_DIR"/captures/capture-*.json 2>/dev/null | head -1 || true)"
if [ -z "$LARGEST" ]; then
  echo "no capture produced; probe output follows:" >&2
  cat "$OUT_DIR/probe.log" >&2
  exit 1
fi
echo "$LARGEST"
