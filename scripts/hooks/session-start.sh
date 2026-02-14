#!/usr/bin/env bash
# =============================================================================
# MemoryForge: Session Start Hook
# =============================================================================
# Fires on: startup, resume, after compact (context compaction)
#
# This is the PRIMARY mechanism for persistent memory. It reads .mind/ state
# files and injects a "Morning Briefing" into Claude's context. Critically,
# this also fires AFTER context compaction (source=compact), which means
# the briefing is re-injected every time context is compressed — ensuring
# continuity even through compaction cycles.
#
# The Persistent Memory Loop:
#   work -> context grows -> pre-compact (save) -> compact -> session-start
#   (restore) -> continue working -> ...
#
# Input (stdin JSON): { session_id, source, model, transcript_path, cwd }
# Output (stdout JSON): { hookSpecificOutput: { additionalContext: "..." } }
# =============================================================================

set -euo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"
MIND_DIR="$PROJECT_DIR/.mind"

# Read the source from stdin (startup | resume | clear | compact)
INPUT=$(cat)
SOURCE=$(echo "$INPUT" | node -e "
  let d='';process.stdin.on('data',c=>d+=c);
  process.stdin.on('end',()=>{try{console.log(JSON.parse(d).source||'startup')}catch{console.log('startup')}})
" 2>/dev/null || echo "startup")

# --- Let Node.js read files directly (avoids bash argv size limits) ---
node -e "
const fs = require('fs');
const path = require('path');

const mindDir = process.argv[1];
const source = process.argv[2];

function readFile(filePath) {
  try { return fs.readFileSync(filePath, 'utf-8'); }
  catch { return ''; }
}

function readTail(filePath, lines) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const arr = content.split('\n');
    return arr.slice(-lines).join('\n');
  } catch { return ''; }
}

const state = readFile(path.join(mindDir, 'STATE.md'));
const progress = readFile(path.join(mindDir, 'PROGRESS.md'));
const decisions = readFile(path.join(mindDir, 'DECISIONS.md'));
const sessionLog = readTail(path.join(mindDir, 'SESSION-LOG.md'), 20);
const checkpoint = readFile(path.join(mindDir, 'checkpoints', 'latest.md'));

// Build briefing
let header, extraNote;
if (source === 'compact') {
  header = '=== CONTEXT RESTORED (post-compaction) ===';
  extraNote = 'Context was just compacted. Your previous work this session is summarized in the checkpoint below. Read .mind/ files for full state. Continue where you left off.';
} else {
  header = '=== SESSION BRIEFING ===';
  extraNote = 'Starting a new session. Read the state below and pick up the next task.';
}

let briefing = header + '\n' + extraNote + '\n\n';

briefing += '--- CURRENT STATE (.mind/STATE.md) ---\n';
briefing += (state || '(no state file found — this may be the first session)') + '\n\n';

if (source === 'compact' && checkpoint) {
  briefing += '--- PRE-COMPACTION CHECKPOINT ---\n';
  briefing += checkpoint + '\n\n';
}

briefing += '--- PROGRESS SUMMARY (.mind/PROGRESS.md) ---\n';
if (progress) {
  const lines = progress.split('\n');
  const importantLines = [];
  let capture = false;
  for (const line of lines) {
    if (line.includes('In Progress') || line.includes('What') || line.includes('Next') || line.includes('Blocked') || line.includes('Not Started')) {
      capture = true;
    }
    if (capture) importantLines.push(line);
    if (importantLines.length > 40) break;
  }
  briefing += (importantLines.length > 0 ? importantLines.join('\n') : progress.substring(0, 2000)) + '\n\n';
} else {
  briefing += '(no progress file found)\n\n';
}

briefing += '--- RECENT DECISIONS (.mind/DECISIONS.md) ---\n';
if (decisions) {
  const lines = decisions.split('\n');
  const decisionBlocks = [];
  let current = [];
  for (const line of lines) {
    if (line.startsWith('## DEC-') || line.startsWith('## Decision')) {
      if (current.length > 0) decisionBlocks.push(current.join('\n'));
      current = [line];
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) decisionBlocks.push(current.join('\n'));
  const recent = decisionBlocks.slice(-5);
  briefing += (recent.length > 0 ? recent.join('\n\n') : decisions.substring(0, 1000)) + '\n\n';
} else {
  briefing += '(no decisions file found)\n\n';
}

briefing += '--- LAST SESSION (.mind/SESSION-LOG.md) ---\n';
briefing += (sessionLog || '(no session log found)') + '\n\n';

briefing += '=== END BRIEFING — Read CLAUDE.md for full project context ===\n';
briefing += 'IMPORTANT: Always check .mind/STATE.md for the latest state before starting work.\n';

console.log(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'SessionStart',
    additionalContext: briefing
  }
}));
" "$MIND_DIR" "$SOURCE"
