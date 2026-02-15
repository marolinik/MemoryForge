# MemoryForge Benchmark Round 7 — Post-Wave 20

**Date:** 2026-02-15
**Version:** 1.7.0 (Waves 1-20 complete)
**Spec:** [BENCHMARK-SPEC.md](BENCHMARK-SPEC.md) v1 — fixed personas, fixed dimensions
**Evaluators:** 5 AI personas (Claude Opus 4.6), independent parallel evaluation

---

## Verdicts

| Persona (Share) | Verdict |
|-----------------|---------|
| Solo Developer (40%) | **Yes** — Production-ready, 1 P2 (version mismatch), 9 P3 |
| Team Developer (25%) | **Conditional** — Lock contention now surfaced, but advisory locking remains non-blocking |
| AI Power User (15%) | **Yes** — Best-in-class hook architecture, clean validation APIs |
| Security Engineer (10%) | **Yes** — 0 P1/P2 for second consecutive round, 13 P3 hardening items |
| Non-Technical Builder (10%) | **Conditional** — Install barrier unchanged (D2=5), confidence improved |

---

## Scores

| Persona (Share) | D1 | D2 | D3 | D4 | D5 | D6 | D7 | Avg |
|-----------------|----|----|----|----|----|----|----|----|
| **Solo Dev (40%)** | 9 | 8 | 9 | 9 | 9 | 9 | 9 | **8.86** |
| **Team Dev (25%)** | 8 | 9 | 9 | 8 | 9 | 9 | 8 | **8.57** |
| **AI Power User (15%)** | 9 | 10 | 8 | 9 | 9 | 8 | 9 | **8.86** |
| **Security Eng (10%)** | 10 | 9 | 9 | 9 | 9 | 10 | 9 | **9.29** |
| **Non-Technical (10%)** | 9 | 5 | 8 | 6 | 9 | 10 | 10 | **8.14** |

**Unweighted Average: 8.74/10**
**Market-Weighted Average: 8.76/10**
*(Solo 40% x 8.86 + Team 25% x 8.57 + Power 15% x 8.86 + Security 10% x 9.29 + NonTech 10% x 8.14)*

---

## Score Trend (fixed personas from R4 onward)

| Round | Version | Weighted Avg | Solo Dev | Team Dev | Power User | Security | Non-Tech |
|-------|---------|-------------|----------|----------|------------|----------|----------|
| R4 (baseline) | 1.4.0 | 7.10 | 7.86 | 6.57 | 6.86 | 6.86 | 6.14 |
| R5 | 1.5.0 | 7.97 | 8.57 | 7.71 | 8.43 | 7.43 | 6.43 |
| R6 | 1.6.0 | 8.55 | 8.57 | 8.43 | 8.71 | 9.00 | 8.00 |
| **R7** | **1.7.0** | **8.76** | **8.86** | **8.57** | **8.86** | **9.29** | **8.14** |
| **Delta R6→R7** | | **+0.21** | **+0.29** | **+0.14** | **+0.15** | **+0.29** | **+0.14** |
| **Delta R4→R7** | | **+1.66** | **+1.00** | **+2.00** | **+2.00** | **+2.43** | **+2.00** |

**All personas improved or held steady.** Wave 20 was a validation & testing wave — gains were incremental but broad. 5 dimensions increased by 1 point each across 4 personas.

### Dimension Changes (R6→R7)

| Persona | Dimension | R6 | R7 | Why |
|---------|-----------|----|----|-----|
| Solo Dev | D6: Reliability | 8 | 9 | 8 new tests (50→58), shellcheck -S error, concurrency + boundary tests |
| Team Dev | D4: Operational Safety | 7 | 8 | Lock contention now surfaced to user, concurrency test added |
| Security | D6: CI & Testing | 9 | 10 | Security-specific tests (symlink, concurrency, boundary), shellcheck -S error |
| Security | D7: Audit & Logging | 8 | 9 | Lock contention warnings visible in tool responses, schema validation warnings |
| Non-Tech | D7: Confidence | 9 | 10 | 58 tests, config typo detection, per-field limits — trust signals |

### Milestones

- **Security Engineer: second consecutive Yes** — 0 P1, 0 P2 for two rounds running
- **Security D6 (CI & Testing): first 10/10** — test coverage now rated exceptional
- **Non-Technical D7 (Confidence): first 10/10** — trust signals rated exceptional
- **All 5 personas at 8+ average** (first time in project history)
- **Weighted score crosses 8.75** — approaching diminishing returns territory

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

1. **Zero-dependency architecture** — All 5 personas praised this for the fourth consecutive round. Supply Chain (10/10), no npm, pure Node.js. The single strongest property of the project.

2. **Compaction survival loop** — Solo Dev (D3=9), Power User (D2=10), Team Dev (D3=9). The killer feature continues to deliver flawlessly through context compaction cycles.

3. **Comprehensive test suite** — Security (D6=10), Solo Dev (D6=9), Team Dev (D3=9), Power User (D1=9). 58 tests across 4 suites, 3 OS x 3 Node versions, shellcheck at error severity. Security rated it exceptional.

4. **Config validation and schema checking** — Solo Dev (D4=9), Security (D5=9), Non-Tech (D7=10). New in Wave 20: unknown key detection, Number.isSafeInteger consistency, per-field limits. Catches typos before they cause confusion.

5. **Hybrid TF-IDF semantic search** — Team Dev (D5=9), Power User (D4=9), Solo Dev (D3=9). Meaning-based search with mtime caching, zero dependencies.

6. **World-class visual dashboards** — Non-Technical (D6=10), Team Dev (D2=9), Solo Dev (D2=8). Fleet dashboard with stale warnings, responsive design.

---

## Consensus Gaps (3+ personas)

1. **Installation barrier for non-technical users** — Non-Technical (D2=5), Solo Dev (Bug: missing first-run wizard). Unchanged since R4. 4+ terminal commands, no GUI installer. Biggest remaining accessibility gap.

2. **appendMindFile not atomic** — Power User (P2), Solo Dev (P3), Team Dev (noted). `writeMindFile` uses tmp+rename but `appendMindFile` uses raw `fs.appendFileSync`. Architectural inconsistency; crash during append can leave partial content.

3. **Installer version mismatch** — Solo Dev (P2), Team Dev (P2), Non-Tech (P2). install.sh and install.ps1 still report 1.6.0 while runtime reports 1.7.0. Quick 2-line fix needed.

4. **KNOWN_CONFIG_KEYS duplicated** — Power User (P3), Security (P3), Team Dev (P3). Same key set defined in compress-sessions.js and health-check.js with no shared module. Consistency risk.

5. **session-start.sh inline Node config loader lacks symlink check** — Power User (P2), Security (P3). The bash portion checks `[ ! -L ... ]` but the embedded Node block reads config via `fs.existsSync()` which follows symlinks.

---

## Bugs Found (deduplicated across all personas)

### P2 (3 unique)

| # | Bug | Found By |
|---|-----|----------|
| 1 | Installer version mismatch: install.sh:24 and install.ps1:33 report "1.6.0", runtime reports "1.7.0" | Solo Dev, Team Dev, Non-Tech |
| 2 | appendMindFile uses non-atomic fs.appendFileSync (writeMindFile uses tmp+rename) | Power User, Solo Dev |
| 3 | session-start.sh inline Node config loader (line 107-110) lacks symlink check | Power User, Security |

### P3 (deduplicated, ~20 unique)

| # | Bug | Found By |
|---|-----|----------|
| 4 | KNOWN_CONFIG_KEYS duplicated in compress-sessions.js and health-check.js — no shared module | Power User, Security, Team Dev |
| 5 | Per-field limit uses string .length (chars) not Buffer.byteLength (bytes) | Power User, Security |
| 6 | task-completed.sh spawns 4 Node processes for one JSON parse | Solo Dev, Power User |
| 7 | withContentionWarning() assumes result.content[0] exists | Power User |
| 8 | withContentionWarning concatenates emoji string into data — should use structured metadata | Power User |
| 9 | Concurrency test does not assert contention warning text | Solo Dev, Power User |
| 10 | Lock contention warning uses developer jargon ("write lock", "concurrent") | Non-Tech |
| 11 | No TROUBLESHOOTING.md entry for lock contention warning | Non-Tech |
| 12 | maxCheckpointFiles not documented in README configuration table | Solo Dev |
| 13 | README missing project vs user-level install decision criteria | Solo Dev, Team Dev |
| 14 | PowerShell installer lacks uninstall confirmation prompt | Solo Dev |
| 15 | .write-lock file not in .gitignore | Security |
| 16 | Config validation accepts non-object JSON values (e.g., `"hello"` or `42`) | Security |
| 17 | health-check watch mode argument injection (user-controlled args passed to execSync) | Security |
| 18 | Dashboard execSync shell injection via crafted .mind/ path | Security |
| 19 | Error logs may contain sensitive absolute file paths in stack traces | Security |
| 20 | No tamper detection mechanism for audit logs | Security |
| 21 | No centralized audit trail of MCP tool invocations | Security |
| 22 | CONTRIBUTING.md lists only 2 of 4 test suites | Power User |
| 23 | Schema validation doesn't suggest closest match for typos | Solo Dev |

---

## Per-Persona Detail

### Solo Developer — 8.86/10 (40%) — Yes

Best scores: D1(9), D3(9), D4(9), D5(9), D6(9), D7(9). Only dimension below 9 is D2 (Daily Workflow, 8). The D6 Reliability increase (8→9) reflects 8 new tests covering concurrency, checkpoint boundaries, and symlink attacks. The version mismatch (P2) is a 2-line fix. 10 bugs total (1 P2, 9 P3).

### Team Developer — 8.57/10 (25%) — Conditional

Best scores: D2(9), D3(9), D5(9), D6(9). D4 Operational Safety improved from 7→8 thanks to lock contention being surfaced to users. Condition: advisory locking remains non-blocking (writes proceed regardless), so true concurrent safety requires team discipline. 9 bugs (1 P2, 8 P3).

### AI Power User — 8.86/10 (15%) — Yes

Scores unchanged from R6 — Wave 20 addressed validation gaps but didn't add new extensibility or agent features. D2 Hook Architecture remains at 10/10. Two P2 bugs: appendMindFile atomicity gap and session-start.sh symlink inconsistency. 11 bugs (2 P2, 9 P3).

### Security Engineer — 9.29/10 (10%) — Yes

Two dimensions improved: D6 CI & Testing (9→10) and D7 Audit & Logging (8→9). Zero P1 and zero P2 for the second consecutive round. 13 P3 hardening items found — deeper than previous rounds. Supply Chain remains at 10/10 (zero dependencies, no external calls). Recommended for adoption.

### Non-Technical Builder — 8.14/10 (10%) — Conditional

D7 Confidence improved (9→10) from trust signals: 58 tests, config typo detection, per-field limits. D2 Install Simplicity (5) and D4 Error Recovery (6) unchanged — Wave 20 was internal quality, not accessibility. The lock contention warning adds new jargon. 5 bugs (1 P2, 4 P3).

---

## Improvement Roadmap (Wave 21+)

### Wave 21: Quick Fixes (target: 8.9 weighted)
- Fix installer version to 1.7.0 (Bug #1 — blocks release)
- Make appendMindFile atomic with tmp+rename (Bug #2)
- Add symlink check to session-start.sh inline Node config load (Bug #3)
- Extract KNOWN_CONFIG_KEYS to shared module (Bug #4)
- Add .write-lock to .gitignore (Bug #15)
- Fix per-field limit to use Buffer.byteLength (Bug #5)
- Consolidate task-completed.sh Node invocations (Bug #6)

### Wave 22: Fleet & Monitoring
- Fleet dashboard bulk operations (compress-all, health-check-all)
- Fleet dashboard Git commit timestamps
- Health-check event-based watch mode via fs.watch
- Optional MCP tool invocation audit trail
- Upgrade warning when installing over older version
- Compression rollback mechanism

### Wave 23: Non-Technical Accessibility (target: 9.0 weighted)
- GUI installer or single-command install
- User-friendly error message layer (rephrase jargon)
- Interactive template selector
- Demo GIF or asciinema recording
- TROUBLESHOOTING.md entry for lock contention

### Wave 24: Plugin Architecture
- Plugin API documentation (docs/PLUGIN-API.md)
- MCP tool plugin loader
- Configurable hook timeouts
- Graph memory extension

---

## Individual Reports

- [Solo Developer](benchmark-r7-solo-dev.md)
- [Team Developer](benchmark-r7-team-dev.md)
- [AI Power User](benchmark-r7-power-user.md)
- [Security Engineer](benchmark-r7-security.md)
- [Non-Technical Builder](benchmark-r7-non-technical.md)
