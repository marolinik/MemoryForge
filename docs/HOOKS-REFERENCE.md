# MemoryForge Hooks Reference

## Overview

MemoryForge uses 8 Claude Code hooks to maintain persistent memory. Each hook is a bash script that fires on a specific lifecycle event.

## Hook Summary

| Hook | Event | Priority | Context Injection | Purpose |
|------|-------|----------|-------------------|---------|
| `session-start.sh` | SessionStart | CRITICAL | Yes | Full briefing on startup/resume/compact |
| `pre-compact.sh` | PreCompact | CRITICAL | Yes | Save checkpoint before compaction |
| `user-prompt-context.sh` | UserPromptSubmit | Medium | Yes | Lightweight state nudge per prompt |
| `stop-checkpoint.sh` | Stop | Medium | Conditional | Activity timestamp + stale reminder |
| `session-end.sh` | SessionEnd | Medium | No (stderr only) | Session end logging + warning |
| `subagent-start.sh` | SubagentStart | Low | No | Agent spawn tracking |
| `subagent-stop.sh` | SubagentStop | Low | Yes | Agent completion tracking |
| `task-completed.sh` | TaskCompleted | Low | No | Task completion logging |

## Detailed Reference

### session-start.sh

**When:** Session startup, resume, or after context compaction
**Matcher:** `startup|resume|compact|clear`
**Timeout:** 15 seconds

**What it does:**
1. Reads all `.mind/` state files (STATE.md, PROGRESS.md, DECISIONS.md, SESSION-LOG.md)
2. Reads checkpoint if available (`.mind/checkpoints/latest.md`)
3. Builds a briefing with different headers based on source:
   - `startup/resume`: "SESSION BRIEFING"
   - `compact`: "CONTEXT RESTORED (post-compaction)"
4. Outputs briefing as `additionalContext` — injected into Claude's context

**Key design choices:**
- SESSION-LOG.md: only last 20 lines (keeps context light)
- PROGRESS.md: extracts "In Progress", "Blocked", "Next" sections (caps at 40 lines)
- DECISIONS.md: shows last 5 decisions only
- Checkpoint: only included on compact recovery

**Stdin:** `{ session_id, source, model, transcript_path, cwd }`
**Stdout:** `{ hookSpecificOutput: { additionalContext: "..." } }`

---

### pre-compact.sh

**When:** Before context compaction (manual or automatic)
**Timeout:** 10 seconds

**What it does:**
1. Reads STATE.md and extracts progress summary from PROGRESS.md
2. Creates a checkpoint file at `.mind/checkpoints/latest.md`
3. Also creates a timestamped copy: `.mind/checkpoints/compact-{timestamp}.md`
4. Prunes old checkpoints (keeps last 10)
5. Outputs state summary as `additionalContext` — placed right before compaction for best survival

**Checkpoint format:**
```markdown
# Pre-Compaction Checkpoint
## Timestamp: 2024-01-15T10:30:00Z
## Trigger: auto

## State at Compaction
[contents of STATE.md]

## In-Progress Work
[extracted from PROGRESS.md]

## Recovery Instructions
After compaction, the session-start hook will re-inject the full briefing.
Check .mind/STATE.md for authoritative current state.
```

---

### user-prompt-context.sh

**When:** After user submits a prompt, before Claude processes it
**Timeout:** 5 seconds

**What it does:**
1. Extracts three fields from STATE.md via `grep`:
   - Current Phase (line after `## Current Phase`)
   - Next Action (line after `## Next Action`)
   - Blocked Items (line after `## Blocked Items`)
2. If no state is available, outputs empty `{}` (no injection)
3. Otherwise outputs a one-line reminder:
   `[Memory] Phase: X | Next: Y | BLOCKED: Z | (Read .mind/STATE.md for details)`

**Design:** Intentionally minimal — one line, every prompt. The full briefing comes from session-start; this is just a nudge to keep Claude oriented.

---

### stop-checkpoint.sh

**When:** After Claude finishes each response
**Timeout:** 5 seconds

**What it does:**
1. Writes current UTC timestamp to `.mind/.last-activity`
2. Checks if STATE.md is older than 30 minutes
3. If stale: outputs a reminder to update `.mind/` files
4. If fresh: outputs empty `{}`

**Design:** Very lightweight — fires on every response. Only the timestamp write is guaranteed; the reminder is conditional.

---

### session-end.sh

**When:** Session terminates (clear, logout, exit)
**Timeout:** 10 seconds

**What it does:**
1. Logs session end timestamp and reason to `.mind/.session-tracking`
2. Checks if STATE.md was updated during this session
3. If stale (>30 min): outputs warning to stderr
4. Creates session-end checkpoint at `.mind/checkpoints/session-end-latest.md`

**Note:** SessionEnd does not support `additionalContext` — it can only output to stderr for warnings.

---

### subagent-start.sh

**When:** A subagent is spawned via the Task tool
**Timeout:** 5 seconds

**What it does:**
1. Parses agent_type and agent_id from stdin
2. Appends to `.mind/.agent-activity`: `[timestamp] STARTED: type (id)`

**Output:** Empty `{}` (no context injection needed)

---

### subagent-stop.sh

**When:** A subagent finishes
**Timeout:** 5 seconds

**What it does:**
1. Parses agent_type and agent_id from stdin
2. Appends to `.mind/.agent-activity`: `[timestamp] STOPPED: type (id)`
3. Outputs context reminder: `[Memory] Agent completed: type (id). Check task status...`

---

### task-completed.sh

**When:** A task is marked as completed (via TaskUpdate)
**Timeout:** 5 seconds

**What it does:**
1. Parses task_id, task_subject, and teammate_name from stdin
2. Appends to `.mind/.task-completions`: `[timestamp] COMPLETED: #id — subject (by: teammate)`

**Output:** Empty `{}` (logging only)

## Configuration

All hooks are configured in `.claude/settings.json`:

```json
{
  "hooks": {
    "SessionStart": [{
      "matcher": "startup|resume|compact|clear",
      "hooks": [{
        "type": "command",
        "command": "bash \"$CLAUDE_PROJECT_DIR/scripts/hooks/session-start.sh\"",
        "timeout": 15
      }]
    }],
    "PreCompact": [{
      "hooks": [{
        "type": "command",
        "command": "bash \"$CLAUDE_PROJECT_DIR/scripts/hooks/pre-compact.sh\"",
        "timeout": 10
      }]
    }]
    // ... etc for all 8 hooks
  }
}
```

**Key variables:**
- `$CLAUDE_PROJECT_DIR` — resolves to the project root (set by Claude Code)
- `timeout` — maximum execution time in seconds before the hook is killed

## Dependencies

All hooks require:
- `bash` (Git Bash on Windows, native on macOS/Linux)
- `node` (any version — used for JSON formatting only, no npm packages)
- Standard Unix tools: `cat`, `grep`, `tail`, `sed`, `date`, `stat`, `mkdir`, `echo`

On Windows, Git Bash provides all required tools.

## Troubleshooting

### Hooks not firing
- Check `.claude/settings.json` is in the project root
- Verify `bash` is available: `which bash`
- Verify `node` is available: `which node`
- Check hook scripts are executable: `chmod +x scripts/hooks/*.sh`

### Empty briefing
- Check `.mind/STATE.md` exists and has content
- Verify the format: each `## Section` must have content on the next line
- Run manually: `echo '{"source":"startup"}' | bash scripts/hooks/session-start.sh`

### Stale state warnings
- Update `.mind/STATE.md` at least once per session
- Use the Mind agent: `Task(subagent_type: "mind", prompt: "Update .mind/ files")`

### Windows-specific
- Use Git Bash paths (forward slashes in scripts)
- `$CLAUDE_PROJECT_DIR` uses forward slashes even on Windows
- `stat` syntax differs: the hooks try both Linux (`-c %Y`) and macOS (`-f %m`) formats
