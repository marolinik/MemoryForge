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
# Input (stdin JSON): { session_id, prompt, transcript_path }
# Output (stdout JSON): { hookSpecificOutput: { additionalContext: "..." } }
# =============================================================================

set -euo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"
MIND_DIR="$PROJECT_DIR/.mind"

# Quick extraction from STATE.md — keep it minimal
PHASE="unknown"
NEXT_ACTION="unknown"
BLOCKERS="none"

if [ -f "$MIND_DIR/STATE.md" ]; then
  PHASE=$(grep -A 1 "^## Current Phase" "$MIND_DIR/STATE.md" 2>/dev/null | tail -1 | sed 's/^[[:space:]]*//' || echo "unknown")
  NEXT_ACTION=$(grep -A 1 "^## Next Action" "$MIND_DIR/STATE.md" 2>/dev/null | tail -1 | sed 's/^[[:space:]]*//' || echo "unknown")
  BLOCKERS=$(grep -A 1 "^## Blocked Items" "$MIND_DIR/STATE.md" 2>/dev/null | tail -1 | sed 's/^[[:space:]]*//' || echo "none")
fi

# Only inject if we have meaningful state
if [ "$PHASE" = "unknown" ] && [ "$NEXT_ACTION" = "unknown" ]; then
  # No state available — output empty (no context injection)
  echo '{}'
  exit 0
fi

node -e "
const phase = process.argv[1];
const next = process.argv[2];
const blockers = process.argv[3];

const context = '[Memory] Phase: ' + phase +
  ' | Next: ' + next +
  (blockers !== 'none' && blockers !== 'None.' && blockers !== 'None' ? ' | BLOCKED: ' + blockers : '') +
  ' | (Read .mind/STATE.md for details)';

console.log(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'UserPromptSubmit',
    additionalContext: context
  }
}));
" "$PHASE" "$NEXT_ACTION" "$BLOCKERS"
