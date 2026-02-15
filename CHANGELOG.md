# Changelog

All notable changes to MemoryForge are documented here.

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
