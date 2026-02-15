# Contributing to MemoryForge

Thanks for your interest in contributing! MemoryForge is a zero-dependency project — keeping it lean and portable is a core design principle.

## Development Setup

1. **Clone the repo:**
   ```bash
   git clone https://github.com/marolinik/MemoryForge.git
   cd MemoryForge
   ```

2. **Requirements:**
   - Node.js 18+ (no npm packages needed)
   - Bash (Git Bash on Windows)
   - Git

That's it. No `npm install`, no build step, no bundler.

## Running Tests

```bash
# All tests
node tests/mcp-server.test.js && node tests/compress.test.js

# Individual suites
node tests/mcp-server.test.js    # MCP server (19 tests)
node tests/compress.test.js      # Compression (9 tests)
```

Tests use only Node.js built-in `assert` — no test framework required.

## Project Structure

```
scripts/
  mcp-memory-server.js    # MCP server (6 tools for .mind/ access)
  compress-sessions.js    # Session/decision compression + archival
  dashboard.js            # HTML dashboard generator
  hooks/                  # 8 lifecycle hook scripts (bash)
templates/                # Config and CLAUDE.md templates
tests/                    # Test suites (zero deps)
docs/                     # Architecture, benchmarks, references
```

## Guidelines

### Zero Dependencies Rule

MemoryForge has **zero npm dependencies** by design. All code uses Node.js built-ins only. Do not add `package.json` dependencies. If you need functionality from an external library, implement it with built-in modules.

### Platform Compatibility

All code must work on:
- **Linux** (Ubuntu 22+)
- **macOS** (12+)
- **Windows** (Git Bash, PowerShell)

Avoid:
- `grep -P` (Perl regex — not on macOS)
- `sed -i ''` vs `sed -i` differences
- Bash 4+ features (macOS ships Bash 3.2)
- Hardcoded path separators (`/` vs `\`)

### Code Style

- Node.js scripts: CommonJS (`require`), no transpilation
- Shell scripts: POSIX-compatible bash (avoid bashisms where possible)
- Hook scripts: Must be fast (<500ms) — they run on every Claude interaction
- MCP server: Buffer-based stdio transport, Content-Length framing

### Testing

- Every new feature needs tests
- Tests must pass on all 3 platforms (CI runs macOS + Linux + Windows)
- Use Node.js built-in `assert` — no test framework
- Test files go in `tests/` with `.test.js` suffix

### Commit Messages

```
type: short description

[optional body]
```

Types: `feat`, `fix`, `docs`, `test`, `chore`

Examples:
```
feat: add semantic search to memory_search tool
fix: handle multi-byte characters in MCP transport
test: add edge case tests for task archival
docs: update FAQ with Windows troubleshooting
```

## Pull Request Process

1. Fork the repo and create a feature branch
2. Make your changes
3. Run all tests and verify they pass
4. Submit a PR against `master`
5. Describe what changed and why

## Reporting Bugs

Open an issue with:
- What you expected to happen
- What actually happened
- Your OS and Node.js version
- Steps to reproduce

## Questions?

Open a discussion or issue on GitHub.
