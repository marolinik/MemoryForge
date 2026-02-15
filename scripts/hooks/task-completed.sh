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

# Parse stdin and log in a single Node invocation (Bug #5 R7/R8)
MIND_DIR="$MIND_DIR" TIMESTAMP="$TIMESTAMP" node -e "
  let d='';process.stdin.on('data',c=>d+=c);
  process.stdin.on('end',()=>{
    const fs=require('fs');
    const path=require('path');
    try {
      const j=JSON.parse(d);
      const id=j.task_id||'unknown';
      const subject=j.task_subject||'unknown';
      const teammate=j.teammate_name||'self';
      const ts=process.env.TIMESTAMP;
      const mindDir=process.env.MIND_DIR;
      const line='['+ts+'] COMPLETED: #'+id+' — '+subject+' (by: '+teammate+')\n';
      fs.appendFileSync(path.join(mindDir,'.task-completions'),line);
    } catch {}
    console.log('{}');
  })
" < /dev/stdin || echo '{}'
