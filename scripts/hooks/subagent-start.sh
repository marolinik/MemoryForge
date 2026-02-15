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

# Parse stdin and log in a single Node invocation
MIND_DIR="$MIND_DIR" TIMESTAMP="$TIMESTAMP" node -e "
  let d='';process.stdin.on('data',c=>d+=c);
  process.stdin.on('end',()=>{
    const fs=require('fs');
    const path=require('path');
    try {
      const j=JSON.parse(d);
      const type=j.agent_type||'unknown';
      const id=j.agent_id||'unknown';
      const ts=process.env.TIMESTAMP;
      const mindDir=process.env.MIND_DIR;
      const line='['+ts+'] STARTED: '+type+' ('+id+')\n';
      fs.appendFileSync(path.join(mindDir,'.agent-activity'),line);
    } catch {}
    console.log('{}');
  })
" < /dev/stdin || echo '{}'
