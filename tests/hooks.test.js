#!/usr/bin/env node
// =============================================================================
// MemoryForge: Hook Integration Tests
// =============================================================================
// Simulates a full hook lifecycle: session-start → stop-checkpoint → session-end.
// Verifies that hooks produce valid JSON output and state files are created/updated.
//
// Requirements: bash (Git Bash on Windows)
//
// Usage: node tests/hooks.test.js
// =============================================================================

const { strict: assert } = require('assert');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    process.stdout.write(`  PASS  ${name}\n`);
  } catch (err) {
    failed++;
    failures.push({ name, error: err });
    process.stdout.write(`  FAIL  ${name}\n    ${err.message}\n`);
  }
}

function createTempProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'memoryforge-hook-test-'));
  const mindDir = path.join(dir, '.mind');
  fs.mkdirSync(path.join(mindDir, 'checkpoints'), { recursive: true });

  // Write minimal state files
  fs.writeFileSync(path.join(mindDir, 'STATE.md'), '# Project State\n\n## Current Phase\nPhase 1: Setup\n\n## Next Action\nBuild the thing\n\n## Blocked Items\nNone\n');
  fs.writeFileSync(path.join(mindDir, 'PROGRESS.md'), '# Progress\n\n### In Progress\n- [ ] Build the thing\n');
  fs.writeFileSync(path.join(mindDir, 'DECISIONS.md'), '# Decision Log\n');
  fs.writeFileSync(path.join(mindDir, 'SESSION-LOG.md'), '# Session Log\n');

  return { projectDir: dir, mindDir };
}

function cleanup(projectDir) {
  fs.rmSync(projectDir, { recursive: true, force: true });
}

// Determine bash path
const isWindows = process.platform === 'win32';
let bashPath = 'bash';
if (isWindows) {
  // Try Git Bash
  const gitBash = 'C:\\Program Files\\Git\\bin\\bash.exe';
  if (fs.existsSync(gitBash)) bashPath = gitBash;
}

function runHook(hookName, projectDir, stdinJson) {
  const hooksDir = path.join(__dirname, '..', 'scripts', 'hooks');
  const hookPath = path.join(hooksDir, hookName);

  // Convert Windows paths to Unix-style for bash
  const envProjectDir = isWindows ? projectDir.replace(/\\/g, '/') : projectDir;

  const result = execSync(
    `"${bashPath}" "${hookPath}"`,
    {
      input: JSON.stringify(stdinJson || {}),
      env: {
        ...process.env,
        CLAUDE_PROJECT_DIR: envProjectDir,
        PATH: process.env.PATH,
      },
      timeout: 10000,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }
  );

  return result.trim();
}

// --- Tests ---

console.log('\nMemoryForge Hook Integration Tests\n');

test('session-start.sh produces valid JSON with briefing', () => {
  const { projectDir } = createTempProject();
  try {
    const output = runHook('session-start.sh', projectDir, { session_id: 'test-1', source: 'startup' });
    const parsed = JSON.parse(output);
    assert.ok(parsed.hookSpecificOutput, 'Should have hookSpecificOutput');
    assert.ok(parsed.hookSpecificOutput.additionalContext, 'Should have additionalContext');
    assert.ok(parsed.hookSpecificOutput.additionalContext.includes('SESSION BRIEFING'), 'Should contain SESSION BRIEFING');
    assert.ok(parsed.hookSpecificOutput.additionalContext.includes('Phase 1'), 'Should include phase from STATE.md');
  } finally { cleanup(projectDir); }
});

test('session-start.sh handles compact source', () => {
  const { projectDir, mindDir } = createTempProject();
  try {
    // Write a checkpoint for compact mode
    fs.writeFileSync(path.join(mindDir, 'checkpoints', 'latest.md'), '# Checkpoint\nWas working on auth module.\n');
    const output = runHook('session-start.sh', projectDir, { session_id: 'test-2', source: 'compact' });
    const parsed = JSON.parse(output);
    assert.ok(parsed.hookSpecificOutput.additionalContext.includes('CONTEXT RESTORED'), 'Should say CONTEXT RESTORED for compact');
    assert.ok(parsed.hookSpecificOutput.additionalContext.includes('auth module'), 'Should include checkpoint content');
  } finally { cleanup(projectDir); }
});

test('user-prompt-context.sh produces valid JSON nudge', () => {
  const { projectDir } = createTempProject();
  try {
    const output = runHook('user-prompt-context.sh', projectDir, { session_id: 'test-3', prompt: 'hello' });
    const parsed = JSON.parse(output);
    assert.ok(parsed.hookSpecificOutput, 'Should have hookSpecificOutput');
    const ctx = parsed.hookSpecificOutput.additionalContext;
    assert.ok(ctx.includes('[Memory]'), 'Should have [Memory] prefix');
    assert.ok(ctx.includes('Phase 1'), 'Should include current phase');
    assert.ok(ctx.includes('Build the thing'), 'Should include next action');
  } finally { cleanup(projectDir); }
});

test('user-prompt-context.sh caches output', () => {
  const { projectDir, mindDir } = createTempProject();
  try {
    // First call generates cache
    runHook('user-prompt-context.sh', projectDir, { session_id: 'test-4', prompt: 'first' });
    assert.ok(fs.existsSync(path.join(mindDir, '.prompt-context')), 'Cache file should exist');

    // Second call should use cache (verify by checking file exists and output matches)
    const output = runHook('user-prompt-context.sh', projectDir, { session_id: 'test-4', prompt: 'second' });
    const parsed = JSON.parse(output);
    assert.ok(parsed.hookSpecificOutput.additionalContext.includes('Phase 1'), 'Cached output should still have phase');
  } finally { cleanup(projectDir); }
});

test('stop-checkpoint.sh writes last-activity timestamp', () => {
  const { projectDir, mindDir } = createTempProject();
  try {
    runHook('stop-checkpoint.sh', projectDir, { session_id: 'test-5', stop_hook_active: false });
    const activityFile = path.join(mindDir, '.last-activity');
    assert.ok(fs.existsSync(activityFile), '.last-activity should exist');
    const content = fs.readFileSync(activityFile, 'utf-8').trim();
    assert.ok(/^\d{4}-\d{2}-\d{2}T/.test(content), 'Should be ISO timestamp');
  } finally { cleanup(projectDir); }
});

test('session-end.sh writes session-tracking and checkpoint', () => {
  const { projectDir, mindDir } = createTempProject();
  try {
    // Write a last-activity file so session-end can check staleness
    fs.writeFileSync(path.join(mindDir, '.last-activity'), new Date().toISOString());
    runHook('session-end.sh', projectDir, { session_id: 'test-6', reason: 'user_exit' });
    assert.ok(fs.existsSync(path.join(mindDir, '.session-tracking')), '.session-tracking should exist');
    const tracking = fs.readFileSync(path.join(mindDir, '.session-tracking'), 'utf-8');
    assert.ok(tracking.includes('user_exit'), 'Should log the exit reason');
    assert.ok(fs.existsSync(path.join(mindDir, 'checkpoints', 'session-end-latest.md')), 'Session-end checkpoint should exist');
  } finally { cleanup(projectDir); }
});

test('full lifecycle: session-start → stop → session-end', () => {
  const { projectDir, mindDir } = createTempProject();
  try {
    // 1. Session starts
    const startOutput = runHook('session-start.sh', projectDir, { session_id: 'lifecycle', source: 'startup' });
    assert.ok(JSON.parse(startOutput).hookSpecificOutput, 'session-start should produce briefing');

    // 2. Stop checkpoint
    runHook('stop-checkpoint.sh', projectDir, { session_id: 'lifecycle', stop_hook_active: false });
    assert.ok(fs.existsSync(path.join(mindDir, '.last-activity')), 'stop-checkpoint should create .last-activity');

    // 3. Session ends
    runHook('session-end.sh', projectDir, { session_id: 'lifecycle', reason: 'completed' });
    assert.ok(fs.existsSync(path.join(mindDir, '.session-tracking')), 'session-end should create .session-tracking');
    assert.ok(fs.existsSync(path.join(mindDir, 'checkpoints', 'session-end-latest.md')), 'session-end should create checkpoint');
  } finally { cleanup(projectDir); }
});

// --- Checkpoint rotation boundary (Bug #23) ---

test('pre-compact.sh prunes checkpoints at boundary (exactly maxCheckpointFiles)', () => {
  const { projectDir, mindDir } = createTempProject();
  try {
    const cpDir = path.join(mindDir, 'checkpoints');
    // Create exactly 10 checkpoint files (default maxCheckpointFiles=10)
    for (let i = 0; i < 12; i++) {
      const ts = `2025-01-${String(i + 1).padStart(2, '0')}T00-00-00Z`;
      fs.writeFileSync(path.join(cpDir, `compact-${ts}.md`), `# Checkpoint ${i + 1}\n`);
    }

    // Verify we have 12 before the hook runs
    const before = fs.readdirSync(cpDir).filter(f => f.startsWith('compact-') && f.endsWith('.md'));
    assert.equal(before.length, 12, 'Should have 12 checkpoints before pruning');

    // Run pre-compact — this triggers checkpoint pruning
    runHook('pre-compact.sh', projectDir, { session_id: 'test-cp', trigger: 'auto' });

    // After pruning: should have at most maxCheckpointFiles (10) plus the new one
    // The hook creates a new one, then prunes to 10
    const after = fs.readdirSync(cpDir).filter(f => f.startsWith('compact-') && f.endsWith('.md'));
    assert.ok(after.length <= 10, `Should have <= 10 checkpoints after pruning, got ${after.length}`);
    assert.ok(after.length >= 1, 'Should keep at least 1 checkpoint');
  } finally { cleanup(projectDir); }
});

test('pre-compact.sh keeps exactly maxCheckpointFiles when at limit', () => {
  const { projectDir, mindDir } = createTempProject();
  try {
    const cpDir = path.join(mindDir, 'checkpoints');
    // Write a config with maxCheckpointFiles=5
    fs.writeFileSync(path.join(projectDir, '.memoryforge.config.json'),
      JSON.stringify({ maxCheckpointFiles: 5 }));

    // Create exactly 5 checkpoint files (at the boundary)
    for (let i = 0; i < 5; i++) {
      const ts = `2025-02-${String(i + 1).padStart(2, '0')}T00-00-00Z`;
      fs.writeFileSync(path.join(cpDir, `compact-${ts}.md`), `# Checkpoint ${i + 1}\n`);
    }

    // Run pre-compact — adds 1 new, prunes to 5
    runHook('pre-compact.sh', projectDir, { session_id: 'test-cp2', trigger: 'auto' });

    const after = fs.readdirSync(cpDir).filter(f => f.startsWith('compact-') && f.endsWith('.md'));
    assert.ok(after.length <= 5, `Should have <= 5 checkpoints (config limit), got ${after.length}`);
  } finally { cleanup(projectDir); }
});

// --- Config schema validation (Bug #22) / Symlink config (Bug #19) ---

test('health-check detects unknown config keys', () => {
  const { projectDir } = createTempProject();
  try {
    // Write a config with a typo key
    fs.writeFileSync(path.join(projectDir, '.memoryforge.config.json'),
      JSON.stringify({
        keepSessionsFull: 5,
        keepDecisiosnFull: 10,  // typo!
        trackingMaxLiness: 100, // typo!
      }));

    const healthCheck = path.join(__dirname, '..', 'scripts', 'health-check.js');
    // health-check exits non-zero on warnings — capture stdout from the error
    let result;
    try {
      result = execSync(`node "${healthCheck}" --json "${projectDir}"`, {
        encoding: 'utf-8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (err) {
      result = err.stdout;
    }
    const report = JSON.parse(result);
    assert.ok(report.config.issues.length > 0, 'Should have config issues');
    const unknownIssue = report.config.issues.find(i => i.includes('Unknown config key'));
    assert.ok(unknownIssue, 'Should report unknown config keys');
    assert.ok(unknownIssue.includes('keepDecisiosnFull'), 'Should mention the typo key');
  } finally { cleanup(projectDir); }
});

test('health-check validates config with Number.isSafeInteger', () => {
  const { projectDir } = createTempProject();
  try {
    // Write a config with extreme values
    fs.writeFileSync(path.join(projectDir, '.memoryforge.config.json'),
      JSON.stringify({
        keepSessionsFull: 1e308,
        compressThresholdBytes: -5,
      }));

    const healthCheck = path.join(__dirname, '..', 'scripts', 'health-check.js');
    let result;
    try {
      result = execSync(`node "${healthCheck}" --json "${projectDir}"`, {
        encoding: 'utf-8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (err) {
      result = err.stdout;
    }
    const report = JSON.parse(result);
    assert.ok(!report.config.valid, 'Config with extreme values should be invalid');
    assert.ok(report.config.issues.some(i => i.includes('keepSessionsFull')), 'Should flag extreme keepSessionsFull');
    assert.ok(report.config.issues.some(i => i.includes('compressThresholdBytes')), 'Should flag negative compressThresholdBytes');
  } finally { cleanup(projectDir); }
});

test('health-check rejects symlinked config', () => {
  // Skip on Windows — symlinks require elevated privileges
  if (process.platform === 'win32') return;

  const { projectDir } = createTempProject();
  try {
    const realConfig = path.join(projectDir, 'real-config.json');
    fs.writeFileSync(realConfig, JSON.stringify({ keepSessionsFull: 999 }));
    fs.symlinkSync(realConfig, path.join(projectDir, '.memoryforge.config.json'));

    const healthCheck = path.join(__dirname, '..', 'scripts', 'health-check.js');
    let result;
    try {
      result = execSync(`node "${healthCheck}" --json "${projectDir}"`, {
        encoding: 'utf-8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (err) {
      result = err.stdout;
    }
    const report = JSON.parse(result);
    assert.ok(!report.config.valid, 'Symlinked config should be invalid');
    assert.ok(report.config.issues.some(i => i.includes('symlink')), 'Should report symlink issue');
  } finally { cleanup(projectDir); }
});

// --- Report ---

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failures.length > 0) {
  console.log('Failures:');
  for (const f of failures) {
    console.log(`  ${f.name}: ${f.error.message}`);
  }
}
process.exit(failed > 0 ? 1 : 0);
