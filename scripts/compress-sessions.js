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

// Known config keys (shared schema)
const { KNOWN_CONFIG_KEYS } = require("./config-keys.js");

// Load user config if present (project root = parent of .mind/)
const defaults = {
  keepSessionsFull: 5,
  keepDecisionsFull: 10,
  archiveAfterDays: 30,
};
let userConfig = {};
try {
  const projectRoot = path.resolve(mindDir, "..");
  const configPath = path.join(projectRoot, ".memoryforge.config.json");
  // Symlink check — don't follow symlinks for config (Bug #19)
  const stat = fs.lstatSync(configPath);
  if (!stat.isSymbolicLink() && stat.isFile()) {
    userConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    // Warn on unknown keys (schema validation — Bug #22)
    const unknownKeys = Object.keys(userConfig).filter(
      (k) => !KNOWN_CONFIG_KEYS.has(k)
    );
    if (unknownKeys.length > 0) {
      process.stderr.write(
        `[MemoryForge] Warning: unknown config key(s): ${unknownKeys.join(", ")} — check for typos\n`
      );
    }
  }
} catch {
  // Config load failed — use defaults silently
}
const config = { ...defaults, ...userConfig };

// Bounds-check config values — clamp to sane minimums
// Use Number.isSafeInteger after flooring to reject extreme values like 1e308 (Bug #11)
function safeInt(val, fallback, min) {
  const n = Math.floor(Number(val));
  if (!Number.isSafeInteger(n) || n < min) return fallback;
  return n;
}
const KEEP_SESSIONS_FULL = safeInt(config.keepSessionsFull, defaults.keepSessionsFull, 1);
const KEEP_DECISIONS_FULL = safeInt(config.keepDecisionsFull, defaults.keepDecisionsFull, 1);
const ARCHIVE_AFTER_DAYS = safeInt(config.archiveAfterDays, defaults.archiveAfterDays, 1);
const TRACKING_MAX_LINES = 100;
const COMPRESS_THRESHOLD_BYTES = 12000;
const MAX_PRE_COMPRESS_BACKUPS = 3;

function readFile(filePath) {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

function atomicWrite(filePath, content) {
  const tmpPath = filePath + '.tmp.' + process.pid;
  fs.writeFileSync(tmpPath, content, 'utf-8');
  fs.renameSync(tmpPath, filePath);
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
    // Backup original, then atomic write
    fs.copyFileSync(filePath, filePath + ".pre-compress");
    atomicWrite(filePath, result);
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
    atomicWrite(filePath, result);
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
    atomicWrite(archivePath, archiveContent);

    // Rewrite PROGRESS.md without archived tasks
    fs.copyFileSync(progressPath, progressPath + ".pre-compress");
    atomicWrite(progressPath, kept.join("\n"));
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
// Cleanup old .pre-compress backup files — keep last N (Bug #9)
// ---------------------------------------------------------------------------
function cleanupPreCompressBackups(dir) {
  try {
    const files = fs.readdirSync(dir)
      .filter((f) => f.endsWith(".pre-compress"))
      .map((f) => ({
        name: f,
        path: path.join(dir, f),
        mtime: fs.statSync(path.join(dir, f)).mtimeMs,
      }))
      .sort((a, b) => b.mtime - a.mtime);

    // Remove all beyond MAX_PRE_COMPRESS_BACKUPS
    const toRemove = files.slice(MAX_PRE_COMPRESS_BACKUPS);
    for (const f of toRemove) {
      fs.unlinkSync(f.path);
    }
    return { removed: toRemove.length, kept: files.length - toRemove.length };
  } catch {
    return { removed: 0, kept: 0 };
  }
}

// ---------------------------------------------------------------------------
// Exports (for require() usage without side effects — Bug #7)
// ---------------------------------------------------------------------------
module.exports = {
  compressSessions,
  compressDecisions,
  archiveCompletedTasks,
  rotateTrackingFile,
  cleanupPreCompressBackups,
};

// ---------------------------------------------------------------------------
// Main (only runs when executed directly, not when required — Bug #7)
// ---------------------------------------------------------------------------
if (require.main === module) {
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

  // Cleanup old .pre-compress backups (Bug #9)
  const backupCleanup = cleanupPreCompressBackups(mindDir);

  const totalSaved = sessionResult.saved + decisionResult.saved;

  // Output as JSON for programmatic consumption
  const output = {
    dryRun,
    sessions: sessionResult,
    decisions: decisionResult,
    archive: archiveResult,
    tracking: rotationResults,
    backupCleanup,
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
  if (backupCleanup.removed > 0) {
    parts.push(
      `  Backups: removed ${backupCleanup.removed} old .pre-compress files (kept ${backupCleanup.kept})`
    );
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
}
