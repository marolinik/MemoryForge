#!/usr/bin/env bash
# =============================================================================
# MemoryForge: Subagent Stop Hook
# =============================================================================
# Fires when a subagent finishes.
#
# Logs the agent completion. Outputs context about what the agent
# accomplished so the orchestrating session can track progress.
#
# Input (stdin JSON): { session_id, agent_id, agent_type, agent_transcript_path }
# Output (stdout JSON): { hookSpecificOutput: { additionalContext: "..." } }
# =============================================================================

set -euo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"
MIND_DIR="$PROJECT_DIR/.mind"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

mkdir -p "$MIND_DIR"

# Parse stdin
INPUT=$(cat)
AGENT_INFO=$(echo "$INPUT" | node -e "
  let d='';process.stdin.on('data',c=>d+=c);
  process.stdin.on('end',()=>{
    try {
      const j=JSON.parse(d);
      console.log(JSON.stringify({
        type: j.agent_type||'unknown',
        id: j.agent_id||'unknown',
        transcript: j.agent_transcript_path||''
      }));
    } catch { console.log('{\"type\":\"unknown\",\"id\":\"unknown\",\"transcript\":\"\"}'); }
  })
" 2>/dev/null || echo '{"type":"unknown","id":"unknown","transcript":""}')

AGENT_TYPE=$(echo "$AGENT_INFO" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).type))" 2>/dev/null || echo "unknown")
AGENT_ID=$(echo "$AGENT_INFO" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).id))" 2>/dev/null || echo "unknown")

# Log to agent activity tracker
echo "[$TIMESTAMP] STOPPED: $AGENT_TYPE ($AGENT_ID)" >> "$MIND_DIR/.agent-activity"

# Output context about agent completion
node -e "
const type = process.argv[1];
const id = process.argv[2];
const context = '[Memory] Agent completed: ' + type + ' (' + id + '). Check task status and update .mind/PROGRESS.md if work was completed.';
console.log(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'SubagentStop',
    additionalContext: context
  }
}));
" "$AGENT_TYPE" "$AGENT_ID"
