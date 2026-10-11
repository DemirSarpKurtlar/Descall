import { isIosKeychainShell, planSecureTokenHydration, SECURE_TOKEN_KEY } from "./secureToken.js";

const TOKEN_KEY = SECURE_TOKEN_KEY;
const USER_KEY = "descall_user";
const SOUND_SETTINGS_KEY = "descall_sound_settings";
const KEYCHAIN_TIMEOUT_MS = 1500;

/** In-memory copy after iOS Keychain hydration. getToken() stays synchronous. */
let iosMemory = null;
let iosHydrated = false;
let keychainPluginPromise = null;

function getStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function electronToken() {
  try {
    return typeof window !== "undefined" ? window.electronAPI?.secureToken : null;
  } catch {
    return null;
  }
}

function readLocalToken() {
  const storage = getStorage();
  if (!storage) return null;
  try {
    return storage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function writeLocalToken(token) {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(TOKEN_KEY, token);
  } catch {
    /* ignore */
  }
}

function removeLocalToken() {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("keychain-timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

function loadKeychainPlugin() {
  if (!keychainPluginPromise) {
    keychainPluginPromise = import("@capacitor/core").then(({ registerPlugin }) =>
      registerPlugin("DescallKeychain")
    );
  }
  return keychainPluginPromise;
}

/**
 * Fill the in-memory token from the iOS Keychain before app boot.
 * No-op on web, Android, and Electron. A missing plugin or a timeout leaves
 * localStorage in place so login still works.
 */
export async function hydrateSecureToken() {
  if (!isIosKeychainShell()) return { store: "local" };
  const local = readLocalToken();
  let keychainValue = null;
  let plugin = null;
  try {
    plugin = await withTimeout(loadKeychainPlugin(), KEYCHAIN_TIMEOUT_MS);
    const res = await withTimeout(plugin.get({ key: TOKEN_KEY }), KEYCHAIN_TIMEOUT_MS);
    keychainValue = res && typeof res.value === "string" ? res.value : null;
  } catch {
    iosHydrated = false;
    return { store: "local" };
  }
  const plan = planSecureTokenHydration({ keychainValue, localValue: local });
  iosMemory = plan.memory;
  if (plan.writeKeychain) {
    try {
      await withTimeout(plugin.set({ key: TOKEN_KEY, value: plan.writeKeychain }), KEYCHAIN_TIMEOUT_MS);
      removeLocalToken();
    } catch {
      writeLocalToken(plan.writeKeychain);
    }
  } else if (plan.clearLocal) {
    removeLocalToken();
  }
  iosHydrated = true;
  return { store: "keychain" };
}

function persistIosToken(token) {
  // Keep the local copy until the Keychain write is confirmed, so a kill
  // during the write still migrates on the next launch.
  writeLocalToken(token);
  loadKeychainPlugin()
    .then((plugin) => withTimeout(plugin.set({ key: TOKEN_KEY, value: token }), KEYCHAIN_TIMEOUT_MS))
    .then(() => removeLocalToken())
    .catch(() => {});
}

function clearIosToken() {
  loadKeychainPlugin()
    .then((plugin) => plugin.remove({ key: TOKEN_KEY }))
    .catch(() => {});
}

export function getToken() {
  if (iosHydrated) return iosMemory || null;
  const bridge = electronToken();
  if (bridge?.get) {
    try {
      const secure = bridge.get();
      if (secure) return secure;
    } catch {
      /* fall through to localStorage */
    }
  }
  const local = readLocalToken();
  if (local && bridge?.set) {
    try {
      const storage = getStorage();
      if (bridge.set(local)) storage?.removeItem(TOKEN_KEY);
    } catch {
      /* keep the local copy if the safe store rejects it */
    }
  }
  return local;
}

export function setToken(token) {
  if (isIosKeychainShell()) {
    iosMemory = token || null;
    iosHydrated = true;
    if (token) persistIosToken(token);
    else clearIosToken();
    if (!token) removeLocalToken();
    return;
  }
  const bridge = electronToken();
  if (bridge?.set) {
    try {
      if (bridge.set(token)) {
        removeLocalToken();
        return;
      }
    } catch {
      /* fall through */
    }
  }
  if (!token) {
    removeLocalToken();
    return;
  }
  writeLocalToken(token);
}

export function clearToken() {
  if (isIosKeychainShell()) {
    iosMemory = null;
    iosHydrated = true;
    clearIosToken();
  }
  const bridge = electronToken();
  try {
    bridge?.clear?.();
  } catch {
    /* ignore */
  }
  removeLocalToken();
}

export function getUser() {
  const storage = getStorage();
  if (!storage) return null;
  let raw = null;
  try {
    raw = storage.getItem(USER_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    // Recover from corrupted localStorage values to prevent blank screen crashes.
    try {
      storage.removeItem(USER_KEY);
    } catch {
      // Ignore remove failures in restricted browser modes.
    }
    return null;
  }
}

export function setUser(user) {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(USER_KEY, JSON.stringify(user));
  } catch {
    // Ignore write failures in restricted browser modes.
  }
}

export function clearUser() {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(USER_KEY);
  } catch {
    // Ignore remove failures in restricted browser modes.
  }
}

export function getSoundSettings() {
  const storage = getStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(SOUND_SETTINGS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setSoundSettings(settings) {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(SOUND_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Ignore write failures
  }
}
