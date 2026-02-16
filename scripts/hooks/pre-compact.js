#!/usr/bin/env node
// =============================================================================
// MemoryForge: Pre-Compact Hook (Node.js — cross-platform)
// =============================================================================
// Fires BEFORE context compaction (manual or auto).
//
// This is CRITICAL for persistent memory. When context is about to be
// compressed, this hook:
// 1. Saves a checkpoint to .mind/checkpoints/latest.md
// 2. Outputs a context summary that may survive partial compaction
//
// After compaction, the SessionStart hook fires (source=compact) and
// re-injects the full briefing including this checkpoint. This creates
// the persistent memory loop:
//
//   work -> context grows -> pre-compact (save) -> compact -> session-start
//   (restore) -> continue working -> ...
//
// Input (stdin JSON): { session_id, trigger, custom_instructions, transcript_path }
// Output (stdout JSON): { hookSpecificOutput: { additionalContext: "..." } }
// =============================================================================

'use strict';

const fs = require('fs');
const path = require('path');

const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const MIND_DIR = path.join(PROJECT_DIR, '.mind');
const CHECKPOINT_DIR = path.join(MIND_DIR, 'checkpoints');

// Ensure directories exist
fs.mkdirSync(CHECKPOINT_DIR, { recursive: true });

// --- Read stdin ---
let input = '';
try { input = fs.readFileSync(0, 'utf-8'); } catch {}

let trigger = 'auto';
try { trigger = JSON.parse(input).trigger || 'auto'; } catch {}

// --- Helpers ---

const maxCheckpointFiles = 10;
const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace(/Z$/, 'Z');
const isoTimestamp = new Date().toISOString();

function readFile(filePath) {
  try { return fs.readFileSync(filePath, 'utf-8'); } catch { return ''; }
}

const state = readFile(path.join(MIND_DIR, 'STATE.md'));
const progress = readFile(path.join(MIND_DIR, 'PROGRESS.md'));

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

// --- Create checkpoint content ---
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

// Write checkpoint (latest always, timestamped only if last one is >5s old)
fs.writeFileSync(path.join(CHECKPOINT_DIR, 'latest.md'), checkpointContent);

let writeTimestamped = true;
try {
  const existing = fs.readdirSync(CHECKPOINT_DIR)
    .filter(f => f.startsWith('compact-') && f.endsWith('.md'))
    .sort().reverse();
  if (existing.length > 0) {
    const lastStat = fs.statSync(path.join(CHECKPOINT_DIR, existing[0]));
    if (Date.now() - lastStat.mtimeMs < 5000) writeTimestamped = false;
  }
} catch {}

if (writeTimestamped) {
  fs.writeFileSync(path.join(CHECKPOINT_DIR, 'compact-' + timestamp + '.md'), checkpointContent);
}

// --- Prune old checkpoints (max 10) ---
try {
  const files = fs.readdirSync(CHECKPOINT_DIR)
    .filter(f => f.startsWith('compact-') && f.endsWith('.md'))
    .sort()
    .reverse();
  for (const f of files.slice(maxCheckpointFiles)) {
    try { fs.unlinkSync(path.join(CHECKPOINT_DIR, f)); } catch {}
  }
} catch {}

// --- Output context summary ---
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
