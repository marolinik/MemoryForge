# MemoryForge Troubleshooting

## Common Issues

### 1. "No state file found" in briefing

**Symptom:** Session briefing shows `(no state file found — this may be the first session)`

**Cause:** `.mind/STATE.md` doesn't exist or is empty

**Fix:**
```bash
# Check if the file exists
ls -la .mind/STATE.md

# If missing, create from template
cp path/to/MemoryForge/templates/.mind/STATE.md .mind/STATE.md

# Edit with your project's current state
```

### 2. Hooks not firing

**Symptom:** No briefing appears at session start, no checkpoints saved

**Causes:**
- `.claude/settings.json` not found
- Hook scripts not executable
- `bash` or `node` not in PATH

**Fix:**
```bash
# Verify settings file exists
ls -la .claude/settings.json

# Verify hooks are executable
ls -la scripts/hooks/*.sh
chmod +x scripts/hooks/*.sh

# Test bash availability
which bash

# Test node availability
which node

# Test a hook manually
echo '{"source":"startup"}' | bash scripts/hooks/session-start.sh
```

### 3. State not persisting across sessions

**Symptom:** Claude starts fresh every session, ignoring previous work

**Causes:**
- `.mind/` files not being updated at session end
- CLAUDE.md doesn't include the Mind Protocol section
- Hook configuration has wrong path

**Fix:**
1. Add the Mind Protocol section to your CLAUDE.md (see `templates/CLAUDE.md.template`)
2. Verify hooks point to the right path in `.claude/settings.json`
3. Manually update `.mind/STATE.md` before ending session

### 4. Context still lost after compaction

**Symptom:** After compaction, Claude loses track of current work

**Causes:**
- PreCompact hook not firing
- Checkpoint file not being created
- SessionStart hook not reading checkpoint on compact

**Fix:**
```bash
# Check if checkpoints are being created
ls -la .mind/checkpoints/

# Test pre-compact hook
echo '{"trigger":"manual"}' | bash scripts/hooks/pre-compact.sh

# Verify checkpoint content
cat .mind/checkpoints/latest.md
```

### 5. "stat: unrecognized option" on Windows

**Symptom:** Errors in stop-checkpoint.sh or session-end.sh about `stat`

**Cause:** Different `stat` syntax across platforms

**Fix:** The hooks try both Linux and macOS stat formats. If neither works, the stale-state check is skipped silently. This is cosmetic — the core memory loop still works.

### 6. UserPromptSubmit hook outputs "unknown"

**Symptom:** `[Memory] Phase: unknown | Next: unknown`

**Cause:** STATE.md doesn't follow the expected format

**Fix:** Ensure STATE.md has this structure (note: content must be on the line directly after the heading):
```markdown
## Current Phase
Phase 1: Setup — IN PROGRESS

## Next Action
Implement the database layer

## Blocked Items
None
```

### 7. Too much context injected (slowing down)

**Symptom:** Sessions feel slow, lots of briefing text in each response

**Fix:**
- Keep SESSION-LOG.md concise (the hook only reads last 20 lines, but shorter is better)
- Keep DECISIONS.md focused (hook shows last 5 decisions)
- Keep PROGRESS.md organized with clear section headers
- For large projects, archive completed phases to a separate file

### 8. Merge conflict in .claude/settings.json

**Symptom:** Project already has settings.json with other hooks

**Fix:** Manually merge the hook configurations. Each hook type is an array — you can have multiple hooks per event:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup|resume|compact",
        "hooks": [
          { "type": "command", "command": "bash existing-hook.sh", "timeout": 5 },
          { "type": "command", "command": "bash \"$CLAUDE_PROJECT_DIR/scripts/hooks/session-start.sh\"", "timeout": 15 }
        ]
      }
    ]
  }
}
```

## Verifying Installation

Run these checks after installation:

```bash
# 1. Settings file exists and has hooks
cat .claude/settings.json | grep "session-start"

# 2. Hook scripts exist and are executable
ls -la scripts/hooks/*.sh

# 3. .mind/ directory has template files
ls -la .mind/

# 4. Mind agent definition exists
cat .claude/agents/mind.md | head -5

# 5. Test session-start hook output
echo '{"source":"startup"}' | bash scripts/hooks/session-start.sh | node -e "
  let d='';process.stdin.on('data',c=>d+=c);
  process.stdin.on('end',()=>{
    const j=JSON.parse(d);
    console.log('Hook output OK');
    console.log('Context length:', j.hookSpecificOutput?.additionalContext?.length || 0, 'chars');
  })
"

# 6. Test pre-compact hook
echo '{"trigger":"test"}' | bash scripts/hooks/pre-compact.sh > /dev/null && echo "PreCompact OK"
ls .mind/checkpoints/latest.md && echo "Checkpoint created OK"
```

## Getting Help

If you encounter an issue not covered here:

1. Check that `bash` and `node` are available in your PATH
2. Run the affected hook manually with test input (see examples above)
3. Check the hook script source code — they're well-commented
4. Open an issue at https://github.com/marolinik/MemoryForge/issues with:
   - Your OS (Windows/macOS/Linux)
   - Claude Code version
   - The error message or unexpected behavior
   - Output of the verification checks above
