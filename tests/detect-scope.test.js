#!/usr/bin/env node
// =============================================================================
// MemoryForge: Scope Conflict Detection Tests
// =============================================================================
// Tests the detect-scope-conflict.js module (both require and CLI modes).
//
// Usage: node tests/detect-scope.test.js
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

const { detectConflict, findMfHooks } = require('../scripts/detect-scope-conflict');

// Settings with MemoryForge hooks
const MF_SETTINGS = JSON.stringify({
  hooks: {
    SessionStart: [{
      matcher: "startup|resume|compact|clear",
      hooks: [{ type: "command", command: "node scripts/hooks/session-start.js", timeout: 15 }]
    }],
    PreCompact: [{
      hooks: [{ type: "command", command: "node scripts/hooks/pre-compact.js", timeout: 10 }]
    }],
    SessionEnd: [{
      hooks: [{ type: "command", command: "node scripts/hooks/session-end.js", timeout: 10 }]
    }]
  }
}, null, 2);

// Settings with non-MF hooks
const OTHER_SETTINGS = JSON.stringify({
  hooks: {
    SessionStart: [{
      matcher: "startup",
      hooks: [{ type: "command", command: "echo hello", timeout: 5 }]
    }]
  }
}, null, 2);

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mf-scope-test-'));
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

// --- Tests ---

console.log('\nMemoryForge Scope Conflict Detection Tests\n');

test('no conflict: only project has hooks, global does not', () => {
  // detectConflict with scope='global' checks the project dir
  // If we point to a dir with no .claude/settings.json, no conflict
  const tmpDir = createTempDir();
  try {
    const result = detectConflict({ scope: 'global', targetDir: tmpDir });
    assert.equal(result.conflict, false, 'Should not detect conflict');
    assert.equal(result.otherScope, 'project');
    assert.deepEqual(result.hooks, []);
  } finally { cleanup(tmpDir); }
});

test('conflict detected: both scopes have hooks', () => {
  const tmpDir = createTempDir();
  try {
    // Create a fake project .claude/settings.json with MF hooks
    const claudeDir = path.join(tmpDir, '.claude');
    fs.mkdirSync(claudeDir, { recursive: true });
    fs.writeFileSync(path.join(claudeDir, 'settings.json'), MF_SETTINGS);

    // When scope='global', it checks the project dir for conflict
    const result = detectConflict({ scope: 'global', targetDir: tmpDir });
    assert.equal(result.conflict, true, 'Should detect conflict');
    assert.equal(result.otherScope, 'project');
    assert.ok(result.hooks.length > 0, 'Should list matched hooks');
    assert.ok(result.hooks.includes('session-start.js'), 'Should include session-start.js');
  } finally { cleanup(tmpDir); }
});

test('missing settings file: other scope has no settings.json', () => {
  const tmpDir = createTempDir();
  try {
    // No .claude dir at all
    const result = detectConflict({ scope: 'global', targetDir: tmpDir });
    assert.equal(result.conflict, false);
    assert.deepEqual(result.hooks, []);
  } finally { cleanup(tmpDir); }
});

test('non-MF hooks: other scope has hooks from different tool', () => {
  const tmpDir = createTempDir();
  try {
    const claudeDir = path.join(tmpDir, '.claude');
    fs.mkdirSync(claudeDir, { recursive: true });
    fs.writeFileSync(path.join(claudeDir, 'settings.json'), OTHER_SETTINGS);

    const result = detectConflict({ scope: 'global', targetDir: tmpDir });
    assert.equal(result.conflict, false, 'Non-MF hooks should not trigger conflict');
    assert.deepEqual(result.hooks, []);
  } finally { cleanup(tmpDir); }
});

test('symlink protection: settings.json is symlink', () => {
  const tmpDir = createTempDir();
  try {
    const claudeDir = path.join(tmpDir, '.claude');
    fs.mkdirSync(claudeDir, { recursive: true });

    // Create a real settings file elsewhere
    const realFile = path.join(tmpDir, 'real-settings.json');
    fs.writeFileSync(realFile, MF_SETTINGS);

    // Create a symlink
    const symlinkPath = path.join(claudeDir, 'settings.json');
    try {
      fs.symlinkSync(realFile, symlinkPath);
    } catch {
      // Symlinks may not work without admin on Windows — skip
      process.stdout.write('    (symlink creation not available, skipping)\n');
      return;
    }

    const result = detectConflict({ scope: 'global', targetDir: tmpDir });
    assert.equal(result.conflict, false, 'Symlinked settings should be ignored');
    assert.deepEqual(result.hooks, []);
  } finally { cleanup(tmpDir); }
});

test('CLI mode: correct JSON output and exit codes', () => {
  const tmpDir = createTempDir();
  try {
    const scriptPath = path.join(__dirname, '..', 'scripts', 'detect-scope-conflict.js');

    // No conflict case — exit 0
    const cleanResult = execSync(
      `node "${scriptPath}" --scope global --target "${tmpDir}"`,
      { encoding: 'utf-8', timeout: 5000 }
    ).trim();
    const cleanParsed = JSON.parse(cleanResult);
    assert.equal(cleanParsed.conflict, false);

    // Conflict case — exit 1
    const claudeDir = path.join(tmpDir, '.claude');
    fs.mkdirSync(claudeDir, { recursive: true });
    fs.writeFileSync(path.join(claudeDir, 'settings.json'), MF_SETTINGS);

    try {
      execSync(
        `node "${scriptPath}" --scope global --target "${tmpDir}"`,
        { encoding: 'utf-8', timeout: 5000 }
      );
      assert.fail('Should have exited with code 1');
    } catch (err) {
      assert.equal(err.status, 1, 'Should exit with code 1 on conflict');
      const output = err.stdout.trim();
      const parsed = JSON.parse(output);
      assert.equal(parsed.conflict, true);
      assert.equal(parsed.otherScope, 'project');
    }
  } finally { cleanup(tmpDir); }
});

test('empty settings: {} in other scope', () => {
  const tmpDir = createTempDir();
  try {
    const claudeDir = path.join(tmpDir, '.claude');
    fs.mkdirSync(claudeDir, { recursive: true });
    fs.writeFileSync(path.join(claudeDir, 'settings.json'), '{}');

    const result = detectConflict({ scope: 'global', targetDir: tmpDir });
    assert.equal(result.conflict, false, 'Empty settings should not be a conflict');
    assert.deepEqual(result.hooks, []);
  } finally { cleanup(tmpDir); }
});

test('findMfHooks returns correct signatures', () => {
  const tmpDir = createTempDir();
  try {
    const settingsPath = path.join(tmpDir, 'settings.json');
    fs.writeFileSync(settingsPath, MF_SETTINGS);

    const hooks = findMfHooks(settingsPath);
    assert.ok(hooks.includes('session-start.js'), 'Should find session-start.js');
    assert.ok(hooks.includes('pre-compact.js'), 'Should find pre-compact.js');
    assert.ok(hooks.includes('session-end.js'), 'Should find session-end.js');
    assert.equal(hooks.length, 3, 'Should find exactly 3 .js hooks');
  } finally { cleanup(tmpDir); }
});

test('findMfHooks returns empty for non-existent file', () => {
  const hooks = findMfHooks('/nonexistent/path/settings.json');
  assert.deepEqual(hooks, []);
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
