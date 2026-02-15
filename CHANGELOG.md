# Changelog

All notable changes to MemoryForge are documented here.

## [2.0.0] - 2026-02-16

### Breaking Changes — Lean Rewrite

MemoryForge v2.0 is a **subtraction release**: fewer hooks, fewer config keys, fewer scripts.
The core value — the compaction survival loop — is unchanged.

**Hooks: 8 → 3**
- Kept: `session-start.sh`, `pre-compact.sh`, `session-end.sh`
- Removed: `user-prompt-context.sh`, `stop-checkpoint.sh`, `subagent-start.sh`, `subagent-stop.sh`, `task-completed.sh`
- `session-end.sh` now absorbs stop-checkpoint functionality (`.last-activity` timestamp, file change tracking)

**Config keys: 10 → 3**
- Kept: `keepSessionsFull`, `keepDecisionsFull`, `archiveAfterDays`
- Removed keys are hardcoded to their defaults: `trackingMaxLines=100`, `compressThresholdBytes=12000`, `sessionLogTailLines=20`, `briefingRecentDecisions=5`, `briefingMaxProgressLines=40`, `maxCheckpointFiles=10`, `staleWarningSeconds=1800`

**Deleted scripts:**
- `scripts/vector-memory.js` — TF-IDF semantic search (keyword search remains in MCP server)
- `scripts/dashboard.js` — HTML dashboard
- `scripts/fleet-dashboard.js` — Multi-project overview
- `scripts/health-check.js` — Diagnostic CLI
- `scripts/detect-existing.js` — Competitor detection
- `scripts/merge-settings.js` — Settings merge helper (inlined into installers)

**Deleted features:**
- Extensions system (`--with-team`, `--with-vector`, `--with-graph`, `--full` flags removed)
- Project templates (`templates/mind-cli/`, `mind-library/`, `mind-web-app/`)
- Benchmark documentation

**Installer simplification:**
- `install.sh`, `install.ps1`, `setup.js` rewritten — fewer flags, inline settings merge
- Extension selection prompts removed from `setup.js`

**Tests: 4 suites → 3**
- Removed: `tests/vector-memory.test.js`
- Remaining: `mcp-server.test.js`, `compress.test.js`, `hooks.test.js`

## [1.9.0] - 2026-02-15

### Wave 23: R9 Consensus Fixes & Hardening (17 items)
- **Browser-open shell injection fixed** — dashboard.js and fleet-dashboard.js now use `execFile`/
  `execFileSync` instead of `exec`/`execSync` with shell-interpolated paths. No more shell metacharacter
  risk in directory names. Fleet-dashboard calcDirSize also skips symlinks via `lstatSync`.
- **compress-sessions.js writes now atomic** — all 4 write paths use tmp+rename pattern, matching the
  MCP server. Prevents partial content on crash during compression.
- **setup.js dry-run leaks fixed** — `dryInfo()` called with correct single-arg signature, `success()`
  only prints when actually writing, version file already guarded. chmod now uses `fs.chmodSync`
  instead of shell-based `execSync`.
- **readMindFile symlink check** — MCP server now rejects symlinks inside `.mind/` via `lstatSync`,
  preventing symlink-based data exfiltration.
- **logError size cap** — MCP error log capped at 512KB per session to prevent unbounded growth.
- **install.ps1 -Help flag and uninstall confirmation** — parity with install.sh.
- **health-check.js --interval arg parsing fixed** — bare numeric value after `--interval` now
  correctly filtered from child process args. Watch mode outputs JSON with newline delimiter.
- **subagent-start.sh consolidated** — reduced from 3 operations (Node + cut + echo) to 1 Node
  invocation, matching task-completed.sh and subagent-stop.sh patterns.
- **session-start.sh `--` separator** — defensive positional arg handling for compress invocation.
- **CI lint expanded** — `node --check` now covers config-keys.js and setup.js.
- **Repo .gitignore synced** — now includes all entries that installers add to target projects.
- **TROUBLESHOOTING.md Node version fixed** — changed from 14+ to 18+ to match README and setup.js.
- **README CHANGELOG description updated** — "Waves 1-13" → "Waves 1-23".

## [1.8.1] - 2026-02-15

### Wave 22: R8 Bug Fixes & Installer Completeness (6 items)
- **[P2] Installers copy all supporting scripts** — install.sh, install.ps1, and setup.js now copy
  compress-sessions.js, config-keys.js, health-check.js alongside the MCP server. Previously only
  mcp-memory-server.js was copied, breaking health-check and compression in installed projects.
- **[P2] health-check.js watch mode injection fixed** — replaced `execSync` with `execFileSync` to
  prevent command injection via crafted `--interval` arguments.
- **[P3] task-completed.sh consolidated** — reduced from 4 Node invocations to 1 for performance.
- **[P3] setup.js --help and --dry-run** — preview installation without writing files; clone-dir
  detection warns when running inside the MemoryForge repo instead of a target project.
- **[P3] install.ps1 .gitignore entries** — added `.mind/.write-lock` to match install.sh and .gitignore.
- **[P3] dashboard.js XSS fix** — `currentPhase` now HTML-escaped before interpolation into dashboard.
- **[P3] MCP server input size uses Buffer.byteLength** — total input limit now measured in bytes,
  matching the per-field limit. Consistent multi-byte handling.
- **[P3] TROUBLESHOOTING.md** — added setup.js section (issue #9).

## [1.8.0] - 2026-02-15

### Wave 21: Quick Fixes & Interactive Installer (8 items)
- **[P2] Installer version mismatch fixed** — install.sh and install.ps1 now report 1.7.0 (was 1.6.0).
- **[P2] appendMindFile now atomic** — uses read+append+tmp+rename pattern matching writeMindFile.
  Prevents partial content on crash during append operations.
- **[P2] session-start.sh symlink check** — inline Node config loader now uses `fs.lstatSync()` to
  reject symlinked config files, matching all other config loaders.
- **[P3] KNOWN_CONFIG_KEYS extracted to shared module** — `scripts/config-keys.js` is the single
  source of truth, imported by both health-check.js and compress-sessions.js.
- **[P3] .write-lock added to .gitignore** — advisory lock file no longer tracked by git.
- **[P3] Per-field limit uses Buffer.byteLength** — correctly measures bytes, not chars, for multi-byte
  character safety (e.g., CJK text, emoji).
- **[P3] withContentionWarning defensive check** — guards against empty/missing content array.
- **Interactive setup.js installer** — `node setup.js` provides a guided, interactive experience
  for non-technical users. Single command, prompts for project directory, install mode selection,
  optional config customization, clear progress indicators, and plain-language explanations.

## [1.7.0] - 2026-02-15

### Wave 20: Validation & Testing (8 items)
- **Config schema validation** — all scripts that load config now validate keys against a known
  set. Unknown/typo keys are reported as warnings in `health-check.js` and to stderr in
  `compress-sessions.js`. Catches common mistakes like `keepDecisiosnFull` (typo).
- **Per-field length limits** — MCP tool string parameters now capped at 5KB per field (in addition
  to the 50KB total input limit). Prevents a single field from consuming the entire budget.
- **Lock contention surfaced to user** — when advisory lock acquisition fails, MCP tool responses
  now include a warning message instead of proceeding silently. Users/agents can see when concurrent
  access was detected.
- **Concurrency test** — new test spawns 2 MCP servers writing to the same `.mind/` directory
  concurrently, verifying no data corruption and graceful contention handling.
- **Symlink config attack test** — verifies `health-check.js` rejects symlinked config files.
- **Checkpoint rotation boundary test** — verifies pre-compact hook correctly prunes checkpoints
  at the configured `maxCheckpointFiles` limit, including custom config values.
- **Shellcheck promoted to `-S error`** — CI now fails on any shellcheck warning (was `-S warning`).
- **health-check.js Number.isSafeInteger** — all numeric config values now validated with
  `Number.isSafeInteger()` for consistency with MCP server validation.
- **58 tests** (23 MCP + 14 vector + 9 compress + 12 hooks) across 4 test suites.

## [1.6.0] - 2025-02-15

### Wave 19: Round 5 Bug Fixes (19 bugs fixed)
- **[P2] Added advisory file locking** — MCP server now uses `.mind/.write-lock` with exclusive
  creation + stale lock detection (30s timeout). Logs contention events. Prevents last-write-wins
  data loss with concurrent writers.
- **[P2] Added tracking file rotation in session-start** — `.agent-activity`, `.task-completions`,
  `.session-tracking` are now rotated to last 100 entries on session start (previously only rotated
  during compression).
- **[P2] Config validation hardened** — `compressThresholdBytes=0` now rejected (minimum: 1000).
  All config values use `Number.isSafeInteger()` to reject extreme values like `1e308`.
- **[P2] extractSection() defense-in-depth** — heading parameter truncated to 200 chars before
  regex escaping to prevent ReDoS from extremely long STATE.md section names.
- **[P2] Fleet dashboard stale project warnings** — projects not updated in >7 days show a
  warning icon with age in the Last Updated column.
- **[P2] Health-check watch/daemon mode** — `--watch` flag re-runs check every 30s (configurable
  via `--interval N`). Exit codes: 0=healthy, 1=warning, 2=error for monitoring integration.
- **[P3] Fixed health-check.js version** — was hardcoded to 1.4.0, now 1.6.0.
- **[P3] README documents bash/Git Bash requirement** — Windows FAQ now explicitly mentions
  Git for Windows and how Claude Code runs hooks through Git Bash.
- **[P3] Fixed stat output validation** — stop-checkpoint.sh and session-end.sh now validate
  stat output is numeric before arithmetic comparison (was only in user-prompt-context.sh).
- **[P3] Fixed error log rotation** — session-start.sh now uses `tail -n 500` instead of
  `tail -c 51200` to avoid cutting mid-UTF-8 character.
- **[P3] Added file size guard in buildIndex()** — skips files >10MB to prevent OOM on
  corrupt or oversized .mind/ files.
- **[P3] Fixed chunkFile() empty file handling** — returns empty array for zero-length or
  whitespace-only content instead of producing negative indices.
- **[P3] Improved dashboard auto-open error messages** — both dashboard.js and fleet-dashboard.js
  now show the file:// URL and platform-specific tips when browser auto-open fails.
- **[P3] Removed non-standard _comment from config template** — JSON doesn't support comments;
  the template filename is self-documenting.
- **[P3] Added uninstall confirmation prompt** — `install.sh --uninstall` now asks for
  confirmation before removing files (skipped in --dry-run mode).
- **[P3] Made checkpoint rotation configurable** — pre-compact.sh reads `maxCheckpointFiles`
  from config (default: 10, minimum: 3).
- **[P3] Fixed TROUBLESHOOTING.md** — clarified that both `## Heading\nContent` and
  `## Heading\n\nContent` (with blank line) are valid STATE.md formats.
- **[P3] Added symlink check on config load** — session-start.sh, stop-checkpoint.sh,
  compress-sessions.js, and pre-compact.sh now skip config files that are symlinks.
- Version bumped to 1.6.0 across all scripts and installers.

## [1.5.0] - 2025-02-15

### Wave 18: Round 4 Bug Fixes (14 bugs fixed)
- **[P1] Fixed shell injection in hook scripts** — session-start.sh and stop-checkpoint.sh now pass
  config file paths via `process.env.MEMORYFORGE_CONFIG` instead of interpolating `$PROJECT_DIR`
  into `node -e` strings. Eliminates arbitrary code execution via crafted directory names.
- **[P2] Fixed extractSection() ReDoS** — heading parameter now regex-escaped in mcp-memory-server.js,
  matching the pattern already used in memorySaveProgress.
- **[P2] Added hooks.test.js to CI pipeline** — all 4 test suites (50 tests) now run in CI across
  the 3-OS x 3-Node matrix.
- **[P2] Fixed hybridSearch TOCTOU** — snippet extraction now uses indexed chunk text from the
  in-process cache instead of re-reading files from disk. Eliminates redundant I/O and race conditions.
- **[P2] Atomic writes for MCP server** — writeMindFile() now uses write-to-tmp + rename pattern
  to prevent partial writes and data corruption from concurrent access.
- **[P3] Fixed stemmer asymmetry** — de-duplicate trailing consonants after suffix stripping
  (e.g., "running" → "runn" → "run"). Now `stem("running") === stem("run")`.
- **[P3] Fixed stale warning message** — stop-checkpoint.sh now uses configured staleWarningSeconds
  value in the user-facing message instead of hardcoded "30+ minutes".
- **[P3] Fixed grep fragility in user-prompt-context.sh** — uses `grep -A 3` with blank-line
  filtering instead of `grep -A 1`, handles valid Markdown with blank lines between headings and content.
- **[P3] Fixed stat comparison safety** — user-prompt-context.sh now validates that mtime values
  are numeric before comparison, preventing silent cache invalidation on platforms where stat fails.
- **[P3] Fixed README prerequisite disclosure** — now states "bash scripts, Node.js, and .mind/ files"
  with a Node.js 18+ prerequisite callout box.
- **[P3] Added Node.js prerequisite check** — both install.sh and install.ps1 now verify Node.js
  is installed before proceeding, with version warning for <18.
- **[P3] Fixed fleet dashboard size calculation** — now recursively counts subdirectories
  (including checkpoints/) for accurate .mind/ size reporting.
- **[P3] Added checkpoint creation debounce** — pre-compact.sh skips writing timestamped checkpoints
  if the last one was created <5 seconds ago, preventing disk exhaustion from rapid-fire compaction.
- **[P3] Optimized subagent-stop.sh** — consolidated from 3 Node.js invocations to 1 (saves ~100ms
  per agent completion).
- Version bumped to 1.5.0 across MCP server, install.sh, and install.ps1.

## [1.4.0] - 2025-02-15

### Wave 17: Polish + Examples
- Added filled-in example `.mind/` for a mid-project web app (`templates/mind-example/`)
  - Shows Phase 3 with completed tasks, pending decisions, blockers, 3 session entries
- Added hook integration tests (`tests/hooks.test.js`) — 7 tests covering full lifecycle
  - session-start → stop-checkpoint → session-end chain
  - User-prompt-context caching verification
  - Compact source (post-compaction) handling
- Defined "MCP (Model Context Protocol)" on first use in README

### Wave 16: Operational Maturity
- Added version tracking: `.memoryforge-version` file written on install
  - Install detects upgrades and shows version transition
  - Health check compares installed vs current version
- Added health-check CLI (`scripts/health-check.js`) — structured JSON diagnostics
  - Reports `.mind/` file sizes, staleness, config validity, error log size, version status
  - Human-readable summary to stderr, machine-readable JSON to stdout
- Added `.mcp-errors.log` rotation in session-start hook (keeps under 100KB)
- Added shellcheck linting to CI pipeline

### Wave 15: Performance + Caching
- TF-IDF index now cached in-process keyed on file mtimes — rebuilds only when files change
- User-prompt-context hook caches output to `.mind/.prompt-context`
  - Skips regeneration when STATE.md hasn't changed (avoids Node shell-out per prompt)
  - Builds context string in bash, uses Node only for JSON escaping

### Wave 14: Security Hardening II (10 bugs fixed)
- **Fixed P1:** Install script command injection — paths passed via `process.env` instead of string interpolation
- **Fixed P1:** MCP server unbounded `rawBuffer` OOM — added 10MB `MAX_MESSAGE_SIZE` cap
- **Fixed P2:** RegExp injection in `memory_save_progress` section parameter — special chars escaped
- **Fixed P2:** Path traversal test was a no-op — replaced with 2 real traversal tests
- **Fixed P2:** `wc -c` whitespace-padded output on Git Bash — added `tr -d ' '`
- **Fixed P2:** Stemmer over-strips ("notes"→"not") — increased min remaining length to 4
- **Fixed P2:** `compress-sessions.js` runs at module load — wrapped in `require.main` guard, added exports
- **Fixed P3:** MCP server version stale (1.1.0 → 1.4.0)
- **Fixed P3:** `.pre-compress` backup files accumulate — cleanup keeps last 3
- **Fixed P3:** Config values not bounds-checked — added `Math.max()` clamping
- **Total tests: 50** (20 MCP + 14 vector + 9 compression + 7 hook integration)

## [1.3.0] - 2025-02-14

### Wave 13: Templates + Fleet Dashboard
- Added 3 project templates: `mind-web-app/`, `mind-cli/`, `mind-library/`
  - Each includes pre-configured STATE.md, PROGRESS.md, DECISIONS.md, SESSION-LOG.md
  - Phase structure and starter tasks tailored to each project type
- Added fleet dashboard (`scripts/fleet-dashboard.js`) — multi-project overview
  - Scans parent directory for projects with `.mind/`
  - Shows phase, progress bar, decisions, sessions, `.mind/` size per project
  - Dark-themed HTML, auto-opens in browser
- Updated README with semantic search docs, fleet dashboard, templates, testing section
- Updated docs table with CONTRIBUTING.md, SECURITY.md, CHANGELOG.md links
- **All 13 waves complete. 42 tests passing.**

## [1.2.0] - 2025-02-14

### Wave 12: Semantic Search
- Added TF-IDF vector memory engine (`scripts/vector-memory.js`) — zero dependencies
- Hybrid `memory_search`: semantic (TF-IDF relevance ranking) + keyword (exact match) combined
- File chunking with overlap for granular search within large files
- Custom stemmer and stop word filtering for English markdown content
- Serialization support (toJSON/fromJSON) for index caching
- CLI mode: `node scripts/vector-memory.js .mind/ "search query"`
- Graceful fallback: keyword-only search when vector module unavailable
- Added 14 vector memory tests (tokenization, stemming, indexing, search, chunking)
- **Total test count: 42 (14 vector + 19 MCP + 9 compression)**

## [1.1.0] - 2025-02-14

### Wave 11: Testing + CI
- Added MCP server test suite (19 tests covering all 6 tools + transport + security)
- Added compression test suite (9 tests covering sessions, decisions, archival, rotation)
- Added GitHub Actions CI (macOS + Linux + Windows, Node 18/20/22)
- Added CONTRIBUTING.md, SECURITY.md, CHANGELOG.md

### Wave 10: Bug Fixes + Security Hardening
- **Fixed** multi-byte Content-Length bug — switched to Buffer-based MCP transport
- **Fixed** `memory_update_state` — now preserves custom sections (parse-and-merge)
- **Fixed** `grep -oP` macOS incompatibility in session-end.sh (replaced with awk)
- **Added** fuzzy task completion matching in `memory_save_progress`
- **Added** 50KB input size limit on all MCP tool calls
- **Security:** switched config from `.js` (code execution via `require()`) to `.json` (`JSON.parse`)

### Wave 9: Progressive Briefings
- Smart 2-layer briefing: compact (~200 tokens) for large projects, full for small
- Post-compaction always uses full briefing for maximum context recovery
- Compact mode includes MCP tool tip for on-demand detail retrieval

### Wave 8: Configuration File
- Added `.memoryforge.config.json` template with all configurable thresholds
- All hooks and scripts respect user configuration overrides
- Pure JSON config — no code execution, safe to commit

### Wave 7: Growth Management
- Task archival: completed tasks older than 30 days moved to ARCHIVE.md
- Tracking file rotation: `.agent-activity`, `.task-completions`, `.session-tracking` capped at 100 entries
- Decision compression preserves rationale in 2-line format (title + "Why: ...")

## [1.0.0] - 2025-02-10

### Wave 6: README Rewrite
- Shields.io badges (Zero Deps, Platform, MIT License)
- "What Is This?" section in plain English with Before & After comparison
- FAQ section answering "Why do I need this?" first
- Competitive analysis (9 tools benchmarked from 5 perspectives)

### Wave 5: Security Hardening
- `safePath()` guard on all MCP file operations — blocks path traversal
- Error logging to `.mcp-errors.log` (replaces silent error swallowing)
- JSON schema validation on all tool inputs before execution

### Wave 4: HTML Dashboard
- `scripts/dashboard.js` generates dark-themed browser dashboard
- Shows progress stats, session counts, decision log, and full state files
- Opens in default browser, no server needed

### Wave 3: Session Compression
- `scripts/compress-sessions.js` — keeps last 5 sessions full, summarizes older
- Decision compression keeps last 10 full, archives older with rationale
- Auto-triggered on session start when `.mind/` exceeds ~3000 tokens

### Wave 2: Auto-Capture Hooks
- `stop-checkpoint.sh` tracks file changes since last checkpoint
- `session-end.sh` auto-generates session summary from `.file-tracker` + git status
- Automatic session summaries when Claude doesn't write one manually

### Wave 1: MCP Memory Server
- 6 MCP tools: `memory_status`, `memory_search`, `memory_update_state`, `memory_save_decision`, `memory_save_progress`, `memory_save_session`
- Zero-dependency stdio MCP server with Content-Length framing
- Auto-discovers `.mind/` by walking up from cwd
- Installed via `.mcp.json` configuration

### Initial Release
- 8 lifecycle hooks (session-start, pre-compact, user-prompt-context, stop-checkpoint, session-end, subagent-start/stop, task-completed)
- 4 state files (STATE.md, PROGRESS.md, DECISIONS.md, SESSION-LOG.md)
- Persistent memory loop: survives context compaction and session restarts
- Smart-merge installer for brownfield projects (preserves existing hooks)
- Competitor detection (6+ memory systems)
- Clean uninstall (preserves `.mind/` state files)
- Cross-platform: macOS, Linux, Windows (PowerShell + Git Bash)
