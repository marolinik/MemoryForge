# MemoryForge Benchmark Round 5: Security Engineer

**PERSONA:** Security Engineer (10% of market)
**VERDICT:** Conditional — Strong foundations with addressable hardening gaps. Safe for internal/personal use. Needs several P2 fixes before org-wide rollout.

---

## SCORES

**D1 Supply Chain: 9/10** — Zero dependencies (Node.js stdlib only), no package.json, no npm install, no build toolchain. Shell/PS1 installers are transparent bash/PowerShell. Minor: No dependency pinning for Node.js version itself, relies on user having Node 18+.

**D2 Input Validation: 7/10** — Good validation on most paths: 50KB input size limit (line 27 mcp-memory-server.js), required field validation (lines 586-600), Content-Length size cap (10MB, line 650). Missing: no max length on individual string fields (e.g., status/phase), no character whitelist/blacklist for file content, numeric bounds checking relies on clamping rather than rejection.

**D3 Injection Safety: 8/10** — Strong path traversal protection via safePath() (lines 61-68 mcp-memory-server.js), atomic writes prevent TOCTOU (lines 82-86), regex escaping for user input in memorySaveProgress (line 337). Gaps: hooks use shell interpolation with quoted paths but no explicit sanitization of CLAUDE_PROJECT_DIR, no ReDoS protection on user-supplied regex patterns in search, command injection possible via config file if user edits .memoryforge.config.json with malicious Node code (eval risk).

**D4 Data Handling: 9/10** — Excellent data locality (.mind/ always project-scoped), no external service calls, cross-project isolation via CLAUDE_PROJECT_DIR env var. .gitignore covers all generated files (lines 1-6 .gitignore). No secrets in defaults. Minor: .mcp-errors.log could leak sensitive error messages if verbose Node errors contain paths/env vars.

**D5 Config Security: 6/10** — Config validation exists (health-check.js lines 54-79) but only warns, doesn't enforce. Numeric clamping in compress-sessions.js (lines 48-51) prevents arithmetic overflow but silently coerces invalid values. No symlink resistance when loading .memoryforge.config.json. JSON.parse without schema validation allows arbitrary properties. Config threshold for compression could be set to 0 to disable compression silently.

**D6 CI & Testing: 8/10** — Strong test suite (27 tests in mcp-server.test.js alone), tests path traversal (lines 346-385), multi-byte Unicode (line 388), oversized input (line 333). CI matrix covers 3 OS × 3 Node versions = 9 combinations. Shellcheck linting enabled. Gaps: no SAST tooling (CodeQL, Semgrep), hooks not tested in CI (only unit tests for Node scripts), no test coverage metrics.

**D7 Audit & Logging: 5/10** — Error logging to .mcp-errors.log (lines 675-686 mcp-memory-server.js), uncaught exceptions logged, session tracking files exist. Major gaps: no structured logging (just plaintext append), no log rotation on .session-tracking/.agent-activity (unbounded growth), no tamper detection/signing, error log rotation only in session-start hook (reactive, not preventive), no audit trail for who modified .mind/ files (git-dependent).

**AVERAGE: 7.4/10**

---

## STRENGTHS

- **Zero supply chain attack surface:** No npm dependencies, no build step, pure Node.js stdlib. Installer scripts are readable bash/PowerShell with no obfuscation.
- **Path traversal hardening:** Consistent use of safePath() with path.resolve() + prefix validation prevents escaping .mind/ directory.
- **Atomic writes with TOCTOU mitigation:** All file writes use temp file + rename pattern (mcp-memory-server.js line 83-85).
- **Input size bounds:** 50KB per tool call, 10MB Content-Length cap prevents OOM/disk exhaustion attacks.
- **Comprehensive test coverage of security-critical paths:** 27 tests include path traversal (2 tests), oversized input, multi-byte handling, unknown tool/method errors.
- **Cross-platform CI validation:** Tests run on Ubuntu/macOS/Windows with Node 18/20/22 — catches platform-specific shell injection vectors.
- **Clean .gitignore:** All generated/tracking files excluded from VCS, no hardcoded secrets in templates.

---

## GAPS

- **No structured logging:** Error logs are plaintext appends, making SIEM integration difficult. No JSON-formatted logs for parsing.
- **Unbounded log growth on tracking files:** .agent-activity, .task-completions, .session-tracking have no rotation — can grow indefinitely (mitigated for .mcp-errors.log in session-start.sh line 36-42, but not for others).
- **Config validation is permissive:** health-check.js warns about invalid config but doesn't block usage. User can set negative/zero values that break compression.
- **No SAST in CI:** No automated code scanning (CodeQL, Semgrep, or similar) to catch regex injection, command injection in hooks.
- **Hooks not integration-tested:** CI only runs unit tests on Node scripts. Hook scripts (bash) are shellcheck-linted but not executed in a sandbox.
- **Regex injection risk in memory_search:** User-supplied queries are lowercased and used in string matching, but if vector-memory.js TF-IDF path fails, the keyword fallback uses query.toLowerCase().includes() which is safe. However, extractSection() uses user input in RegExp constructor (line 385 mcp-memory-server.js, line 337 for section name) — potential ReDoS if user sends crafted section names.
- **Shell interpolation in hooks:** While paths are quoted, CLAUDE_PROJECT_DIR is user-controlled (env var) and directly interpolated in .claude/settings.json hook commands (line 9 settings.json). If an attacker controls this env var, they could inject shell commands. Mitigation: Claude Code likely sanitizes this, but MemoryForge doesn't validate it.

---

## BUGS

| # | Severity | Bug Description | File:Line |
|---|----------|----------------|-----------|
| 1 | **P2** | **Regex injection / ReDoS risk** — extractSection() and memorySaveProgress() use user-controlled input in RegExp constructor without escaping (e.g., section name from args). Escaped in memorySaveProgress line 337 but not in extractSection line 385. Attacker could send `section: "(a+)+b"` to cause catastrophic backtracking. | mcp-memory-server.js:385, compress-sessions.js:216 |
| 2 | **P2** | **Unbounded log file growth** — .agent-activity, .task-completions, .session-tracking have no rotation. A long-running project could accumulate MB of logs, consuming disk. Only .mcp-errors.log is rotated (session-start.sh:36-42). | stop-checkpoint.sh:26, session-end.sh:31, subagent-*.sh (implied) |
| 3 | **P2** | **Config arithmetic injection** — User can set `compressThresholdBytes: 0` or negative values. While compress-sessions.js clamps to minimums (line 48-51), health-check.js only warns. A value of 0 would disable compression entirely, causing unbounded .mind/ growth. | compress-sessions.js:48-51, health-check.js:60-72 |
| 4 | **P2** | **Shell command injection vector (theoretical)** — Hook commands in settings.json use `"$CLAUDE_PROJECT_DIR/scripts/hooks/..."` which interpolates env var directly. If attacker controls CLAUDE_PROJECT_DIR (e.g., `; rm -rf / #`), they could inject shell commands. Mitigated by quoting, but not sanitized. | .claude/settings.json:9, 21, 33, 45, 57, 69, 81, 93 |
| 5 | **P3** | **No symlink validation on config load** — When loading .memoryforge.config.json, fs.readFileSync follows symlinks. Attacker could symlink config to /etc/passwd to cause parsing errors or leak file contents via error messages. | compress-sessions.js:38-40, session-start.sh:48-54 |
| 6 | **P3** | **Error log could leak sensitive paths** — .mcp-errors.log records full stack traces including file paths. If project path contains username or sensitive info, it's logged plaintext. | mcp-memory-server.js:677-680 |
| 7 | **P3** | **Checkpoint pruning race condition** — pre-compact.sh prunes old checkpoints (line 109-118) without locking. Concurrent compaction events could cause file deletion race. Unlikely in practice (single-user tool). | pre-compact.sh:109-118 |
| 8 | **P3** | **Stale cache staleness check fails silently** — user-prompt-context.sh uses stat for mtime comparison (line 38-44), but if stat fails or returns non-numeric, it defaults to 0 and uses stale cache. Should log warning. | user-prompt-context.sh:38-48 |
| 9 | **P3** | **.pre-compress backups accumulate unbounded** — compress-sessions.js creates .pre-compress backups but only cleanup logic is in compress-sessions.js itself (lines 335-355). If user never runs compression manually, backups could accumulate. Fixed in compress-sessions.js but not enforced. | compress-sessions.js:160, 244, 301 (creates), 335-355 (cleanup) |
| 10 | **P3** | **Config numeric validation could be stricter** — compress.js clamps invalid config to minimums (line 48-51) instead of rejecting. A config of `keepSessionsFull: "hello"` becomes 1 silently. Should error or warn. | compress-sessions.js:48-51 |

---

## DETAILED ANALYSIS BY DIMENSION

### D1: Supply Chain (9/10)

**Strengths:**
- Zero npm dependencies — entire codebase is pure Node.js stdlib (fs, path, child_process)
- No package.json, no node_modules, no build step
- Installer scripts are transparent bash/PowerShell (install.sh 805 lines, install.ps1 743 lines — long but readable)
- No external service calls (no telemetry, no update checks, no CDN dependencies)
- MCP server and all tools are single-file zero-dependency scripts

**Gaps:**
- Node.js version not pinned — relies on user having Node 18+ (install.sh line 43-46 warns but doesn't block)
- No integrity checking of downloaded files (install script assumes local filesystem copy, not curl/wget)
- CI doesn't test with frozen Node versions (matrix uses 18/20/22 but pulls latest patch)

**Verdict:** Best-in-class for a developer tool. Only improvement would be pinning Node.js version in CI and providing integrity hashes for release artifacts.

---

### D2: Input Validation (7/10)

**Strengths:**
- Per-tool input size limit: 50KB (mcp-memory-server.js:27, enforced line 573)
- Content-Length cap: 10MB to prevent OOM (line 650)
- Required field validation: checks inputSchema.required (lines 586-600)
- Numeric bounds: compress-sessions.js clamps config values to sane minimums (lines 48-51)

**Gaps:**
- No max length on individual string fields (e.g., `status`, `phase`, `task` can be 50KB each)
- No character whitelist — allows any Unicode in markdown files (could break downstream tools)
- No validation of config file structure beyond JSON parsing (allows arbitrary properties)
- Fuzzy task matching uses unconstrained .includes() (could match unintended tasks if query is too generic)

**Recommendations:**
- Add per-field max lengths (e.g., 5KB for status, 10KB for decision rationale)
- Validate config against JSON schema (reject unknown properties)
- Add character class validation for critical fields (e.g., phase should be alphanumeric + basic punctuation)

---

### D3: Injection Safety (8/10)

**Strengths:**
- **Path traversal blocked:** safePath() validates all file operations stay within .mind/ (lines 61-68)
- **Atomic writes prevent TOCTOU:** temp file + rename pattern (lines 82-86)
- **Regex escaping:** memorySaveProgress escapes section name for regex (line 337)
- **No direct eval/Function() calls** in entire codebase
- **Shell quoting:** All hook commands quote paths with double quotes (.claude/settings.json)

**Gaps:**
- **ReDoS risk:** extractSection() uses user input in RegExp without escaping (line 385). Also in compress-sessions.js line 216.
- **Command injection (theoretical):** CLAUDE_PROJECT_DIR env var is interpolated in hook commands. While quoted, no validation that it doesn't contain `"` or `$()` metacharacters.
- **Symlink following:** Config loading doesn't check if .memoryforge.config.json is a symlink (could read /etc/passwd)
- **No input sanitization on file content:** User can write any markdown to .mind/ files (could inject markdown payloads for downstream renderers)

**Critical Fix Needed (Bug #1):**
Replace `new RegExp(\`## ${escapedHeading}\\s*\\n\`, 'i')` with pre-escaped version or use string methods instead of regex.

---

### D4: Data Handling (9/10)

**Strengths:**
- **Project-scoped data:** .mind/ always created relative to CLAUDE_PROJECT_DIR (mcp-memory-server.js:34, hooks use PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}")
- **No cloud storage:** All data is local filesystem
- **No external API calls:** MCP server has zero network I/O
- **.gitignore coverage:** All sensitive tracking files excluded (lines 1-6 of .gitignore)
- **No hardcoded credentials:** Templates contain no API keys or secrets
- **Atomic writes:** Prevents partial state corruption

**Gaps:**
- **.mcp-errors.log could leak paths:** Error stack traces include full file paths (line 679). If project path contains `~/username/secret-project/`, it's logged.
- **No encryption at rest:** .mind/ files are plaintext (expected for this use case, but worth noting)
- **Session log could contain sensitive data:** SESSION-LOG.md auto-capture lists changed files (session-end.sh:59) — could expose private file names

**Recommendation:**
- Add option to redact paths in error logs (replace with `<project-root>/...`)
- Document that .mind/ should be excluded from public repos (already in .gitignore but should be in security docs)

---

### D5: Config Security (6/10)

**Strengths:**
- Config validation exists in health-check.js (lines 60-72)
- Bounds checking prevents extreme values (compress-sessions.js lines 48-51)
- Config is JSON (no code execution like YAML anchors or TOML exec)

**Gaps (Bug #3, #5, #10):**
- **Validation only warns:** health-check.js reports issues but doesn't block execution
- **Arithmetic injection:** User can set `compressThresholdBytes: 0` to disable compression entirely
- **Symlink attack:** Config loader follows symlinks without validation
- **Silent coercion:** Invalid numeric values are clamped rather than rejected (e.g., `"hello"` becomes 1)
- **No schema enforcement:** Arbitrary properties in config are ignored but not flagged
- **Config file permissions not checked:** Doesn't verify config is user-owned (could be world-writable)

**Critical Fix Needed (Bug #3):**
Reject invalid config values instead of clamping. Add schema validation (e.g., using JSON Schema or manual property whitelist).

---

### D6: CI & Testing (8/10)

**Strengths:**
- **Platform matrix:** Tests run on Ubuntu/macOS/Windows with Node 18/20/22 (9 combinations, .github/workflows/ci.yml:12-14)
- **Security-focused tests:** Path traversal (mcp-server.test.js:346-385), oversized input (line 333), multi-byte Unicode (line 388)
- **Shellcheck linting:** All bash scripts are shellcheck-validated (ci.yml:70)
- **Syntax validation:** All Node scripts checked with `node --check` (ci.yml:50-56)
- **Zero external dependencies in tests:** Tests use Node stdlib only (no Mocha/Jest)

**Gaps:**
- **No SAST:** No CodeQL, Semgrep, or similar automated security scanning
- **Hooks not integration-tested:** session-start.sh, pre-compact.sh etc. are linted but not executed in CI
- **No coverage metrics:** Can't verify that security-critical paths (safePath, input validation) are 100% covered
- **No fuzz testing:** Input validation would benefit from fuzz testing (random/malformed inputs)
- **No secrets scanning:** No check for accidentally committed API keys (low risk given no secrets in codebase)

**Recommendation:**
- Add CodeQL workflow for automated vulnerability scanning
- Add integration tests that spawn hooks in a Docker container
- Add test coverage reporting (nyc/c8) with minimum threshold

---

### D7: Audit & Logging (5/10)

**Strengths:**
- **Error logging:** .mcp-errors.log captures uncaught exceptions (mcp-memory-server.js:675-686)
- **Session tracking:** .session-tracking records session start/end timestamps (session-end.sh:31)
- **Activity tracking:** .agent-activity, .task-completions log agent events
- **File change tracking:** .file-tracker records modified files per session (stop-checkpoint.sh:42-71)

**Gaps (Bug #2, #6, #7):**
- **No structured logging:** All logs are plaintext appends, no JSON/CEF format for SIEM ingestion
- **Unbounded log growth:** .agent-activity, .task-completions, .session-tracking have no rotation (Bug #2)
- **No tamper detection:** Logs are plaintext files, anyone with filesystem access can modify them
- **No audit trail for .mind/ changes:** Can't track who modified STATE.md unless project is in git
- **Error log rotation is reactive:** Only rotated when session-start hook fires (line 36-42), not proactive
- **No log level filtering:** Everything is logged at same verbosity
- **No centralized logging:** Each script writes to separate files (error log, session tracking, file tracker)

**Critical Fix Needed (Bug #2):**
Add rotation to all tracking files. compress-sessions.js rotates tracking files (lines 311-330) but only when called. Should be automatic in each hook.

**Recommendation:**
- Implement structured JSON logging with severity levels
- Add log signing/hashing for tamper detection
- Provide log aggregation script (combine all .mind/ logs into single timestamped stream)
- Add configurable log retention policy (default: keep last 30 days)

---

## RISK ASSESSMENT

**Critical (P1):** None — no data loss or RCE vulnerabilities in normal use
**High (P2):** 4 bugs — ReDoS, unbounded logs, config injection, shell command injection (theoretical)
**Medium (P3):** 6 bugs — symlink attacks, error log leaks, race conditions, silent failures

**Overall Risk:** **Medium-Low** for personal/team use, **Medium** for org-wide deployment

---

## REMEDIATION ROADMAP

**Before org-wide rollout (must-fix P2 bugs):**

1. **Fix Bug #1 (ReDoS):** Escape all user input in RegExp constructors
   - Lines: mcp-memory-server.js:385, compress-sessions.js:216
   - Add: `function escapeRegex(str) { return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }`
   - Use in extractSection() before `new RegExp()`

2. **Fix Bug #2 (Log rotation):** Add rotation to all tracking files
   - Update stop-checkpoint.sh, session-end.sh, subagent-*.sh to call rotateTrackingFile() from compress-sessions.js
   - OR: Add a shared rotate.sh hook that runs on SessionStart

3. **Fix Bug #3 (Config validation):** Reject invalid config instead of silent coercion
   - Update compress-sessions.js to throw error if config values are out of bounds
   - Add JSON schema validation or manual property whitelist

4. **Fix Bug #4 (Shell injection):** Sanitize CLAUDE_PROJECT_DIR before use in hooks
   - Add validation in session-start.sh: `[[ "$CLAUDE_PROJECT_DIR" =~ ^[a-zA-Z0-9/_.-]+$ ]] || exit 1`
   - OR: Escape quotes in settings.json: `command: "bash \"$(printf %q \"$CLAUDE_PROJECT_DIR\")/scripts/hooks/...\"`

**Nice-to-have (P3 bugs, can defer):**

5. Add SAST to CI (CodeQL or Semgrep)
6. Add structured logging (JSON format)
7. Add hook integration tests
8. Document security assumptions in SECURITY.md

---

## CONCLUSION

MemoryForge demonstrates **strong security fundamentals** for a developer tool:
- Zero supply chain risk (no dependencies)
- Robust path traversal protection
- Atomic writes prevent corruption
- Comprehensive test coverage of security paths

However, **four P2 bugs** block org-wide deployment:
1. ReDoS risk in regex construction
2. Unbounded log file growth
3. Config validation too permissive
4. Theoretical shell command injection

**Recommendation:** Fix P2 bugs, add SAST to CI, then approve for org-wide rollout. Current state is **safe for personal/team use** but needs hardening for enterprise.

**Timeline estimate:** 2-3 days to fix all P2 bugs + add tests. 1 week to add SAST + integration tests + structured logging.
