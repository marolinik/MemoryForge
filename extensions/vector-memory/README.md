# MemoryForge: Vector Memory Extension

Semantic memory using vector embeddings for similarity search across sessions.

## Overview

The base MemoryForge system uses flat Markdown files for state tracking. This extension adds **semantic memory** — the ability to store and retrieve knowledge by meaning rather than exact keywords. This is particularly useful for:

- "What did we learn about authentication last week?"
- "Have we solved a similar problem before?"
- "What patterns do we use for error handling?"

## Architecture

```
.mind/ files (state tracking)     <-- Base MemoryForge
    +
Vector DB (semantic memory)       <-- This extension
    =
Full persistent memory system
```

### Storage Model

```
┌─────────────────────────────────┐
│  Vector Store                    │
│  ┌───────────────────────────┐  │
│  │  Memory Entry             │  │
│  │  - id: string             │  │
│  │  - content: string        │  │
│  │  - embedding: float[]     │  │
│  │  - category: string       │  │
│  │  - source: string         │  │
│  │  - timestamp: string      │  │
│  │  - metadata: Record       │  │
│  └───────────────────────────┘  │
│                                  │
│  Categories:                     │
│  - "architecture" — design       │
│  - "pattern" — code patterns     │
│  - "decision" — why choices made │
│  - "learning" — lessons learned  │
│  - "domain" — business knowledge │
│  - "debug" — bug fix knowledge   │
└─────────────────────────────────┘
```

## Implementation Options

### Option A: File-Based (No Dependencies)

Store embeddings as JSON files on disk. Simple, portable, no external services.

```typescript
// memory-store.ts — file-based vector store
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

interface MemoryEntry {
  id: string;
  content: string;
  embedding: number[];
  category: string;
  source: string;
  timestamp: string;
  metadata: Record<string, unknown>;
}

export class FileMemoryStore {
  private entries: MemoryEntry[] = [];
  private storePath: string;

  constructor(projectDir: string) {
    this.storePath = join(projectDir, '.mind', 'memory', 'vectors.json');
    this.load();
  }

  private load(): void {
    if (existsSync(this.storePath)) {
      this.entries = JSON.parse(readFileSync(this.storePath, 'utf-8'));
    }
  }

  private save(): void {
    const dir = join(this.storePath, '..');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(this.storePath, JSON.stringify(this.entries, null, 2));
  }

  async store(content: string, category: string, source: string, metadata?: Record<string, unknown>): Promise<void> {
    const embedding = await this.embed(content);
    this.entries.push({
      id: `mem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      content,
      embedding,
      category,
      source,
      timestamp: new Date().toISOString(),
      metadata: metadata ?? {}
    });
    this.save();
  }

  async search(query: string, options?: { category?: string; limit?: number }): Promise<MemoryEntry[]> {
    const queryEmbedding = await this.embed(query);
    const limit = options?.limit ?? 5;

    let candidates = this.entries;
    if (options?.category) {
      candidates = candidates.filter(e => e.category === options.category);
    }

    return candidates
      .map(entry => ({
        ...entry,
        similarity: this.cosineSimilarity(queryEmbedding, entry.embedding)
      }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  // Override this with your embedding provider
  private async embed(text: string): Promise<number[]> {
    // Default: simple hash-based pseudo-embedding (for testing only)
    // Replace with OpenAI, Anthropic, or local embedding model
    const hash = Array.from(text).reduce((h, c) => ((h << 5) - h) + c.charCodeAt(0), 0);
    return Array.from({ length: 128 }, (_, i) => Math.sin(hash * (i + 1)) * 0.5);
  }
}
```

### Option B: LanceDB (Lightweight, Embedded)

```bash
npm install @lancedb/lancedb
```

```typescript
// memory-store-lance.ts — LanceDB vector store
import * as lancedb from '@lancedb/lancedb';

export class LanceMemoryStore {
  private db: lancedb.Connection;
  private table: lancedb.Table | null = null;

  static async create(projectDir: string): Promise<LanceMemoryStore> {
    const store = new LanceMemoryStore();
    store.db = await lancedb.connect(`${projectDir}/.mind/memory/lance`);
    try {
      store.table = await store.db.openTable('memories');
    } catch {
      // Table doesn't exist yet — will be created on first store
    }
    return store;
  }

  async store(content: string, category: string, source: string): Promise<void> {
    const embedding = await this.embed(content);
    const record = {
      id: `mem-${Date.now()}`,
      content,
      category,
      source,
      timestamp: new Date().toISOString(),
      vector: embedding
    };

    if (!this.table) {
      this.table = await this.db.createTable('memories', [record]);
    } else {
      await this.table.add([record]);
    }
  }

  async search(query: string, limit = 5): Promise<any[]> {
    if (!this.table) return [];
    const embedding = await this.embed(query);
    return this.table.search(embedding).limit(limit).toArray();
  }

  private async embed(text: string): Promise<number[]> {
    // Replace with your embedding provider
    // Example with OpenAI:
    // const response = await openai.embeddings.create({
    //   model: 'text-embedding-3-small',
    //   input: text
    // });
    // return response.data[0].embedding;
    return Array.from({ length: 128 }, (_, i) => Math.sin(text.length * (i + 1)) * 0.5);
  }
}
```

### Option C: ChromaDB (Full-Featured)

```bash
pip install chromadb
# or run as a server:
docker run -p 8000:8000 chromadb/chroma
```

## Integration with Hooks

Add to your `session-start.sh` hook to include relevant memories in the briefing:

```bash
# After reading .mind/ files, also search vector memory
if command -v node &>/dev/null && [ -f "$MIND_DIR/memory/vectors.json" ]; then
  MEMORIES=$(node -e "
    const { FileMemoryStore } = require('./memory-store');
    const store = new FileMemoryStore('$PROJECT_DIR');
    store.search('current work context', { limit: 3 })
      .then(results => console.log(results.map(r => '- ' + r.content).join('\n')));
  " 2>/dev/null || echo "")

  if [ -n "$MEMORIES" ]; then
    # Append to briefing
    BRIEFING+="--- RELEVANT MEMORIES ---\n$MEMORIES\n\n"
  fi
fi
```

## When to Use This Extension

- **Long-running projects** (weeks/months) where context accumulates
- **Domain-specific knowledge** that needs to be recalled semantically
- **Pattern libraries** — "How did we handle X before?"
- **Decision rationale** — "Why did we choose Y over Z?"
- **Multi-agent teams** — shared knowledge across agents
