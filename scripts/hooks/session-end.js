#!/usr/bin/env node
// =============================================================================
// MemoryForge: Session End Hook (Node.js — cross-platform)
// =============================================================================
// Fires when a session terminates (clear, logout, exit).
//
// 1. Writes .last-activity timestamp
// 2. Tracks file changes via git diff
// 3. Logs session end to .session-tracking
// 4. Auto-generates session summary if SESSION-LOG.md wasn't updated
// 5. Warns if STATE.md is stale
// 6. Creates a session-end checkpoint
//
// Input (stdin JSON): { session_id, reason, transcript_path }
// Output: stderr only (SessionEnd doesn't support additionalContext)
// =============================================================================

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const MIND_DIR = path.join(PROJECT_DIR, '.mind');
const TIMESTAMP = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
const DATE_SHORT = new Date().toISOString().split('T')[0];

// Ensure directories exist
fs.mkdirSync(path.join(MIND_DIR, 'checkpoints'), { recursive: true });

// --- Write .last-activity timestamp ---
try { fs.writeFileSync(path.join(MIND_DIR, '.last-activity'), TIMESTAMP + '\n'); } catch {}

// --- File change tracking via git ---
const trackerPath = path.join(MIND_DIR, '.file-tracker');

try {
  // Check if we're in a git repo
  execSync('git rev-parse --is-inside-work-tree', { cwd: PROJECT_DIR, stdio: 'ignore' });

  const gitCommands = [
    'git diff --name-only HEAD',
    'git diff --staged --name-only',
    'git ls-files --others --exclude-standard'
  ];

  const allFiles = new Set();
  for (const cmd of gitCommands) {
    try {
      const output = execSync(cmd, { cwd: PROJECT_DIR, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] });
      for (const line of output.split('\n')) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('.mind/')) {
          allFiles.add(trimmed);
        }
      }
    } catch {}
  }

  if (allFiles.size > 0) {
    // Read existing tracker
    let existing = '';
    try { existing = fs.readFileSync(trackerPath, 'utf-8'); } catch {
      existing = '# Session file changes (tracked at ' + TIMESTAMP + ')\n';
    }

    // Append new files not already tracked
    let updated = existing;
    for (const file of allFiles) {
      if (!existing.includes(file)) {
        updated += file + '\n';
      }
    }

    if (updated !== existing) {
      fs.writeFileSync(trackerPath, updated);
    }
  }
} catch {
  // Not a git repo or git not available — skip
}

// --- Read stdin for reason ---
let input = '';
try { input = fs.readFileSync(0, 'utf-8'); } catch {}

let reason = 'unknown';
try { reason = JSON.parse(input).reason || 'unknown'; } catch {}

// --- Log session end ---
try {
  fs.appendFileSync(
    path.join(MIND_DIR, '.session-tracking'),
    'Session ended: ' + TIMESTAMP + ' (reason: ' + reason + ')\n'
  );
} catch {}

// --- Auto Session Summary ---
const sessionLogPath = path.join(MIND_DIR, 'SESSION-LOG.md');
let sessionLogStale = true;

try {
  const stat = fs.statSync(sessionLogPath);
  const ageMs = Date.now() - stat.mtimeMs;
  // If updated in last 30 min, consider it fresh
  if (ageMs < 30 * 60 * 1000) {
    sessionLogStale = false;
  }
} catch {
  // File doesn't exist — stale by default
}

if (sessionLogStale && fs.existsSync(trackerPath)) {
  try {
    const trackerContent = fs.readFileSync(trackerPath, 'utf-8');
    const trackedFiles = trackerContent.split('\n').filter(l => l.trim() && !l.startsWith('#'));
    const fileCount = trackedFiles.length;

    if (fileCount > 0) {
      // Determine next session number
      let lastNum = 0;
      try {
        const logContent = fs.readFileSync(sessionLogPath, 'utf-8');
        const matches = logContent.match(/^## Session (\d+)/gm) || [];
        for (const m of matches) {
          const num = parseInt(m.replace('## Session ', ''));
          if (num > lastNum) lastNum = num;
        }
      } catch {}
      const nextNum = lastNum + 1;

      // Build file list (max 15)
      const shownFiles = trackedFiles.slice(0, 15).map(f => '  - ' + f).join('\n');
      const remaining = fileCount - 15;

      let entry = '\n## Session ' + nextNum + ' \u2014 ' + DATE_SHORT + ' (auto-captured)\n';
      entry += '- **Reason ended:** ' + reason + '\n';
      entry += '- **Files changed:** ' + fileCount + '\n';
      entry += shownFiles + '\n';
      if (remaining > 0) {
        entry += '  - ... and ' + remaining + ' more\n';
      }
      entry += '- **Note:** This entry was auto-generated because SESSION-LOG.md wasn\'t updated manually.\n';
      entry += '  Review and enrich with context about what was accomplished.\n';

      // Append to session log
      let existing = '';
      try { existing = fs.readFileSync(sessionLogPath, 'utf-8'); } catch {
        existing = '# Session Log\n';
      }
      fs.writeFileSync(sessionLogPath, existing + entry);
      process.stderr.write('Auto-generated session summary (' + fileCount + ' files tracked).\n');
    }
  } catch {}
}

// --- Clean up file tracker for next session ---
try { fs.unlinkSync(trackerPath); } catch {}

// --- Warn if STATE.md is stale ---
try {
  const stateMd = path.join(MIND_DIR, 'STATE.md');
  if (fs.existsSync(stateMd)) {
    const stat = fs.statSync(stateMd);
    const ageMs = Date.now() - stat.mtimeMs;
    if (ageMs > 30 * 60 * 1000) {
      process.stderr.write('WARNING: .mind/STATE.md was not updated during this session. Progress may be lost.\n');
      process.stderr.write('Update .mind/ files before ending to preserve progress.\n');
    }
  }
} catch {}

// --- Create session-end checkpoint ---
const checkpointContent = '# Session End Checkpoint\n' +
  '## Timestamp: ' + TIMESTAMP + '\n' +
  '## Reason: ' + reason + '\n' +
  '## Note: State may not have been saved. Check .mind/STATE.md freshness.\n';

try {
  fs.writeFileSync(path.join(MIND_DIR, 'checkpoints', 'session-end-latest.md'), checkpointContent);
} catch {}

// Exit 0 — don't block session end
process.exit(0);
