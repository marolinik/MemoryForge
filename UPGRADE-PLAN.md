# MemoryForge Upgrade Plan: 6/10 → 9/10

## Current Score: 7.56/10 (Round 2 benchmark average)
Strengths: compaction survival loop, zero deps, brownfield safety, MCP tools, progressive briefings
Weaknesses: keyword-only search, no tests/CI, config security, multi-byte bug, macOS compat

---

## Wave 1: MCP Memory Server (6/10 → 7.5/10)
**THE #1 GAP. Claude can't query or update memory mid-conversation.**

Create `scripts/mcp-memory-server.js`:
- Zero dependencies, pure Node.js
- Content-Length framed stdio transport (MCP standard)
- Finds .mind/ by walking up from cwd

6 tools:
1. `memory_status` — read STATE.md (no params)
2. `memory_search` — search all .mind/ files (query: string)
3. `memory_update_state` — rewrite STATE.md sections
4. `memory_save_decision` — append to DECISIONS.md
5. `memory_save_progress` — update PROGRESS.md checkboxes
6. `memory_save_session` — append to SESSION-LOG.md

Files to CREATE:
- [x] scripts/mcp-memory-server.js

Files to MODIFY:
- [x] .mcp.json — MCP server configuration (not settings.json — MCP uses separate file)
- [x] install.sh — wire MCP server path (project vs global) + uninstall cleanup
- [x] install.ps1 — same
- [x] scripts/merge-settings.js — N/A (MCP uses .mcp.json, not settings.json)
- [x] README.md — document MCP tools + updated install tree + uninstall docs

---

## Wave 2: Auto-Capture Hooks (7.5/10 → 8/10)
**Stop relying on manual .mind/ updates. Track work automatically.**

Enhance `stop-checkpoint.sh`:
- Track which files were modified since last check
- Write change list to .mind/.file-tracker
- Output brief change summary

Enhance `session-end.sh`:
- Read .file-tracker and git status
- Auto-generate session summary
- Append to SESSION-LOG.md if it wasn't updated this session

Files to MODIFY:
- [x] scripts/hooks/stop-checkpoint.sh — file change tracking via git
- [x] scripts/hooks/session-end.sh — auto session summary from .file-tracker
- [x] install.sh / install.ps1 — .gitignore + uninstall include .file-tracker

---

## Wave 3: Compression + Token Optimization (8/10 → 8.5/10)
**Keep .mind/ lean as projects grow.**

Create `scripts/compress-sessions.js`:
- Keep last 5 session entries full
- Summarize older entries to 1-2 lines each
- Archive old decisions (keep last 10 active)
- Report token savings

Enhance `session-start.sh`:
- Check total .mind/ size
- Auto-run compression if over 3000 tokens
- Smart extraction (recent = full, old = summary)

Files to CREATE:
- [x] scripts/compress-sessions.js

Files to MODIFY:
- [x] scripts/hooks/session-start.sh — auto-compress trigger when .mind/ > 12KB

---

## Wave 4: HTML Dashboard (8.5/10 → 9/10)
**Visualize project state in the browser.**

Create `scripts/dashboard.js`:
- Reads all .mind/ files
- Generates single static HTML file
- Clean layout: state, progress, decisions, session log
- Opens in default browser
- No server needed (all data embedded in HTML)

Files to CREATE:
- [x] scripts/dashboard.js

Files to MODIFY:
- [x] README.md — document dashboard + compression
- [x] install.sh / install.ps1 — .gitignore includes dashboard.html

---

## Wave 5: Security Hardening (post-audit)
**Fix P0 security issues found by 5-agent competitive audit.**

Harden `scripts/mcp-memory-server.js`:
- Path traversal protection via `safePath()` guard on all file operations
- Replace silent error handlers with `.mcp-errors.log` logging
- JSON schema validation (required field checks) before tool execution
- Tool call errors logged to `.mcp-errors.log`

Files to MODIFY:
- [x] scripts/mcp-memory-server.js — safePath(), logError(), input validation
- [x] install.sh / install.ps1 — .gitignore includes .mcp-errors.log

---

## Wave 6: README Rewrite (post-audit)
**Address Beginner (6.0) and Vibe Coder (5.7) feedback.**

Rewrite README.md:
- Shields.io badges (Zero Deps, Platform, MIT License)
- "What Is This?" section in plain English
- Before & After comparison (without vs with MemoryForge)
- First FAQ answers "Why do I need this?"
- Competitive analysis linked from docs

Files to MODIFY:
- [x] README.md — full rewrite with progressive disclosure structure

Files to CREATE:
- [x] docs/COMPETITIVE-ANALYSIS.md — 9-tool benchmark from 5 perspectives

---

## Wave 7: Growth Management (post-audit)
**Handle .mind/ growth at scale — task archival, tracking rotation, smarter compression.**

Enhance `scripts/compress-sessions.js`:
- Archive completed tasks older than 30 days from PROGRESS.md → ARCHIVE.md
- Rotate tracking files (.agent-activity, .task-completions, .session-tracking) to last 100 entries
- Smarter decision compression: keep rationale in 2-line format (title + "Why: ...")
- Unified report output covering all compression + archival + rotation

Files to MODIFY:
- [x] scripts/compress-sessions.js — archiveCompletedTasks(), rotateTrackingFile(), rationale preservation

---

## Wave 8: Configuration File (post-audit)
**Let users customize thresholds without editing hook scripts.**

Create `.memoryforge.config.js` template with all configurable thresholds.
Wire config loading into compress-sessions.js, session-start.sh, stop-checkpoint.sh.

Files to CREATE:
- [x] templates/memoryforge.config.js.template — all defaults documented

Files to MODIFY:
- [x] scripts/compress-sessions.js — load config, override defaults
- [x] scripts/hooks/session-start.sh — read compressThresholdBytes, briefing thresholds
- [x] scripts/hooks/stop-checkpoint.sh — read staleWarningSeconds
- [x] install.sh / install.ps1 — gitignore ARCHIVE.md + *.pre-compress

---

## Wave 9: Progressive Briefings (post-audit)
**Save context tokens on large projects with 2-layer briefing.**

Enhance `scripts/hooks/session-start.sh`:
- When .mind/ total > 8KB: compact briefing (STATE.md + in-progress + blocked only)
- When .mind/ total ≤ 8KB: full briefing (all files, current behavior)
- Post-compaction: always full briefing (need max context recovery)
- Compact mode includes MCP tool tip: "Use memory_search() for full details"

Files to MODIFY:
- [x] scripts/hooks/session-start.sh — progressive briefing logic

---

---

## Wave 10: Bug Fixes + Security Hardening (7.56/10 → 8.0/10)
**Fix all P1/P2 bugs and security issues found by Round 2 benchmark.**

Fix `scripts/mcp-memory-server.js`:
- Multi-byte Content-Length bug: use Buffer for parsing, not string substring
- `memory_update_state` preserve custom sections (merge, don't rebuild)
- Add input length limits (50KB cap on all string inputs)
- Switch config from `require()` (code execution) to `JSON.parse(readFileSync())`
- Fuzzy task completion matching in `memory_save_progress`

Fix `scripts/hooks/session-end.sh`:
- Replace `grep -oP` with POSIX-compatible alternative for macOS

Files to MODIFY:
- [x] scripts/mcp-memory-server.js — Buffer-based parsing, section preservation, input limits, fuzzy match
- [x] scripts/hooks/session-end.sh — POSIX-compatible session number extraction (awk)
- [x] templates/memoryforge.config.js.template → templates/memoryforge.config.json.template (rename)
- [x] scripts/compress-sessions.js — JSON config loading
- [x] scripts/hooks/session-start.sh — JSON config loading
- [x] scripts/hooks/stop-checkpoint.sh — JSON config loading
- [x] install.sh — N/A (config is user-copied, not installed by script)
- [x] install.ps1 — N/A (config is user-copied, not installed by script)
- [x] README.md — config docs update (.js → .json)

---

## Wave 11: Testing + CI (8.0/10 → 8.3/10)
**Add test suite and contributor infrastructure.**

Create test suite:
- Unit tests for MCP server (all 6 tools)
- Unit tests for compress-sessions.js (archival, rotation, compression)
- Hook chain integration test (session-start → pre-compact → session-start(compact))
- GitHub Actions CI (macOS + Linux + Windows)

Create contributor docs:
- CONTRIBUTING.md (dev setup, test running, PR process)
- SECURITY.md (reporting vulnerabilities, security design)
- CHANGELOG.md (retroactive for Waves 1-10)

Files to CREATE:
- [x] tests/mcp-server.test.js — MCP tool unit tests (19 tests)
- [x] tests/compress.test.js — compression/archival unit tests (9 tests)
- [ ] tests/hooks.test.js — hook chain integration tests (deferred — hooks are bash, tested manually)
- [x] .github/workflows/ci.yml — GitHub Actions (3 OS x 3 Node versions + lint)
- [x] CONTRIBUTING.md
- [x] SECURITY.md
- [x] CHANGELOG.md (retroactive Waves 1-11)

---

## Wave 12: Semantic Search (8.3/10 → 8.7/10)
**Vector memory extension for meaning-based search.**

Create `scripts/vector-memory.js`:
- TF-IDF based semantic search (zero dependencies)
- Index .mind/ files on session start
- Hybrid search: keyword results + semantic results
- `memory_search` upgrade: falls back to keyword when vector unavailable

Files to CREATE:
- [x] scripts/vector-memory.js — TF-IDF indexer + search + chunking + CLI
- [ ] scripts/extensions/vector-search-server.js — MCP server extension (deferred — integrated directly)
- [x] tests/vector-memory.test.js — 14 tests for tokenization, stemming, indexing, search, chunking

Files to MODIFY:
- [x] scripts/mcp-memory-server.js — hybrid search in memory_search (auto-fallback to keyword)
- [ ] install.sh / install.ps1 — --with-vector flag wiring (N/A — vector memory is auto-detected)

---

## Wave 13: Marketing + Demo (8.7/10 → 9.0/10)
**Visual proof, landing page, templates.**

Create marketing assets:
- Demo GIF/terminal recording showing before/after compaction survival
- GitHub Pages landing site
- Template .mind/ files for common project types (web app, CLI, library)
- Cross-project fleet dashboard

Files to CREATE:
- [ ] docs/demo.gif or docs/demo.svg (terminal recording — deferred, needs asciinema)
- [x] templates/mind-web-app/ — starter .mind/ for web projects (4 files)
- [x] templates/mind-cli/ — starter .mind/ for CLI projects (4 files)
- [x] templates/mind-library/ — starter .mind/ for libraries (4 files)
- [x] scripts/fleet-dashboard.js — multi-project overview dashboard

Files to MODIFY:
- [x] README.md — semantic search, fleet dashboard, templates, testing section, docs table

---

## Wave 14: Security Hardening II (7.31/10 → 7.8/10)
**Fix all 10 bugs found in Round 3 benchmark.**

- [x] Fix P1: Install script command injection — pass paths via env vars, not string interpolation
- [x] Fix P1: Add MAX_MESSAGE_SIZE (10MB) cap on rawBuffer in MCP server
- [x] Fix P2: Escape regex special chars in section parameter
- [x] Fix P2: Write real path traversal tests (2 tests)
- [x] Fix P2: `wc -c` whitespace padding on Git Bash — add `tr -d ' '`
- [x] Fix P2: Stemmer over-stripping — increase min remaining length to 4
- [x] Fix P2: `compress-sessions.js` require.main guard + module.exports
- [x] Fix P3: MCP server version stale → 1.4.0
- [x] Fix P3: .pre-compress backup cleanup (keep last 3)
- [x] Fix P3: Config values bounds-checked with Math.max() clamping
- [x] Add shellcheck to CI

---

## Wave 15: Performance + Caching (7.8/10 → 8.2/10)
**Cache TF-IDF index, optimize per-prompt hook.**

- [x] Cache TF-IDF index in-process keyed on file mtimes (getCachedIndex)
- [x] Optimize user-prompt-context hook — cache output, skip regeneration when STATE.md unchanged
- [x] Fix stemmer over-stripping — DONE in Wave 14
- [x] Add require.main guard to compress-sessions.js — DONE in Wave 14

---

## Wave 16: Operational Maturity (8.2/10 → 8.6/10)
**Version tracking, health-check, operational polish.**

- [x] Version tracking: .memoryforge-version file written on install
- [x] Upgrade detection in install.sh / install.ps1
- [x] Health-check CLI (scripts/health-check.js) — structured JSON diagnostics
- [x] .mcp-errors.log rotation in session-start.sh (keeps under 100KB)
- [x] .pre-compress backup cleanup — DONE in Wave 14

---

## Wave 17: Polish + Examples (8.6/10 → 9.0/10)
**Example files, README polish, integration tests.**

- [x] Filled-in example .mind/ showing mid-project state (templates/mind-example/)
- [x] Define "MCP (Model Context Protocol)" on first use in README
- [x] Hook integration tests (tests/hooks.test.js) — 7 tests, full lifecycle
- [x] Update README: test count (50), health-check docs, example docs, shellcheck mention
- [ ] Demo GIF/terminal recording (deferred — needs asciinema)

---

## Wave 18: Round 4 Bug Fixes — 14 bugs (1 P1, 5 P2, 8 P3)
**Fix all bugs from Round 4 benchmark (5 persona evaluation).**

- [x] P1: Shell injection — pass config paths via process.env in session-start.sh, stop-checkpoint.sh
- [x] P2: extractSection() ReDoS — escape heading parameter in regex
- [x] P2: hooks.test.js added to CI pipeline
- [x] P2: hybridSearch TOCTOU — use indexed chunk text, not disk re-reads
- [x] P2: Atomic writes — writeMindFile uses tmp+rename pattern
- [x] P3: Stemmer asymmetry — de-duplicate trailing consonants (running→run matches run)
- [x] P3: Stale warning message now uses configured staleWarningSeconds
- [x] P3: grep fragility — use grep -A 3 with blank-line filtering
- [x] P3: stat comparison safety — validate numeric before -ge
- [x] P3: README discloses Node.js prerequisite
- [x] P3: Both installers check for Node.js before proceeding
- [x] P3: Fleet dashboard recursive size calculation
- [x] P3: Checkpoint creation debounce (5s)
- [x] P3: subagent-stop.sh optimized to 1 Node invocation (was 3)

---

## Wave 19: Round 5 Bug Fixes — 19 bugs (6 P2, 13 P3)
**Fix all bugs from Round 5 benchmark (fixed 5-persona evaluation).**

- [x] P2: Advisory file locking — .mind/.write-lock with exclusive creation + stale detection
- [x] P2: Tracking file rotation in session-start.sh (agent-activity, task-completions, session-tracking)
- [x] P2: Config validation hardened — reject compressThresholdBytes=0, use Number.isSafeInteger()
- [x] P2: extractSection() heading length limit (200 chars) for defense-in-depth
- [x] P2: Fleet dashboard stale project warnings (>7 days)
- [x] P2: Health-check watch/daemon mode (--watch, --interval, exit codes)
- [x] P3: health-check.js version 1.4.0 → 1.6.0
- [x] P3: README bash/Git Bash for Windows documentation
- [x] P3: stat output numeric validation in stop-checkpoint.sh and session-end.sh
- [x] P3: Error log rotation tail -c → tail -n (UTF-8 safety)
- [x] P3: Config extreme values checked with Number.isSafeInteger()
- [x] P3: buildIndex() file size limit (>10MB skipped)
- [x] P3: chunkFile() empty file handling
- [x] P3: Dashboard auto-open error messages with file:// URL and tips
- [x] P3: Config template _comment removed (non-standard JSON)
- [x] P3: Uninstall confirmation prompt
- [x] P3: Checkpoint rotation configurable via maxCheckpointFiles
- [x] P3: TROUBLESHOOTING blank-line contradiction clarified
- [x] P3: Symlink check on config load (4 scripts)

---

## Wave 20: Validation & Testing (8.55 → 8.8 target)
**Fix validation gaps and add security/boundary tests from R6 benchmark.**

- [x] Config schema validation — reject unknown/typo keys with known-key set (Bug #22)
- [x] Per-field length limits (5KB) on MCP tool string parameters (Bug #12)
- [x] Surface lock contention to user as MCP tool warning (Bug #4)
- [x] Add concurrency test for advisory locking — spawn 2 servers (Bug #18)
- [x] Add symlink config attack test in health-check (Bug #19)
- [x] Add checkpoint rotation boundary test (Bug #23)
- [x] Promote shellcheck to `-S error` in CI (Bug #15)
- [x] health-check.js Number.isSafeInteger() consistency (Bug #14)

---

## Wave 21: Quick Fixes & Interactive Installer (8.76 → 8.9+ target)
**Fix all 3 P2 bugs from R7, high-value P3 bugs, and solve the non-technical installer barrier.**

- [x] P2: Installer version mismatch — install.sh and install.ps1 report 1.7.0
- [x] P2: appendMindFile atomic — read+append+tmp+rename pattern
- [x] P2: session-start.sh inline Node config loader symlink check (lstatSync)
- [x] P3: Extract KNOWN_CONFIG_KEYS to shared scripts/config-keys.js module
- [x] P3: Add .write-lock to .gitignore and install.sh ENTRIES
- [x] P3: Per-field limit uses Buffer.byteLength (bytes) instead of .length (chars)
- [x] P3: withContentionWarning guards against empty content array
- [x] Interactive setup.js — single-command guided installer for non-technical users

---

## Wave 22: R8 Bug Fixes & Installer Completeness (8.89 → 9.0+ target)
**Fix all P2 and P3 bugs from R8, improve installer robustness.**

- [x] P2: Installers copy all supporting scripts (compress, config-keys, health-check)
- [x] P2: health-check.js watch mode uses execFileSync (no shell injection)
- [x] P3: task-completed.sh consolidated to single Node invocation
- [x] P3: setup.js --help, --dry-run, clone-dir warning
- [x] P3: install.ps1 .gitignore entries add .write-lock
- [x] P3: dashboard.js currentPhase XSS escape
- [x] P3: MCP server total input limit uses Buffer.byteLength
- [x] P3: TROUBLESHOOTING.md setup.js section

---

## Wave 23: R9 Consensus Fixes & Hardening (8.97 → 9.0+ target)
**Fix all consensus P3 bugs from R9 (4+ personas), plus high-value single-persona fixes.**

- [x] Browser-open shell injection: dashboard.js + fleet-dashboard.js use execFile/execFileSync
- [x] fleet-dashboard.js calcDirSize skips symlinks (lstatSync)
- [x] compress-sessions.js: all writes atomic (tmp+rename pattern)
- [x] setup.js dry-run: dryInfo arity fix, success() guarded, chmod uses fs.chmodSync
- [x] readMindFile symlink check (lstatSync) in MCP server
- [x] logError 512KB size cap in MCP server
- [x] install.ps1: -Help flag + uninstall confirmation prompt
- [x] health-check.js: --interval arg parsing fix + watch JSON delimiter
- [x] subagent-start.sh consolidated to single Node invocation
- [x] session-start.sh: -- separator before positional arg
- [x] CI lint: add config-keys.js and setup.js to node --check
- [x] Repo .gitignore synced with installer entries
- [x] TROUBLESHOOTING.md: Node version 14+ → 18+
- [x] README: CHANGELOG description "Waves 1-13" → "Waves 1-23"

---

## Execution Order
Wave 1 → Wave 2 → Wave 3 → Wave 4 → Wave 5 → Wave 6 → Wave 7 → Wave 8 → Wave 9 (all complete)
Wave 10 → Wave 11 → Wave 12 → Wave 13 (all complete)
Wave 14 → Wave 15 → Wave 16 → Wave 17 (all complete)
Wave 18 (all complete)
Wave 19 (all complete)
Wave 20 (all complete)
Wave 21 (all complete)
Wave 22 (all complete)
Wave 23 (all complete)
