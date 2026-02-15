# MemoryForge Benchmark Round 6 — Post-Wave 19

**Date:** 2026-02-15
**Version:** 1.6.0 (Waves 1-19 complete)
**Spec:** [BENCHMARK-SPEC.md](BENCHMARK-SPEC.md) v1 — fixed personas, fixed dimensions
**Evaluators:** 5 AI personas (Claude Opus 4.6), independent parallel evaluation

---

## Verdicts

| Persona (Share) | Verdict |
|-----------------|---------|
| Solo Developer (40%) | **Yes** — Production-ready, minimal friction, 9 P3 bugs only |
| Team Developer (25%) | **Conditional** — Strong technical quality, concurrent access safety still a gap |
| AI Power User (15%) | **Yes** — Best-in-class hook architecture (10/10), joy to extend |
| Security Engineer (10%) | **Yes** — First Yes from Security! 0 P1/P2, 15 P3 hardening items |
| Non-Technical Builder (10%) | **Conditional** — World-class visuals (10/10), install barrier remains |

---

## Scores

| Persona (Share) | D1 | D2 | D3 | D4 | D5 | D6 | D7 | Avg |
|-----------------|----|----|----|----|----|----|----|----|
| **Solo Dev (40%)** | 9 | 8 | 9 | 9 | 9 | 8 | 9 | **8.57** |
| **Team Dev (25%)** | 8 | 9 | 9 | 7 | 9 | 9 | 8 | **8.43** |
| **AI Power User (15%)** | 9 | 10 | 8 | 9 | 9 | 8 | 9 | **8.71** |
| **Security Eng (10%)** | 10 | 9 | 9 | 9 | 9 | 9 | 8 | **9.00** |
| **Non-Technical (10%)** | 9 | 5 | 8 | 6 | 9 | 10 | 9 | **8.00** |

**Unweighted Average: 8.54/10**
**Market-Weighted Average: 8.55/10**
*(Solo 40% x 8.57 + Team 25% x 8.43 + Power 15% x 8.71 + Security 10% x 9.00 + NonTech 10% x 8.00)*

---

## Score Trend (fixed personas from R5 onward)

| Round | Version | Weighted Avg | Solo Dev | Team Dev | Power User | Security | Non-Tech |
|-------|---------|-------------|----------|----------|------------|----------|----------|
| R4 (baseline) | 1.4.0 | 7.10 | 7.86 | 6.57 | 6.86 | 6.86 | 6.14 |
| R5 | 1.5.0 | 7.97 | 8.57 | 7.71 | 8.43 | 7.43 | 6.43 |
| **R6** | **1.6.0** | **8.55** | **8.57** | **8.43** | **8.71** | **9.00** | **8.00** |
| **Delta R5→R6** | | **+0.58** | **0.00** | **+0.72** | **+0.28** | **+1.57** | **+1.57** |
| **Delta R4→R6** | | **+1.45** | **+0.71** | **+1.86** | **+1.85** | **+2.14** | **+1.86** |

**Every persona at or above R5 levels.** Largest R5→R6 gains: Security Engineer (+1.57) and Non-Technical Builder (+1.57), driven by Wave 19's advisory locking, symlink checks, config validation, tracking rotation, and dashboard polish.

### Milestones

- **Security Engineer: first "Yes" verdict** (was Conditional in R4 and R5) — 0 P1, 0 P2 bugs found
- **AI Power User: first 10/10 dimension** — Hook Architecture rated perfect
- **Non-Technical: first 10/10 dimension** — Visual Feedback rated perfect
- **0 P1 and 0 P2 bugs** across all 5 personas (first time in project history)

---

## Dimension Key

| Persona | D1 | D2 | D3 | D4 | D5 | D6 | D7 |
|---------|----|----|----|----|----|----|-----|
| Solo Dev | Install & Setup | Daily Workflow | Context Recovery | Configuration | Documentation | Reliability | Value / Effort |
| Team Dev | Team Adoption | Multi-Project | Technical Quality | Operational Safety | Search & Retrieval | Growth Handling | Integration |
| Power User | MCP Protocol | Hook Architecture | Extensibility | Search Quality | State Management | Agent Support | Innovation |
| Security | Supply Chain | Input Validation | Injection Safety | Data Handling | Config Security | CI & Testing | Audit & Logging |
| Non-Technical | Onboarding Clarity | Install Simplicity | Concept Accessibility | Error Recovery | Templates & Examples | Visual Feedback | Confidence |

---

## Consensus Strengths (3+ personas)

1. **Zero-dependency architecture** — All 5 personas praised this. Supply Chain (10/10), no npm, pure Node.js. Security called it "best-in-class." The single strongest property of the project, now in its third consecutive round of universal praise.

2. **Compaction survival loop works flawlessly** — Solo Dev (D3=9), Power User (D2=10, "architectural brilliance"), Team Dev (D3=9). The killer feature continues to deliver. Power User noted no other Claude Code memory system solves compaction survival this elegantly.

3. **Advisory locking + atomic writes** — Wave 19's flagship fix. Security (D4=9), Power User (D5=9), Team Dev (D4=7, acknowledges improvement). Exclusive `flag:'wx'` creation + stale lock detection + tmp+rename pattern. Contention logged.

4. **Comprehensive test suite and CI** — 50 tests across 4 suites, 3 OS x 3 Node versions. Security (D6=9), Team Dev (D3=9), Solo Dev (D6=8), Power User (D1=9). Now with hooks.test.js, shellcheck, and JSON template validation in CI.

5. **Hybrid TF-IDF semantic search** — Zero-dep search with mtime caching. Team Dev (D5=9), Power User (D4=9), Solo Dev (D3=9). Stemmer fix, TOCTOU fix, file size guard all landed in Waves 18-19.

6. **World-class visual dashboards** — Non-Technical (D6=10/10, "best-in-class for a CLI tool"), Team Dev (D2=9), Solo Dev (D2=8). Fleet dashboard with stale project warnings, responsive design, auto-open with fallback URLs.

7. **Excellent templates and examples** — Non-Technical (D5=9), Solo Dev (D5=9), Team Dev (D1=8). 4 project templates + filled-in mid-project example solve the "blank page" problem.

---

## Consensus Gaps (3+ personas)

1. **Installation barrier for non-technical users** — Non-Technical (D2=5), Solo Dev notes missing first-run wizard. 4+ terminal commands, no GUI installer, path specification confusion. Biggest remaining accessibility gap.

2. **Lock contention not surfaced to user** — Team Dev (D4=7), Security (Bug #14), Power User notes advisory locking is cooperative. Write continues silently when lock fails. Needs MCP tool error response or warning.

3. **Missing tests for security features** — Security (Bugs #9, #10), Solo Dev (Bugs #8, #9). No concurrency test for advisory locking, no symlink attack test, no checkpoint rotation boundary test.

4. **Error messages contain jargon** — Non-Technical (D4=6, Bug #2), Security notes error logs leak absolute paths. "Path traversal blocked" and "Lock contention" unintelligible to non-technical users.

---

## Bugs Found (deduplicated, 28 unique across all personas)

All bugs are P3 (minor). **0 P1, 0 P2** — a first in project history.

| # | Bug | Found By |
|---|-----|----------|
| 1 | No upgrade warning when installing over older version | Solo Dev |
| 2 | Health-check watch mode uses polling, not event-based (`fs.watch`) | Team Dev, Security |
| 3 | Fleet dashboard should use Git commit timestamps, not file mtime | Team Dev |
| 4 | Lock acquisition failure should warn user, not proceed silently | Team Dev, Security |
| 5 | Config symlink check missing from health-check.js, dashboard.js, fleet-dashboard.js | Team Dev |
| 6 | Config symlink check should validate target path (readlinkSync + bounds check) | Power User |
| 7 | No bulk operations in fleet dashboard (compress-all, health-check-all) | Team Dev |
| 8 | Hook timeout values not configurable (hardcoded in settings.json) | Team Dev |
| 9 | No rollback mechanism for failed compression (`--rollback` flag) | Team Dev |
| 10 | extractSection() 200-char heading limit feels arbitrary, undocumented | Power User |
| 11 | No plugin API documentation (missing docs/PLUGIN-API.md) | Power User |
| 12 | No per-field length limits in memory_update_state (50KB total, but single field unbounded) | Security |
| 13 | Dashboard/fleet-dashboard auto-open uses execSync with string interpolation | Security |
| 14 | health-check.js missing Number.isSafeInteger() for config validation | Security |
| 15 | shellcheck warnings not promoted to errors in CI (`-S warning` not `-S error`) | Security |
| 16 | No audit trail of MCP tool invocations (only errors logged) | Security |
| 17 | No tamper detection for log files (append-only text, no checksums) | Security |
| 18 | No test for concurrent lock contention (spawn 2 MCP servers) | Security |
| 19 | No test for symlink config attack | Security |
| 20 | No GUI installer for non-technical users | Non-Technical |
| 21 | Error messages contain jargon ("path traversal", "lock contention") | Non-Technical |
| 22 | README missing project vs user-level decision criteria | Solo Dev |
| 23 | No test for checkpoint rotation boundary condition (exactly N checkpoints) | Solo Dev |
| 24 | No CI test for user-prompt-context caching behavior | Solo Dev |
| 25 | Error logs may leak absolute file paths in stack traces | Security |
| 26 | SESSION-LOG/DECISIONS not flagged for review before commit in SECURITY.md | Security |
| 27 | Error log rotation (tail -n 500) may truncate mid-stack-trace | Security |
| 28 | Git command injection risk if CLAUDE_PROJECT_DIR overridden (mitigated) | Security |

---

## Per-Persona Detail

### Solo Developer — 8.57/10 (40%) — Yes

Best scores: Install (9), Context Recovery (9), Configuration (9), Documentation (9), Value (9). Core user experience is excellent. ROI estimated at 18-36x ongoing. All 9 bugs are polish (P3), zero blockers. Compared to R5 (8.57): stable — already at high quality, minor refinements.

### Team Developer — 8.43/10 (25%) — Conditional

Best scores: Multi-Project (9), Technical Quality (9), Search (9), Growth (9). Largest improvement: D2 Multi-Project +4 from R4 (fleet dashboard, health-check watch mode, stale warnings). Blocked by: concurrent access safety (D4=7). Advisory locking helps but last-write-wins still possible under heavy concurrency. 8 P3 bugs.

### AI Power User — 8.71/10 (15%) — Yes

Best scores: Hook Architecture (10/10), MCP Protocol (9), Search Quality (9), State Management (9), Innovation (9). First perfect 10 in any dimension across all rounds. Called the persistent memory loop "architectural brilliance." Extensibility jumped +3 from R4 thanks to module exports and clean APIs. 3 P3 bugs.

### Security Engineer — 9.00/10 (10%) — Yes

Best scores: Supply Chain (10), Input Validation (9), Injection Safety (9), Data Handling (9), Config Security (9), CI & Testing (9). First "Yes" verdict from Security. All P1/P2 bugs from R4 and R5 are fixed. 15 P3 hardening items found (deeper analysis than previous rounds). OWASP Top 10 coverage assessed: all applicable categories addressed. Called it "production-ready from a security perspective."

### Non-Technical Builder — 8.00/10 (10%) — Conditional

Best scores: Visual Feedback (10/10, "best-in-class for a CLI tool"), Onboarding Clarity (9), Templates (9), Confidence (9). Largest dimension jump: D3 Concept Accessibility +4 from R4. Blocked by: Install Simplicity (D2=5, no GUI) and Error Recovery (D4=6, troubleshooting requires terminal). Only 2 P3 bugs — the non-technical gaps are feature requests, not code bugs.

---

## Improvement Roadmap (Wave 20+)

### Wave 20: Validation & Testing (target: 8.8 weighted)
- Config schema validation — reject unknown/typo keys (Bug #22)
- Per-field length limits on MCP tool string parameters (Bug #12)
- Surface lock contention to user as MCP tool warning (Bug #4)
- Add concurrency test for advisory locking (Bug #18)
- Add symlink config attack test (Bug #19)
- Add checkpoint rotation boundary test (Bug #23)
- Promote shellcheck to `-S error` in CI (Bug #15)
- health-check.js Number.isSafeInteger consistency (Bug #14)

### Wave 21: Fleet & Monitoring (target: 9.0 weighted)
- Fleet dashboard bulk operations (compress-all, health-check-all) (Bug #7)
- Fleet dashboard Git commit timestamps (Bug #3)
- Health-check event-based watch mode via fs.watch (Bug #2)
- Optional MCP tool invocation audit trail (Bug #16)
- Upgrade warning when installing over older version (Bug #1)
- Compression rollback mechanism (Bug #9)

### Wave 22: Non-Technical Accessibility (target: 9.1 weighted)
- GUI installer or single-command install (Bug #20)
- User-friendly error message layer (Bug #21)
- "Concepts for Beginners" documentation
- Interactive template selector in installer
- Visual error recovery / troubleshooting dashboard
- Demo GIF or asciinema recording

### Wave 23: Plugin Architecture (target: 9.3 weighted)
- Plugin API documentation (docs/PLUGIN-API.md) (Bug #11)
- MCP tool plugin loader (scan scripts/tools/*.js)
- Agent-to-agent messaging primitives
- Configurable hook timeouts (Bug #8)
- Hook output versioning
- Graph memory extension

---

## Individual Reports

- [Solo Developer](benchmark-r6-solo-dev.md)
- [Team Developer](benchmark-r6-team-dev.md)
- [AI Power User](benchmark-r6-power-user.md)
- [Security Engineer](benchmark-r6-security.md)
- [Non-Technical Builder](benchmark-r6-non-technical.md)
