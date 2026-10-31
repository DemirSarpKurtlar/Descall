// Run: node src/lib/appVisibility.selftest.mjs
// 3.7.15 idle CPU: Electron tells the page when it is minimized / hidden and the page
// pauses CSS animations; audio contexts are suspended when no call uses them; the
// activity scanner runs every 30 s, not on every focus; the unread pulse is not infinite.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// The module imports a CSS file; test the pure helper by evaluating its source.
const src = readFileSync(new URL("./appVisibility.js", import.meta.url), "utf8");
const body = src.replace(/^import .*$/m, "").replace(/export /g, "");
const mod = new Function(`${body}; return { applyAppVisibility, installAppVisibility, BACKGROUNDED_CLASS };`)();
const cls = new Set();
const root = { classList: { toggle: (c, on) => (on ? cls.add(c) : cls.delete(c)), contains: (c) => cls.has(c) } };
assert.equal(mod.applyAppVisibility(root, { backgrounded: true }), true);
assert.equal(mod.applyAppVisibility(root, { backgrounded: false }), false);
let handler;
const off = mod.installAppVisibility({ electronAPI: { onAppVisibility: (cb) => { handler = cb; return () => { handler = null; }; } }, document: { documentElement: root } });
handler({ backgrounded: true });
assert.ok(cls.has("app-backgrounded"));
off();
assert.equal(handler, null);
assert.equal(typeof mod.installAppVisibility({}), "function", "web / iOS: no-op");

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
assert.match(read("../styles/app-backgrounded.css"), /html\.app-backgrounded \*,[\s\S]*?animation-play-state: paused !important;/);
const main = read("../../electron/main.cjs");
assert.match(main, /mainWindow\.webContents\.send\('app:visibility', \{ backgrounded \}\)/);
assert.match(main, /mainWindow\.on\('minimize', \(\) => \{[\s\S]*?sendVisibility\(true\);/);
assert.match(main, /mainWindow\.on\('restore', \(\) => \{ setStartInBackground\(false\); sendVisibility\(false\); \}\);/);
assert.match(main, /if \(now - lastBlurCheck < 15 \* 60 \* 1000\) return;/);
assert.match(read("../../electron/preload.cjs"), /onAppVisibility: \(callback\) =>/);
assert.match(read("../main.jsx"), /m\.installAppVisibility\(\)/);

const ns = read("./noiseSuppression.js");
assert.match(ns, /\.then\(\(ctx\) => ensureAssets\(ctx\)\.then\(\(\) => suspendIdleContext\(\)\)\)/, "boot preload leaves the context suspended");
assert.match(ns, /activeSession = null;\s*suspendIdleContext\(\);/, "session end suspends it");
const va = read("./voiceActivity.js");
assert.match(va, /if \(!subscribers\.size\) return;\s*if \(!unlocked/, "idle taps do not wake the meter context");
assert.match(va, /dropGraphs\(\);\s*suspendIdle\(\);/);
assert.match(read("./soundPackSynth.js"), /await unlockSoundPackAudio\._ctx\.suspend\(\)/);
const act = read("../hooks/useActivity.js");
assert.match(act, /const SCAN_INTERVAL_MS\s+= 30_000;/);
assert.match(act, /if \(Date\.now\(\) - lastScanAtRef\.current >= SCAN_INTERVAL_MS\) scanAndEmitRef\.current\(\);/);
assert.match(act, /!settings\.show_game_activity && !settings\.show_app_activity && !settings\.show_browser/);
assert.match(read("../styles/visual-polish-pack.css"), /animation: unread-badge-pulse 2s ease-in-out 2;/);
console.log("appVisibility.selftest ok");
