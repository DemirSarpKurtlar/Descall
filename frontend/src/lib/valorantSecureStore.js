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

/** Adım 4 — local Riot friends + presence (Electron lockfile chat API). */
export function hasLocalFriendsApi() {
  return Boolean(window.electronAPI?.valorantLocalFriends);
}

export async function localFriends() {
  if (!hasLocalFriendsApi()) {
    return {
      ok: false,
      code: "NOT_ELECTRON",
      error:
        "Riot friends / presence need the Descall desktop app with Riot Client running on this PC.",
      friends: [],
      counts: { total: 0, online: 0, inGame: 0, offline: 0 },
      requests: [],
      inbound: [],
      outbound: [],
    };
  }
  return window.electronAPI.valorantLocalFriends();
}

export async function localFriendRequestSend(payload) {
  if (!window.electronAPI?.valorantLocalFriendRequestSend) {
    return { ok: false, code: "NOT_ELECTRON", error: "Desktop app required" };
  }
  return window.electronAPI.valorantLocalFriendRequestSend(payload);
}

export async function localFriendRequestRemove(payload) {
  if (!window.electronAPI?.valorantLocalFriendRequestRemove) {
    return { ok: false, code: "NOT_ELECTRON", error: "Desktop app required" };
  }
  return window.electronAPI.valorantLocalFriendRequestRemove(payload);
}

export async function localFriendRequestAccept(payload) {
  if (!window.electronAPI?.valorantLocalFriendRequestAccept) {
    return { ok: false, code: "NOT_ELECTRON", error: "Desktop app required" };
  }
  return window.electronAPI.valorantLocalFriendRequestAccept(payload);
}
