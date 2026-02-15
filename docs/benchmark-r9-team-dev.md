# Team Developer -- Round 9 Evaluation
**Version:** 1.8.1 | **Verdict:** Yes

## Scores
| Dim | Name | Score | R8 | Delta | Justification |
|-----|------|-------|-----|-------|---------------|
| D1 | Team Adoption | 9 | 9 | 0 | Three installers (bash, PowerShell, interactive setup.js) all now copy supporting scripts correctly. The P2 fix for missing compress-sessions.js/config-keys.js/health-check.js in installed projects was critical -- without it, health-check and auto-compression were broken for every installed project. setup.js now has --help and --dry-run, plus clone-dir detection warning, making it easier to avoid the common "installed into the wrong directory" mistake. Smart merge, dry-run, uninstall with confirmation prompt, and competitor detection all remain solid. The onboarding docs (README, TROUBLESHOOTING with new setup.js section) are comprehensive. One remaining gap: no team-wide config sharing mechanism (each dev runs their own installer). Still, the practical onboarding experience for a 5-50 person team is excellent. |
| D2 | Multi-Project | 9 | 9 | 0 | Fleet dashboard with stale-project warnings (>7 days), per-project .mind/ state, global install mode, project templates (web-app, CLI, library), and version tracking all remain strong. The fleet dashboard properly escapes HTML in project names and phases. Per-project install overhead is low (one command) and the --dry-run preview keeps rollout predictable. No cross-project search capability (each .mind/ is isolated), which is architecturally reasonable but means a team with 10 projects cannot search decisions across all of them from one command. |
| D3 | Technical Quality | 9 | 9 | 0 | Code quality remains high. The Wave 22 fixes address real issues: Buffer.byteLength for consistent byte measurement on total input, execFileSync to eliminate command injection in watch mode, task-completed.sh consolidated from 4 Node invocations to 1. The codebase is consistently zero-dependency, well-commented, and architecturally coherent. MCP protocol implementation is correct (Content-Length framing with Buffer handling, JSON-RPC 2.0 with proper error codes). The shared config-keys.js module is good DRY practice. 58 tests across 4 suites with 3-OS x 3-Node CI matrix. Shellcheck at -S error level. Minor observation: setup.js uses a slightly different merge logic from merge-settings.js (inline vs. dedicated script), which is a minor code duplication concern but functionally equivalent. |
| D4 | Operational Safety | 9 | 8 | +1 | This is where Wave 22 makes the biggest difference. The P2 fix replacing execSync with execFileSync in health-check.js watch mode closes a real command injection vector. Advisory file locking with stale detection, atomic writes (tmp+rename), lock contention warnings surfaced to the user, and the concurrency test all provide solid concurrent-access handling. The dashboard XSS fix (HTML-escaping currentPhase) closes a stored-XSS vector where a malicious phase string in STATE.md could execute JavaScript when the dashboard is opened. Symlink rejection on config files prevents symlink-based attacks. Error logging to .mcp-errors.log with rotation prevents unbounded growth. The one remaining gap from R8 (execSync injection in watch mode) is now closed, justifying the score increase. |
| D5 | Search & Retrieval | 9 | 9 | 0 | Hybrid TF-IDF semantic + keyword search with mtime-cached index remains best-in-class for a zero-dependency solution. The stemmer fix from earlier rounds (de-duplicate trailing consonants) ensures "running" matches "run". File chunking with overlap for granular matching within large files. buildIndex() skips files >10MB to prevent OOM. The keyword fallback when vector-memory.js is unavailable is a good resilience pattern. The 15-result limit on hybrid search and 10-per-file limit on keyword search are reasonable. No relevance threshold tuning exposed to users, but the default 0.01 minScore works well for .mind/ files. |
| D6 | Growth Handling | 9 | 9 | 0 | Compression with configurable thresholds (sessions, decisions, archive days), tracking file rotation (200-line trigger in session-start, 100-line in compressor), .pre-compress backup cleanup (max 3), checkpoint pruning (configurable maxCheckpointFiles), and error log rotation (100KB limit) all remain solid. Auto-compression triggers on session-start when .mind/ exceeds the configured threshold. The compressor exports functions for programmatic use without side effects (require.main guard). Config validation rejects compressThresholdBytes=0 which would silently disable compression. |
| D7 | Integration | 9 | 8 | +1 | Wave 22 solidifies CI/git integration. All 3 installers now produce identical project layouts (including supporting scripts), so the project works the same whether installed via bash, PowerShell, or setup.js. The .gitignore entries are consistent across all installers (including .write-lock). CI runs shellcheck on all hook scripts and install.sh. Health-check.js provides monitoring integration with exit codes (0/1/2) and JSON output for tooling. The --watch mode (now safe with execFileSync) enables continuous monitoring. The dashboard and fleet-dashboard auto-open in the correct browser per platform. The installer detects existing memory systems and shows coexistence guidance. |

**Average: 9.00** (R8: 8.71, Delta: +0.29)

## Bugs Found

### P2
(none found)

### P3

1. **fleet-dashboard.js:18 -- uses execSync for browser open, not execFileSync**
   `execSync` is used at line 275-277 to open the browser with the output path interpolated into the command string. While the output path is constructed internally (not user-supplied), this is inconsistent with the Wave 22 fix that replaced execSync with execFileSync in health-check.js watch mode specifically to prevent command injection. If the parent directory path contains shell metacharacters (e.g., a directory named `$(rm -rf ~)`), this could be exploited. The dashboard.js at line 335 has the same pattern using `exec` from child_process. Both should use `execFileSync` or `execFile` with array arguments for consistency with the project's own security posture.
   - **File:** `D:\MemoryForge\scripts\fleet-dashboard.js:275-277`
   - **File:** `D:\MemoryForge\scripts\dashboard.js:335`

2. **setup.js:310-312 -- uses execSync with shell for chmod**
   Line 311: `execSync('chmod +x "${hooksDir}"/*.sh', { stdio: 'pipe' })` -- this passes a string to execSync which invokes a shell. If hooksDir contains shell metacharacters, this could be exploited. Should use `execFileSync('chmod', ['+x', ...files])` or iterate with `fs.chmodSync`.
   - **File:** `D:\MemoryForge\setup.js:311`

3. **subagent-start.sh:24-32 -- still uses 2 separate operations (Node parse + cut) instead of single Node invocation**
   While subagent-stop.sh and task-completed.sh were consolidated to single Node invocations (Wave 22 fixed task-completed.sh, earlier waves fixed subagent-stop.sh), subagent-start.sh still parses JSON with Node, pipes through `cut`, and then uses bash `echo` to append to the activity tracker. This is functionally correct but inconsistent with the consolidation pattern applied to the other hooks. A single Node invocation (like subagent-stop.sh) would be more consistent and slightly faster.
   - **File:** `D:\MemoryForge\scripts\hooks\subagent-start.sh:24-38`

4. **README.md:494 -- CHANGELOG.md description says "Waves 1-13" but actual changelog covers Waves 1-22**
   The docs table at line 494 says `Version history (Waves 1-13)` but the CHANGELOG.md now covers through Wave 22 / v1.8.1. This is stale documentation.
   - **File:** `D:\MemoryForge\README.md:494`

5. **README.md:467-478 -- test count says 58 but test suite listing sums to 58 with wrong individual counts**
   Line 467 says "58 tests" but the listing shows: 23 MCP + 9 compress + 14 vector + 12 hooks = 58. The MCP test file contains 23 test definitions (correct), compression has 9 (correct), vector has 14 (correct), hooks has 12 (correct). However, the CHANGELOG at Wave 20 says "58 tests (23 MCP + 14 vector + 9 compress + 12 hooks)" which is consistent. This is actually correct; no bug here. (Retracted.)

6. **setup.js:541 -- dryInfo called with wrong arguments**
   Line 541: `dryInfo('config', configPath)` -- the `dryInfo` function at line 124-127 takes a single string parameter `msg`, not two arguments. The second argument `configPath` is silently ignored. The call should be `dryInfo('create config at ' + configPath)` or similar.
   - **File:** `D:\MemoryForge\setup.js:541`

7. **compress-sessions.js:319-324 -- ARCHIVE.md and PROGRESS.md not written atomically**
   `archiveCompletedTasks()` uses direct `fs.writeFileSync` for both ARCHIVE.md (line 320) and PROGRESS.md (line 324) instead of the tmp+rename atomic write pattern used by the MCP server. If the process crashes between writing ARCHIVE.md and rewriting PROGRESS.md, archived tasks could appear in both files (duplicated) or in neither (lost from PROGRESS.md via .pre-compress backup but not yet in ARCHIVE.md). The MCP server established the atomic write pattern; the compressor should follow it.
   - **File:** `D:\MemoryForge\scripts\compress-sessions.js:319-324`

8. **compress-sessions.js:182-183 and 266-267 -- session/decision compression not atomic**
   Similar to above: `compressSessions()` and `compressDecisions()` use `fs.writeFileSync` directly instead of the tmp+rename atomic pattern. The backup via `fs.copyFileSync` to `.pre-compress` provides a recovery path, but the write itself is not crash-safe.
   - **File:** `D:\MemoryForge\scripts\compress-sessions.js:182-183`
   - **File:** `D:\MemoryForge\scripts\compress-sessions.js:266-267`

9. **install.ps1:87-98 -- PowerShell uninstall lacks confirmation prompt**
   The bash `install.sh` uninstaller (lines 152-166) prompts for confirmation before removing files ("Continue? [y/N]"), but the PowerShell `install.ps1` uninstaller proceeds immediately without asking. This is inconsistent and could lead to accidental removal on Windows. The `--dry-run` flag is supported for preview, but the bash version offers an additional safety net.
   - **File:** `D:\MemoryForge\install.ps1:87-98`

10. **health-check.js:226-227 -- watch mode passes unfiltered args to child process**
    Line 226-227: `const watchArgs = args.filter(a => a !== '--watch' && !a.startsWith('--interval'));` -- this filter removes `--watch` and `--interval` but allows any other argument through to `execFileSync`. While `execFileSync` is safe from shell injection, passing arbitrary unfiltered arguments could cause unexpected behavior if a user passes args like `--json` combined with crafted project paths. This is low severity since execFileSync does not invoke a shell.
    - **File:** `D:\MemoryForge\scripts\health-check.js:226-227`

11. **session-end.sh:62 -- FILE_LIST uses head and sed pipeline, could exceed ARG_MAX on very large trackers**
    Line 61: `FILE_LIST=$(grep -v '^#' "$TRACKER" | head -15 | sed 's/^/  - /')` -- this is capped at 15 lines which is safe, but the full `grep -v '^#' "$TRACKER"` reads the entire tracker file first. Since the tracker is rotated to 200 lines max in session-start.sh, this is bounded. No actual bug, but worth noting the dependency on the rotation happening first.
    - (Informational only, not counted as bug.)

## Verdict Rationale

**Verdict: Yes** -- adopt MemoryForge for team use.

MemoryForge v1.8.1 is ready for team adoption. The Wave 22 fixes address the two P2 issues from R8 (missing supporting scripts in installers, command injection in watch mode) and deliver meaningful quality-of-life improvements (setup.js --help/--dry-run, task-completed.sh consolidation, dashboard XSS fix).

From a Team Developer perspective:

**Strengths:**
- Three mature installers (bash, PowerShell, interactive Node.js) provide cross-platform onboarding for any team
- Smart merge preserves existing hooks -- critical for teams with established Claude Code workflows
- 58 tests across 4 suites with 3-OS x 3-Node CI matrix gives confidence in cross-platform reliability
- Advisory locking + atomic writes + contention warnings handle the concurrent-access scenario that teams encounter daily
- Fleet dashboard provides team-wide visibility across projects
- Health-check with monitoring-friendly exit codes and JSON output integrates into team observability
- Zero dependencies means no supply chain risk and no version conflicts across team environments
- Clean uninstall with data preservation makes rollback safe

**Remaining gaps (all P3):**
- No cross-project search (cannot search decisions across all team projects)
- Compression writes are not atomic (MCP server uses atomic writes, compressor does not)
- PowerShell uninstaller lacks the confirmation prompt that the bash uninstaller has
- Minor inconsistencies in shell vs. execFileSync usage for browser opening
- README changelog reference is stale

None of these are blocking. The P3 bugs found are minor inconsistencies and polish items. The system is architecturally sound, well-tested, and operationally safe for team deployment.

The 0.29-point score increase from R8 (8.71 to 9.00) reflects the Wave 22 fixes closing the two key gaps in D4 (operational safety) and D7 (integration consistency). All seven dimensions now score 9/10, indicating a mature, well-rounded tool with only minor polish remaining.
