# MemoryForge Benchmark -- Round 8: AI Power User

**Persona:** AI Power User (15% market share)
**Profile:** Builds on top of Claude Code. Writes custom hooks, extends MCP tools, runs multi-agent workflows. Cares about APIs, extensibility, correctness, and innovation.
**Version Evaluated:** v1.8.0 (Waves 1-21 complete)
**Evaluator:** AI Power User Agent
**Date:** 2026-02-15

---

## Executive Summary

MemoryForge v1.8.0 delivers a focused wave that directly addresses 3 of the 4 most impactful bugs from the R7 report: appendMindFile is now atomic (P2-1), session-start.sh symlink check is consistent (P2-2), and KNOWN_CONFIG_KEYS is extracted to a shared module (P3-5). These are exactly the right fixes. The per-field limit now correctly uses `Buffer.byteLength` (P3-1 from R7), and `withContentionWarning` has a defensive guard (P3-2 from R7). The new interactive `setup.js` installer is a meaningful addition for onboarding, though it does not change the Power User experience materially.

From a Power User perspective, v1.8.0 is a **surgical bug-fix wave** that resolves all P2 issues from R7. The codebase is measurably safer: atomic appends prevent data corruption, consistent symlink checks close a security inconsistency, and the shared config-keys module prevents future schema divergence. However, no new extensibility features were added (no module exports from mcp-memory-server.js, no plugin API docs, no structured contention metadata), so the extensibility and innovation ceilings remain unchanged. The system remains the best Claude Code memory solution available.

**Overall Score: 9.00/10** (up from 8.86 in R7, +0.14)

**Verdict: YES** -- Adopt immediately. All P2 bugs from R7 are resolved, data integrity is now robust across all write paths, and the system is hardened to production-grade quality.

**Strengths:**
- appendMindFile now uses read+append+tmp+rename pattern -- crash-safe for DECISIONS.md and SESSION-LOG.md
- Consistent symlink check across all config loading paths (bash and Node.js)
- Single source of truth for config schema (scripts/config-keys.js)
- Per-field validation correctly measures bytes, not characters
- withContentionWarning guards against empty content arrays
- Interactive installer (setup.js) lowers adoption barrier
- Hook architecture remains best-in-class (10/10 retained)
- 58 tests across 4 suites, CI on 3 OS x 3 Node versions

**Gaps:**
- No module exports from mcp-memory-server.js (writeMindFile, safePath, extractSection still unexportable)
- No structured contention metadata in MCP responses (still string-based warning)
- No plugin API documentation
- task-completed.sh still spawns 4 Node.js processes for one JSON parse
- setup.js does not validate existing settings.json merge results
- No new tests added in Wave 21 for the specific fixes

**Critical Bugs Found: 0**
**Non-Critical Issues: 9** (0 P1, 0 P2, 9 P3)

---

## Dimension Scores

| Dimension | R7 Score | R8 Score | Change from R7 |
|-----------|----------|----------|----------------|
| D1: MCP Protocol | 9/10 | 9/10 | = |
| D2: Hook Architecture | 10/10 | 10/10 | = |
| D3: Extensibility | 8/10 | 8/10 | = |
| D4: Search Quality | 9/10 | 9/10 | = |
| D5: State Management | 9/10 | 10/10 | +1 |
| D6: Agent Support | 8/10 | 8/10 | = |
| D7: Innovation | 9/10 | 9/10 | = |
| **Average** | **8.86/10** | **9.00/10** | **+0.14** |

---

## D1: MCP Protocol -- 9/10 (unchanged)

**JSON-RPC correctness, transport implementation, error handling, capabilities.**

### What's Excellent

The transport layer remains best-in-class: Buffer-based Content-Length framing, MAX_MESSAGE_SIZE cap (10MB), JSON-RPC 2.0 conformance with `initialize`, `tools/list`, `tools/call`, proper notification handling (id=null), and structured error responses via `-32601` for unknown methods.

**Fixed from R7 (P3-1): Per-field limit now uses `Buffer.byteLength`**

```javascript
// mcp-memory-server.js:669
const bytes = Buffer.byteLength(val, 'utf-8');
if (bytes > MAX_FIELD_SIZE) {
  fieldError = `Field "${key}" too large (${bytes} bytes, max ${MAX_FIELD_SIZE} per field).`;
}
```

This is the correct fix. Previously used `val.length` which measures characters, not bytes. A CJK string of 2000 characters could be 6000 bytes -- now properly measured. Error messages also correctly report "bytes" instead of "chars". Applied consistently to both top-level strings and array items.

**Fixed from R7 (P3-2): `withContentionWarning` defensive check**

```javascript
// mcp-memory-server.js:142
function withContentionWarning(result, contention) {
  if (contention && result.content && result.content[0]) {
    const text = result.content[0].text + CONTENTION_WARNING;
    return { content: [{ type: 'text', text }], isError: result.isError };
  }
  return result;
}
```

Now guards against both missing `content` array and empty `content[0]`. This prevents a crash if a future tool returns an unexpected result shape. Clean defensive programming.

### What Prevents 10/10

**Carried from R7:** No streaming support for large files. The MCP spec (2024-11-05) does not require it, but for production deployments with large `.mind/` directories (e.g., SESSION-LOG.md with 200+ sessions), streaming would reduce memory pressure.

**Carried from R7:** `withContentionWarning` still concatenates a human-facing emoji string into the tool result text. Programmatic consumers (e.g., multi-agent orchestrators parsing MCP tool responses) cannot reliably detect contention without string-matching for the warning text. A structured `_meta: { contention: true }` field would be better API design.

**Carried from R7:** Error responses mix patterns -- tool-level errors use `result.isError: true` with content blocks, while protocol errors use JSON-RPC `error` objects. Both are spec-compliant but stylistically inconsistent.

### Bugs Found

**P3-1: Input size limit measures `JSON.stringify(toolArgs).length` in chars, not bytes**
- **File:** `scripts/mcp-memory-server.js:652`
- **Description:** `const inputStr = JSON.stringify(toolArgs); if (inputStr.length > MAX_INPUT_SIZE)` -- the per-field limit was correctly fixed to use `Buffer.byteLength`, but the total input size check on line 652 still uses string `.length`. For consistency and correctness, the 50KB total limit should also measure bytes.
- **Impact:** Minor -- multi-byte input could exceed the intended 50KB disk budget by 2-3x. Partially mitigated by the per-field check which is now byte-based.
- **Fix:** Use `Buffer.byteLength(inputStr, 'utf-8') > MAX_INPUT_SIZE`.

---

## D2: Hook Architecture -- 10/10 (unchanged)

**Lifecycle coverage, input/output protocol, defensiveness, composability.**

### What's Exceptional

The 8-hook lifecycle architecture remains flawless. No changes to hook scripts in Wave 21 beyond the session-start.sh symlink fix (which is a D5 concern, discussed there). All hooks:

- Consume JSON stdin with defensive parsing and fallback defaults
- Output valid JSON stdout (or `{}` for non-context hooks)
- Use `set -euo pipefail` with `|| true` on non-critical operations
- Handle platform differences (GNU vs BSD stat, wc padding, Git Bash)
- Cache where performance matters (user-prompt-context mtime cache)

**Fixed from R7 (P2-2): session-start.sh symlink check on inline Node config loader**

```javascript
// session-start.sh:110-111
const st = fs.lstatSync(cfgPath);
if (!st.isSymbolicLink() && st.isFile()) cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
```

Previously the bash portion (line 62) checked `[ ! -L "$PROJECT_DIR/.memoryforge.config.json" ]` but the inline Node block used `fs.existsSync()` which follows symlinks. Now both paths are consistent. This closes the security inconsistency where a symlinked config was rejected for compression thresholds but honored for briefing thresholds in the same hook.

### Why Still 10/10

The persistent memory loop (pre-compact -> compact -> session-start) remains architectural brilliance. The mtime-based caching on user-prompt-context remains the right optimization for the hot path. All 8 hooks are production-grade. No regressions, symlink fix strengthens consistency. Shellcheck at `-S error` confirms shell code quality.

### Bugs Found (carried from R7)

**P3-2: `task-completed.sh` spawns 4 Node.js processes for one JSON parse**
- **File:** `scripts/hooks/task-completed.sh:26-43`
- **Description:** Lines 26-39 parse stdin JSON into a JSON string, then lines 41-43 parse that JSON string three more times (once per field: `id`, `subject`, `teammate`). Compare with `subagent-start.sh` which uses pipe-delimited output from a single invocation, or `subagent-stop.sh` which does everything in one `node -e` call.
- **Impact:** ~300ms overhead per task completion. Not on the critical path, but wasteful and inconsistent with the optimized pattern in other hooks.
- **Fix:** Extract all fields in one invocation using pipe-delimited output, matching `subagent-start.sh` pattern.

---

## D3: Extensibility -- 8/10 (unchanged)

**Plugin system, custom tool registration, module exports, API surface.**

### What's Good

**Fixed from R7 (P3-5): KNOWN_CONFIG_KEYS extracted to shared module**

```javascript
// scripts/config-keys.js
const KNOWN_CONFIG_KEYS = new Set([
  'keepSessionsFull', 'keepDecisionsFull', 'archiveAfterDays',
  'trackingMaxLines', 'compressThresholdBytes', 'sessionLogTailLines',
  'briefingRecentDecisions', 'briefingMaxProgressLines',
  'maxCheckpointFiles', 'staleWarningSeconds',
]);
module.exports = { KNOWN_CONFIG_KEYS };
```

Single source of truth. Both `health-check.js` (line 32) and `compress-sessions.js` (line 29) now `require('./config-keys.js')`. Adding a new config key requires changing exactly one file. This is the right pattern.

**Existing strengths (unchanged from R7):**
- `vector-memory.js` exports all functions: TFIDFIndex, tokenize, stem, chunkFile, buildIndex, hybridSearch, getCachedIndex
- `compress-sessions.js` exports all compression functions with `require.main` guard
- Hook composability via `.claude/settings.json` arrays
- Config extensibility via pure JSON (unknown keys produce warnings, not errors)

**New: Interactive installer (setup.js)**

The `setup.js` installer is well-structured with:
- Terminal color detection (respects `NO_COLOR` env)
- Smart merge for existing `settings.json` and `.mcp.json`
- Backup creation before merging
- Three install modes (standard, team, minimal)
- Optional config customization dialog
- Node.js version check (18+ required)

However, from a Power User perspective, the installer is primarily useful for initial setup. It does not add API surface or extensibility.

### What's Still Missing

**-2 points (unchanged from R7):**

1. **`mcp-memory-server.js` exports nothing.** Utility functions like `safePath()`, `writeMindFile()`, `appendMindFile()`, `extractSection()`, `extractList()` are trapped in the server module. Power users building custom MCP tools or scripts cannot `require()` these functions. This is the single largest extensibility gap.

2. **No plugin API documentation.** No `docs/PLUGIN-API.md` explaining how to:
   - Register custom MCP tools
   - Chain hooks alongside MemoryForge hooks
   - Extend the state file schema
   - Build custom compression strategies

3. **No plugin registry or discovery mechanism.** Still manual file-copying integration only.

### Bugs Found

**P3-3: setup.js mergeSettings does not validate merge result**
- **File:** `setup.js:141-171`
- **Description:** `mergeSettings()` reads existing settings.json, parses it, merges MemoryForge hooks, and writes back. But it does not validate that the merge produced valid hook configuration. If the existing settings.json has malformed hook entries, the merge silently corrupts the file. The check on line 146 (`JSON.stringify(existing).includes('session-start.sh')`) is a string search on the serialized JSON, which could false-positive on a comment or description field.
- **Impact:** Minor -- corrupted settings.json would cause hook registration failures, which Claude Code would surface. But the installer should validate its own output.
- **Fix:** After merge, validate that `existing.hooks.SessionStart` is a valid array of hook entries, not just that `'session-start.sh'` appears somewhere in the JSON.

**P3-4: setup.js does not copy compress-sessions.js**
- **File:** `setup.js:308-313`
- **Description:** The installer copies `mcp-memory-server.js`, `vector-memory.js`, and `config-keys.js` to the target project's `scripts/` directory (lines 305-313). But it does not copy `compress-sessions.js`, which is required by `session-start.sh` (line 84: `if [ -f "$SCRIPT_DIR/../compress-sessions.js" ]`). If the session-start hook triggers auto-compression and the compress script is missing from the target project, compression silently fails.
- **Impact:** Auto-compression on session start may not work for projects installed via `setup.js` if they are not in the MemoryForge repo itself. The hook has a fallback path (line 87) that checks `$PROJECT_DIR/scripts/compress-sessions.js`, which would also fail.
- **Fix:** Add `compress-sessions.js` to the copy list alongside `vector-memory.js` and `config-keys.js`.

---

## D4: Search Quality -- 9/10 (unchanged)

**Stemmer accuracy, tokenizer coverage, ranking algorithm, caching strategy.**

### What's Unchanged

No changes to `vector-memory.js` in Wave 21. The TF-IDF implementation, hybrid search (semantic + keyword), stemmer with trailing-consonant deduplication, mtime-keyed index caching, and file size guard (10MB) are all identical to R7.

The 14 vector-memory tests continue to pass. Search quality is solid:
- `stem("running") === stem("run")` (deduplication fix)
- `stem("authentication")` maps to `"authenticat"` (consistent)
- TF-IDF normalized by document length
- IDF smoothed with `log(1 + N/df)`
- Hybrid merge prioritizes semantic results, fills gaps with keyword exact matches

### Why Still 9/10

**-1 point (carried from R7):** English-only stemmer. Non-English Markdown content (French, German, CJK) gets no stemming benefit. The tokenizer strips non-ASCII characters (`[^a-z0-9\s-]`), meaning CJK characters are entirely discarded during indexing. For a zero-dependency tool, this is an acceptable tradeoff, but it limits international users.

### Bugs Found

**P3-5: Tokenizer strips all non-ASCII characters, making CJK content unsearchable**
- **File:** `scripts/vector-memory.js:86`
- **Description:** `text.replace(/[^a-z0-9\s-]/g, ' ')` removes all characters outside `a-z0-9\s-`. This means Chinese, Japanese, Korean, Cyrillic, and accented Latin characters are completely stripped before indexing. A query for a Japanese project name or a French decision title would return zero semantic results. Keyword search (in `hybridSearch`) uses `toLowerCase().includes()` which preserves Unicode, so keyword fallback works -- but TF-IDF scoring is lost.
- **Impact:** For English projects: none. For international projects: semantic search is effectively broken, keyword-only search works as fallback.
- **Fix:** Either expand the regex to include Unicode word characters (`[\p{L}\p{N}\s-]` with `/u` flag) or tokenize by whitespace only and let the stemmer handle unknown scripts (pass-through).

---

## D5: State Management -- 10/10 (up from 9)

**Atomicity, locking, concurrent access safety, file format robustness.**

### What Earned the 10

**Fixed from R7 (P2-1): appendMindFile is now atomic**

```javascript
// mcp-memory-server.js:120-135
function appendMindFile(name, content) {
  const filePath = safePath(name);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const locked = acquireLock();
  try {
    // Atomic append: read existing + append + tmp + rename (matches writeMindFile pattern)
    let existing = '';
    try { existing = fs.readFileSync(filePath, 'utf-8'); } catch { /* new file */ }
    const tmpPath = filePath + '.tmp.' + process.pid;
    fs.writeFileSync(tmpPath, existing + content, 'utf-8');
    fs.renameSync(tmpPath, filePath);
  } finally {
    if (locked) releaseLock();
  }
  return { contention: !locked };
}
```

This was the **most critical fix** from R7. Previously, `appendMindFile` used `fs.appendFileSync()` directly, meaning a crash mid-append could leave partial content in DECISIONS.md or SESSION-LOG.md. Now both `writeMindFile` and `appendMindFile` use the same atomic pattern:

1. Acquire advisory lock
2. Read existing content (for append)
3. Write combined content to `file.tmp.<pid>`
4. Rename temp file over original (atomic on POSIX, near-atomic on Windows)
5. Release lock in `finally` block

This eliminates the last data-integrity gap in the write path. Every write operation in the MCP server is now crash-safe.

### Complete State Management Stack

With the R7 P2-1 fix, the full state management picture is now:

| Layer | Mechanism | Coverage |
|-------|-----------|----------|
| **Path safety** | `safePath()` blocks traversal | All file operations |
| **Locking** | Advisory `{flag:'wx'}` with 30s stale detection | All writes |
| **Atomicity** | tmp+rename pattern | Both `writeMindFile` and `appendMindFile` |
| **Contention visibility** | `{ contention: boolean }` return + warning text | All MCP tool responses |
| **Section preservation** | Parse-rebuild in `memoryUpdateState` | STATE.md updates |
| **Input validation** | 50KB total, 5KB per-field (bytes), schema-based required fields | All tool calls |
| **Config safety** | Symlink check, `Number.isSafeInteger`, unknown key warnings | All config loaders |
| **File size guard** | 10MB skip in `buildIndex` | Search indexing |
| **Error logging** | `.mcp-errors.log` with rotation | All errors |

**No gaps remain in the write path.** Advisory locking is cooperative (not kernel-level), but for the use case (cooperating Claude Code processes), this is the correct choice. Kernel-level locking (`flock`) would add complexity and platform-specific code for marginal benefit.

### Why Now 10/10

In R7, D5 was held at 9/10 specifically because of the non-atomic `appendMindFile`. The R7 report stated:

> **What would move D5 to 10:** Kernel-level locking + atomic appends

Kernel-level locking is unnecessary for this use case (cooperative processes within Claude Code's execution model). Atomic appends are now implemented. The state management layer is complete, consistent, and crash-safe. Every identified write-path vulnerability has been addressed.

### Bugs Found

None. The write path is now fully atomic and locked.

---

## D6: Agent Support -- 8/10 (unchanged)

**Multi-agent coordination, subagent hooks, task tracking, conflict resolution.**

### What's Unchanged

The agent support primitives are identical to R7:
- SubagentStart/SubagentStop hooks track agent lifecycle in `.agent-activity`
- TaskCompleted hook logs completed work in `.task-completions`
- Shared `.mind/` directory provides single source of truth
- Advisory locking prevents concurrent write corruption
- Tracking file rotation (200-line threshold in session-start, 100-line in compression)

### What Benefits from Wave 21

The atomic `appendMindFile` fix (D5) directly benefits multi-agent scenarios:
- When a subagent appends a decision to DECISIONS.md while the parent agent appends a session entry, both operations are now crash-safe
- Lock contention is detected and surfaced, preventing silent data loss

The consistent symlink check in session-start.sh prevents a class of attacks where a symlinked config could alter briefing behavior for subagents reading from the same `.mind/` directory.

### What's Still Missing

**-2 points (unchanged from R7):**

1. **No agent-to-agent messaging.** All communication is via `.mind/` state files. No direct notification mechanism when Agent A completes a task that Agent B depends on.

2. **No task dependency graph.** `memory_save_progress` has no concept of task dependencies. Completing "Build API" does not automatically notify tasks that depend on it.

3. **No conflict detection beyond locking.** If Agent A sets `phase=2` and Agent B sets `phase=3` in rapid succession, the last writer wins. No merge logic, no conflict notification, no optimistic concurrency control (e.g., compare-and-swap on STATE.md content hash).

### Bugs Found (carried from R7)

**P3-6: Inconsistent `.agent-activity` write mechanism in subagent hooks**
- **Files:** `scripts/hooks/subagent-start.sh:38`, `scripts/hooks/subagent-stop.sh:37`
- **Description:** `subagent-start.sh` writes to `.agent-activity` via shell `echo >> append`. `subagent-stop.sh` writes via `fs.appendFileSync()` inside a `node -e` block with stderr piped to `/dev/null`. If the Node.js process fails silently in subagent-stop, the STOPPED line is lost while the STARTED line always succeeds, creating unpaired entries.
- **Impact:** Minor -- agent activity log may show agents that started but never stopped. Misleading for audit purposes.
- **Fix:** Use consistent mechanism (both shell `echo >>` or both Node.js).

---

## D7: Innovation -- 9/10 (unchanged)

**Novel solutions, creative architecture, features beyond basic persistence.**

### What's Innovative (unchanged from R7)

1. **Persistent Memory Loop** -- pre-compact saves checkpoint, session-start(compact) restores briefing. Solves context compaction survival elegantly.

2. **Progressive Briefings** -- compact (~200 token) briefings for large projects, full briefings for small projects and post-compaction. Adaptive context usage.

3. **Hybrid Search** -- TF-IDF semantic + keyword exact match, zero dependencies. 474 lines of custom stemmer, tokenizer, IDF calculator.

4. **Mtime-Based Caching** -- two levels: prompt-context cache (shell-level, invalidated on STATE.md change) and TF-IDF index cache (in-process, invalidated on any .mind/ file change).

5. **Auto-Generated Session Summaries** -- session-end hook generates entries from git diff when user forgets to update SESSION-LOG.md.

6. **Config-Driven Thresholds** -- 10 configurable knobs, all with schema validation and safe-integer checks.

### What v1.8.0 Adds

**Interactive Installer (setup.js)**

The interactive installer is a thoughtful UX innovation:

```javascript
// setup.js:239-243
const mode = await askChoice(rl, 'What would you like to install?', [
  { label: 'Standard', desc: 'Everything you need to get started', value: 'standard' },
  { label: 'Standard + Team Agents', desc: 'For teams collaborating', value: 'team' },
  { label: 'Minimal', desc: 'Just hooks and MCP server', value: 'minimal' },
]);
```

Features include:
- Terminal color auto-detection with `NO_COLOR` support
- Smart merge for existing `settings.json` and `.mcp.json` (non-destructive, creates backups)
- Three install modes (standard, team, minimal)
- Optional config customization dialog with input validation
- Node.js 18+ prerequisite check
- Claude Code CLI detection

This is a meaningful improvement for the onboarding experience, particularly for users who are not comfortable with shell scripts. The previous `install.sh`/`install.ps1` required platform-specific commands; `setup.js` is cross-platform by design.

**Atomic Append Pattern**

The read+append+tmp+rename pattern for `appendMindFile` (see D5) is a genuine engineering innovation for file-based state systems. Most file-based tools use simple append or full rewrite. MemoryForge now has a consistent atomic write strategy across all write paths that works without external dependencies.

### What Would Push to 10/10

**-1 point (unchanged from R7):**

1. **No streaming MCP responses** for large files.
2. **Graph memory extension** referenced in installer but not implemented.
3. **No AI-assisted compression** -- compression is rule-based (keep last N, summarize older). LLM-powered summarization would produce better compressed entries.
4. **No structured contention metadata** in MCP responses -- still presentation-coupled.

These are forward-looking features that would differentiate MemoryForge further, but the current implementation is already well beyond basic persistence.

---

## Bugs & Issues

### Summary

| Severity | Count | Fixed from R7 | New | Carried |
|----------|-------|---------------|-----|---------|
| P1 | 0 | 0 | 0 | 0 |
| P2 | 0 | 3 fixed | 0 | 0 |
| P3 | 9 | 2 fixed | 3 | 6 |
| **Total** | **9** | **5 fixed** | **3** | **6** |

### R7 Bugs Fixed in v1.8.0

- [FIXED] **P2-1:** appendMindFile is now atomic (read+append+tmp+rename)
- [FIXED] **P2-2:** session-start.sh symlink check on inline Node config loader
- [FIXED] **P3-1:** Per-field limit uses Buffer.byteLength (bytes not chars)
- [FIXED] **P3-2:** withContentionWarning defensive check for empty content array
- [FIXED] **P3-5:** KNOWN_CONFIG_KEYS extracted to shared scripts/config-keys.js module

### New P3 Issues Found in v1.8.0

**P3-1: Total input size limit uses string length, not byte length**
- **File:** `scripts/mcp-memory-server.js:652`
- **Description:** `inputStr.length > MAX_INPUT_SIZE` measures characters, not bytes. The per-field check (line 669) was correctly fixed to use `Buffer.byteLength`, but the total-input check was not updated to match.
- **Impact:** Multi-byte input could exceed the 50KB budget by 2-3x. Partially mitigated by the per-field byte check.
- **Fix:** `Buffer.byteLength(inputStr, 'utf-8') > MAX_INPUT_SIZE`

**P3-3: setup.js mergeSettings uses fragile string search for idempotency check**
- **File:** `setup.js:146`
- **Description:** `JSON.stringify(existing).includes('session-start.sh')` is used to detect if MemoryForge is already installed. This could false-positive if `session-start.sh` appears in a comment, description, or unrelated hook in the existing settings.json.
- **Impact:** Minor -- would cause the installer to skip hook installation when it should merge.
- **Fix:** Check for the specific hook structure: `existing.hooks?.SessionStart?.some(h => h.hooks?.some(hh => hh.command?.includes('session-start.sh')))`.

**P3-4: setup.js does not copy compress-sessions.js to target project**
- **File:** `setup.js:308-313`
- **Description:** The installer copies `mcp-memory-server.js`, `vector-memory.js`, and `config-keys.js` but omits `compress-sessions.js`. The session-start hook (line 84) expects this file at `$SCRIPT_DIR/../compress-sessions.js`. For projects installed via setup.js in a different directory from the MemoryForge repo, auto-compression on session start will silently fail.
- **Impact:** Auto-compression on session start may not work for externally installed projects.
- **Fix:** Add `'compress-sessions.js'` to the support scripts copy list on line 308.

### Carried P3 Issues from R7

**P3-2: task-completed.sh spawns 4 Node.js processes for one JSON parse**
- **File:** `scripts/hooks/task-completed.sh:26-43`
- **Impact:** ~300ms overhead per task completion event.

**P3-5: Tokenizer strips all non-ASCII characters**
- **File:** `scripts/vector-memory.js:86`
- **Impact:** CJK content is unsearchable via TF-IDF semantic search; keyword fallback works.

**P3-6: Inconsistent `.agent-activity` write mechanism in subagent hooks**
- **Files:** `scripts/hooks/subagent-start.sh:38`, `scripts/hooks/subagent-stop.sh:37`
- **Impact:** Potential for unpaired STARTED/STOPPED entries.

**P3-7: Concurrency test does not assert contention warning text**
- **File:** `tests/mcp-server.test.js:489-493`
- **Impact:** Contention warning feature has no deterministic test.

**P3-8: withContentionWarning concatenates presentation (emoji) into data**
- **File:** `scripts/mcp-memory-server.js:139`
- **Impact:** Programmatic consumers cannot reliably detect contention without string-matching.

**P3-9: No new tests for Wave 21 fixes**
- **Files:** `tests/mcp-server.test.js`, `tests/hooks.test.js`
- **Description:** Wave 21 fixes (atomic appendMindFile, symlink check, Buffer.byteLength, empty content guard) have no dedicated tests. The existing test suite exercises these code paths indirectly (e.g., `memory_save_decision` uses `appendMindFile`), but there is no test that specifically verifies:
  - appendMindFile creates a tmp file and renames (atomicity)
  - Per-field limit rejects multi-byte content at the correct byte threshold
  - session-start.sh inline Node block rejects symlinked config
- **Impact:** Regression risk if future changes break these specific behaviors.
- **Fix:** Add targeted tests for each Wave 21 fix.

---

## Recommendations

### For Immediate Adoption

1. **Use as-is.** All P2 bugs from R7 are fixed. The system is production-grade.
2. **Run `node scripts/health-check.js`** to validate your installation.
3. **Use `setup.js`** for new project installations -- it handles merge logic cleanly.
4. **Monitor `.mcp-errors.log`** for contention events in multi-agent workflows.

### For Next Wave (Priority Order)

1. **Add tests for Wave 21 fixes** (P3-9) -- atomic append, byte-limit, symlink check.
2. **Copy compress-sessions.js in setup.js** (P3-4) -- one-line fix.
3. **Fix total input size to use Buffer.byteLength** (P3-1) -- consistency with per-field check.
4. **Consolidate task-completed.sh to single Node invocation** (P3-2 carried).
5. **Add structured contention metadata** to MCP responses (P3-8) -- `_meta: { contention: true }`.
6. **Export utility functions from mcp-memory-server.js** -- `safePath`, `writeMindFile`, `appendMindFile`, `extractSection`, `extractList`.

### For Future Enhancements

1. **Plugin API documentation** (`docs/PLUGIN-API.md`)
2. **Unicode-aware tokenizer** for international Markdown content
3. **Agent messaging primitives** (`.mind/.agent-messages/`)
4. **Task dependency graph** in PROGRESS.md
5. **Deterministic contention test** (pre-create lock file, verify warning)

---

## Comparative Analysis

**R7 vs R8 (AI Power User perspective):**

| Dimension | R7 Score | R8 Score | Delta | Key Changes |
|-----------|----------|----------|-------|-------------|
| MCP Protocol | 9/10 | 9/10 | = | Buffer.byteLength per-field, defensive withContentionWarning |
| Hook Architecture | 10/10 | 10/10 | = | Symlink check consistency (benefits D5 more than D2) |
| Extensibility | 8/10 | 8/10 | = | config-keys.js module, setup.js installer (no API surface change) |
| Search Quality | 9/10 | 9/10 | = | No changes to vector-memory.js |
| State Management | 9/10 | 10/10 | +1 | Atomic appendMindFile closes last write-path gap |
| Agent Support | 8/10 | 8/10 | = | Indirect benefit from atomic appends |
| Innovation | 9/10 | 9/10 | = | Interactive installer is nice but not paradigm-shifting |

**Overall: 8.86 -> 9.00 (+0.14 points)**

Wave 21 is a **surgical fix wave** that resolves all P2 issues from R7. The single dimension change (D5: 9 -> 10) reflects the atomic appendMindFile fix closing the last identified data-integrity gap. Other dimensions remain at their R7 levels because Wave 21 did not add new capabilities in those areas -- it hardened existing ones.

**What would move scores higher:**
- D1 -> 10: Structured contention metadata + streaming responses
- D3 -> 9: Module exports from mcp-memory-server.js + plugin API docs
- D6 -> 9: Agent messaging primitives or task dependency tracking
- D7 -> 10: Graph memory implementation or AI-assisted compression

---

## Verdict: YES

**Adopt immediately.** MemoryForge v1.8.0 is the most mature and hardened release to date.

**Why:**
- All P2 bugs from R7 are fixed -- zero known P2 issues
- Every write path (write + append) is now atomic and crash-safe
- Consistent symlink protection across all config loading paths
- Single source of truth for config schema (config-keys.js)
- Per-field validation correctly measures bytes for multi-byte safety
- Interactive installer lowers adoption barrier
- 58 tests, CI on 3 OS x 3 Node versions, shellcheck at -S error
- Hook architecture at 10/10, state management at 10/10
- Zero P1 bugs, zero P2 bugs, 9 P3 polish items

**When NOT to adopt:**
- Same caveats as R7: no plugin marketplace, no agent messaging, no graph memory
- If you need programmatic contention detection (current API is string-based)
- If you need CJK/Unicode semantic search (keyword fallback works, TF-IDF does not)

**Bottom Line:**
MemoryForge v1.8.0 reaches the **9.0 threshold** for the first time, driven by the atomic appendMindFile fix that completes the data-integrity story. The system is now fully crash-safe across all write operations. For Power Users, the remaining gaps are in extensibility (module exports, plugin API docs) and agent coordination (messaging, dependencies) -- areas where the current primitives are functional but not yet best-in-class. This is the most robust Claude Code memory system available.

**Score: 9.00/10** -- Excellent. Production-grade with minor polish opportunities.

---

## Appendix: Test Coverage Analysis

**Total Tests: 58** (across 4 suites, unchanged from R7)

| Suite | Tests | Coverage |
|-------|-------|----------|
| `mcp-server.test.js` | 23 | All 6 tools + transport + security + per-field + concurrency + symlink |
| `compress.test.js` | 9 | Sessions, decisions, archival, rotation, config override, dry-run |
| `vector-memory.test.js` | 14 | TF-IDF, tokenization, stemming, chunking, hybrid search, serialization |
| `hooks.test.js` | 12 | Lifecycle, caching, checkpoint rotation, config schema, Number.isSafeInteger |

**CI Matrix:**
- **Platforms:** Ubuntu, macOS, Windows (3 OSes)
- **Node versions:** 18, 20, 22 (3 versions)
- **Total CI configurations:** 9 (3 x 3, fail-fast: false)
- **Shellcheck:** `-S error` on all 8 hook scripts + install.sh
- **Syntax check:** `node --check` on 6 JS files

**Coverage Gaps:**
- No tests for `setup.js` installer
- No tests for `dashboard.js` or `fleet-dashboard.js`
- No dedicated tests for Wave 21 fixes (atomic append, byte-limit, symlink)
- No deterministic test for contention warning text in MCP responses
- `compress.test.js` does not test config schema validation
- No tests for `task-completed.sh` hook individually

**Coverage Assessment by Criticality:**

| Component | Criticality | Test Coverage | Gap |
|-----------|-------------|---------------|-----|
| MCP transport | Critical | Excellent | None |
| MCP tools (6) | Critical | Excellent | None |
| Write atomicity | Critical | Indirect only | No dedicated test |
| Advisory locking | Critical | Integration test | No deterministic contention test |
| TF-IDF search | High | Excellent | None |
| Session compression | High | Excellent | None |
| Hook lifecycle | High | Good | No individual hook unit tests |
| Config validation | Medium | Good (via hooks.test.js) | None |
| Installer | Low | None | No tests |
| Dashboards | Low | None | No tests |

---

**End of Report**

**Evaluator:** AI Power User Agent
**Date:** 2026-02-15
**Version:** MemoryForge v1.8.0 (Waves 1-21)
**Overall Score:** 9.00/10
**Verdict:** YES (Adopt)
