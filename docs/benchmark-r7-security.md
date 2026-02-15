# MemoryForge v1.7.0 — Security Engineer Benchmark (Round 7)

**Evaluator Persona:** Security Engineer (10% market share)
**Benchmark Date:** 2026-02-15
**Version Evaluated:** 1.7.0 (Waves 1-20 complete)
**Baseline:** Round 6 Security Engineer Score: 9.00/10

---

## Executive Summary

MemoryForge v1.7.0 addresses the top three high-priority recommendations from the R6 audit: per-field length limits (Bug #1), concurrency testing (Bug #9), and shellcheck promotion to error severity (Bug #11). Additionally, config schema validation rejects unknown/typo keys, health-check validates with `Number.isSafeInteger()`, and symlink config attack tests have been added. The test suite grew from 50 to 58 tests, adding security-focused tests for schema validation, symlink rejection, and checkpoint rotation boundaries.

The codebase continues to demonstrate strong security engineering. No P1 or P2 vulnerabilities were found. The new per-field validation at 5KB per string field closes the R6 Bug #1 gap, and the lock contention warning now surfaces to the user instead of being silently swallowed (R6 Bug #14). However, the per-field validation has a depth limitation (does not recurse into nested objects), the KNOWN_CONFIG_KEYS set is duplicated across two files creating a consistency risk, and the session-start briefing config loader still lacks the symlink check that other config loaders have.

**Verdict:** **YES -- Recommend for adoption**

The codebase is production-ready. All R6 high-priority recommendations have been addressed. Remaining issues are P3 hardening opportunities.

---

## Dimension Scores

| Dimension | Score | R6 Score | Change |
|-----------|-------|----------|--------|
| D1: Supply Chain | 10 | 10 | -- |
| D2: Input Validation | 9 | 9 | -- |
| D3: Injection Safety | 9 | 9 | -- |
| D4: Data Handling | 9 | 9 | -- |
| D5: Config Security | 9 | 9 | -- |
| D6: CI & Testing | 10 | 9 | +1 |
| D7: Audit & Logging | 9 | 8 | +1 |
| **Average** | **9.29** | **9.00** | **+0.29** |

---

## D1: Supply Chain -- 10/10 (R6: 10, unchanged)

**What it measures:** Dependencies, pinning, build process, external service calls.

### Strengths
1. **Zero npm dependencies** -- entire codebase uses Node.js built-ins only
2. **No external service calls** -- fully offline, no telemetry, no API requests
3. **No build step** -- pure JavaScript/bash, no transpilation or bundling
4. **CI pinning** -- GitHub Actions use pinned major versions (`actions/checkout@v4`, `actions/setup-node@v4`)
5. **Node.js version matrix** -- tested on Node 18/20/22 across 3 platforms
6. **shellcheck linting** -- static analysis of all bash scripts in CI, now at `-S error` severity
7. **No credential requirements** -- runs as unprivileged user, no sudo/admin
8. **Documented prerequisites** -- Node.js 18+ clearly stated in README and installers

### Security Analysis
- **Package.json:** Intentionally absent -- no npm supply chain risk
- **Installers check Node.js presence** before proceeding (install.sh:37-46, install.ps1:36-47)
- **Scripts use `#!/usr/bin/env node`** -- no hardcoded paths
- **No curl/wget download chains** -- all code is git-cloned, auditable
- **Symlink detection on config load** -- prevents symlink attacks (compress-sessions.js:54-55, health-check.js:72-73, pre-compact.sh:51-52, session-start.sh:62, stop-checkpoint.sh:75)

### Bugs Found
None -- supply chain remains exemplary.

**Score: 10/10** -- Best-in-class. Zero external dependencies, no build process, no network calls. Unchanged from R6.

---

## D2: Input Validation -- 9/10 (R6: 9, unchanged)

**What it measures:** Per-field type/length/character restrictions, sanitization, size limits.

### Strengths
1. **Size limits enforced:**
   - MCP tool inputs: 50KB cap (mcp-memory-server.js:27)
   - Per-field string limit: 5KB MAX_FIELD_SIZE (mcp-memory-server.js:28) -- **NEW in v1.7.0**
   - MCP messages: 10MB cap to prevent OOM (mcp-memory-server.js:29)
   - File size guard: buildIndex() skips files >10MB (vector-memory.js:282-283)
2. **Field validation:**
   - Required fields checked against inputSchema (mcp-memory-server.js:691-704)
   - Per-field string length validated for top-level fields and array elements (mcp-memory-server.js:660-688)
   - Numeric validation before arithmetic (user-prompt-context.sh:42-43, stop-checkpoint.sh:86-87, session-end.sh:42-43)
   - Number.isSafeInteger() in compress-sessions.js:76 AND health-check.js:91 -- **consistency fixed from R6 Bug #7**
3. **Schema validation:**
   - KNOWN_CONFIG_KEYS set rejects unknown config keys (compress-sessions.js:29-40, health-check.js:32-43) -- **NEW in v1.7.0**
   - Warnings emitted on unknown keys (compress-sessions.js:61-64, health-check.js:83-85)
4. **Type safety:**
   - JSON.parse with try-catch in all hooks
   - Fallback to safe defaults on parse errors
   - Safe integer bounds checking for config values

### Security Analysis
- **R6 Bug #1 resolved**: Per-field length limit now enforced at 5KB per individual string field (mcp-memory-server.js:660-688)
- **Per-field validation covers arrays**: Array elements are individually checked (mcp-memory-server.js:667-674)
- **Query parameter validation** in memory_search -- requires non-empty string
- **Date validation** in task archival -- checks isNaN before date comparison (compress-sessions.js:313)
- **Config validation** in health-check.js -- now uses Number.isSafeInteger() consistently (health-check.js:91)

### Bugs Found

**Bug #1: Per-field validation does not recurse into nested objects**
**Severity:** P3
**Location:** mcp-memory-server.js:660-688
**Details:** The per-field validation iterates `Object.entries(toolArgs)` and checks `typeof val === 'string'` and `Array.isArray(val)`, but does not recurse into objects. If a tool accepted a nested object field (e.g., `{metadata: {description: "x".repeat(50000)}}`), the inner string would bypass the 5KB per-field check. Currently, no tool schema defines nested object inputs, so this is theoretical.
**Recommendation:** Add a recursive check or explicitly validate that no values are plain objects. This would future-proof the validation.

**Bug #2: Per-field validation checks string `.length` (chars) not byte length**
**Severity:** P3
**Location:** mcp-memory-server.js:663
**Details:** `val.length > MAX_FIELD_SIZE` counts JavaScript characters, not UTF-8 bytes. A 5000-character string of 4-byte emoji would be ~20KB on disk, exceeding the intended 5KB limit. The total input check at line 647 uses `JSON.stringify(toolArgs).length` which also counts chars, not bytes. Both checks are consistent with each other, but the constant name `MAX_FIELD_SIZE` at 5*1024 suggests bytes.
**Mitigation:** The MAX_INPUT_SIZE at 50KB (checked on the serialized JSON string) provides an outer bound. A 20KB emoji field would hit the 50KB total limit if combined with other fields.
**Recommendation:** Use `Buffer.byteLength(val, 'utf-8')` for byte-accurate enforcement, or rename the constant to clarify it counts characters.

**Bug #3: health-check.js watch mode argument injection**
**Severity:** P3
**Location:** health-check.js:237-238
**Details:** Watch mode constructs a command string: `node "${__filename}" ${watchArgs}`. The `watchArgs` variable is derived from `process.argv` filtered by the script, which means user-controlled arguments are interpolated into an `execSync` command. An argument like `"; rm -rf /"` would be injected. However, the `__filename` is quoted, and the attack requires the user to pass malicious arguments to their own health-check invocation, making this self-attack only.
**Mitigation:** Self-attack vector -- the user controls their own CLI arguments.
**Recommendation:** Use `spawn()` with an argv array instead of string interpolation in `execSync`, or validate/escape `watchArgs` before interpolation.

**Score: 9/10** -- Excellent input validation with per-field limits addressing R6's top recommendation. Minor gaps in recursion depth and character vs. byte counting.

---

## D3: Injection Safety -- 9/10 (R6: 9, unchanged)

**What it measures:** Shell injection, path traversal, regex injection, command injection in all code paths.

### Strengths
1. **Path traversal prevention:**
   - safePath() blocks `../` escapes in all MCP file operations (mcp-memory-server.js:62-68)
   - Path resolution with startsWith() check
   - Test coverage: 2 path traversal tests (mcp-server.test.js:347-385)
2. **Shell injection prevention:**
   - Config paths passed via `process.env`, not string interpolation (session-start.sh:63-67, stop-checkpoint.sh:76-79)
   - All bash variables quoted in `set -euo pipefail` scripts
3. **Regex injection prevention:**
   - All heading parameters regex-escaped in extractSection() (mcp-memory-server.js:458)
   - Section parameter escaped in memorySaveProgress (mcp-memory-server.js:402)
   - Defense-in-depth: heading length limit (200 chars) + escaping
4. **No eval() or Function() constructor** anywhere in codebase (verified via grep)
5. **No dynamic require()** or import() of user-controlled paths

### Security Analysis
- **MCP server uses Buffer-based parsing** -- prevents multi-byte Content-Length attacks (mcp-memory-server.js:582-775)
- **Atomic writes** -- write-to-tmp + rename prevents partial write attacks (mcp-memory-server.js:110-113)
- **Advisory file locking** -- prevents concurrent write corruption (mcp-memory-server.js:84-117)
- **Hook scripts use `set -euo pipefail`** -- fail fast on errors (all 8 hooks)

### Bugs Found

**Bug #4: Dashboard exec() shell injection via crafted .mind/ path**
**Severity:** P3 (carried from R6 Bug #3)
**Location:** dashboard.js:329-335, fleet-dashboard.js:275-277
**Details:** Browser auto-open uses `exec(cmd)` / `execSync(...)` with path interpolation. On Windows, a directory name containing `&` or `|` could inject shell commands. Example: a project directory named `C:\test & calc\` would execute `calc` when the dashboard auto-opens.
**Mitigation:** The path comes from the `.mind/` directory path, not from attacker-controlled network input. Only affects local dev use.
**Recommendation:** Use `spawn()` with argv array instead of `exec()` with string interpolation.

**Bug #5: user-prompt-context.sh grep output used unescaped in JSON context**
**Severity:** P3
**Location:** user-prompt-context.sh:52-54
**Details:** PHASE, NEXT_ACTION, and BLOCKERS are extracted via `grep` from STATE.md and interpolated into a bash variable `CONTEXT="[Memory] Phase: $PHASE | Next: $NEXT_ACTION"`. This variable is then passed to `node -e "... process.argv[1]"` as an argument. If STATE.md contains shell metacharacters in the phase name (e.g., phase text containing `$(command)` or backticks), these would be interpreted by bash during the variable assignment. However, the grep output is assigned via command substitution `$(...)` which doesn't execute nested commands in this context.
**Mitigation:** The grep output is safely captured. The JSON output uses `process.argv[1]` and `JSON.stringify()` (line 72-77) which properly escapes the string. The risk is minimal.
**Recommendation:** No change needed -- the current pattern is safe.

**Score: 9/10** -- Comprehensive injection defenses. The dashboard shell escaping issue persists from R6 but remains low-risk.

---

## D4: Data Handling -- 9/10 (R6: 9, unchanged)

**What it measures:** Data locality, cross-project isolation, secrets exposure, .gitignore coverage.

### Strengths
1. **Data locality:**
   - All state files written to `.mind/` within project directory
   - No cross-project access (CLAUDE_PROJECT_DIR scoping)
   - No writes outside project boundary (safePath enforced)
2. **Cross-project isolation:**
   - Each project has isolated `.mind/` directory
   - MCP server only accesses files within resolved `.mind/`
   - Global install mode uses per-project `.mind/` (shared hooks, isolated state)
3. **Secrets exposure prevention:**
   - `.gitignore` template excludes tracking files, error logs, checkpoints
   - No credential storage or secrets handling
   - Config is pure JSON (no secrets in config)
4. **.gitignore coverage (install.sh:633-645):**
   - `.mind/.last-activity`, `.mind/.agent-activity`, `.mind/.task-completions`
   - `.mind/.session-tracking`, `.mind/.file-tracker`, `.mind/.prompt-context`
   - `.mind/.mcp-errors.log`, `.mind/ARCHIVE.md`, `.mind/dashboard.html`
   - `.mind/checkpoints/`, `*.pre-compress`

### Bugs Found

**Bug #6: .write-lock file not in .gitignore**
**Severity:** P3
**Location:** install.sh:633-645, install.ps1:554-567
**Details:** The `.mind/.write-lock` file created by the advisory locking mechanism (mcp-memory-server.js:81) is not included in the .gitignore entries. If the MCP server crashes while holding a lock, the stale lock file could be committed to version control. This would not cause data loss (the stale detection at 30s handles it), but it would be confusing noise in the git history.
**Recommendation:** Add `.mind/.write-lock` to the .gitignore entries in both install.sh and install.ps1.

**Bug #7: Error log may contain sensitive file paths in stack traces**
**Severity:** P3 (carried from R6 Bug #5)
**Location:** mcp-memory-server.js:780-788
**Details:** Error logging writes full stack traces to `.mcp-errors.log`, which may include absolute file paths revealing directory structure. The log file is gitignored, but could leak information if accidentally shared.
**Recommendation:** Sanitize stack traces to remove absolute paths before logging.

**Score: 9/10** -- Excellent data isolation with proper .gitignore coverage. Minor gap for .write-lock file.

---

## D5: Config Security -- 9/10 (R6: 9, unchanged)

**What it measures:** Config loading safety, value validation, symlink resistance, arithmetic injection.

### Strengths
1. **Schema validation (NEW in v1.7.0):**
   - KNOWN_CONFIG_KEYS set rejects unknown/typo keys (compress-sessions.js:29-40, health-check.js:32-43)
   - Warnings emitted on unknown keys to stderr (compress-sessions.js:62-64)
   - Health-check reports unknown keys as config issues (health-check.js:83-85)
   - Test coverage: hooks.test.js tests unknown key detection and symlink rejection
2. **Symlink resistance:**
   - Config load checks `fs.lstatSync()` and skips symlinks in compress-sessions.js:54-55
   - Health-check explicitly flags symlinked configs (health-check.js:72-74)
   - Pre-compact.sh checks symlinks in Node.js inline (pre-compact.sh:51-52)
   - Shell-level `! -L` check in session-start.sh:62 and stop-checkpoint.sh:75
3. **Value validation:**
   - Number.isSafeInteger() now consistent across both health-check.js AND compress-sessions.js (R6 Bug #7 fixed)
   - Math.max() clamping ensures positive values
   - Bounds checking: keepSessionsFull>=1, keepDecisionsFull>=1, archiveAfterDays>=1, trackingMaxLines>=10, compressThresholdBytes>=1000, maxCheckpointFiles>=3, staleWarningSeconds>=60
4. **No code execution in config** -- pure JSON, parsed via JSON.parse()

### Security Analysis
- **Safe defaults** -- all values have documented defaults in template
- **Graceful degradation** -- invalid config silently falls back to defaults (no crashes)
- **No path/command injection via config** -- all values are numeric

### Bugs Found

**Bug #8: KNOWN_CONFIG_KEYS duplicated in two files -- consistency risk**
**Severity:** P3
**Location:** compress-sessions.js:29-40, health-check.js:32-43
**Details:** The KNOWN_CONFIG_KEYS set is defined independently in both files. If a new config key is added to one but not the other, the schema validation would be inconsistent -- one tool would accept the key while the other warns about it. This is a maintenance risk.
**Recommendation:** Extract KNOWN_CONFIG_KEYS to a shared module (e.g., `scripts/config-schema.js`) imported by both files. Since the project avoids dependencies, this would be an internal module only.

**Bug #9: session-start.sh Node.js briefing config load lacks symlink check**
**Severity:** P3
**Location:** session-start.sh:107-110
**Details:** The shell-level config load on line 62 correctly checks `[ ! -L ... ]`, but the second config load inside the inline Node.js block (lines 107-110) uses `fs.existsSync(cfgPath)` without a symlink check:
```javascript
const cfgPath = path.join(projectRoot, '.memoryforge.config.json');
if (fs.existsSync(cfgPath)) cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
```
This is inconsistent with compress-sessions.js:54-55, pre-compact.sh:51-52, and health-check.js:72-74 which all use `lstatSync().isSymbolicLink()`.
**Impact:** An attacker who can create a symlink at `.memoryforge.config.json` could influence briefing thresholds (SESSION_LOG_TAIL, RECENT_DECISIONS, MAX_PROGRESS_LINES). These control how much content is injected into the session briefing. Setting extreme values (e.g., MAX_PROGRESS_LINES=999999) could cause context injection bloat but not code execution.
**Recommendation:** Add `fs.lstatSync(cfgPath).isSymbolicLink()` check before `readFileSync()`, matching the pattern in other config loaders.

**Bug #10: Config validation accepts non-object JSON values**
**Severity:** P3
**Location:** compress-sessions.js:56, health-check.js:78
**Details:** `JSON.parse(raw)` would succeed on valid JSON like `"hello"`, `42`, or `[1,2,3]`. If the config file contained a JSON array or string instead of an object, `Object.keys(cfg)` would produce unexpected results. For an array, it would produce numeric string keys. For a string, it would iterate characters.
**Mitigation:** The subsequent `cfg[key]` lookups would return `undefined` for all config keys, causing all defaults to be used. No crash or vulnerability.
**Recommendation:** Add `if (typeof cfg !== 'object' || cfg === null || Array.isArray(cfg))` guard before processing config keys.

**Score: 9/10** -- Excellent config security with schema validation and symlink resistance. Minor inconsistency in symlink check across config load sites.

---

## D6: CI & Testing -- 10/10 (R6: 9, +1)

**What it measures:** Test coverage of security-critical paths, SAST, platform matrix, hook testing.

### Strengths
1. **Test coverage (improved from 50 to 58 tests):**
   - mcp-server.test.js: 22 tests (was 20; +per-field limit test, +concurrency test, +symlink config test)
   - compress.test.js: 9 tests (compression, archival, rotation, config override)
   - vector-memory.test.js: 14 tests (TF-IDF, tokenization, search, chunking)
   - hooks.test.js: 13 tests (was 7; +checkpoint rotation x2, +unknown config keys, +isSafeInteger, +symlink config rejection)
2. **Security test coverage:**
   - Path traversal: 2 tests (../../../etc/passwd, absolute paths)
   - Input size limits: 1 test (50KB cap)
   - Per-field size limits: 1 test (5KB per field) -- **NEW**
   - Concurrent lock contention: 1 test (2 servers writing simultaneously) -- **NEW (R6 Bug #9 fixed)**
   - Symlink config attack: 1 test (health-check rejects symlinked config) -- **NEW (R6 Bug #10 fixed)**
   - Symlink config with MCP server: 1 test (server doesn't crash on symlinked config) -- **NEW**
   - Config schema validation: 1 test (typo key detection) -- **NEW**
   - Config extreme values: 1 test (1e308, negative values) -- **NEW**
   - Checkpoint rotation boundary: 2 tests (default 10, custom 5) -- **NEW**
3. **Platform matrix:**
   - **3 OS:** ubuntu-latest, macos-latest, windows-latest
   - **3 Node versions:** 18, 20, 22
   - **Total: 9 configurations** tested on every push
4. **SAST:**
   - shellcheck at `-S error` severity on all bash scripts (ci.yml:70) -- **promoted from warning (R6 Bug #11 fixed)**
   - Node.js `--check` syntax validation on all 6 JS files (ci.yml:50-56)
   - JSON template validation (ci.yml:59)
5. **CI on every push/PR** to master branch
6. **Zero test dependencies** -- all tests use Node.js built-in `assert`

### Security Analysis
- **Concurrency test** verifies 2 MCP servers can write to same .mind/ without data corruption (mcp-server.test.js:465-495)
- **Symlink config test** verifies health-check properly rejects symlinked config files (hooks.test.js:290-313)
- **Schema validation test** verifies typo detection in config keys (hooks.test.js:235-262)
- **Checkpoint rotation boundary tests** verify pruning at default and custom limits (hooks.test.js:186-231)
- **Tests run in isolated temp directories** -- no state pollution (all test files use `mkdtempSync`)
- **No credential requirements for CI** -- fully offline tests

### Why 10/10
All three R6 high-priority testing recommendations have been addressed:
1. Concurrency test added (R6 Bug #9)
2. Symlink config test added (R6 Bug #10)
3. shellcheck promoted to error severity (R6 Bug #11)

Additionally, 8 new tests were added covering security-critical paths (schema validation, extreme config values, checkpoint boundaries), bringing total coverage to 58 tests. The CI matrix remains comprehensive at 9 configurations. This is now best-in-class for a zero-dependency project.

### Minor Observations (not bugs)

- The symlink config test in mcp-server.test.js (line 498-531) skips on Windows due to symlink privilege requirements. This is acceptable -- the health-check.js symlink test in hooks.test.js also skips on Windows. The underlying `lstatSync()` code is cross-platform and covered by Linux/macOS CI runs.
- The concurrency test (line 465-495) acknowledges that contention "may or may not occur depending on timing" -- this is an inherent limitation of testing advisory locks, not a test gap.

**Score: 10/10** -- Best-in-class test coverage with 58 tests, 9 CI configurations, and security-focused test additions. All R6 high-priority test gaps closed.

---

## D7: Audit & Logging -- 9/10 (R6: 8, +1)

**What it measures:** Structured logs, tool invocation records, error logging, log rotation, tamper detection.

### Strengths
1. **Error logging:**
   - `.mcp-errors.log` for all MCP server errors with timestamps (mcp-memory-server.js:780-788)
   - Rotation to 500 lines in session-start (session-start.sh:37-43)
   - uncaughtException and unhandledRejection handlers (mcp-memory-server.js:790-791)
2. **Lock contention surfaced to user (NEW in v1.7.0 -- R6 Bug #14 fixed):**
   - `withContentionWarning()` helper appends a visible warning to tool results when lock acquisition fails (mcp-memory-server.js:132-142)
   - Warning message: "Could not acquire write lock -- another process may be writing to .mind/ concurrently. Data was written but may conflict with concurrent changes." (mcp-memory-server.js:134)
   - Applied to all write operations: memoryUpdateState (line 320-323), memorySaveDecision (line 350-352), memorySaveProgress (line 370-372, 384-387, 413-415), memorySaveSession (line 447-449)
3. **Tool invocation tracking:**
   - Subagent activity logged to `.agent-activity` (subagent-start.sh:38, subagent-stop.sh:37)
   - Task completions logged to `.task-completions` (task-completed.sh:46)
   - Session tracking in `.session-tracking` (session-end.sh:31)
4. **Structured formats:**
   - All tracking files use `[timestamp] EVENT: details` format
   - Session log has numbered entries with metadata
   - Checkpoint files have ISO timestamps
5. **Log rotation:**
   - Tracking files rotated to 100 entries (session-start.sh:45-56)
   - Error log rotated to 500 lines (session-start.sh:37-43)
   - Checkpoint files pruned to configurable max (default 10) (pre-compact.sh:120-129)
   - .pre-compress backups limited to 3 (compress-sessions.js:85, 368-388)
6. **Health check diagnostics:**
   - JSON-formatted health report with version, file sizes, staleness, config issues (health-check.js)
   - Watch mode for continuous monitoring (health-check.js:231-243)
   - Schema validation warnings surfaced in health check output (health-check.js:180-184)

### Why 9/10 (up from 8)
The lock contention warning (R6 Bug #14) is now surfaced to the user in tool results rather than being silently swallowed. This is a significant improvement for debugging concurrent write issues. Combined with the health-check schema validation warnings (which serve as a config audit trail), the audit capabilities are now strong.

### Remaining Gaps

**Bug #11: No tamper detection mechanism for audit logs**
**Severity:** P3 (carried from R6 Bug #12)
**Location:** All logging
**Details:** Tracking files (.agent-activity, .task-completions, .session-tracking) are plain text and can be modified by anyone with write access. No checksums or signatures to detect tampering.
**Recommendation:** Add tamper detection (e.g., append-only mode, HMAC signatures). For most users this is overkill, but enterprise security teams may require it. This is the primary reason D7 cannot reach 10.

**Bug #12: No centralized audit trail of MCP tool invocations**
**Severity:** P3 (carried from R6 Bug #15)
**Location:** mcp-memory-server.js
**Details:** The MCP server logs errors but not successful tool invocations. There is no audit trail of "Agent called memory_update_state at timestamp with args." For security auditing or debugging, this would be valuable.
**Recommendation:** Add optional verbose logging mode (controlled by env var like `MEMORYFORGE_AUDIT=1`) that logs all tool calls to `.mcp-audit.log` with timestamp, tool name, and sanitized args.

**Bug #13: Contention warning includes emoji character**
**Severity:** P3
**Location:** mcp-memory-server.js:134
**Details:** The CONTENTION_WARNING string starts with a unicode emoji character (warning sign). While this is not a security vulnerability, some MCP consumers or terminal environments may not render it correctly, and it adds a non-ASCII byte to every warning response. More importantly, the warning message reveals implementation details ("write lock", ".mind/ concurrently") which could aid an attacker in understanding the file locking mechanism.
**Recommendation:** Use a plain text prefix like `[WARNING]` instead of the emoji, and omit implementation details from the user-facing message.

**Score: 9/10** -- Strong improvement with lock contention surfaced to users. Remaining gap: no tamper detection for audit logs, no tool invocation audit trail.

---

## Critical Bugs Summary

### P1 Bugs: 0
**None found.** All P1 bugs from previous rounds remain fixed.

### P2 Bugs: 0
**None found.** All P2 bugs from previous rounds remain fixed.

### P3 Bugs: 13

| # | Severity | Location | Description | Impact |
|---|----------|----------|-------------|--------|
| 1 | P3 | mcp-memory-server.js:660-688 | Per-field validation does not recurse into nested objects | Theoretical bypass if nested object fields were added |
| 2 | P3 | mcp-memory-server.js:663 | Per-field validation counts chars, not bytes | 4-byte Unicode chars could exceed intended byte limit |
| 3 | P3 | health-check.js:237-238 | Watch mode argument injection via execSync string | Self-attack only (user controls CLI args) |
| 4 | P3 | dashboard.js:329-335, fleet-dashboard.js:275-277 | exec() shell injection via crafted directory name | Requires attacker-controlled directory name (low risk) |
| 5 | P3 | user-prompt-context.sh:52-54 | grep output in JSON context | Mitigated by JSON.stringify escaping |
| 6 | P3 | install.sh:633-645, install.ps1:554-567 | .write-lock not in .gitignore | Stale lock file could be committed |
| 7 | P3 | mcp-memory-server.js:780-788 | Error logs contain absolute paths in stack traces | Information disclosure if logs shared |
| 8 | P3 | compress-sessions.js:29-40, health-check.js:32-43 | KNOWN_CONFIG_KEYS duplicated -- consistency risk | New key added to one file but not the other |
| 9 | P3 | session-start.sh:107-110 | Node.js briefing config load lacks symlink check | Inconsistent with other config loaders |
| 10 | P3 | compress-sessions.js:56, health-check.js:78 | Config validation accepts non-object JSON | Array/string config would silently use defaults |
| 11 | P3 | All logging | No tamper detection mechanism | Logs can be altered post-incident |
| 12 | P3 | mcp-memory-server.js | No audit trail of tool invocations | Missing forensic data |
| 13 | P3 | mcp-memory-server.js:134 | Contention warning uses emoji and reveals internals | Minor UX and information disclosure |

**Total Bugs:** 13 (0 P1, 0 P2, 13 P3)

---

## R6 Bug Resolution Tracker

| R6 Bug # | R6 Description | Status in v1.7.0 |
|-----------|---------------|-------------------|
| #1 | No per-field length limits in memory_update_state | **FIXED** -- 5KB MAX_FIELD_SIZE (mcp-memory-server.js:28, 660-688) |
| #2 | health-check watch mode execSync timeout spam | Carried as P3 |
| #3 | Dashboard execSync shell escaping | Carried as P3 (Bug #4) |
| #4 | Git command injection risk | Mitigated (CLAUDE_PROJECT_DIR not user-controlled) |
| #5 | Error logs leak absolute paths | Carried as P3 (Bug #7) |
| #6 | SESSION-LOG.md/DECISIONS.md not flagged for review | Not addressed |
| #7 | health-check missing Number.isSafeInteger() | **FIXED** -- health-check.js:91 now uses isSafeInteger |
| #8 | Math.floor before isSafeInteger clarity | No change (not a bug) |
| #9 | No test for concurrent lock contention | **FIXED** -- mcp-server.test.js:465-495 |
| #10 | No test for symlink config attack | **FIXED** -- hooks.test.js:290-313, mcp-server.test.js:498-531 |
| #11 | shellcheck warnings not promoted to errors | **FIXED** -- ci.yml:70 now uses `-S error` |
| #12 | No tamper detection mechanism | Not addressed (P3, acceptable) |
| #13 | Error log rotation may truncate stack traces | Not addressed (P3, acceptable) |
| #14 | Lock contention not surfaced to user | **FIXED** -- withContentionWarning() (mcp-memory-server.js:132-142) |
| #15 | No audit trail of tool invocations | Not addressed (P3, acceptable) |

**Summary:** 6 of the 7 high/medium priority R6 recommendations were addressed (Bugs #1, #7, #9, #10, #11, #14). Bug #6 (document review guidance) was not addressed but is documentation-only.

---

## Positive Security Findings

1. **Zero npm dependencies** -- eliminates entire class of supply chain attacks
2. **Comprehensive input validation** -- total size limit (50KB) + per-field limit (5KB) + type checks + bounds validation
3. **Defense-in-depth** -- multiple layers (safePath + length limits + escaping + schema validation)
4. **Atomic operations** -- tmp+rename prevents partial writes
5. **Advisory locking** -- prevents concurrent write corruption, now with user-visible warnings
6. **Symlink resistance** -- config loading explicitly rejects symlinks in 5 locations
7. **Buffer-based MCP transport** -- prevents multi-byte framing attacks
8. **Proper shell quoting** -- all bash variables quoted, no injection vectors
9. **Regex escaping** -- all user-controlled heading/section names escaped
10. **No code execution in config** -- pure JSON, no require() or eval()
11. **58 tests covering security paths** -- path traversal, size limits, per-field limits, concurrency, symlinks, schema validation
12. **shellcheck at error severity** -- zero tolerance for shell script issues
13. **Config schema validation** -- typos and unknown keys detected and warned
14. **Error handling** -- graceful degradation, no crashes on invalid input
15. **Data isolation** -- safePath enforces .mind/ boundary
16. **Rotation/pruning** -- prevents unbounded log growth (error logs, tracking files, checkpoints, backups)

---

## Recommendations (Priority Order)

### High Priority (next release)
1. **Extract KNOWN_CONFIG_KEYS to shared module** (Bug #8) -- prevents consistency drift
2. **Add symlink check to session-start.sh inline config load** (Bug #9) -- matches other config loaders
3. **Add .write-lock to .gitignore** (Bug #6) -- prevents accidental commit of stale lock files

### Medium Priority (within 2-3 releases)
4. **Add tamper detection** for audit logs (Bug #11) -- HMAC or checksum-based
5. **Add optional audit trail** for MCP tool invocations (Bug #12) -- `MEMORYFORGE_AUDIT=1` env var
6. **Add non-object JSON guard** in config validation (Bug #10)
7. **Future-proof per-field validation with recursion** (Bug #1)

### Low Priority (nice to have)
8. Fix dashboard exec() shell escaping (Bug #4)
9. Sanitize error log paths (Bug #7)
10. Use byte length in per-field validation (Bug #2)
11. Fix health-check watch mode argument handling (Bug #3)
12. Replace emoji in contention warning (Bug #13)

---

## Compliance & Standards

### Security Best Practices
- PASS: Principle of least privilege (runs as user, no elevation)
- PASS: Defense in depth (multiple validation layers: total size + per-field + schema + type)
- PASS: Input validation at all trust boundaries
- PASS: Secure defaults (all config values have safe defaults)
- PASS: Fail securely (errors don't expose sensitive info to network -- local tool)
- PASS: Separation of concerns (state files vs code vs tracking vs logs)
- PASS: Audit logging (tracking files, error logs, lock contention warnings)
- PASS: No hardcoded secrets
- PASS: Safe temporary file handling (mkdtemp, unlink, atomic writes)
- PASS: Symlink resistance (config, state files)

### OWASP Top 10 Coverage
- PASS: A01:2021 -- Broken Access Control: safePath() prevents traversal, per-field limits
- PASS: A02:2021 -- Cryptographic Failures: No crypto needed, no secrets stored
- PASS: A03:2021 -- Injection: Regex escaping, shell quoting, no eval(), per-field validation
- PASS: A04:2021 -- Insecure Design: Defense-in-depth architecture, schema validation
- PASS: A05:2021 -- Security Misconfiguration: Secure defaults, unknown key warnings, validation
- PASS: A06:2021 -- Vulnerable Components: Zero dependencies
- PASS: A07:2021 -- Authentication Failures: N/A (local tool, no network auth)
- PASS: A08:2021 -- Software/Data Integrity: Atomic writes, locking, symlink checks
- PASS: A09:2021 -- Logging Failures: Comprehensive logging with rotation (needs tamper detection)
- PASS: A10:2021 -- SSRF: No network requests

---

## Verdict

**YES -- Recommend for adoption**

MemoryForge v1.7.0 is **production-ready from a security perspective**. The codebase demonstrates excellent security engineering with:

- **Zero P1/P2 vulnerabilities** -- all critical issues from previous rounds remain fixed
- **R6 recommendations addressed** -- 6 of 7 high/medium priority items resolved (per-field limits, isSafeInteger consistency, concurrency testing, symlink testing, shellcheck errors, lock contention surfacing)
- **Strong defense-in-depth** -- three-layer input validation (total 50KB + per-field 5KB + schema validation), symlink resistance at 5 config load points, regex escaping, atomic writes
- **Comprehensive testing** -- 58 tests covering security-critical paths across 9 CI configurations
- **Minimal attack surface** -- zero dependencies, no network calls, no code execution

The 13 P3 bugs identified are **hardening opportunities**, not blockers. The most impactful improvements would be extracting KNOWN_CONFIG_KEYS to a shared module (consistency), adding the missing symlink check in session-start.sh (completeness), and adding .write-lock to .gitignore (hygiene).

**Security Engineer Confidence Level:** **High**

I would approve this tool for organizational rollout. The security posture has improved incrementally from R6 (9.00 to 9.29), with the main gains in testing completeness (D6: 9->10) and audit/logging capabilities (D7: 8->9).

---

## Comparison Across Rounds

| Metric | Round 4 | Round 6 | Round 7 | R6->R7 Change |
|--------|---------|---------|---------|---------------|
| **Overall Score** | 6.86/10 | 9.00/10 | 9.29/10 | **+0.29** |
| **P1 Bugs** | 1 | 0 | 0 | -- |
| **P2 Bugs** | 5 | 0 | 0 | -- |
| **P3 Bugs** | 8 | 15 | 13 | -2 |
| **Test Count** | 28 | 50 | 58 | +8 tests |
| **CI Platforms** | 3 | 9 | 9 | -- |
| **Dependencies** | 0 | 0 | 0 | -- |
| **R6 Bugs Fixed** | -- | -- | 6/7 high-priority | -- |

**Key Improvements Since R6:**
1. **Per-field length limits added** (R6 Bug #1) -- 5KB MAX_FIELD_SIZE closes the biggest input validation gap
2. **Number.isSafeInteger() consistency** (R6 Bug #7) -- health-check now matches compress-sessions
3. **Concurrency test added** (R6 Bug #9) -- verifies lock contention behavior
4. **Symlink config tests added** (R6 Bug #10) -- health-check + MCP server symlink tests
5. **shellcheck at error severity** (R6 Bug #11) -- zero tolerance for shell issues
6. **Lock contention surfaced** (R6 Bug #14) -- users now see concurrent write warnings
7. **Config schema validation** -- unknown/typo key detection in compress + health-check
8. **Test count +8** -- 58 total with security-focused additions

**Diminishing returns note:** The score increase from R6 to R7 (+0.29) is smaller than R4 to R6 (+2.14), which is expected. The codebase has matured past the point of major security gaps, and further improvements are incremental hardening. The remaining P3 issues represent defense-in-depth additions (tamper detection, audit trails) rather than security vulnerabilities.

---

**Report compiled by:** Security Engineer Persona (Round 7 Benchmark)
**Evaluation date:** 2026-02-15
**Version:** MemoryForge 1.7.0 (Waves 1-20 complete)
**Recommendation:** **ADOPT** -- Production-ready with minor hardening opportunities
