#!/usr/bin/env node
// =============================================================================
// MemoryForge: MCP Memory Server
// =============================================================================
// Zero-dependency MCP server providing tools to query and update .mind/ files.
// Speaks MCP protocol over stdio (Content-Length framed JSON-RPC 2.0).
//
// Tools:
//   memory_status         — Read current project state from STATE.md
//   memory_search         — Search across all .mind/ files
//   memory_update_state   — Update STATE.md with new phase/status/blockers
//   memory_save_decision  — Append a decision to DECISIONS.md
//   memory_save_progress  — Add or check off tasks in PROGRESS.md
//   memory_save_session   — Append a session summary to SESSION-LOG.md
//
// Usage: Configured as MCP server in .mcp.json
//   { "mcpServers": { "memory": { "command": "node", "args": ["scripts/mcp-memory-server.js"] } } }
//
// Zero dependencies. Pure Node.js.
// =============================================================================

const fs = require('fs');
const path = require('path');

// --- Constants ---

const MAX_INPUT_SIZE = 50 * 1024; // 50KB limit per tool call

// --- Find .mind/ directory ---

function findMindDir() {
  // Try CLAUDE_PROJECT_DIR first
  if (process.env.CLAUDE_PROJECT_DIR) {
    const dir = path.join(process.env.CLAUDE_PROJECT_DIR, '.mind');
    if (fs.existsSync(dir)) return dir;
  }

  // Walk up from cwd
  let current = process.cwd();
  for (let i = 0; i < 10; i++) {
    const candidate = path.join(current, '.mind');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  // Fallback: create in cwd
  const fallback = path.join(process.cwd(), '.mind');
  if (!fs.existsSync(fallback)) {
    fs.mkdirSync(fallback, { recursive: true });
  }
  return fallback;
}

const MIND_DIR = findMindDir();

// --- File helpers ---

function safePath(name) {
  const filePath = path.join(MIND_DIR, name);
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(MIND_DIR))) {
    throw new Error('Path traversal blocked: ' + name);
  }
  return resolved;
}

function readMindFile(name) {
  try {
    return fs.readFileSync(safePath(name), 'utf-8');
  } catch (err) {
    if (err.message.startsWith('Path traversal')) throw err;
    return null;
  }
}

function writeMindFile(name, content) {
  const filePath = safePath(name);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf-8');
}

function appendMindFile(name, content) {
  const filePath = safePath(name);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, content, 'utf-8');
}

// --- Tool implementations ---

function memoryStatus() {
  const state = readMindFile('STATE.md');
  if (!state) {
    return { content: [{ type: 'text', text: 'No STATE.md found. Create one with memory_update_state.' }] };
  }
  return { content: [{ type: 'text', text: state }] };
}

function memorySearch(args) {
  const query = (args.query || '').toLowerCase().trim();
  if (!query) {
    return { content: [{ type: 'text', text: 'Error: query parameter is required.' }], isError: true };
  }

  const files = ['STATE.md', 'PROGRESS.md', 'DECISIONS.md', 'SESSION-LOG.md'];
  const results = [];

  for (const file of files) {
    const content = readMindFile(file);
    if (!content) continue;

    const lines = content.split('\n');
    const matches = [];

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes(query)) {
        // Include context: 1 line before and after
        const start = Math.max(0, i - 1);
        const end = Math.min(lines.length - 1, i + 1);
        const snippet = lines.slice(start, end + 1).join('\n');
        matches.push({ line: i + 1, snippet });
      }
    }

    if (matches.length > 0) {
      results.push({
        file,
        matches: matches.slice(0, 10) // limit per file
      });
    }
  }

  if (results.length === 0) {
    return { content: [{ type: 'text', text: `No results for "${args.query}" in .mind/ files.` }] };
  }

  let output = `Search results for "${args.query}":\n\n`;
  for (const r of results) {
    output += `--- ${r.file} ---\n`;
    for (const m of r.matches) {
      output += `  Line ${m.line}:\n${m.snippet}\n\n`;
    }
  }

  return { content: [{ type: 'text', text: output }] };
}

function memoryUpdateState(args) {
  const existing = readMindFile('STATE.md') || '';
  const now = new Date().toISOString().split('T')[0];

  // Build updates map — only for fields the caller provided
  const updates = {};
  if (args.phase !== undefined) updates['Current Phase'] = args.phase;
  if (args.status !== undefined) updates['Current Status'] = args.status;
  if (args.active_work !== undefined) {
    updates['Active Work'] = Array.isArray(args.active_work)
      ? args.active_work.map(i => `- ${i}`).join('\n')
      : String(args.active_work);
  }
  if (args.blockers !== undefined) {
    updates['Blocked Items'] = Array.isArray(args.blockers)
      ? args.blockers.map(i => `- ${i}`).join('\n')
      : String(args.blockers);
  }
  if (args.next_action !== undefined) updates['Next Action'] = args.next_action;
  updates['Last Updated'] = now;

  // If no existing content, build from scratch
  if (!existing.trim()) {
    let content = '# Project State\n\n';
    content += `## Current Phase\n${updates['Current Phase'] || 'Not set'}\n\n`;
    content += `## Current Status\n${updates['Current Status'] || 'Not set'}\n\n`;
    content += `## Active Work\n${updates['Active Work'] || 'None'}\n\n`;
    content += `## Blocked Items\n${updates['Blocked Items'] || 'None'}\n\n`;
    content += `## Next Action\n${updates['Next Action'] || 'Not set'}\n\n`;
    content += `## Last Updated\n${now}\n`;
    writeMindFile('STATE.md', content);
    const phase = updates['Current Phase'] || 'Not set';
    return { content: [{ type: 'text', text: `STATE.md created. Phase: ${phase}` }] };
  }

  // Parse existing file into ordered sections: [{heading: string|null, body: string}]
  const parsed = [];
  const lines = existing.split('\n');
  let curHeading = null;
  let curBody = [];

  for (const line of lines) {
    if (/^## /.test(line)) {
      parsed.push({ heading: curHeading, body: curBody.join('\n') });
      curHeading = line.replace(/^## /, '').trim();
      curBody = [];
    } else {
      curBody.push(line);
    }
  }
  parsed.push({ heading: curHeading, body: curBody.join('\n') });

  // Rebuild: update sections that have updates, preserve everything else (including custom sections)
  const handledHeadings = new Set();
  const output = [];

  for (const section of parsed) {
    if (section.heading === null) {
      // File header (before first ##)
      output.push(section.body);
    } else if (section.heading in updates) {
      // Known section being updated
      output.push(`## ${section.heading}\n${updates[section.heading]}\n`);
      handledHeadings.add(section.heading);
    } else {
      // Preserve as-is (including custom/unknown sections)
      output.push(`## ${section.heading}\n${section.body}`);
    }
  }

  // Add any updates for sections not found in the existing file
  for (const [heading, content] of Object.entries(updates)) {
    if (!handledHeadings.has(heading)) {
      output.push(`## ${heading}\n${content}\n`);
    }
  }

  const result = output.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
  writeMindFile('STATE.md', result);
  const phase = args.phase || extractSection(existing, 'Current Phase') || 'unchanged';
  return { content: [{ type: 'text', text: `STATE.md updated. Phase: ${phase}` }] };
}

function memorySaveDecision(args) {
  if (!args.title || !args.decision) {
    return { content: [{ type: 'text', text: 'Error: title and decision are required.' }], isError: true };
  }

  const existing = readMindFile('DECISIONS.md') || '# Decision Log\n';
  const now = new Date().toISOString().split('T')[0];

  // Find next decision number
  const matches = existing.match(/## DEC-(\d+)/g) || [];
  const maxNum = matches.reduce((max, m) => {
    const num = parseInt(m.replace('## DEC-', ''));
    return num > max ? num : max;
  }, 0);
  const nextId = `DEC-${String(maxNum + 1).padStart(3, '0')}`;

  const entry = `\n## ${nextId}: ${args.title}\n` +
    `- **Date:** ${now}\n` +
    `- **Decided by:** ${args.decided_by || 'agent'}\n` +
    `- **Decision:** ${args.decision}\n` +
    `- **Rationale:** ${args.rationale || 'Not specified'}\n` +
    `- **Status:** ${args.status || 'Final'}\n\n`;

  appendMindFile('DECISIONS.md', entry);
  return { content: [{ type: 'text', text: `Decision ${nextId} saved: ${args.title}` }] };
}

function memorySaveProgress(args) {
  if (!args.task) {
    return { content: [{ type: 'text', text: 'Error: task is required.' }], isError: true };
  }

  const existing = readMindFile('PROGRESS.md') || '# Progress Tracker\n';

  if (args.action === 'complete' || args.completed === true) {
    // Try exact match first
    const exactPattern = `- [ ] ${args.task}`;
    if (existing.includes(exactPattern)) {
      const now = new Date().toISOString().split('T')[0];
      const updated = existing.replace(exactPattern, `- [x] ${args.task} (completed ${now})`);
      writeMindFile('PROGRESS.md', updated);
      return { content: [{ type: 'text', text: `Marked complete: ${args.task}` }] };
    }

    // Fuzzy match: case-insensitive substring on unchecked tasks
    const needle = args.task.trim().toLowerCase();
    const lines = existing.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^(\s*- )\[ \] (.+)$/);
      if (m && m[2].toLowerCase().includes(needle)) {
        const now = new Date().toISOString().split('T')[0];
        lines[i] = `${m[1]}[x] ${m[2]} (completed ${now})`;
        writeMindFile('PROGRESS.md', lines.join('\n'));
        return { content: [{ type: 'text', text: `Marked complete: ${m[2]}` }] };
      }
    }

    // Not found — fall through to add action
  }

  if (args.action === 'add' || (!args.action && !args.completed)) {
    // Add a new task
    const section = args.section || 'In Progress';
    const checkbox = args.completed ? '[x]' : '[ ]';
    const entry = `- ${checkbox} ${args.task}\n`;

    // Try to find the section and append
    const sectionPattern = new RegExp(`(### ${section}[^\n]*\n)`, 'i');
    if (sectionPattern.test(existing)) {
      const updated = existing.replace(sectionPattern, `$1${entry}`);
      writeMindFile('PROGRESS.md', updated);
    } else {
      // Append new section
      appendMindFile('PROGRESS.md', `\n### ${section}\n${entry}`);
    }
    return { content: [{ type: 'text', text: `Added to ${section}: ${args.task}` }] };
  }

  return { content: [{ type: 'text', text: `Task updated: ${args.task}` }] };
}

function memorySaveSession(args) {
  if (!args.summary) {
    return { content: [{ type: 'text', text: 'Error: summary is required.' }], isError: true };
  }

  const existing = readMindFile('SESSION-LOG.md') || '# Session Log\n';
  const now = new Date().toISOString().replace('T', ' ').split('.')[0];

  // Find next session number
  const matches = existing.match(/## Session (\d+)/g) || [];
  const maxNum = matches.reduce((max, m) => {
    const num = parseInt(m.replace('## Session ', ''));
    return num > max ? num : max;
  }, 0);
  const nextNum = maxNum + 1;

  let entry = `\n## Session ${nextNum} — ${now}\n`;
  entry += `- **Summary:** ${args.summary}\n`;
  if (args.completed) entry += `- **Completed:** ${Array.isArray(args.completed) ? args.completed.join(', ') : args.completed}\n`;
  if (args.decisions) entry += `- **Decisions:** ${Array.isArray(args.decisions) ? args.decisions.join(', ') : args.decisions}\n`;
  if (args.blockers) entry += `- **Blockers:** ${Array.isArray(args.blockers) ? args.blockers.join(', ') : args.blockers}\n`;
  if (args.next) entry += `- **Next session:** ${args.next}\n`;
  entry += '\n';

  appendMindFile('SESSION-LOG.md', entry);
  return { content: [{ type: 'text', text: `Session ${nextNum} logged.` }] };
}

// --- Section extraction helpers ---

function extractSection(content, heading) {
  const regex = new RegExp(`## ${heading}\\s*\\n([\\s\\S]*?)(?=\\n## |$)`, 'i');
  const match = content.match(regex);
  return match ? match[1].trim() : null;
}

function extractList(content, heading) {
  const section = extractSection(content, heading);
  if (!section) return [];
  return section.split('\n')
    .filter(line => line.trim().startsWith('- '))
    .map(line => line.trim().replace(/^- /, ''));
}

// --- MCP Protocol (JSON-RPC 2.0 over Content-Length stdio) ---

const TOOLS = [
  {
    name: 'memory_status',
    description: 'Read the current project state from .mind/STATE.md. Call this first to understand where the project is.',
    inputSchema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'memory_search',
    description: 'Search across all .mind/ files (STATE.md, PROGRESS.md, DECISIONS.md, SESSION-LOG.md) for a keyword or topic. Returns matching lines with context.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search term (case-insensitive)' }
      },
      required: ['query']
    }
  },
  {
    name: 'memory_update_state',
    description: 'Update .mind/STATE.md with the current project phase, status, active work, blockers, and next action. Only provide fields you want to change — others are preserved. Custom sections you added manually are also preserved.',
    inputSchema: {
      type: 'object',
      properties: {
        phase: { type: 'string', description: 'Current phase (e.g. "Phase 2: API Development — IN PROGRESS")' },
        status: { type: 'string', description: 'Brief status summary (1-2 sentences)' },
        active_work: {
          type: 'array', items: { type: 'string' },
          description: 'List of active work items (replaces existing list)'
        },
        blockers: {
          type: 'array', items: { type: 'string' },
          description: 'List of blockers (replaces existing list)'
        },
        next_action: { type: 'string', description: 'What should happen next' }
      }
    }
  },
  {
    name: 'memory_save_decision',
    description: 'Record a decision in .mind/DECISIONS.md with rationale. Auto-numbered (DEC-001, DEC-002, etc.).',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Decision title (e.g. "Use PostgreSQL over SQLite")' },
        decision: { type: 'string', description: 'What was decided' },
        rationale: { type: 'string', description: 'Why this was decided' },
        decided_by: { type: 'string', description: 'Who decided (default: "agent")' },
        status: { type: 'string', description: 'Decision status (default: "Final")' }
      },
      required: ['title', 'decision']
    }
  },
  {
    name: 'memory_save_progress',
    description: 'Add a task to .mind/PROGRESS.md or mark an existing task as complete. Completion uses fuzzy matching — partial task text will match.',
    inputSchema: {
      type: 'object',
      properties: {
        task: { type: 'string', description: 'Task description (exact or partial match for completion)' },
        action: {
          type: 'string', enum: ['add', 'complete'],
          description: '"add" to create a new task, "complete" to check off an existing one'
        },
        section: { type: 'string', description: 'Section name for new tasks (default: "In Progress")' },
        completed: { type: 'boolean', description: 'If true, marks as complete (same as action: "complete")' }
      },
      required: ['task']
    }
  },
  {
    name: 'memory_save_session',
    description: 'Append a session summary to .mind/SESSION-LOG.md. Call this at the end of each work session.',
    inputSchema: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'What happened this session (1-3 sentences)' },
        completed: {
          oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
          description: 'What was completed'
        },
        decisions: {
          oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
          description: 'Decisions made'
        },
        blockers: {
          oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
          description: 'Current blockers'
        },
        next: { type: 'string', description: 'What the next session should do' }
      },
      required: ['summary']
    }
  }
];

const TOOL_HANDLERS = {
  memory_status: () => memoryStatus(),
  memory_search: (args) => memorySearch(args),
  memory_update_state: (args) => memoryUpdateState(args),
  memory_save_decision: (args) => memorySaveDecision(args),
  memory_save_progress: (args) => memorySaveProgress(args),
  memory_save_session: (args) => memorySaveSession(args)
};

// --- stdio transport (Content-Length framing with proper Buffer handling) ---

// Use raw Buffers to handle multi-byte characters correctly.
// Content-Length is in bytes, so string-based slicing would break on non-ASCII.
let rawBuffer = Buffer.alloc(0);
const SEPARATOR = Buffer.from('\r\n\r\n');

function send(message) {
  const json = JSON.stringify(message);
  const bodyBytes = Buffer.from(json, 'utf-8');
  const header = `Content-Length: ${bodyBytes.length}\r\n\r\n`;
  process.stdout.write(header);
  process.stdout.write(bodyBytes);
}

function handleMessage(msg) {
  // JSON-RPC 2.0 notifications (no id) — no response needed
  if (msg.id === undefined || msg.id === null) {
    // Handle 'notifications/initialized' silently
    return;
  }

  const { id, method, params } = msg;

  switch (method) {
    case 'initialize':
      send({
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {}
          },
          serverInfo: {
            name: 'memoryforge',
            version: '1.1.0'
          }
        }
      });
      break;

    case 'tools/list':
      send({
        jsonrpc: '2.0',
        id,
        result: { tools: TOOLS }
      });
      break;

    case 'tools/call': {
      const toolName = params?.name;
      const toolArgs = params?.arguments || {};
      const handler = TOOL_HANDLERS[toolName];

      if (!handler) {
        send({
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: `Unknown tool: ${toolName}` }],
            isError: true
          }
        });
        break;
      }

      // Input size limit — prevent disk/memory exhaustion
      const inputStr = JSON.stringify(toolArgs);
      if (inputStr.length > MAX_INPUT_SIZE) {
        send({
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: `Input too large (${inputStr.length} chars, max ${MAX_INPUT_SIZE}). Reduce input size.` }],
            isError: true
          }
        });
        break;
      }

      // Validate required fields against inputSchema
      const toolDef = TOOLS.find(t => t.name === toolName);
      if (toolDef && toolDef.inputSchema && toolDef.inputSchema.required) {
        const missing = toolDef.inputSchema.required.filter(f => !(f in toolArgs));
        if (missing.length > 0) {
          send({
            jsonrpc: '2.0',
            id,
            result: {
              content: [{ type: 'text', text: `Missing required field(s): ${missing.join(', ')}` }],
              isError: true
            }
          });
          break;
        }
      }

      try {
        const result = handler(toolArgs);
        send({ jsonrpc: '2.0', id, result });
      } catch (err) {
        logError('ToolCallError', err);
        send({
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: `Error: ${err.message}` }],
            isError: true
          }
        });
      }
      break;
    }

    default:
      // Unknown method — return error
      send({
        jsonrpc: '2.0',
        id,
        error: { code: -32601, message: `Method not found: ${method}` }
      });
  }
}

// Parse Content-Length framed messages from stdin using raw Buffers
process.stdin.on('data', (chunk) => {
  rawBuffer = Buffer.concat([rawBuffer, chunk]);

  while (true) {
    // Look for \r\n\r\n separator
    const headerEnd = rawBuffer.indexOf(SEPARATOR);
    if (headerEnd === -1) break;

    const headerStr = rawBuffer.subarray(0, headerEnd).toString('utf-8');
    const match = headerStr.match(/Content-Length:\s*(\d+)/i);
    if (!match) {
      // Bad header — skip past separator
      rawBuffer = rawBuffer.subarray(headerEnd + 4);
      continue;
    }

    const contentLength = parseInt(match[1]);
    const bodyStart = headerEnd + 4;

    // Not enough data yet
    if (rawBuffer.length - bodyStart < contentLength) break;

    // Extract exactly contentLength bytes
    const bodyBytes = rawBuffer.subarray(bodyStart, bodyStart + contentLength);
    rawBuffer = rawBuffer.subarray(bodyStart + contentLength);

    try {
      const msg = JSON.parse(bodyBytes.toString('utf-8'));
      handleMessage(msg);
    } catch (err) {
      logError('JSONParseError', err);
    }
  }
});

process.stdin.on('end', () => process.exit(0));

// Log unhandled errors instead of silently swallowing them
function logError(label, err) {
  try {
    const logPath = path.join(MIND_DIR, '.mcp-errors.log');
    const ts = new Date().toISOString();
    const msg = err && err.stack ? err.stack : String(err);
    fs.appendFileSync(logPath, `[${ts}] ${label}: ${msg}\n`);
  } catch {
    // Cannot log — ignore to prevent infinite loop
  }
}
process.on('uncaughtException', (err) => logError('UncaughtException', err));
process.on('unhandledRejection', (err) => logError('UnhandledRejection', err));
