// Run: node src/lib/appVisibility.selftest.mjs
// 3.7.15 idle CPU: Electron tells the page when it is minimized / hidden and the page
// pauses CSS animations; audio contexts are suspended when no call uses them; the
// activity scanner runs every 30 s, not on every focus; the unread pulse is not infinite.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// The module imports a CSS file; test the pure helper by evaluating its source.
const src = readFileSync(new URL("./appVisibility.js", import.meta.url), "utf8");
const body = src.replace(/^import .*$/gm, "").replace(/export /g, "");
const mod = new Function(`const getVoiceBusy = () => false; const subscribeVoiceBusy = () => () => {};\n${body}; return { applyAppVisibility, installAppVisibility, installIdlePause, installPageHiddenPause, idleDelayFor, readPowerState, BACKGROUNDED_CLASS, IDLE_CLASS, HIDDEN_CLASS, IDLE_MS, IDLE_MS_SAVER };`)();
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

// Tauri 4.0.1 empty market: a missed backgrounded:false (window restored or shown from the
// tray without being activated) kept every CSS animation paused at frame 0. Input or focus
// on the page proves the window is on screen and clears the stale class.
{
  const cls = new Set();
  const root = { classList: { toggle: (c, on) => (on ? cls.add(c) : cls.delete(c)), contains: (c) => cls.has(c) } };
  const listeners = {};
  let shell;
  const fakeWin = {
    electronAPI: { onAppVisibility: (cb) => { shell = cb; return () => { shell = null; }; } },
    document: { documentElement: root },
    addEventListener: (ev, fn) => { (listeners[ev] ||= []).push(fn); },
    removeEventListener: (ev, fn) => { listeners[ev] = (listeners[ev] || []).filter((f) => f !== fn); },
  };
  const fire = (ev) => (listeners[ev] || []).forEach((f) => f());
  const off = mod.installAppVisibility(fakeWin);
  shell({ backgrounded: true });
  assert.ok(cls.has("app-backgrounded"));
  fire("pointerdown");
  assert.equal(cls.has("app-backgrounded"), false, "a click on the page clears a stale backgrounded");
  shell({ backgrounded: true });
  fire("keydown");
  assert.equal(cls.has("app-backgrounded"), false, "a key press clears it too");
  shell({ backgrounded: true });
  fire("focus");
  assert.equal(cls.has("app-backgrounded"), false, "window focus clears it");
  shell({ backgrounded: true });
  fire("pointermove");
  assert.equal(cls.has("app-backgrounded"), true, "a hover alone (pointer over a hidden window's area) does not");
  off();
  assert.equal(shell, null);
  assert.equal(Object.values(listeners).flat().length, 0, "cleanup removes the listeners");
}

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
  assert.equal(cls.has("app-blurred"), true, "blurred even during a call (voice tile skins pause)");
  fire("focus");
  assert.equal(cls.has("app-blurred"), false, "focus clears blurred");
  fire("blur");
  busy = false;
  fire("blur");
  busyCb(true);
  assert.equal(cls.has("app-idle"), false, "a call starting wakes it");
  for (const ev of ["pointermove", "pointerdown", "keydown", "wheel", "touchstart", "blur", "focus"]) assert.ok((listeners[ev] || []).length, ev);
  off();
  assert.equal((listeners.blur || []).length, 0, "cleanup removes listeners");
  assert.equal(cls.has("app-idle"), false);
}

// iPhone idle energy: shorter idle in Low Power Mode / thermal / Reduce Motion.
assert.equal(mod.IDLE_MS, 15000);
assert.equal(mod.idleDelayFor(), mod.IDLE_MS);
assert.equal(mod.idleDelayFor({ lowPower: true }), mod.IDLE_MS_SAVER);
assert.equal(mod.idleDelayFor({ thermal: "serious" }), mod.IDLE_MS_SAVER);
assert.equal(mod.idleDelayFor({ thermal: "critical" }), mod.IDLE_MS_SAVER);
assert.equal(mod.idleDelayFor({ thermal: "fair" }), mod.IDLE_MS);
assert.equal(mod.idleDelayFor({ reducedMotion: true }), mod.IDLE_MS_SAVER);
{
  const mk = (attr, reduce) => ({ document: { documentElement: { getAttribute: () => attr } }, matchMedia: () => ({ matches: reduce }) });
  assert.deepEqual(mod.readPowerState(mk("lowPower device", false)), { lowPower: true, thermal: "nominal", reducedMotion: false });
  assert.deepEqual(mod.readPowerState(mk("thermal", true)), { lowPower: false, thermal: "serious", reducedMotion: true });
  assert.deepEqual(mod.readPowerState(mk(null, false)), { lowPower: false, thermal: "nominal", reducedMotion: false });
  assert.deepEqual(mod.readPowerState(undefined), { lowPower: false, thermal: "nominal", reducedMotion: false });
  // The idle timer reads the state each time it arms.
  let attr = "";
  let lastMs = 0;
  const cls = new Set();
  const root = { classList: { toggle: (c, on) => (on ? cls.add(c) : cls.delete(c)), contains: (c) => cls.has(c), remove: (c) => cls.delete(c) }, getAttribute: () => attr };
  const w = { document: { documentElement: root }, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }), setTimeout: () => 0, clearTimeout() {} };
  const off = mod.installIdlePause(w, { isBusy: () => false, subscribeBusy: () => () => {}, setTimeout: (fn, ms) => { lastMs = ms; return 1; }, clearTimeout() {} });
  assert.equal(lastMs, 15000);
  attr = "lowPower";
  off();
  mod.installIdlePause(w, { isBusy: () => false, subscribeBusy: () => () => {}, setTimeout: (fn, ms) => { lastMs = ms; return 1; }, clearTimeout() {} })();
  assert.equal(lastMs, 5000, "Low Power Mode idles sooner");
}
// html.app-hidden follows page visibility / Capacitor pause-resume / pagehide.
{
  const cls = new Set();
  const dl = {}; const wl = {};
  const doc = { visibilityState: "visible", documentElement: { classList: { toggle: (c, on) => (on ? cls.add(c) : cls.delete(c)), contains: (c) => cls.has(c), remove: (c) => cls.delete(c) } },
    addEventListener: (e, f) => { (dl[e] ||= []).push(f); }, removeEventListener: (e, f) => { dl[e] = (dl[e] || []).filter((x) => x !== f); } };
  const w = { document: doc, addEventListener: (e, f) => { (wl[e] ||= []).push(f); }, removeEventListener: (e, f) => { wl[e] = (wl[e] || []).filter((x) => x !== f); } };
  const off = mod.installPageHiddenPause(w);
  const fireD = (e) => (dl[e] || []).forEach((f) => f());
  const fireW = (e) => (wl[e] || []).forEach((f) => f());
  assert.equal(cls.has("app-hidden"), false);
  doc.visibilityState = "hidden"; fireD("visibilitychange");
  assert.equal(cls.has("app-hidden"), true, "hidden page pauses");
  doc.visibilityState = "visible"; fireD("visibilitychange");
  assert.equal(cls.has("app-hidden"), false, "visible again resumes");
  fireD("pause"); assert.equal(cls.has("app-hidden"), true, "Capacitor pause");
  fireD("resume"); assert.equal(cls.has("app-hidden"), false, "Capacitor resume");
  fireW("pagehide"); assert.equal(cls.has("app-hidden"), true, "pagehide");
  fireW("pageshow"); assert.equal(cls.has("app-hidden"), false, "pageshow");
  off();
  assert.equal((dl.visibilitychange || []).length, 0, "cleanup");
  assert.equal(typeof mod.installPageHiddenPause({}), "function", "no DOM: no-op");
}

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
assert.match(read("../main.jsx"), /m\.installPageHiddenPause\(\)/);
assert.match(read("../styles/app-backgrounded.css"), /html\.app-hidden \*,[\s\S]*?animation-play-state: paused !important;/);
const pauseCss = read("../styles/app-backgrounded.css");
assert.match(pauseCss, /html\.app-blurred :is\(\.vt2-skin, \.vt2-skin \*\)[\s\S]*?animation-play-state: paused !important;/, "voice tile skins pause when the window is blurred");
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
