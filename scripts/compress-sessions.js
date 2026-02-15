#!/usr/bin/env node
// =============================================================================
// MemoryForge: Session & Decision Compressor
// =============================================================================
// Keeps .mind/ lean as projects grow by summarizing old entries.
//
// SESSION-LOG.md: Keep last 5 sessions full, summarize older to 1 line each.
// DECISIONS.md: Keep last 10 decisions full, summarize older to 1 line each.
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

const KEEP_SESSIONS_FULL = 5;
const KEEP_DECISIONS_FULL = 10;

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
// DECISIONS.md compression
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

    compressed.push(`- ${title}${status ? ` [${status}]` : ""}`);
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
// Main
// ---------------------------------------------------------------------------
const sessionLogPath = path.join(mindDir, "SESSION-LOG.md");
const decisionsPath = path.join(mindDir, "DECISIONS.md");

const sessionResult = compressSessions(sessionLogPath);
const decisionResult = compressDecisions(decisionsPath);

const totalSaved = sessionResult.saved + decisionResult.saved;

// Output as JSON for programmatic consumption
const output = {
  dryRun,
  sessions: sessionResult,
  decisions: decisionResult,
  totalTokensSaved: totalSaved,
};

console.log(JSON.stringify(output, null, 2));

// Also output human-readable summary to stderr
if (totalSaved > 0) {
  process.stderr.write(`\nMemoryForge Compression Report${dryRun ? " (dry run)" : ""}:\n`);
  if (sessionResult.saved > 0) {
    process.stderr.write(
      `  SESSION-LOG: ${sessionResult.compressed}/${sessionResult.sessions} sessions compressed, ~${sessionResult.saved} tokens saved\n`
    );
  }
  if (decisionResult.saved > 0) {
    process.stderr.write(
      `  DECISIONS: ${decisionResult.compressed}/${decisionResult.decisions} decisions compressed, ~${decisionResult.saved} tokens saved\n`
    );
  }
  process.stderr.write(`  Total saved: ~${totalSaved} tokens\n\n`);
} else {
  process.stderr.write(
    `\nMemoryForge: Nothing to compress (sessions: ${sessionResult.sessions || 0}, decisions: ${decisionResult.decisions || 0})\n\n`
  );
}
