# MemoryForge: Team Memory Extension

Multi-agent team coordination with shared memory.

## Overview

When you use Claude Code's team features (Task tool with `team_name`, SendMessage, etc.), this extension tracks agent activity, task completions, and team state across sessions. Every agent in the team reads from the same `.mind/` directory, ensuring shared understanding.

## Architecture

```
Team Lead (you)
    |
    +-- .mind/STATE.md          <-- Shared state (all agents read)
    +-- .mind/PROGRESS.md       <-- Shared progress tracker
    +-- .mind/.agent-activity   <-- Auto-logged by hooks
    +-- .mind/.task-completions <-- Auto-logged by hooks
    |
    +-- Agent A (subagent)
    |   Reads .mind/ at spawn --> knows current state
    |   Work logged on stop --> .agent-activity
    |
    +-- Agent B (subagent)
    |   Reads .mind/ at spawn --> knows current state
    |   Work logged on stop --> .agent-activity
    |
    +-- Agent C (subagent)
        Reads .mind/ at spawn --> knows current state
        Work logged on stop --> .agent-activity
```

## Agents

### Mind Agent (`.claude/agents/mind.md`)
- Reads/writes `.mind/` files exclusively
- Never writes production code
- Consulted at session start/end for state management
- Use: `Task(subagent_type: "mind", prompt: "Update .mind/ files...")`

### Orchestrator Agent (`.claude/agents/orchestrator.md`)
- Reads `.mind/STATE.md` and `.mind/PROGRESS.md` to determine next work
- Assigns tasks to builder agents
- Coordinates parallel work streams
- Use: `Task(subagent_type: "orchestrator", prompt: "Determine next tasks...")`

### Builder Agent (`.claude/agents/builder.md`)
- Generic implementation agent
- Reads `.mind/` for context, executes assigned tasks
- Reports completion back to orchestrator
- Use: `Task(subagent_type: "builder", prompt: "Implement feature X...")`

## Installation

Copy the agents into your project:

```bash
cp extensions/team-memory/agents/*.md your-project/.claude/agents/
```

The hooks from the base install already handle `SubagentStart`, `SubagentStop`, and `TaskCompleted` events.

## Usage Pattern

```
# In your Claude Code session:

1. Spawn Mind agent to read current state
2. Determine what needs to be done (or spawn orchestrator)
3. Spawn builder agents for parallel work
4. SubagentStart/Stop hooks automatically log activity
5. TaskCompleted hooks automatically log completions
6. At session end, spawn Mind agent to update .mind/ files
```

## Team Workflow

For large projects with multiple work streams:

```
Session start
    |
    v
Mind agent reads .mind/ --> reports status
    |
    v
Orchestrator determines task assignments
    |
    v
Spawn parallel builder agents:
  Agent A: "Build authentication module"
  Agent B: "Write API endpoints"
  Agent C: "Create database migrations"
    |
    v
Hooks log all agent activity automatically
    |
    v
When agents complete, update .mind/PROGRESS.md
    |
    v
Mind agent writes session summary
```

## Auto-Generated Files

| File | Created By | Purpose |
|------|-----------|---------|
| `.mind/.agent-activity` | subagent-start/stop hooks | Log of agent spawns and completions |
| `.mind/.task-completions` | task-completed hook | Log of completed tasks with timestamps |
| `.mind/.session-tracking` | session-end hook | Session start/end times |

These files are auto-generated and gitignored. The Mind agent reads them to update the human-readable `.mind/` state files.
