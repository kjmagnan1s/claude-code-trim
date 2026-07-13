#!/usr/bin/env bash
# Profile a Claude Code install: capture the real API payload one request carries.
#
# Spawns the logging proxy, then a throwaway CHILD `claude -p` session from the
# target project dir routed through it. The child is the measurement subject;
# the session running this script is never measured, so nothing recurses.
#
# Usage: profile.sh [target-project-dir] [out-dir]
# Env:   PORT (default 8787), PROBE_MODEL (default haiku, keeps the probe cheap)
# Stdout: path to the largest capture file (the full payload).
set -euo pipefail

TARGET_DIR="${1:-$PWD}"
OUT_DIR="${2:-$(mktemp -d /tmp/trim-profile.XXXXXX)}"
PORT="${PORT:-8787}"
PROBE_MODEL="${PROBE_MODEL:-haiku}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if lsof -nP -i ":$PORT" >/dev/null 2>&1; then
  echo "port $PORT is busy; rerun with PORT=<free port>" >&2
  exit 1
fi

mkdir -p "$OUT_DIR/captures"
CAPTURE_DIR="$OUT_DIR/captures" PORT="$PORT" node "$SCRIPT_DIR/proxy.mjs" 2>"$OUT_DIR/proxy.log" &
PROXY_PID=$!
trap 'kill "$PROXY_PID" 2>/dev/null || true' EXIT
sleep 1

if ! kill -0 "$PROXY_PID" 2>/dev/null; then
  echo "proxy failed to start:" >&2
  cat "$OUT_DIR/proxy.log" >&2
  exit 1
fi

# One naturally-single-turn message forces one full request through the proxy.
(
  cd "$TARGET_DIR" &&
  ANTHROPIC_BASE_URL="http://127.0.0.1:$PORT" \
    claude -p "Reply with exactly: ok" --model "$PROBE_MODEL"
) >"$OUT_DIR/probe.log" 2>&1 || true

kill "$PROXY_PID" 2>/dev/null || true
wait "$PROXY_PID" 2>/dev/null || true
trap - EXIT

LARGEST="$(ls -S "$OUT_DIR"/captures/capture-*.json 2>/dev/null | head -1 || true)"
if [ -z "$LARGEST" ]; then
  echo "no capture produced; probe output follows:" >&2
  cat "$OUT_DIR/probe.log" >&2
  exit 1
fi
echo "$LARGEST"
