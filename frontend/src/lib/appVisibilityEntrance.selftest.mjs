// Run: node src/lib/appVisibilityEntrance.selftest.mjs
// Tauri sweep 2: a one-shot entrance (fade / rise from opacity 0, fill-mode both) that mounts
// while html.app-idle / app-backgrounded / app-hidden pauses every CSS animation froze at its
// first frame: invisible but clickable toasts, popovers, cards and message rows.
// installEntranceRelease plays the finite CSS animations; infinite loops stay paused.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("./appVisibility.js", import.meta.url), "utf8");
assert.match(src, /export function installEntranceRelease\(/, "installEntranceRelease exists");
const body = src.replace(/^import .*$/gm, "").replace(/export /g, "");
const mod = new Function(`const getVoiceBusy = () => false; const subscribeVoiceBusy = () => () => {};\n${body}; return { installEntranceRelease, isOneShotAnimation };`)();

const anim = (iterations, { css = true, state = "paused" } = {}) => {
  const a = { playState: state, played: 0, effect: { getComputedTiming: () => ({ iterations }) }, play() { this.played += 1; this.playState = "running"; } };
  if (css) a.animationName = "s2-rise";
  return a;
};
const cls = new Set();
const root = { classList: { contains: (c) => cls.has(c), toggle: (c, on) => (on ? cls.add(c) : cls.delete(c)) } };
const listeners = {};
let observer = null;
let docAnims = [];
const doc = {
  documentElement: root,
  addEventListener: (ev, fn) => { (listeners[ev] ||= []).push(fn); },
  removeEventListener: (ev, fn) => { listeners[ev] = (listeners[ev] || []).filter((f) => f !== fn); },
  getAnimations: () => docAnims,
};
let domObserver = null;
class FakeMO {
  constructor(cb) { this.cb = cb; }
  observe(target) { if (target === root) observer = this; else domObserver = this; this.target = target; }
  disconnect() { if (this.target === root) observer = null; else if (domObserver === this) domObserver = null; }
}
doc.body = { nodeType: 1 };
const timers = [];
const off = mod.installEntranceRelease({ document: doc, MutationObserver: FakeMO, setTimeout: (fn) => { timers.push(fn); return timers.length; }, clearTimeout: () => {} });
const start = (anims) => (listeners.animationstart || []).forEach((f) => f({ target: { getAnimations: () => anims } }));

// Not paused: nothing is touched.
const a0 = anim(1);
start([a0]);
assert.equal(a0.played, 0, "no pause class: untouched");

// Paused (idle, backgrounded, hidden): a finite CSS entrance plays to its end.
for (const c of ["app-idle", "app-backgrounded", "app-hidden"]) {
  cls.clear(); cls.add(c);
  const once = anim(1);
  const loop = anim(Infinity);
  const script = anim(1, { css: false });
  start([once, loop, script]);
  assert.equal(once.played, 1, `${c}: one-shot entrance plays`);
  assert.equal(loop.played, 0, `${c}: infinite loop stays paused`);
  assert.equal(script.played, 0, `${c}: script (framer) animation untouched`);
}
assert.equal(mod.isOneShotAnimation(anim(2)), true);
assert.equal(mod.isOneShotAnimation(anim(1, { state: "finished" })), false);
assert.equal(mod.isOneShotAnimation(null), false);

// An entrance running when the pause class goes on also finishes.
cls.clear();
observer.cb();
const mid = anim(1);
const midLoop = anim(Infinity);
docAnims = [mid, midLoop];
mid.playState = "paused";
cls.add("app-idle");
observer.cb();
assert.equal(mid.played, 1, "mid-flight entrance released when idle starts");
assert.equal(midLoop.played, 0);

// A staggered entrance (delay) paused before its start never fires animationstart: nodes
// added while paused release the document's one-shot animations.
assert.ok(domObserver, "DOM watched while paused");
const staggered = anim(1);
docAnims = [staggered];
domObserver.cb();
assert.equal(staggered.played, 0, "released on the next tick, not per mutation");
timers.splice(0).forEach((fn) => fn());
assert.equal(staggered.played, 1, "staggered entrance released");
cls.clear();
observer.cb();
assert.equal(domObserver, null, "DOM no longer watched once the pause ends");
off();
assert.equal(observer, null, "cleanup disconnects");
assert.equal((listeners.animationstart || []).length, 0, "cleanup removes the listener");

// Installed for the Tauri shell only (Electron, web and mobile keep the plain pause).
const main = readFileSync(new URL("../main.jsx", import.meta.url), "utf8");
assert.match(main, /if \(window\.electronAPI\?\.isTauri\) m\.installEntranceRelease\(\);/);
console.log("appVisibilityEntrance.selftest ok");
