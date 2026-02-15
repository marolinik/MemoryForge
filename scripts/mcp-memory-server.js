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
// Usage: Configured as MCP server in .claude/settings.json
//   "mcpServers": { "memory": { "command": "node", "args": ["scripts/mcp-memory-server.js"] } }
//
// Zero dependencies. Pure Node.js.
// =============================================================================

const fs = require('fs');
const path = require('path');

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

function readMindFile(name) {
  const filePath = path.join(MIND_DIR, name);
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

function writeMindFile(name, content) {
  const filePath = path.join(MIND_DIR, name);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf-8');
}

function appendMindFile(name, content) {
  const filePath = path.join(MIND_DIR, name);
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

  // Build new STATE.md from args, preserving any sections not being updated
  const sections = {
    phase: args.phase || extractSection(existing, 'Current Phase') || 'Not set',
    status: args.status || extractSection(existing, 'Current Status') || 'Not set',
    activeWork: args.active_work || extractList(existing, 'Active Work'),
    blockers: args.blockers || extractList(existing, 'Blocked Items'),
    nextAction: args.next_action || extractSection(existing, 'Next Action') || 'Not set'
  };

  let content = '# Project State\n\n';
  content += `## Current Phase\n${sections.phase}\n\n`;
  content += `## Current Status\n${sections.status}\n\n`;

  content += '## Active Work\n';
  if (Array.isArray(sections.activeWork) && sections.activeWork.length > 0) {
    for (const item of sections.activeWork) {
      content += `- ${item}\n`;
    }
  } else if (typeof sections.activeWork === 'string') {
    content += `${sections.activeWork}\n`;
  } else {
    content += 'None\n';
  }
  content += '\n';

  content += '## Blocked Items\n';
  if (Array.isArray(sections.blockers) && sections.blockers.length > 0) {
    for (const item of sections.blockers) {
      content += `- ${item}\n`;
    }
  } else if (typeof sections.blockers === 'string') {
    content += `${sections.blockers}\n`;
  } else {
    content += 'None\n';
  }
  content += '\n';

  content += `## Next Action\n${sections.nextAction}\n\n`;
  content += `## Last Updated\n${now}\n`;

  writeMindFile('STATE.md', content);
  return { content: [{ type: 'text', text: `STATE.md updated. Phase: ${sections.phase}` }] };
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
    // Try to find and check the task
    const pattern = `- [ ] ${args.task}`;
    if (existing.includes(pattern)) {
      const now = new Date().toISOString().split('T')[0];
      const updated = existing.replace(pattern, `- [x] ${args.task} (${now})`);
      writeMindFile('PROGRESS.md', updated);
      return { content: [{ type: 'text', text: `Marked complete: ${args.task}` }] };
    }
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
    description: 'Update .mind/STATE.md with the current project phase, status, active work, blockers, and next action. Only provide fields you want to change — others are preserved.',
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
    description: 'Add a task to .mind/PROGRESS.md or mark an existing task as complete.',
    inputSchema: {
      type: 'object',
      properties: {
        task: { type: 'string', description: 'Task description (must match existing text for completion)' },
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

// --- stdio transport (Content-Length framing) ---

let buffer = '';

function send(message) {
  const json = JSON.stringify(message);
  const header = `Content-Length: ${Buffer.byteLength(json)}\r\n\r\n`;
  process.stdout.write(header + json);
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
            version: '1.0.0'
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

      try {
        const result = handler(toolArgs);
        send({ jsonrpc: '2.0', id, result });
      } catch (err) {
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

// Parse Content-Length framed messages from stdin
process.stdin.setEncoding('utf-8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;

  while (true) {
    // Look for Content-Length header
    const headerEnd = buffer.indexOf('\r\n\r\n');
    if (headerEnd === -1) break;

    const header = buffer.substring(0, headerEnd);
    const match = header.match(/Content-Length:\s*(\d+)/i);
    if (!match) {
      // Bad header — skip past it
      buffer = buffer.substring(headerEnd + 4);
      continue;
    }

    const contentLength = parseInt(match[1]);
    const bodyStart = headerEnd + 4;
    const bodyEnd = bodyStart + contentLength;

    // Not enough data yet
    if (Buffer.byteLength(buffer.substring(bodyStart), 'utf-8') < contentLength) break;

    const body = buffer.substring(bodyStart, bodyStart + contentLength);
    buffer = buffer.substring(bodyEnd);

    try {
      const msg = JSON.parse(body);
      handleMessage(msg);
    } catch (err) {
      // Ignore malformed JSON
    }
  }
});

process.stdin.on('end', () => process.exit(0));

// Prevent unhandled errors from crashing the server
process.on('uncaughtException', () => {});
process.on('unhandledRejection', () => {});
