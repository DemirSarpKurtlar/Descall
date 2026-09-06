/**
 * Adım 5 barrel — missions / contracts / BP for Dima's Companion panel.
 */
export {
  getValorantMissionsStatus,
  getValorantMissions,
  getValorantContracts,
  getValorantBattlePass,
  activateValorantContract,
} from "./valorant";

import { localGetTokens, localStatus } from "../lib/valorantSecureStore";

/** Resolve Electron lockfile tokens when available (same pattern as friends). */
export async function localMissionsTokens() {
  try {
    const st = await localStatus();
    if (!st?.hasTokens) return { ok: false, tokens: null, session: st?.session || null };
    const tok = await localGetTokens();
    if (!tok?.ok) return { ok: false, tokens: null, session: st?.session || null };
    return {
      ok: true,
      tokens: tok.tokens,
      session: st?.session || null,
    };
  } catch (err) {
    return { ok: false, tokens: null, error: err.message || "local tokens unavailable" };
  }
}
