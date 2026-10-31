// Run: node src/lib/appVisibility.selftest.mjs
// 3.7.15 idle CPU: Electron tells the page when it is minimized / hidden and the page
// pauses CSS animations; audio contexts are suspended when no call uses them; the
// activity scanner runs every 30 s, not on every focus; the unread pulse is not infinite.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// The module imports a CSS file; test the pure helper by evaluating its source.
const src = readFileSync(new URL("./appVisibility.js", import.meta.url), "utf8");
const body = src.replace(/^import .*$/gm, "").replace(/export /g, "");
const mod = new Function(`const getVoiceBusy = () => false; const subscribeVoiceBusy = () => () => {};\n${body}; return { applyAppVisibility, installAppVisibility, installIdlePause, BACKGROUNDED_CLASS, IDLE_CLASS };`)();
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

// Idle / blur pause with a fake window, timers and voice-busy flag.
{
  const cls = new Set();
  const root = { classList: { toggle: (c, on) => (on ? cls.add(c) : cls.delete(c)), contains: (c) => cls.has(c), remove: (c) => cls.delete(c) } };
  const listeners = {};
  const fakeWin = {
    document: { documentElement: root },
    addEventListener: (ev, fn) => { (listeners[ev] ||= []).push(fn); },
    removeEventListener: (ev, fn) => { listeners[ev] = (listeners[ev] || []).filter((f) => f !== fn); },
    setTimeout: () => 0, clearTimeout: () => {},
  };
  let pending = null;
  let busy = false;
  let busyCb = null;
  const off = mod.installIdlePause(fakeWin, {
    idleMs: 15000,
    isBusy: () => busy,
    subscribeBusy: (cb) => { busyCb = cb; return () => { busyCb = null; }; },
    setTimeout: (fn) => { pending = fn; return 1; },
    clearTimeout: () => { pending = null; },
  });
  const fire = (ev) => (listeners[ev] || []).forEach((f) => f());
  assert.equal(cls.has("app-idle"), false, "starts active");
  pending();                                   // 15 s without input
  assert.equal(cls.has("app-idle"), true, "idle after the timeout");
  fire("pointermove");
  assert.equal(cls.has("app-idle"), false, "input wakes it at once");
  fire("blur");
  assert.equal(cls.has("app-idle"), true, "losing focus pauses");
  fire("focus");
  assert.equal(cls.has("app-idle"), false, "focus resumes");
  busy = true;
  fire("blur");
  assert.equal(cls.has("app-idle"), false, "never idle during a call");
  busy = false;
  fire("blur");
  busyCb(true);
  assert.equal(cls.has("app-idle"), false, "a call starting wakes it");
  for (const ev of ["pointermove", "pointerdown", "keydown", "wheel", "touchstart", "blur", "focus"]) assert.ok((listeners[ev] || []).length, ev);
  off();
  assert.equal((listeners.blur || []).length, 0, "cleanup removes listeners");
  assert.equal(cls.has("app-idle"), false);
}

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const pauseCss = read("../styles/app-backgrounded.css");
assert.match(pauseCss, /html\.app-idle \*,[\s\S]*?animation-play-state: paused !important;/);
assert.match(pauseCss, /html\.app-idle :is\(\.spin,[\s\S]*?animation-play-state: running !important;/, "spinners keep running");
assert.match(read("../main.jsx"), /m\.installIdlePause\(\)/);
assert.match(read("../styles/theme-scenes.css"), /animation: theme-scene-drift 32s ease-in-out 1 both;/);
assert.doesNotMatch(read("../styles/design-tokens.css"), /theme-pulse-(glow|text) 2\.6s ease-in-out infinite/);
assert.match(read("../styles/app-backgrounded.css"), /html\.app-backgrounded \*,[\s\S]*?animation-play-state: paused !important;/);
const main = read("../../electron/main.cjs");
assert.match(main, /mainWindow\.webContents\.send\('app:visibility', \{ backgrounded \}\)/);
assert.match(main, /mainWindow\.on\('minimize', \(\) => \{[\s\S]*?sendVisibility\(true\);/);
assert.match(main, /mainWindow\.on\('restore', \(\) => \{ setStartInBackground\(false\); sendVisibility\(false\); \}\);/);
assert.match(main, /if \(now - lastBlurCheck < 15 \* 60 \* 1000\) return;/);
assert.match(read("../../electron/preload.cjs"), /onAppVisibility: \(callback\) =>/);
assert.match(read("../main.jsx"), /m\.installAppVisibility\(\)/);

const ns = read("./noiseSuppression.js");
const preload = ns.slice(ns.indexOf("export function preloadNoiseSuppression"), ns.indexOf("export function suspendIdleContext"));
assert.doesNotMatch(preload, /ensureContext\(|new \(window\.AudioContext/, "boot preload creates no AudioContext");
assert.match(preload, /ensureWasm\(\)/);
assert.match(ns, /const ctx = sharedCtx;\s*sharedCtx = null;[\s\S]*?ctx\.close\(\)/, "idle closes the context (no Audio Service between calls)");
assert.match(ns, /activeSession = null;\s*if \(!keepContext\) suspendIdleContext\(\);/, "session end closes the idle context");
assert.match(ns, /wrapsInFlight > 0/, "never closed under a wrap in progress");
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
