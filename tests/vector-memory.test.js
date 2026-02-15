#!/usr/bin/env node
// =============================================================================
// MemoryForge: Vector Memory (TF-IDF) Tests
// =============================================================================
// Tests tokenization, stemming, TF-IDF indexing, search ranking, chunking,
// hybrid search, and serialization.
// Zero dependencies — uses Node.js built-in assert.
//
// Usage: node tests/vector-memory.test.js
// =============================================================================

const { strict: assert } = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { TFIDFIndex, tokenize, stem, chunkFile, buildIndex, hybridSearch } = require(
  path.join(__dirname, '..', 'scripts', 'vector-memory.js')
);

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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'memoryforge-vector-'));
  const mindDir = path.join(dir, '.mind');
  fs.mkdirSync(mindDir, { recursive: true });
  return { projectDir: dir, mindDir };
}

function cleanup(projectDir) {
  fs.rmSync(projectDir, { recursive: true, force: true });
}

// --- Tests ---

const tests = [
  // --- Tokenization ---
  test('tokenize splits text and removes stop words', () => {
    const tokens = tokenize('The quick brown fox jumps over the lazy dog');
    assert.ok(!tokens.includes('the'), 'Stop word "the" should be removed');
    assert.ok(!tokens.includes('over'), 'Stop word "over" should be removed');
    assert.ok(tokens.includes('quick'), 'Content word "quick" should be kept');
    assert.ok(tokens.length > 0, 'Should produce tokens');
  }),

  test('tokenize handles special characters and numbers', () => {
    const tokens = tokenize('Phase 2: API Development — IN PROGRESS (v1.0)');
    assert.ok(tokens.includes('phase'), 'Should include "phase"');
    assert.ok(tokens.some(t => t === 'api' || t.startsWith('api')), 'Should include API');
    assert.ok(tokens.some(t => t.includes('develop')), 'Should include development variant');
  }),

  // --- Stemming ---
  test('stem reduces common suffixes', () => {
    assert.equal(stem('running'), 'runn');
    assert.equal(stem('decided'), 'decid');
    assert.equal(stem('authentication'), 'authenticat'); // 'ion' suffix removed
    assert.equal(stem('development'), 'develop');
  }),

  test('stem preserves short words', () => {
    assert.equal(stem('api'), 'api');
    assert.equal(stem('db'), 'db');
    assert.equal(stem('the'), 'the');
  }),

  // --- TF-IDF Index: Basic ---
  test('index returns results ranked by relevance', () => {
    const index = new TFIDFIndex();
    index.addDocument('auth.md', 'Authentication module uses JWT tokens for secure login and session management');
    index.addDocument('db.md', 'Database schema uses PostgreSQL with connection pooling and migrations');
    index.addDocument('api.md', 'API endpoint for authentication with JWT token validation');

    const results = index.search('authentication JWT');
    assert.ok(results.length >= 2, 'Should find at least 2 matching docs');
    // Both auth.md and api.md should rank higher than db.md
    const authIdx = results.findIndex(r => r.docId === 'auth.md');
    const dbIdx = results.findIndex(r => r.docId === 'db.md');
    if (dbIdx !== -1 && authIdx !== -1) {
      assert.ok(authIdx < dbIdx, 'auth.md should rank higher than db.md for "authentication JWT"');
    }
  }),

  test('index handles empty and missing queries', () => {
    const index = new TFIDFIndex();
    index.addDocument('doc1', 'Some content here');
    const results = index.search('');
    assert.equal(results.length, 0, 'Empty query should return no results');
  }),

  test('index scores documents with more matching terms higher', () => {
    const index = new TFIDFIndex();
    index.addDocument('both', 'authentication security tokens validation encryption');
    index.addDocument('one', 'authentication basic login page');
    index.addDocument('none', 'database schema migration pooling');

    const results = index.search('authentication security tokens');
    assert.ok(results.length >= 1);
    assert.equal(results[0].docId, 'both', 'Document with more matching terms should rank first');
  }),

  // --- Serialization ---
  test('index survives JSON serialization round-trip', () => {
    const index = new TFIDFIndex();
    index.addDocument('doc1', 'Authentication with JWT tokens');
    index.addDocument('doc2', 'Database migration strategy');

    const json = index.toJSON();
    const restored = TFIDFIndex.fromJSON(json);

    assert.equal(restored.size, 2, 'Restored index should have 2 documents');
    const results = restored.search('authentication JWT');
    assert.ok(results.length >= 1, 'Restored index should return search results');
    assert.equal(results[0].docId, 'doc1');
  }),

  // --- Chunking ---
  test('chunkFile splits content into overlapping chunks', () => {
    let content = '';
    for (let i = 1; i <= 50; i++) {
      content += `Line ${i}: some content for testing chunking\n`;
    }

    const chunks = chunkFile('TEST.md', content, 15, 3);
    assert.ok(chunks.length >= 3, `Should produce multiple chunks, got ${chunks.length}`);

    // Verify chunks have correct metadata
    assert.equal(chunks[0].metadata.file, 'TEST.md');
    assert.equal(chunks[0].metadata.lineStart, 1);

    // Verify overlap: last lines of chunk N should appear in chunk N+1
    if (chunks.length >= 2) {
      assert.ok(chunks[1].metadata.lineStart < chunks[0].metadata.lineEnd,
        'Chunks should overlap');
    }
  }),

  // --- Build Index from .mind/ ---
  test('buildIndex indexes real .mind/ files', () => {
    const { projectDir, mindDir } = createTempMindDir();
    try {
      fs.writeFileSync(path.join(mindDir, 'STATE.md'),
        '# State\n## Current Phase\nPhase 2: API Development\n## Current Status\nBuilding REST endpoints');
      fs.writeFileSync(path.join(mindDir, 'DECISIONS.md'),
        '# Decisions\n## DEC-001: Use JWT\n- Chose JWT over sessions for stateless auth');
      fs.writeFileSync(path.join(mindDir, 'PROGRESS.md'),
        '# Progress\n- [x] Database schema\n- [ ] Authentication module\n- [ ] API endpoints');

      const index = buildIndex(mindDir);
      assert.ok(index.size > 0, 'Index should have documents');

      // Search for something mentioned across files
      const results = index.search('authentication');
      assert.ok(results.length >= 1, 'Should find authentication across files');
    } finally { cleanup(projectDir); }
  }),

  // --- Hybrid Search ---
  test('hybridSearch combines semantic and keyword results', () => {
    const { projectDir, mindDir } = createTempMindDir();
    try {
      fs.writeFileSync(path.join(mindDir, 'STATE.md'),
        '# State\n## Current Phase\nPhase 3: Testing\n## Current Status\nWriting integration tests for the auth module');
      fs.writeFileSync(path.join(mindDir, 'DECISIONS.md'),
        '# Decisions\n## DEC-001: JWT chosen\n- **Decision:** Use JWT tokens\n- **Rationale:** Stateless authentication scales better');
      fs.writeFileSync(path.join(mindDir, 'SESSION-LOG.md'),
        '# Sessions\n## Session 1\n- Implemented user authentication\n- Set up JWT middleware');

      const results = hybridSearch(mindDir, 'authentication decision');
      assert.ok(results.length >= 1, 'Should return hybrid results');

      // Check that results include both semantic and potentially keyword matches
      const hasFile = results.some(r => r.file === 'DECISIONS.md' || r.file === 'SESSION-LOG.md');
      assert.ok(hasFile, 'Should find results in decision or session files');
    } finally { cleanup(projectDir); }
  }),

  test('hybridSearch returns empty for nonsense query', () => {
    const { projectDir, mindDir } = createTempMindDir();
    try {
      fs.writeFileSync(path.join(mindDir, 'STATE.md'), '# State\nPhase 1');
      const results = hybridSearch(mindDir, 'xyzzyplugh');
      assert.equal(results.length, 0, 'Nonsense query should return no results');
    } finally { cleanup(projectDir); }
  }),

  // --- Edge cases ---
  test('index handles single-word documents', () => {
    const index = new TFIDFIndex();
    index.addDocument('short', 'authentication');
    index.addDocument('long', 'The authentication module handles user login with JWT tokens and session management across the platform');

    const results = index.search('authentication');
    assert.ok(results.length >= 1, 'Should find results');
  }),

  test('fromJSON handles invalid input gracefully', () => {
    const index1 = TFIDFIndex.fromJSON(null);
    assert.equal(index1.size, 0, 'Null input should produce empty index');

    const index2 = TFIDFIndex.fromJSON({ version: 99 });
    assert.equal(index2.size, 0, 'Wrong version should produce empty index');

    const index3 = TFIDFIndex.fromJSON({});
    assert.equal(index3.size, 0, 'Missing fields should produce empty index');
  }),
];

// --- Run ---

(async () => {
  console.log('\nMemoryForge Vector Memory Tests\n');
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
