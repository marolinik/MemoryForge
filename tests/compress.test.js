#!/usr/bin/env node
// =============================================================================
// MemoryForge: Compression Tests
// =============================================================================
// Tests session compression, decision compression, task archival, and rotation.
// Zero dependencies — uses Node.js built-in assert.
//
// Usage: node tests/compress.test.js
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
  return { name, fn };
}

async function runTests(tests) {
  for (const t of tests) {
    try {
      await t.fn();
      passed++;
      process.stdout.write(`  PASS  ${t.name}\n`);
    } catch (err) {
      failed++;
      failures.push({ name: t.name, error: err });
      process.stdout.write(`  FAIL  ${t.name}\n    ${err.message}\n`);
    }
  }
}

function createTempMindDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'memoryforge-compress-'));
  const mindDir = path.join(dir, '.mind');
  fs.mkdirSync(mindDir, { recursive: true });
  return { projectDir: dir, mindDir };
}

function cleanup(projectDir) {
  fs.rmSync(projectDir, { recursive: true, force: true });
}

const COMPRESS_SCRIPT = path.join(__dirname, '..', 'scripts', 'compress-sessions.js');

function runCompress(mindDir, extraArgs = '') {
  const result = execSync(`node "${COMPRESS_SCRIPT}" ${extraArgs} "${mindDir}"`, {
    encoding: 'utf-8',
    timeout: 10000
  });
  return JSON.parse(result);
}

// --- Tests ---

const tests = [
  // --- Session compression ---
  test('compresses sessions beyond keepSessionsFull threshold', () => {
    const { projectDir, mindDir } = createTempMindDir();
    try {
      let content = '# Session Log\n\n';
      for (let i = 1; i <= 8; i++) {
        content += `## Session ${i} — 2025-01-${String(i).padStart(2, '0')}\n`;
        content += `- **Summary:** Did work in session ${i}\n`;
        content += `- **Completed:** Task ${i}\n\n`;
      }
      fs.writeFileSync(path.join(mindDir, 'SESSION-LOG.md'), content);

      const result = runCompress(mindDir);
      assert.ok(result.sessions.compressed > 0, 'Should compress old sessions');
      assert.equal(result.sessions.kept, 5, 'Should keep 5 recent');
      assert.equal(result.sessions.compressed, 3, 'Should compress 3 old');

      const output = fs.readFileSync(path.join(mindDir, 'SESSION-LOG.md'), 'utf-8');
      assert.ok(output.includes('Archived Sessions'), 'Should have archived header');
      assert.ok(output.includes('## Session 8'), 'Should keep recent sessions');
      assert.ok(!output.includes('Did work in session 1'), 'Old session details removed');
    } finally { cleanup(projectDir); }
  }),

  test('does not compress when under threshold', () => {
    const { projectDir, mindDir } = createTempMindDir();
    try {
      let content = '# Session Log\n\n';
      for (let i = 1; i <= 3; i++) {
        content += `## Session ${i} — 2025-01-0${i}\n- **Summary:** Work ${i}\n\n`;
      }
      fs.writeFileSync(path.join(mindDir, 'SESSION-LOG.md'), content);

      const result = runCompress(mindDir);
      assert.equal(result.sessions.saved, 0);
    } finally { cleanup(projectDir); }
  }),

  // --- Decision compression ---
  test('compresses decisions beyond keepDecisionsFull threshold', () => {
    const { projectDir, mindDir } = createTempMindDir();
    try {
      let content = '# Decision Log\n\n';
      for (let i = 1; i <= 15; i++) {
        content += `## DEC-${String(i).padStart(3, '0')}: Decision ${i}\n`;
        content += `- **Date:** 2025-01-${String(i).padStart(2, '0')}\n`;
        content += `- **Decision:** Chose option ${i}\n`;
        content += `- **Rationale:** Because of reason ${i}\n`;
        content += `- **Status:** Final\n\n`;
      }
      fs.writeFileSync(path.join(mindDir, 'DECISIONS.md'), content);

      const result = runCompress(mindDir);
      assert.ok(result.decisions.compressed > 0);
      assert.equal(result.decisions.kept, 10);
      assert.equal(result.decisions.compressed, 5);

      const output = fs.readFileSync(path.join(mindDir, 'DECISIONS.md'), 'utf-8');
      assert.ok(output.includes('Archived Decisions'));
      assert.ok(output.includes('_Why: Because of reason'), 'Rationale preserved in compressed form');
    } finally { cleanup(projectDir); }
  }),

  // --- Task archival ---
  test('archives completed tasks older than 30 days', () => {
    const { projectDir, mindDir } = createTempMindDir();
    try {
      const oldDate = '2024-01-01';
      const recentDate = new Date().toISOString().split('T')[0];
      const content = `# Progress\n### Completed\n- [x] Old task (completed ${oldDate})\n- [x] Recent task (completed ${recentDate})\n### In Progress\n- [ ] Current work\n`;
      fs.writeFileSync(path.join(mindDir, 'PROGRESS.md'), content);

      const result = runCompress(mindDir);
      assert.equal(result.archive.archived, 1, 'Should archive 1 old task');

      const progress = fs.readFileSync(path.join(mindDir, 'PROGRESS.md'), 'utf-8');
      assert.ok(!progress.includes('Old task'), 'Old task removed from PROGRESS.md');
      assert.ok(progress.includes('Recent task'), 'Recent task kept');
      assert.ok(progress.includes('Current work'), 'In-progress task kept');

      const archive = fs.readFileSync(path.join(mindDir, 'ARCHIVE.md'), 'utf-8');
      assert.ok(archive.includes('Old task'), 'Old task moved to ARCHIVE.md');
    } finally { cleanup(projectDir); }
  }),

  test('does not archive tasks without completion date', () => {
    const { projectDir, mindDir } = createTempMindDir();
    try {
      const content = '# Progress\n- [x] Done task without date\n- [ ] Open task\n';
      fs.writeFileSync(path.join(mindDir, 'PROGRESS.md'), content);

      const result = runCompress(mindDir);
      assert.equal(result.archive.archived, 0);
    } finally { cleanup(projectDir); }
  }),

  // --- Tracking file rotation ---
  test('rotates tracking files exceeding max lines', () => {
    const { projectDir, mindDir } = createTempMindDir();
    try {
      let content = '';
      for (let i = 1; i <= 150; i++) {
        content += `Entry ${i}\n`;
      }
      fs.writeFileSync(path.join(mindDir, '.agent-activity'), content);

      const result = runCompress(mindDir);
      assert.ok(result.tracking['.agent-activity'].rotated);
      assert.equal(result.tracking['.agent-activity'].after, 100);

      const output = fs.readFileSync(path.join(mindDir, '.agent-activity'), 'utf-8');
      const lines = output.split('\n').filter(l => l.trim());
      assert.equal(lines.length, 100);
      assert.ok(lines[0].includes('Entry 51'), 'Should keep last 100 entries');
    } finally { cleanup(projectDir); }
  }),

  // --- Dry run ---
  test('dry run does not modify files', () => {
    const { projectDir, mindDir } = createTempMindDir();
    try {
      let content = '# Session Log\n\n';
      for (let i = 1; i <= 8; i++) {
        content += `## Session ${i} — 2025-01-0${i}\n- **Summary:** Work ${i}\n\n`;
      }
      fs.writeFileSync(path.join(mindDir, 'SESSION-LOG.md'), content);

      const result = runCompress(mindDir, '--dry-run');
      assert.ok(result.dryRun);
      assert.ok(result.sessions.compressed > 0, 'Should report compressions');

      // File should be unchanged
      const output = fs.readFileSync(path.join(mindDir, 'SESSION-LOG.md'), 'utf-8');
      assert.ok(output.includes('Did work in session 1') || output.includes('Work 1'), 'Original content preserved');
    } finally { cleanup(projectDir); }
  }),

  // --- Empty / missing files ---
  test('handles missing .mind/ files gracefully', () => {
    const { projectDir, mindDir } = createTempMindDir();
    try {
      // No files at all
      const result = runCompress(mindDir);
      assert.equal(result.totalTokensSaved, 0);
    } finally { cleanup(projectDir); }
  }),

  // --- Config override ---
  test('respects JSON config overrides', () => {
    const { projectDir, mindDir } = createTempMindDir();
    try {
      // Config: keep only 2 sessions
      fs.writeFileSync(path.join(projectDir, '.memoryforge.config.json'),
        JSON.stringify({ keepSessionsFull: 2 }));

      let content = '# Session Log\n\n';
      for (let i = 1; i <= 5; i++) {
        content += `## Session ${i} — 2025-01-0${i}\n- **Summary:** Work ${i}\n\n`;
      }
      fs.writeFileSync(path.join(mindDir, 'SESSION-LOG.md'), content);

      const result = runCompress(mindDir);
      assert.equal(result.sessions.kept, 2, 'Should respect config keepSessionsFull=2');
      assert.equal(result.sessions.compressed, 3, 'Should compress 3');
    } finally { cleanup(projectDir); }
  }),
];

// --- Run ---

(async () => {
  console.log('\nMemoryForge Compression Tests\n');
  await runTests(tests);
  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failures.length > 0) {
    console.log('Failures:');
    for (const f of failures) {
      console.log(`  ${f.name}: ${f.error.message}`);
    }
  }
  process.exit(failed > 0 ? 1 : 0);
})();
