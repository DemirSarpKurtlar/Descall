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
  preservedScrollTop, JUMP_BUTTON_PX,
} = await import("./stickToBottom.js");

// --- pure rules ---
const m = (scrollTop, clientHeight, scrollHeight = 4000) => ({ scrollTop, clientHeight, scrollHeight });
assert.equal(distanceFromBottom(m(3200, 800)), 0);
assert.equal(STICK_TO_BOTTOM_PX, 24, "pinned only when really at the bottom (plan §4.3)");
assert.equal(isNearBottom(m(3180, 800)), true);
assert.equal(isNearBottom(m(3150, 800)), false, "50 px up is reading, not pinned");
// keyboard shrank the viewport: scrollTop unchanged, 336 px now hidden -> still pinned
assert.equal(pinnedAfterScroll({ pinned: true, metrics: m(3200, 464), last: m(3200, 800) }), true);
// ...but a finger dragging up during that keyboard animation is intent -> unpinned
assert.equal(pinnedAfterScroll({ pinned: true, metrics: m(2900, 464), last: m(3200, 800), userDriven: true }), false);
// user dragged up with the same viewport -> unpinned
assert.equal(pinnedAfterScroll({ pinned: true, metrics: m(2900, 800), last: m(3200, 800) }), false);
// our own smooth scroll still travelling -> keep state
assert.equal(pinnedAfterScroll({ pinned: true, metrics: m(2900, 800), last: m(2800, 800), programmatic: true }), true);
// reading history + keyboard -> stays unpinned (no yank)
assert.equal(pinnedAfterScroll({ pinned: false, metrics: m(1000, 464), last: m(1000, 800) }), false);
// scrolling back down to the bottom re-pins
assert.equal(pinnedAfterScroll({ pinned: false, metrics: m(3190, 800), last: m(2000, 800) }), true);
// preserved scrollTop: keyboard opens (800 -> 464) keeps the distance from the bottom
assert.equal(preservedScrollTop({ scrollTop: 1500, prevClientHeight: 800, clientHeight: 464 }), 1836);
// ...an image above grew by 120 px -> follow the first visible row
assert.equal(preservedScrollTop({ scrollTop: 1500, prevClientHeight: 800, clientHeight: 800, anchorShift: 120 }), 1620);
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
  el.style = {};
  let top = scrollTop;
  Object.defineProperty(el, "scrollTop", { get: () => top, set: (v) => { top = Math.max(0, Math.min(v, el.scrollHeight - el.clientHeight)); } });
  el.smooth = 0;
  el.scrollTo = ({ top: t, behavior }) => { if (behavior === "smooth") el.smooth++; el.scrollTop = t; };
  el.getBoundingClientRect = () => ({ top: 0, bottom: el.clientHeight });
  return el;
}
// Content with real rows: row i sits at y = sum of heights above it.
function makeContent(scroller, heights) {
  const c = new Target();
  const rows = heights.map((h) => ({ h, isConnected: true, classList: { contains: (x) => x === "message-group" } }));
  const layout = () => {
    let y = 0;
    for (const r of rows) { r.y = y; y += r.h; }
    scroller.scrollHeight = Math.max(y, scroller.clientHeight);
  };
  for (const r of rows) r.getBoundingClientRect = () => ({ top: r.y - scroller.scrollTop, bottom: r.y + r.h - scroller.scrollTop });
  layout();
  c.children = rows;
  c.rows = rows;
  c.layout = layout;
  return c;
}
const userScroll = (s, top) => { s.emit("touchstart"); s.scrollTop = top; s.emit("scroll"); s.emit("touchend"); };
const nowReal = Date.now;
let clock = 1_000_000;
Date.now = () => clock;
const later = (ms) => { clock += ms; };

{
  // 1) Pinned + keyboard opens (scroller shrinks, no scroll event): re-pins.
  const s = makeScroller(); const content = new Target();
  const pin = attachStickToBottom(s, { content, initialPinned: true });
  s.clientHeight = 464; fireResize(s);
  assert.equal(s.scrollTop, 4000 - 464, "keyboard: newest message stays visible");
  // Late native inset (QuickType bar) via visualViewport resize, then settles.
  s.clientHeight = 419; win.visualViewport.emit("resize"); flush();
  assert.equal(s.scrollTop, 4000 - 419);
  // Scroll event caused by layout (clientHeight changed) keeps the pin.
  later(1000);
  s.clientHeight = 800; s.scrollTop = s.scrollTop; s.emit("scroll");
  assert.equal(pin.pinned, true);
  assert.equal(s.style.overflowAnchor, "none", "we anchor ourselves; native anchoring off");
  pin.destroy();
  assert.equal(s.count("scroll"), 0); assert.equal(s.count("touchstart"), 0); assert.equal(win.visualViewport.count("resize"), 0); assert.equal(observers.size, 0);
}
{
  // 2) Reading history: keyboard must not yank; it keeps the distance from the bottom.
  const s = makeScroller({ scrollTop: 1500 });
  const pin = attachStickToBottom(s, { initialPinned: true });
  userScroll(s, 1500);
  assert.equal(pin.pinned, false);
  later(1000);
  s.clientHeight = 464; fireResize(s); win.visualViewport.emit("resize"); flush();
  assert.equal(s.scrollTop, 1500 + 336, "the row you were reading stays above the keyboard");
  assert.equal(pin.pinned, false, "still reading history");
  // Keyboard closes: back to the same spot, still not pinned.
  s.clientHeight = 800; fireResize(s); flush();
  assert.equal(s.scrollTop, 1500);
  // A new message from someone else does not pull them down either.
  s.scrollHeight = 4100; pin.onMessages({ appended: true }); fireResize(s);
  assert.equal(s.scrollTop, 1500);
  assert.equal(pin.unseen, 1, "counted for the jump button");
  // Their own message does.
  pin.onMessages({ own: true, appended: true });
  assert.equal(s.scrollTop, 4100 - 800);
  assert.equal(pin.unseen, 0);
  pin.destroy();
}
{
  // 3) New incoming message while pinned: short glide, instant under reduced motion.
  const s = makeScroller();
  const pin = attachStickToBottom(s, { initialPinned: true });
  s.scrollHeight = 4120; pin.onMessages({ appended: true });
  assert.equal(s.smooth, 1); assert.equal(s.scrollTop, 4120 - 800);
  reduced = true;
  s.scrollHeight = 4240; pin.onMessages({ appended: true });
  assert.equal(s.smooth, 1, "reduced motion: no smooth scroll"); assert.equal(s.scrollTop, 4240 - 800);
  reduced = false;
  // First paint of a conversation is instant.
  s.scrollHeight = 4300; pin.onMessages({ initial: true });
  assert.equal(s.smooth, 1);
  // A user drag (same viewport) unpins.
  later(1000);
  userScroll(s, 2000);
  assert.equal(pin.pinned, false);
  pin.destroy();
}
{
  // 4) Disabled (searching / loading): never moves.
  const s = makeScroller({ scrollTop: 3100 });
  const pin = attachStickToBottom(s, { enabled: () => false, initialPinned: true });
  s.clientHeight = 464; fireResize(s);
  assert.equal(s.scrollTop, 3100);
  pin.destroy();
}
{
  // 5) Reaction / edit patch (no new last message) while reading recent
  //    messages 60 px up: no jump. The old 100 px threshold pinned here.
  const s = makeScroller({ scrollTop: 3140 });
  const pin = attachStickToBottom(s, { initialPinned: true });
  later(1000);
  userScroll(s, 3140);
  assert.equal(pin.pinned, false, "60 px up is not pinned");
  pin.onMessages({}); // in-place patch
  s.scrollHeight = 4028; fireResize(s); // a reaction chip row appeared at the bottom
  assert.equal(s.scrollTop, 3140, "no yank on a reaction update");
  pin.destroy();
}
{
  // 6) Re-attach (loading flip / scroller swap) keeps a reader where they were.
  //    Before: every attach started pinned and the ResizeObserver's first
  //    callback jumped to the bottom.
  const s = makeScroller({ scrollTop: 900 });
  const pin = attachStickToBottom(s, {});
  assert.equal(pin.pinned, false, "derived from the real distance");
  fireResize(s);
  assert.equal(s.scrollTop, 900);
  pin.destroy();
  const s2 = makeScroller({ scrollTop: 900 });
  const pin2 = attachStickToBottom(s2, { initialPinned: false });
  fireResize(s2);
  assert.equal(s2.scrollTop, 900, "carried-over unpinned state is honoured");
  pin2.destroy();
}
{
  // 7) Old message: an image above the viewport loads (+150 px): the visible
  //    rows stay put (WebKit has no overflow-anchor).
  const heights = Array.from({ length: 40 }, () => 100);
  const s = makeScroller({ scrollHeight: 4000, scrollTop: 1500 });
  const content = makeContent(s, heights);
  const pin = attachStickToBottom(s, { content, initialPinned: true });
  later(1000);
  userScroll(s, 1500);
  flush(); // anchor recorded on rAF after the scroll
  later(1000);
  content.rows[5].h += 150; content.layout(); fireResize(content);
  assert.equal(s.scrollTop, 1650, "first visible row did not move");
  // A row below the viewport growing changes nothing.
  content.rows[35].h += 80; content.layout(); fireResize(content);
  assert.equal(s.scrollTop, 1650);
  pin.destroy();
}
{
  // 8) Keyboard animating while the finger drags up: the drag wins (unpinned),
  //    and the next resize does not pull the reader back down.
  const s = makeScroller();
  const pin = attachStickToBottom(s, { initialPinned: true });
  s.emit("touchstart");
  s.clientHeight = 600; s.scrollTop = 2800; s.emit("scroll");
  assert.equal(pin.pinned, false, "finger on the list = intent");
  fireResize(s);
  assert.equal(s.scrollTop, 2800, "not yanked while touching");
  s.emit("touchend");
  later(1000);
  s.clientHeight = 464; fireResize(s);
  assert.equal(pin.pinned, false);
  assert.equal(s.scrollTop, 2800 + 136, "distance from the bottom kept");
  pin.destroy();
}
{
  // 9) "Go to message" jump: suspendPin stops pin + anchoring for a moment.
  const s = makeScroller();
  const pin = attachStickToBottom(s, { initialPinned: true });
  pin.suspendPin(1500);
  s.scrollTop = 1200; s.emit("scroll");
  s.scrollHeight = 4100; fireResize(s);
  assert.equal(s.scrollTop, 1200, "no pin while suspended");
  pin.destroy();
}
{
  // 10) Jump-to-bottom button state + action.
  const seen = [];
  const s = makeScroller();
  const pin = attachStickToBottom(s, { initialPinned: true, onChange: (st) => seen.push(st) });
  later(1000);
  userScroll(s, 1000);
  assert.ok(seen.some((x) => !x.pinned && x.distance > JUMP_BUTTON_PX), "button state published");
  pin.onMessages({ appended: true });
  assert.equal(seen.at(-1).unseen, 1);
  pin.jumpToBottom();
  assert.equal(s.scrollTop, 4000 - 800);
  assert.equal(pin.pinned, true);
  assert.equal(seen.at(-1).unseen, 0);
  pin.destroy();
}
Date.now = nowReal;

// --- wiring ---
const list = fs.readFileSync(path.join(here, "../components/chat/MessageList.jsx"), "utf8");
assert.match(list, /attachStickToBottom\(scroller/, "MessageList uses the controller");
assert.doesNotMatch(list, /stickToBottomRef/, "old content-only pin logic removed");
const lib = fs.readFileSync(path.join(here, "stickToBottom.js"), "utf8");
assert.match(lib, /ro\.observe\(scroller\)/, "observes the scroller itself, not only its content");
assert.match(lib, /visualViewport/, "follows the visual viewport");
assert.match(lib, /prefers-reduced-motion/, "honours reduced motion");
assert.match(list, /appended: appended && prevLastId != null/, "in-place patches (reactions) do not call a pin");
assert.match(list, /initialPinned: memo\.conversationId === conversationId/, "re-attach keeps the reader's state");

console.log("stickToBottom selftest: ok");
