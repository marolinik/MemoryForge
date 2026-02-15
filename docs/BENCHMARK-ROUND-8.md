# MemoryForge Benchmark Round 8 — Post-Wave 21

**Date:** 2026-02-15
**Version:** 1.8.0 (Waves 1-21 complete)
**Spec:** [BENCHMARK-SPEC.md](BENCHMARK-SPEC.md) v1 — fixed personas, fixed dimensions
**Evaluators:** 5 AI personas (Claude Opus 4.6), independent parallel evaluation

---

## Verdicts

| Persona (Share) | Verdict |
|-----------------|---------|
| Solo Developer (40%) | **Yes** — All R7 P2s fixed, 1 new P2 (missing compress-sessions.js copy), 7 P3 |
| Team Developer (25%) | **Conditional** — 0 P2 bugs remain, condition is advisory (non-blocking) locking architecture |
| AI Power User (15%) | **Yes** — D5 State Management reaches 10/10, 0 P2, 9 P3 |
| Security Engineer (10%) | **Yes** — 0 P1, 1 P2 (health-check watch mode), 3 P3. Third consecutive Yes |
| Non-Technical Builder (10%) | **Yes** — D2 Install Simplicity jumps 5→7, first Yes ever for this persona |

---

## Scores

| Persona (Share) | D1 | D2 | D3 | D4 | D5 | D6 | D7 | Avg |
|-----------------|----|----|----|----|----|----|----|-----|
| **Solo Dev (40%)** | 9 | 8 | 9 | 9 | 9 | 9 | 9 | **8.86** |
| **Team Dev (25%)** | 9 | 9 | 9 | 8 | 9 | 9 | 8 | **8.71** |
| **AI Power User (15%)** | 9 | 10 | 8 | 9 | 10 | 8 | 9 | **9.00** |
| **Security Eng (10%)** | 10 | 9 | 9 | 9 | 10 | 10 | 9 | **9.43** |
| **Non-Technical (10%)** | 9 | 7 | 8 | 7 | 9 | 10 | 10 | **8.57** |

**Unweighted Average: 8.91/10**
**Market-Weighted Average: 8.89/10**
*(Solo 40% x 8.86 + Team 25% x 8.71 + Power 15% x 9.00 + Security 10% x 9.43 + NonTech 10% x 8.57)*

---

## Score Trend (fixed personas from R4 onward)

| Round | Version | Weighted Avg | Solo Dev | Team Dev | Power User | Security | Non-Tech |
|-------|---------|-------------|----------|----------|------------|----------|----------|
| R4 (baseline) | 1.4.0 | 7.10 | 7.86 | 6.57 | 6.86 | 6.86 | 6.14 |
| R5 | 1.5.0 | 7.97 | 8.57 | 7.71 | 8.43 | 7.43 | 6.43 |
| R6 | 1.6.0 | 8.55 | 8.57 | 8.43 | 8.71 | 9.00 | 8.00 |
| R7 | 1.7.0 | 8.76 | 8.86 | 8.57 | 8.86 | 9.29 | 8.14 |
| **R8** | **1.8.0** | **8.89** | **8.86** | **8.71** | **9.00** | **9.43** | **8.57** |
| **Delta R7→R8** | | **+0.13** | **0** | **+0.14** | **+0.14** | **+0.14** | **+0.43** |
| **Delta R4→R8** | | **+1.79** | **+1.00** | **+2.14** | **+2.14** | **+2.57** | **+2.43** |

**Wave 21 was a P2 fix + installer wave.** The biggest impact was on Non-Technical Builder (+0.43), whose D2 Install Simplicity jumped from 5→7 thanks to setup.js. Three other personas gained +0.14 each from targeted dimension improvements.

### Dimension Changes (R7→R8)

| Persona | Dimension | R7 | R8 | Why |
|---------|-----------|----|----|-----|
| Team Dev | D1: Team Adoption | 8 | 9 | Version mismatch fixed, setup.js simplifies team onboarding |
| Power User | D5: State Management | 9 | 10 | appendMindFile now atomic — all write paths crash-safe |
| Security | D5: Config Security | 9 | 10 | All config loaders now have symlink resistance, shared KNOWN_CONFIG_KEYS module |
| Non-Tech | D2: Install Simplicity | 5 | 7 | setup.js interactive installer breaks 4-round D2 plateau |
| Non-Tech | D4: Error Recovery | 6 | 7 | setup.js provides clearer error messages than CLI installers |

### Milestones

- **Non-Technical Builder: first Yes ever** — D2 breaks from 5 to 7, flipping verdict from Conditional to Yes
- **AI Power User: first 9.00 average** — D5 State Management joins D2 Hook Architecture at 10/10
- **Security Engineer: third consecutive Yes** — 0 P1 for three rounds running, D5 Config Security at 10/10
- **Power User D5 (State Management): 10/10** — atomic writes on all paths, advisory locking, contention visibility
- **Security D5 (Config Security): 10/10** — symlink resistance everywhere, shared schema, isSafeInteger validation
- **Weighted score crosses 8.85** — approaching 9.0 territory

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

1. **Zero-dependency architecture** — All 5 personas praised this for the fifth consecutive round. Supply Chain (10/10), no npm, pure Node.js. The single strongest property of the project.

2. **Compaction survival loop** — Solo Dev (D3=9), Power User (D2=10), Team Dev (D3=9). The killer feature continues to deliver flawlessly through context compaction cycles.

3. **Comprehensive test suite** — Security (D6=10), Solo Dev (D6=9), Team Dev (D3=9), Power User (D1=9). 58 tests across 4 suites, 3 OS x 3 Node versions, shellcheck at error severity.

4. **Atomic write architecture** — Power User (D5=10), Security (D5=10), Solo Dev (D6=9). Both writeMindFile and appendMindFile now use tmp+rename, with advisory locking and contention warnings. No remaining non-atomic write paths.

5. **Config validation and schema checking** — Solo Dev (D4=9), Security (D5=10), Non-Tech (D7=10), Power User (D4=9). Shared config-keys.js module, unknown key detection, Number.isSafeInteger, per-field byte limits.

6. **Interactive setup.js installer** — Non-Tech (D2=7, +2), Team Dev (D1=9, +1), Solo Dev (D1=9). Single-command guided experience praised across personas for lowering adoption barrier.

---

## Consensus Gaps (3+ personas)

1. **setup.js missing compress-sessions.js copy** — Solo Dev (P2), Team Dev (P3), Power User (P3). The setup.js and install.sh/install.ps1 do not copy compress-sessions.js or health-check.js to target projects, causing auto-compression from session-start.sh to silently fail.

2. **setup.js lacks --dry-run and --help** — Non-Tech (P3), Solo Dev (P3), Team Dev (P3). Inconsistent with install.sh/install.ps1 which both support dry-run mode.

3. **task-completed.sh spawns multiple Node processes** — Solo Dev (P3), Power User (P3), Team Dev (P3). 3-4 separate Node invocations for one JSON parse, carried from R7.

4. **setup.js default directory installs into MemoryForge clone** — Non-Tech (P3), Team Dev (P3). When run from the repo directory, `cwd` defaults to the clone itself rather than the user's project.

5. **TROUBLESHOOTING.md does not mention setup.js** — Non-Tech (P3), Solo Dev (P3). New installer not reflected in troubleshooting docs.

---

## Bugs Found (deduplicated across all personas)

### P2 (2 unique)

| # | Bug | Found By |
|---|-----|----------|
| 1 | Installers (install.sh, install.ps1, setup.js) don't copy compress-sessions.js or config-keys.js to target project — auto-compression silently fails | Solo Dev, Team Dev, Power User |
| 2 | health-check.js --watch mode: CLI arguments interpolated into execSync() shell string — command injection with crafted directory argument | Security |

### P3 (deduplicated, ~18 unique)

| # | Bug | Found By |
|---|-----|----------|
| 3 | setup.js lacks --dry-run and --help flags (present in install.sh/install.ps1) | Non-Tech, Solo Dev, Team Dev |
| 4 | setup.js default directory installs into MemoryForge clone when run from repo dir | Non-Tech, Team Dev |
| 5 | task-completed.sh spawns 3-4 Node processes for one JSON parse | Solo Dev, Power User, Team Dev |
| 6 | TROUBLESHOOTING.md does not mention setup.js | Non-Tech, Solo Dev |
| 7 | setup.js does not copy compress-sessions.js to target (subset of P2 #1) | Team Dev, Power User |
| 8 | setup.js mergeSettings uses fragile string search for idempotency check | Power User, Team Dev |
| 9 | setup.js does not check for bash/Git Bash on Windows — hooks fail silently | Non-Tech |
| 10 | setup.js does not validate parsed settings.json before merge | Team Dev |
| 11 | install.ps1 .gitignore entries missing .write-lock | Team Dev |
| 12 | dashboard.js stat card values interpolated into HTML without escapeHtml() — local XSS | Security |
| 13 | setup.js does not check for symlinks before writing config | Security |
| 14 | Project's own .gitignore less comprehensive than installer-generated one | Security |
| 15 | MCP server total input size uses string .length not Buffer.byteLength | Power User |
| 16 | README test count or description mismatch | Team Dev |
| 17 | No project template selection in setup.js interactive flow | Non-Tech |
| 18 | CHANGELOG P2 fix description mentions "1.7.0" but version is 1.8.0 | Team Dev |
| 19 | session-start.sh inline Node block doesn't validate numeric config values | Team Dev |
| 20 | setup.js not included in CI shellcheck/syntax checks | Team Dev |

---

## Per-Persona Detail

### Solo Developer — 8.86/10 (40%) — Yes

Scores unchanged from R7 at dimension level — all 7 dimensions hold at 8 or 9. The report notes 8.9 avg due to rounding. The interactive setup.js is praised as a "genuine UX win" but doesn't change D1 (already 9). New P2 found: installers don't copy compress-sessions.js. 8 bugs total (0 P1, 1 P2, 7 P3).

### Team Developer — 8.71/10 (25%) — Conditional

D1 Team Adoption improved from 8→9 thanks to version mismatch fix and setup.js simplifying team onboarding. Condition remains architectural: advisory locking is non-blocking, so true concurrent safety requires team discipline. 0 P2 bugs. 10 P3 bugs total.

### AI Power User — 9.00/10 (15%) — Yes

D5 State Management improved from 9→10 — all write paths now atomic. First time Power User average reaches 9.00. Hook Architecture holds at 10/10. 0 P1, 0 P2, 9 P3. Codebase rated "production-grade quality."

### Security Engineer — 9.43/10 (10%) — Yes

D5 Config Security improved from 9→10 — symlink resistance now universal, shared config schema. Third consecutive Yes verdict. 1 P2 (health-check watch mode command injection, requires local CLI access). 3 P3. All R7 fixes verified correct.

### Non-Technical Builder — 8.57/10 (10%) — Yes

**First Yes verdict in project history.** D2 Install Simplicity jumped from 5→7 (setup.js breakthrough) and D4 Error Recovery from 6→7. The setup.js interactive installer was called "the most important change for this persona since the project dashboard." 0 P1, 0 P2, 7 P3.

---

## Improvement Roadmap (Wave 22+)

### Wave 22: Installer Completeness (target: 9.0 weighted)
- Fix installer copy gap: add compress-sessions.js, config-keys.js, health-check.js to all 3 installers (Bug #1 — P2)
- Fix health-check.js watch mode command injection (Bug #2 — P2)
- Add --dry-run and --help to setup.js (Bug #3)
- Fix setup.js default directory detection when run from repo dir (Bug #4)
- Consolidate task-completed.sh Node invocations (Bug #5)
- Add setup.js to TROUBLESHOOTING.md (Bug #6)
- Add install.ps1 .write-lock to .gitignore entries (Bug #11)

### Wave 23: Non-Technical Polish (target: 9.1 weighted)
- Project template selection in setup.js interactive flow
- setup.js bash/Git Bash detection on Windows
- User-friendly error message layer
- Demo GIF or asciinema recording
- GUI installer or single-command web install

### Wave 24: Fleet & Monitoring
- Fleet dashboard bulk operations
- Health-check event-based watch mode via fs.watch (replaces execSync)
- Optional MCP tool invocation audit trail
- Compression rollback mechanism

### Wave 25: Plugin Architecture
- Plugin API documentation
- MCP tool plugin loader
- Configurable hook timeouts
- Module exports from mcp-memory-server.js

---

## Individual Reports

- [Solo Developer](benchmark-r8-solo-dev.md)
- [Team Developer](benchmark-r8-team-dev.md)
- [AI Power User](benchmark-r8-power-user.md)
- [Security Engineer](benchmark-r8-security.md)
- [Non-Technical Builder](benchmark-r8-non-technical.md)
