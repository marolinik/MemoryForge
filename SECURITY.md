# Security Policy

## Reporting Vulnerabilities

If you discover a security vulnerability in MemoryForge, please report it responsibly:

1. **Do NOT open a public issue.**
2. Email: Open a private security advisory on GitHub (Settings > Security > Advisories > New draft advisory)
3. Include: description, reproduction steps, affected versions, potential impact.

We aim to respond within 48 hours and provide a fix within 7 days for critical issues.

## Security Design

### Threat Model

MemoryForge operates in the user's local project directory. Its threat model focuses on:

| Threat | Mitigation |
|:---|:---|
| **Path traversal** | `safePath()` guard on all file operations — blocks `../` escapes outside `.mind/` |
| **Code execution via config** | Config is pure JSON (`JSON.parse`), not `require()` — no code execution |
| **Input size exhaustion** | 50KB cap on all MCP tool inputs |
| **Sensitive data in .mind/** | `.gitignore` template excludes tracking files, checkpoints, and error logs |
| **MCP transport injection** | Buffer-based Content-Length parsing prevents multi-byte framing attacks |

### What MemoryForge Does NOT Do

- Does not make network requests (fully offline)
- Does not execute user-supplied code
- Does not access files outside the project directory
- Does not store credentials or secrets
- Does not run with elevated privileges
- Does not phone home or collect telemetry

### Safe File Handling

All file operations in the MCP server are protected by `safePath()`:

```javascript
function safePath(filename) {
  const resolved = path.resolve(mindDir, filename);
  if (!resolved.startsWith(path.resolve(mindDir))) {
    throw new Error('Path traversal blocked');
  }
  return resolved;
}
```

### Error Logging

Tool call errors are logged to `.mind/.mcp-errors.log` (gitignored). Error logs never contain file contents — only error type, message, and timestamp.

## Supported Versions

| Version | Supported |
|:---|:---|
| Latest (master) | Yes |
| Older commits | Best effort |

## Scope

The following are **in scope** for security reports:
- Path traversal in MCP server or hook scripts
- Code execution via configuration files
- Information disclosure through error messages
- Denial of service via crafted MCP inputs

The following are **out of scope**:
- Attacks requiring local root/admin access (MemoryForge runs as user)
- Social engineering
- Issues in Claude Code itself (report to Anthropic)
