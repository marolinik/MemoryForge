<p align="center">
  <img src="https://img.shields.io/badge/Zero_Dependencies-green?style=for-the-badge" alt="Zero Dependencies">
  <img src="https://img.shields.io/badge/Platform-macOS_%7C_Linux_%7C_Windows-blue?style=for-the-badge" alt="Platform">
  <img src="https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge" alt="MIT License">
</p>

<h1 align="center">MemoryForge</h1>

<p align="center">
  <strong>Claude Code forgets everything when context resets. MemoryForge fixes that.</strong>
</p>

<p align="center">
  <a href="#what-is-this">What Is This?</a> &middot;
  <a href="#before--after">Before & After</a> &middot;
  <a href="#quick-start">Quick Start</a> &middot;
  <a href="#how-it-works">How It Works</a> &middot;
  <a href="#installation-tiers">Tiers</a> &middot;
  <a href="#faq">FAQ</a>
</p>

---

## What Is This?

MemoryForge gives Claude Code **persistent memory** that survives context compactions, session restarts, and multi-agent handoffs.

It's a set of lifecycle hooks + Markdown state files that automatically save and restore Claude's understanding of your project. No databases, no APIs, no npm packages — just bash scripts and `.mind/` files.

**In plain English:** When Claude Code runs out of context space, it compresses old messages and forgets what it was doing. MemoryForge catches that moment, saves a checkpoint, and re-injects a briefing so Claude picks up exactly where it left off.

---

## Before & After

### Without MemoryForge

```
Session 1:  "Build the auth module"  → Claude writes auth code
Session 2:  "Continue where we left off" → "I don't have context about previous work..."

Mid-session: Context compacts → Claude forgets the architecture decisions from 10 minutes ago
Multi-agent: Subagent finishes → Parent agent has no idea what it did
```

### With MemoryForge

```
Session 1:  "Build the auth module" → Claude writes auth code
            Hook saves: phase, decisions, progress to .mind/

Session 2:  Hook injects briefing → Claude sees:
            "Phase 2: Auth module — IN PROGRESS. JWT chosen over sessions (DEC-003).
             Next: implement token refresh endpoint."

Mid-session: Pre-compact hook saves checkpoint → Compaction happens →
             Session-start hook re-injects full briefing → Work continues seamlessly

Multi-agent: Subagent hooks track spawns/completions → All agents read same .mind/ state
```

---

## Quick Start

**1. Clone:**

```bash
git clone https://github.com/marolinik/MemoryForge.git
```

**2. Install into your project:**

```bash
# Unix / macOS / Git Bash on Windows
bash MemoryForge/install.sh /path/to/your/project

# Windows PowerShell
.\MemoryForge\install.ps1 -TargetDir "C:\path\to\your\project"
```

**3. Start Claude Code:**

```bash
cd your-project
claude
```

That's it. Claude now sees a briefing at every session start:

```
=== SESSION BRIEFING ===
Starting a new session. Read the state below and pick up the next task.

--- CURRENT STATE (.mind/STATE.md) ---
## Current Phase
Phase 2: API Development — IN PROGRESS

## Next Action
Implement the authentication middleware
...
```

Memory persists across sessions, compaction cycles, and agent handoffs.

---

## How It Works

### The Persistent Memory Loop

```
  Session starts ───> Hook reads .mind/ ───> Briefing injected into context
       ^                                              |
       |                                              v
       |                                        Work happens
       |                                              |
  Hook re-injects <─── Context compacted <─── Hook saves checkpoint
  briefing (source=compact)
```

This loop runs automatically. You don't have to do anything. The hooks fire on Claude Code's lifecycle events and handle everything.

### 8 Hooks, 4 State Files, 6 MCP Tools

**Hooks** fire automatically on Claude Code events:

| Hook | When | What |
|:---|:---|:---|
| `session-start` | Startup, resume, **after compaction** | Reads `.mind/`, injects full briefing |
| `pre-compact` | Before context compression | Saves checkpoint to `.mind/checkpoints/` |
| `user-prompt-context` | Before each prompt | One-line state nudge: phase + next action |
| `stop-checkpoint` | After each Claude response | Writes activity timestamp, tracks changed files |
| `session-end` | Session terminates | Auto-generates session summary if none written |
| `subagent-start` | Agent spawned | Logs agent activity |
| `subagent-stop` | Agent finishes | Logs completion |
| `task-completed` | Task marked done | Logs to task completions |

**State files** are human-readable Markdown that Claude reads and writes:

| File | Purpose | Updated |
|:---|:---|:---|
| `STATE.md` | Where are we right now? | Every session |
| `PROGRESS.md` | What's done, what's next? | As tasks complete |
| `DECISIONS.md` | Why did we choose X over Y? | When decisions are made |
| `SESSION-LOG.md` | What happened in each session? | End of each session |

**MCP tools** let Claude query and update `.mind/` mid-conversation:

| Tool | What It Does |
|:---|:---|
| `memory_status` | Read current state from STATE.md |
| `memory_search` | Search all `.mind/` files by keyword |
| `memory_update_state` | Update phase, status, blockers in STATE.md |
| `memory_save_decision` | Append a decision to DECISIONS.md (auto-numbered) |
| `memory_save_progress` | Add or complete tasks in PROGRESS.md |
| `memory_save_session` | Append a session summary to SESSION-LOG.md |

### What Gets Installed

```
your-project/
├── CLAUDE.md                  # Mind Protocol section (appended or created)
├── .mcp.json                  # MCP memory server configuration
├── .claude/
│   ├── settings.json          # Hook configuration (8 hooks wired)
│   └── agents/
│       └── mind.md            # Mind agent (state keeper)
├── scripts/
│   ├── mcp-memory-server.js   # MCP server (6 tools for .mind/ access)
│   └── hooks/                 # 8 lifecycle hook scripts
└── .mind/
    ├── STATE.md               # Current phase, status, next action
    ├── PROGRESS.md            # Task tracking with checkboxes
    ├── DECISIONS.md           # Decision log with rationale
    ├── SESSION-LOG.md         # Session history
    └── checkpoints/           # Auto-managed compaction snapshots
```

### Dashboard

Visualize your project's memory state in the browser:

```bash
node scripts/dashboard.js .mind/
```

Generates a dark-themed HTML dashboard with progress stats, session counts, decision log, and full state file display. Use `--no-open` to skip auto-opening the browser.

### Session Compression

As projects grow, `.mind/` files accumulate entries. The compressor keeps them lean:

```bash
node scripts/compress-sessions.js .mind/        # compress
node scripts/compress-sessions.js --dry-run .mind/  # preview only
```

- Keeps last 5 sessions in full, summarizes older to 1 line
- Keeps last 10 decisions in full, summarizes older to 2 lines (title + rationale)
- Archives completed tasks older than 30 days to `ARCHIVE.md`
- Rotates tracking files (`.agent-activity`, `.task-completions`) to last 100 entries
- Auto-triggered on session start when `.mind/` exceeds ~3000 tokens

### Progressive Briefings

For large projects, the session-start hook automatically switches to a compact briefing (~200 tokens) that includes only the current state, in-progress tasks, and blockers. Full details are available via MCP tools (`memory_status`, `memory_search`). Post-compaction briefings always use the full format to maximize context recovery.

### Configuration

Copy the config template to your project root to customize thresholds:

```bash
cp MemoryForge/templates/memoryforge.config.json.template your-project/.memoryforge.config.json
```

> **Note:** Config is pure JSON — no code execution, safe to commit.

All settings have sensible defaults — only override what you need:

| Setting | Default | What It Controls |
|:---|:---:|:---|
| `keepSessionsFull` | 5 | Recent sessions kept in full |
| `keepDecisionsFull` | 10 | Recent decisions kept in full |
| `archiveAfterDays` | 30 | Days before completed tasks are archived |
| `trackingMaxLines` | 100 | Max entries in tracking files |
| `compressThresholdBytes` | 12000 | Auto-compress trigger (~3000 tokens) |
| `staleWarningSeconds` | 1800 | Warn about stale STATE.md (30 min) |
| `sessionLogTailLines` | 20 | Session log lines in briefing |
| `briefingRecentDecisions` | 5 | Decisions shown in briefing |
| `briefingMaxProgressLines` | 40 | Progress lines in briefing |

---

## Installation Tiers

MemoryForge is modular. Install only what you need:

| Tier | What You Get | Command |
|:----:|:---|:---|
| **1** | Hooks + state files + MCP tools + Mind agent | `bash install.sh /path/to/project` |
| **2** | + Team agents (orchestrator + builder) | `bash install.sh /path/to/project --with-team` |
| **3** | + Semantic memory (vector search) | `bash install.sh /path/to/project --with-vector` |
| **4** | Everything (core + team + vector + graph) | `bash install.sh /path/to/project --full` |

### Project vs. User Level

| | Project-Level | User-Level (`--global`) |
|:---|:---|:---|
| **Where** | `project/.claude/` | `~/.claude/` |
| **Scope** | This project only | All Claude Code projects |
| **State files** | `project/.mind/` | Still per-project |
| **Use case** | "Memory on THIS project" | "Memory on EVERY project" |

### All Flags

| Flag | Bash | PowerShell | Description |
|:---|:---|:---|:---|
| Core only | `bash install.sh [dir]` | `.\install.ps1 -TargetDir dir` | Hooks + state files + Mind agent |
| + Team agents | `--with-team` | `-WithTeam` | Add orchestrator + builder agents |
| + Vector memory | `--with-vector` | `-WithVector` | Add semantic search extension |
| + Graph memory | `--with-graph` | `-WithGraph` | Add Neo4j graph extension |
| All extensions | `--full` | `-Full` | Core + all extensions |
| User-level | `--global` | `-Global` | Install to `~/.claude/` for all projects |
| Dry run | `--dry-run` | `-DryRun` | Preview changes without writing files |
| Skip CLAUDE.md | `--no-claude-md` | `-NoClaudeMd` | Skip Mind Protocol injection |
| Uninstall | `--uninstall` | `-Uninstall` | Cleanly remove MemoryForge |
| Help | `--help` | -- | Show usage information |

---

## Existing Projects

MemoryForge installs safely into projects with existing Claude Code configuration, hooks, or other memory tools.

### Smart Merge

If you already have hooks in `.claude/settings.json`, the installer **adds alongside** — never overwrites:

```bash
# Preview what would change
bash install.sh /path/to/project --dry-run

# Install — existing hooks preserved, MemoryForge hooks added
bash install.sh /path/to/project
```

A backup (`settings.json.backup`) is created before any modification.

### Competitor Detection

The installer detects 6+ other memory systems (claude-mem, Continuous-Claude, super-claude-kit, etc.) and shows coexistence guidance before proceeding.

### Uninstall

Clean removal without losing project data:

```bash
bash install.sh /path/to/project --uninstall
bash install.sh /path/to/project --uninstall --dry-run  # preview
```

**Removed:** Hook scripts, MemoryForge entries from settings.json, MCP server, tracking files, checkpoints.
**Preserved:** `.mind/STATE.md`, `PROGRESS.md`, `DECISIONS.md`, `SESSION-LOG.md` — your project data stays.

---

## Extensions

### Team Memory

Multi-agent coordination with shared state. Adds orchestrator and builder agents.

```bash
bash install.sh /path/to/project --with-team
```

### Vector Memory

Semantic search: "What did we learn about authentication?" — finds related memories by meaning, not keywords.

```bash
bash install.sh /path/to/project --with-vector
```

### Graph Memory

Neo4j-backed state for task dependencies, agent hierarchies, decision chains, quality loops.

```bash
bash install.sh /path/to/project --with-graph
```

### Coverage Matrix

| Capability | Core | +Team | +Vector | +Graph |
|:---|:---:|:---:|:---:|:---:|
| Session persistence | yes | yes | yes | yes |
| Compaction survival | yes | yes | yes | yes |
| Multi-agent state | - | yes | - | yes |
| "What did we learn about X?" | - | - | yes | - |
| Task dependency graphs | - | - | - | yes |
| Zero dependencies | yes | yes | - | - |

---

## FAQ

<details>
<summary><strong>Why do I need this? Doesn't Claude Code already have memory?</strong></summary>

Claude Code has `MEMORY.md` for auto-notes and `CLAUDE.md` for instructions. But neither survives **context compaction** — when Claude runs out of context space mid-session, older messages are compressed and Claude loses track of what it was doing. MemoryForge hooks into the compaction event, saves a checkpoint, and re-injects a full briefing afterward. It also provides structured state tracking (phase, progress, decisions, sessions) that flat memory notes can't match.
</details>

<details>
<summary><strong>Does this work on Windows?</strong></summary>

Yes. Hook scripts use bash (Git Bash, included with Git for Windows) and Node.js. The PowerShell installer (`install.ps1`) provides native Windows support with all the same features.
</details>

<details>
<summary><strong>Does this need an internet connection?</strong></summary>

No. Everything is local files and shell scripts. No external APIs, no cloud services, no telemetry.
</details>

<details>
<summary><strong>How much context does the briefing consume?</strong></summary>

Typically 500-2,000 tokens depending on `.mind/` file sizes. The hooks extract only the most relevant state. Session compression auto-triggers when files exceed ~3,000 tokens.
</details>

<details>
<summary><strong>Can I use this with existing hooks?</strong></summary>

Yes. The installer smart-merges MemoryForge hooks alongside your existing ones. Use `--dry-run` to preview.
</details>

<details>
<summary><strong>What about other memory tools (claude-mem, etc.)?</strong></summary>

The installer detects 6+ known memory systems and reports coexistence compatibility. Most tools serve different purposes and coexist without conflict.
</details>

<details>
<summary><strong>Does this work with Claude Code teams/subagents?</strong></summary>

Yes. Subagent hooks track spawns and completions automatically. All agents read the same `.mind/` directory. The Team Memory extension adds dedicated coordination agents.
</details>

<details>
<summary><strong>Can I version control .mind/ files?</strong></summary>

Yes, and you should. The state files are Markdown designed for git. Auto-generated tracking files and checkpoints are gitignored.
</details>

<details>
<summary><strong>How do I uninstall?</strong></summary>

`bash install.sh /path/to/project --uninstall`. Removes hooks and tracking files, preserves your `.mind/` state files.
</details>

---

## Documentation

| Doc | What's In It |
|:---|:---|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Memory loop design, layer model, state file formats |
| [`docs/HOOKS-REFERENCE.md`](docs/HOOKS-REFERENCE.md) | Detailed reference for all 8 hooks |
| [`docs/MCP-TOOLS.md`](docs/MCP-TOOLS.md) | MCP memory server: 6 tools for .mind/ access |
| [`docs/COMPETITIVE-ANALYSIS.md`](docs/COMPETITIVE-ANALYSIS.md) | Full competitive landscape (9 tools benchmarked) |
| [`docs/TROUBLESHOOTING.md`](docs/TROUBLESHOOTING.md) | Common issues and fixes |
| [`templates/CLAUDE.md.template`](templates/CLAUDE.md.template) | Mind Protocol section for your CLAUDE.md |

---

## Contributing

Contributions welcome. Please open an issue first to discuss what you'd like to change.

1. Fork it
2. Create your feature branch (`git checkout -b feature/amazing`)
3. Commit your changes
4. Push to the branch (`git push origin feature/amazing`)
5. Open a pull request

---

## License

[MIT](LICENSE)

---

<p align="center">
  <sub>Built for the Claude Code community. No affiliation with Anthropic.</sub>
</p>
