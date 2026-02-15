# MemoryForge Benchmark Round 5: Team Developer

PERSONA: Team Developer (25% of market)
VERDICT: Conditional — Production-ready with 3 P2 gaps requiring hardening for multi-team deployment.

SCORES:
D1 Team Adoption: 7 — Good onboarding and rollout mechanisms, but lacks centralized multi-team configuration management and version enforcement.
D2 Multi-Project: 8 — Strong fleet dashboard and per-project isolation. Missing cross-repo state sharing and shared decision visibility.
D3 Technical Quality: 9 — Excellent architecture, zero dependencies, comprehensive testing (50 tests), and CI across 3 OS × 3 Node versions.
D4 Operational Safety: 6 — Adequate atomic writes and path traversal protection, but no concurrent access locking, limited monitoring, and no alerting mechanism.
D5 Search & Retrieval: 8 — Strong hybrid TF-IDF + keyword search with in-process caching. Lacks full-text indexing and advanced query operators.
D6 Growth Handling: 8 — Strong compression, archival, and rotation. Progressive briefings scale well. Missing automated cleanup triggers.
D7 Integration: 8 — Strong git workflows, smart-merge installer, uninstall preservation. No native IDE integration or team-specific CI templates.
AVERAGE: 7.7

STRENGTHS:
- **Zero-dependency architecture** — No npm packages, pure Node.js + bash. Reduces supply chain risk and installation friction dramatically. Perfect for security-conscious teams.
- **Fleet dashboard for multi-project visibility** — `fleet-dashboard.js` scans parent directories and shows phase, progress, decisions, sessions, and `.mind/` size across all projects in a single HTML view. Critical for managers/leads tracking 5-10 projects.
- **Smart-merge installer with brownfield safety** — Detects 6+ existing memory systems, preserves user hooks in `.claude/settings.json` via JSON merge, creates backups before any modification. `--dry-run` and `--uninstall` modes are production-grade.
- **Comprehensive testing + CI** — 50 tests (20 MCP server + 14 vector + 9 compression + 7 hooks integration) running across macOS/Linux/Windows × Node 18/20/22. Shellcheck linting on all bash scripts. Very few projects in this space have this level of test coverage.
- **Persistent memory loop survives compaction** — The pre-compact → compact → session-start cycle with checkpoint/restore is architecturally sound. Post-compaction briefings always use full format for maximum recovery. This is the killer feature for long-running team projects.

GAPS:
- **No concurrent access locking** — Multiple team members editing the same `.mind/` files simultaneously can cause write conflicts. MCP server uses atomic writes (write-to-tmp + rename), but there's no file locking or optimistic concurrency control. Risk: Last-write-wins data loss.
- **No centralized team configuration** — Each developer has their own `.memoryforge.config.json`. No way to enforce org-wide settings (e.g., "all teams must compress at 10KB"). Missing: team config inheritance or a `~/.memoryforge/team.config.json` that projects inherit from.
- **No monitoring/alerting** — `health-check.js` reports status as JSON, but there's no daemon mode, no webhook/email alerts on errors, no `.mcp-errors.log` size alerts. Teams won't know when a developer's MemoryForge is broken until they manually check.
- **No cross-repo state sharing** — Projects are fully isolated (correct for most cases), but some teams want "shared decisions" across repos (e.g., "all microservices use OAuth2"). Missing: a way to reference `.mind/` files from another project or a shared `.mind-team/` directory.
- **No version enforcement** — `.memoryforge-version` file exists, but installer doesn't block or warn on version mismatches within a team. Risk: Developer A on v1.5.0, Developer B on v1.3.0 — subtle behavior differences cause confusion.

BUGS:

| # | Severity | Bug Description | Location |
|---|----------|----------------|----------|
| 1 | P2 | **No file locking on `.mind/` writes** — Multiple concurrent `memory_update_state` calls can result in last-write-wins data loss. MCP server uses atomic writes but no cross-process lock. | `scripts/mcp-memory-server.js:79-86` (writeMindFile) |
| 2 | P2 | **Fleet dashboard doesn't detect stale projects** — Shows `.mind/` size and last updated date, but no visual warning for projects not updated in 7+ days. Teams won't notice abandoned projects. | `scripts/fleet-dashboard.js:60-118` (getProjectStatus) |
| 3 | P2 | **Health check has no daemon/watch mode** — `health-check.js` is a one-shot CLI. No way to run continuously and alert on state changes (e.g., `.mcp-errors.log` growing, STATE.md stale for 48h). | `scripts/health-check.js:1-180` (entire file) |
| 4 | P3 | **Session compression doesn't log what was compressed** — `compress-sessions.js` outputs JSON to stdout but doesn't append a summary to `.mind/COMPRESSION-LOG.md`. Teams can't audit what was compressed/when without checking git history. | `scripts/compress-sessions.js:398-410` (JSON output) |
| 5 | P3 | **Install script doesn't validate Node.js version exactly** — Checks `NODE_MAJOR -lt 18` but allows Node 18.0.0, which has known bugs. Should enforce 18.12.0+ for LTS stability. | `install.sh:43-46`, `install.ps1:39-40` |
| 6 | P3 | **No uninstall confirmation prompt** — `install.sh --uninstall` immediately removes files without asking for confirmation. Risk: Typo in directory path removes wrong project's hooks. | `install.sh:142-352` (UNINSTALL MODE) |
| 7 | P3 | **`.mind/checkpoints/` directory grows unbounded in git** — Pre-compact hook keeps last 10 timestamped checkpoints, but `.gitignore` excludes entire `checkpoints/` directory. Teams may want versioned checkpoints for debugging. Should be configurable. | `.gitignore:627` (`.mind/checkpoints/`) |
| 8 | P3 | **MCP server doesn't validate array fields in `memory_update_state`** — `active_work` and `blockers` can be passed as non-arrays, causing `args.active_work.map` to fail silently. Should validate `Array.isArray()` and reject with error. | `scripts/mcp-memory-server.js:196-204` |
| 9 | P3 | **Vector memory index cache never invalidates on external changes** — `getCachedIndex()` uses mtime comparison, but if another process writes `.mind/` files, in-process cache becomes stale until restart. Should watch file mtimes per search call. | `scripts/vector-memory.js:323-332` |
| 10 | P3 | **Dashboard HTML has no refresh meta tag** — Generated `dashboard.html` shows static snapshot. For long-running sessions, developers won't see updates. Should add `<meta http-equiv="refresh" content="60">` or client-side JS polling. | `scripts/dashboard.js:84-317` (HTML generation) |


---

## Detailed Dimension Analysis

### D1 Team Adoption: 7/10

**Strengths:**
- Smart-merge installer (`merge-settings.js`) preserves existing hooks and creates backups — critical for teams with custom `.claude/settings.json`.
- `--dry-run` mode shows exactly what would change before applying — reduces rollout fear.
- Fleet dashboard gives managers visibility into adoption status across 5-50 projects.
- Uninstall preserves `.mind/` state files (project data) while removing infrastructure — safe for experimentation.
- Health check CLI (`health-check.js`) provides structured diagnostics for troubleshooting team installations.

**Gaps:**
- No centralized team config — each developer maintains their own `.memoryforge.config.json`. Org-wide settings (compression thresholds, archival policies) require manual sync across N developers.
- No version enforcement — `.memoryforge-version` file exists but installer doesn't block installs on version mismatch. Developer A on v1.5.0, Developer B on v1.3.0 → subtle bugs.
- No rollback mechanism — If install breaks something, only option is `--uninstall` (removes hooks) or restore from backup. Should have `--rollback-to-version` or checkpoint-based restore.
- Onboarding docs assume 1-person setup — README doesn't have "Team Rollout Checklist" or "Best Practices for 5+ Developers" section.

**Justification:** Good foundations for team adoption, but missing centralized control and rollback safety. A 5-person team can adopt this successfully, but 50-person org will hit config drift and version skew issues.

---

### D2 Multi-Project: 8/10

**Strengths:**
- Fleet dashboard (`fleet-dashboard.js`) scans parent directory for all `.mind/` projects and shows aggregate stats — perfect for leads managing 5-10 repos.
- Per-project `.mind/` isolation prevents cross-contamination — Phase 2 in repo A doesn't pollute Phase 1 in repo B.
- Global install mode (`--global` to `~/.claude/`) allows hooks to run across all projects while state remains per-project.
- `.memoryforge-version` tracking per project allows mixed versions across repos (useful during gradual migrations).

**Gaps:**
- No cross-repo state sharing — Some teams want "shared decisions" across microservices (e.g., "all services use Auth0"). Would need symlinks or a `.mind-team/` directory.
- Fleet dashboard is static HTML — Doesn't auto-refresh, no live updates. For 50 projects, manual regeneration is tedious.
- No per-project install overhead metric — Fleet dashboard shows `.mind/` size but not "time to rebuild TF-IDF index" or "compression runtime". Large projects might be slow.
- Missing "project template inheritance" — `templates/mind-web-app/` exists, but no way to say "all web apps inherit these defaults" at org level.

**Justification:** Strong per-project isolation + fleet visibility. Missing shared state and live dashboards, but 2-5 active projects work very well.

---

### D3 Technical Quality: 9/10

**Strengths:**
- **Zero dependencies** — No npm packages. Only Node.js 18+ required. Eliminates supply chain attacks and version conflicts.
- **50 comprehensive tests** — 20 MCP server tests (tools + transport + security), 14 vector memory tests (TF-IDF + tokenization + chunking), 9 compression tests (sessions + decisions + archival), 7 hooks integration tests (full lifecycle).
- **CI across 9 environments** — macOS/Linux/Windows × Node 18/20/22 matrix. Shellcheck linting on all bash scripts.
- **Protocol correctness** — MCP server implements JSON-RPC 2.0 over Content-Length framed stdio correctly. Handles multi-byte UTF-8, validates required fields, returns proper error codes.
- **Clean architecture** — Hooks → State Files → MCP Tools → Search is well-layered. Each component has single responsibility.

**Gaps:**
- No TypeScript definitions — Pure JavaScript. Teams using TypeScript won't get IDE autocomplete for MCP tool schemas.
- Test coverage gaps — No tests for installer scripts (`install.sh`, `install.ps1`), no tests for dashboard generation, no tests for fleet dashboard.
- No performance benchmarks — README claims "fast", but no numbers for TF-IDF index build time on 10MB `.mind/` or compression throughput.

**Justification:** Excellent technical foundation. Minor polish needed (TypeScript definitions, installer tests), but architecture is production-grade.

---

### D4 Operational Safety: 6/10

**Strengths:**
- **Atomic writes** — `writeMindFile()` uses write-to-tmp + rename pattern (mcp-memory-server.js:82-85). Prevents partial writes from crashes.
- **Path traversal protection** — `safePath()` validates all file operations stay within `.mind/` (mcp-memory-server.js:61-67). Two dedicated tests verify blocking.
- **Input size limits** — 50KB cap on MCP tool call inputs prevents disk exhaustion (mcp-memory-server.js:27, 571-582).
- **Error logging** — Unhandled errors written to `.mcp-errors.log` instead of silent swallowing (mcp-memory-server.js:675-686).
- **Checkpoint debounce** — Pre-compact hook skips timestamped checkpoints if last one was <5s ago, preventing disk exhaustion from rapid-fire compaction (pre-compact.sh:93-106).

**Gaps:**
- **No file locking** — Multiple concurrent MCP tool calls can write to same file simultaneously. Atomic rename prevents corruption, but last-write-wins causes data loss. Need `fs.open(..., 'wx')` or lockfile.
- **No monitoring daemon** — `health-check.js` is one-shot. No way to run continuously and alert on `.mcp-errors.log` growth, STATE.md staleness >48h, or compression failures.
- **No alerting mechanism** — Errors logged to `.mcp-errors.log`, but no email/Slack/webhook on critical issues. Team won't know MCP server crashed until developer manually checks.
- **`.mcp-errors.log` rotation is passive** — Session-start hook rotates log if >100KB (session-start.sh:34-42), but if MCP server fails in a loop, log grows to 100KB before next session start. Should rotate on write, not session start.
- **No corruption detection** — If `.mind/STATE.md` becomes malformed (e.g., truncated write from disk full), hooks silently treat it as empty. Should validate Markdown structure and alert on corruption.

**Justification:** Good atomic write guarantees and path traversal protection, but critical gaps in concurrency control and monitoring. 6/10 reflects "adequate for single developer, risky for 5-person team with concurrent access."

---

### D5 Search & Retrieval: 8/10

**Strengths:**
- **Hybrid search** — `memory_search` combines TF-IDF semantic ranking with exact keyword fallback (mcp-memory-server.js:113-185). Ask "What did we decide about auth?" — gets results by meaning, not just keyword "auth".
- **In-process index caching** — TF-IDF index keyed on file mtimes (vector-memory.js:298-332). Rebuilds only when `.mind/` files change. Saves ~50ms per search on warm cache.
- **Zero dependencies** — Custom TF-IDF engine with Porter-like stemmer and stop word filtering (vector-memory.js:43-90). No external libraries.
- **Chunking with overlap** — Files split into 15-line chunks with 3-line overlap for granular matches (vector-memory.js:241-262). Find exact section of large file.
- **Graceful fallback** — If `vector-memory.js` unavailable, falls back to keyword-only search (mcp-memory-server.js:107-110). Resilient.

**Gaps:**
- **No full-text indexing** — Search only covers 5 files (STATE.md, PROGRESS.md, DECISIONS.md, SESSION-LOG.md, ARCHIVE.md). Doesn't index project code, READMEs, or `.claude/agents/*.md`.
- **No query operators** — Can't do "auth AND jwt NOT oauth". Query is treated as single bag-of-words.
- **Cache invalidation on external writes** — If external process writes `.mind/` files, in-process cache becomes stale until next mtime check. Should watch mtimes per search call, not just on init.
- **No search result highlighting** — Results show snippet but don't highlight matching terms. Hard to see why result was ranked high.
- **Stemmer over-simplifies some words** — "notes" → "not" (Bug #6 from Wave 14 changelog). Fixed in current version, but test coverage for edge cases is thin.

**Justification:** Strong semantic search for `.mind/` files, but limited to memory state only. Can't search project code or external docs. 8/10 for memory-specific search, 6/10 if you need universal search.

---

### D6 Growth Handling: 8/10

**Strengths:**
- **Session compression** — Keeps last 5 sessions full, summarizes older to 1 line each (compress-sessions.js:70-172). Auto-triggers when `.mind/` exceeds ~3000 tokens (session-start.sh:44-80).
- **Decision compression preserves rationale** — Last 10 decisions kept full, older compressed to 2-line format: title + "Why: ..." (compress-sessions.js:177-256). Critical for long-term decision audit trail.
- **Task archival** — Completed tasks older than 30 days moved to `ARCHIVE.md` (compress-sessions.js:261-306). Keeps `PROGRESS.md` focused on active work.
- **Tracking file rotation** — `.agent-activity`, `.task-completions`, `.session-tracking` capped at 100 entries each (compress-sessions.js:311-330). Prevents unbounded growth.
- **Progressive briefings** — Session-start switches to compact briefing (~200 tokens) for large projects, full briefing (500-2000 tokens) for small (session-start.sh:122-175). Scales with project size.
- **Checkpoint pruning** — Pre-compact hook keeps last 10 timestamped checkpoints (pre-compact.sh:109-118). Prevents `.mind/checkpoints/` from filling disk.

**Gaps:**
- **No automated cleanup triggers** — Compression runs on session start if size >12KB. But if a session never starts (e.g., abandoned project), `.mind/` grows unbounded. Should have cron job or `health-check --cleanup`.
- **No size projection** — Fleet dashboard shows current `.mind/` size, but not "projected size in 30 days" or "compression savings last month". Hard to plan capacity.
- **Compression is all-or-nothing** — Can't selectively compress only `SESSION-LOG.md` while keeping `DECISIONS.md` full. Config is global thresholds only.
- **No archival expiry** — `ARCHIVE.md` grows unbounded. Completed tasks from 2 years ago stay forever. Should have "archive older than 365 days to `.mind/ARCHIVE-2024.md`" or similar.

**Justification:** Strong compression and archival mechanisms scale from small (5KB) to large (100KB+) projects. Progressive briefings prevent context bloat. Missing automated cleanup and long-term archival expiry. 8/10.

---

### D7 Integration: 8/10

**Strengths:**
- **Git workflow integration** — `.gitignore` entries added by installer exclude tracking files but preserve state files (install.sh:616-643). Commit STATE.md/PROGRESS.md/DECISIONS.md, ignore `.last-activity`.
- **Smart-merge installer** — Detects existing `.claude/settings.json` and merges MemoryForge hooks alongside user hooks (install.sh:436-493). Creates backup before modify.
- **Uninstall preserves data** — `--uninstall` removes hooks/scripts but preserves `.mind/STATE.md` etc. (install.sh:142-352). Safe rollback.
- **Cross-platform installers** — `install.sh` for Unix/macOS/Git Bash, `install.ps1` for PowerShell. Both have feature parity (dry-run, global, uninstall).
- **MCP protocol compliance** — `.mcp.json` configuration follows Claude Code MCP spec. Tools show up in tool panel automatically.
- **Competitor detection** — Installer detects 6+ existing memory systems (claude-mem, Continuous-Claude, etc.) and reports compatibility (install.sh:383-402).

**Gaps:**
- **No native IDE integration** — VS Code, Cursor, Windsurf have no MemoryForge extensions. Developers can't view/edit `.mind/` files in sidebar or get inline state previews.
- **No CI templates** — Most teams use GitHub Actions / GitLab CI. No example workflow for "auto-compress .mind/ files on PR merge" or "run health-check in CI".
- **No Docker/Kubernetes support** — No Dockerfile or Helm chart for running MemoryForge in containerized environments (Claude Code in CI, remote dev containers).
- **No team-specific installers** — Enterprise teams want `install.sh --team acme-corp` that pre-configures org settings, auto-detects Jira/Slack integrations, etc. Current install is generic.
- **Hook debugging is manual** — If session-start hook fails, developer must run `echo '{"source":"startup"}' | bash scripts/hooks/session-start.sh` manually. No `memoryforge debug session-start` CLI.

**Justification:** Strong git workflow integration and cross-platform installers. Smart-merge and competitor detection reduce brownfield friction. Missing IDE extensions and CI templates. 8/10.

---

## Team Developer Verdict

**Conditional**: MemoryForge is production-ready for **2-5 person teams** on **greenfield projects** with moderate `.mind/` file sizes (<50KB) and low concurrent access.

**Blockers for 25-50 person teams:**
1. **No concurrent access locking** (Bug #1, P2) — Multiple developers editing same repo simultaneously will hit last-write-wins data loss. Need file locking or optimistic concurrency control.
2. **No centralized team configuration** (Gap D1) — Config drift across 50 developers causes "works on my machine" issues. Need `~/.memoryforge/team.config.json` inheritance.
3. **No monitoring/alerting** (Bug #3, P2) — Teams won't know when MemoryForge breaks until manual check. Need daemon mode + webhooks.

**Recommended adoption path:**
1. **Small team pilot (2-5 devs, 1 month)** — Install on 1-2 active repos, monitor for conflicts/issues. Use `health-check.js` weekly to catch staleness.
2. **Add file locking** — Patch `writeMindFile()` to use lockfile (e.g., `fs.open(..., 'wx')` or external lock library). Test concurrent access.
3. **Deploy team config** — Create `team.config.json` with org-wide compression thresholds, archival policies. Enforce version matching (block installs on version skew).
4. **Set up monitoring** — Run `health-check.js --json` in cron (every 5 min), pipe to webhook on errors. Alert on `.mcp-errors.log` >100KB or STATE.md stale >48h.
5. **Scale to full team** — Roll out to 25-50 developers once locking, config, and monitoring are proven stable.

**Comparison to 25% market segment needs:**
- ✅ Reliability: Atomic writes, path traversal protection, 50 tests, CI across 9 environments. **Strong**.
- ⚠️ Team compatibility: Smart-merge installer, fleet dashboard, but no centralized config or version enforcement. **Adequate, needs hardening**.
- ⚠️ Operational safety: Good atomic writes, but no locking, monitoring, or alerting. **Risky for concurrent access**.

**Overall**: 7.7/10 average. Fix 3 P2 bugs (locking, monitoring, fleet staleness detection) → 8.5/10. Add team config + CI templates → 9.0/10. Current state is **"ship to friendly early-adopter teams, not general release yet"**.
