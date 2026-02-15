#!/usr/bin/env node
// =============================================================================
// MemoryForge: HTML Dashboard Generator
// =============================================================================
// Reads all .mind/ files and generates a single static HTML dashboard.
// Opens in the default browser. No server needed — all data embedded in HTML.
//
// Usage:
//   node scripts/dashboard.js [.mind/ directory]
//   node scripts/dashboard.js --no-open [.mind/ directory]
//
// Zero dependencies — pure Node.js.
// =============================================================================

const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");

const args = process.argv.slice(2);
const noOpen = args.includes("--no-open");
const mindDir = args.find((a) => !a.startsWith("--")) || ".mind";

function readFile(filePath) {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// Read .mind/ files
// ---------------------------------------------------------------------------
const state = readFile(path.join(mindDir, "STATE.md"));
const progress = readFile(path.join(mindDir, "PROGRESS.md"));
const decisions = readFile(path.join(mindDir, "DECISIONS.md"));
const sessionLog = readFile(path.join(mindDir, "SESSION-LOG.md"));

// ---------------------------------------------------------------------------
// Parse progress for stats
// ---------------------------------------------------------------------------
const completedCount = (progress.match(/- \[x\]/gi) || []).length;
const pendingCount = (progress.match(/- \[ \]/g) || []).length;
const totalTasks = completedCount + pendingCount;
const progressPct = totalTasks > 0 ? Math.round((completedCount / totalTasks) * 100) : 0;

// Parse phase from STATE.md
const phaseMatch = state.match(/## Current Phase\s*\n(.+)/);
const currentPhase = phaseMatch ? phaseMatch[1].trim() : "Unknown";

// Parse session count
const sessionCount = (sessionLog.match(/## Session \d+/g) || []).length;

// Parse decision count
const decisionCount = (decisions.match(/## DEC-\d+/g) || []).length;

// ---------------------------------------------------------------------------
// Simple Markdown → HTML converter (no deps)
// ---------------------------------------------------------------------------
function md(text) {
  if (!text) return '<p class="empty">No data</p>';
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/^- \[x\] (.+)$/gm, '<div class="task done"><span class="check">&#10003;</span> $1</div>')
    .replace(/^- \[ \] (.+)$/gm, '<div class="task pending"><span class="check">&#9744;</span> $1</div>')
    .replace(/^- (.+)$/gm, '<div class="list-item">&#8226; $1</div>')
    .replace(/\n\n/g, "</p><p>")
    .replace(/\n/g, "<br>");
}

// ---------------------------------------------------------------------------
// Generate HTML
// ---------------------------------------------------------------------------
const timestamp = new Date().toISOString().replace("T", " ").substring(0, 19) + " UTC";

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>MemoryForge Dashboard</title>
<style>
  :root {
    --bg: #0d1117;
    --surface: #161b22;
    --border: #30363d;
    --text: #c9d1d9;
    --text-dim: #8b949e;
    --accent: #58a6ff;
    --green: #3fb950;
    --amber: #d29922;
    --red: #f85149;
    --purple: #bc8cff;
  }

  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
    background: var(--bg);
    color: var(--text);
    line-height: 1.6;
    padding: 24px;
    max-width: 1200px;
    margin: 0 auto;
  }

  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24px;
    padding-bottom: 16px;
    border-bottom: 1px solid var(--border);
  }

  header h1 {
    font-size: 24px;
    font-weight: 600;
    color: var(--accent);
  }

  header .timestamp {
    color: var(--text-dim);
    font-size: 13px;
  }

  .stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 16px;
    margin-bottom: 24px;
  }

  .stat-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 16px;
    text-align: center;
  }

  .stat-card .value {
    font-size: 32px;
    font-weight: 700;
    color: var(--accent);
  }

  .stat-card .label {
    font-size: 13px;
    color: var(--text-dim);
    margin-top: 4px;
  }

  .stat-card.green .value { color: var(--green); }
  .stat-card.amber .value { color: var(--amber); }
  .stat-card.purple .value { color: var(--purple); }

  .progress-bar {
    width: 100%;
    height: 8px;
    background: var(--border);
    border-radius: 4px;
    margin-top: 8px;
    overflow: hidden;
  }

  .progress-bar .fill {
    height: 100%;
    background: var(--green);
    border-radius: 4px;
    transition: width 0.3s ease;
  }

  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    margin-bottom: 16px;
  }

  @media (max-width: 768px) {
    .grid { grid-template-columns: 1fr; }
  }

  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    overflow: hidden;
  }

  .card-header {
    padding: 12px 16px;
    font-weight: 600;
    font-size: 14px;
    border-bottom: 1px solid var(--border);
    background: rgba(88, 166, 255, 0.05);
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .card-body {
    padding: 16px;
    font-size: 14px;
    max-height: 400px;
    overflow-y: auto;
  }

  .card-body.tall { max-height: 600px; }

  .card-body h1, .card-body h2, .card-body h3 {
    color: var(--accent);
    margin: 12px 0 6px;
  }

  .card-body h1 { font-size: 18px; }
  .card-body h2 { font-size: 16px; }
  .card-body h3 { font-size: 14px; }

  .card-body p { margin: 8px 0; }
  .card-body code {
    background: var(--bg);
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 13px;
  }

  .task { padding: 4px 0; display: flex; align-items: baseline; gap: 6px; }
  .task.done { color: var(--green); }
  .task.done .check { color: var(--green); }
  .task.pending { color: var(--text); }
  .task.pending .check { color: var(--text-dim); }

  .list-item { padding: 2px 0; }

  .empty { color: var(--text-dim); font-style: italic; }

  .full-width { grid-column: 1 / -1; }

  /* Scrollbar styling */
  .card-body::-webkit-scrollbar { width: 6px; }
  .card-body::-webkit-scrollbar-track { background: transparent; }
  .card-body::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }

  footer {
    text-align: center;
    padding: 16px;
    color: var(--text-dim);
    font-size: 12px;
  }

  footer a { color: var(--accent); text-decoration: none; }
  footer a:hover { text-decoration: underline; }
</style>
</head>
<body>

<header>
  <h1>&#x1f9e0; MemoryForge Dashboard</h1>
  <span class="timestamp">Generated: ${timestamp}</span>
</header>

<div class="stats">
  <div class="stat-card green">
    <div class="value">${progressPct}%</div>
    <div class="label">Progress (${completedCount}/${totalTasks} tasks)</div>
    <div class="progress-bar"><div class="fill" style="width:${progressPct}%"></div></div>
  </div>
  <div class="stat-card">
    <div class="value">${sessionCount}</div>
    <div class="label">Sessions logged</div>
  </div>
  <div class="stat-card purple">
    <div class="value">${decisionCount}</div>
    <div class="label">Decisions recorded</div>
  </div>
  <div class="stat-card amber">
    <div class="value">${currentPhase.length > 25 ? currentPhase.substring(0, 25) + "..." : currentPhase}</div>
    <div class="label" style="font-size:11px">Current Phase</div>
  </div>
</div>

<div class="grid">
  <div class="card">
    <div class="card-header">&#x1f4cd; Current State</div>
    <div class="card-body">${md(state)}</div>
  </div>
  <div class="card">
    <div class="card-header">&#x2705; Progress</div>
    <div class="card-body tall">${md(progress)}</div>
  </div>
  <div class="card">
    <div class="card-header">&#x2696;&#xfe0f; Decisions</div>
    <div class="card-body tall">${md(decisions)}</div>
  </div>
  <div class="card">
    <div class="card-header">&#x1f4c5; Session Log</div>
    <div class="card-body tall">${md(sessionLog)}</div>
  </div>
</div>

<footer>
  <a href="https://github.com/marolinik/MemoryForge">MemoryForge</a> &mdash; Persistent memory for Claude Code
</footer>

</body>
</html>`;

// ---------------------------------------------------------------------------
// Write and open
// ---------------------------------------------------------------------------
const outPath = path.join(mindDir, "dashboard.html");
fs.writeFileSync(outPath, html);
console.log(`Dashboard generated: ${outPath}`);

if (!noOpen) {
  const platform = process.platform;
  const cmd =
    platform === "win32"
      ? `start "" "${outPath}"`
      : platform === "darwin"
        ? `open "${outPath}"`
        : `xdg-open "${outPath}"`;

  exec(cmd, (err) => {
    if (err) {
      console.log("Could not open browser automatically. Open the file manually:");
      console.log(`  ${outPath}`);
    }
  });
}
