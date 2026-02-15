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

# Parse stdin and produce output in a single Node.js invocation
INPUT=$(cat)
echo "$INPUT" | MIND_DIR="$MIND_DIR" TIMESTAMP="$TIMESTAMP" node -e "
  const fs = require('fs');
  let d='';process.stdin.on('data',c=>d+=c);
  process.stdin.on('end',()=>{
    let type='unknown', id='unknown';
    try {
      const j=JSON.parse(d);
      type = j.agent_type||'unknown';
      id = j.agent_id||'unknown';
    } catch {}
    // Log to agent activity tracker
    const mindDir = process.env.MIND_DIR;
    const ts = process.env.TIMESTAMP;
    try { fs.appendFileSync(mindDir + '/.agent-activity', '[' + ts + '] STOPPED: ' + type + ' (' + id + ')\n'); } catch {}
    // Output context
    const context = '[Memory] Agent completed: ' + type + ' (' + id + '). Check task status and update .mind/PROGRESS.md if work was completed.';
    console.log(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'SubagentStop',
        additionalContext: context
      }
    }));
  });
" 2>/dev/null || echo '{}'
