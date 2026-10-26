/**
 * Run: node frontend/src/lib/secureToken.selftest.mjs
 * Keychain hydration plan and the boot order that keeps getToken() sync.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isIosKeychainShell, planSecureTokenHydration } from "./secureToken.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const plan = (o) => planSecureTokenHydration(o);
const none = { writeKeychain: null, restoreLocal: null, removeKeychain: false };
// localStorage is written first on every login, so it wins and is never cleared (2.13.12).
assert.deepEqual(plan({ keychainValue: "kc", localValue: "newer" }), { ...none, memory: "newer", writeKeychain: "newer" });
assert.deepEqual(plan({ keychainValue: "same", localValue: "same" }), { ...none, memory: "same" });
// Empty Keychain + localStorage token: stays logged in, token is migrated.
assert.deepEqual(plan({ keychainValue: null, localValue: "local" }), { ...none, memory: "local", writeKeychain: "local" });
// localStorage evicted by WebKit: restored from the Keychain.
assert.deepEqual(plan({ keychainValue: "kc", localValue: null }), { ...none, memory: "kc", restoreLocal: "kc" });
// Signed out: a leftover Keychain copy is removed, never resurrected.
assert.deepEqual(plan({ keychainValue: "kc", localValue: null, signedOut: true }), { ...none, memory: null, removeKeychain: true });
assert.deepEqual(plan({ keychainValue: "", localValue: "" }), { ...none, memory: null });

const ios = {
  Capacitor: {
    isNativePlatform: () => true,
    getPlatform: () => "ios",
  },
};
const android = {
  Capacitor: {
    isNativePlatform: () => true,
    getPlatform: () => "android",
  },
};
assert.equal(isIosKeychainShell(ios), true);
assert.equal(isIosKeychainShell(android), false);
assert.equal(isIosKeychainShell({}), false);
assert.equal(isIosKeychainShell(null), false);

const main = readFileSync(join(root, "main.jsx"), "utf8");
const bootFn = main.slice(main.indexOf("async function boot()"));
assert.match(
  bootFn,
  /await hydrateSecureToken\(\)[\s\S]*Boolean\(getToken\(\)\)[\s\S]*await bootApp\(\)/
);
assert.doesNotMatch(main.slice(0, main.indexOf("async function boot()")), /Boolean\(getToken\(\)\)/);

const storage = readFileSync(join(root, "lib/storage.js"), "utf8");
assert.match(storage, /iosHydrated/);
assert.match(storage, /import\("@capacitor\/core"\)/);
assert.doesNotMatch(storage, /^import .*@capacitor\/core/m);

const bridge = readFileSync(
  join(root, "../ios/App/App/DescallBridgeViewController.swift"),
  "utf8"
);
assert.match(bridge, /DescallKeychainPlugin\(\)/);

console.log("secureToken.selftest: ok");
