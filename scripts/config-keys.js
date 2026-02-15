// =============================================================================
// MemoryForge: Shared configuration schema
// =============================================================================
// Single source of truth for known config keys and their constraints.
// Used by health-check.js, compress-sessions.js, and any future config loaders.
// =============================================================================

const KNOWN_CONFIG_KEYS = new Set([
  'keepSessionsFull',
  'keepDecisionsFull',
  'archiveAfterDays',
  'trackingMaxLines',
  'compressThresholdBytes',
  'sessionLogTailLines',
  'briefingRecentDecisions',
  'briefingMaxProgressLines',
  'maxCheckpointFiles',
  'staleWarningSeconds',
]);

module.exports = { KNOWN_CONFIG_KEYS };
