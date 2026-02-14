#!/usr/bin/env bash
# =============================================================================
# MemoryForge: Task Completed Hook
# =============================================================================
# Fires when a task is marked as completed (via TaskUpdate).
#
# Auto-logs completed tasks to .mind/.task-completions for the Mind agent
# to incorporate into PROGRESS.md during state updates. Creates an
# automatic audit trail of completed work.
#
# Input (stdin JSON): { session_id, task_id, task_subject, task_description,
#                       teammate_name, team_name }
# Output: exit 0 (no context injection, just logging)
# =============================================================================

set -euo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"
MIND_DIR="$PROJECT_DIR/.mind"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

mkdir -p "$MIND_DIR"

# Parse stdin
INPUT=$(cat)
TASK_INFO=$(echo "$INPUT" | node -e "
  let d='';process.stdin.on('data',c=>d+=c);
  process.stdin.on('end',()=>{
    try {
      const j=JSON.parse(d);
      console.log(JSON.stringify({
        id: j.task_id||'unknown',
        subject: j.task_subject||'unknown',
        teammate: j.teammate_name||'self',
        team: j.team_name||''
      }));
    } catch { console.log('{\"id\":\"unknown\",\"subject\":\"unknown\",\"teammate\":\"self\",\"team\":\"\"}'); }
  })
" 2>/dev/null || echo '{"id":"unknown","subject":"unknown","teammate":"self","team":""}')

TASK_ID=$(echo "$TASK_INFO" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).id))" 2>/dev/null || echo "unknown")
TASK_SUBJECT=$(echo "$TASK_INFO" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).subject))" 2>/dev/null || echo "unknown")
TEAMMATE=$(echo "$TASK_INFO" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).teammate))" 2>/dev/null || echo "self")

# Log to task completions file
echo "[$TIMESTAMP] COMPLETED: #$TASK_ID — $TASK_SUBJECT (by: $TEAMMATE)" >> "$MIND_DIR/.task-completions"

# Output empty — task completion is just logged, no context needed
echo '{}'
