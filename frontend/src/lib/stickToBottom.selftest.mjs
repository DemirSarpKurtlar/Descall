// Selftest: chat stays pinned to the newest message when the iOS keyboard
// shrinks the scroller, and never yanks someone reading history.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

// Minimal DOM for the controller.
class Target {
  constructor() { this.l = {}; }
  addEventListener(t, f) { (this.l[t] ||= new Set()).add(f); }
  removeEventListener(t, f) { this.l[t]?.delete(f); }
  emit(t, e = {}) { [...(this.l[t] || [])].forEach((f) => f(e)); }
  count(t) { return this.l[t]?.size || 0; }
}
const observers = new Set();
globalThis.ResizeObserver = class { constructor(cb) { this.cb = cb; this.els = []; observers.add(this); } observe(el) { this.els.push(el); } disconnect() { observers.delete(this); } };
const fireResize = (el) => observers.forEach((o) => o.els.includes(el) && o.cb([]));
const win = new Target();
win.visualViewport = new Target();
win.setTimeout = (fn) => { pending.push(fn); return pending.length; };
win.clearTimeout = () => {};
win.matchMedia = () => ({ matches: reduced });
let reduced = false;
const pending = [];
globalThis.window = win;
globalThis.document = new Target();
globalThis.requestAnimationFrame = (fn) => { pending.push(fn); return pending.length; };
globalThis.cancelAnimationFrame = () => {};
const flush = () => { while (pending.length) pending.shift()(); };

const {
  pinnedAfterScroll, pinBehavior, distanceFromBottom, isNearBottom, attachStickToBottom, STICK_TO_BOTTOM_PX,
} = await import("./stickToBottom.js");

// --- pure rules ---
const m = (scrollTop, clientHeight, scrollHeight = 4000) => ({ scrollTop, clientHeight, scrollHeight });
assert.equal(distanceFromBottom(m(3200, 800)), 0);
assert.equal(isNearBottom(m(3100, 800)), true);
assert.equal(isNearBottom(m(3000, 800)), false);
assert.equal(STICK_TO_BOTTOM_PX, 100);
// keyboard shrank the viewport: scrollTop unchanged, 336 px now hidden -> still pinned
assert.equal(pinnedAfterScroll({ pinned: true, metrics: m(3200, 464), last: m(3200, 800) }), true);
// user dragged up with the same viewport -> unpinned
assert.equal(pinnedAfterScroll({ pinned: true, metrics: m(2900, 800), last: m(3200, 800) }), false);
// our own smooth scroll still travelling -> keep state
assert.equal(pinnedAfterScroll({ pinned: true, metrics: m(2900, 800), last: m(2800, 800), programmatic: true }), true);
// reading history + keyboard -> stays unpinned (no yank)
assert.equal(pinnedAfterScroll({ pinned: false, metrics: m(1000, 464), last: m(1000, 800) }), false);
// scrolling back down near the bottom re-pins
assert.equal(pinnedAfterScroll({ pinned: false, metrics: m(3150, 800), last: m(2000, 800) }), true);
// motion: reduced -> instant; first paint -> instant; short hop -> smooth; long jump -> instant
assert.equal(pinBehavior({ reducedMotion: true, distance: 120 }), "auto");
assert.equal(pinBehavior({ initial: true, distance: 120 }), "auto");
assert.equal(pinBehavior({ distance: 120 }), "smooth");
assert.equal(pinBehavior({ distance: 5000 }), "auto");
assert.equal(pinBehavior({ distance: 0 }), "auto");

// --- controller ---
function makeScroller({ scrollHeight = 4000, clientHeight = 800, scrollTop = 3200 } = {}) {
  const el = new Target();
  el.scrollHeight = scrollHeight; el.clientHeight = clientHeight;
  let top = scrollTop;
  Object.defineProperty(el, "scrollTop", { get: () => top, set: (v) => { top = Math.max(0, Math.min(v, el.scrollHeight - el.clientHeight)); } });
  el.smooth = 0;
  el.scrollTo = ({ top: t, behavior }) => { if (behavior === "smooth") el.smooth++; el.scrollTop = t; };
  return el;
}

{
  // 1) Pinned + keyboard opens (scroller shrinks, no scroll event): re-pins.
  const s = makeScroller(); const content = new Target();
  const pin = attachStickToBottom(s, { content });
  s.clientHeight = 464; fireResize(s);
  assert.equal(s.scrollTop, 4000 - 464, "keyboard: newest message stays visible");
  // Late native inset (QuickType bar) via visualViewport resize, then settles.
  s.clientHeight = 419; win.visualViewport.emit("resize"); flush();
  assert.equal(s.scrollTop, 4000 - 419);
  // Scroll event caused by layout (clientHeight changed) keeps the pin.
  s.clientHeight = 800; s.scrollTop = s.scrollTop; s.emit("scroll");
  assert.equal(pin.pinned, true);
  pin.destroy();
  assert.equal(s.count("scroll"), 0); assert.equal(win.visualViewport.count("resize"), 0); assert.equal(observers.size, 0);
}
{
  // 2) Reading history: keyboard must not yank.
  const s = makeScroller({ scrollTop: 1500 });
  const pin = attachStickToBottom(s);
  s.emit("scroll");
  assert.equal(pin.pinned, false);
  s.clientHeight = 464; fireResize(s); win.visualViewport.emit("resize"); flush();
  assert.equal(s.scrollTop, 1500, "history position kept");
  // A new message from someone else does not pull them down either.
  s.scrollHeight = 4100; pin.onMessages({}); fireResize(s);
  assert.equal(s.scrollTop, 1500);
  // Their own message does.
  pin.onMessages({ own: true });
  assert.equal(s.scrollTop, 4100 - 464);
  pin.destroy();
}
{
  // 3) New incoming message while pinned: short glide, instant under reduced motion.
  const s = makeScroller();
  const pin = attachStickToBottom(s);
  s.scrollHeight = 4120; pin.onMessages({});
  assert.equal(s.smooth, 1); assert.equal(s.scrollTop, 4120 - 800);
  reduced = true;
  s.scrollHeight = 4240; pin.onMessages({});
  assert.equal(s.smooth, 1, "reduced motion: no smooth scroll"); assert.equal(s.scrollTop, 4240 - 800);
  reduced = false;
  // First paint of a conversation is instant.
  s.scrollHeight = 4300; pin.onMessages({ initial: true });
  assert.equal(s.smooth, 1);
  // A user drag (same viewport) unpins.
  s.scrollTop = 2000; s.emit("touchstart"); s.emit("scroll");
  assert.equal(pin.pinned, false);
  pin.destroy();
}
{
  // 4) Disabled (searching / loading): never moves.
  const s = makeScroller({ scrollTop: 3100 });
  const pin = attachStickToBottom(s, { enabled: () => false });
  s.clientHeight = 464; fireResize(s);
  assert.equal(s.scrollTop, 3100);
  pin.destroy();
}

// --- wiring ---
const list = fs.readFileSync(path.join(here, "../components/chat/MessageList.jsx"), "utf8");
assert.match(list, /attachStickToBottom\(scroller/, "MessageList uses the controller");
assert.doesNotMatch(list, /stickToBottomRef/, "old content-only pin logic removed");
const lib = fs.readFileSync(path.join(here, "stickToBottom.js"), "utf8");
assert.match(lib, /ro\.observe\(scroller\)/, "observes the scroller itself, not only its content");
assert.match(lib, /visualViewport/, "follows the visual viewport");
assert.match(lib, /prefers-reduced-motion/, "honours reduced motion");

console.log("stickToBottom selftest: ok");
