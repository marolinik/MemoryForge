#!/usr/bin/env bash
# =============================================================================
# MemoryForge: Session End Hook
# =============================================================================
# Fires when a session terminates (clear, logout, exit).
#
# 1. Writes .last-activity timestamp (absorbed from stop-checkpoint)
# 2. Tracks file changes via git diff (absorbed from stop-checkpoint)
# 3. Logs session end to .session-tracking
# 4. Auto-generates session summary if SESSION-LOG.md wasn't updated
# 5. Warns if STATE.md is stale
# 6. Creates a session-end checkpoint
#
# Input (stdin JSON): { session_id, reason, transcript_path }
# Output: stderr only (SessionEnd doesn't support additionalContext)
# =============================================================================

set -euo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"
MIND_DIR="$PROJECT_DIR/.mind"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
DATE_SHORT=$(date -u +"%Y-%m-%d")

mkdir -p "$MIND_DIR/checkpoints"

# Write last-activity timestamp (from stop-checkpoint.sh)
echo "$TIMESTAMP" > "$MIND_DIR/.last-activity"

# --- File change tracking (from stop-checkpoint.sh) ---
if command -v git &>/dev/null && git -C "$PROJECT_DIR" rev-parse --is-inside-work-tree &>/dev/null 2>&1; then
  TRACKER="$MIND_DIR/.file-tracker"
  {
    git -C "$PROJECT_DIR" diff --name-only HEAD 2>/dev/null || true
    git -C "$PROJECT_DIR" diff --staged --name-only 2>/dev/null || true
    git -C "$PROJECT_DIR" ls-files --others --exclude-standard 2>/dev/null || true
  } | sort -u | grep -v '^\.mind/' > "$TRACKER.tmp" 2>/dev/null || true

  if [ -s "$TRACKER.tmp" ]; then
    if [ ! -f "$TRACKER" ]; then
      echo "# Session file changes (tracked at $TIMESTAMP)" > "$TRACKER"
    fi
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

# Read stdin for reason
INPUT=$(cat)
REASON=$(echo "$INPUT" | node -e "
  let d='';process.stdin.on('data',c=>d+=c);
  process.stdin.on('end',()=>{try{console.log(JSON.parse(d).reason||'unknown')}catch{console.log('unknown')}})
" 2>/dev/null || echo "unknown")

# Log session end
echo "Session ended: $TIMESTAMP (reason: $REASON)" >> "$MIND_DIR/.session-tracking"

# --- Auto Session Summary (Wave 2) ---
# Check if SESSION-LOG.md was updated during this session
SESSION_LOG="$MIND_DIR/SESSION-LOG.md"
SESSION_LOG_STALE=true

if [ -f "$SESSION_LOG" ]; then
  SESSION_LOG_AGE=0
  if command -v stat &>/dev/null; then
    SL_MOD=$(stat -c %Y "$SESSION_LOG" 2>/dev/null || stat -f %m "$SESSION_LOG" 2>/dev/null || echo "0")
    # Validate stat output is numeric (Bug #9)
    case "$SL_MOD" in ''|*[!0-9]*) SL_MOD=0 ;; esac
    NOW=$(date +%s)
    SESSION_LOG_AGE=$(( NOW - SL_MOD ))
  fi
  # If updated in last 30 min, consider it fresh
  if [ "$SESSION_LOG_AGE" -lt 1800 ]; then
    SESSION_LOG_STALE=false
  fi
fi

# If session log wasn't updated manually, auto-generate a summary
TRACKER="$MIND_DIR/.file-tracker"
if [ "$SESSION_LOG_STALE" = true ] && [ -f "$TRACKER" ]; then
  # Count changed files (skip comment lines)
  FILE_COUNT=$(grep -c -v '^#' "$TRACKER" 2>/dev/null || echo "0")

  if [ "$FILE_COUNT" -gt 0 ]; then
    # Build the changed file list (max 15 files shown)
    FILE_LIST=$(grep -v '^#' "$TRACKER" | head -15 | sed 's/^/  - /')
    REMAINING=$((FILE_COUNT - 15))

    # Determine next session number
    if [ -f "$SESSION_LOG" ]; then
      LAST_NUM=$(awk '/^## Session [0-9]+/{n=$3} END{print n+0}' "$SESSION_LOG" 2>/dev/null || echo "0")
    else
      LAST_NUM=0
    fi
    NEXT_NUM=$((LAST_NUM + 1))

    # Build summary entry
    ENTRY="
## Session $NEXT_NUM — $DATE_SHORT (auto-captured)
- **Reason ended:** $REASON
- **Files changed:** $FILE_COUNT"

    if [ "$FILE_COUNT" -le 15 ]; then
      ENTRY="$ENTRY
$FILE_LIST"
    else
      ENTRY="$ENTRY
$FILE_LIST
  - ... and $REMAINING more"
    fi

    ENTRY="$ENTRY
- **Note:** This entry was auto-generated because SESSION-LOG.md wasn't updated manually.
  Review and enrich with context about what was accomplished.
"

    # Append to session log
    echo "$ENTRY" >> "$SESSION_LOG"
    echo "Auto-generated session summary ($FILE_COUNT files tracked)." >&2
  fi
fi

# Clean up file tracker for next session
rm -f "$TRACKER"

# Warn if STATE.md is stale
if [ -f "$MIND_DIR/.last-activity" ] && [ -f "$MIND_DIR/STATE.md" ]; then
  STATE_AGE=0
  if command -v stat &>/dev/null; then
    STATE_MOD=$(stat -c %Y "$MIND_DIR/STATE.md" 2>/dev/null || stat -f %m "$MIND_DIR/STATE.md" 2>/dev/null || echo "0")
    # Validate stat output is numeric (Bug #9)
    case "$STATE_MOD" in ''|*[!0-9]*) STATE_MOD=0 ;; esac
    NOW=$(date +%s)
    STATE_AGE=$(( NOW - STATE_MOD ))
  fi

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
