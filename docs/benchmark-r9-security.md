# Security Engineer -- Round 9 Evaluation
**Version:** 1.8.1 | **Verdict:** Yes

---

## Scores

| Dim | Name | Score | R8 | Delta | Justification |
|-----|------|------:|---:|------:|---------------|
| D1 | Supply Chain | 10 | 10 | 0 | Zero runtime dependencies. Pure Node.js + bash. No npm install, no external service calls, no network egress. `actions/checkout@v4` and `actions/setup-node@v4` pinned to major versions in CI. `require()` calls are all to local files or Node.js builtins. No CDN or remote asset loading in generated HTML dashboards. The setup.js `--dry-run` and `--help` flags are welcome additions for supply-chain-conscious installs. No changes since R8 degrade this. |
| D2 | Input Validation | 9 | 9 | 0 | MCP server enforces 50KB total input limit, 5KB per-field limit (both using `Buffer.byteLength` for consistent byte measurement), and 10MB Content-Length cap against OOM. Required fields are validated against `inputSchema`. Config keys validated against `KNOWN_CONFIG_KEYS` set with unknown-key warnings. Numeric config values checked with `Number.isSafeInteger()` after floor. Empty search query rejected. The one gap holding this at 9: no explicit type validation on MCP tool argument types (e.g., a string passed where array expected would be coerced via `String()` rather than rejected). Minor, as the MCP protocol host typically handles JSON schema validation. |
| D3 | Injection Safety | 9 | 9 | 0 | **Shell injection:** health-check.js watch mode now uses `execFileSync` (R8 P2 fix confirmed). All hook scripts pass data to Node via positional `process.argv[N]` or `process.env.VAR`, never interpolating stdin content into shell strings. Config paths use `process.env.MEMORYFORGE_CONFIG` for reads. **Path traversal:** `safePath()` resolves and prefix-checks all .mind/ writes. **Regex injection:** Section names are escaped with `replace(/[.*+?^${}()|[\]\\]/g, '\\$&')`. Headings truncated to 200 chars to prevent ReDoS. **Remaining P3 issue:** `fleet-dashboard.js` and `dashboard.js` use `execSync`/`exec` with shell-interpolated `outputPath` for browser opening. The path is derived from `path.join(resolvedDir, 'fleet-dashboard.html')` -- not user-supplied text -- but a directory name containing shell metacharacters (`$(cmd)`) could still inject. Same issue existed in R8 dashboard.js, now also present in fleet-dashboard.js. This is exploitable only with a contrived parent directory name, hence P3 not P2. |
| D4 | Data Handling | 9 | 9 | 0 | All data stays local in `.mind/` directory. No network egress anywhere. Cross-project isolation: MCP server walks up at most 10 directories to find `.mind/`, creating fallback in cwd. `.gitignore` entries in installers now include `.write-lock` (R8 fix confirmed). The repo's own `.gitignore` covers tracking files and checkpoints. Fleet dashboard scans only one level deep and skips `.` prefixed and `node_modules` dirs. Secrets: no credential storage. `.mcp-errors.log` may contain stack traces but is gitignored. Dashboard HTML is written into `.mind/` which is partially gitignored. One gap: the repo's own `.gitignore` (line 1-20) is missing `.mind/.mcp-errors.log`, `.mind/.prompt-context`, and `.mind/.file-tracker` compared to what the installers add to target projects. This only affects the MemoryForge development repo, not installed projects, so it is P3. |
| D5 | Config Security | 10 | 10 | 0 | Symlink resistance: `fs.lstatSync()` checks before reading config in health-check.js, compress-sessions.js, session-start.sh (Node inline), pre-compact.sh, and stop-checkpoint.sh. All check `!stat.isSymbolicLink() && stat.isFile()`. Config values validated with `Number.isSafeInteger()` and minimum bounds. Unknown keys flagged. Shared schema via `config-keys.js`. `compressThresholdBytes=0` correctly rejected (min 1000). `maxCheckpointFiles` min 3. The `setup.js --dry-run` mode adds safe preview capability. No arithmetic injection vectors found. |
| D6 | CI & Testing | 10 | 10 | 0 | 3 OS x 3 Node versions matrix (9 combinations). 4 test suites: MCP server (20 tests), vector memory (14), compression (9), hooks (7+). Security-critical tests: path traversal (2 tests), oversized input, per-field limits, lock contention, symlinked config, unknown config keys, `Number.isSafeInteger` validation, checkpoint pruning boundary. Shellcheck with `-S error` severity on all `.sh` files. Syntax checking via `node --check` for all JS files. JSON template validation. Tests use temp directories with cleanup. Hook tests cover full lifecycle. The only improvement opportunity would be a dedicated security test file, but the security tests are well-distributed across existing suites. |
| D7 | Audit & Logging | 9 | 9 | 0 | MCP server logs errors to `.mind/.mcp-errors.log` with ISO timestamps and stack traces. Labels categorize errors: `LockContention`, `HybridSearchError`, `ToolCallError`, `OversizedMessage`, `JSONParseError`, `UncaughtException`, `UnhandledRejection`. Session tracking: `.session-tracking`, `.agent-activity`, `.task-completions`, `.last-activity`. Error log rotated in session-start.sh when >100KB (using `tail -n` for UTF-8 safety). Tracking files rotated when >200 lines in session-start.sh and by compress-sessions.js. Contention warnings surfaced to tool callers. Health-check reports error log size. Gap holding at 9: no structured (JSON) log format -- logs use plain text with timestamp prefix. No tamper detection (checksums/signatures) on `.mind/` files. Both are acceptable for the threat model (local dev tool, not a production service). |

**Average: 9.43** (R8: 9.43, Delta: +0.00)

---

## Bugs Found

### P1
(none)

### P2
(none)

### P3

**P3-1: fleet-dashboard.js:275-277 -- `execSync` with shell-interpolated path for browser open**

`fleet-dashboard.js` uses `execSync` with string interpolation to open the browser:
```js
if (platform === 'darwin') execSync(`open "${outputPath}"`);
else if (platform === 'win32') execSync(`start "" "${outputPath}"`);
else execSync(`xdg-open "${outputPath}"`);
```
The `outputPath` is `path.join(resolvedDir, 'fleet-dashboard.html')` where `resolvedDir` comes from `path.resolve(parentDir)` and `parentDir` comes from CLI args. A directory name containing shell metacharacters (e.g., `$(whoami)` in a directory name) could lead to command injection. The same pattern exists in `dashboard.js:328-333` using `exec()`. In R8, only dashboard.js was noted; fleet-dashboard.js has the same issue. Both should use `execFileSync` or `child_process.spawn` to avoid shell interpretation, matching the pattern already applied to health-check.js watch mode.

**Risk:** Low -- requires a contrived directory name with shell metacharacters. The path is not directly attacker-controlled in normal usage (it comes from the user's own CLI invocation).

**P3-2: Repo .gitignore missing entries that installers add to target projects**

The repo's own `.gitignore` (lines 1-7) lists:
```
.mind/.last-activity
.mind/.agent-activity
.mind/.task-completions
.mind/.session-tracking
.mind/.write-lock
.mind/checkpoints/
```

But the installers (`install.sh:637-650`, `install.ps1:558-573`, `setup.js:406-421`) add additional entries to target projects:
```
.mind/.file-tracker
.mind/.prompt-context
.mind/.mcp-errors.log
.mind/ARCHIVE.md
.mind/dashboard.html
*.pre-compress
```

These entries are missing from the MemoryForge repo's own `.gitignore`. If a developer runs MemoryForge in the MemoryForge repo itself (dogfooding), `.mcp-errors.log` (which may contain stack traces with file paths), `.prompt-context`, `.file-tracker`, and `dashboard.html` could be accidentally committed.

**P3-3: MCP server error log (`logError`) has no size cap or rotation within a single long-running session**

The MCP server appends to `.mind/.mcp-errors.log` via `appendFileSync` (line 797) without any size check. The `session-start.sh` hook rotates this file when >100KB, but if the MCP server encounters a sustained error loop (e.g., repeated `OversizedMessage` or `JSONParseError` events from a misbehaving client) within a single session before session-start fires again, the log could grow unbounded. A practical cap (e.g., check size before append, or count appends) within `logError()` itself would make this resilient to pathological cases.

**Risk:** Very low -- requires a malformed MCP client sending many bad messages in a single session.

**P3-4: compress-sessions.js writes `.pre-compress` backups without atomic pattern**

At lines 182-183, 265-266, and 323:
```js
fs.copyFileSync(filePath, filePath + ".pre-compress");
fs.writeFileSync(filePath, result);
```
Unlike the MCP server which uses tmp+rename for atomic writes, the compressor writes the new content directly with `writeFileSync`. If the process crashes mid-write, the file could be left truncated. The backup (`.pre-compress`) exists as a safety net, but the write itself is not atomic. This is inconsistent with the atomic write pattern used in `writeMindFile` and `appendMindFile`.

**Risk:** Very low -- compression is a fast synchronous operation and the `.pre-compress` backup provides recovery.

**P3-5: `setup.js` chmod uses shell glob via `execSync`**

At line 311:
```js
execSync(`chmod +x "${hooksDir}"/*.sh`, { stdio: 'pipe' });
```
This passes a shell glob through `execSync`. If `hooksDir` contains shell metacharacters, this could inject. The same operation in `install.sh` uses `chmod +x "$HOOKS_DIR/"*.sh` which is safe due to bash quoting. The `setup.js` version is also practically safe since `hooksDir` is derived from `path.join(targetDir, 'scripts', 'hooks')`, but using `execFileSync` with explicit file listing would be more robust.

**Risk:** Very low -- path is locally derived, not from external input.

---

## Summary of Wave 22 Fixes (Verified)

| Fix | Status | Verification |
|-----|--------|-------------|
| P2: health-check.js watch mode `execSync` -> `execFileSync` | Confirmed | Line 227: `execFileSync(process.execPath, [__filename, ...watchArgs])` |
| P2: Installers copy all supporting scripts | Confirmed | `install.sh:570-576`, `install.ps1:483-488` copy health-check.js, config-keys.js, etc. |
| P3: task-completed.sh single Node invocation | Confirmed | Lines 25-42: single `node -e` with stdin piped |
| P3: dashboard.js currentPhase HTML-escaped | Confirmed | Line 288: `.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")` |
| P3: MCP server total input limit uses `Buffer.byteLength` | Confirmed | Line 652: `Buffer.byteLength(inputStr, 'utf-8')` |
| P3: install.ps1 .gitignore entries include .write-lock | Confirmed | Line 565: `".mind/.write-lock"` in entries array |
| P3: setup.js --help, --dry-run | Confirmed | Lines 205-217 (--help), line 205 (--dry-run) |
| Version 1.8.1 | Confirmed | Consistent across mcp-memory-server.js:619, health-check.js:29, install.sh:24, install.ps1:33, setup.js:21 |

---

## Verdict Rationale

**Verdict: Yes -- adopt**

MemoryForge v1.8.1 maintains the excellent security posture established in R8. All 6 P2/P3 bugs from R8 have been verified as fixed. The codebase demonstrates strong security engineering:

1. **Zero dependencies** eliminates the entire supply chain attack surface -- no npm, no lockfiles, no transitive dependencies to audit.

2. **Defense in depth** is applied consistently: path traversal checks via `safePath()`, regex escaping, ReDoS prevention via heading truncation, `Number.isSafeInteger()` for config validation, symlink resistance via `lstatSync()`, advisory file locking, atomic writes via tmp+rename, and shell injection prevention via `execFileSync` and environment variable passing.

3. **Test coverage of security paths** is thorough: 50+ tests across 4 suites cover path traversal, oversized input, per-field limits, lock contention, symlink attacks, config validation, and checkpoint pruning boundaries.

4. **The 5 new P3 bugs are all low-risk.** P3-1 (shell-interpolated paths in browser-open commands) is the most actionable but requires contrived directory names to exploit. P3-2 is a repo hygiene issue. P3-3, P3-4, and P3-5 are edge cases with very low practical risk.

5. **No P1 or P2 bugs found.** The security surface has been steadily hardened over multiple rounds. The remaining issues are all minor polish items.

The score holds steady at 9.43. The project has reached a mature security posture appropriate for org-wide deployment. The zero-dependency architecture, comprehensive input validation, and consistent defense-in-depth patterns make this a trustworthy tool for local development environments.

---

*Evaluated by: Security Engineer persona, Round 9*
*Benchmark spec: docs/BENCHMARK-SPEC.md v1*
*Prior rounds: R4 baseline -> R5 -> R6 -> R7 -> R8 (9.43) -> R9 (9.43)*
