#!/usr/bin/env node
// =============================================================================
// MemoryForge: Hook Integration Tests
// =============================================================================
// Tests the 3-hook lifecycle: session-start → session-end, plus pre-compact.
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

test('session-end.sh writes last-activity and session-tracking', () => {
  const { projectDir, mindDir } = createTempProject();
  try {
    runHook('session-end.sh', projectDir, { session_id: 'test-3', reason: 'user_exit' });

    // .last-activity should be created (absorbed from stop-checkpoint)
    const activityFile = path.join(mindDir, '.last-activity');
    assert.ok(fs.existsSync(activityFile), '.last-activity should exist');
    const activityContent = fs.readFileSync(activityFile, 'utf-8').trim();
    assert.ok(/^\d{4}-\d{2}-\d{2}T/.test(activityContent), 'Should be ISO timestamp');

    // .session-tracking should exist
    assert.ok(fs.existsSync(path.join(mindDir, '.session-tracking')), '.session-tracking should exist');
    const tracking = fs.readFileSync(path.join(mindDir, '.session-tracking'), 'utf-8');
    assert.ok(tracking.includes('user_exit'), 'Should log the exit reason');

    // session-end checkpoint should exist
    assert.ok(fs.existsSync(path.join(mindDir, 'checkpoints', 'session-end-latest.md')), 'Session-end checkpoint should exist');
  } finally { cleanup(projectDir); }
});

test('full lifecycle: session-start → session-end', () => {
  const { projectDir, mindDir } = createTempProject();
  try {
    // 1. Session starts
    const startOutput = runHook('session-start.sh', projectDir, { session_id: 'lifecycle', source: 'startup' });
    assert.ok(JSON.parse(startOutput).hookSpecificOutput, 'session-start should produce briefing');

    // 2. Session ends (now includes stop-checkpoint functionality)
    runHook('session-end.sh', projectDir, { session_id: 'lifecycle', reason: 'completed' });
    assert.ok(fs.existsSync(path.join(mindDir, '.last-activity')), 'session-end should create .last-activity');
    assert.ok(fs.existsSync(path.join(mindDir, '.session-tracking')), 'session-end should create .session-tracking');
    assert.ok(fs.existsSync(path.join(mindDir, 'checkpoints', 'session-end-latest.md')), 'session-end should create checkpoint');
  } finally { cleanup(projectDir); }
});

// --- Checkpoint rotation boundary (Bug #23) ---

test('pre-compact.sh prunes checkpoints at boundary (exactly maxCheckpointFiles)', () => {
  const { projectDir, mindDir } = createTempProject();
  try {
    const cpDir = path.join(mindDir, 'checkpoints');
    // Create exactly 12 checkpoint files (default maxCheckpointFiles=10)
    for (let i = 0; i < 12; i++) {
      const ts = `2025-01-${String(i + 1).padStart(2, '0')}T00-00-00Z`;
      fs.writeFileSync(path.join(cpDir, `compact-${ts}.md`), `# Checkpoint ${i + 1}\n`);
    }

    const before = fs.readdirSync(cpDir).filter(f => f.startsWith('compact-') && f.endsWith('.md'));
    assert.equal(before.length, 12, 'Should have 12 checkpoints before pruning');

    runHook('pre-compact.sh', projectDir, { session_id: 'test-cp', trigger: 'auto' });

    const after = fs.readdirSync(cpDir).filter(f => f.startsWith('compact-') && f.endsWith('.md'));
    assert.ok(after.length <= 10, `Should have <= 10 checkpoints after pruning, got ${after.length}`);
    assert.ok(after.length >= 1, 'Should keep at least 1 checkpoint');
  } finally { cleanup(projectDir); }
});

// --- Compaction survival loop e2e test ---

test('compaction survival loop preserves state', () => {
  const { projectDir, mindDir } = createTempProject();
  try {
    // 1. Session starts (source=startup) — verify briefing contains state
    const startOutput = runHook('session-start.sh', projectDir, { session_id: 'e2e', source: 'startup' });
    const startParsed = JSON.parse(startOutput);
    const startCtx = startParsed.hookSpecificOutput.additionalContext;
    assert.ok(startCtx.includes('Phase 1: Setup'), 'Startup briefing should contain state');
    assert.ok(startCtx.includes('Build the thing'), 'Startup briefing should contain next action');

    // 2. Pre-compact fires — verify checkpoint created
    const preCompactOutput = runHook('pre-compact.sh', projectDir, { session_id: 'e2e', trigger: 'auto' });
    const pcParsed = JSON.parse(preCompactOutput);
    assert.ok(pcParsed.hookSpecificOutput.additionalContext.includes('PRE-COMPACTION'), 'Pre-compact should output checkpoint context');
    assert.ok(fs.existsSync(path.join(mindDir, 'checkpoints', 'latest.md')), 'Checkpoint latest.md should exist');
    const checkpoint = fs.readFileSync(path.join(mindDir, 'checkpoints', 'latest.md'), 'utf-8');
    assert.ok(checkpoint.includes('Phase 1: Setup'), 'Checkpoint should contain state');

    // 3. Session starts again (source=compact) — verify "CONTEXT RESTORED" with checkpoint
    const restoreOutput = runHook('session-start.sh', projectDir, { session_id: 'e2e', source: 'compact' });
    const restoreParsed = JSON.parse(restoreOutput);
    const restoreCtx = restoreParsed.hookSpecificOutput.additionalContext;
    assert.ok(restoreCtx.includes('CONTEXT RESTORED'), 'Post-compact briefing should say CONTEXT RESTORED');
    assert.ok(restoreCtx.includes('Phase 1: Setup'), 'Post-compact briefing should contain state');
    assert.ok(restoreCtx.includes('PRE-COMPACTION CHECKPOINT'), 'Post-compact briefing should include checkpoint');
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
