// Selftest: pull-to-refresh state machine and touch driver (mobile lists).
import assert from "node:assert/strict";
import { createPullMachine, pullOffset, spokesForProgress, attachPullToRefresh, PULL_DEFAULTS } from "./pullToRefresh.js";

const { threshold, hold, slop } = PULL_DEFAULTS;

// 1:1 up to the threshold, then rubber band (always further, never 1:1).
assert.equal(pullOffset(10), 10);
assert.equal(pullOffset(threshold), threshold);
const far = pullOffset(threshold + 200);
assert.ok(far > threshold && far < threshold + 200, "rubber band past threshold");
assert.ok(pullOffset(threshold + 400) > far, "monotonic");
assert.equal(pullOffset(-5), 0);

let r0;
let r;
// Not at top: never claims.
let m = createPullMachine();
m.begin({ x: 100, y: 100, atTop: false });
assert.equal(m.move({ x: 100, y: 200 }).claim, false);

// Sideways (swipe-back / row swipe) yields.
m = createPullMachine();
m.begin({ x: 100, y: 100, atTop: true });
assert.equal(m.move({ x: 130, y: 105 }).claim, false);
assert.equal(m.phase, "yielded");
assert.equal(m.move({ x: 130, y: 300 }).claim, false, "stays yielded for the rest of the touch");

// Upward yields (normal scroll).
m = createPullMachine();
m.begin({ x: 100, y: 300, atTop: true });
assert.equal(m.move({ x: 100, y: 280 }).claim, false);
assert.equal(m.phase, "yielded");

// Inside the slop: undecided, no claim, but a downward move blocks the native bounce.
m = createPullMachine();
m.begin({ x: 100, y: 100, atTop: true });
r0 = m.move({ x: 101, y: 100 + slop });
assert.equal(r0.claim, false);
assert.equal(r0.block, true, "downward move at top blocks native bounce while deciding");
m = createPullMachine();
m.begin({ x: 100, y: 100, atTop: true });
assert.equal(m.move({ x: 106, y: 102 }).block, false, "sideways-ish move is not blocked");

// Downward pull: claims, no jump by the slop, 1:1 tracking.
m = createPullMachine();
m.begin({ x: 100, y: 100, atTop: true });
r = m.move({ x: 100, y: 100 + slop + 1 });
assert.equal(r.claim, true);
assert.equal(r.offset, 0, "measured from the decision point");
r = m.move({ x: 100, y: 100 + slop + 1 + 30 });
assert.equal(r.offset, 30, "1:1");
assert.equal(r.triggered, false);
// Crossing the threshold triggers once.
r = m.move({ x: 100, y: 100 + slop + 1 + threshold });
assert.equal(r.triggered, true);
assert.equal(m.refreshing, true);
r = m.move({ x: 100, y: 100 + slop + 1 + threshold + 40 });
assert.equal(r.triggered, false, "haptic/refresh fire once");
// Release while refreshing rests at the hold slot.
assert.deepEqual(m.end(), { target: hold, wasPulling: true });
assert.deepEqual(m.finish(), { target: 0 });
assert.equal(m.refreshing, false);

// Short pull returns to 0 without a refresh.
m = createPullMachine();
m.begin({ x: 0, y: 0, atTop: true });
m.move({ x: 0, y: slop + 1 });
m.move({ x: 0, y: slop + 1 + 20 });
assert.deepEqual(m.end(), { target: 0, wasPulling: true });
assert.equal(m.refreshing, false);

// Fetch finishes while the finger is still down: no settle yet.
m = createPullMachine();
m.begin({ x: 0, y: 0, atTop: true });
m.move({ x: 0, y: slop + 1 });
m.move({ x: 0, y: slop + 1 + threshold + 10 });
assert.deepEqual(m.finish(), { target: null });
assert.equal(m.end().target, 0);

// Spokes draw in with progress.
assert.equal(spokesForProgress(0), 0);
assert.equal(spokesForProgress(0.5), 4);
assert.equal(spokesForProgress(2), 8);

// ---- Driver with a fake DOM ----
class El {
  constructor() { this.l = {}; this.style = {}; this.attrs = {}; this.scrollTop = 0; this.cls = new Set();
    this.classList = { toggle: (c, on) => (on ? this.cls.add(c) : this.cls.delete(c)), remove: (c) => this.cls.delete(c) }; }
  addEventListener(t, f, o) { (this.l[t] ||= []).push({ f, o }); }
  removeEventListener(t, f) { this.l[t] = (this.l[t] || []).filter((x) => x.f !== f); }
  setAttribute(k, v) { this.attrs[k] = v; }
  fire(t, e) { (this.l[t] || []).forEach((x) => x.f(e)); }
}
const frames = [];
globalThis.requestAnimationFrame = (cb) => { frames.push(cb); return frames.length; };
globalThis.cancelAnimationFrame = () => {};
let now = 0;
const flush = () => { for (let i = 0; i < 400 && frames.length; i++) { now += 16; frames.shift()(now); } };
let reduced = false;
const win = { scrollY: 0, matchMedia: () => ({ matches: reduced }) };

async function drive({ fetchMs = 0 } = {}) {
  const scroller = new El();
  const track = new El();
  const indicator = new El();
  let refreshes = 0;
  let haptics = 0;
  let hapticOffset = null;
  let resolveFetch;
  const cleanup = attachPullToRefresh(scroller, {
    track, indicator, win,
    options: { minSpinMs: 0 },
    onRefresh: () => { refreshes++; return new Promise((res) => { resolveFetch = res; if (!fetchMs) res(); }); },
    onHaptic: () => { haptics++; hapticOffset = track.style.top; },
  });
  const passive = Object.fromEntries(Object.entries(scroller.l).map(([k, v]) => [k, v[0].o?.passive]));
  return { scroller, track, indicator, cleanup, passive, get refreshes() { return refreshes; }, get haptics() { return haptics; }, get hapticOffset() { return hapticOffset; }, resolve: () => resolveFetch?.() };
}
const touch = (y, x = 50) => ({ touches: [{ clientX: x, clientY: y }], cancelable: true, prevented: false, preventDefault() { this.prevented = true; } });

{
  const d = await drive();
  assert.equal(d.passive.touchmove, false, "touchmove must be able to preventDefault");
  assert.equal(d.passive.touchstart, true);
  d.scroller.fire("touchstart", touch(100));
  const e0 = touch(103); d.scroller.fire("touchmove", e0);
  assert.equal(e0.prevented, true, "first small downward move already blocks the native bounce");
  const e1 = touch(100 + slop + 1); d.scroller.fire("touchmove", e1);
  const e2 = touch(100 + slop + 1 + 40); d.scroller.fire("touchmove", e2);
  assert.equal(e2.prevented, true, "claimed pull blocks native scroll/bounce");
  assert.equal(d.track.style.top, "40.00px", "track follows finger 1:1");
  assert.equal(d.track.style.transform, undefined, "no transform on the track (fixed children inside lists)");
  assert.equal(d.indicator.attrs["data-state"], "pulling");
  assert.equal(d.indicator.attrs["data-spokes"], String(spokesForProgress(40 / threshold)));
  d.scroller.fire("touchmove", touch(100 + slop + 1 + threshold + 5));
  assert.equal(d.haptics, 1, "haptic at threshold");
  assert.match(d.hapticOffset, /px$/, "haptic on the same event as the visual");
  assert.equal(d.refreshes, 1, "refetch starts at threshold");
  d.scroller.fire("touchend", { touches: [] });
  await new Promise((r) => setTimeout(r, 5));
  flush();
  assert.equal(d.track.style.top, "", "list returns to rest after refresh");
  assert.equal(d.indicator.attrs["data-state"], "idle");
  d.cleanup();
  assert.equal((d.scroller.l.touchmove || []).length, 0, "cleanup removes listeners");
}

{
  // iOS already scrolling (touchmove not cancelable): give the touch up, no double move.
  const d = await drive();
  d.scroller.fire("touchstart", touch(100));
  const n1 = touch(100 + slop + 1); n1.cancelable = false; d.scroller.fire("touchmove", n1);
  const n2 = touch(100 + slop + 60); n2.cancelable = false; d.scroller.fire("touchmove", n2);
  assert.equal(d.track.style.top || "", "", "track not moved when native scroll owns the touch");
  assert.equal(d.refreshes, 0);
  d.scroller.fire("touchend", { touches: [] });
  d.cleanup();
}

{
  // Not at top (list scrolled): touches are left alone.
  const d = await drive();
  d.scroller.scrollTop = 120;
  d.scroller.fire("touchstart", touch(100));
  const e = touch(200); d.scroller.fire("touchmove", e);
  assert.equal(e.prevented, false);
  assert.equal(d.refreshes, 0);
  d.cleanup();
}

{
  // Page scrolled (mobile web document scroller).
  const d = await drive();
  win.scrollY = 30;
  d.scroller.fire("touchstart", touch(100));
  const e = touch(250); d.scroller.fire("touchmove", e);
  assert.equal(e.prevented, false);
  win.scrollY = 0;
  d.cleanup();
}

{
  // Reduced motion: release returns at once (no spring frames needed); slow fetch holds the spinner.
  reduced = true;
  const d = await drive({ fetchMs: 1 });
  d.scroller.fire("touchstart", touch(0));
  d.scroller.fire("touchmove", touch(slop + 1));
  d.scroller.fire("touchmove", touch(slop + 1 + threshold + 1));
  d.scroller.fire("touchend", { touches: [] });
  assert.equal(d.track.style.top, `${hold}.00px`, "rests at the spinner slot, no spring");
  assert.equal(d.indicator.attrs["data-state"], "refreshing");
  d.resolve();
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(d.track.style.top, "", "returns without animation");
  reduced = false;
  d.cleanup();
}

{
  // A failing refetch still ends the spinner.
  const scroller = new El(), track = new El(), indicator = new El();
  const cleanup = attachPullToRefresh(scroller, { track, indicator, win, options: { minSpinMs: 0 }, onRefresh: () => Promise.reject(new Error("offline")) });
  scroller.fire("touchstart", touch(0));
  scroller.fire("touchmove", touch(slop + 1));
  scroller.fire("touchmove", touch(slop + 1 + threshold + 1));
  scroller.fire("touchend", { touches: [] });
  await new Promise((r) => setTimeout(r, 5));
  flush();
  assert.equal(indicator.attrs["data-state"], "idle");
  assert.equal(track.style.top, "");
  cleanup();
}

console.log("pullToRefresh.selftest: ok");
