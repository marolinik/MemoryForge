#!/usr/bin/env node
// =============================================================================
// MemoryForge: TF-IDF Semantic Search Engine
// =============================================================================
// Zero-dependency vector memory for meaning-based search across .mind/ files.
// Uses TF-IDF (Term Frequency–Inverse Document Frequency) to rank results
// by relevance rather than exact keyword matching.
//
// Usage as module:
//   const { TFIDFIndex } = require('./vector-memory.js');
//   const index = new TFIDFIndex();
//   index.addDocument('STATE.md', content);
//   const results = index.search('authentication decisions');
//
// Usage as CLI:
//   node scripts/vector-memory.js [.mind/ directory] "search query"
//   node scripts/vector-memory.js --index [.mind/ directory]
//
// Zero dependencies. Pure Node.js.
// =============================================================================

const fs = require('fs');
const path = require('path');

// --- Text Processing ---

// Common English stop words to filter out
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
  'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
  'could', 'should', 'may', 'might', 'shall', 'can', 'need', 'must',
  'it', 'its', 'this', 'that', 'these', 'those', 'i', 'me', 'my', 'we',
  'our', 'you', 'your', 'he', 'she', 'they', 'them', 'their', 'what',
  'which', 'who', 'when', 'where', 'why', 'how', 'all', 'each', 'every',
  'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'not',
  'only', 'same', 'so', 'than', 'too', 'very', 'just', 'about', 'above',
  'after', 'again', 'also', 'any', 'because', 'before', 'between', 'down',
  'during', 'here', 'if', 'into', 'like', 'new', 'now', 'then', 'there',
  'through', 'under', 'up', 'out', 'over',
]);

/**
 * Simple stemmer: reduces words to approximate roots.
 * Not a full Porter stemmer — just handles common English suffixes.
 * Good enough for .mind/ file search without adding dependencies.
 */
function stem(word) {
  if (word.length < 4) return word;

  // Order matters: try longest suffixes first
  const suffixes = [
    'ational', 'tional', 'ization', 'fulness', 'ousness', 'iveness',
    'ement', 'ment', 'ness', 'ance', 'ence', 'able', 'ible',
    'ting', 'ing', 'ied', 'ies', 'ous', 'ive', 'ful', 'ism',
    'ist', 'ity', 'ent', 'ant', 'ion', 'ate', 'ize',
    'ly', 'er', 'ed', 'es', 'al',
  ];

  for (const suffix of suffixes) {
    if (word.endsWith(suffix) && word.length - suffix.length >= 4) {
      let stemmed = word.slice(0, -suffix.length);
      // De-duplicate trailing consonant (e.g., "runn" -> "run", "stopp" -> "stop")
      if (stemmed.length >= 3 && stemmed[stemmed.length - 1] === stemmed[stemmed.length - 2]
          && !/[aeiou]/.test(stemmed[stemmed.length - 1])) {
        stemmed = stemmed.slice(0, -1);
      }
      return stemmed;
    }
  }

  // Trailing 's' (but not 'ss')
  if (word.endsWith('s') && !word.endsWith('ss') && word.length > 3) {
    return word.slice(0, -1);
  }

  return word;
}

/**
 * Tokenize text into stemmed terms, filtering stop words.
 */
function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 2 && !STOP_WORDS.has(w))
    .map(stem);
}

// --- TF-IDF Index ---

class TFIDFIndex {
  constructor() {
    // documents: Map<docId, { terms: string[], tf: Map<term, freq>, metadata: object }>
    this.documents = new Map();
    // idf cache: Map<term, idf_value>
    this.idfCache = new Map();
    this.dirty = true; // IDF needs recalculation
  }

  /**
   * Add a document to the index.
   * @param {string} docId - Unique identifier (e.g., 'STATE.md' or 'STATE.md:chunk:3')
   * @param {string} text - Document content
   * @param {object} metadata - Optional metadata (file, lineStart, lineEnd)
   */
  addDocument(docId, text, metadata = {}) {
    const terms = tokenize(text);
    if (terms.length === 0) return;

    // Term frequency: count occurrences of each term
    const tf = new Map();
    for (const term of terms) {
      tf.set(term, (tf.get(term) || 0) + 1);
    }

    // Normalize TF by document length
    for (const [term, count] of tf) {
      tf.set(term, count / terms.length);
    }

    this.documents.set(docId, { terms, tf, metadata });
    this.dirty = true;
  }

  /**
   * Recalculate IDF values across all documents.
   * IDF = log(N / df) where N = total docs, df = docs containing term
   */
  _recalculateIDF() {
    if (!this.dirty) return;

    const N = this.documents.size;
    if (N === 0) return;

    // Count document frequency for each term
    const df = new Map();
    for (const [, doc] of this.documents) {
      const seen = new Set(doc.terms);
      for (const term of seen) {
        df.set(term, (df.get(term) || 0) + 1);
      }
    }

    // Calculate IDF
    this.idfCache.clear();
    for (const [term, count] of df) {
      this.idfCache.set(term, Math.log(1 + N / count));
    }

    this.dirty = false;
  }

  /**
   * Search the index with a natural language query.
   * Returns ranked results with relevance scores.
   * @param {string} query - Search query
   * @param {object} options - { limit: number, minScore: number }
   * @returns {Array<{ docId, score, snippet, metadata }>}
   */
  search(query, options = {}) {
    const { limit = 10, minScore = 0.01 } = options;

    this._recalculateIDF();

    const queryTerms = tokenize(query);
    if (queryTerms.length === 0) return [];

    // Score each document
    const scores = [];

    for (const [docId, doc] of this.documents) {
      let score = 0;

      for (const qTerm of queryTerms) {
        const tf = doc.tf.get(qTerm) || 0;
        const idf = this.idfCache.get(qTerm) || 0;
        score += tf * idf;
      }

      if (score >= minScore) {
        scores.push({ docId, score, metadata: doc.metadata });
      }
    }

    // Sort by score descending
    scores.sort((a, b) => b.score - a.score);

    return scores.slice(0, limit);
  }

  /**
   * Get total number of indexed documents.
   */
  get size() {
    return this.documents.size;
  }

  /**
   * Serialize index to JSON for caching.
   */
  toJSON() {
    const docs = {};
    for (const [docId, doc] of this.documents) {
      docs[docId] = {
        terms: doc.terms,
        tf: Object.fromEntries(doc.tf),
        metadata: doc.metadata,
      };
    }
    return { version: 1, documents: docs };
  }

  /**
   * Restore index from serialized JSON.
   */
  static fromJSON(json) {
    const index = new TFIDFIndex();
    if (!json || json.version !== 1 || !json.documents) return index;

    for (const [docId, doc] of Object.entries(json.documents)) {
      index.documents.set(docId, {
        terms: doc.terms,
        tf: new Map(Object.entries(doc.tf)),
        metadata: doc.metadata || {},
      });
    }
    index.dirty = true;
    return index;
  }
}

// --- Chunking ---

/**
 * Split a file into overlapping chunks for granular search.
 * Each chunk is ~200-300 words with 50-word overlap.
 */
function chunkFile(filename, content, chunkSize = 15, overlapLines = 3) {
  // Handle empty files gracefully (Bug #13)
  if (!content || content.trim().length === 0) return [];

  const lines = content.split('\n');
  if (lines.length === 0) return [];
  const chunks = [];

  for (let i = 0; i < lines.length; i += chunkSize - overlapLines) {
    const chunkLines = lines.slice(i, i + chunkSize);
    const text = chunkLines.join('\n').trim();
    if (text.length < 20) continue; // skip near-empty chunks

    chunks.push({
      docId: `${filename}:${i + 1}-${Math.min(i + chunkSize, lines.length)}`,
      text,
      metadata: {
        file: filename,
        lineStart: i + 1,
        lineEnd: Math.min(i + chunkSize, lines.length),
      },
    });
  }

  return chunks;
}

// --- Index Builder ---

/**
 * Build a TF-IDF index from all .mind/ files.
 */
function buildIndex(mindDir) {
  const index = new TFIDFIndex();
  const files = ['STATE.md', 'PROGRESS.md', 'DECISIONS.md', 'SESSION-LOG.md', 'ARCHIVE.md'];

  for (const file of files) {
    const filePath = path.join(mindDir, file);
    let content;
    try {
      // Skip files >10MB to prevent OOM on corrupt/huge files (Bug #12)
      const stat = fs.statSync(filePath);
      if (stat.size > 10 * 1024 * 1024) continue;
      content = fs.readFileSync(filePath, 'utf-8');
    } catch {
      continue;
    }

    // Add whole-file document (for broad matching)
    index.addDocument(file, content, { file, lineStart: 1, lineEnd: content.split('\n').length, _rawText: content.substring(0, 600) });

    // Add chunked documents (for granular matching)
    const chunks = chunkFile(file, content);
    for (const chunk of chunks) {
      index.addDocument(chunk.docId, chunk.text, { ...chunk.metadata, _rawText: chunk.text });
    }
  }

  return index;
}

// --- In-process Index Cache (Wave 15) ---
// Keyed on file mtimes — rebuilds only when .mind/ files change.

let _cachedIndex = null;
let _cachedMindDir = null;
let _cachedMtimes = null;

function getFileMtimes(mindDir) {
  const files = ['STATE.md', 'PROGRESS.md', 'DECISIONS.md', 'SESSION-LOG.md', 'ARCHIVE.md'];
  const mtimes = {};
  for (const file of files) {
    try {
      mtimes[file] = fs.statSync(path.join(mindDir, file)).mtimeMs;
    } catch {
      mtimes[file] = 0;
    }
  }
  return mtimes;
}

function mtimesChanged(a, b) {
  if (!a || !b) return true;
  for (const key of Object.keys(a)) {
    if (a[key] !== b[key]) return true;
  }
  return Object.keys(a).length !== Object.keys(b).length;
}

function getCachedIndex(mindDir) {
  const mtimes = getFileMtimes(mindDir);
  if (_cachedIndex && _cachedMindDir === mindDir && !mtimesChanged(mtimes, _cachedMtimes)) {
    return _cachedIndex;
  }
  _cachedIndex = buildIndex(mindDir);
  _cachedMindDir = mindDir;
  _cachedMtimes = mtimes;
  return _cachedIndex;
}

/**
 * Perform a hybrid search: TF-IDF semantic + keyword exact match.
 * Returns deduplicated results ranked by combined score.
 */
function hybridSearch(mindDir, query, options = {}) {
  const { limit = 10 } = options;

  // 1. TF-IDF semantic search (cached — rebuilds only when files change)
  const index = getCachedIndex(mindDir);
  const semanticResults = index.search(query, { limit: limit * 2 });

  // 2. Keyword exact search (existing behavior)
  const keywordQuery = query.toLowerCase().trim();
  const files = ['STATE.md', 'PROGRESS.md', 'DECISIONS.md', 'SESSION-LOG.md', 'ARCHIVE.md'];
  const keywordResults = [];

  for (const file of files) {
    const filePath = path.join(mindDir, file);
    let content;
    try {
      content = fs.readFileSync(filePath, 'utf-8');
    } catch {
      continue;
    }

    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes(keywordQuery)) {
        const start = Math.max(0, i - 1);
        const end = Math.min(lines.length - 1, i + 1);
        keywordResults.push({
          file,
          line: i + 1,
          snippet: lines.slice(start, end + 1).join('\n'),
        });
      }
    }
  }

  // 3. Merge and deduplicate
  const seen = new Set();
  const merged = [];

  // Semantic results first (already ranked by TF-IDF score)
  for (const r of semanticResults) {
    const key = `${r.metadata.file}:${r.metadata.lineStart}`;
    if (seen.has(key)) continue;
    seen.add(key);

    // Use indexed chunk text instead of re-reading from disk (avoids TOCTOU + redundant I/O)
    const doc = index.documents.get(r.docId);
    const snippet = doc ? doc.terms.length > 0
      ? doc.metadata._rawText || ''
      : ''
      : '';

    merged.push({
      file: r.metadata.file,
      lineStart: r.metadata.lineStart,
      lineEnd: r.metadata.lineEnd,
      score: r.score,
      source: 'semantic',
      snippet: snippet.substring(0, 500),
    });
  }

  // Keyword results that weren't already covered
  for (const r of keywordResults) {
    const key = `${r.file}:${r.line}`;
    // Check if any semantic result already covers this line
    const covered = merged.some(m =>
      m.file === r.file && r.line >= m.lineStart && r.line <= m.lineEnd
    );
    if (covered || seen.has(key)) continue;
    seen.add(key);

    merged.push({
      file: r.file,
      lineStart: r.line,
      lineEnd: r.line,
      score: 0, // keyword match has no TF-IDF score
      source: 'keyword',
      snippet: r.snippet.substring(0, 500),
    });
  }

  return merged.slice(0, limit);
}

// --- Exports ---

module.exports = { TFIDFIndex, tokenize, stem, chunkFile, buildIndex, hybridSearch, getCachedIndex };

// --- CLI ---

if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 2 || args.includes('--help')) {
    console.log('Usage: node scripts/vector-memory.js [.mind/ directory] "search query"');
    console.log('       node scripts/vector-memory.js --index [.mind/ directory]');
    process.exit(args.includes('--help') ? 0 : 1);
  }

  if (args[0] === '--index') {
    // Build and display index stats
    const mindDir = args[1] || '.mind';
    const index = buildIndex(mindDir);
    console.log(JSON.stringify({
      documents: index.size,
      mindDir: path.resolve(mindDir),
    }, null, 2));
    process.exit(0);
  }

  const mindDir = args[0];
  const query = args.slice(1).join(' ');

  const results = hybridSearch(mindDir, query);

  if (results.length === 0) {
    console.log(`No results for "${query}"`);
    process.exit(0);
  }

  console.log(`Search results for "${query}" (${results.length} matches):\n`);
  for (const r of results) {
    const source = r.source === 'semantic' ? `[semantic ${r.score.toFixed(3)}]` : '[keyword]';
    console.log(`--- ${r.file}:${r.lineStart} ${source} ---`);
    console.log(r.snippet);
    console.log();
  }
}
