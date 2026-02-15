#!/usr/bin/env bash
# =============================================================================
# MemoryForge: Pre-Compact Hook
# =============================================================================
# Fires BEFORE context compaction (manual or auto).
#
# This is CRITICAL for persistent memory. When context is about to be
# compressed, this hook:
# 1. Saves a checkpoint to .mind/checkpoints/latest.md
# 2. Outputs a context summary that may survive partial compaction
#
# After compaction, the SessionStart hook fires (source=compact) and
# re-injects the full briefing including this checkpoint. This creates
# the persistent memory loop:
#
#   work -> context grows -> pre-compact (save) -> compact -> session-start
#   (restore) -> continue working -> ...
#
# Input (stdin JSON): { session_id, trigger, custom_instructions, transcript_path }
# Output (stdout JSON): { hookSpecificOutput: { additionalContext: "..." } }
# =============================================================================

set -euo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"
MIND_DIR="$PROJECT_DIR/.mind"
CHECKPOINT_DIR="$MIND_DIR/checkpoints"

mkdir -p "$CHECKPOINT_DIR"

# Read stdin for trigger info
INPUT=$(cat)
TRIGGER=$(echo "$INPUT" | node -e "
  let d='';process.stdin.on('data',c=>d+=c);
  process.stdin.on('end',()=>{try{console.log(JSON.parse(d).trigger||'auto')}catch{console.log('auto')}})
" 2>/dev/null || echo "auto")

# --- Let Node.js handle everything (avoids argv size limits) ---
node -e "
const fs = require('fs');
const path = require('path');

const mindDir = process.argv[1];
const trigger = process.argv[2];
const checkpointDir = path.join(mindDir, 'checkpoints');

const maxCheckpointFiles = 10;
const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace(/Z$/, 'Z');
const isoTimestamp = new Date().toISOString();

function readFile(filePath) {
  try { return fs.readFileSync(filePath, 'utf-8'); }
  catch { return ''; }
}

const state = readFile(path.join(mindDir, 'STATE.md'));
const progress = readFile(path.join(mindDir, 'PROGRESS.md'));

// Extract in-progress and blocked lines from progress
let progressSummary = '(no progress data)';
if (progress) {
  const lines = progress.split('\n');
  const relevant = [];
  let capture = false;
  for (const line of lines) {
    if (line.includes('In Progress') || line.includes('Blocked') || line.includes('What') || line.includes('Next')) {
      capture = true;
    }
    if (capture) relevant.push(line);
    if (relevant.length > 20) break;
  }
  if (relevant.length > 0) progressSummary = relevant.join('\n');
}

// Create checkpoint content
const checkpointContent = [
  '# Pre-Compaction Checkpoint',
  '## Timestamp: ' + isoTimestamp,
  '## Trigger: ' + trigger,
  '',
  '## State at Compaction',
  state || '(no state)',
  '',
  '## In-Progress Work',
  progressSummary,
  '',
  '## Recovery Instructions',
  'After compaction, the session-start hook will re-inject the full briefing.',
  'Check .mind/STATE.md for authoritative current state.',
  'If STATE.md seems stale, re-read PROGRESS.md and SESSION-LOG.md for the latest.',
  ''
].join('\n');

// Write checkpoint (latest always, timestamped only if last one is >5s old to prevent rapid-fire)
fs.writeFileSync(path.join(checkpointDir, 'latest.md'), checkpointContent);
let writeTimestamped = true;
try {
  const existing = fs.readdirSync(checkpointDir)
    .filter(f => f.startsWith('compact-') && f.endsWith('.md'))
    .sort().reverse();
  if (existing.length > 0) {
    const lastStat = fs.statSync(path.join(checkpointDir, existing[0]));
    if (Date.now() - lastStat.mtimeMs < 5000) writeTimestamped = false;
  }
} catch {}
if (writeTimestamped) {
  fs.writeFileSync(path.join(checkpointDir, 'compact-' + timestamp + '.md'), checkpointContent);
}

// Prune old checkpoints (configurable, default 10) — prevents unbounded creation (Bug #17)
try {
  const files = fs.readdirSync(checkpointDir)
    .filter(f => f.startsWith('compact-') && f.endsWith('.md'))
    .sort()
    .reverse();
  for (const f of files.slice(maxCheckpointFiles)) {
    try { fs.unlinkSync(path.join(checkpointDir, f)); } catch {}
  }
} catch {}

// Output context summary
let context = '=== PRE-COMPACTION STATE CHECKPOINT (' + isoTimestamp + ') ===\n';
context += 'Context is about to be compacted. Key state preserved:\n\n';
context += '## Current State\n';
context += (state || '(no state)') + '\n\n';
context += '## Active Work\n';
context += progressSummary + '\n\n';
context += 'AFTER COMPACTION: Read .mind/STATE.md for full state restoration.\n';
context += '=== END CHECKPOINT ===\n';

console.log(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'PreCompact',
    additionalContext: context
  }
}));
" "$MIND_DIR" "$TRIGGER"
