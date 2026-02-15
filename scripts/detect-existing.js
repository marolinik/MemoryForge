#!/usr/bin/env node
// =============================================================================
// MemoryForge: Existing Memory System Detector
// =============================================================================
// Checks a project directory for known Claude Code memory systems.
// Returns JSON with findings and recommendations.
//
// Usage: node detect-existing.js <project-dir>
// =============================================================================

const fs = require('fs');
const path = require('path');

const projectDir = process.argv[2] || '.';
const findings = [];

function exists(p) {
  try { return fs.existsSync(path.join(projectDir, p)); }
  catch { return false; }
}

function contains(filePath, pattern) {
  try {
    const content = fs.readFileSync(path.join(projectDir, filePath), 'utf-8');
    return pattern instanceof RegExp ? pattern.test(content) : content.includes(pattern);
  } catch { return false; }
}

// --- Check for known memory systems ---

// claude-mem
if (exists('.claude-memory') || exists('.claude-mem')) {
  findings.push({
    system: 'claude-mem',
    evidence: '.claude-memory or .claude-mem directory found',
    coexist: true,
    note: 'claude-mem stores facts in a flat file. MemoryForge uses structured state. They can coexist — different purposes.'
  });
}

// MEMORY.md pattern (used by several tools)
if (exists('MEMORY.md')) {
  findings.push({
    system: 'MEMORY.md',
    evidence: 'MEMORY.md file found in project root',
    coexist: true,
    note: 'MEMORY.md is a common Claude memory file. MemoryForge uses .mind/ instead. They can coexist.'
  });
}

// Continuous-Claude
if (exists('.claude/ledger') || exists('.ledger')) {
  findings.push({
    system: 'Continuous-Claude',
    evidence: 'Ledger directory found',
    coexist: 'partial',
    note: 'Continuous-Claude uses ledger files + hooks. Check for hook conflicts in .claude/settings.json.'
  });
}

// super-claude-kit / TOON format
if (exists('.toon') || exists('TOON.md')) {
  findings.push({
    system: 'super-claude-kit',
    evidence: '.toon directory or TOON.md found',
    coexist: true,
    note: 'TOON format and MemoryForge serve different purposes. They can coexist.'
  });
}

// claude-cognitive
if (contains('.claude/settings.json', 'cognitive') || exists('.cognitive')) {
  findings.push({
    system: 'claude-cognitive',
    evidence: 'Cognitive memory references found',
    coexist: 'partial',
    note: 'claude-cognitive uses HOT/WARM/COLD scoring. Check for hook conflicts.'
  });
}

// Existing .mind/ directory (from manual setup or previous MemoryForge)
if (exists('.mind/STATE.md')) {
  findings.push({
    system: 'existing-mind',
    evidence: '.mind/STATE.md already exists',
    coexist: true,
    note: 'Existing .mind/ state files detected. Installer will preserve them (skip existing files).'
  });
}

// Existing hooks in settings.json
if (exists('.claude/settings.json')) {
  const hasSessionStart = contains('.claude/settings.json', 'SessionStart');
  const hasPreCompact = contains('.claude/settings.json', 'PreCompact');
  const hasMfHooks = contains('.claude/settings.json', 'session-start.sh');

  if (hasMfHooks) {
    findings.push({
      system: 'memoryforge',
      evidence: 'MemoryForge hooks already in settings.json',
      coexist: true,
      note: 'MemoryForge is already installed. Re-running will skip existing configuration.'
    });
  } else if (hasSessionStart || hasPreCompact) {
    findings.push({
      system: 'custom-hooks',
      evidence: `Existing hooks found: ${[hasSessionStart && 'SessionStart', hasPreCompact && 'PreCompact'].filter(Boolean).join(', ')}`,
      coexist: true,
      note: 'You have existing hooks. The installer will use smart merge to add MemoryForge hooks alongside yours.'
    });
  }
}

// MCP memory servers
if (contains('.claude/settings.json', 'memory') && contains('.claude/settings.json', 'mcp')) {
  findings.push({
    system: 'mcp-memory',
    evidence: 'MCP memory server reference in settings.json',
    coexist: true,
    note: 'MCP memory servers and MemoryForge serve different layers. They coexist well.'
  });
}

// Output results
const result = {
  project: path.resolve(projectDir),
  findings_count: findings.length,
  can_install: true,
  warnings: [],
  findings
};

// Determine if any findings block installation
for (const f of findings) {
  if (f.coexist === false) {
    result.can_install = false;
    result.warnings.push(`Conflict: ${f.system} — ${f.note}`);
  } else if (f.coexist === 'partial') {
    result.warnings.push(`Caution: ${f.system} — ${f.note}`);
  }
}

console.log(JSON.stringify(result, null, 2));
