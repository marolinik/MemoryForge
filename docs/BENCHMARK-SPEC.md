# MemoryForge Benchmark Specification v1

**Purpose:** Standardized evaluation framework with fixed personas and dimensions across all rounds, enabling direct score comparison over time.

**Rule:** Personas, dimensions, and rubrics in this file are **locked**. Do not change them between rounds. If a dimension becomes irrelevant, score it 10 (resolved) rather than removing it.

---

## Personas & Market Share

| # | Persona | Share | Profile |
|---|---------|-------|---------|
| 1 | **Solo Developer** | 40% | Individual dev using Claude Code daily for personal/freelance/startup projects. Has 1 project active at a time. Command-line fluent. Cares about friction, speed, and "does it just work." |
| 2 | **Team Developer** | 25% | Engineer at a 5-50 person company. Uses Claude Code alongside teammates on shared repos. Has 2-5 active projects. Cares about reliability, team compatibility, and operational safety. |
| 3 | **AI Power User** | 15% | Builds on top of Claude Code. Writes custom hooks, extends MCP tools, runs multi-agent workflows. Cares about APIs, extensibility, correctness, and innovation. |
| 4 | **Security Engineer** | 10% | Evaluates tools before org-wide rollout. Reads source code, checks for injection vectors, audits supply chain. Cares about attack surface, input validation, and audit trails. |
| 5 | **Non-Technical Builder** | 10% | PM, designer, or founder who uses Claude Code but isn't a developer. Googles "what is bash." Cares about clarity, simplicity, visual feedback, and confidence. |

---

## Fixed Dimensions (per persona)

### Solo Developer (40%)

| Dim | Name | What it measures |
|-----|------|-----------------|
| D1 | **Install & Setup** | Time from zero to working memory. Steps required, prerequisites, friction points. |
| D2 | **Daily Workflow** | Per-prompt overhead, latency, noise level. Does it help or get in the way during a coding session? |
| D3 | **Context Recovery** | Quality of briefing after compaction, restart, or resume. Does Claude pick up where it left off? |
| D4 | **Configuration** | Sensible defaults, override ease, bounds checking, documentation of options. |
| D5 | **Documentation** | README clarity, troubleshooting coverage, FAQ quality, examples. Can I self-serve? |
| D6 | **Reliability** | Test coverage, cross-platform parity, error handling, edge case robustness. |
| D7 | **Value / Effort** | Overall ROI. Does the benefit justify the install, learning curve, and ongoing overhead? |

### Team Developer (25%)

| Dim | Name | What it measures |
|-----|------|-----------------|
| D1 | **Team Adoption** | Ease of rolling out to N engineers. Centralized config, onboarding docs, rollback safety. |
| D2 | **Multi-Project** | Cross-repo awareness, shared decisions, fleet visibility, per-project install overhead. |
| D3 | **Technical Quality** | Code quality, architecture, protocol correctness, dependency hygiene. |
| D4 | **Operational Safety** | Concurrent access handling, data corruption risk, monitoring, alerting. |
| D5 | **Search & Retrieval** | Can I find what I need across .mind/ files? Relevance, speed, recall. |
| D6 | **Growth Handling** | Does it scale over weeks/months? Compression, archival, size management. |
| D7 | **Integration** | Works with existing CI, git workflows, IDE, team conventions. |

### AI Power User (15%)

| Dim | Name | What it measures |
|-----|------|-----------------|
| D1 | **MCP Protocol** | JSON-RPC correctness, transport implementation, error handling, capabilities. |
| D2 | **Hook Architecture** | Lifecycle coverage, input/output protocol, defensiveness, composability. |
| D3 | **Extensibility** | Plugin system, custom tool registration, module exports, API surface. |
| D4 | **Search Quality** | Stemmer accuracy, tokenizer coverage, ranking algorithm, caching strategy. |
| D5 | **State Management** | Atomicity, locking, concurrent access safety, file format robustness. |
| D6 | **Agent Support** | Multi-agent coordination, subagent hooks, task tracking, conflict resolution. |
| D7 | **Innovation** | Novel solutions, creative architecture, features beyond basic persistence. |

### Security Engineer (10%)

| Dim | Name | What it measures |
|-----|------|-----------------|
| D1 | **Supply Chain** | Dependencies, pinning, build process, external service calls. |
| D2 | **Input Validation** | Per-field type/length/character restrictions, sanitization, size limits. |
| D3 | **Injection Safety** | Shell injection, path traversal, regex injection, command injection in all code paths. |
| D4 | **Data Handling** | Data locality, cross-project isolation, secrets exposure, .gitignore coverage. |
| D5 | **Config Security** | Config loading safety, value validation, symlink resistance, arithmetic injection. |
| D6 | **CI & Testing** | Test coverage of security-critical paths, SAST, platform matrix, hook testing. |
| D7 | **Audit & Logging** | Structured logs, tool invocation records, error logging, log rotation, tamper detection. |

### Non-Technical Builder (10%)

| Dim | Name | What it measures |
|-----|------|-----------------|
| D1 | **Onboarding Clarity** | Can I understand what this does and why I want it within 60 seconds? |
| D2 | **Install Simplicity** | Steps to install, terminal commands required, GUI options, prerequisite disclosure. |
| D3 | **Concept Accessibility** | Jargon count, glossary presence, analogies, progressive disclosure of technical detail. |
| D4 | **Error Recovery** | When something breaks, can I fix it? Are error messages human-readable? |
| D5 | **Templates & Examples** | Starter content, filled-in examples, guided setup, "blank page" problem. |
| D6 | **Visual Feedback** | Dashboard quality, progress indicators, browser-based tools, discoverability. |
| D7 | **Confidence** | Do I trust this won't break my project? Backups, dry-run, test coverage signals. |

---

## Scoring Rubric (universal)

| Score | Meaning |
|-------|---------|
| 10 | Exceptional. Best-in-class, no issues found. |
| 9 | Excellent. Minor polish only. |
| 8 | Strong. Works well, 1-2 small gaps. |
| 7 | Good. Solid but with clear improvement areas. |
| 6 | Adequate. Functional but friction or gaps are noticeable. |
| 5 | Mediocre. Works but significant issues impact the experience. |
| 4 | Weak. Fundamental gaps that block key workflows. |
| 3 | Poor. Major issues, barely functional for this persona. |
| 2 | Very poor. Critical failures. |
| 1 | Broken. Does not work for this persona. |

---

## Scoring Formula

**Persona Average** = mean(D1..D7)

**Weighted Score** = Sum of (Persona Average x Market Share)
= Solo(40%) + Team(25%) + Power(15%) + Security(10%) + NonTech(10%)

---

## Bug Severity

| Level | Definition |
|-------|-----------|
| **P1** | Security vulnerability exploitable without unusual prerequisites, or data loss in normal usage. |
| **P2** | Significant functional bug, security issue requiring specific conditions, or missing safety control. |
| **P3** | Minor bug, cosmetic issue, edge case, or hardening opportunity. |

---

## Round Execution Protocol

1. Evaluator reads **all source files** relevant to the persona (hooks, scripts, tests, docs, CI).
2. Evaluator scores each of their 7 fixed dimensions using the rubric above.
3. Evaluator identifies bugs with severity and specific file:line references.
4. Evaluator writes a VERDICT: **Yes** (adopt), **Conditional** (adopt after fixes), or **No** (do not adopt).
5. Compiler aggregates into round document with:
   - Score table (all personas x all dimensions)
   - Weighted score
   - Per-persona trend (this round vs previous rounds)
   - Deduplicated bug list
   - Consensus strengths/gaps (3+ personas agree)

---

## Baseline: Round 4 Scores (first round with this spec retroactively applied)

These are the reference scores for tracking improvement:

| Persona (Share) | D1 | D2 | D3 | D4 | D5 | D6 | D7 | Avg |
|-----------------|----|----|----|----|----|----|----|----|
| Solo Dev (40%) | 8 | 7 | 8 | 9 | 8 | 7 | 8 | **7.86** |
| Team Dev (25%) | 6 | 5 | 7 | 6 | 7 | 8 | 7 | **6.57** |
| AI Power User (15%) | 8 | 9 | 5 | 6 | 5 | 7 | 8 | **6.86** |
| Security Eng (10%) | 9 | 5 | 8 | 7 | 6 | 7 | 6 | **6.86** |
| Non-Tech (10%) | 8 | 5 | 4 | 5 | 7 | 7 | 7 | **6.14** |

**Weighted Score (R4 baseline): 7.10**

*Note: Solo Dev D1-D7 remapped from R4's Time-to-Value/Install/Workflow/Recovery/Config/Docs/Trust to this spec's Install/Workflow/Recovery/Config/Docs/Reliability/Value. Scores adjusted to fit new dimension definitions where the original R4 dimension doesn't map 1:1.*

---

## Version History

| Version | Date | Change |
|---------|------|--------|
| v1 | 2025-02-15 | Initial spec. 5 personas, 35 dimensions, scoring rubric, execution protocol. |
