# MemoryForge Benchmark Round 4: Startup Tech Lead Evaluation

PERSONA: Startup Tech Lead (20% of market)
VERDICT: Conditional — Solid core concept with real value for context persistence, but incomplete multi-repo story and a few lingering security issues prevent unconditional team-wide rollout.

SCORES:
D1 Team Adoption: 6 — One-command install with dry-run and uninstall is strong, but per-project installation across 3+ repos with 8 engineers creates friction and there is no centralized team config or rollback-on-failure mechanism.
D2 Multi-Project: 5 — Fleet dashboard provides visibility, but each project requires its own install, its own .mind/ state, its own MCP server process, and there is zero cross-project memory or shared decision awareness.
D3 Technical Quality: 7 — Zero-dependency constraint is well-executed, MCP protocol implementation is correct with proper Buffer-based framing, TF-IDF search is surprisingly capable, but some claimed security fixes (command injection via process.env) were not actually applied to hook scripts.
D4 Operational Risk: 6 — Health check and compression provide guardrails, error logging with rotation exists, but there is no monitoring/alerting, the MCP server runs as an unsupervised long-lived process, and a corrupt .mind/STATE.md silently degrades all sessions until manually noticed.
D5 Search & Retrieval: 7 — Hybrid TF-IDF plus keyword search is genuinely useful and the caching layer (mtime-keyed index rebuild) is smart, but the custom stemmer is simplistic and searching across project boundaries is not supported.
D6 Growth Handling: 8 — Progressive briefings, configurable compression thresholds, checkpoint pruning, tracking file rotation, and task archival form a comprehensive growth management story that is better than most competing tools.
D7 ROI: 7 — Context persistence across compaction is a real pain point that this solves well, the zero-dependency approach minimizes maintenance burden, but the per-project install overhead and lack of team-level features reduce the multiplier for an 8-person team.
AVERAGE: 6.57

STRENGTHS:
- The persistent memory loop (pre-compact save, post-compact restore) solves the single biggest Claude Code pain point for long sessions and is architecturally sound.
- True zero dependencies: no npm install, no build step, no external services. This dramatically reduces the operational surface area and means it never breaks due to upstream package changes.
- The installer is production-grade: smart-merge for existing hooks, competitor detection, dry-run preview, clean uninstall that preserves user data, cross-platform parity between bash and PowerShell.
- Growth management is thoughtful and configurable: auto-compression triggers, progressive briefings for large projects, checkpoint pruning, and task archival prevent .mind/ from becoming a problem over time.
- The MCP server implementation is solid: proper Content-Length framing with Buffer-based parsing for multi-byte safety, path traversal protection, input size limits, and structured error logging.

GAPS:
- No cross-project memory: if my auth-service team makes a decision about JWT token format, my api-gateway team has no way to see that decision unless someone manually copies it. For a startup with 3 microservices, this is a real limitation.
- Command injection vulnerability persists in hooks: `session-start.sh` line 50 and `stop-checkpoint.sh` line 77 embed `$PROJECT_DIR` directly into Node `-e` strings via bash interpolation. A project directory containing single quotes or backticks could execute arbitrary code. The CHANGELOG claims this was fixed in Wave 14 ("paths passed via process.env instead of string interpolation") but the fix was not actually applied to all hook scripts.
- Hook test suite (7 tests in hooks.test.js) is not included in the CI pipeline (ci.yml only runs mcp-server, compress, and vector-memory tests), meaning hook regressions across the 3-platform matrix are not caught automatically.
- No team-level coordination beyond shared .mind/ directory: there is no locking, no conflict resolution, and no mechanism for two engineers (or two Claude sessions) working on the same project to avoid clobbering each other's STATE.md writes.
- The config file template includes a `_comment` field that is non-standard JSON and would fail strict parsers, though Node's JSON.parse accepts it.

BUGS:
- [P2] Command injection in hook scripts — `session-start.sh:50` and `stop-checkpoint.sh:77` pass `$PROJECT_DIR` via bash string interpolation into `node -e` strings rather than via `process.env` as claimed in the Wave 14 changelog. A directory path containing shell metacharacters (single quotes, backticks, dollar signs) would break execution or allow code injection. The MCP server's `findMindDir()` correctly uses `process.env.CLAUDE_PROJECT_DIR`, but the hooks do not follow the same pattern for their inline Node calls.
- [P3] CI pipeline omits hooks.test.js — The CHANGELOG and README claim 50 tests (20 MCP + 14 vector + 9 compression + 7 hooks), but ci.yml only runs 3 of the 4 test suites. Hook integration tests do not run in CI, meaning the most critical path (session-start/end lifecycle) has no automated cross-platform regression coverage.
- [P3] Fleet dashboard `getProjectStatus` does not recurse into subdirectories of .mind/ for size calculation — `fs.readdirSync(project.mindDir)` only counts top-level files, missing the `checkpoints/` subdirectory which can accumulate significant size over time, leading to understated .mind/ size reporting.
