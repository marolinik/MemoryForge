// =============================================================================
// MemoryForge: Shared configuration schema
// =============================================================================
// Single source of truth for known config keys and their constraints.
// Used by compress-sessions.js and any future config loaders.
// =============================================================================

const KNOWN_CONFIG_KEYS = new Set([
  'keepSessionsFull',
  'keepDecisionsFull',
  'archiveAfterDays',
]);

module.exports = { KNOWN_CONFIG_KEYS };
