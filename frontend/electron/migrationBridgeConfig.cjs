'use strict';

/**
 * Electron -> Tauri migration bridge switch. OFF in every shipped build: with
 * MIGRATION_BRIDGE_ENABLED false main.cjs never loads migrationBridge.cjs, so current
 * users see no change at all.
 *
 * The bridge release (3.10.x) flips the flag and pins the plan public key(s) printed by
 * `node backend/scripts/desktopMigrationKeygen.cjs` (base64 SPKI; public, safe to commit).
 * With no key pinned the bridge never acts, even when the flag is on.
 */
module.exports = Object.freeze({
  MIGRATION_BRIDGE_ENABLED: false,
  PLAN_PUBLIC_KEYS: Object.freeze([]),
  API_BASE: 'https://api.descall.com',
});
