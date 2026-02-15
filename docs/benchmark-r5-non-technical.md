# MemoryForge Benchmark Round 5: Non-Technical Builder

PERSONA: Non-Technical Builder (10% of market)
VERDICT: Conditional — Strong foundation but needs clarity polish for terminal-averse users who Google "what is bash."

SCORES:
D1 Onboarding Clarity: 7 — "Claude Code forgets everything when context resets. MemoryForge fixes that" is perfect, but value prop buried after badges and ToC. Technical jargon ("compaction cycles," "MCP tools") appears before plain English explanation.

D2 Install Simplicity: 6 — Two commands (clone + install) is reasonable, but PowerShell syntax requires understanding of flags, paths aren't explained (what is "/path/to/your/project"?), and Git Bash prerequisite for Windows isn't disclosed upfront. Node.js prerequisite is now called out clearly (Wave 17), but no GUI fallback.

D3 Concept Accessibility: 6 — README uses terms like "context compaction," "lifecycle hooks," "MCP tools," "stdio transport" without definitions. The "In plain English" section helps, but comes too late. No glossary. Templates are good, but zero onboarding wizard or interactive setup.

D4 Error Recovery: 5 — TROUBLESHOOTING.md exists (good) but uses technical commands (ls -la, chmod +x, which bash). Error messages reference shell syntax and JSON files. No "something went wrong, click here to fix" recovery path. Health check is JSON-first (scary for non-technical).

D5 Templates & Examples: 8 — Four templates (mind-web-app, mind-cli, mind-library, mind-example) with pre-filled content. Example template shows realistic mid-project state. Prevents blank page problem. Strong.

D6 Visual Feedback: 7 — HTML dashboard with dark theme and progress bars (good). Fleet dashboard for multi-project view (good). But dashboards require running Node commands. No built-in GUI installer, no auto-open on first install, no visual progress during install.

D7 Confidence: 6 — Dry-run flag exists, backups created (settings.json.backup), uninstall preserves .mind/ files. But no test coverage signals visible to users, no "what will this change?" preview in README, and hooks run shell scripts (scary black box for non-technical). No sandboxing explanation.

AVERAGE: 6.4

STRENGTHS:
- Plain English value prop in "What Is This?" section is perfect ("When Claude Code runs out of context space...")
- Before & After comparison makes the problem visceral and relatable
- Templates with filled examples prevent blank page paralysis
- HTML dashboards provide visual feedback without server setup
- Smart-merge installer won't clobber existing hooks (reduces fear)
- Node.js prerequisite now checked upfront (Wave 17) with friendly error

GAPS:
- **Jargon barrier**: README assumes familiarity with "context compaction," "MCP," "lifecycle hooks," "stdio," "path traversal." Non-technical users will bounce.
- **No GUI installer**: Clone + bash command is a hard ask for someone who Googles "what is bash." Need clickable .exe or interactive web installer.
- **Terminal-heavy troubleshooting**: "Run `chmod +x scripts/hooks/*.sh`" is gibberish to 90% of this persona. Need visual troubleshooting (screenshots, videos).
- **Hidden prerequisites**: Git Bash for Windows is required but never explicitly stated. "bash" is mentioned but not defined as a program you must install.
- **Error messages too technical**: "stat: unrecognized option" or "settings.json has wrong path" need human translation ("The installer couldn't detect your file modification times. This is OK, the memory system still works.")
- **No confidence-building artifacts**: No "tested on 1000+ projects" claim, no testimonials, no "safe to try" badge. Dry-run is buried in --help.

BUGS:

| # | Severity | Bug description | File:Line |
|---|----------|----------------|-----------|
| 1 | P3 | Health check version hardcoded to 1.4.0 instead of 1.5.0 | scripts/health-check.js:29 |
| 2 | P3 | README prerequisite disclosure incomplete — "bash scripts, Node.js" but doesn't explain "bash" is Git Bash on Windows or require user to verify bash is installed before running installer | README.md:28 |
| 3 | P3 | Install error messages lack context — "Directory not found" without explaining that path must be absolute not relative | install.sh:106, install.ps1:60 |
| 4 | P3 | TROUBLESHOOTING.md Section 2 example uses `which bash` but Git Bash on Windows doesn't always add bash to PATH — need `where bash` for Windows or explain Git Bash requirement first | docs/TROUBLESHOOTING.md:41 |
| 5 | P3 | Dashboard auto-open silently fails on error but prints unhelpful message "Could not open browser automatically" — should suggest common fixes (browser not set, WSL vs Windows path issue) | scripts/dashboard.js:337 |
| 6 | P3 | Fleet dashboard calculates .mind/ size recursively but doesn't explain what "KB" means for non-technical users in the HTML output — add tooltip "size of all memory files" | scripts/fleet-dashboard.js:145 |
| 7 | P3 | No visual indication during install that it's working — for slow systems the 10-second pause between steps feels like a hang. Add "Installing..." spinner or dots. | install.sh, install.ps1 (no specific line) |
| 8 | P3 | README "Quick Start" section doesn't explain what "cd your-project" means or how to find your project path | README.md:87 |
| 9 | P3 | Config template has JSON comment (`"_comment": ...`) which is technically invalid JSON — should be `// comment` or removed entirely for strict parsers | templates/memoryforge.config.json.template:2 |
| 10 | P3 | TROUBLESHOOTING Section 6 says "content must be on the line directly after the heading" but mind-example template has blank line after "## Current Phase" — documentation contradicts example | docs/TROUBLESHOOTING.md:99-103, templates/mind-example/STATE.md:3-4 |

VERDICT RATIONALE:
"Conditional" because the core is solid (templates, dashboards, smart-merge) but the **barrier to entry is high for terminal-averse users**. A PM or designer who has never used Git Bash will struggle with "bash install.sh" and "what is /path/to/your/project." The README is comprehensive but front-loads technical jargon. Error recovery requires shell commands. No GUI installer or interactive wizard.

**Recommendation for "Yes" verdict:**
1. Add interactive web-based installer (detects OS, generates command, validates paths)
2. Create 2-minute video walkthrough showing exact steps on Windows/Mac
3. Add glossary section defining "bash," "MCP," "hooks," "context compaction" in FAQ
4. Rewrite TROUBLESHOOTING.md with screenshots and "click here" buttons instead of shell commands
5. Add "What will change?" preview before running installer (visual file tree diff)

**Current state:** Strong tool for technical users, but needs "gentle on-ramp" for non-technical builders. The 10% persona will get stuck at step 1 (installing) and never see the value. Templates and dashboards are excellent — get users there faster.
