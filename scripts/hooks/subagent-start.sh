#!/usr/bin/env bash
# =============================================================================
# MemoryForge: Subagent Start Hook
# =============================================================================
# Fires when a subagent is spawned via the Task tool.
#
# Logs the agent spawn to .mind/.agent-activity for tracking which agents
# have been active. Useful for multi-agent workflows.
#
# Input (stdin JSON): { session_id, agent_id, agent_type }
# Output (stdout JSON): {} (no context injection needed)
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
      console.log((j.agent_type||'unknown') + '|' + (j.agent_id||'unknown'));
    } catch { console.log('unknown|unknown'); }
  })
" 2>/dev/null || echo "unknown|unknown")

AGENT_TYPE=$(echo "$AGENT_INFO" | cut -d'|' -f1)
AGENT_ID=$(echo "$AGENT_INFO" | cut -d'|' -f2)

# Log to agent activity tracker
echo "[$TIMESTAMP] STARTED: $AGENT_TYPE ($AGENT_ID)" >> "$MIND_DIR/.agent-activity"

# Output empty — no context injection needed for subagent start
echo '{}'
