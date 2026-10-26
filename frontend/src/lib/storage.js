import { isIosKeychainShell, planSecureTokenHydration, SECURE_TOKEN_KEY, SIGNED_OUT_KEY } from "./secureToken.js";

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

function readSignedOut() {
  const storage = getStorage();
  try {
    return storage?.getItem(SIGNED_OUT_KEY) === "1";
  } catch {
    return false;
  }
}

function writeSignedOut(on) {
  const storage = getStorage();
  try {
    if (on) storage?.setItem(SIGNED_OUT_KEY, "1");
    else storage?.removeItem(SIGNED_OUT_KEY);
  } catch {
    /* ignore */
  }
}

let importCapacitorCore = () => import("@capacitor/core");

/**
 * Resolves `{ plugin }`, never the plugin itself: a Capacitor plugin proxy
 * answers `then` too, so resolving a promise with it calls a native "then"
 * that does not exist and the promise never settles (every iOS launch from
 * 2.11 to 2.13.11 waited out KEYCHAIN_TIMEOUT_MS here and never used the
 * Keychain). A failed load is not cached, so the next call retries.
 */
function loadKeychainPlugin() {
  if (!keychainPluginPromise) {
    keychainPluginPromise = Promise.resolve()
      .then(() => importCapacitorCore())
      .then(({ registerPlugin }) => ({ plugin: registerPlugin("DescallKeychain") }))
      .catch(() => {
        keychainPluginPromise = null;
        return { plugin: null };
      });
  }
  return keychainPluginPromise;
}

/** `{ plugin }` again: an async function returning the proxy would hang the same way. */
async function keychainPluginBox() {
  const box = await withTimeout(loadKeychainPlugin(), KEYCHAIN_TIMEOUT_MS);
  if (!box?.plugin) throw new Error("keychain-unavailable");
  return box;
}

async function readKeychain(plugin) {
  const res = await withTimeout(plugin.get({ key: TOKEN_KEY }), KEYCHAIN_TIMEOUT_MS);
  return res && typeof res.value === "string" && res.value ? res.value : null;
}

/** Write, then read back. True only when the Keychain really holds `token`. */
async function writeKeychainVerified(plugin, token) {
  try {
    await withTimeout(plugin.set({ key: TOKEN_KEY, value: token }), KEYCHAIN_TIMEOUT_MS);
    return (await readKeychain(plugin)) === token;
  } catch {
    return false;
  }
}

let lastKeychainSync = Promise.resolve(null);

/**
 * Fill the in-memory token before app boot (iOS app only; web, Android and
 * Electron return immediately).
 *
 * Never logs anyone out: localStorage keeps its copy in this release, the
 * Keychain copy is written and read back in the background, and any plugin
 * error or timeout falls back to localStorage exactly as before.
 */
export async function hydrateSecureToken() {
  if (!isIosKeychainShell()) return { store: "local" };
  const local = readLocalToken();
  let plugin = null;
  let keychainValue = null;
  try {
    ({ plugin } = await keychainPluginBox());
    keychainValue = await readKeychain(plugin);
  } catch {
    iosHydrated = false;
    return { store: "local" };
  }
  const plan = planSecureTokenHydration({ keychainValue, localValue: local, signedOut: readSignedOut() });
  iosMemory = plan.memory;
  iosHydrated = true;
  if (plan.restoreLocal) writeLocalToken(plan.restoreLocal);
  if (plan.writeKeychain) {
    lastKeychainSync = writeKeychainVerified(plugin, plan.writeKeychain);
  } else if (plan.removeKeychain) {
    lastKeychainSync = withTimeout(plugin.remove({ key: TOKEN_KEY }), KEYCHAIN_TIMEOUT_MS).then(
      () => true,
      () => false
    );
  } else {
    lastKeychainSync = Promise.resolve(null);
  }
  return { store: "keychain", migrating: Boolean(plan.writeKeychain) };
}

function persistIosToken(token) {
  // localStorage first (fallback for this release), then a verified Keychain copy.
  writeLocalToken(token);
  writeSignedOut(false);
  lastKeychainSync = keychainPluginBox()
    .then(({ plugin }) => writeKeychainVerified(plugin, token))
    .catch(() => false);
}

function clearIosToken() {
  writeSignedOut(true);
  lastKeychainSync = keychainPluginBox()
    .then(({ plugin }) => withTimeout(plugin.remove({ key: TOKEN_KEY }), KEYCHAIN_TIMEOUT_MS))
    .then(() => true)
    .catch(() => false);
}

/** Selftests only (storage.selftest.mjs). */
export const __keychainForTests = {
  setCoreImporter(fn) {
    importCapacitorCore = fn;
    keychainPluginPromise = null;
  },
  reset() {
    iosMemory = null;
    iosHydrated = false;
    keychainPluginPromise = null;
    lastKeychainSync = Promise.resolve(null);
  },
  lastSync: () => lastKeychainSync,
  timeoutMs: KEYCHAIN_TIMEOUT_MS,
};

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
