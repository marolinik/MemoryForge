# MemoryForge Architecture

## The Problem

Claude Code has three memory limitations:

1. **Context Window** — conversations have a finite context window. When it fills up, older messages are compressed (compacted), losing detail.
2. **Session Boundaries** — when you close Claude Code and reopen it, all conversation context is lost. The agent starts fresh with no memory of previous work.
3. **Agent Isolation** — subagents (spawned via the Task tool) don't share context with each other or with the parent session.

## The Solution: Persistent Memory Loop

MemoryForge solves all three problems through a hook-driven memory loop:

```
┌──────────────────────────────────────────────────────────┐
│                 THE PERSISTENT MEMORY LOOP                │
│                                                          │
│  ┌─────────┐     ┌──────────┐     ┌──────────────────┐  │
│  │ SESSION  │────>│  WORK    │────>│ CONTEXT GROWS    │  │
│  │ START    │     │ HAPPENS  │     │ TOWARD LIMIT     │  │
│  │          │     │          │     │                  │  │
│  │ Hook     │     │ Per-     │     │                  │  │
│  │ reads    │     │ prompt   │     │                  │  │
│  │ .mind/   │     │ nudge    │     │                  │  │
│  │ injects  │     │ keeps    │     │                  │  │
│  │ briefing │     │ state    │     │                  │  │
│  └─────────┘     │ fresh    │     └────────┬─────────┘  │
│       ^          └──────────┘              │             │
│       │                                    v             │
│       │                           ┌──────────────────┐   │
│       │                           │ PRE-COMPACT      │   │
│       │                           │                  │   │
│       │                           │ Hook saves       │   │
│       │                           │ checkpoint to    │   │
│       │                           │ .mind/checkpoints│   │
│       │                           └────────┬─────────┘   │
│       │                                    │             │
│       │                                    v             │
│       │                           ┌──────────────────┐   │
│       │                           │ CONTEXT          │   │
│       │                           │ COMPACTED        │   │
│       │                           │                  │   │
│       └───────────────────────────│ Triggers         │   │
│         (source=compact)          │ SessionStart     │   │
│                                   │ again            │   │
│                                   └──────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

## Layer Model

```
┌─────────────────────────────────────────────┐
│  Layer 1: State Files (.mind/)              │
│  Human-readable Markdown files that any     │
│  session or agent can read/write            │
├─────────────────────────────────────────────┤
│  Layer 2: Hooks (scripts/hooks/)            │
│  Bash scripts triggered by Claude Code      │
│  lifecycle events. Auto-inject/save state   │
├─────────────────────────────────────────────┤
│  Layer 3: CLAUDE.md Protocol                │
│  Instructions in CLAUDE.md tell Claude      │
│  to read/update .mind/ files                │
├─────────────────────────────────────────────┤
│  Layer 4: Mind Agent (.claude/agents/)      │
│  Dedicated agent for state management       │
│  Can be spawned to update .mind/ files      │
├─────────────────────────────────────────────┤
│  Layer 5: Extensions (optional)             │
│  Vector DB for semantic search              │
│  Neo4j for relationship graphs              │
│  Team agents for multi-agent coordination   │
└─────────────────────────────────────────────┘
```

## Hook Lifecycle

### Event Timeline

```
Claude Code starts
    |
    v
[SessionStart hook fires]
    |  source=startup (first start)
    |  source=resume (resumed session)
    |  source=compact (after compaction)
    |
    |  Action: Read .mind/ files, output briefing as additionalContext
    |  The briefing is injected into Claude's context
    v
[User types a prompt]
    |
    v
[UserPromptSubmit hook fires]
    |
    |  Action: Extract phase + next action from STATE.md
    |  Output one-line context reminder
    v
[Claude processes and responds]
    |
    v
[Stop hook fires]
    |
    |  Action: Write .last-activity timestamp
    |  If STATE.md > 30 min old: output reminder to update
    v
[Context approaching limit...]
    |
    v
[PreCompact hook fires]
    |
    |  Action: Save full checkpoint to .mind/checkpoints/latest.md
    |  Output state summary (may survive partial compaction)
    v
[Context compacted]
    |
    v
[SessionStart hook fires AGAIN with source=compact]
    |
    |  Action: Read .mind/ + checkpoint, re-inject full briefing
    |  Claude continues with state fully restored
    v
[Work continues...]
    |
    v
[Session ending]
    |
    v
[SessionEnd hook fires]
    |
    |  Action: Log session end, warn if STATE.md stale
    v
Session closed
```

### Hook Data Flow

Each hook receives JSON on stdin and outputs JSON on stdout:

```
INPUT (stdin):
{
  "session_id": "sess-abc123",
  "source": "startup",          // SessionStart only
  "trigger": "auto",            // PreCompact only
  "prompt": "user's message",   // UserPromptSubmit only
  "reason": "exit",             // SessionEnd only
  "agent_type": "builder",      // SubagentStart/Stop only
  "agent_id": "agent-xyz",      // SubagentStart/Stop only
  "task_id": "task-001",        // TaskCompleted only
  "task_subject": "Build X",    // TaskCompleted only
  "transcript_path": "/path",
  "cwd": "/project"
}

OUTPUT (stdout):
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "... text injected into Claude's context ..."
  }
}
```

## State File Design

### Why Markdown?

1. **Human-readable** — you can open `.mind/STATE.md` in any editor
2. **Git-friendly** — track state changes in version control
3. **Simple parsing** — bash `grep` + `sed` extract key fields
4. **No dependencies** — no database, no runtime, just files
5. **Agent-writable** — Claude can read/write Markdown natively

### File Responsibilities

| File | Volatility | Purpose |
|------|-----------|---------|
| `STATE.md` | High (every session) | "Where are we right now?" |
| `PROGRESS.md` | Medium (as tasks complete) | "What's done, what's next?" |
| `DECISIONS.md` | Low (only when deciding) | "Why did we choose X?" |
| `SESSION-LOG.md` | Append-only (every session) | "What happened and when?" |

### State Extraction

The `user-prompt-context.sh` hook extracts key fields from `STATE.md`:

```bash
# Extracts the line after "## Current Phase"
PHASE=$(grep -A 1 "^## Current Phase" STATE.md | tail -1)

# Extracts the line after "## Next Action"
NEXT_ACTION=$(grep -A 1 "^## Next Action" STATE.md | tail -1)

# Extracts the line after "## Blocked Items"
BLOCKERS=$(grep -A 1 "^## Blocked Items" STATE.md | tail -1)
```

This means **STATE.md must follow a consistent format**. Each `## Section` must have its content on the next line.

## Scaling

### Single Agent (Base)

Just `.mind/` files + hooks. Works out of the box for most projects.

### Multi-Agent Teams (Team Extension)

Add subagent hooks + team agents. All agents read/write the same `.mind/` directory.

### Semantic Memory (Vector Extension)

Add vector DB for similarity search. Augments flat files with "find related work" capability.

### Complex State (Graph Extension)

Add Neo4j for relationship queries. For projects with task dependencies, agent hierarchies, quality workflows.

### Combining Extensions

Extensions are additive — use any combination:

```
Base (.mind/ + hooks)
  + Team agents (multi-agent coordination)
  + Vector DB (semantic search)
  + Neo4j (relationship queries)
```

The `.mind/` files remain the source of truth. Extensions add query capabilities on top.
