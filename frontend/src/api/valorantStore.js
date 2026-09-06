/**
 * Adım 6 barrel — wallet / store / loadout for Dima's Companion panels.
 */
export {
  getValorantStoreStatus,
  getValorantWallet,
  getValorantOwnedSkins,
  getValorantLoadout,
  putValorantLoadout,
  patchValorantLoadout,
  getValorantStoreOffers,
  getValorantStorefront,
} from "./valorant";

import { localGetTokens, localStatus } from "../lib/valorantSecureStore";

/** Resolve Electron lockfile tokens when available (same pattern as missions). */
export async function localStoreTokens() {
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
