#!/usr/bin/env node
// =============================================================================
// MemoryForge: Health Check CLI
// =============================================================================
// Reports the health of a MemoryForge installation in structured JSON.
//
// Checks:
//   - .mind/ directory exists with expected files
//   - File sizes and staleness
//   - Version tracking
//   - MCP server reachability
//   - Configuration validity
//   - Error log size
//
// Usage:
//   node scripts/health-check.js [project-dir]
//   node scripts/health-check.js --json            # JSON only (no stderr)
//
// Zero dependencies. Pure Node.js.
// =============================================================================

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const jsonOnly = args.includes('--json');
const projectDir = args.find(a => !a.startsWith('--')) || '.';

const MEMORYFORGE_VERSION = '1.9.0';

// --- Known config keys (shared schema) ---
const { KNOWN_CONFIG_KEYS } = require('./config-keys.js');

function fileInfo(filePath) {
  try {
    const stat = fs.statSync(filePath);
    return {
      exists: true,
      size: stat.size,
      modified: stat.mtime.toISOString(),
      ageSeconds: Math.floor((Date.now() - stat.mtimeMs) / 1000),
    };
  } catch {
    return { exists: false, size: 0, modified: null, ageSeconds: null };
  }
}

function readVersion(projectDir) {
  const versionFile = path.join(projectDir, '.memoryforge-version');
  try {
    return fs.readFileSync(versionFile, 'utf-8').trim();
  } catch {
    return null;
  }
}

function checkConfig(projectDir) {
  const configPath = path.join(projectDir, '.memoryforge.config.json');
  try {
    // Symlink check — don't follow symlinks for config
    const stat = fs.lstatSync(configPath);
    if (stat.isSymbolicLink()) {
      return { exists: true, valid: false, issues: ['Config is a symlink — refused for security'] };
    }

    const raw = fs.readFileSync(configPath, 'utf-8');
    const cfg = JSON.parse(raw);
    const issues = [];

    // Schema validation: reject unknown/typo keys (Bug #22)
    const unknownKeys = Object.keys(cfg).filter(k => !KNOWN_CONFIG_KEYS.has(k));
    if (unknownKeys.length > 0) {
      issues.push(`Unknown config key(s): ${unknownKeys.join(', ')} — check for typos`);
    }

    // Numeric validation with Number.isSafeInteger() (Bug #14)
    function checkInt(key, min, label) {
      if (cfg[key] === undefined) return;
      const n = Math.floor(Number(cfg[key]));
      if (!Number.isSafeInteger(n)) {
        issues.push(`${key} must be a safe integer`);
      } else if (n < min) {
        issues.push(`${key} must be >= ${min}${label ? ' (' + label + ')' : ''}`);
      }
    }

    checkInt('keepSessionsFull', 1);
    checkInt('keepDecisionsFull', 1);
    checkInt('archiveAfterDays', 1);
    checkInt('trackingMaxLines', 10);
    checkInt('compressThresholdBytes', 1000);
    checkInt('sessionLogTailLines', 1);
    checkInt('briefingRecentDecisions', 1);
    checkInt('briefingMaxProgressLines', 1);
    checkInt('maxCheckpointFiles', 3);
    checkInt('staleWarningSeconds', 60);

    return { exists: true, valid: issues.length === 0, issues };
  } catch (err) {
    if (err.code === 'ENOENT') return { exists: false, valid: true, issues: [] };
    return { exists: true, valid: false, issues: ['Invalid JSON: ' + err.message] };
  }
}

// --- Run health check ---

const mindDir = path.join(projectDir, '.mind');
const stateFiles = ['STATE.md', 'PROGRESS.md', 'DECISIONS.md', 'SESSION-LOG.md'];
const trackingFiles = ['.last-activity', '.agent-activity', '.task-completions', '.session-tracking', '.file-tracker'];

const report = {
  version: {
    current: MEMORYFORGE_VERSION,
    installed: readVersion(projectDir),
    upToDate: readVersion(projectDir) === MEMORYFORGE_VERSION,
  },
  mindDir: {
    exists: fs.existsSync(mindDir),
    path: path.resolve(mindDir),
  },
  stateFiles: {},
  trackingFiles: {},
  config: checkConfig(projectDir),
  errorLog: fileInfo(path.join(mindDir, '.mcp-errors.log')),
  mcpConfig: fileInfo(path.join(projectDir, '.mcp.json')),
  hooksConfig: fileInfo(path.join(projectDir, '.claude', 'settings.json')),
  issues: [],
  status: 'healthy',
};

// Check state files
let totalSize = 0;
for (const file of stateFiles) {
  const info = fileInfo(path.join(mindDir, file));
  report.stateFiles[file] = info;
  totalSize += info.size;
}
report.mindDir.totalStateSize = totalSize;

// Check tracking files
for (const file of trackingFiles) {
  report.trackingFiles[file] = fileInfo(path.join(mindDir, file));
}

// Identify issues
if (!report.mindDir.exists) {
  report.issues.push({ severity: 'error', message: '.mind/ directory not found' });
}
if (!report.stateFiles['STATE.md'].exists) {
  report.issues.push({ severity: 'error', message: '.mind/STATE.md not found — run installer' });
}
if (report.stateFiles['STATE.md'].exists && report.stateFiles['STATE.md'].ageSeconds > 86400) {
  report.issues.push({ severity: 'warning', message: 'STATE.md not updated in 24+ hours' });
}
if (!report.mcpConfig.exists) {
  report.issues.push({ severity: 'warning', message: '.mcp.json not found — MCP tools unavailable' });
}
if (!report.hooksConfig.exists) {
  report.issues.push({ severity: 'warning', message: '.claude/settings.json not found — hooks not configured' });
}
if (report.errorLog.exists && report.errorLog.size > 100 * 1024) {
  report.issues.push({ severity: 'warning', message: `.mcp-errors.log is ${Math.round(report.errorLog.size / 1024)}KB — consider rotation` });
}
if (!report.version.installed) {
  report.issues.push({ severity: 'info', message: 'No version file — run installer to create .memoryforge-version' });
} else if (!report.version.upToDate) {
  report.issues.push({ severity: 'info', message: `Installed version ${report.version.installed} differs from ${report.version.current}` });
}
if (report.config.issues.length > 0) {
  for (const issue of report.config.issues) {
    report.issues.push({ severity: 'warning', message: `Config: ${issue}` });
  }
}
if (totalSize > 50000) {
  report.issues.push({ severity: 'warning', message: `.mind/ state files are ${Math.round(totalSize / 1024)}KB — run compression` });
}

// Set overall status
const errorCount = report.issues.filter(i => i.severity === 'error').length;
const warnCount = report.issues.filter(i => i.severity === 'warning').length;
if (errorCount > 0) report.status = 'error';
else if (warnCount > 0) report.status = 'warning';

// --- Watch/daemon mode (Bug #6) ---
const watchMode = args.includes('--watch');
const watchInterval = (() => {
  const idx = args.indexOf('--interval');
  if (idx !== -1 && args[idx + 1]) {
    const val = parseInt(args[idx + 1]);
    return Number.isFinite(val) && val >= 1 ? val : 30;
  }
  return 30;
})();

function printReport() {
  console.log(JSON.stringify(report, null, 2));

  // Human-readable summary to stderr
  if (!jsonOnly) {
    const icon = { healthy: 'OK', warning: '!!', error: 'ERR' };
    process.stderr.write(`\nMemoryForge Health Check [${icon[report.status]}]\n`);
    process.stderr.write(`  Version: ${report.version.installed || 'unknown'} (latest: ${report.version.current})\n`);
    process.stderr.write(`  .mind/ size: ${Math.round(totalSize / 1024)}KB across ${stateFiles.filter(f => report.stateFiles[f].exists).length} state files\n`);

    if (report.issues.length === 0) {
      process.stderr.write('  No issues found.\n');
    } else {
      for (const issue of report.issues) {
        const tag = issue.severity === 'error' ? 'ERR' : issue.severity === 'warning' ? 'WARN' : 'INFO';
        process.stderr.write(`  [${tag}] ${issue.message}\n`);
      }
    }
    process.stderr.write('\n');
  }
}

printReport();

// Exit with non-zero code for monitoring integration
if (watchMode) {
  process.stderr.write(`Watching every ${watchInterval}s (Ctrl+C to stop)...\n`);
  setInterval(() => {
    // Re-run the check using execFileSync to avoid shell injection (Bug #2 R8)
    try {
      const { execFileSync } = require('child_process');
      const watchArgs = args.filter((a, i, arr) => a !== '--watch' && !a.startsWith('--interval') && (i === 0 || arr[i - 1] !== '--interval'));
      const result = execFileSync(process.execPath, [__filename, '--json', ...watchArgs], { timeout: 10000 });
      process.stdout.write(result);
      process.stdout.write('\n');
    } catch (err) {
      process.stderr.write(`[watch] Check failed: ${err.message}\n`);
    }
  }, watchInterval * 1000);
} else {
  process.exitCode = report.status === 'error' ? 2 : report.status === 'warning' ? 1 : 0;
}
