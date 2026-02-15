<p align="center">
  <h1 align="center">MemoryForge</h1>
  <p align="center">
    <strong>Persistent memory for Claude Code.</strong><br>
    Survive context compactions, session restarts, and multi-agent isolation.
  </p>
  <p align="center">
    <a href="#quick-start">Quick Start</a> &middot;
    <a href="#how-it-works">How It Works</a> &middot;
    <a href="#installation-tiers">Installation Tiers</a> &middot;
    <a href="#existing-projects">Existing Projects</a> &middot;
    <a href="#extensions">Extensions</a> &middot;
    <a href="docs/ARCHITECTURE.md">Architecture</a>
  </p>
</p>

---

## The Problem

Claude Code has three memory limitations that break long-running projects:

| Limitation | What Happens | Impact |
|:---|:---|:---|
| **Context compaction** | Old messages compressed when context fills | Claude forgets earlier work mid-session |
| **Session boundaries** | Closing Claude Code loses all context | Next session starts from zero |
| **Agent isolation** | Subagents don't share memory with each other | Teams duplicate work or contradict each other |

## The Solution

MemoryForge uses **Claude Code hooks** + **Markdown state files** to create a persistent memory loop that survives all three:

```
  Session starts ───> Hook reads .mind/ ───> Briefing injected into context
       ^                                              |
       |                                              v
       |                                        Work happens
       |                                              |
  Hook re-injects <─── Context compacted <─── Hook saves checkpoint
  briefing (source=compact)
```

**Zero dependencies.** No databases, no APIs, no npm packages. Just bash scripts and Markdown files.

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

Claude sees a briefing like this automatically:

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

That's it. Memory persists across sessions and compaction cycles.

---

## Installation Tiers

MemoryForge has a modular design. Install only what you need:

### Tier 1: Core (default)

Hooks + `.mind/` state files + Mind agent. Covers 90% of use cases.

```bash
bash install.sh /path/to/project
```

### Tier 2: + Team Agents

Adds orchestrator and builder agents for multi-agent coordination.

```bash
bash install.sh /path/to/project --with-team
```

### Tier 3: + Semantic Memory

Adds vector memory for "What did we learn about X?" queries.

```bash
bash install.sh /path/to/project --with-vector
```

### Tier 4: Full Stack

Core + team + vector + graph (Neo4j). Maximum coverage for complex multi-agent projects.

```bash
bash install.sh /path/to/project --full
```

### Project vs. User Level

| | Project-Level | User-Level (`--global`) |
|:---|:---|:---|
| **Where** | `project/.claude/` | `~/.claude/` |
| **Scope** | This project only | All Claude Code projects |
| **State files** | `project/.mind/` | Still per-project |
| **Use case** | "Memory on THIS project" | "Memory on EVERY project" |

```bash
# Install globally (all projects get memory)
bash install.sh --global

# Then add .mind/ to specific projects
bash install.sh /path/to/project-a
bash install.sh /path/to/project-b
```

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
| Skip CLAUDE.md | `--no-claude-md` | `-NoClaudeMd` | Skip Mind Protocol injection into CLAUDE.md |
| Uninstall | `--uninstall` | `-Uninstall` | Cleanly remove MemoryForge |
| Help | `--help` | -- | Show usage information |

---

## Existing Projects

MemoryForge is designed to install safely into projects that already have Claude Code configuration, other memory tools, or existing hooks.

### Smart Settings Merge

If your project already has `.claude/settings.json` with its own hooks, the installer **smart-merges** MemoryForge hooks alongside yours instead of overwriting:

```bash
# Preview what would change first
bash install.sh /path/to/project --dry-run

# Install — existing hooks are preserved, MF hooks added alongside
bash install.sh /path/to/project
```

The merge logic:
- Detects existing hook groups per event (SessionStart, PreCompact, etc.)
- Appends MemoryForge hooks to existing groups when matchers are compatible
- Adds as separate groups when matchers differ
- Creates a backup (`settings.json.backup`) before modifying
- Skips events where MemoryForge hooks are already present

### Competitor Detection

The installer automatically detects other Claude Code memory systems:

| System | Detection | Coexistence |
|:---|:---|:---|
| claude-mem | `.claude-memory` or `.claude-mem` directory | Compatible |
| MEMORY.md | `MEMORY.md` in project root | Compatible |
| Continuous-Claude | `.claude/ledger` directory | Check for hook conflicts |
| super-claude-kit | `.toon` directory or `TOON.md` | Compatible |
| claude-cognitive | Cognitive references in settings | Check for hook conflicts |
| MCP memory servers | MCP references in settings | Compatible |

When detected, the installer shows a warning with coexistence guidance before proceeding.

### Dry Run

Preview every change the installer would make, without modifying any files:

```bash
bash install.sh /path/to/project --dry-run
```

```powershell
.\install.ps1 -TargetDir "C:\project" -DryRun
```

Output shows `[dry-run]` prefixed actions — what would be created, merged, or skipped.

### CLAUDE.md Integration

The installer **automatically** adds the Mind Protocol section to your `CLAUDE.md` during project-level installs. This is essential — it tells Claude to read `.mind/` files at session start and update them at session end.

- Detects if Mind Protocol is already present (skips if so)
- Appends the template section to existing `CLAUDE.md`
- Creates `CLAUDE.md` from template if none exists
- Skip with `--no-claude-md` if you want to manage `CLAUDE.md` manually

### Uninstall

Cleanly remove MemoryForge without losing your project data:

```bash
bash install.sh /path/to/project --uninstall

# Preview what would be removed
bash install.sh /path/to/project --uninstall --dry-run
```

What gets removed:
- Hook scripts (8 files)
- MemoryForge entries from `settings.json` (other hooks preserved)
- MCP memory server (`scripts/mcp-memory-server.js`) and `memory` entry from `.mcp.json` (other MCP servers preserved)
- MemoryForge agents (only if they contain MF signatures)
- Tracking files (`.last-activity`, `.agent-activity`, etc.)
- Checkpoint directory

What gets **preserved**:
- `.mind/STATE.md`, `PROGRESS.md`, `DECISIONS.md`, `SESSION-LOG.md` — these are your project data
- Your existing hooks in `settings.json`
- Any agents not created by MemoryForge

---

## How It Works

### 8 Hooks, 4 State Files

**Hooks** fire automatically on Claude Code lifecycle events:

| Hook | Event | What It Does |
|:---|:---|:---|
| `session-start` | Startup + resume + **after compaction** | Reads `.mind/`, injects full briefing into context |
| `pre-compact` | Before context compression | Saves checkpoint to `.mind/checkpoints/latest.md` |
| `user-prompt-context` | Before each prompt | One-line state nudge: phase + next action |
| `stop-checkpoint` | After each Claude response | Writes activity timestamp, warns if state stale |
| `session-end` | Session terminates | Logs session end, warns if `.mind/` not updated |
| `subagent-start` | Agent spawned | Logs agent activity to `.mind/.agent-activity` |
| `subagent-stop` | Agent finishes | Logs completion, nudges to update progress |
| `task-completed` | Task marked done | Logs to `.mind/.task-completions` |

**State files** are human-readable Markdown that you and Claude co-maintain:

| File | Question It Answers | Updated |
|:---|:---|:---|
| `STATE.md` | Where are we right now? | Every session |
| `PROGRESS.md` | What's done, what's next? | As tasks complete |
| `DECISIONS.md` | Why did we choose X over Y? | When decisions are made |
| `SESSION-LOG.md` | What happened in each session? | End of each session |

### The Mind Agent

The Mind agent (`.claude/agents/mind.md`) is a specialized agent that **only** reads and writes `.mind/` files. It never writes code.

```
# Spawn it to get a status report
Task(subagent_type: "mind", prompt: "Read .mind/ and report current status")

# Spawn it to save state
Task(subagent_type: "mind", prompt: "Update .mind/ with what we did this session")
```

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
│   └── hooks/
│       ├── session-start.sh       # [CRITICAL] Morning briefing
│       ├── pre-compact.sh         # [CRITICAL] Checkpoint before compaction
│       ├── user-prompt-context.sh # Per-prompt state nudge
│       ├── stop-checkpoint.sh     # Activity timestamp
│       ├── session-end.sh         # Session end logging
│       ├── subagent-start.sh      # Agent spawn tracking
│       ├── subagent-stop.sh       # Agent completion tracking
│       └── task-completed.sh      # Task completion logging
└── .mind/
    ├── STATE.md                # Current phase, status, next action
    ├── PROGRESS.md             # Task tracking with checkboxes
    ├── DECISIONS.md            # Decision log with rationale
    ├── SESSION-LOG.md          # Session history
    └── checkpoints/            # Auto-managed compaction snapshots
```

### MCP Memory Tools

The MCP memory server gives Claude **6 tools** for querying and updating `.mind/` files mid-conversation — no manual file edits needed.

| Tool | What It Does | Example |
|:---|:---|:---|
| `memory_status` | Read current state from STATE.md | "Where are we?" |
| `memory_search` | Search all `.mind/` files by keyword | "What did we decide about auth?" |
| `memory_update_state` | Rewrite sections of STATE.md | Update phase, status, blockers |
| `memory_save_decision` | Append a decision to DECISIONS.md | Auto-numbered (DEC-001, DEC-002, ...) |
| `memory_save_progress` | Add or complete tasks in PROGRESS.md | Mark checkboxes, add new items |
| `memory_save_session` | Append a session summary to SESSION-LOG.md | Auto-numbered session entries |

The MCP server is **zero dependencies** — pure Node.js, no npm packages. It communicates with Claude via the standard MCP stdio protocol.

Claude can use these tools naturally:

```
Claude: "Let me check our current state..."
→ calls memory_status
→ "We're in Phase 3, the auth middleware is next."

Claude: "I'll record that we chose JWT over sessions."
→ calls memory_save_decision { title: "Use JWT for auth", decision: "JWT over sessions", rationale: "Stateless, scales better" }
→ "Decision DEC-005 saved."
```

### Dashboard

Visualize your project's memory state in the browser:

```bash
node scripts/dashboard.js .mind/
```

Generates a single static HTML file (`.mind/dashboard.html`) with:
- Progress bar with task completion stats
- Session count, decision count, current phase
- Full content of all 4 state files in a dark-themed grid layout

No server needed — all data is embedded in the HTML. Use `--no-open` to skip auto-opening the browser.

### Session Compression

As projects grow, `.mind/` files can get large. The compressor keeps things lean:

```bash
# Preview what would be compressed
node scripts/compress-sessions.js --dry-run .mind/

# Run compression
node scripts/compress-sessions.js .mind/
```

- **SESSION-LOG.md:** Keeps last 5 sessions in full, summarizes older entries to 1 line each
- **DECISIONS.md:** Keeps last 10 decisions in full, archives older to 1 line each
- Reports token savings after compression
- Auto-triggered on session start when `.mind/` files exceed ~3000 tokens

---

## Extensions

### Team Memory

Multi-agent coordination with shared state. Adds orchestrator and builder agents that all read from the same `.mind/` directory.

```bash
bash install.sh /path/to/project --with-team
```

See: [`extensions/team-memory/`](extensions/team-memory/README.md)

### Vector Memory

Semantic search across project knowledge. Ask "What did we learn about authentication?" and get relevant memories by meaning, not keywords.

Three implementation options: file-based (zero deps), LanceDB (lightweight), or ChromaDB (full-featured).

```bash
bash install.sh /path/to/project --with-vector
```

See: [`extensions/vector-memory/`](extensions/vector-memory/README.md)

### Graph Memory

Neo4j-backed state for complex relationships — task dependencies, agent hierarchies, decision chains, quality loops.

```bash
bash install.sh /path/to/project --with-graph
```

See: [`extensions/graph-memory/`](extensions/graph-memory/README.md)

### Coverage Matrix

| Capability | Core | +Team | +Vector | +Graph |
|:---|:---:|:---:|:---:|:---:|
| Session persistence | yes | yes | yes | yes |
| Compaction survival | yes | yes | yes | yes |
| Multi-agent state | - | yes | - | yes |
| "What did we learn about X?" | - | - | yes | - |
| Task dependency graphs | - | - | - | yes |
| Quality loop tracking | - | - | - | yes |
| Zero dependencies | yes | yes | - | - |

---

## Requirements

- **Claude Code** (any version with hooks support)
- **bash** (Git Bash on Windows, native on macOS/Linux)
- **node** (any version — used only for JSON formatting, no npm packages)

Extensions may have additional requirements (LanceDB, ChromaDB, Docker for Neo4j).

---

## FAQ

<details>
<summary><strong>Does this work on Windows?</strong></summary>

Yes. Hook scripts use bash (Git Bash, included with Git for Windows) and node. Both are standard developer tools on Windows. The PowerShell installer (`install.ps1`) provides native Windows support with all the same features.
</details>

<details>
<summary><strong>Does this need an internet connection?</strong></summary>

No. Everything is local files and shell scripts. No external APIs, no cloud services, no telemetry.
</details>

<details>
<summary><strong>How much context does the briefing consume?</strong></summary>

Typically 500-2,000 tokens, depending on `.mind/` file sizes. The hooks extract only the most relevant state (last 20 lines of session log, last 5 decisions, active progress sections).
</details>

<details>
<summary><strong>Can I use this with existing hooks?</strong></summary>

Yes. The installer uses **smart merge** to add MemoryForge hooks alongside your existing ones. It detects per-event hook groups, appends rather than replaces, and creates a backup before any modification. Use `--dry-run` to preview changes first.
</details>

<details>
<summary><strong>What about other memory tools (claude-mem, Continuous-Claude, etc.)?</strong></summary>

The installer automatically detects 6+ known memory systems and reports coexistence compatibility. Most tools serve different purposes and coexist without conflict. The installer warns about potential hook conflicts where they exist.
</details>

<details>
<summary><strong>What if I forget to update .mind/ files?</strong></summary>

The `stop-checkpoint` and `session-end` hooks remind you if `STATE.md` hasn't been updated in 30+ minutes. You can also spawn the Mind agent at session end to do it for you.
</details>

<details>
<summary><strong>Does this work with Claude Code teams/swarms?</strong></summary>

Yes. Subagent hooks track spawns and completions automatically. All agents read the same `.mind/` directory. The Team Memory extension adds dedicated orchestrator and builder agents.
</details>

<details>
<summary><strong>Can I version control .mind/ files?</strong></summary>

Yes, and you should. The human-edited state files (STATE.md, PROGRESS.md, DECISIONS.md, SESSION-LOG.md) are designed for git. Auto-generated tracking files and checkpoints are gitignored.
</details>

<details>
<summary><strong>What's the difference between --global and project-level?</strong></summary>

Project-level installs hooks into `your-project/.claude/` — only that project gets memory. Global (`--global`) installs into `~/.claude/` — every Claude Code project gets memory hooks. State files (`.mind/`) are always per-project regardless.
</details>

<details>
<summary><strong>How do I uninstall?</strong></summary>

Run `bash install.sh /path/to/project --uninstall`. This removes hooks, agents, and tracking files while preserving your `.mind/` state files (STATE.md, PROGRESS.md, etc.). Use `--uninstall --dry-run` to preview what would be removed.
</details>

<details>
<summary><strong>How is this different from claude-mem, CLAUDE.md, or other memory tools?</strong></summary>

Most memory tools store facts in a flat file or database. MemoryForge is a **structured state protocol**: 4 purpose-built files (status, progress, decisions, sessions), 8 lifecycle hooks for automatic save/restore, checkpoint system for compaction survival, and extension points for teams, vectors, and graphs. It's designed for multi-session, multi-agent projects — not just single-agent chat memory.
</details>

---

## Documentation

| Doc | What's In It |
|:---|:---|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | How the memory loop works, layer model, state file design |
| [`docs/HOOKS-REFERENCE.md`](docs/HOOKS-REFERENCE.md) | Detailed reference for all 8 hooks |
| [`docs/MCP-TOOLS.md`](docs/MCP-TOOLS.md) | MCP memory server: 6 tools for querying/updating `.mind/` |
| [`docs/TROUBLESHOOTING.md`](docs/TROUBLESHOOTING.md) | Common issues and fixes |
| [`docs/TEAM-EXTENSION.md`](docs/TEAM-EXTENSION.md) | Multi-agent team coordination guide |
| [`templates/CLAUDE.md.template`](templates/CLAUDE.md.template) | Mind Protocol section to add to your CLAUDE.md |

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
