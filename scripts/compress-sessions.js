#!/usr/bin/env node
// =============================================================================
// MemoryForge: Session, Decision & Progress Compressor
// =============================================================================
// Keeps .mind/ lean as projects grow by summarizing old entries.
//
// SESSION-LOG.md: Keep last 5 sessions full, summarize older to 1 line each.
// DECISIONS.md: Keep last 10 decisions full, summarize older to 2 lines each
//               (title + rationale preserved).
// PROGRESS.md: Archive completed tasks older than 30 days to ARCHIVE.md.
// Tracking files: Rotate .agent-activity, .task-completions, .session-tracking
//                 to last 100 entries each.
//
// Usage:
//   node scripts/compress-sessions.js [.mind/ directory]
//   node scripts/compress-sessions.js --dry-run [.mind/ directory]
//
// Zero dependencies — pure Node.js.
// =============================================================================

const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const mindDir = args.find((a) => !a.startsWith("--")) || ".mind";

// Load user config if present (project root = parent of .mind/)
const defaults = {
  keepSessionsFull: 5,
  keepDecisionsFull: 10,
  archiveAfterDays: 30,
  trackingMaxLines: 100,
};
let userConfig = {};
try {
  const projectRoot = path.resolve(mindDir, "..");
  const configPath = path.join(projectRoot, ".memoryforge.config.js");
  if (fs.existsSync(configPath)) {
    userConfig = require(configPath);
  }
} catch {
  // Config load failed — use defaults silently
}
const config = { ...defaults, ...userConfig };

const KEEP_SESSIONS_FULL = config.keepSessionsFull;
const KEEP_DECISIONS_FULL = config.keepDecisionsFull;
const ARCHIVE_AFTER_DAYS = config.archiveAfterDays;
const TRACKING_MAX_LINES = config.trackingMaxLines;

function readFile(filePath) {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

function estimateTokens(text) {
  // Rough estimate: ~4 chars per token for English markdown
  return Math.ceil(text.length / 4);
}

// ---------------------------------------------------------------------------
// SESSION-LOG.md compression
// ---------------------------------------------------------------------------
function compressSessions(filePath) {
  const content = readFile(filePath);
  if (!content) return { saved: 0, before: 0, after: 0 };

  const before = estimateTokens(content);

  // Split into header + session blocks
  const lines = content.split("\n");
  const headerLines = [];
  const sessions = [];
  let current = null;

  for (const line of lines) {
    if (/^## Session \d+/.test(line)) {
      if (current) sessions.push(current);
      current = { header: line, lines: [line] };
    } else if (current) {
      current.lines.push(line);
    } else {
      headerLines.push(line);
    }
  }
  if (current) sessions.push(current);

  if (sessions.length <= KEEP_SESSIONS_FULL) {
    return { saved: 0, before, after: before, sessions: sessions.length };
  }

  // Split: old sessions to summarize, recent sessions to keep
  const toSummarize = sessions.slice(0, -KEEP_SESSIONS_FULL);
  const toKeep = sessions.slice(-KEEP_SESSIONS_FULL);

  // Build compressed output
  const compressed = [];
  compressed.push(...headerLines);
  compressed.push("");
  compressed.push("## Archived Sessions (compressed)");

  for (const session of toSummarize) {
    // Extract key info from the session block
    const block = session.lines.join("\n");
    const dateMatch = session.header.match(
      /Session \d+ — (.+?)(?:\s*\(|$)/
    );
    const date = dateMatch ? dateMatch[1].trim() : "unknown date";

    // Try to extract completed items or duration
    const completedMatch = block.match(
      /\*\*Completed:\*\*\s*(.+?)(?:\n|$)/
    );
    const filesMatch = block.match(
      /\*\*Files changed:\*\*\s*(\d+)/
    );
    const reasonMatch = block.match(
      /\*\*Reason ended:\*\*\s*(.+?)(?:\n|$)/
    );

    let summary = `- ${date}:`;
    if (completedMatch) {
      summary += ` ${completedMatch[1].trim().substring(0, 80)}`;
    } else if (filesMatch) {
      summary += ` ${filesMatch[1]} files changed`;
      if (reasonMatch) summary += ` (${reasonMatch[1].trim()})`;
    } else {
      // Fallback: first non-header, non-empty line
      const firstContent = session.lines
        .slice(1)
        .find((l) => l.trim() && !l.startsWith("-") && !l.startsWith("#"));
      if (firstContent) {
        summary += ` ${firstContent.trim().substring(0, 80)}`;
      } else {
        summary += " (session data)";
      }
    }
    compressed.push(summary);
  }

  compressed.push("");

  // Keep recent sessions in full
  for (const session of toKeep) {
    compressed.push(...session.lines);
    compressed.push("");
  }

  const result = compressed.join("\n").trimEnd() + "\n";
  const after = estimateTokens(result);

  if (!dryRun) {
    // Backup original
    fs.copyFileSync(filePath, filePath + ".pre-compress");
    fs.writeFileSync(filePath, result);
  }

  return {
    saved: before - after,
    before,
    after,
    sessions: sessions.length,
    compressed: toSummarize.length,
    kept: toKeep.length,
  };
}

// ---------------------------------------------------------------------------
// DECISIONS.md compression (with rationale preservation)
// ---------------------------------------------------------------------------
function compressDecisions(filePath) {
  const content = readFile(filePath);
  if (!content) return { saved: 0, before: 0, after: 0 };

  const before = estimateTokens(content);

  // Split into header + decision blocks
  const lines = content.split("\n");
  const headerLines = [];
  const decisions = [];
  let current = null;

  for (const line of lines) {
    if (/^## DEC-\d+/.test(line) || /^## Decision/.test(line)) {
      if (current) decisions.push(current);
      current = { header: line, lines: [line] };
    } else if (current) {
      current.lines.push(line);
    } else {
      headerLines.push(line);
    }
  }
  if (current) decisions.push(current);

  if (decisions.length <= KEEP_DECISIONS_FULL) {
    return { saved: 0, before, after: before, decisions: decisions.length };
  }

  const toSummarize = decisions.slice(0, -KEEP_DECISIONS_FULL);
  const toKeep = decisions.slice(-KEEP_DECISIONS_FULL);

  const compressed = [];
  compressed.push(...headerLines);
  compressed.push("");
  compressed.push("## Archived Decisions (compressed)");

  for (const decision of toSummarize) {
    const block = decision.lines.join("\n");
    const titleMatch = decision.header.match(
      /(?:DEC-\d+|Decision\s*\d*):\s*(.+)/
    );
    const title = titleMatch ? titleMatch[1].trim() : decision.header;
    const statusMatch = block.match(/\*\*Status:\*\*\s*(.+?)(?:\n|$)/);
    const status = statusMatch ? statusMatch[1].trim() : "";
    const rationaleMatch = block.match(/\*\*Rationale:\*\*\s*(.+?)(?:\n|$)/);
    const rationale = rationaleMatch
      ? rationaleMatch[1].trim().substring(0, 100)
      : "";

    // 2-line compressed format: title [status] + rationale
    compressed.push(`- ${title}${status ? ` [${status}]` : ""}`);
    if (rationale) {
      compressed.push(`  _Why: ${rationale}_`);
    }
  }

  compressed.push("");

  for (const decision of toKeep) {
    compressed.push(...decision.lines);
    compressed.push("");
  }

  const result = compressed.join("\n").trimEnd() + "\n";
  const after = estimateTokens(result);

  if (!dryRun) {
    fs.copyFileSync(filePath, filePath + ".pre-compress");
    fs.writeFileSync(filePath, result);
  }

  return {
    saved: before - after,
    before,
    after,
    decisions: decisions.length,
    compressed: toSummarize.length,
    kept: toKeep.length,
  };
}

// ---------------------------------------------------------------------------
// PROGRESS.md task archival — move completed tasks older than 30 days
// ---------------------------------------------------------------------------
function archiveCompletedTasks(progressPath, archivePath) {
  const content = readFile(progressPath);
  if (!content) return { archived: 0 };

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - ARCHIVE_AFTER_DAYS);

  const lines = content.split("\n");
  const kept = [];
  const archived = [];

  for (const line of lines) {
    // Match completed tasks: "- [x] Task description (completed 2025-12-15)"
    const completedMatch = line.match(
      /^(\s*)-\s*\[x\]\s+(.+?)\s*\(completed\s+(\d{4}-\d{2}-\d{2})\)/i
    );

    if (completedMatch) {
      const completedDate = new Date(completedMatch[3]);
      if (completedDate < cutoff && !isNaN(completedDate.getTime())) {
        archived.push(line);
        continue;
      }
    }
    kept.push(line);
  }

  if (archived.length === 0) return { archived: 0 };

  if (!dryRun) {
    // Append to ARCHIVE.md
    let archiveContent = readFile(archivePath) || "# Archived Tasks\n\n";
    archiveContent +=
      `\n## Archived on ${new Date().toISOString().split("T")[0]}\n`;
    for (const line of archived) {
      archiveContent += line + "\n";
    }
    fs.writeFileSync(archivePath, archiveContent);

    // Rewrite PROGRESS.md without archived tasks
    fs.copyFileSync(progressPath, progressPath + ".pre-compress");
    fs.writeFileSync(progressPath, kept.join("\n"));
  }

  return { archived: archived.length };
}

// ---------------------------------------------------------------------------
// Tracking file rotation — keep last N lines
// ---------------------------------------------------------------------------
function rotateTrackingFile(filePath, maxLines) {
  const content = readFile(filePath);
  if (!content) return { rotated: false };

  const lines = content.split("\n").filter((l) => l.trim());
  if (lines.length <= maxLines) return { rotated: false, lines: lines.length };

  const kept = lines.slice(-maxLines);

  if (!dryRun) {
    fs.writeFileSync(filePath, kept.join("\n") + "\n");
  }

  return {
    rotated: true,
    before: lines.length,
    after: kept.length,
    removed: lines.length - kept.length,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const sessionLogPath = path.join(mindDir, "SESSION-LOG.md");
const decisionsPath = path.join(mindDir, "DECISIONS.md");
const progressPath = path.join(mindDir, "PROGRESS.md");
const archivePath = path.join(mindDir, "ARCHIVE.md");

const sessionResult = compressSessions(sessionLogPath);
const decisionResult = compressDecisions(decisionsPath);
const archiveResult = archiveCompletedTasks(progressPath, archivePath);

// Rotate tracking files
const trackingFiles = [
  ".agent-activity",
  ".task-completions",
  ".session-tracking",
];
const rotationResults = {};
for (const tf of trackingFiles) {
  const tfPath = path.join(mindDir, tf);
  rotationResults[tf] = rotateTrackingFile(tfPath, TRACKING_MAX_LINES);
}

const totalSaved = sessionResult.saved + decisionResult.saved;

// Output as JSON for programmatic consumption
const output = {
  dryRun,
  sessions: sessionResult,
  decisions: decisionResult,
  archive: archiveResult,
  tracking: rotationResults,
  totalTokensSaved: totalSaved,
};

console.log(JSON.stringify(output, null, 2));

// Also output human-readable summary to stderr
const parts = [];
if (sessionResult.saved > 0) {
  parts.push(
    `  SESSION-LOG: ${sessionResult.compressed}/${sessionResult.sessions} sessions compressed, ~${sessionResult.saved} tokens saved`
  );
}
if (decisionResult.saved > 0) {
  parts.push(
    `  DECISIONS: ${decisionResult.compressed}/${decisionResult.decisions} decisions compressed, ~${decisionResult.saved} tokens saved`
  );
}
if (archiveResult.archived > 0) {
  parts.push(
    `  PROGRESS: ${archiveResult.archived} completed tasks archived to ARCHIVE.md`
  );
}
for (const [tf, r] of Object.entries(rotationResults)) {
  if (r.rotated) {
    parts.push(`  ${tf}: rotated ${r.before} → ${r.after} entries`);
  }
}

if (parts.length > 0) {
  process.stderr.write(
    `\nMemoryForge Compression Report${dryRun ? " (dry run)" : ""}:\n`
  );
  for (const p of parts) {
    process.stderr.write(p + "\n");
  }
  if (totalSaved > 0) {
    process.stderr.write(`  Total saved: ~${totalSaved} tokens\n`);
  }
  process.stderr.write("\n");
} else {
  process.stderr.write(
    `\nMemoryForge: Nothing to compress (sessions: ${sessionResult.sessions || 0}, decisions: ${decisionResult.decisions || 0})\n\n`
  );
}
