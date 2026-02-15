# AI Power User -- Round 9 Evaluation
**Version:** 1.8.1 | **Verdict:** Yes

## Scores
| Dim | Name | Score | R8 | Delta | Justification |
|-----|------|------:|---:|------:|---------------|
| D1 | MCP Protocol | 9 | 9 | 0 | JSON-RPC 2.0 over Content-Length stdio remains rock-solid. Buffer-based framing handles multi-byte correctly, total input limit now uses `Buffer.byteLength` (R8 fix). Per-field limit at 5KB, total at 50KB, message cap at 10MB. `initialize` returns protocolVersion `2024-11-05` with `tools` capability. Proper `-32601` error for unknown methods. Notifications handled silently. Error logging to `.mcp-errors.log` with uncaughtException/unhandledRejection handlers. One minor gap: no `resources` or `prompts` capabilities advertised (not needed today, but MCP spec supports them). Tool error responses correctly use `result.isError` rather than top-level `error`, which is correct for tool-call failures vs protocol errors. Score holds at 9. |
| D2 | Hook Architecture | 10 | 10 | 0 | Full 8-hook lifecycle coverage: session-start, pre-compact, user-prompt-context, stop-checkpoint, session-end, subagent-start, subagent-stop, task-completed. The persistent memory loop (work -> grow -> pre-compact save -> compact -> session-start restore) is the architectural crown jewel. Progressive briefings adapt to project size. Prompt-context caching (mtime-based, avoids Node per-prompt). Task-completed consolidated to 1 Node invocation (R8 fix). Auto-compression triggered in session-start when `.mind/` exceeds threshold. Tracking file rotation in session-start prevents unbounded growth. File-change tracking via git in stop-checkpoint feeds auto-summary in session-end. All hooks validate stat output as numeric (Bug #9 fix). Config symlink checks consistent across hooks. Score holds at 10. |
| D3 | Extensibility | 8 | 8 | 0 | Extensions directory with team-memory, vector-memory, graph-memory stubs. `compress-sessions.js` properly exports functions via `module.exports` and guards CLI with `require.main === module` (Bug #7). `vector-memory.js` exports `TFIDFIndex`, `tokenize`, `stem`, `chunkFile`, `buildIndex`, `hybridSearch`, `getCachedIndex` -- a rich API surface. `config-keys.js` provides shared schema. `merge-settings.js` enables smart hook merging with existing configurations. `detect-existing.js` detects 7+ memory systems for brownfield installs. The MCP server itself does not expose a plugin registration API -- adding custom tools requires editing `TOOLS` and `TOOL_HANDLERS` directly. No event emitter or middleware pattern for hook composition. The `--with-team`, `--with-vector`, `--with-graph` installer flags are a good extensibility pattern. Score holds at 8 -- same gaps as R8 (no programmatic tool registration, no hook middleware). |
| D4 | Search Quality | 9 | 9 | 0 | TF-IDF implementation with normalized term frequency, `log(1 + N/df)` IDF formula, overlapping chunked documents (15-line chunks, 3-line overlap). Stemmer handles common English suffixes with longest-match-first ordering and trailing consonant de-duplication (runn->run, stopp->stop). 70+ stop words filtered. Hybrid search merges semantic TF-IDF with keyword exact-match, deduplicating by line coverage. Mtime-cached index avoids rebuild when `.mind/` files unchanged. Files >10MB skipped to prevent OOM. Empty file handling in `chunkFile`. The tokenizer strips non-alphanumeric except hyphens, which is good for code-adjacent terms. Minor gap: no bigram/trigram support, no query expansion, no support for CamelCase splitting. Score holds at 9. |
| D5 | State Management | 10 | 10 | 0 | Advisory file locking with `{flag:'wx'}` exclusive creation, 30s stale lock detection, PID tracking. Atomic writes via tmp+rename pattern in both `writeMindFile` and `appendMindFile`. Lock contention warning surfaced to user via `CONTENTION_WARNING` text appended to tool response. `Number.isSafeInteger()` for config validation catches `1e308` and similar extremes. Symlink checks via `fs.lstatSync()` before reading config files -- consistent across health-check, compress-sessions, and all hooks. Path traversal blocked by `safePath()` with `path.resolve` containment check. `.write-lock` included in `.gitignore`. Pre-compress backups limited to 3 with cleanup. Checkpoint pruning configurable (default 10). Score holds at 10. |
| D6 | Agent Support | 8 | 8 | 0 | Subagent-start logs spawn to `.agent-activity`, subagent-stop logs completion and outputs context nudge. Task-completed hook logs to `.task-completions` with task ID, subject, and teammate name. Mind agent, orchestrator, and builder agent templates in extensions. Fleet dashboard scans parent directory for multi-project overview with stale detection. The `.agent-activity` and `.task-completions` tracking files are rotated. However: no conflict resolution when two subagents modify the same `.mind/` file simultaneously (advisory lock helps but is not agent-aware). No agent-to-agent communication protocol beyond shared file state. No priority or ordering when multiple agents complete tasks. Score holds at 8 -- same fundamental gap of no structured agent coordination beyond logging. |
| D7 | Innovation | 9 | 9 | 0 | The compaction survival loop remains the most innovative feature -- pre-compact checkpoint + session-start re-injection creates seamless continuity through context compression. Progressive briefings (compact vs full) based on project size. Mtime-cached TF-IDF index for zero-cost repeated searches within unchanged state. Auto-session-summary from git file tracking when user forgets to log. Brownfield detector for 7+ competing memory systems. Smart settings merge for non-destructive installation. Health check with JSON output + human-readable stderr. Config schema validation with typo detection. The `setup.js --help, --dry-run` additions (R8) improve DX but are incremental. No breakthrough new features in Wave 22 -- fixes were polish, not innovation. Score holds at 9. |

**Average: 9.00** (R8: 9.00, Delta: +0.00)

## Bugs Found

### P2

None found. The R8 P2 fixes (installer script copying, execFileSync in watch mode) are verified correct.

### P3

1. **P3: `fleet-dashboard.js` still uses `execSync` for browser open (line 275-277)**
   `fleet-dashboard.js:275-277` -- The fleet dashboard uses `execSync` to open the browser (`execSync('open "..."')`, `execSync('start "" "..."')`, `execSync('xdg-open "..."')`). While `dashboard.js:335` correctly uses `exec` (non-blocking) from `child_process`, the fleet dashboard imported `execSync` and uses it synchronously. This blocks the Node process and, on Linux, `xdg-open` can hang. Also, the `outputPath` is interpolated into the shell command string via template literal -- if the path contains shell metacharacters like `$(...)` or backticks, this is a command injection vector. The dashboard.js uses `exec` (non-blocking) with `"${outPath}"` quoting, which is slightly better but has the same injection concern. Both should use `execFile` or at minimum validate/escape the path. Severity: P3 because the path is constructed from `path.resolve(parentDir)` which is user-controlled CLI input.

2. **P3: `dashboard.js` browser open uses `exec` with unescaped path (line 335)**
   `dashboard.js:335` -- `exec(cmd)` where `cmd` includes `"${outPath}"` in a shell string. If `outPath` contains `"` characters (valid in some non-Windows filesystems), the quoting breaks and allows shell injection. The health-check correctly uses `execFileSync` (R8 fix), but dashboard.js was not updated.

3. **P3: `compress-sessions.js` writes `ARCHIVE.md` and `PROGRESS.md` non-atomically (lines 320-324)**
   `compress-sessions.js:320-324` -- `archiveCompletedTasks` uses `fs.writeFileSync` directly for both `ARCHIVE.md` and `PROGRESS.md` without the tmp+rename atomic write pattern used in the MCP server. If the process crashes between writing ARCHIVE.md (line 320) and rewriting PROGRESS.md (line 324), archived tasks could be duplicated (present in both files). The session and decision compression also use `fs.writeFileSync` directly (lines 183, 267) rather than atomic writes, but those are less risky since they operate on single files.

4. **P3: `compress-sessions.js` backup is `copyFileSync` then `writeFileSync` -- not atomic (lines 182-183, 266-267)**
   `compress-sessions.js:182-183` -- `fs.copyFileSync(filePath, filePath + '.pre-compress')` followed by `fs.writeFileSync(filePath, result)`. The write is not atomic (no tmp+rename). If interrupted mid-write, the file could be left truncated. The MCP server correctly uses atomic writes for all `.mind/` mutations, but the compressor does not.

5. **P3: `session-end.sh` appends to `SESSION-LOG.md` non-atomically (line 93)**
   `session-end.sh:93` -- `echo "$ENTRY" >> "$SESSION_LOG"` is a direct append without any locking or atomic write. If the MCP server is simultaneously appending via `appendMindFile` (which uses advisory locking + tmp+rename), the shell append could interleave or conflict. The MCP server's `appendMindFile` reads the full file, appends, writes to tmp, and renames -- a concurrent raw `>>` append could be lost.

6. **P3: `subagent-start.sh` appends to `.agent-activity` non-atomically (line 38)**
   `subagent-start.sh:38` -- `echo "[$TIMESTAMP] STARTED: $AGENT_TYPE ($AGENT_ID)" >> "$MIND_DIR/.agent-activity"` is a raw append. Similarly, `subagent-stop.sh:37` uses `fs.appendFileSync` inside Node, and `task-completed.sh:38` uses `fs.appendFileSync`. These tracking files are append-only logs so the risk is lower, but in a multi-agent scenario with many concurrent subagents, lines could interleave on non-POSIX systems (Windows).

7. **P3: `health-check.js` watch mode re-runs itself but does not refresh the `report` object (lines 220-232)**
   `health-check.js:220-232` -- In watch mode, the interval callback spawns a new process (`execFileSync`) and pipes its stdout to the current process's stdout. This works, but the initial `printReport()` call at line 217 outputs the initial report, and then subsequent interval outputs append to stdout. There is no clear delimiter between reports -- a consumer parsing the JSON stream would get concatenated JSON objects without a separator. This makes the watch mode output unparseable as JSON.

8. **P3: `fleet-dashboard.js:97` -- `calcDirSize` follows symlinks inside `.mind/`**
   `fleet-dashboard.js:92-101` -- The `calcDirSize` recursive function uses `fs.statSync` (follows symlinks) and `fs.readdirSync` without checking for symlinks. A symlink inside `.mind/` pointing to a large directory (e.g., `/`) would cause the size calculation to run indefinitely or report a wildly incorrect size. The MCP server and compress-sessions check for symlinks on config files, but this directory traversal does not.

9. **P3: `vector-memory.js` CLI exits with code 1 on `--help` when combined with other args**
   `vector-memory.js:439-442` -- `if (args.length < 2 || args.includes('--help'))` means that `node vector-memory.js --help .mind` (3 args) will show help and exit 0, but `node vector-memory.js --help` (1 arg) will also show help but exit 1 because `args.length < 2` is checked first. However, the `--help` check correctly exits 0. Actually, re-reading: `process.exit(args.includes('--help') ? 0 : 1)` -- this is correct. The `--help` flag exits 0 regardless of arg count. No bug here. Retracted.

10. **P3: `mcp-memory-server.js` per-field validation does not check nested objects (line 668-700)**
    `mcp-memory-server.js:668-700` -- The per-field size validation iterates `Object.entries(toolArgs)` and checks strings and arrays of strings. However, if a field is an object (e.g., someone passes `{task: {nested: "..."}}` to `memory_save_progress`), the nested values are not checked. The tool handlers would likely fail with a type error, but the size limit could be bypassed for deeply nested objects. Low risk since the schemas define string/array types, but no type enforcement exists.

11. **P3: `session-start.sh` auto-compress invokes `node "$COMPRESS_SCRIPT" "$MIND_DIR"` without `--` separator (line 91)**
    `session-start.sh:91` -- If `$MIND_DIR` starts with `-` (theoretically possible if `CLAUDE_PROJECT_DIR` is set to a path component starting with `-`), the compress script could interpret it as a flag. Adding `--` before positional args is defensive practice. Very low probability but technically a correctness gap.

12. **P3: CI `shellcheck` lints `install.sh` but not `install.ps1` syntax**
    `.github/workflows/ci.yml:70` -- `shellcheck -s bash -S error scripts/hooks/*.sh install.sh` lints bash scripts but there is no PowerShell linting step. While PSScriptAnalyzer is not critical, the install.ps1 is a substantial script (~748 lines) with no automated validation beyond manual testing.

13. **P3: `dashboard.js` does not escape `timestamp` variable in HTML (line 270)**
    `dashboard.js:82,270` -- The `timestamp` is generated from `new Date().toISOString()` which is safe (only digits, dashes, colons, T, Z). Not a real XSS vector, but it sets a pattern where template-literal interpolation into HTML is used without escaping. The `currentPhase` is properly escaped (line 288, R8 fix). The `md()` function at line 60 escapes `&`, `<`, `>` for content. The `progressPct`, `sessionCount`, `decisionCount` are all numbers. No actual vulnerability, but the inconsistent escaping approach is a code quality issue.

14. **P3: `readMindFile` in MCP server does not check for symlinks before reading (line 71-77)**
    `mcp-memory-server.js:71-77` -- `readMindFile` calls `safePath` (which validates path traversal) then `fs.readFileSync`. But it does not check if the resolved path is a symlink via `fs.lstatSync`. If an attacker creates a symlink at `.mind/STATE.md` pointing to `/etc/passwd`, `readMindFile` would read and return the contents. The config file loaders all check for symlinks, but the core `.mind/` file readers do not. The `safePath` function ensures the resolved path stays within `.mind/`, but a symlink *inside* `.mind/` pointing outside would resolve to outside the boundary. Wait -- `path.resolve(filePath)` would follow the symlink only if `fs.existsSync` follows it, but `safePath` uses `path.resolve(path.join(MIND_DIR, name))` which does path arithmetic, not filesystem resolution. If `name` is `STATE.md` and `.mind/STATE.md` is a symlink to `/etc/passwd`, `path.resolve` returns the `.mind/STATE.md` path (passes the check), but `fs.readFileSync` follows the symlink and reads `/etc/passwd`. This is a real gap, though exploitability requires write access to `.mind/`. Severity: P3 (requires local write access).

## Summary of Bugs

| # | Severity | File:Line | Description |
|---|----------|-----------|-------------|
| 1 | P3 | fleet-dashboard.js:275 | `execSync` for browser open -- blocks + shell injection risk |
| 2 | P3 | dashboard.js:335 | `exec` with unescaped path for browser open |
| 3 | P3 | compress-sessions.js:320 | Non-atomic writes to ARCHIVE.md and PROGRESS.md |
| 4 | P3 | compress-sessions.js:182 | Non-atomic writes after backup (no tmp+rename) |
| 5 | P3 | session-end.sh:93 | Raw `>>` append to SESSION-LOG.md bypasses advisory lock |
| 6 | P3 | subagent-start.sh:38 | Raw append to .agent-activity without locking |
| 7 | P3 | health-check.js:222 | Watch mode outputs concatenated JSON (unparseable stream) |
| 8 | P3 | fleet-dashboard.js:97 | `calcDirSize` follows symlinks, no depth/cycle guard |
| 9 | P3 | mcp-memory-server.js:668 | Per-field size check does not cover nested objects |
| 10 | P3 | session-start.sh:91 | Missing `--` separator before positional arg |
| 11 | P3 | ci.yml:70 | No PowerShell lint step for install.ps1 |
| 12 | P3 | dashboard.js:270 | Inconsistent HTML escaping approach in template |
| 13 | P3 | mcp-memory-server.js:71 | `readMindFile` does not check for symlinks inside .mind/ |

**Total: 0 P1, 0 P2, 13 P3**

## Verdict Rationale

**Yes -- adopt.**

MemoryForge v1.8.1 continues to earn a strong recommendation for AI power users. The Wave 22 fixes addressed the most impactful issues from R8:

- **Installer completeness (P2 fixed):** All 3 installers now copy all supporting scripts, eliminating the broken-install scenario where `health-check.js` or `config-keys.js` was missing.
- **Security (P2 fixed):** `execFileSync` in health-check watch mode eliminates the command injection vector.
- **Performance (P3 fixed):** task-completed.sh consolidated from 4 Node invocations to 1.
- **DX (P3 fixed):** `setup.js` gains `--help`, `--dry-run`, and clone-dir warning. Dashboard XSS fix. Buffer.byteLength consistency.

The 13 P3 bugs found in this round are all low-severity edge cases:
- Most relate to non-atomic writes in the compressor and hook scripts (the MCP server itself is properly atomic).
- The symlink gap in `readMindFile` is mitigated by the fact that exploiting it requires local write access to `.mind/`.
- The shell injection risks in browser-open commands require crafted directory names.

The architecture remains excellent. The compaction survival loop, hybrid TF-IDF search, progressive briefings, and brownfield-aware installer are all best-in-class for a zero-dependency project. The 57+ test suite across 4 suites, 3 OS x 3 Node CI matrix, and shellcheck linting provide strong confidence.

For the power user specifically:
- **API surface** is rich: `vector-memory.js` exports 7 functions, `compress-sessions.js` exports 5, `config-keys.js` provides a shared schema.
- **Hook composability** via the smart `merge-settings.js` merger means MemoryForge hooks coexist with custom hooks.
- **Extensibility** remains the weakest dimension (no programmatic tool registration or hook middleware), but the modular file structure makes forking straightforward.

The score holds steady at 9.00 -- Wave 22 was a polish wave that fixed real bugs without introducing regressions, exactly what a maturing project should do. To push scores higher would require: a plugin registration API for custom MCP tools (D3), structured agent-to-agent messaging (D6), and perhaps a real embedding model integration option (D4/D7).
