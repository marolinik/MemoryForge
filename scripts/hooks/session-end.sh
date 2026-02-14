#!/usr/bin/env bash
# =============================================================================
# MemoryForge: Session End Hook
# =============================================================================
# Fires when a session terminates (clear, logout, exit).
#
# Logs the session end timestamp and outputs a warning if .mind/ files
# haven't been updated recently. This is the last chance to preserve state.
#
# Input (stdin JSON): { session_id, reason, transcript_path }
# Output: stderr only (SessionEnd doesn't support additionalContext)
# =============================================================================

set -euo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"
MIND_DIR="$PROJECT_DIR/.mind"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

mkdir -p "$MIND_DIR/checkpoints"

# Read stdin for reason
INPUT=$(cat)
REASON=$(echo "$INPUT" | node -e "
  let d='';process.stdin.on('data',c=>d+=c);
  process.stdin.on('end',()=>{try{console.log(JSON.parse(d).reason||'unknown')}catch{console.log('unknown')}})
" 2>/dev/null || echo "unknown")

# Log session end to a lightweight tracking file
echo "Session ended: $TIMESTAMP (reason: $REASON)" >> "$MIND_DIR/.session-tracking"

# Check if STATE.md was updated this session by comparing with .last-activity
if [ -f "$MIND_DIR/.last-activity" ] && [ -f "$MIND_DIR/STATE.md" ]; then
  # Check STATE.md modification time
  STATE_AGE=0
  if command -v stat &>/dev/null; then
    STATE_MOD=$(stat -c %Y "$MIND_DIR/STATE.md" 2>/dev/null || stat -f %m "$MIND_DIR/STATE.md" 2>/dev/null || echo "0")
    NOW=$(date +%s)
    STATE_AGE=$(( NOW - STATE_MOD ))
  fi

  # Warn if state hasn't been updated in this session (>30 min old)
  if [ "$STATE_AGE" -gt 1800 ]; then
    echo "WARNING: .mind/STATE.md was not updated during this session. Progress may be lost." >&2
    echo "Update .mind/ files before ending to preserve progress." >&2
  fi
fi

# Create a session-end checkpoint
CHECKPOINT="# Session End Checkpoint
## Timestamp: $TIMESTAMP
## Reason: $REASON
## Note: State may not have been saved. Check .mind/STATE.md freshness.
"
echo "$CHECKPOINT" > "$MIND_DIR/checkpoints/session-end-latest.md"

# Exit 0 — don't block session end
exit 0
