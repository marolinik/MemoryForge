#!/usr/bin/env node
// =============================================================================
// MemoryForge: Interactive Setup (for non-technical users)
// =============================================================================
// Single-command guided installer: node setup.js
//
// Provides an interactive, friendly experience:
//   1. Detects your project directory
//   2. Shows clear progress with colored output
//   3. Explains each step in plain language
//   4. Validates everything works at the end
//
// Zero dependencies. Pure Node.js. Works on macOS, Linux, and Windows.
// =============================================================================

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const VERSION = '2.0.0';
const SCRIPT_DIR = __dirname;

// --- Colors (auto-detect terminal support) ---
const supportsColor = process.stdout.isTTY && !process.env.NO_COLOR;
const c = {
  reset: supportsColor ? '\x1b[0m' : '',
  bold: supportsColor ? '\x1b[1m' : '',
  dim: supportsColor ? '\x1b[2m' : '',
  red: supportsColor ? '\x1b[31m' : '',
  green: supportsColor ? '\x1b[32m' : '',
  yellow: supportsColor ? '\x1b[33m' : '',
  blue: supportsColor ? '\x1b[34m' : '',
  cyan: supportsColor ? '\x1b[36m' : '',
};

// --- Helpers ---
function print(msg = '') { process.stdout.write(msg + '\n'); }
function blank() { print(); }

function banner() {
  blank();
  print(`${c.bold}${c.blue}  MemoryForge Setup${c.reset}  ${c.dim}v${VERSION}${c.reset}`);
  print(`${c.dim}  Persistent memory for Claude Code${c.reset}`);
  blank();
}

function success(msg) { print(`  ${c.green}✓${c.reset} ${msg}`); }
function info(msg) { print(`  ${c.cyan}→${c.reset} ${msg}`); }
function warn(msg) { print(`  ${c.yellow}!${c.reset} ${msg}`); }
function error(msg) { print(`  ${c.red}✗${c.reset} ${msg}`); }
function step(num, total, msg) {
  print(`${c.yellow}  [${num}/${total}]${c.reset} ${msg}`);
}

// --- Interactive prompts ---
function createRL() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

function ask(rl, question, defaultVal) {
  const suffix = defaultVal ? ` ${c.dim}(${defaultVal})${c.reset}` : '';
  return new Promise((resolve) => {
    rl.question(`  ${question}${suffix}: `, (answer) => {
      resolve(answer.trim() || defaultVal || '');
    });
  });
}

function askYN(rl, question, defaultYes = true) {
  const hint = defaultYes ? 'Y/n' : 'y/N';
  return new Promise((resolve) => {
    rl.question(`  ${question} ${c.dim}[${hint}]${c.reset} `, (answer) => {
      const a = answer.trim().toLowerCase();
      if (!a) return resolve(defaultYes);
      resolve(a === 'y' || a === 'yes');
    });
  });
}

// --- File operations ---
function copyIfMissing(src, dest, label) {
  if (fs.existsSync(dest)) {
    info(`${label} already exists, keeping yours`);
    return false;
  }
  if (DRY_RUN) {
    info(`[dry-run] Would create ${label}`);
    return true;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  success(`Created ${label}`);
  return true;
}

function ensureDir(dir) {
  if (DRY_RUN) return;
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function dryInfo(msg) {
  if (DRY_RUN) { info(`[dry-run] Would: ${msg}`); return true; }
  return false;
}

// --- Check prerequisites ---
function checkNode() {
  const major = parseInt(process.versions.node.split('.')[0]);
  if (major < 18) {
    error(`Node.js ${process.versions.node} detected — version 18+ required`);
    print(`  ${c.dim}Download from: https://nodejs.org${c.reset}`);
    return false;
  }
  return true;
}

function checkClaude() {
  try {
    const { execSync } = require('child_process');
    execSync('claude --version', { stdio: 'pipe', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

// --- Smart merge for settings.json ---
function mergeSettings(existingPath, mfSettingsPath) {
  const existing = JSON.parse(fs.readFileSync(existingPath, 'utf-8'));
  const mf = JSON.parse(fs.readFileSync(mfSettingsPath, 'utf-8'));

  // Check if already installed
  if (JSON.stringify(existing).includes('session-start.sh')) {
    return { result: 'skip' };
  }

  // Backup
  fs.copyFileSync(existingPath, existingPath + '.backup');

  // Merge hooks
  existing.hooks = existing.hooks || {};
  for (const [event, handlers] of Object.entries(mf.hooks || {})) {
    if (!existing.hooks[event]) {
      existing.hooks[event] = handlers;
    } else {
      // Append if not already present
      const existingCmds = JSON.stringify(existing.hooks[event]);
      for (const handler of handlers) {
        if (!existingCmds.includes(JSON.stringify(handler).slice(1, -1))) {
          existing.hooks[event].push(handler);
        }
      }
    }
  }

  fs.writeFileSync(existingPath, JSON.stringify(existing, null, 2) + '\n');
  return { result: 'merged' };
}

// --- Smart merge for .mcp.json ---
function mergeMcpJson(existingPath, mfMcpPath) {
  const existing = JSON.parse(fs.readFileSync(existingPath, 'utf-8'));
  const mf = JSON.parse(fs.readFileSync(mfMcpPath, 'utf-8'));

  if (JSON.stringify(existing).includes('mcp-memory-server')) {
    return false; // already present
  }

  fs.copyFileSync(existingPath, existingPath + '.backup');
  existing.mcpServers = existing.mcpServers || {};
  Object.assign(existing.mcpServers, mf.mcpServers);
  fs.writeFileSync(existingPath, JSON.stringify(existing, null, 2) + '\n');
  return true;
}

// =============================================================================
// Main
// =============================================================================

// --- CLI flags ---
const cliArgs = process.argv.slice(2);
const DRY_RUN = cliArgs.includes('--dry-run');

if (cliArgs.includes('--help') || cliArgs.includes('-h')) {
  print(`Usage: node setup.js [options]`);
  print();
  print(`Options:`);
  print(`  --help, -h     Show this help message`);
  print(`  --dry-run      Preview what would be installed without making changes`);
  print();
  print(`Interactive guided installer for MemoryForge.`);
  print(`Run without flags for the full guided experience.`);
  process.exit(0);
}

async function main() {
  banner();
  if (DRY_RUN) {
    print(`${c.cyan}  DRY RUN — no files will be modified${c.reset}`);
    blank();
  }

  // Check Node.js version
  if (!checkNode()) {
    process.exit(1);
  }
  success(`Node.js ${process.versions.node} detected`);

  // Check Claude CLI
  const hasClaude = checkClaude();
  if (hasClaude) {
    success('Claude Code CLI detected');
  } else {
    warn('Claude Code CLI not found (install from https://claude.ai/code)');
    info('You can still set up MemoryForge — just install Claude Code later');
  }

  blank();
  const rl = createRL();

  try {
    // --- Step 1: Choose project directory ---
    print(`${c.bold}  Where do you want to install MemoryForge?${c.reset}`);
    print(`${c.dim}  This should be your project's root directory (where you run Claude Code).${c.reset}`);
    blank();

    const cwd = process.cwd();
    const defaultDir = cwd === SCRIPT_DIR ? '.' : cwd;
    const targetInput = await ask(rl, `Project directory`, defaultDir);
    const targetDir = path.resolve(targetInput);

    // Warn if installing into the MemoryForge clone directory itself
    if (path.resolve(targetDir) === path.resolve(SCRIPT_DIR)) {
      warn('This directory is the MemoryForge source repository itself.');
      info('You probably want to install into your own project directory instead.');
      const proceed = await askYN(rl, 'Continue installing here anyway?', false);
      if (!proceed) {
        error('Setup cancelled. Re-run and specify your project directory.');
        process.exit(1);
      }
    }

    if (!fs.existsSync(targetDir)) {
      const create = await askYN(rl, `Directory doesn't exist. Create it?`);
      if (create) {
        fs.mkdirSync(targetDir, { recursive: true });
        success(`Created ${targetDir}`);
      } else {
        error('Setup cancelled.');
        process.exit(1);
      }
    }

    blank();
    print(`${c.bold}  Setting up MemoryForge in: ${c.cyan}${targetDir}${c.reset}`);
    blank();

    const claudeDir = path.join(targetDir, '.claude');
    const totalSteps = 6;
    let currentStep = 0;

    // --- Step 1: Copy hook scripts ---
    currentStep++;
    step(currentStep, totalSteps, 'Installing hook scripts...');
    const hooksDir = path.join(targetDir, 'scripts', 'hooks');
    ensureDir(hooksDir);
    const srcHooksDir = path.join(SCRIPT_DIR, 'scripts', 'hooks');
    let hooksCopied = 0;
    for (const file of fs.readdirSync(srcHooksDir)) {
      if (file.endsWith('.sh')) {
        if (!DRY_RUN) fs.copyFileSync(path.join(srcHooksDir, file), path.join(hooksDir, file));
        hooksCopied++;
      }
    }
    // Make executable on Unix
    if (!DRY_RUN && process.platform !== 'win32') {
      try {
        const hookFiles = fs.readdirSync(hooksDir).filter(f => f.endsWith('.sh'));
        for (const f of hookFiles) {
          fs.chmodSync(path.join(hooksDir, f), 0o755);
        }
      } catch { /* best effort */ }
    }
    if (DRY_RUN) info(`[dry-run] Would install ${hooksCopied} hook scripts`);
    else success(`Installed ${hooksCopied} hook scripts`);

    // --- Step 2: Configure settings.json ---
    currentStep++;
    step(currentStep, totalSteps, 'Configuring Claude Code settings...');
    const settingsPath = path.join(claudeDir, 'settings.json');
    const mfSettingsPath = path.join(SCRIPT_DIR, '.claude', 'settings.json');

    if (fs.existsSync(settingsPath)) {
      if (DRY_RUN) {
        info('[dry-run] Would merge hook settings into existing settings.json');
      } else {
        const mergeResult = mergeSettings(settingsPath, mfSettingsPath);
        if (mergeResult.result === 'skip') {
          info('Settings already configured, keeping yours');
        } else {
          success('Merged hook settings into existing settings.json');
          info('Backup saved as settings.json.backup');
        }
      }
    } else {
      ensureDir(claudeDir);
      if (!DRY_RUN) fs.copyFileSync(mfSettingsPath, settingsPath);
      if (DRY_RUN) info('[dry-run] Would create settings.json');
      else success('Created settings.json with hook configuration');
    }

    // --- Step 3: MCP Memory Server ---
    currentStep++;
    step(currentStep, totalSteps, 'Setting up MCP memory server...');
    const mcpJsonPath = path.join(targetDir, '.mcp.json');
    const mfMcpPath = path.join(SCRIPT_DIR, '.mcp.json');

    // Copy MCP server script and supporting scripts
    const scriptsDir = path.join(targetDir, 'scripts');
    ensureDir(scriptsDir);
    const serverDest = path.join(scriptsDir, 'mcp-memory-server.js');
    if (!DRY_RUN) fs.copyFileSync(path.join(SCRIPT_DIR, 'scripts', 'mcp-memory-server.js'), serverDest);

    for (const support of ['config-keys.js', 'compress-sessions.js']) {
      const src = path.join(SCRIPT_DIR, 'scripts', support);
      if (fs.existsSync(src)) {
        if (!DRY_RUN) fs.copyFileSync(src, path.join(scriptsDir, support));
      }
    }

    if (fs.existsSync(mcpJsonPath)) {
      if (DRY_RUN) {
        info('[dry-run] Would merge memory server into existing .mcp.json');
      } else {
        const merged = mergeMcpJson(mcpJsonPath, mfMcpPath);
        if (merged) {
          success('Added memory server to existing .mcp.json');
        } else {
          info('.mcp.json already has memory server');
        }
      }
    } else {
      if (!DRY_RUN) fs.copyFileSync(mfMcpPath, mcpJsonPath);
      if (DRY_RUN) info('[dry-run] Would create .mcp.json');
      else success('Created .mcp.json with memory server');
    }

    // --- Step 4: Create .mind/ state files ---
    currentStep++;
    step(currentStep, totalSteps, 'Creating memory state files...');
    const mindDir = path.join(targetDir, '.mind');
    ensureDir(path.join(mindDir, 'checkpoints'));

    const stateFiles = ['STATE.md', 'DECISIONS.md', 'PROGRESS.md', 'SESSION-LOG.md'];
    for (const file of stateFiles) {
      const src = path.join(SCRIPT_DIR, 'templates', '.mind', file);
      const dest = path.join(mindDir, file);
      copyIfMissing(src, dest, `.mind/${file}`);
    }

    // --- Step 5: .gitignore ---
    currentStep++;
    step(currentStep, totalSteps, 'Updating .gitignore...');
    const gitignorePath = path.join(targetDir, '.gitignore');
    const gitignoreEntries = [
      '',
      '# MemoryForge auto-generated tracking files',
      '.mind/.last-activity',
      '.mind/.agent-activity',
      '.mind/.task-completions',
      '.mind/.session-tracking',
      '.mind/.file-tracker',
      '.mind/.write-lock',
      '.mind/.prompt-context',
      '.mind/.mcp-errors.log',
      '.mind/ARCHIVE.md',
      '.mind/checkpoints/',
      '*.pre-compress',
    ];

    if (fs.existsSync(gitignorePath)) {
      const content = fs.readFileSync(gitignorePath, 'utf-8');
      if (content.includes('MemoryForge')) {
        info('.gitignore already has MemoryForge entries');
      } else {
        if (!DRY_RUN) fs.appendFileSync(gitignorePath, gitignoreEntries.join('\n') + '\n');
        if (DRY_RUN) info('[dry-run] Would add MemoryForge entries to .gitignore');
        else success('Added MemoryForge entries to .gitignore');
      }
    } else {
      if (!DRY_RUN) fs.writeFileSync(gitignorePath, gitignoreEntries.slice(1).join('\n') + '\n');
      if (DRY_RUN) info('[dry-run] Would create .gitignore');
      else success('Created .gitignore');
    }

    // --- Step 6: CLAUDE.md ---
    currentStep++;
    step(currentStep, totalSteps, 'Adding Mind Protocol to CLAUDE.md...');
    const claudeMdPath = path.join(targetDir, 'CLAUDE.md');
    const templatePath = path.join(SCRIPT_DIR, 'templates', 'CLAUDE.md.template');

    if (fs.existsSync(templatePath)) {
      if (fs.existsSync(claudeMdPath)) {
        const content = fs.readFileSync(claudeMdPath, 'utf-8');
        if (content.includes('Mind Protocol') || content.includes('MemoryForge') || content.includes('.mind/STATE.md')) {
          info('CLAUDE.md already has Mind Protocol');
        } else {
          if (!DRY_RUN) {
            const template = fs.readFileSync(templatePath, 'utf-8');
            fs.appendFileSync(claudeMdPath, '\n\n' + template);
          }
          if (DRY_RUN) info('[dry-run] Would append Mind Protocol to CLAUDE.md');
          else success('Added Mind Protocol to existing CLAUDE.md');
        }
      } else {
        if (!DRY_RUN) fs.copyFileSync(templatePath, claudeMdPath);
        if (DRY_RUN) info('[dry-run] Would create CLAUDE.md');
        else success('Created CLAUDE.md with Mind Protocol');
      }
    } else {
      warn('CLAUDE.md template not found — skipping');
    }

    // --- Version tracking ---
    if (!DRY_RUN) fs.writeFileSync(path.join(targetDir, '.memoryforge-version'), VERSION);
    dryInfo('write version file .memoryforge-version');

    // --- Summary ---
    blank();
    print(`${c.bold}${c.green}  Setup complete!${c.reset} ${c.dim}(v${VERSION})${c.reset}`);
    blank();

    print(`  ${c.bold}What was installed:${c.reset}`);
    print(`    ${c.green}+${c.reset} ${hooksCopied} hook scripts ${c.dim}(auto-fire during Claude Code sessions)${c.reset}`);
    print(`    ${c.green}+${c.reset} MCP memory server ${c.dim}(6 tools for reading/updating project memory)${c.reset}`);
    print(`    ${c.green}+${c.reset} 4 memory files in .mind/ ${c.dim}(STATE, PROGRESS, DECISIONS, SESSION-LOG)${c.reset}`);
    print(`    ${c.green}+${c.reset} Mind Protocol in CLAUDE.md`);

    blank();
    print(`  ${c.bold}What happens next:${c.reset}`);
    print(`    1. Open ${c.cyan}.mind/STATE.md${c.reset} and describe your project's current state`);
    print(`    2. Run ${c.cyan}claude${c.reset} in your project — MemoryForge activates automatically`);
    print(`    3. Claude will remember your context across sessions!`);
    blank();

    // Optional: quick config
    const wantConfig = await askYN(rl, 'Would you like to customize settings? (optional)', false);

    if (wantConfig) {
      blank();
      print(`  ${c.bold}Optional settings:${c.reset}`);
      print(`  ${c.dim}Press Enter to keep defaults.${c.reset}`);
      blank();

      const config = {};

      const sessionsToKeep = await ask(rl, 'Sessions to keep in full before summarizing', '5');
      const num = parseInt(sessionsToKeep);
      if (!isNaN(num) && num > 0 && num <= 100) {
        config.keepSessionsFull = num;
      }

      const decisionsToKeep = await ask(rl, 'Decisions to keep in full before summarizing', '10');
      const dNum = parseInt(decisionsToKeep);
      if (!isNaN(dNum) && dNum > 0 && dNum <= 100) {
        config.keepDecisionsFull = dNum;
      }

      const archiveDays = await ask(rl, 'Days before completed tasks are archived', '30');
      const aNum = parseInt(archiveDays);
      if (!isNaN(aNum) && aNum > 0 && aNum <= 365) {
        config.archiveAfterDays = aNum;
      }

      if (Object.keys(config).length > 0) {
        const configPath = path.join(targetDir, '.memoryforge.config.json');
        if (!DRY_RUN) {
          fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
          success('Saved configuration to .memoryforge.config.json');
        }
        dryInfo('write config to ' + path.basename(configPath));
      } else {
        info('Using default settings');
      }
      blank();
    }

    print(`  ${c.dim}Documentation: https://github.com/marolinik/MemoryForge${c.reset}`);
    print(`  ${c.dim}Need help? Open an issue on GitHub${c.reset}`);
    blank();

  } finally {
    rl.close();
  }
}

main().catch((err) => {
  error(`Setup failed: ${err.message}`);
  process.exit(1);
});
