# MemoryForge: Graph Memory Extension

Relationship-aware memory using Neo4j for complex project state.

## Overview

For projects with complex relationships — task dependencies, agent hierarchies, decision chains, artifact lineage — a graph database captures state that flat Markdown files cannot. This extension adds Neo4j-backed state management alongside the base `.mind/` files.

## When to Use This Extension

- **Multi-agent orchestration** — tracking who commands whom, who's working on what
- **Task dependency graphs** — what blocks what, critical path analysis
- **Decision audit trails** — who decided what, when, and what it affected
- **Artifact lineage** — which task produced which artifact, version history
- **Quality workflows** — Maker-Checker-Verifier tracking across agents

For simple projects (single agent, linear task flow), the base `.mind/` files are sufficient.

## Setup

### Docker Compose

```yaml
# docker-compose.yml
services:
  neo4j:
    image: neo4j:5-community
    ports:
      - "7474:7474"   # Browser
      - "7687:7687"   # Bolt
    environment:
      NEO4J_AUTH: neo4j/memoryforge-dev
      NEO4J_PLUGINS: '["apoc"]'
    volumes:
      - neo4j_data:/data
      - neo4j_logs:/logs

volumes:
  neo4j_data:
  neo4j_logs:
```

Start: `docker compose up -d`

### Schema

```cypher
// Core node types

// Project — top-level container
CREATE (p:Project {
  id: "proj-001",
  name: "My Project",
  goal: "Build...",
  status: "active",       // planning | active | paused | completed
  created_at: datetime()
});

// Task — unit of work
CREATE (t:Task {
  id: "task-001",
  title: "Implement feature X",
  description: "...",
  status: "pending",      // pending | assigned | in_progress | review | done | blocked
  priority: "P1",         // P0 (critical) | P1 | P2 | P3 (low)
  phase: "maker",         // maker | checker | verifier | done (for quality loops)
  created_at: datetime(),
  completed_at: null
});

// Agent — worker (human or AI)
CREATE (a:Agent {
  id: "agent-001",
  role: "developer",
  status: "idle",         // idle | working | blocked | offline
  current_task: null
});

// Decision — recorded decision with rationale
CREATE (d:Decision {
  id: "dec-001",
  title: "Use TypeScript",
  rationale: "Type safety for complex codebase",
  status: "approved",     // pending | approved | rejected | deferred
  decided_by: "human",
  created_at: datetime()
});

// Artifact — output of work
CREATE (a:Artifact {
  id: "art-001",
  type: "code",           // code | doc | config | test
  path: "src/feature.ts",
  version: 1,
  created_at: datetime()
});

// Knowledge — learned fact
CREATE (k:Knowledge {
  id: "know-001",
  category: "architecture",  // architecture | pattern | domain | learning
  fact: "We use ESM modules",
  confidence: 1.0,
  source: "architect",
  created_at: datetime()
});

// --- Relationships ---

// Task dependencies
// (task)-[:BLOCKED_BY]->(other_task)

// Task assignment
// (task)-[:ASSIGNED_TO]->(agent)

// Task -> Project membership
// (task)-[:PART_OF]->(project)

// Task -> Artifact production
// (task)-[:PRODUCED]->(artifact)

// Quality loop tracking
// (task)-[:MADE_BY]->(agent)    — who created
// (task)-[:CHECKED_BY]->(agent) — who reviewed
// (task)-[:VERIFIED_BY]->(agent) — who tested

// Agent hierarchy
// (agent)-[:COMMANDS]->(agent)
// (agent)-[:REPORTS_TO]->(agent)

// Knowledge ownership
// (agent)-[:KNOWS]->(knowledge)

// --- Indexes ---
CREATE INDEX task_status FOR (t:Task) ON (t.status);
CREATE INDEX task_priority FOR (t:Task) ON (t.priority);
CREATE INDEX agent_status FOR (a:Agent) ON (a.status);
CREATE INDEX decision_status FOR (d:Decision) ON (d.status);
```

### Key Queries

```cypher
// Find blocked tasks and their blockers
MATCH (t:Task {status: "blocked"})-[:BLOCKED_BY]->(blocker:Task)
RETURN t.title, blocker.title, blocker.status;

// Find idle agents available for work
MATCH (a:Agent {status: "idle"})
WHERE NOT EXISTS { MATCH (t:Task {status: "assigned"})-[:ASSIGNED_TO]->(a) }
RETURN a.id, a.role;

// Critical path — longest dependency chain
MATCH path = (start:Task)-[:BLOCKED_BY*]->(end:Task)
WHERE NOT EXISTS { MATCH (start)-[:BLOCKED_BY]->() }
RETURN path ORDER BY length(path) DESC LIMIT 1;

// Tasks completed today
MATCH (t:Task)
WHERE t.completed_at >= datetime() - duration('P1D')
RETURN count(t) as completed_today;

// Quality metrics — rejection rate by agent
MATCH (t:Task)-[:MADE_BY]->(maker:Agent)
WHERE t.rejection_count > 0
RETURN maker.id, avg(t.rejection_count) as avg_rejections;
```

## Integration with .mind/ Files

The graph database supplements but does not replace `.mind/` files:

| Data | Where | Why |
|------|-------|-----|
| Current phase/status | `.mind/STATE.md` | Quick human-readable snapshot |
| Task relationships | Neo4j | Graph queries for dependencies |
| Progress tracking | `.mind/PROGRESS.md` | Simple checkbox tracking |
| Decision log | Both | DECISIONS.md for human reading, Neo4j for querying |
| Agent activity | Neo4j | Relationship-aware queries |

### Syncing Pattern

```typescript
// At session start, sync Neo4j state into .mind/ files
async function syncGraphToMind(neo4j: Driver, mindDir: string): Promise<void> {
  // Query graph for current state
  const blockedTasks = await neo4j.session().run(`
    MATCH (t:Task {status: "blocked"})-[:BLOCKED_BY]->(b:Task)
    RETURN t.title, b.title, b.status
  `);

  const activeTasks = await neo4j.session().run(`
    MATCH (t:Task)-[:ASSIGNED_TO]->(a:Agent)
    WHERE t.status IN ["assigned", "in_progress"]
    RETURN t.title, a.role, t.status
  `);

  // Update .mind/STATE.md with graph-derived state
  const stateContent = buildStateFromGraph(blockedTasks, activeTasks);
  writeFileSync(join(mindDir, 'STATE.md'), stateContent);
}
```

## TypeScript Client

A minimal Neo4j client for use in hook scripts or custom tools:

```typescript
import neo4j from 'neo4j-driver';

export function createGraphClient(uri = 'bolt://localhost:7687', password = 'memoryforge-dev') {
  const driver = neo4j.driver(uri, neo4j.auth.basic('neo4j', password));

  return {
    async query<T>(cypher: string, params?: Record<string, unknown>): Promise<T[]> {
      const session = driver.session();
      try {
        const result = await session.run(cypher, params);
        return result.records.map(r => r.toObject() as T);
      } finally {
        await session.close();
      }
    },
    async close(): Promise<void> {
      await driver.close();
    }
  };
}
```
