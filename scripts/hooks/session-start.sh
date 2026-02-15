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

# --- Rotate .mcp-errors.log if too large (Wave 16) ---
# Keep error log under 100KB to prevent unbounded growth
# Use tail -n instead of tail -c to avoid cutting mid-UTF-8 character (Bug #10)
ERROR_LOG="$MIND_DIR/.mcp-errors.log"
if [ -f "$ERROR_LOG" ]; then
  ERROR_SIZE=$(wc -c < "$ERROR_LOG" 2>/dev/null | tr -d ' ' || echo "0")
  if [ "$ERROR_SIZE" -gt 102400 ]; then
    # Keep last 500 lines (approximately 50KB)
    tail -n 500 "$ERROR_LOG" > "${ERROR_LOG}.tmp" 2>/dev/null && mv "${ERROR_LOG}.tmp" "$ERROR_LOG" || true
  fi
fi

# --- Rotate tracking files if too large (Bug #2) ---
# Prevents unbounded growth of .agent-activity, .task-completions, .session-tracking
for TRACK_FILE in ".agent-activity" ".task-completions" ".session-tracking"; do
  TRACK_PATH="$MIND_DIR/$TRACK_FILE"
  if [ -f "$TRACK_PATH" ]; then
    TRACK_LINES=$(wc -l < "$TRACK_PATH" 2>/dev/null | tr -d ' ' || echo "0")
    case "$TRACK_LINES" in ''|*[!0-9]*) TRACK_LINES=0 ;; esac
    if [ "$TRACK_LINES" -gt 200 ]; then
      tail -n 100 "$TRACK_PATH" > "${TRACK_PATH}.tmp" 2>/dev/null && mv "${TRACK_PATH}.tmp" "$TRACK_PATH" || true
    fi
  fi
done

# --- Auto-compress if .mind/ files are large (Wave 3) ---
# Check total size of .mind/ markdown files (skip checkpoints, tracking files)
COMPRESS_THRESHOLD=12000
if [ -d "$MIND_DIR" ]; then
  TOTAL_SIZE=0
  for md_file in "$MIND_DIR/STATE.md" "$MIND_DIR/PROGRESS.md" "$MIND_DIR/DECISIONS.md" "$MIND_DIR/SESSION-LOG.md"; do
    if [ -f "$md_file" ]; then
      FILE_SIZE=$(wc -c < "$md_file" 2>/dev/null | tr -d ' ' || echo "0")
      TOTAL_SIZE=$((TOTAL_SIZE + FILE_SIZE))
    fi
  done

  if [ "$TOTAL_SIZE" -gt "$COMPRESS_THRESHOLD" ]; then
    # Find compress script relative to hooks dir
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    COMPRESS_SCRIPT=""
    # Project-level: scripts/hooks/ -> scripts/compress-sessions.js
    if [ -f "$SCRIPT_DIR/../compress-sessions.js" ]; then
      COMPRESS_SCRIPT="$SCRIPT_DIR/../compress-sessions.js"
    # Global: ~/.claude/hooks/ -> check project scripts/
    elif [ -f "$PROJECT_DIR/scripts/compress-sessions.js" ]; then
      COMPRESS_SCRIPT="$PROJECT_DIR/scripts/compress-sessions.js"
    fi

    if [ -n "$COMPRESS_SCRIPT" ]; then
      node "$COMPRESS_SCRIPT" -- "$MIND_DIR" >/dev/null 2>&1 || true
    fi
  fi
fi

# --- Let Node.js read files directly (avoids bash argv size limits) ---
node -e "
const fs = require('fs');
const path = require('path');

const mindDir = process.argv[1];
const source = process.argv[2];

const SESSION_LOG_TAIL = 20;
const RECENT_DECISIONS = 5;
const MAX_PROGRESS_LINES = 40;

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
const sessionLog = readTail(path.join(mindDir, 'SESSION-LOG.md'), SESSION_LOG_TAIL);
const checkpoint = readFile(path.join(mindDir, 'checkpoints', 'latest.md'));

// Calculate total .mind/ size to decide briefing depth
const totalSize = [state, progress, decisions, sessionLog].reduce(
  (sum, content) => sum + (content ? content.length : 0), 0
);

// Progressive briefing: compact (~200 tokens) for large projects,
// full briefing for small projects. Threshold: 8KB (~2000 tokens)
const PROGRESSIVE_THRESHOLD = 8000;
const useCompactBriefing = totalSize > PROGRESSIVE_THRESHOLD && source !== 'compact';

// Build briefing
let header, extraNote;
if (source === 'compact') {
  header = '=== CONTEXT RESTORED (post-compaction) ===';
  extraNote = 'Context was just compacted. Your previous work this session is summarized in the checkpoint below. Read .mind/ files for full state. Continue where you left off.';
} else {
  header = '=== SESSION BRIEFING ===';
  extraNote = useCompactBriefing
    ? 'Starting a new session. Compact briefing below — use memory_status and memory_search MCP tools for full details.'
    : 'Starting a new session. Read the state below and pick up the next task.';
}

let briefing = header + '\n' + extraNote + '\n\n';

briefing += '--- CURRENT STATE (.mind/STATE.md) ---\n';
briefing += (state || '(no state file found — this may be the first session)') + '\n\n';

if (source === 'compact' && checkpoint) {
  briefing += '--- PRE-COMPACTION CHECKPOINT ---\n';
  briefing += checkpoint + '\n\n';
}

if (useCompactBriefing) {
  // Compact mode: state already included above, just add key progress lines
  if (progress) {
    const pLines = progress.split('\n');
    const inProgressLines = [];
    const blockedLines = [];
    for (const line of pLines) {
      if (/^\s*-\s*\[ \]/.test(line) && /in.?progress|assigned|working/i.test(line)) {
        inProgressLines.push(line.trim());
      }
      if (/blocked/i.test(line) && /^\s*-/.test(line)) {
        blockedLines.push(line.trim());
      }
    }
    if (inProgressLines.length > 0) {
      briefing += '--- IN PROGRESS ---\n' + inProgressLines.slice(0, 5).join('\n') + '\n\n';
    }
    if (blockedLines.length > 0) {
      briefing += '--- BLOCKED ---\n' + blockedLines.slice(0, 3).join('\n') + '\n\n';
    }
  }
  briefing += '=== END COMPACT BRIEFING ===\n';
  briefing += 'TIP: Use memory_search(query) to find specific context. Use memory_status() for full state.\n';
  briefing += 'Read .mind/PROGRESS.md, .mind/DECISIONS.md, .mind/SESSION-LOG.md for full details.\n';
} else {
  // Full briefing mode (small projects or post-compaction)
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
      if (importantLines.length > MAX_PROGRESS_LINES) break;
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
    const recent = decisionBlocks.slice(-RECENT_DECISIONS);
    briefing += (recent.length > 0 ? recent.join('\n\n') : decisions.substring(0, 1000)) + '\n\n';
  } else {
    briefing += '(no decisions file found)\n\n';
  }

  briefing += '--- LAST SESSION (.mind/SESSION-LOG.md) ---\n';
  briefing += (sessionLog || '(no session log found)') + '\n\n';

  briefing += '=== END BRIEFING — Read CLAUDE.md for full project context ===\n';
  briefing += 'IMPORTANT: Always check .mind/STATE.md for the latest state before starting work.\n';
}

console.log(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'SessionStart',
    additionalContext: briefing
  }
}));
" "$MIND_DIR" "$SOURCE"
