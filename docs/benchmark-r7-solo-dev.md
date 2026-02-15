# MemoryForge v1.7.0 Benchmark -- Solo Developer

**Persona:** Solo Developer (40% market share)
**Date:** 2026-02-15
**Evaluator:** Claude Opus 4.6
**Version Tested:** 1.7.0 (Waves 1-20 complete)

---

## Executive Summary

**Verdict:** YES -- Adopt

MemoryForge v1.7.0 is a targeted maintenance release that delivers on the specific validation and testing improvements promised in Wave 20. The core persistent memory loop remains excellent and unchanged. The new features -- config schema validation, per-field size limits, lock contention warnings, and 8 additional tests -- close gaps identified in Round 6 without introducing regressions. However, this wave also reveals version inconsistencies between installers and runtime components, and the PowerShell installer still lacks the uninstall confirmation prompt added to the bash installer in v1.6.0.

**Weighted Score:** 8.7/10 (vs 8.6 in R6)

**Key Strengths:**
- Config schema validation catches typos like `keepDecisiosnFull` -- a real quality-of-life win
- Per-field 5KB limit prevents abuse while allowing generous input (was previously only 50KB total)
- 58 tests (up from 50) with dedicated checkpoint rotation, concurrency, and symlink attack tests
- Shellcheck promoted to `-S error` -- CI now fails on any shellcheck warning, not just errors
- Lock contention is now surfaced to the user instead of silently proceeding

**Remaining Issues:** 10 bugs found (0 P1, 1 P2, 9 P3). The P2 is a version string mismatch between installers and runtime.

---

## Dimension Scores

| Dim | Name | Score | Change from R6 |
|-----|------|-------|----------------|
| D1 | Install & Setup | 9/10 | 0 |
| D2 | Daily Workflow | 8/10 | 0 |
| D3 | Context Recovery | 9/10 | 0 |
| D4 | Configuration | 9/10 | 0 |
| D5 | Documentation | 9/10 | 0 |
| D6 | Reliability | 9/10 | +1 |
| D7 | Value / Effort | 9/10 | 0 |
| **Average** | | **8.7/10** | **+0.14** |

---

## D1: Install & Setup -- 9/10

**What it measures:** Time from zero to working memory. Steps required, prerequisites, friction points.

### The Good

1. **Install experience unchanged from R6 -- still excellent:**
   - Sub-2-minute install from clone to working briefing
   - Dry-run mode for brownfield preview
   - Smart-merge preserves existing hooks
   - Cross-platform parity (bash + PowerShell)
   - Uninstall preserves `.mind/` state files

2. **Uninstall confirmation prompt works (bash):**
   - install.sh lines 152-166 now prompt `Continue? [y/N]` before uninstall
   - Skipped in `--dry-run` mode (correct behavior)
   - This was Bug #1 from R6 -- fixed

3. **Version upgrade detection works (bash):**
   - install.sh lines 772-775 detect `.memoryforge-version` and show `Upgrade detected: X -> Y`
   - This was Bug #3 from R6 -- partially fixed (see issues below)

### The Issues

**Bug #1 (P2): Version strings inconsistent between installers and runtime**
- **Location:** install.sh:24 (`MEMORYFORGE_VERSION="1.6.0"`), install.ps1:33 (`$MemoryForgeVersion = "1.6.0"`)
- **Contrast:** mcp-memory-server.js:614 (`version: '1.7.0'`), health-check.js:29 (`MEMORYFORGE_VERSION = '1.7.0'`)
- **Impact:** Significant -- the installer writes "1.6.0" to `.memoryforge-version`, then health-check reads it and reports "Installed version 1.6.0 differs from 1.7.0". This creates a false version mismatch alert on every fresh install of what is supposed to be v1.7.0. Users will see a spurious warning immediately after install.
- **Fix needed:** Update `install.sh:24` and `install.ps1:33` to `1.7.0`
- **Severity rationale:** P2 because it directly misleads users about their installation health and version status

**Bug #2 (P3): PowerShell installer lacks uninstall confirmation prompt**
- **Location:** install.ps1 lines 87-98 (uninstall section)
- **Current:** Proceeds directly to removal without confirmation
- **Compare:** install.sh lines 152-166 has `read -r -p "Continue? [y/N]" CONFIRM`
- **Impact:** Moderate -- Windows users can accidentally uninstall without confirmation
- **Fix needed:** Add `Read-Host "Continue? [y/N]"` with pattern matching, matching bash behavior

**Bug #3 (P3): CHANGELOG.md lists 8 items in Wave 20 header but only describes 7 distinct changes**
- **Location:** CHANGELOG.md:7 says "Wave 20: Validation & Testing (8 items)"
- **Issue:** Counting the items in the changelog body, there are 8 bullet points but "58 tests" is listed as a separate item when it is the cumulative result of the other items, not an independent change
- **Impact:** Cosmetic -- no functional impact
- **Fix needed:** Clarify count or adjust header

### Score Rationale

**9/10 unchanged from R6:** The version string mismatch (Bug #1) is a P2 that undermines the install experience, but it is a simple fix (2 lines to change). The core install flow is still excellent. The PowerShell confirmation prompt gap is an R6 carryover that should have been addressed. No new install features warrant a score increase; no regressions warrant a decrease beyond what the bugs offset.

---

## D2: Daily Workflow -- 8/10

**What it measures:** Per-prompt overhead, latency, noise level. Does it help or get in the way during a coding session?

### The Good

1. **Lock contention warnings are a genuine improvement:**
   - mcp-memory-server.js:134 adds a warning to MCP tool responses when lock acquisition fails
   - Previously, contention was logged silently to `.mcp-errors.log` -- users never saw it
   - Now the agent sees `Warning: Could not acquire write lock -- another process may be writing to .mind/ concurrently`
   - For solo devs, this almost never fires (single session), but it provides useful diagnostics if you accidentally start two Claude instances on the same project

2. **Per-field 5KB limit is well-calibrated:**
   - mcp-memory-server.js:28 (`MAX_FIELD_SIZE = 5 * 1024`)
   - Applied per-string-field inside tool arguments (lines 660-688)
   - 5KB per field is generous for any normal state update, decision, or progress entry
   - Prevents a single field from consuming the 50KB total budget
   - Error message is clear: `Field "status" too large (6000 chars, max 5120 per field)`

3. **Schema validation in compress-sessions.js warns on bad config keys:**
   - compress-sessions.js:58-63 warns to stderr when unknown keys are found
   - This fires during auto-compression (session-start), so you see it when it matters
   - Example: `[MemoryForge] Warning: unknown config key(s): keepDecisiosnFull -- check for typos`

4. **Daily workflow is otherwise unchanged from R6:**
   - User-prompt caching still works (verified in tests/hooks.test.js:128-139)
   - Progressive briefings still gate on 8KB threshold
   - Stale STATE.md warning still fires after configured interval

### The Issues

**Bug #4 (P3): task-completed.sh calls node 4 times for JSON parsing**
- **Location:** task-completed.sh:26-43
- **Current:** Lines 26-39 parse JSON into TASK_INFO, then lines 41-43 each call node again to extract `id`, `subject`, `teammate` from the same JSON
- **Compare:** subagent-stop.sh consolidates all parsing into a single node invocation (optimized in Wave 18)
- **Impact:** Low -- ~200ms extra per task completion event. Task completions are infrequent.
- **Fix needed:** Consolidate into 1 node invocation that outputs all 3 fields (same pattern as subagent-stop.sh)

**Bug #5 (P3): appendMindFile does not use atomic writes**
- **Location:** mcp-memory-server.js:120-130
- **Current:** Uses `fs.appendFileSync()` directly, no tmp+rename
- **Compare:** writeMindFile (line 105-118) uses proper atomic tmp+rename pattern
- **Impact:** Low -- append is inherently safer than overwrite (partial append only loses the appended data, not the entire file). But under concurrent access with lock contention, a partial append could leave DECISIONS.md or SESSION-LOG.md with truncated entries.
- **Fix needed:** Consider using read-append-write-rename for full atomicity, or document the intentional tradeoff

### Score Rationale

**8/10 unchanged from R6:** The lock contention warning and per-field limits are nice hardening, but neither changes the daily workflow experience for a solo dev. The workflow was already smooth. The fundamental gaps remain: no visual indicator during briefing generation, no progress bar for large dashboards, no auto-refresh on fleet dashboard. Wave 20 was not targeting workflow improvements, so no change is expected.

---

## D3: Context Recovery -- 9/10

**What it measures:** Quality of briefing after compaction, restart, or resume. Does Claude pick up where it left off?

### The Good

1. **Checkpoint rotation boundary is now tested:**
   - tests/hooks.test.js:186-231 adds 2 dedicated tests for checkpoint pruning
   - Tests cover default limit (10) and custom config limit (5)
   - This was Bug #8 from R6 -- now addressed

2. **Context recovery mechanism unchanged:**
   - Pre-compact saves checkpoint, session-start re-injects full briefing
   - Progressive briefings gate on post-compaction (always full)
   - TF-IDF hybrid search for deep recovery queries
   - All of this continues to work as designed

### The Issues

No new issues found. R6 bugs #4 (prompt-context cache scope), #5 (stop-checkpoint rate limiting), and #6 (checkpoint debounce) are unchanged -- all were classified as by-design in R6 and remain so.

### Score Rationale

**9/10 unchanged from R6:** Context recovery was already excellent. The checkpoint rotation test addresses a test gap, not a functional gap. The recovery loop itself has not changed and continues to work flawlessly. A 10/10 would require automatic semantic session summaries and time-based snapshot/rewind, which are still absent.

---

## D4: Configuration -- 9/10

**What it measures:** Sensible defaults, override ease, bounds checking, documentation of options.

### The Good

1. **Config schema validation is the headline feature of Wave 20:**
   - health-check.js:32-43 defines `KNOWN_CONFIG_KEYS` set (10 known keys)
   - health-check.js:82-84 reports unknown keys: `Unknown config key(s): keepDecisiosnFull -- check for typos`
   - compress-sessions.js:29-63 also validates and warns to stderr during compression
   - This was explicitly called out as missing in R6 D4 score rationale -- now addressed
   - Tested: hooks.test.js:235-261 creates a config with typo keys, verifies health-check reports them

2. **Number.isSafeInteger consistency across all validators:**
   - health-check.js:88-107 validates all 10 numeric config keys with `Number.isSafeInteger()`
   - Tested: hooks.test.js:264-288 creates config with `1e308` and `-5`, verifies rejection
   - This matches the validation in compress-sessions.js and MCP server

3. **Defaults remain excellent -- no config needed to start:**
   - All 10 options have sensible defaults documented in template
   - Config is optional -- scripts use hardcoded defaults when config is missing
   - Config is pure JSON -- no code execution risk

### The Issues

**Bug #6 (P3): `maxCheckpointFiles` not documented in README configuration table**
- **Location:** README.md:276-289 (configuration table)
- **Current:** Table lists 9 settings, omits `maxCheckpointFiles`
- **Exists in:** templates/memoryforge.config.json.template:12, health-check.js:42, KNOWN_CONFIG_KEYS
- **Impact:** Low -- the config template is self-documenting, so users who copy it will see the option
- **Fix needed:** Add `maxCheckpointFiles | 10 | Timestamped checkpoints to keep` to README table

**Bug #7 (P3): Schema validation only warns -- does not suggest closest match**
- **Location:** health-check.js:82-84
- **Current:** Says `Unknown config key(s): keepDecisiosnFull`
- **Missing:** Does not suggest "Did you mean keepDecisionsFull?" via Levenshtein distance
- **Impact:** Low -- the user still needs to check the template to find the correct key name
- **Fix needed:** Add a simple edit-distance suggestion for typos within 2 edits

### Score Rationale

**9/10 unchanged from R6:** Schema validation is a direct improvement to configuration, and it was the primary gap identified in R6. However, the validation is warn-only (no blocking), doesn't suggest corrections, and `maxCheckpointFiles` is missing from the README table. These are minor gaps that keep it at 9 rather than pushing to 10. A score increase to 10 would require: autocorrect suggestions, config linting CLI command, and complete documentation coverage.

Note: I considered increasing to 9.5 for the schema validation addition, but rounding to integers, it stays at 9 because the remaining gaps (no suggestion, missing doc, no standalone validate command) are meaningful.

---

## D5: Documentation -- 9/10

**What it measures:** README clarity, troubleshooting coverage, FAQ quality, examples. Can I self-serve?

### The Good

1. **CHANGELOG.md v1.7.0 is well-documented:**
   - All 8 Wave 20 items listed with clear descriptions
   - References bug numbers from previous rounds
   - Test count tracked (50 -> 58)

2. **README testing section updated:**
   - README.md:462-473 now shows 58 tests with the correct breakdown (23+9+14+12)
   - Describes shellcheck `-S error` promotion
   - Each test file listed with purpose and count

3. **FAQ Windows answer improved (R6 fix carried forward):**
   - README.md:413-416 now mentions Git Bash auto-detection by Claude Code
   - This was Bug #2 from R6 -- fixed in v1.6.0, still present

4. **Documentation quality otherwise unchanged:**
   - TROUBLESHOOTING.md covers 8 common issues with real commands
   - Architecture and hooks references remain thorough
   - Templates and filled example still available

### The Issues

**Bug #8 (P3): README still doesn't explain when to use project vs user-level install**
- **Location:** README.md:303-311
- **Current:** Table shows differences but not decision criteria
- **This is Bug #7 from R6 -- unfixed**
- **Impact:** Low -- default (project-level) is correct for most solo devs
- **Fix needed:** Add a "Which should I choose?" note

**Bug #6 (P3, duplicate): `maxCheckpointFiles` missing from README config table**
- Already listed under D4

### Score Rationale

**9/10 unchanged from R6:** Documentation remains excellent. Wave 20 did not target documentation improvements. The README config table gap and project-vs-user guidance are carried-forward P3s from R6. The TROUBLESHOOTING.md additions from v1.6.0 are still solid. No regressions found.

---

## D6: Reliability -- 9/10 (+1)

**What it measures:** Test coverage, cross-platform parity, error handling, edge case robustness.

### The Good

1. **8 new tests bring total to 58:**
   - MCP: 20 -> 23 (+3: per-field limit, concurrency, symlink config)
   - Hooks: 7 -> 12 (+5: checkpoint rotation x2, schema validation x2, symlink config x1)
   - Vector: 14 (unchanged)
   - Compress: 9 (unchanged)

2. **Concurrency test is well-designed:**
   - tests/mcp-server.test.js:465-495 spawns 2 MCP servers at the same `.mind/` directory
   - Issues concurrent `memory_update_state` calls via `Promise.all`
   - Verifies both succeed (advisory locking is non-blocking), no data corruption
   - Checks that `STATE.md` has valid content after concurrent writes
   - This was Bug #9 from R6 (missing test) -- now addressed

3. **Checkpoint rotation boundary tests cover both directions:**
   - tests/hooks.test.js:186-209 creates 12 checkpoints, runs pre-compact, verifies <= 10 remain
   - tests/hooks.test.js:211-231 tests with custom `maxCheckpointFiles=5` config
   - This was Bug #8 from R6 -- now addressed

4. **Symlink config test is platform-aware:**
   - tests/mcp-server.test.js:498-531 skips on Windows (symlinks need elevation)
   - tests/hooks.test.js:290-313 also skips on Windows
   - Creates real symlink, verifies health-check reports it as invalid

5. **Shellcheck `-S error` is meaningful:**
   - ci.yml:70 now runs `shellcheck -s bash -S error scripts/hooks/*.sh install.sh`
   - Previous: `-S warning` (warnings were informational only)
   - Now: Any shellcheck diagnostic fails CI
   - This raises the quality bar for all hook scripts

6. **Per-field validation adds defense-in-depth:**
   - mcp-memory-server.js:660-688 validates every string field and every array string element
   - 5KB per field is strict enough to prevent abuse, generous enough for normal use
   - Tested: tests/mcp-server.test.js:449-462

### The Issues

**Bug #9 (P3): No test for the lock contention warning message content**
- **Location:** tests/mcp-server.test.js:465-495
- **Current:** Concurrency test verifies no crash and no data corruption, but does not assert that the contention warning text appears in the tool response
- **Issue:** mcp-memory-server.js:134 adds CONTENTION_WARNING to responses when lock fails, but this is never tested -- the test only checks `result.isError` and content text for "updated"/"created"
- **Impact:** Low -- the warning mechanism works (verified by code review), just not asserted in tests
- **Fix needed:** When contention IS detected (check error log), assert that at least one response includes the warning text

**Bug #10 (P3): Symlink config test in mcp-server.test.js doesn't actually test config rejection**
- **Location:** tests/mcp-server.test.js:498-531
- **Current:** Creates a symlink config, spawns the MCP server, calls `memory_status` -- only verifies the server "responds normally"
- **Issue:** The test comment says "ignores symlinked config file" but the MCP server itself does not load the config file. The compress-sessions.js and hook scripts load config. The test verifies the server doesn't crash with a symlinked config present, but it doesn't verify that the symlinked config values (keepSessionsFull: 999) are ignored.
- **Impact:** Low -- the symlink check is tested more effectively in hooks.test.js:290-313 via health-check
- **Fix needed:** Either remove the misleading test name or test config loading through compress-sessions.js

### Test Coverage by Module (Updated)

| Module | Tests | Coverage | Change from R6 | Gaps |
|--------|-------|----------|----------------|------|
| MCP server | 23 | Excellent | +3 | Contention warning text not asserted |
| Vector memory | 14 | Good | 0 | No change |
| Compression | 9 | Good | 0 | No change |
| Hooks | 12 | Good | +5 | user-prompt-context cache invalidation untested |
| Installer | 0 | None | 0 | Still no automated tests |
| Dashboard | 0 | None | 0 | Still no tests |
| Health-check | 0 | None | 0 | Tested indirectly via hooks.test.js |

### Score Rationale

**9/10, up from 8/10 in R6:** This is a legitimate +1 improvement. The test count went from 50 to 58, covering concurrency, checkpoint rotation boundaries, symlink attacks, and config schema validation. Shellcheck `-S error` raises the bar for hook script quality. The concurrency test directly addresses a gap I flagged in R6 (no load testing). The remaining gaps (installer tests, dashboard tests, fuzzing, soak testing) prevent a 10, but 9 is warranted by the systematic closing of R6 test gaps.

---

## D7: Value / Effort -- 9/10

**What it measures:** Overall ROI. Does the benefit justify the install, learning curve, and ongoing overhead?

### Value Analysis

**Wave 20 value for solo devs:**
- Config schema validation: Saves 10-30 minutes of debugging when you typo a config key. Without it, typos are silently ignored and the default value is used, which can be confusing when your override "doesn't work."
- Per-field limits: Prevents accidental context budget exhaustion. Unlikely to affect solo devs directly.
- Lock contention warning: Almost never fires for solo devs (single session). More useful for team workflows.
- Tests and shellcheck: No direct user-facing value, but increases confidence in correctness.

**Net value of v1.7.0 over v1.6.0 for solo devs:** Small incremental improvement. The config validation is the only feature with direct daily impact. The core value proposition (persistent memory through compaction) is unchanged.

### Effort Analysis

**Upgrade from v1.6.0 to v1.7.0:**
- Effort: Re-run installer (2 minutes)
- Risk: None -- backward compatible
- Note: Installer will write "1.6.0" to version file due to Bug #1, but this is cosmetic

**First-time install:**
- Same as R6: ~10 minutes setup + 2 min/session + 1 hour learning curve

### Score Rationale

**9/10 unchanged from R6:** Value remains outstanding for solo devs. Wave 20 adds incremental hardening value but doesn't change the fundamental ROI equation. The 1-point gap from 10 is still: manual STATE.md updates required, learning curve exists, per-session overhead is nonzero.

---

## Bugs Found

### Summary

- **Total bugs:** 10
- **P1 (critical):** 0
- **P2 (significant):** 1
- **P3 (minor):** 9

### Bug List

1. **[P2] Version strings inconsistent: installers say 1.6.0, runtime says 1.7.0**
   - Files: install.sh:24, install.ps1:33 (say "1.6.0") vs mcp-memory-server.js:614, health-check.js:29 (say "1.7.0")
   - Impact: Significant -- fresh installs will write wrong version, health-check will immediately report mismatch
   - Fix: Update install.sh:24 and install.ps1:33 to "1.7.0"

2. **[P3] PowerShell installer lacks uninstall confirmation prompt**
   - File: install.ps1:87-98 (uninstall section)
   - Impact: Moderate -- Windows users can accidentally uninstall without confirmation
   - Fix: Add `Read-Host` confirmation matching install.sh:152-166 behavior

3. **[P3] CHANGELOG.md Wave 20 item count discrepancy**
   - File: CHANGELOG.md:7 says "8 items" but "58 tests" line is a summary, not a distinct item
   - Impact: Cosmetic
   - Fix: Clarify count

4. **[P3] task-completed.sh calls node 4 times for JSON parsing**
   - File: task-completed.sh:26-43
   - Impact: Low -- ~200ms extra per task completion (infrequent event)
   - Fix: Consolidate to 1 node invocation (match subagent-stop.sh pattern)

5. **[P3] appendMindFile uses non-atomic writes**
   - File: mcp-memory-server.js:120-130
   - Impact: Low -- append is inherently safer than overwrite; risk only under contention
   - Fix: Consider read-append-write-rename, or document as intentional tradeoff

6. **[P3] `maxCheckpointFiles` not documented in README configuration table**
   - File: README.md:276-289
   - Impact: Low -- config template is self-documenting
   - Fix: Add row to README config table

7. **[P3] Schema validation does not suggest closest match for typos**
   - File: health-check.js:82-84
   - Impact: Low -- user must manually check template for correct key
   - Fix: Add simple Levenshtein distance suggestion

8. **[P3] README still missing project vs user-level decision criteria**
   - File: README.md:303-311
   - Impact: Low -- default is correct for most users
   - Fix: Add "Which should I choose?" section
   - Note: Carried forward from R6 Bug #7 -- still unfixed

9. **[P3] Concurrency test does not assert contention warning text**
   - File: tests/mcp-server.test.js:465-495
   - Impact: Low -- warning mechanism works (code review verified), just not asserted
   - Fix: Assert warning text presence when contention is detected

10. **[P3] Symlink config test in MCP server tests is misleading**
    - File: tests/mcp-server.test.js:498-531
    - Impact: Low -- more effective symlink test exists in hooks.test.js:290-313
    - Fix: Rename test or test config loading through compress-sessions.js

---

## Recommendations

### For Immediate Action (Before v1.7.0 Release)

1. **Fix version strings** -- update install.sh:24 and install.ps1:33 to "1.7.0". This is the only P2 and should block release.
2. **Add PowerShell uninstall confirmation** -- parity with bash installer

### For Future Waves

1. **Add installer tests** -- verify install.sh and install.ps1 produce correct output on all 3 platforms (still missing since R4)
2. **Add dashboard tests** -- verify HTML generation on edge cases
3. **Add config suggestion** -- Levenshtein distance for typo correction in schema validation
4. **Document `maxCheckpointFiles`** in README config table
5. **Add project-vs-user decision criteria** to README (carried forward 2 rounds)
6. **Consolidate task-completed.sh** JSON parsing into 1 node invocation
7. **Consider atomic appends** for DECISIONS.md and SESSION-LOG.md under contention
8. **Add load tests** -- 1000 sessions, 500 decisions, 10MB STATE.md (still requested since R6)

### For Power Users

- Enable `--with-vector` for semantic search (no downsides)
- Customize thresholds via `.memoryforge.config.json` only if defaults don't fit
- If you see "Unknown config key" warnings after upgrade, check the template for correct key names
- Use `node scripts/health-check.js /path/to/project` to validate your installation

---

## Conclusion

MemoryForge v1.7.0 is a solid maintenance release that delivers exactly what was promised: config schema validation, per-field size limits, lock contention visibility, and expanded test coverage. The core persistent memory loop continues to work flawlessly for solo developers. The 8 new tests close specific gaps identified in R6 (checkpoint rotation, concurrency, symlink attacks), and the shellcheck promotion to `-S error` raises the bar for hook script quality.

The one real issue is the version string mismatch (P2) between installers (1.6.0) and runtime components (1.7.0), which is a 2-line fix that should be addressed before shipping. The remaining 9 bugs are all P3 polish items, none affecting core functionality.

**Verdict: YES -- Adopt.** If you are already on v1.6.0, the upgrade is low-risk and provides the config typo detection feature, which saves real debugging time. If you are installing fresh, fix the version string issue first (or accept the cosmetic health-check warning). The persistent memory loop remains the best available solution for context continuity in Claude Code.

**Score: 8.7/10** -- a marginal improvement over R6's 8.6, driven by the +1 in Reliability (D6). The other 6 dimensions hold steady, reflecting a maintenance wave rather than a feature wave.

---

**Benchmark completed:** 2026-02-15
**Evaluator:** Claude Opus 4.6 (Solo Developer persona)
**Next evaluation:** Recommended after Wave 21 or when installer tests and load tests are added
