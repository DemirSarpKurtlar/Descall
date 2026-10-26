/**
 * Run: node frontend/src/lib/storage.selftest.mjs
 * iOS Keychain session token: plugin-load hang regression, migration from
 * localStorage, fallback on plugin failure, and "never logged out".
 */
import assert from "node:assert/strict";

const mem = new Map();
const localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};
globalThis.window = { localStorage, Capacitor: { isNativePlatform: () => true, getPlatform: () => "ios" } };

const { hydrateSecureToken, getToken, setToken, clearToken, __keychainForTests: kc } = await import("./storage.js");
const TOKEN = "descall_token";
const SIGNED_OUT = "descall_token_signed_out";

/**
 * Same shape as a Capacitor native plugin proxy: every property, `then`
 * included, is a method. `then` is not a native method, so its wrapper never
 * calls back (what @capacitor/core does). `native` holds the real methods.
 */
function capacitorProxy(native) {
  return new Proxy({}, {
    get(_, prop) {
      if (prop === "$$typeof") return undefined;
      if (typeof native[prop] === "function") return (...args) => native[prop](...args);
      return () => Promise.reject(new Error(`"DescallKeychain.${String(prop)}()" is not implemented`)).catch(() => {});
    },
  });
}

function keychain({ initial = null, getHangs = false, setFails = false, setStoresWrong = false } = {}) {
  const state = { value: initial, sets: 0, removes: 0 };
  state.native = {
    get: () => (getHangs ? new Promise(() => {}) : Promise.resolve({ value: state.value })),
    set: ({ value }) => {
      state.sets += 1;
      if (setFails) return Promise.reject(new Error("Keychain write failed"));
      state.value = setStoresWrong ? "garbage" : value;
      return Promise.resolve();
    },
    remove: () => {
      state.removes += 1;
      state.value = null;
      return Promise.resolve();
    },
  };
  return state;
}

function start(kcState, local = null, signedOut = false) {
  mem.clear();
  if (local) mem.set(TOKEN, local);
  if (signedOut) mem.set(SIGNED_OUT, "1");
  kc.reset();
  kc.setCoreImporter(async () => ({ registerPlugin: () => capacitorProxy(kcState.native) }));
}

async function timed(p) {
  const t0 = Date.now();
  const value = await p;
  return { value, ms: Date.now() - t0 };
}

// 1. Hang regression: the plugin proxy must not be awaited as a thenable.
{
  const k = keychain({ initial: null });
  start(k, "tok-1");
  const { value, ms } = await timed(hydrateSecureToken());
  assert.equal(value.store, "keychain", "plugin loaded (was a 1.5s timeout before)");
  assert.ok(ms < 300, `hydrate took ${ms}ms`);
}

// 2. Migration + 4. no logout with empty Keychain and a localStorage token.
{
  const k = keychain({ initial: null });
  start(k, "tok-2");
  const res = await hydrateSecureToken();
  assert.equal(res.migrating, true);
  assert.equal(getToken(), "tok-2", "still logged in");
  assert.equal(await kc.lastSync(), true, "written and read back");
  assert.equal(k.value, "tok-2");
  assert.equal(mem.get(TOKEN), "tok-2", "localStorage copy kept as fallback this release");
  // Next launch: both hold the same token, nothing rewritten.
  kc.reset();
  kc.setCoreImporter(async () => ({ registerPlugin: () => capacitorProxy(k.native) }));
  const sets = k.sets;
  await hydrateSecureToken();
  assert.equal(getToken(), "tok-2");
  assert.equal(k.sets, sets);
}

// Read-back mismatch is reported as not verified; localStorage untouched.
{
  const k = keychain({ setStoresWrong: true });
  start(k, "tok-3");
  await hydrateSecureToken();
  assert.equal(await kc.lastSync(), false);
  assert.equal(getToken(), "tok-3");
  assert.equal(mem.get(TOKEN), "tok-3");
}

// 3. Fallback: Keychain write fails → localStorage keeps the session.
{
  const k = keychain({ setFails: true });
  start(k, "tok-4");
  await hydrateSecureToken();
  assert.equal(await kc.lastSync(), false);
  assert.equal(getToken(), "tok-4");
  assert.equal(mem.get(TOKEN), "tok-4");
}

// 3. Fallback: Keychain read times out → localStorage exactly as before.
{
  const k = keychain({ getHangs: true });
  start(k, "tok-5");
  const { value, ms } = await timed(hydrateSecureToken());
  assert.equal(value.store, "local");
  assert.ok(ms >= kc.timeoutMs - 50 && ms < kc.timeoutMs + 500, `timeout path took ${ms}ms`);
  assert.equal(getToken(), "tok-5");
}

// 3. Fallback: @capacitor/core / plugin missing.
{
  mem.clear();
  mem.set(TOKEN, "tok-6");
  kc.reset();
  kc.setCoreImporter(async () => {
    throw new Error("no core");
  });
  const res = await hydrateSecureToken();
  assert.equal(res.store, "local");
  assert.equal(getToken(), "tok-6");
}

// Stale Keychain value never beats a newer localStorage login.
{
  const k = keychain({ initial: "old" });
  start(k, "new");
  await hydrateSecureToken();
  assert.equal(getToken(), "new");
  assert.equal(await kc.lastSync(), true);
  assert.equal(k.value, "new");
}

// localStorage evicted: session restored from the Keychain.
{
  const k = keychain({ initial: "kc-only" });
  start(k, null);
  await hydrateSecureToken();
  assert.equal(getToken(), "kc-only");
  assert.equal(mem.get(TOKEN), "kc-only");
}

// Signed out: the Keychain copy is removed and not resurrected.
{
  const k = keychain({ initial: "leftover" });
  start(k, null, true);
  await hydrateSecureToken();
  assert.equal(getToken(), null);
  assert.equal(await kc.lastSync(), true);
  assert.equal(k.value, null);
}

// Login / logout after boot.
{
  const k = keychain();
  start(k, null);
  await hydrateSecureToken();
  setToken("login-tok");
  assert.equal(getToken(), "login-tok");
  assert.equal(mem.get(TOKEN), "login-tok");
  assert.equal(await kc.lastSync(), true);
  assert.equal(k.value, "login-tok");
  assert.equal(mem.has(SIGNED_OUT), false);
  clearToken();
  assert.equal(getToken(), null);
  assert.equal(mem.has(TOKEN), false);
  assert.equal(mem.get(SIGNED_OUT), "1");
  await kc.lastSync();
  assert.equal(k.value, null);
  // Login again clears the signed-out marker.
  setToken("again");
  await kc.lastSync();
  assert.equal(mem.has(SIGNED_OUT), false);
  assert.equal(k.value, "again");
}

// Web / Android: never touches the plugin.
{
  window.Capacitor = { isNativePlatform: () => false, getPlatform: () => "web" };
  mem.clear();
  mem.set(TOKEN, "web-tok");
  kc.reset();
  kc.setCoreImporter(async () => {
    throw new Error("must not load");
  });
  assert.deepEqual(await hydrateSecureToken(), { store: "local" });
  assert.equal(getToken(), "web-tok");
}

// Source guard: never resolve a promise with the raw plugin proxy.
const { readFileSync } = await import("node:fs");
const src = readFileSync(new URL("./storage.js", import.meta.url), "utf8");
assert.doesNotMatch(src, /=>\s*registerPlugin\("DescallKeychain"\)\s*\)/);
assert.match(src, /\{ plugin: registerPlugin\("DescallKeychain"\) \}/);

console.log("storage.selftest: ok");
