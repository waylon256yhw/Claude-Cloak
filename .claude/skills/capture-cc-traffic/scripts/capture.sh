#!/usr/bin/env bash
# Capture one real Claude Code CLI outbound request.
#
# Usage:
#   bash capture.sh [--interactive] "prompt to send"
#
# Outputs to /tmp/cc-capture/:
#   echo.log               raw ::REQ:: chunks (full headers + body for each request)
#   parsed.json            structured summary
#   system-blocks/         each system block as its own .txt file
#
# Safe-by-design: ~/.claude/settings.json is backed up before its `env` block
# is neutralized, and restored on exit (including Ctrl-C). The backup path is
# ~/.claude/settings.json.cc-capture.bak — if a kill -9 leaves it behind, just
# mv it back.

set -euo pipefail

INTERACTIVE=0
if [[ "${1:-}" == "--interactive" ]]; then
  INTERACTIVE=1
  shift
fi
PROMPT="${1:-say OK}"

OUT_DIR=/tmp/cc-capture
SETTINGS=~/.claude/settings.json
BACKUP=~/.claude/settings.json.cc-capture.bak
ECHO_PORT=7700
ECHO_LOG="$OUT_DIR/echo.log"
ECHO_PIDFILE="$OUT_DIR/echo.pid"

mkdir -p "$OUT_DIR/system-blocks"
: > "$ECHO_LOG"

cleanup() {
  if [[ -f "$ECHO_PIDFILE" ]]; then
    kill "$(cat "$ECHO_PIDFILE")" 2>/dev/null || true
    rm -f "$ECHO_PIDFILE"
  fi
  if [[ -f "$BACKUP" ]]; then
    mv "$BACKUP" "$SETTINGS"
    echo "[cc-capture] restored $SETTINGS" >&2
  fi
}
trap cleanup EXIT INT TERM

if ss -tnl 2>/dev/null | grep -q ":${ECHO_PORT}\b"; then
  echo "[cc-capture] port ${ECHO_PORT} is already in use; free it before capturing" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
nohup node "$SCRIPT_DIR/echo-server.mjs" "$ECHO_PORT" > "$ECHO_LOG" 2>&1 &
echo $! > "$ECHO_PIDFILE"
sleep 0.5

if [[ -f "$SETTINGS" ]]; then
  cp "$SETTINGS" "$BACKUP"
  python3 -c "
import json, sys
p = '$SETTINGS'
with open(p) as f: d = json.load(f)
d['env'] = {}
with open(p, 'w') as f: json.dump(d, f, indent=2)
"
  echo "[cc-capture] neutralized env block in $SETTINGS" >&2
fi

# Default model: pick a real Anthropic model id the relay/Anthropic will accept.
# claude-sonnet-4-5-20250929 is commonly available across relays as of mid-2026.
MODEL="${ANTHROPIC_MODEL:-claude-sonnet-4-5-20250929}"

echo "[cc-capture] running claude (interactive=$INTERACTIVE)" >&2
if [[ "$INTERACTIVE" == "1" ]]; then
  # Mimic interactive entry: prompt comes through stdin, entrypoint=cli.
  ANTHROPIC_BASE_URL="http://localhost:${ECHO_PORT}" \
  ANTHROPIC_API_KEY="sk-cc-capture-fake" \
  ANTHROPIC_MODEL="$MODEL" \
  CLAUDE_CODE_ENTRYPOINT="cli" \
    timeout 20 claude --max-turns 1 <<<"$PROMPT" >/dev/null 2>&1 || true
else
  # Non-interactive --print: prompt is argv; entrypoint=sdk-cli.
  ANTHROPIC_BASE_URL="http://localhost:${ECHO_PORT}" \
  ANTHROPIC_API_KEY="sk-cc-capture-fake" \
  ANTHROPIC_MODEL="$MODEL" \
    timeout 20 claude --print --max-turns 1 "$PROMPT" </dev/null >/dev/null 2>&1 || true
fi

# Give the echo server a beat to flush.
sleep 0.3

python3 "$SCRIPT_DIR/parse-requests.py" "$ECHO_LOG" "$OUT_DIR"

echo "[cc-capture] done — see $OUT_DIR/parsed.json and $OUT_DIR/system-blocks/" >&2
