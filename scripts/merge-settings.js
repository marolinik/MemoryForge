#!/usr/bin/env node
// =============================================================================
// MemoryForge: Smart settings.json Merger
// =============================================================================
// Merges MemoryForge hook configuration into an existing .claude/settings.json
// without overwriting the user's existing hooks.
//
// Usage:
//   node merge-settings.js <existing-settings> <memoryforge-settings> [--dry-run] [--uninstall]
//
// Modes:
//   merge (default): Add MemoryForge hooks alongside existing hooks
//   --dry-run:       Show what would change without writing
//   --uninstall:     Remove MemoryForge hooks from the file
//
// Output: Writes merged JSON to the existing-settings path (or stdout for --dry-run)
// =============================================================================

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const uninstall = args.includes('--uninstall');
const paths = args.filter(a => !a.startsWith('--'));

if (paths.length < 1) {
  console.error('Usage: node merge-settings.js <existing-settings> [<memoryforge-settings>] [--dry-run] [--uninstall]');
  process.exit(1);
}

const existingPath = paths[0];
const mfPath = paths[1];

// MemoryForge hook signature: any command containing these script names
const MF_HOOK_SCRIPTS = [
  'session-start.sh',
  'pre-compact.sh',
  'user-prompt-context.sh',
  'stop-checkpoint.sh',
  'session-end.sh',
  'subagent-start.sh',
  'subagent-stop.sh',
  'task-completed.sh'
];

function isMfHook(hookEntry) {
  if (!hookEntry || !hookEntry.command) return false;
  return MF_HOOK_SCRIPTS.some(script => hookEntry.command.includes(script));
}

function isMfHookGroup(group) {
  // A hook group contains at least one MemoryForge hook
  if (!group || !group.hooks) return false;
  return group.hooks.some(h => isMfHook(h));
}

function readJSON(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (e) {
    return null;
  }
}

// --- UNINSTALL MODE ---
if (uninstall) {
  const existing = readJSON(existingPath);
  if (!existing) {
    console.log('{"result":"skip","reason":"no existing settings.json"}');
    process.exit(0);
  }

  const hooks = existing.hooks || {};
  const changes = [];

  for (const [event, groups] of Object.entries(hooks)) {
    if (!Array.isArray(groups)) continue;

    const newGroups = [];
    for (const group of groups) {
      if (!group.hooks || !Array.isArray(group.hooks)) {
        newGroups.push(group);
        continue;
      }

      // Filter out MemoryForge hooks from this group
      const filteredHooks = group.hooks.filter(h => !isMfHook(h));

      if (filteredHooks.length === 0) {
        // Entire group was MemoryForge — remove it
        changes.push(`  - ${event}: removed MemoryForge hook group`);
      } else if (filteredHooks.length < group.hooks.length) {
        // Some hooks removed
        changes.push(`  - ${event}: removed ${group.hooks.length - filteredHooks.length} MemoryForge hook(s), kept ${filteredHooks.length} existing`);
        newGroups.push({ ...group, hooks: filteredHooks });
      } else {
        // No MemoryForge hooks in this group
        newGroups.push(group);
      }
    }

    if (newGroups.length === 0) {
      delete hooks[event];
    } else {
      hooks[event] = newGroups;
    }
  }

  // Clean up empty hooks object
  if (Object.keys(hooks).length === 0) {
    delete existing.hooks;
  }

  if (changes.length === 0) {
    console.log(JSON.stringify({ result: 'skip', reason: 'no MemoryForge hooks found' }));
    process.exit(0);
  }

  if (dryRun) {
    console.log(JSON.stringify({
      result: 'dry-run',
      changes,
      merged: existing
    }, null, 2));
  } else {
    fs.writeFileSync(existingPath, JSON.stringify(existing, null, 2) + '\n');
    console.log(JSON.stringify({ result: 'uninstalled', changes }));
  }
  process.exit(0);
}

// --- MERGE MODE ---
if (!mfPath) {
  console.error('Merge mode requires both existing and memoryforge settings paths.');
  process.exit(1);
}

const existing = readJSON(existingPath);
const mf = readJSON(mfPath);

if (!mf) {
  console.error(`Cannot read MemoryForge settings: ${mfPath}`);
  process.exit(1);
}

// If no existing file, just use the MemoryForge config directly
if (!existing) {
  if (dryRun) {
    console.log(JSON.stringify({ result: 'dry-run', action: 'create new', merged: mf }, null, 2));
  } else {
    fs.writeFileSync(existingPath, JSON.stringify(mf, null, 2) + '\n');
    console.log(JSON.stringify({ result: 'created' }));
  }
  process.exit(0);
}

// Merge hooks
const existingHooks = existing.hooks || {};
const mfHooks = mf.hooks || {};
const changes = [];

for (const [event, mfGroups] of Object.entries(mfHooks)) {
  if (!Array.isArray(mfGroups)) continue;

  if (!existingHooks[event]) {
    // Event doesn't exist — add the whole thing
    existingHooks[event] = mfGroups;
    changes.push(`  + ${event}: added (new event)`);
    continue;
  }

  // Event exists — check if MemoryForge hooks are already present
  const existingGroups = existingHooks[event];
  const alreadyHasMf = existingGroups.some(g => isMfHookGroup(g));

  if (alreadyHasMf) {
    changes.push(`  = ${event}: already has MemoryForge hooks (skipped)`);
    continue;
  }

  // Merge: add MemoryForge hooks to the first group's hooks array,
  // or add as a new group if structures differ
  const mfHookEntries = mfGroups.flatMap(g => (g.hooks || []).filter(h => isMfHook(h)));

  if (mfHookEntries.length === 0) continue;

  // Strategy: if the first existing group has a compatible structure, append
  // Otherwise, add MemoryForge groups as additional entries
  const firstGroup = existingGroups[0];
  if (firstGroup && firstGroup.hooks && Array.isArray(firstGroup.hooks)) {
    // Check matcher compatibility
    const mfMatcher = mfGroups[0]?.matcher;
    const existingMatcher = firstGroup.matcher;

    if (mfMatcher && existingMatcher && mfMatcher !== existingMatcher) {
      // Different matchers — add as separate group
      existingGroups.push(...mfGroups);
      changes.push(`  + ${event}: added as new group (different matcher)`);
    } else {
      // Same or no matcher — merge into existing group
      firstGroup.hooks.push(...mfHookEntries);
      // If MF has a matcher but existing doesn't, add it
      if (mfMatcher && !existingMatcher) {
        firstGroup.matcher = mfMatcher;
      }
      changes.push(`  + ${event}: merged ${mfHookEntries.length} hook(s) into existing group`);
    }
  } else {
    // No hooks array in first group — add MF groups
    existingGroups.push(...mfGroups);
    changes.push(`  + ${event}: added as new group`);
  }
}

existing.hooks = existingHooks;

if (changes.length === 0) {
  console.log(JSON.stringify({ result: 'skip', reason: 'all hooks already present' }));
  process.exit(0);
}

if (dryRun) {
  console.log(JSON.stringify({ result: 'dry-run', changes, merged: existing }, null, 2));
} else {
  // Backup original
  const backupPath = existingPath + '.backup';
  fs.copyFileSync(existingPath, backupPath);
  fs.writeFileSync(existingPath, JSON.stringify(existing, null, 2) + '\n');
  console.log(JSON.stringify({ result: 'merged', changes, backup: backupPath }));
}
