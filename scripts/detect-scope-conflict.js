#!/usr/bin/env node
// =============================================================================
// MemoryForge: Scope Conflict Detector
// =============================================================================
// Detects when MemoryForge hooks are installed in BOTH global (~/.claude/)
// and project (.claude/) scopes, which causes hooks to fire twice.
//
// Usage:
//   require(): const { detectConflict } = require('./detect-scope-conflict');
//   CLI:       node detect-scope-conflict.js --scope project --target /path
//              Exit 1 if conflict, exit 0 if clean. JSON on stdout.
// =============================================================================

const fs = require('fs');
const path = require('path');
const os = require('os');

// Hook command signatures that identify MemoryForge
const MF_SIGNATURES = [
  'session-start.sh', 'session-start.js',
  'pre-compact.sh', 'pre-compact.js',
  'session-end.sh', 'session-end.js',
];

/**
 * Check if a settings.json file contains MemoryForge hook signatures.
 * Returns the list of matched hook signatures, or empty array if none.
 */
function findMfHooks(settingsPath) {
  if (!settingsPath || !fs.existsSync(settingsPath)) return [];

  // Symlink safety (per project convention)
  try {
    const stat = fs.lstatSync(settingsPath);
    if (stat.isSymbolicLink()) return [];
  } catch { return []; }

  try {
    const content = fs.readFileSync(settingsPath, 'utf-8');
    const found = [];
    for (const sig of MF_SIGNATURES) {
      if (content.includes(sig)) found.push(sig);
    }
    return found;
  } catch { return []; }
}

/**
 * Detect if MemoryForge hooks exist in the OTHER scope.
 *
 * @param {object} opts
 * @param {'project'|'global'} opts.scope - The scope being installed INTO
 * @param {string} opts.targetDir - The project directory (used when scope='project')
 * @returns {{ conflict: boolean, otherScope: string, otherPath: string, hooks: string[] }}
 */
function detectConflict({ scope, targetDir }) {
  let otherPath;
  let otherScope;

  if (scope === 'project') {
    // Installing to project → check global ~/.claude/settings.json
    otherScope = 'global';
    otherPath = path.join(os.homedir(), '.claude', 'settings.json');
  } else {
    // Installing to global → check project <targetDir>/.claude/settings.json
    otherScope = 'project';
    otherPath = path.join(targetDir, '.claude', 'settings.json');
  }

  const hooks = findMfHooks(otherPath);
  return {
    conflict: hooks.length > 0,
    otherScope,
    otherPath,
    hooks,
  };
}

// --- CLI mode ---
if (require.main === module) {
  const args = process.argv.slice(2);
  let scope = '';
  let target = '';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--scope' && args[i + 1]) { scope = args[++i]; }
    else if (args[i] === '--target' && args[i + 1]) { target = args[++i]; }
  }

  if (!scope || !['project', 'global'].includes(scope)) {
    process.stderr.write('Usage: node detect-scope-conflict.js --scope project|global --target <dir>\n');
    process.exit(2);
  }

  const result = detectConflict({ scope, targetDir: target || process.cwd() });
  process.stdout.write(JSON.stringify(result) + '\n');
  process.exit(result.conflict ? 1 : 0);
}

module.exports = { detectConflict, findMfHooks, MF_SIGNATURES };
