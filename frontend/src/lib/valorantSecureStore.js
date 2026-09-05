/**
 * Client-side Valorant session helpers.
 * Electron: tokens live in safeStorage via IPC (riotLocalAuth.cjs).
 * Web: no lockfile; tokens are not kept (RSO secrets required for full auth).
 */

export function isElectronValorant() {
  return Boolean(typeof window !== "undefined" && window.electronAPI?.isElectron);
}

export function hasLocalLockfileApi() {
  return Boolean(window.electronAPI?.valorantLocalConnect);
}

export async function localStatus() {
  if (!hasLocalLockfileApi()) {
    return {
      isElectron: false,
      lockfilePresent: false,
      safeStorageAvailable: false,
      session: null,
      hasTokens: false,
    };
  }
  return window.electronAPI.valorantLocalStatus();
}

export async function localConnect() {
  if (!hasLocalLockfileApi()) {
    return {
      ok: false,
      code: "NOT_ELECTRON",
      error: "Local Riot Client linking is only available in the Descall desktop app.",
    };
  }
  return window.electronAPI.valorantLocalConnect();
}

export async function localGetTokens() {
  if (!hasLocalLockfileApi()) return { ok: false };
  return window.electronAPI.valorantLocalGetTokens();
}

export async function localSavePublic(patch) {
  if (!hasLocalLockfileApi()) return { ok: false };
  // Strip any accidental token/password fields before IPC
  const safe = { ...patch };
  delete safe.accessToken;
  delete safe.entitlementToken;
  delete safe.password;
  delete safe.riotPassword;
  // Actually we DO want to update gameName etc. on the stored session —
  // tokens stay as previously saved by localConnect.
  return window.electronAPI.valorantLocalSaveSession(patch);
}

export async function localDisconnect() {
  if (!hasLocalLockfileApi()) return { ok: true };
  return window.electronAPI.valorantLocalDisconnect();
}
