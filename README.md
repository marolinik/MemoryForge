<p align="center">
  <img src="https://img.shields.io/badge/Zero_Dependencies-green?style=for-the-badge" alt="Zero Dependencies">
  <img src="https://img.shields.io/badge/Platform-macOS_%7C_Linux_%7C_Windows-blue?style=for-the-badge" alt="Platform">
  <img src="https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge" alt="MIT License">
</p>

<h1 align="center">MemoryForge</h1>

<p align="center">
  <strong>Persistent memory for Claude Code. Zero dependencies.</strong>
</p>

---

## How It Works

Claude Code forgets everything when context compacts. MemoryForge catches that moment, saves a checkpoint, and re-injects a briefing so Claude picks up where it left off.

```
  Session starts ───> Hook reads .mind/ ───> Briefing injected into context
       ^                                              |
       |                                              v
       |                                        Work happens
       |                                              |
  Hook re-injects <─── Context compacted <─── Hook saves checkpoint
  briefing (source=compact)
```

Three hooks, four state files, six MCP tools:

**Hooks** (fire automatically on Claude Code events):

| Hook | When | What |
|:---|:---|:---|
| `session-start` | Startup, resume, after compaction | Reads `.mind/`, injects briefing |
| `pre-compact` | Before context compression | Saves checkpoint to `.mind/checkpoints/` |
| `session-end` | Session terminates | Writes activity timestamp, session summary |

**State files** (human-readable Markdown):

| File | Purpose |
|:---|:---|
| `STATE.md` | Current phase, status, next action |
| `PROGRESS.md` | Task tracking with checkboxes |
| `DECISIONS.md` | Decision log with rationale |
| `SESSION-LOG.md` | Session history |

**MCP tools** (let Claude query/update `.mind/` mid-conversation):

| Tool | What It Does |
|:---|:---|
| `memory_status` | Read current state from STATE.md |
| `memory_search` | Search all `.mind/` files by keyword |
| `memory_update_state` | Update phase, status, blockers |
| `memory_save_decision` | Append a decision (auto-numbered) |
| `memory_save_progress` | Add or complete tasks |
| `memory_save_session` | Append a session summary |

---

## Quick Start

**1. Clone:**

```bash
git clone https://github.com/marolinik/MemoryForge.git
```

**2. Install into your project:**

```bash
# Interactive guided setup (recommended)
cd MemoryForge
node setup.js

# Or use the CLI installer:
bash MemoryForge/install.sh /path/to/your/project

# Windows PowerShell:
.\MemoryForge\install.ps1 -TargetDir "C:\path\to\your\project"
```

**3. Start Claude Code:**

```bash
cd your-project
claude
```

Claude now sees a briefing at every session start. Memory persists across sessions and compaction cycles.

> **Prerequisite:** [Node.js](https://nodejs.org/) 18+ must be installed. No npm packages needed.

---

## What Gets Installed

```
your-project/
├── .mcp.json                  # MCP memory server configuration
├── .claude/
│   └── settings.json          # Hook configuration (3 hooks)
├── scripts/
│   ├── mcp-memory-server.js   # MCP server (6 tools)
│   └── hooks/                 # 3 lifecycle hooks
└── .mind/
    ├── STATE.md               # Current phase, status, next action
    ├── PROGRESS.md            # Task tracking with checkboxes
    ├── DECISIONS.md           # Decision log with rationale
    ├── SESSION-LOG.md         # Session history
    └── checkpoints/           # Auto-managed compaction snapshots
```

---

## Configuration

Optional. Copy the template to customize thresholds:

```bash
cp MemoryForge/templates/memoryforge.config.json.template your-project/.memoryforge.config.json
```

| Setting | Default | What It Controls |
|:---|:---:|:---|
| `keepSessionsFull` | 5 | Recent sessions kept in full before summarizing |
| `keepDecisionsFull` | 10 | Recent decisions kept in full before summarizing |
| `archiveAfterDays` | 30 | Days before completed tasks are archived |

---

## Installation Flags

| Flag | Bash | PowerShell | Description |
|:---|:---|:---|:---|
| Core install | `bash install.sh [dir]` | `.\install.ps1 -TargetDir dir` | Hooks + state files + MCP server |
| User-level | `--global` | `-Global` | Install to `~/.claude/` for all projects |
| Dry run | `--dry-run` | `-DryRun` | Preview changes without writing files |
| Skip CLAUDE.md | `--no-claude-md` | `-NoClaudeMd` | Skip Mind Protocol injection |
| Uninstall | `--uninstall` | `-Uninstall` | Cleanly remove MemoryForge |

### Smart Merge

If you already have hooks in `.claude/settings.json`, the installer adds alongside — never overwrites. A backup is created before any modification.

### Uninstall

```bash
bash install.sh /path/to/project --uninstall
```

Removes hooks, scripts, and tracking files. Preserves `.mind/STATE.md`, `PROGRESS.md`, `DECISIONS.md`, `SESSION-LOG.md`.

### Updating

Re-run the installer over an existing installation. It detects the previous version and upgrades in place:

```bash
# Pull the latest release
cd MemoryForge
git pull

# Re-install (project-level)
bash install.sh /path/to/your/project

# Re-install (user-level)
bash install.sh --global

# Windows PowerShell
.\install.ps1 -TargetDir "C:\path\to\your\project"
.\install.ps1 -Global
```

What happens on update:
- Hook scripts are overwritten with the latest version
- `.claude/settings.json` hooks are smart-merged (existing hooks preserved)
- `.mind/` state files are **never** overwritten — your data is safe
- `.memoryforge-version` is updated to track the installed version
- Use `--dry-run` / `-DryRun` to preview changes before applying

---

## FAQ

<details>
<summary><strong>Why do I need this?</strong></summary>

Claude Code has `MEMORY.md` for notes and `CLAUDE.md` for instructions, but neither survives **context compaction**. When Claude runs out of context space mid-session, older messages are compressed and Claude loses track. MemoryForge hooks into the compaction event, saves a checkpoint, and re-injects a briefing afterward.
</details>

<details>
<summary><strong>Does this work on Windows?</strong></summary>

Yes. Hooks are pure Node.js — no bash required. The PowerShell installer (`install.ps1`) provides native Windows support.
</details>

<details>
<summary><strong>Does this need an internet connection?</strong></summary>

No. Everything is local files and Node.js scripts.
</details>

<details>
<summary><strong>Can I use this with existing hooks?</strong></summary>

Yes. The installer smart-merges MemoryForge hooks alongside yours. Use `--dry-run` to preview.
</details>

<details>
<summary><strong>Can I version control .mind/ files?</strong></summary>

Yes, and you should. The state files are Markdown designed for git. Tracking files and checkpoints are gitignored.
</details>

---

## Testing

```bash
node tests/mcp-server.test.js   # MCP tools + transport + security
node tests/compress.test.js     # Compression, archival, rotation
node tests/hooks.test.js        # Hook lifecycle, compaction survival
```

CI runs on every push: macOS + Linux + Windows, Node 18/20/22.

---

## License

[MIT](LICENSE)

---

<p align="center">
  <sub>Built for the Claude Code community. No affiliation with Anthropic.</sub>
</p>
