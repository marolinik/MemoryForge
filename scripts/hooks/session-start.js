#!/usr/bin/env node
// =============================================================================
// MemoryForge: Session Start Hook (Node.js — cross-platform)
// =============================================================================
// Fires on: startup, resume, after compact (context compaction)
//
// This is the PRIMARY mechanism for persistent memory. It reads .mind/ state
// files and injects a "Morning Briefing" into Claude's context. Critically,
// this also fires AFTER context compaction (source=compact), which means
// the briefing is re-injected every time context is compressed — ensuring
// continuity even through compaction cycles.
//
// The Persistent Memory Loop:
//   work -> context grows -> pre-compact (save) -> compact -> session-start
//   (restore) -> continue working -> ...
//
// Input (stdin JSON): { session_id, source, model, transcript_path, cwd }
// Output (stdout JSON): { hookSpecificOutput: { additionalContext: "..." } }
// =============================================================================

'use strict';

const fs = require('fs');
const path = require('path');

const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const MIND_DIR = path.join(PROJECT_DIR, '.mind');

// --- Read stdin ---
let input = '';
try { input = fs.readFileSync(0, 'utf-8'); } catch {}

let source = 'startup';
try { source = JSON.parse(input).source || 'startup'; } catch {}

// --- Spawn background update checker (non-blocking) ---
const checkUpdateScript = path.join(path.dirname(__filename), 'check-update.js');
if (fs.existsSync(checkUpdateScript)) {
  try {
    const { spawn } = require('child_process');
    const child = spawn(process.execPath, [checkUpdateScript], {
      stdio: 'ignore',
      detached: true,
      windowsHide: true,
      env: { ...process.env, CLAUDE_PROJECT_DIR: PROJECT_DIR }
    });
    child.unref();
  } catch {}
}

// --- File rotation helpers ---

function rotateBySize(filePath, maxBytes, keepLines) {
  try {
    const stat = fs.statSync(filePath);
    if (stat.size > maxBytes) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      const kept = lines.slice(-keepLines).join('\n');
      const tmp = filePath + '.tmp.' + process.pid;
      fs.writeFileSync(tmp, kept, 'utf-8');
      fs.renameSync(tmp, filePath);
    }
  } catch {}
}

function rotateByLines(filePath, maxLines, keepLines) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lineCount = content.split('\n').length;
    if (lineCount > maxLines) {
      const lines = content.split('\n');
      const kept = lines.slice(-keepLines).join('\n');
      const tmp = filePath + '.tmp.' + process.pid;
      fs.writeFileSync(tmp, kept, 'utf-8');
      fs.renameSync(tmp, filePath);
    }
  } catch {}
}

// --- Rotate .mcp-errors.log if >100KB (keep last 500 lines) ---
rotateBySize(path.join(MIND_DIR, '.mcp-errors.log'), 102400, 500);

// --- Rotate tracking files if >200 lines (keep last 100) ---
for (const name of ['.agent-activity', '.task-completions', '.session-tracking']) {
  rotateByLines(path.join(MIND_DIR, name), 200, 100);
}

// --- Auto-compress if .mind/ files are large ---
const COMPRESS_THRESHOLD = 12000;

if (fs.existsSync(MIND_DIR)) {
  let totalSize = 0;
  for (const name of ['STATE.md', 'PROGRESS.md', 'DECISIONS.md', 'SESSION-LOG.md']) {
    try { totalSize += fs.statSync(path.join(MIND_DIR, name)).size; } catch {}
  }

  if (totalSize > COMPRESS_THRESHOLD) {
    // Find compress script relative to this hook
    const scriptDir = path.dirname(__filename);
    const candidates = [
      path.join(scriptDir, '..', 'compress-sessions.js'),
      path.join(PROJECT_DIR, 'scripts', 'compress-sessions.js')
    ];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        try {
          require('child_process').execFileSync(process.execPath, [candidate, '--', MIND_DIR], {
            stdio: 'ignore',
            timeout: 10000
          });
        } catch {}
        break;
      }
    }
  }
}

// --- Build briefing ---

const SESSION_LOG_TAIL = 20;
const RECENT_DECISIONS = 5;
const MAX_PROGRESS_LINES = 40;

function readFile(filePath) {
  try { return fs.readFileSync(filePath, 'utf-8'); } catch { return ''; }
}

function readTail(filePath, lines) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const arr = content.split('\n');
    return arr.slice(-lines).join('\n');
  } catch { return ''; }
}

const state = readFile(path.join(MIND_DIR, 'STATE.md'));
const progress = readFile(path.join(MIND_DIR, 'PROGRESS.md'));
const decisions = readFile(path.join(MIND_DIR, 'DECISIONS.md'));
const sessionLog = readTail(path.join(MIND_DIR, 'SESSION-LOG.md'), SESSION_LOG_TAIL);
const checkpoint = readFile(path.join(MIND_DIR, 'checkpoints', 'latest.md'));

// Calculate total .mind/ size to decide briefing depth
const totalSize = [state, progress, decisions, sessionLog].reduce(
  (sum, content) => sum + (content ? content.length : 0), 0
);

// Progressive briefing: compact (~200 tokens) for large projects,
// full briefing for small projects. Threshold: 8KB (~2000 tokens)
const PROGRESSIVE_THRESHOLD = 8000;
const useCompactBriefing = totalSize > PROGRESSIVE_THRESHOLD && source !== 'compact';

// Build briefing header
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

// --- Update notification (read from cached check) ---
try {
  const os = require('os');
  const cacheFile = path.join(os.homedir(), '.claude', 'cache', 'memoryforge-update-check.json');
  if (fs.existsSync(cacheFile)) {
    const cache = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
    if (cache.update_available && cache.latest && cache.latest !== 'unknown') {
      briefing += '\n--- UPDATE AVAILABLE ---\n';
      briefing += `MemoryForge ${cache.latest} is available (installed: ${cache.installed}). `;
      briefing += 'To update: cd MemoryForge && git pull && node setup.js\n';
    }
  }
} catch {}

// --- Output ---
console.log(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'SessionStart',
    additionalContext: briefing
  }
}));
