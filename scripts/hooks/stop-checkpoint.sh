#!/usr/bin/env bash
# =============================================================================
# MemoryForge: Stop Checkpoint Hook
# =============================================================================
# Fires after Claude finishes each response.
#
# Creates a lightweight checkpoint so that if the session crashes or is
# interrupted, we have a recent timestamp of last activity. Also outputs
# a gentle reminder to update .mind/ files if significant work was done.
#
# This is intentionally lightweight — it fires on EVERY response.
#
# Input (stdin JSON): { session_id, stop_hook_active, transcript_path }
# Output (stdout JSON): { hookSpecificOutput: { additionalContext: "..." } }
# =============================================================================

set -euo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"
MIND_DIR="$PROJECT_DIR/.mind"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

mkdir -p "$MIND_DIR"

# Write last-activity timestamp (atomic-ish write)
echo "$TIMESTAMP" > "$MIND_DIR/.last-activity"

# Read stdin
INPUT=$(cat)

# Check if stop_hook_active — if another stop hook is running, skip
STOP_ACTIVE=$(echo "$INPUT" | node -e "
  let d='';process.stdin.on('data',c=>d+=c);
  process.stdin.on('end',()=>{try{console.log(JSON.parse(d).stop_hook_active||false)}catch{console.log('false')}})
" 2>/dev/null || echo "false")

if [ "$STOP_ACTIVE" = "true" ]; then
  echo '{}'
  exit 0
fi

# Output a minimal context nudge — only if .mind/STATE.md hasn't been
# updated recently (more than 30 minutes old)
if [ -f "$MIND_DIR/STATE.md" ]; then
  # Check file age (if possible)
  STATE_AGE=0
  if command -v stat &>/dev/null; then
    STATE_MOD=$(stat -c %Y "$MIND_DIR/STATE.md" 2>/dev/null || stat -f %m "$MIND_DIR/STATE.md" 2>/dev/null || echo "0")
    NOW=$(date +%s)
    STATE_AGE=$(( NOW - STATE_MOD ))
  fi

  # If STATE.md is older than 30 minutes, remind to update
  if [ "$STATE_AGE" -gt 1800 ]; then
    node -e "
      console.log(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'Stop',
          additionalContext: '[Memory] Reminder: .mind/STATE.md has not been updated in 30+ minutes. If significant work was done, update .mind/ files to preserve progress.'
        }
      }));
    "
  else
    echo '{}'
  fi
else
  echo '{}'
fi
