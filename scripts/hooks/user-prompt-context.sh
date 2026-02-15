#!/usr/bin/env bash
# =============================================================================
# MemoryForge: User Prompt Context Hook
# =============================================================================
# Fires after user submits a prompt, before Claude processes it.
#
# Injects a LIGHTWEIGHT state reminder — just the current phase and next
# action. This keeps state fresh in context without being noisy.
# The full briefing is handled by session-start; this is just a nudge.
#
# Wave 15: Caches output to .mind/.prompt-context and only regenerates when
# STATE.md changes (avoids shelling out to Node on every prompt).
#
# Input (stdin JSON): { session_id, prompt, transcript_path }
# Output (stdout JSON): { hookSpecificOutput: { additionalContext: "..." } }
# =============================================================================

set -euo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"
MIND_DIR="$PROJECT_DIR/.mind"
CACHE_FILE="$MIND_DIR/.prompt-context"

# Consume stdin (required by hook protocol)
cat > /dev/null

# No state file — nothing to inject
if [ ! -f "$MIND_DIR/STATE.md" ]; then
  echo '{}'
  exit 0
fi

# Check if cache is still valid (STATE.md hasn't changed since last generation)
if [ -f "$CACHE_FILE" ]; then
  STATE_MOD=0
  CACHE_MOD=0
  if command -v stat &>/dev/null; then
    STATE_MOD=$(stat -c %Y "$MIND_DIR/STATE.md" 2>/dev/null || stat -f %m "$MIND_DIR/STATE.md" 2>/dev/null || echo "0")
    CACHE_MOD=$(stat -c %Y "$CACHE_FILE" 2>/dev/null || stat -f %m "$CACHE_FILE" 2>/dev/null || echo "0")
  fi
  # Ensure both values are numeric (default to 0 if empty or non-numeric)
  case "$STATE_MOD" in ''|*[!0-9]*) STATE_MOD=0 ;; esac
  case "$CACHE_MOD" in ''|*[!0-9]*) CACHE_MOD=0 ;; esac
  if [ "$CACHE_MOD" -ge "$STATE_MOD" ] 2>/dev/null; then
    cat "$CACHE_FILE"
    exit 0
  fi
fi

# Regenerate: extract state with grep (no Node needed)
# Use -A 3 and skip blank lines to handle Markdown with blank line after heading
PHASE=$(grep -A 3 "^## Current Phase" "$MIND_DIR/STATE.md" 2>/dev/null | grep -v "^## " | grep -v "^$" | head -1 | sed 's/^[[:space:]]*//' || echo "unknown")
NEXT_ACTION=$(grep -A 3 "^## Next Action" "$MIND_DIR/STATE.md" 2>/dev/null | grep -v "^## " | grep -v "^$" | head -1 | sed 's/^[[:space:]]*//' || echo "unknown")
BLOCKERS=$(grep -A 3 "^## Blocked Items" "$MIND_DIR/STATE.md" 2>/dev/null | grep -v "^## " | grep -v "^$" | head -1 | sed 's/^[[:space:]]*//' || echo "none")

# Only inject if we have meaningful state
if [ "$PHASE" = "unknown" ] && [ "$NEXT_ACTION" = "unknown" ]; then
  echo '{}' > "$CACHE_FILE"
  echo '{}'
  exit 0
fi

# Build context string in bash (avoids Node shell-out per prompt)
CONTEXT="[Memory] Phase: $PHASE | Next: $NEXT_ACTION"
if [ "$BLOCKERS" != "none" ] && [ "$BLOCKERS" != "None." ] && [ "$BLOCKERS" != "None" ]; then
  CONTEXT="$CONTEXT | BLOCKED: $BLOCKERS"
fi
CONTEXT="$CONTEXT | (Read .mind/STATE.md for details)"

# Generate JSON output — use Node only for safe JSON escaping
OUTPUT=$(node -e "
console.log(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'UserPromptSubmit',
    additionalContext: process.argv[1]
  }
}));
" "$CONTEXT")

# Cache and output
mkdir -p "$MIND_DIR"
echo "$OUTPUT" > "$CACHE_FILE"
echo "$OUTPUT"
