#!/usr/bin/env node
// =============================================================================
// MemoryForge: Update Checker (background, non-blocking)
// =============================================================================
// Spawned by session-start.js in the background. Checks GitHub for a newer
// tag, writes result to ~/.claude/cache/memoryforge-update-check.json.
//
// - Runs detached (child.unref()) so it doesn't block session start
// - 5s HTTP timeout — fails silently on network issues
// - 24h cache TTL — only checks once per day
// - Zero dependencies (Node.js built-in https module)
// =============================================================================

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const homeDir = os.homedir();
const cacheDir = path.join(homeDir, '.claude', 'cache');
const cacheFile = path.join(cacheDir, 'memoryforge-update-check.json');

// Check cache TTL — skip if checked within 24h
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
try {
  if (fs.existsSync(cacheFile)) {
    const cache = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
    if (cache.checked && (Date.now() - cache.checked * 1000) < CACHE_TTL_MS) {
      process.exit(0); // Still fresh, skip
    }
  }
} catch {}

// Find installed version
const versionLocations = [
  process.env.CLAUDE_PROJECT_DIR && path.join(process.env.CLAUDE_PROJECT_DIR, '.memoryforge-version'),
  path.join(process.cwd(), '.memoryforge-version')
].filter(Boolean);

let installed = '0.0.0';
for (const loc of versionLocations) {
  try {
    installed = fs.readFileSync(loc, 'utf-8').trim();
    if (installed) break;
  } catch {}
}

// Ensure cache directory exists
fs.mkdirSync(cacheDir, { recursive: true });

// Spawn background process to check GitHub API
const child = spawn(process.execPath, ['-e', `
  const https = require('https');
  const fs = require('fs');

  const cacheFile = ${JSON.stringify(cacheFile)};
  const installed = ${JSON.stringify(installed)};

  const options = {
    hostname: 'api.github.com',
    path: '/repos/marolinik/MemoryForge/tags?per_page=1',
    headers: { 'User-Agent': 'MemoryForge-UpdateCheck' },
    timeout: 5000
  };

  const req = https.get(options, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
      let latest = null;
      try {
        const tags = JSON.parse(data);
        if (Array.isArray(tags) && tags.length > 0) {
          latest = tags[0].name.replace(/^v/, '');
        }
      } catch {}

      const result = {
        update_available: latest && installed !== latest && latest !== '0.0.0',
        installed: installed,
        latest: latest || 'unknown',
        checked: Math.floor(Date.now() / 1000)
      };

      try { fs.writeFileSync(cacheFile, JSON.stringify(result)); } catch {}
    });
  });

  req.on('error', () => {
    // Network failure — write cache with no update to avoid rechecking immediately
    const result = {
      update_available: false,
      installed: installed,
      latest: 'unknown',
      checked: Math.floor(Date.now() / 1000)
    };
    try { fs.writeFileSync(cacheFile, JSON.stringify(result)); } catch {}
  });

  req.on('timeout', () => { req.destroy(); });
`], {
  stdio: 'ignore',
  detached: true,
  windowsHide: true
});

child.unref();
