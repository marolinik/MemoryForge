# MemoryForge Benchmark Round 9 — Post-Wave 22

**Date:** 2026-02-15
**Version:** 1.8.1 (Waves 1-22 complete)
**Spec:** [BENCHMARK-SPEC.md](BENCHMARK-SPEC.md) v1 — fixed personas, fixed dimensions
**Evaluators:** 5 AI personas (Claude Opus 4.6), independent parallel evaluation

---

## Verdicts

| Persona (Share) | Verdict |
|-----------------|---------|
| Solo Developer (40%) | **Yes** — 0 P2, 7 P3. Score plateau at 8.86 reflects maturity. |
| Team Developer (25%) | **Yes** — 0 P2, 9 P3. D4 Operational Safety 8→9, D7 Integration 8→9. All dimensions at 9. |
| AI Power User (15%) | **Yes** — 0 P2, 13 P3. Wave 22 was polish wave; architecture remains best-in-class. |
| Security Engineer (10%) | **Yes** — 0 P1, 0 P2, 5 P3. Fourth consecutive Yes. All R8 fixes verified. |
| Non-Technical Builder (10%) | **Yes** — 0 P2, 8 P3. D2 Install Simplicity 7→8, D4 Error Recovery 7→8. Second consecutive Yes. |

**All 5 personas vote Yes — first unanimous round.**

---

## Scores

| Persona (Share) | D1 | D2 | D3 | D4 | D5 | D6 | D7 | Avg |
|-----------------|----|----|----|----|----|----|----|-----|
| **Solo Dev (40%)** | 9 | 8 | 9 | 9 | 9 | 9 | 9 | **8.86** |
| **Team Dev (25%)** | 9 | 9 | 9 | 9 | 9 | 9 | 9 | **9.00** |
| **AI Power User (15%)** | 9 | 10 | 8 | 9 | 10 | 8 | 9 | **9.00** |
| **Security Eng (10%)** | 10 | 9 | 9 | 9 | 10 | 10 | 9 | **9.43** |
| **Non-Technical (10%)** | 9 | 8 | 8 | 8 | 9 | 10 | 10 | **8.86** |

**Unweighted Average: 9.03/10**
**Market-Weighted Average: 8.97/10**
*(Solo 40% x 8.86 + Team 25% x 9.00 + Power 15% x 9.00 + Security 10% x 9.43 + NonTech 10% x 8.86)*

---

## Score Trend (fixed personas from R4 onward)

| Round | Version | Weighted Avg | Solo Dev | Team Dev | Power User | Security | Non-Tech |
|-------|---------|-------------|----------|----------|------------|----------|----------|
| R4 (baseline) | 1.4.0 | 7.10 | 7.86 | 6.57 | 6.86 | 6.86 | 6.14 |
| R5 | 1.5.0 | 7.97 | 8.57 | 7.71 | 8.43 | 7.43 | 6.43 |
| R6 | 1.6.0 | 8.55 | 8.57 | 8.43 | 8.71 | 9.00 | 8.00 |
| R7 | 1.7.0 | 8.76 | 8.86 | 8.57 | 8.86 | 9.29 | 8.14 |
| R8 | 1.8.0 | 8.89 | 8.86 | 8.71 | 9.00 | 9.43 | 8.57 |
| **R9** | **1.8.1** | **8.97** | **8.86** | **9.00** | **9.00** | **9.43** | **8.86** |
| **Delta R8→R9** | | **+0.08** | **0** | **+0.29** | **0** | **0** | **+0.29** |
| **Delta R4→R9** | | **+1.87** | **+1.00** | **+2.43** | **+2.14** | **+2.57** | **+2.72** |

**Wave 22 was a correctness/polish wave.** The biggest gains went to Team Dev (+0.29) and Non-Technical (+0.29), who benefit most from installer completeness, security hardening, and usability improvements. Solo Dev, Power User, and Security held steady — their scores plateau as the tool matures.

### Dimension Changes (R8→R9)

| Persona | Dimension | R8 | R9 | Why |
|---------|-----------|----|----|-----|
| Team Dev | D4: Operational Safety | 8 | 9 | execFileSync in health-check, dashboard XSS fix close last known injection vectors |
| Team Dev | D7: Integration | 8 | 9 | All installers produce identical layouts with all supporting scripts |
| Non-Tech | D2: Install Simplicity | 7 | 8 | setup.js --help, --dry-run, clone-dir warning |
| Non-Tech | D4: Error Recovery | 7 | 8 | TROUBLESHOOTING.md setup.js section, health-check works in installed projects |

---

## Deduplicated Bug List

### P1: None

### P2: None

### P3 (23 unique bugs across 5 personas)

| # | Bug | File:Line | Personas | Notes |
|---|-----|-----------|----------|-------|
| 1 | dashboard.js + fleet-dashboard.js browser-open uses exec/execSync with shell-interpolated paths | dashboard.js:335, fleet-dashboard.js:275 | Solo, Team, Power, Security | Should use execFileSync to match health-check.js pattern |
| 2 | compress-sessions.js non-atomic writes (no tmp+rename) | compress-sessions.js:182,266,320 | Team, Power, Security | MCP server uses atomic writes; compressor does not |
| 3 | setup.js dryInfo called with wrong arity + success prints in dry-run | setup.js:541-542 | Solo, Team, Non-Tech | `dryInfo('config', configPath)` ignores 2nd arg; success() fires in dry mode |
| 4 | setup.js --dry-run doesn't skip version file write | setup.js:483 | Non-Tech | Only write that bypasses DRY_RUN check |
| 5 | README changelog description stale "Waves 1-13" | README.md:494 | Solo, Team, Non-Tech | Should say Waves 1-22 |
| 6 | install.ps1 uninstall lacks confirmation prompt | install.ps1:87-98 | Solo, Team | install.sh has confirmation; PS1 does not |
| 7 | setup.js chmod uses execSync with shell glob | setup.js:311 | Team, Security | Should use execFileSync or fs.chmodSync |
| 8 | CI lint missing config-keys.js and setup.js | ci.yml:50-56 | Solo, Power | node --check should cover all JS files |
| 9 | health-check.js watch --interval arg parsing bug | health-check.js:226-227 | Non-Tech | Bare numeric value not filtered from child args |
| 10 | subagent-start.sh not consolidated to single Node | subagent-start.sh:24-38 | Team | Inconsistent with task-completed.sh and subagent-stop.sh |
| 11 | session-end.sh non-atomic append bypasses advisory lock | session-end.sh:93 | Power | Raw >> append could conflict with MCP appendMindFile |
| 12 | Tracking file appends non-atomic on Windows | subagent-start.sh:38, subagent-stop.sh:37 | Power | Lines could interleave in multi-agent scenarios |
| 13 | health-check.js watch outputs concatenated JSON | health-check.js:222 | Power | No delimiter between reports; unparseable as JSON stream |
| 14 | fleet-dashboard.js calcDirSize follows symlinks | fleet-dashboard.js:97 | Power | No symlink or cycle guard in recursive traversal |
| 15 | MCP per-field size check doesn't cover nested objects | mcp-memory-server.js:668 | Power | Tool schemas define strings but no type enforcement |
| 16 | session-start.sh missing -- separator before positional arg | session-start.sh:91 | Power | Defensive practice for paths starting with - |
| 17 | CI no PowerShell lint step | ci.yml:70 | Power | install.ps1 is ~748 lines with no PSScriptAnalyzer |
| 18 | readMindFile no symlink check inside .mind/ | mcp-memory-server.js:71 | Power | Symlink inside .mind/ pointing outside could leak data |
| 19 | Repo .gitignore missing entries vs installer entries | .gitignore | Security | Missing .file-tracker, .prompt-context, .mcp-errors.log, etc. |
| 20 | MCP logError no in-process size cap | mcp-memory-server.js:797 | Security | Rotation happens in session-start.sh; no per-session cap |
| 21 | Config template no companion documentation | templates/memoryforge.config.json.template | Non-Tech | No inline or sibling explanation of config keys |
| 22 | TROUBLESHOOTING Node version 14+ vs 18+ mismatch | TROUBLESHOOTING.md:167 | Non-Tech | setup.js and README say 18+; troubleshooting says 14+ |
| 23 | PowerShell installer missing -Help flag | install.ps1 | Non-Tech | install.sh has --help; PS1 does not |

---

## Consensus Strengths (3+ personas agree)

1. **Zero dependencies** — universally praised across all 5 personas. Eliminates supply chain risk, version conflicts, and install complexity.
2. **Compaction survival loop** — the pre-compact checkpoint + session-start re-injection architecture remains the standout innovation.
3. **Installer maturity** — three working installers (bash, PowerShell, interactive Node.js) with smart merge, dry-run, and uninstall.
4. **Test coverage & CI** — 58 tests, 3 OS x 3 Node matrix, shellcheck, JSON validation. Gives confidence to all personas.
5. **Security hardening depth** — defense-in-depth with path traversal, symlink checks, atomic writes, input validation, locking. Fourth consecutive Security Yes.

## Consensus Gaps (3+ personas agree)

1. **Browser-open shell injection** — dashboard.js and fleet-dashboard.js still use exec/execSync with interpolated paths (4 personas flagged)
2. **Non-atomic writes in compressor** — compress-sessions.js uses direct writeFileSync while MCP server uses tmp+rename (3 personas)
3. **setup.js dry-run leaks** — dryInfo wrong arity, success message in dry mode, version file written (3 personas)
4. **README staleness** — changelog description says "Waves 1-13" (3 personas)

---

## Milestones

- **First unanimous Yes** — all 5 personas recommend adoption (R8 had 4 Yes + 1 Conditional-turned-Yes)
- **Team Dev hits 9.00** — all 7 dimensions at 9/10
- **Non-Tech second consecutive Yes** — D2 and D4 both improved
- **0 P1 and 0 P2 bugs** — first round with zero P2 bugs across all personas
- **Weighted score crosses 8.97** — approaching the 9.0 threshold

---

## Improvement Roadmap

### Wave 23: Consensus Fixes (8.97 → 9.0+ target)
- [ ] Fix browser-open shell injection in dashboard.js + fleet-dashboard.js (use execFile/spawn)
- [ ] Make compress-sessions.js writes atomic (tmp+rename pattern)
- [ ] Fix setup.js dry-run leaks (version file, dryInfo arity, success message)
- [ ] Update README changelog description
- [ ] Fix setup.js chmod to use execFileSync or fs.chmodSync
- [ ] Fix health-check.js watch --interval arg parsing
- [ ] Fix TROUBLESHOOTING.md Node version (14+ → 18+)
- [ ] Add install.ps1 -Help flag and uninstall confirmation

### Wave 24: Hardening (polish)
- [ ] Add symlink check to readMindFile
- [ ] Add logError size cap in MCP server
- [ ] Consolidate subagent-start.sh to single Node
- [ ] Add config-keys.js + setup.js to CI lint
- [ ] Sync repo .gitignore with installer entries
- [ ] Add health-check.js watch JSON delimiter
- [ ] Add fleet-dashboard.js calcDirSize symlink guard

### Wave 25+: Feature (score ceiling breakers)
- [ ] Plugin registration API for custom MCP tools (Power User D3)
- [ ] Structured agent-to-agent messaging (Power User D6)
- [ ] Cross-project search (Team Dev D2)
- [ ] Config companion documentation (Non-Tech D3)
