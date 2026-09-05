/**
 * Client-side Valorant session helpers.
 * Primary: Riot Sign-On (auth.riotgames.com) — Electron BrowserWindow or web redirect.
 * Secondary (Electron only): local Riot Client lockfile → safeStorage.
 * Never accepts or stores Riot passwords.
 */

export function isElectronValorant() {
  return Boolean(typeof window !== "undefined" && window.electronAPI?.isElectron);
}

export function hasLocalLockfileApi() {
  return Boolean(window.electronAPI?.valorantLocalConnect);
}

export function hasRsoWindowApi() {
  return Boolean(window.electronAPI?.valorantRsoOpen);
}

export async function openRsoLogin(authorizeUrl) {
  if (hasRsoWindowApi()) {
    return window.electronAPI.valorantRsoOpen({ url: authorizeUrl });
  }
  // Web / fallback: full-page navigate to Riot authorize URL
  window.location.href = authorizeUrl;
  return { ok: true, mode: "redirect" };
}

export function onRsoResult(callback) {
  if (!window.electronAPI?.onValorantRsoResult) return () => {};
  return window.electronAPI.onValorantRsoResult(callback);
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
  const safe = { ...patch };
  delete safe.accessToken;
  delete safe.entitlementToken;
  delete safe.password;
  delete safe.riotPassword;
  return window.electronAPI.valorantLocalSaveSession(safe);
}

export async function localDisconnect() {
  if (!hasLocalLockfileApi()) return { ok: true };
  return window.electronAPI.valorantLocalDisconnect();
}
