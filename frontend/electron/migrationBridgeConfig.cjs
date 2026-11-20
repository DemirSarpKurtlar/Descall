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
  // Owner's plan key, key id 07db6a323b895041 (20 Nov 2026). Private half: Render env
  // DESKTOP_MIGRATION_PLAN_KEY only. Inert until MIGRATION_BRIDGE_ENABLED is true.
  PLAN_PUBLIC_KEYS: Object.freeze(['MCowBQYDK2VwAyEArlOiXuRiUhopWEUzb7kROEFfT53k1zF5jUcsGE4VmLg=']),
  // The API origin the app itself uses (VITE_API_BASE_URL). api.descall.com has no DNS record.
  API_BASE: 'https://des-call.onrender.com',
});
