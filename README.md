# MemoryForge

**Persistent memory for Claude Code.** Survive context compactions, session restarts, and multi-day projects.

Claude Code forgets everything when context compacts or sessions end. MemoryForge fixes that with a hook-driven memory loop that automatically saves and restores project state.

## The Problem

| Limitation | What Happens | Impact |
|-----------|-------------|--------|
| **Context Window** | Old messages compressed when context fills up | Claude loses details about earlier work |
| **Session Boundaries** | Closing Claude Code loses all conversation context | Next session starts from scratch |
| **Agent Isolation** | Subagents don't share memory with parent or each other | Agents duplicate work or contradict each other |

## The Solution

MemoryForge uses Claude Code hooks + Markdown state files to create a **persistent memory loop**:

```
Session starts -----> Hook reads .mind/ files -----> Briefing injected into context
                                                              |
Work continues <---- Hook re-injects briefing <---- Context compacted
        |                                                     ^
        v                                                     |
Context grows -----> Hook saves checkpoint -----> Compaction triggers
```

**Result:** Claude maintains full awareness of project state across unlimited sessions and compaction cycles. No external services required.

## Quick Start

### Install into your project

**Unix/macOS/Git Bash:**
```bash
git clone https://github.com/YOUR_USERNAME/MemoryForge.git
cd MemoryForge
bash install.sh /path/to/your/project
```

**Windows PowerShell:**
```powershell
git clone https://github.com/YOUR_USERNAME/MemoryForge.git
cd MemoryForge
.\install.ps1 -TargetDir "C:\path\to\your\project"
```

### What gets installed

```
your-project/
├── .claude/
│   ├── settings.json        # Hook configuration
│   └── agents/
│       └── mind.md          # Mind agent (state keeper)
├── scripts/
│   └── hooks/
│       ├── session-start.sh     # Injects briefing on startup/compact
│       ├── pre-compact.sh       # Saves checkpoint before compaction
│       ├── user-prompt-context.sh # Lightweight state nudge per prompt
│       ├── stop-checkpoint.sh   # Activity timestamp + stale reminders
│       ├── session-end.sh       # Session end logging
│       ├── subagent-start.sh    # Agent spawn tracking
│       ├── subagent-stop.sh     # Agent completion tracking
│       └── task-completed.sh    # Task completion logging
└── .mind/
    ├── STATE.md             # Current phase, status, next action
    ├── PROGRESS.md          # Task tracking with checkboxes
    ├── DECISIONS.md         # Decision log with rationale
    ├── SESSION-LOG.md       # Session history
    └── checkpoints/         # Auto-managed compaction snapshots
```

### Configure your CLAUDE.md

Add the Mind Protocol section to your project's `CLAUDE.md`. See `templates/CLAUDE.md.template` for the full section to copy.

The key instructions tell Claude to:
1. Read `.mind/STATE.md` before starting any work
2. Update `.mind/` files before ending any session
3. Never assume state — always verify against `.mind/` files

### Start working

```bash
cd your-project
claude  # Start Claude Code — the session-start hook fires automatically
```

Claude will see a briefing like:

```
=== SESSION BRIEFING ===
Starting a new session. Read the state below and pick up the next task.

--- CURRENT STATE (.mind/STATE.md) ---
# Project State

## Current Phase
Phase 2: API Development — IN PROGRESS

## Next Action
Implement the authentication middleware
...
```

## How It Works

### 8 Hooks, 4 State Files

**Hooks** (automatic, you never run these manually):

| Hook | When | What |
|------|------|------|
| `session-start` | Session start + after compaction | Reads `.mind/`, injects full briefing |
| `pre-compact` | Before context compression | Saves checkpoint to `.mind/checkpoints/` |
| `user-prompt-context` | Before each prompt is processed | One-line state reminder |
| `stop-checkpoint` | After each Claude response | Writes activity timestamp |
| `session-end` | Session terminates | Logs end, warns if state stale |
| `subagent-start` | Agent spawned | Logs agent activity |
| `subagent-stop` | Agent finishes | Logs completion, nudges to update |
| `task-completed` | Task marked done | Logs task completion |

**State Files** (you and Claude maintain these):

| File | Purpose | Update Frequency |
|------|---------|-----------------|
| `STATE.md` | Where are we right now? | Every session |
| `PROGRESS.md` | What's done, what's next? | As tasks complete |
| `DECISIONS.md` | Why did we choose X? | When decisions are made |
| `SESSION-LOG.md` | What happened each session? | End of each session |

### The Mind Agent

The Mind agent (`.claude/agents/mind.md`) is a specialized agent that only reads and writes `.mind/` files. It never writes code. Use it to:

- Get a status report: "Where are we?"
- Update state after work: "Update .mind/ files with what we just did"
- Record a decision: "Log this decision in DECISIONS.md"

Spawn it:
```
Task(subagent_type: "mind", prompt: "Read .mind/ files and report current status")
```

## Extensions

### Team Memory

Multi-agent coordination with shared state. Adds orchestrator and builder agents that all read from the same `.mind/` directory.

See: `extensions/team-memory/README.md`

### Vector Memory

Semantic search across project knowledge. Ask "What did we learn about X?" and get relevant memories by meaning, not keywords.

See: `extensions/vector-memory/README.md`

### Graph Memory

Neo4j-backed state for complex relationships — task dependencies, agent hierarchies, decision chains, artifact lineage.

See: `extensions/graph-memory/README.md`

## Requirements

- **Claude Code** (any version with hooks support)
- **bash** (Git Bash on Windows, native on macOS/Linux)
- **node** (any version — used for JSON formatting, no npm packages)

No external services, no API keys, no database. Just files and shell scripts.

## Project Structure

```
MemoryForge/
├── README.md                        # This file
├── LICENSE                          # MIT
├── install.sh                       # Unix/macOS installer
├── install.ps1                      # Windows PowerShell installer
├── install.bat                      # Windows batch wrapper
├── .claude/
│   ├── settings.json                # Hook configuration
│   └── agents/
│       └── mind.md                  # Mind agent definition
├── scripts/
│   └── hooks/
│       ├── session-start.sh         # [CRITICAL] Morning briefing
│       ├── pre-compact.sh           # [CRITICAL] Checkpoint before compact
│       ├── user-prompt-context.sh   # Per-prompt state nudge
│       ├── stop-checkpoint.sh       # Activity timestamp
│       ├── session-end.sh           # Session end logging
│       ├── subagent-start.sh        # Agent spawn tracking
│       ├── subagent-stop.sh         # Agent completion tracking
│       └── task-completed.sh        # Task completion logging
├── templates/
│   ├── .mind/
│   │   ├── STATE.md                 # Template state file
│   │   ├── DECISIONS.md             # Template decision log
│   │   ├── PROGRESS.md              # Template progress tracker
│   │   └── SESSION-LOG.md           # Template session log
│   └── CLAUDE.md.template           # Memory section for CLAUDE.md
├── extensions/
│   ├── team-memory/                 # Multi-agent coordination
│   │   ├── README.md
│   │   └── agents/
│   │       ├── orchestrator.md
│   │       └── builder.md
│   ├── vector-memory/               # Semantic search
│   │   └── README.md
│   └── graph-memory/                # Neo4j relationships
│       ├── README.md
│       └── docker-compose.yml
└── docs/
    ├── ARCHITECTURE.md              # How the memory system works
    ├── HOOKS-REFERENCE.md           # Detailed hook documentation
    └── TROUBLESHOOTING.md           # Common issues and fixes
```

## FAQ

**Q: Does this work on Windows?**
A: Yes. Hook scripts use bash (Git Bash on Windows) and node. Both are standard for developers on Windows.

**Q: Does this require an internet connection?**
A: No. Everything is local files and shell scripts. No external APIs or services.

**Q: How much context does the briefing consume?**
A: Typically 500-2000 tokens, depending on the size of your `.mind/` files. The hooks are designed to extract only the most relevant state.

**Q: Can I use this with existing hooks?**
A: Yes. If you already have `.claude/settings.json`, the installer saves a reference config and you can manually merge the hooks.

**Q: What if I forget to update `.mind/` files?**
A: The stop-checkpoint and session-end hooks will remind you if STATE.md hasn't been updated in 30+ minutes.

**Q: Does this work with Claude Code teams/swarms?**
A: Yes. The subagent hooks track agent spawns and completions. All agents can read the same `.mind/` directory. See the Team Memory extension for dedicated team agents.

**Q: Can I version control `.mind/` files?**
A: Yes, and you should. The main files (STATE.md, PROGRESS.md, DECISIONS.md, SESSION-LOG.md) are designed for git. Auto-generated tracking files (.last-activity, .agent-activity, etc.) and checkpoints are gitignored.

## License

MIT
