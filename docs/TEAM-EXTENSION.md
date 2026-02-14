# MemoryForge: Team Extension Guide

## Overview

When you use Claude Code's multi-agent features (Task tool, TeamCreate, SendMessage), this extension provides:

1. **Shared state** — all agents read the same `.mind/` directory
2. **Activity tracking** — hooks automatically log agent spawns/completions
3. **Specialized agents** — Mind (state keeper), Orchestrator (coordinator), Builder (implementer)
4. **Task audit trail** — automatic logging of completed tasks

## Architecture

```
Human
  |
  v
Claude Code (main session)
  |
  +-- Reads .mind/ at session start (via session-start hook)
  |
  +-- Spawns agents via Task tool:
  |     |
  |     +-- Mind agent (reads/writes .mind/ only)
  |     |     subagent-start hook logs: [timestamp] STARTED: mind
  |     |     subagent-stop hook logs:  [timestamp] STOPPED: mind
  |     |
  |     +-- Builder agent A (implements feature X)
  |     |     subagent-start hook logs: [timestamp] STARTED: builder
  |     |     task-completed hook logs: [timestamp] COMPLETED: #1 — Feature X
  |     |     subagent-stop hook logs:  [timestamp] STOPPED: builder
  |     |
  |     +-- Builder agent B (implements feature Y, parallel)
  |           subagent-start hook logs: [timestamp] STARTED: builder
  |           task-completed hook logs: [timestamp] COMPLETED: #2 — Feature Y
  |           subagent-stop hook logs:  [timestamp] STOPPED: builder
  |
  +-- Updates .mind/ at session end (or spawns Mind agent to do it)
```

## Setup

### 1. Install base MemoryForge

```bash
bash install.sh /path/to/your/project
```

### 2. Copy team agents

```bash
cp extensions/team-memory/agents/orchestrator.md your-project/.claude/agents/
cp extensions/team-memory/agents/builder.md your-project/.claude/agents/
```

The Mind agent is already installed by the base installer.

### 3. No additional hook configuration needed

The base hooks already handle SubagentStart, SubagentStop, and TaskCompleted events.

## Usage Patterns

### Pattern 1: Solo with Mind Agent

For single-developer projects where you want automated state management.

```
Session start:
  1. session-start hook injects briefing automatically
  2. You work normally

Mid-session state check:
  3. Spawn Mind agent: "Read .mind/ and tell me where we are"
  4. Mind reads all 4 files, reports status

Session end:
  5. Spawn Mind agent: "Update .mind/ with today's work:
     - Completed the auth module
     - Decided to use JWT over sessions
     - Next: implement the API layer"
  6. Mind updates STATE.md, PROGRESS.md, DECISIONS.md, SESSION-LOG.md
```

### Pattern 2: Orchestrator + Builders

For larger tasks that benefit from parallel work.

```
Session start:
  1. session-start hook injects briefing
  2. You assess what needs to be done

Parallel execution:
  3. Spawn orchestrator: "Read .mind/PROGRESS.md and determine
     the next 3 parallelizable tasks"
  4. Orchestrator reads state, identifies tasks
  5. You spawn builders in parallel:
     - Builder A: "Implement database schema"
     - Builder B: "Write API endpoints"
     - Builder C: "Create test fixtures"
  6. Hooks automatically log all agent activity

Wrap up:
  7. Review builder outputs
  8. Spawn Mind agent to update .mind/ files
```

### Pattern 3: Full Team (with TeamCreate)

For complex projects using Claude Code's native team features.

```
1. TeamCreate("my-project")
2. TaskCreate tasks for each work item
3. Spawn team members with team_name
4. Agents claim and complete tasks
5. task-completed hook logs each completion
6. At team completion:
   - Spawn Mind agent to write session summary
   - TeamDelete to clean up
```

## Agent Definitions

### Mind Agent

**File:** `.claude/agents/mind.md`
**Purpose:** State management only. Never writes code.
**Spawning:** `Task(subagent_type: "mind", prompt: "...")`

Key behaviors:
- Reads all 4 `.mind/` files before writing any
- Preserves existing content when appending (never truncates)
- Uses consistent Markdown formatting
- Distinguishes done/in-progress/blocked/not-started

### Orchestrator Agent

**File:** `.claude/agents/orchestrator.md`
**Purpose:** Reads state, determines next work, assigns tasks.
**Spawning:** `Task(subagent_type: "orchestrator", prompt: "...")`

Key behaviors:
- Reads `.mind/STATE.md` and `PROGRESS.md` for context
- Identifies unblocked, parallelizable tasks
- Includes acceptance criteria in task assignments
- Never writes code directly

### Builder Agent

**File:** `.claude/agents/builder.md`
**Purpose:** Implements specific tasks assigned by orchestrator.
**Spawning:** `Task(subagent_type: "builder", prompt: "...")`

Key behaviors:
- Reads `.mind/` for project context before starting
- Follows project coding standards
- Keeps changes focused on assigned task
- Reports completion with summary

## Auto-Generated Tracking Files

| File | Written By | Content |
|------|-----------|---------|
| `.mind/.agent-activity` | subagent-start/stop hooks | `[timestamp] STARTED/STOPPED: type (id)` |
| `.mind/.task-completions` | task-completed hook | `[timestamp] COMPLETED: #id — subject (by: name)` |
| `.mind/.session-tracking` | session-end hook | `Session ended: timestamp (reason: X)` |
| `.mind/.last-activity` | stop-checkpoint hook | UTC timestamp of last response |

These files are gitignored. The Mind agent reads them to incorporate into the human-readable `.mind/` state files.

## Tips

1. **Spawn Mind at session end.** Don't rely on remembering to update files manually.
2. **Keep STATE.md concise.** It's read on every session start and after every compaction.
3. **Archive completed phases.** Move done sections from PROGRESS.md to a separate archive file.
4. **Use task IDs.** Reference task IDs in PROGRESS.md so the task-completed hook entries correlate.
5. **Check .agent-activity for debugging.** If you're unsure what agents ran, this file has the full log.
