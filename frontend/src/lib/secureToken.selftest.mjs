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

assert.deepEqual(planSecureTokenHydration({ keychainValue: "kc", localValue: "old" }), {
  memory: "kc",
  clearLocal: true,
  writeKeychain: null,
});
assert.deepEqual(planSecureTokenHydration({ keychainValue: "kc", localValue: null }), {
  memory: "kc",
  clearLocal: false,
  writeKeychain: null,
});
assert.deepEqual(planSecureTokenHydration({ keychainValue: null, localValue: "local" }), {
  memory: "local",
  clearLocal: false,
  writeKeychain: "local",
});
assert.deepEqual(planSecureTokenHydration({ keychainValue: "", localValue: "" }), {
  memory: null,
  clearLocal: false,
  writeKeychain: null,
});

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
