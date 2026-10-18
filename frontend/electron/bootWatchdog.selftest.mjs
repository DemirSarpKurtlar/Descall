// Main-process boot watchdog (2.11.5). Run from frontend/: node electron/bootWatchdog.selftest.mjs
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const w = require("./bootWatchdog.cjs");
const here = dirname(fileURLToPath(import.meta.url));
const main = readFileSync(join(here, "main.cjs"), "utf8");

assert.equal(w.shouldRetryLoad({ errorCode: -3, isMainFrame: true }), false, "ERR_ABORTED is a superseded navigation");
assert.equal(w.shouldRetryLoad({ errorCode: -6, isMainFrame: false }), false, "subframes do not reload the app");
assert.equal(w.shouldRetryLoad({ errorCode: -6, isMainFrame: true }), true);
assert.deepEqual([0, 1, 2, 3].map(w.nextLoadRetryDelay), [1000, 3000, 8000, null], "bounded backoff, then ask");
assert.equal(w.shouldReloadAfterCrash({ booted: false, crashReloads: 0, reason: "crashed" }), true);
assert.equal(w.shouldReloadAfterCrash({ booted: false, crashReloads: w.MAX_BOOT_CRASH_RELOADS, reason: "crashed" }), false);
assert.equal(w.shouldReloadAfterCrash({ booted: true, crashReloads: 0, reason: "crashed" }), false);
assert.equal(w.shouldReloadAfterCrash({ booted: false, crashReloads: 0, reason: "clean-exit" }), false);
assert.deepEqual(w.BOOT_RETRY_STORAGES, ["serviceworkers", "cachestorage"], "a boot retry never wipes the session");

const hung = await w.raceWithTimeout(new Promise(() => {}), 20);
assert.equal(hung.timedOut, true);
const fine = await w.raceWithTimeout(Promise.resolve(1), 1000);
assert.deepEqual(fine, { timedOut: false, value: 1 });
const bad = await w.raceWithTimeout(Promise.reject(new Error("x")), 1000);
assert.equal(bad.timedOut, false);
assert.match(bad.error.message, /x/);

// Wiring in main.cjs.
assert.match(main, /raceWithTimeout\(ready, SPLASH_LOAD_TIMEOUT_MS\)/, "splash load cannot block the update gate");
assert.match(main, /on\('did-fail-load'/);
assert.match(main, /setTimeout\(\(\) => revealMainWindow\('ready-timeout'\), READY_FALLBACK_MS\)/, "window is revealed even without ready-to-show");
assert.match(main, /once\('ready-to-show', \(\) => revealMainWindow\('ready-to-show'\)\)/);
assert.match(main, /buttons: \['Tekrar dene', 'Çıkış'\]/);
assert.ok(w.READY_FALLBACK_MS <= 20000);

console.log("bootWatchdog.selftest: ok");
