# MemoryForge Upgrade Plan: 6/10 → 9/10

## Current Score: 6/10
Strengths: zero deps, best-in-class install UX, brownfield safety
Weaknesses: no MCP tools, no auto-capture, no search, no dashboard

---

## Wave 1: MCP Memory Server (6/10 → 7.5/10)
**THE #1 GAP. Claude can't query or update memory mid-conversation.**

Create `scripts/mcp-memory-server.js`:
- Zero dependencies, pure Node.js
- Content-Length framed stdio transport (MCP standard)
- Finds .mind/ by walking up from cwd

6 tools:
1. `memory_status` — read STATE.md (no params)
2. `memory_search` — search all .mind/ files (query: string)
3. `memory_update_state` — rewrite STATE.md sections
4. `memory_save_decision` — append to DECISIONS.md
5. `memory_save_progress` — update PROGRESS.md checkboxes
6. `memory_save_session` — append to SESSION-LOG.md

Files to CREATE:
- [x] scripts/mcp-memory-server.js

Files to MODIFY:
- [x] .mcp.json — MCP server configuration (not settings.json — MCP uses separate file)
- [x] install.sh — wire MCP server path (project vs global) + uninstall cleanup
- [x] install.ps1 — same
- [x] scripts/merge-settings.js — N/A (MCP uses .mcp.json, not settings.json)
- [x] README.md — document MCP tools + updated install tree + uninstall docs

---

## Wave 2: Auto-Capture Hooks (7.5/10 → 8/10)
**Stop relying on manual .mind/ updates. Track work automatically.**

Enhance `stop-checkpoint.sh`:
- Track which files were modified since last check
- Write change list to .mind/.file-tracker
- Output brief change summary

Enhance `session-end.sh`:
- Read .file-tracker and git status
- Auto-generate session summary
- Append to SESSION-LOG.md if it wasn't updated this session

Files to MODIFY:
- [x] scripts/hooks/stop-checkpoint.sh — file change tracking via git
- [x] scripts/hooks/session-end.sh — auto session summary from .file-tracker
- [x] install.sh / install.ps1 — .gitignore + uninstall include .file-tracker

---

## Wave 3: Compression + Token Optimization (8/10 → 8.5/10)
**Keep .mind/ lean as projects grow.**

Create `scripts/compress-sessions.js`:
- Keep last 5 session entries full
- Summarize older entries to 1-2 lines each
- Archive old decisions (keep last 10 active)
- Report token savings

Enhance `session-start.sh`:
- Check total .mind/ size
- Auto-run compression if over 3000 tokens
- Smart extraction (recent = full, old = summary)

Files to CREATE:
- [x] scripts/compress-sessions.js

Files to MODIFY:
- [x] scripts/hooks/session-start.sh — auto-compress trigger when .mind/ > 12KB

---

## Wave 4: HTML Dashboard (8.5/10 → 9/10)
**Visualize project state in the browser.**

Create `scripts/dashboard.js`:
- Reads all .mind/ files
- Generates single static HTML file
- Clean layout: state, progress, decisions, session log
- Opens in default browser
- No server needed (all data embedded in HTML)

Files to CREATE:
- [x] scripts/dashboard.js

Files to MODIFY:
- [x] README.md — document dashboard + compression
- [x] install.sh / install.ps1 — .gitignore includes dashboard.html

---

## Wave 5: Security Hardening (post-audit)
**Fix P0 security issues found by 5-agent competitive audit.**

Harden `scripts/mcp-memory-server.js`:
- Path traversal protection via `safePath()` guard on all file operations
- Replace silent error handlers with `.mcp-errors.log` logging
- JSON schema validation (required field checks) before tool execution
- Tool call errors logged to `.mcp-errors.log`

Files to MODIFY:
- [x] scripts/mcp-memory-server.js — safePath(), logError(), input validation
- [x] install.sh / install.ps1 — .gitignore includes .mcp-errors.log

---

## Wave 6: README Rewrite (post-audit)
**Address Beginner (6.0) and Vibe Coder (5.7) feedback.**

Rewrite README.md:
- Shields.io badges (Zero Deps, Platform, MIT License)
- "What Is This?" section in plain English
- Before & After comparison (without vs with MemoryForge)
- First FAQ answers "Why do I need this?"
- Competitive analysis linked from docs

Files to MODIFY:
- [x] README.md — full rewrite with progressive disclosure structure

Files to CREATE:
- [x] docs/COMPETITIVE-ANALYSIS.md — 9-tool benchmark from 5 perspectives

---

## Execution Order
Wave 1 → Wave 2 → Wave 3 → Wave 4 → Wave 5 → Wave 6 (all complete)
