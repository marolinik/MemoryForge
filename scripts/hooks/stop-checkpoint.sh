#!/usr/bin/env bash
# =============================================================================
# MemoryForge: Stop Checkpoint Hook
# =============================================================================
# Fires after Claude finishes each response.
#
# Creates a lightweight checkpoint so that if the session crashes or is
# interrupted, we have a recent timestamp of last activity.
#
# Wave 2: Also tracks which files changed (via git) since the session started.
# Writes change list to .mind/.file-tracker for session-end auto-summary.
#
# Input (stdin JSON): { session_id, stop_hook_active, transcript_path }
# Output (stdout JSON): { hookSpecificOutput: { additionalContext: "..." } }
# =============================================================================

set -euo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"
MIND_DIR="$PROJECT_DIR/.mind"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

mkdir -p "$MIND_DIR"

# Write last-activity timestamp
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

# --- File change tracking (Wave 2) ---
# Only runs if we're in a git repo — lightweight, no filesystem scan
if command -v git &>/dev/null && git -C "$PROJECT_DIR" rev-parse --is-inside-work-tree &>/dev/null 2>&1; then
  TRACKER="$MIND_DIR/.file-tracker"

  # Get changed files: modified (staged + unstaged) + untracked
  {
    git -C "$PROJECT_DIR" diff --name-only HEAD 2>/dev/null || true
    git -C "$PROJECT_DIR" diff --staged --name-only 2>/dev/null || true
    git -C "$PROJECT_DIR" ls-files --others --exclude-standard 2>/dev/null || true
  } | sort -u | grep -v '^\.mind/' > "$TRACKER.tmp" 2>/dev/null || true

  # Only update tracker if there are changes
  if [ -s "$TRACKER.tmp" ]; then
    # Record session start time on first tracker write
    if [ ! -f "$TRACKER" ]; then
      echo "# Session file changes (tracked since $TIMESTAMP)" > "$TRACKER"
    fi

    # Append new files not already tracked
    if [ -f "$TRACKER" ]; then
      while IFS= read -r file; do
        if ! grep -qF "$file" "$TRACKER" 2>/dev/null; then
          echo "$file" >> "$TRACKER"
        fi
      done < "$TRACKER.tmp"
    fi
  fi
  rm -f "$TRACKER.tmp"
fi

# Output a minimal context nudge if STATE.md is stale (>30 min by default)
STALE_SECONDS=1800
if [ -f "$PROJECT_DIR/.memoryforge.config.json" ]; then
  STALE_SECONDS=$(node -e "
    try{const c=JSON.parse(require('fs').readFileSync('$PROJECT_DIR/.memoryforge.config.json','utf-8'));
    console.log(c.staleWarningSeconds||1800)}catch{console.log(1800)}
  " 2>/dev/null || echo "1800")
fi

if [ -f "$MIND_DIR/STATE.md" ]; then
  STATE_AGE=0
  if command -v stat &>/dev/null; then
    STATE_MOD=$(stat -c %Y "$MIND_DIR/STATE.md" 2>/dev/null || stat -f %m "$MIND_DIR/STATE.md" 2>/dev/null || echo "0")
    NOW=$(date +%s)
    STATE_AGE=$(( NOW - STATE_MOD ))
  fi

  if [ "$STATE_AGE" -gt "$STALE_SECONDS" ]; then
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
