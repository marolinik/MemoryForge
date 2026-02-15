#!/usr/bin/env node
// =============================================================================
// MemoryForge: Fleet Dashboard — Multi-Project Overview
// =============================================================================
// Scans a parent directory for projects with .mind/ directories and generates
// a single HTML dashboard showing the status of all projects at a glance.
//
// Usage:
//   node scripts/fleet-dashboard.js [parent-directory]
//   node scripts/fleet-dashboard.js ~/Projects
//   node scripts/fleet-dashboard.js --no-open [parent-directory]
//
// Zero dependencies. Pure Node.js.
// =============================================================================

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const args = process.argv.slice(2);
const noOpen = args.includes('--no-open');
const parentDir = args.find(a => !a.startsWith('--')) || '.';

// --- Scan for projects with .mind/ ---

function findProjects(dir) {
  const projects = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return projects;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;

    const projectDir = path.join(dir, entry.name);
    const mindDir = path.join(projectDir, '.mind');

    if (fs.existsSync(mindDir) && fs.statSync(mindDir).isDirectory()) {
      projects.push({
        name: entry.name,
        path: projectDir,
        mindDir,
      });
    }
  }

  return projects;
}

// --- Read project state ---

function readFile(filePath) {
  try { return fs.readFileSync(filePath, 'utf-8'); } catch { return null; }
}

function getProjectStatus(project) {
  const state = readFile(path.join(project.mindDir, 'STATE.md'));
  const progress = readFile(path.join(project.mindDir, 'PROGRESS.md'));
  const decisions = readFile(path.join(project.mindDir, 'DECISIONS.md'));
  const sessions = readFile(path.join(project.mindDir, 'SESSION-LOG.md'));

  // Extract phase
  const phaseMatch = state && state.match(/## Current Phase\n(.+)/);
  const phase = phaseMatch ? phaseMatch[1].trim() : 'Unknown';

  // Extract status
  const statusMatch = state && state.match(/## Current Status\n(.+)/);
  const status = statusMatch ? statusMatch[1].trim() : 'Unknown';

  // Count tasks
  const completed = (progress || '').match(/- \[x\]/gi) || [];
  const pending = (progress || '').match(/- \[ \]/g) || [];
  const total = completed.length + pending.length;
  const pct = total > 0 ? Math.round((completed.length / total) * 100) : 0;

  // Count decisions
  const decCount = ((decisions || '').match(/^## DEC-/gm) || []).length;

  // Count sessions
  const sessCount = ((sessions || '').match(/^## Session/gm) || []).length;

  // Last updated
  const lastUpdatedMatch = state && state.match(/## Last Updated\n(.+)/);
  const lastUpdated = lastUpdatedMatch ? lastUpdatedMatch[1].trim() : 'Unknown';

  // .mind/ size
  let totalSize = 0;
  try {
    const files = fs.readdirSync(project.mindDir);
    for (const f of files) {
      const st = fs.statSync(path.join(project.mindDir, f));
      if (st.isFile()) totalSize += st.size;
    }
  } catch { /* ignore */ }

  return {
    ...project,
    phase,
    status,
    completed: completed.length,
    pending: pending.length,
    total,
    pct,
    decisions: decCount,
    sessions: sessCount,
    lastUpdated,
    mindSize: totalSize,
  };
}

// --- Generate HTML ---

function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function generateHtml(projects) {
  const rows = projects.map(p => {
    const barColor = p.pct === 100 ? '#4ade80' : p.pct >= 50 ? '#facc15' : '#60a5fa';
    const statusColor = p.phase.includes('COMPLETE') ? '#4ade80' :
                        p.phase.includes('IN PROGRESS') || p.phase.includes('PROGRESS') ? '#facc15' :
                        p.phase.includes('NOT STARTED') ? '#94a3b8' : '#60a5fa';

    return `
      <tr>
        <td class="name">${escapeHtml(p.name)}</td>
        <td><span class="badge" style="background:${statusColor}20;color:${statusColor}">${escapeHtml(p.phase.substring(0, 50))}</span></td>
        <td>
          <div class="bar-outer">
            <div class="bar-inner" style="width:${p.pct}%;background:${barColor}"></div>
          </div>
          <span class="pct">${p.completed}/${p.total} (${p.pct}%)</span>
        </td>
        <td class="num">${p.decisions}</td>
        <td class="num">${p.sessions}</td>
        <td class="num">${(p.mindSize / 1024).toFixed(1)} KB</td>
        <td class="date">${escapeHtml(p.lastUpdated)}</td>
      </tr>`;
  }).join('\n');

  const totalTasks = projects.reduce((s, p) => s + p.total, 0);
  const totalDone = projects.reduce((s, p) => s + p.completed, 0);
  const totalPct = totalTasks > 0 ? Math.round((totalDone / totalTasks) * 100) : 0;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>MemoryForge Fleet Dashboard</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
         background: #0f172a; color: #e2e8f0; padding: 2rem; }
  h1 { font-size: 1.5rem; margin-bottom: 0.5rem; color: #f1f5f9; }
  .subtitle { color: #94a3b8; margin-bottom: 2rem; font-size: 0.875rem; }
  .stats { display: flex; gap: 1.5rem; margin-bottom: 2rem; flex-wrap: wrap; }
  .stat-card { background: #1e293b; border-radius: 8px; padding: 1rem 1.5rem; min-width: 140px; }
  .stat-card .label { font-size: 0.75rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; }
  .stat-card .value { font-size: 1.75rem; font-weight: 700; color: #f1f5f9; margin-top: 0.25rem; }
  table { width: 100%; border-collapse: collapse; background: #1e293b; border-radius: 8px; overflow: hidden; }
  th { text-align: left; padding: 0.75rem 1rem; background: #334155; color: #94a3b8;
       font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; }
  td { padding: 0.75rem 1rem; border-top: 1px solid #334155; font-size: 0.875rem; }
  tr:hover { background: #334155; }
  .name { font-weight: 600; color: #f1f5f9; }
  .num { text-align: center; }
  .date { color: #94a3b8; font-size: 0.8rem; }
  .badge { padding: 0.2rem 0.6rem; border-radius: 4px; font-size: 0.75rem; font-weight: 500; white-space: nowrap; }
  .bar-outer { background: #334155; border-radius: 4px; height: 8px; width: 120px; display: inline-block; vertical-align: middle; }
  .bar-inner { height: 100%; border-radius: 4px; transition: width 0.3s; }
  .pct { font-size: 0.8rem; color: #94a3b8; margin-left: 0.5rem; }
  .empty { text-align: center; padding: 3rem; color: #64748b; }
  .footer { text-align: center; margin-top: 2rem; color: #475569; font-size: 0.75rem; }
</style>
</head>
<body>
  <h1>MemoryForge Fleet Dashboard</h1>
  <p class="subtitle">Scanning: ${escapeHtml(path.resolve(parentDir))} &mdash; ${projects.length} project${projects.length !== 1 ? 's' : ''} found</p>

  <div class="stats">
    <div class="stat-card">
      <div class="label">Projects</div>
      <div class="value">${projects.length}</div>
    </div>
    <div class="stat-card">
      <div class="label">Total Tasks</div>
      <div class="value">${totalTasks}</div>
    </div>
    <div class="stat-card">
      <div class="label">Completed</div>
      <div class="value">${totalDone}</div>
    </div>
    <div class="stat-card">
      <div class="label">Overall Progress</div>
      <div class="value">${totalPct}%</div>
    </div>
  </div>

  ${projects.length > 0 ? `
  <table>
    <thead>
      <tr>
        <th>Project</th>
        <th>Phase</th>
        <th>Progress</th>
        <th>Decisions</th>
        <th>Sessions</th>
        <th>.mind/ Size</th>
        <th>Last Updated</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>` : '<div class="empty">No projects with .mind/ directories found in this location.</div>'}

  <p class="footer">Generated by MemoryForge &mdash; ${new Date().toISOString()}</p>
</body>
</html>`;
}

// --- Main ---

const resolvedDir = path.resolve(parentDir);
if (!fs.existsSync(resolvedDir)) {
  console.error(`Directory not found: ${resolvedDir}`);
  process.exit(1);
}

const projects = findProjects(resolvedDir);
const statuses = projects.map(getProjectStatus);

// Sort by last updated (most recent first), then by name
statuses.sort((a, b) => {
  if (a.lastUpdated !== b.lastUpdated) return b.lastUpdated.localeCompare(a.lastUpdated);
  return a.name.localeCompare(b.name);
});

const html = generateHtml(statuses);
const outputPath = path.join(resolvedDir, 'fleet-dashboard.html');
fs.writeFileSync(outputPath, html);

console.log(`Fleet dashboard generated: ${outputPath}`);
console.log(`Found ${projects.length} project(s) with .mind/ directories.`);

if (!noOpen) {
  try {
    const platform = process.platform;
    if (platform === 'darwin') execSync(`open "${outputPath}"`);
    else if (platform === 'win32') execSync(`start "" "${outputPath}"`);
    else execSync(`xdg-open "${outputPath}"`);
  } catch {
    console.log('Could not auto-open browser. Open the file manually.');
  }
}
