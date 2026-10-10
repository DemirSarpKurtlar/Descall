/**
 * Run: node frontend/src/lib/messageReplySwipe.selftest.mjs
 * Edge swipe-back vs swipe-to-reply. Touch-shaped events (identifier, clientX,
 * timeStamp) at several start positions. Own messages reply left, others right.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PHASE, createSwipeBackMachine } from "./edgeSwipeBack.js";
import {
  REPLY_SWIPE_DEFAULTS as R,
  attachReplySwipe,
  createReplySwipe,
  simulateConversationGesture,
} from "./messageReplySwipe.js";

const W = 440;
const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(join(here, rel), "utf8");

assert.equal(R.edgeWidth, 28, "reply yields the same edge band swipe-back uses");
assert.equal(R.lockSlop, 10);
assert.equal(R.threshold, 48);
assert.equal(R.max, 72);

function pts(pairs) {
  return pairs.map(([clientX, clientY], i) => ({
    identifier: 3,
    clientX,
    clientY,
    timeStamp: i * 16,
    x: clientX,
    y: clientY,
    t: i * 16,
  }));
}

function run(startX, moves, opts) {
  const start = [startX, opts.y ?? 400];
  return simulateConversationGesture({
    points: pts([start, ...moves]),
    width: W,
    onBubble: opts.onBubble !== false,
    direction: opts.direction || "right",
    edgeWidth: R.edgeWidth,
  });
}

/* Start x: 0, 12, 22, 24, 28 are the edge (≤ 28). 29, 40, 120, 300 are not. */
for (const x of [0, 12, 22, 24, 28]) {
  const g = run(x, [[x + 40, 402], [x + 90, 404]], { direction: "right" });
  assert.equal(g.zone, "edge", `start ${x} is the back edge`);
  assert.equal(g.owner, "back", `start ${x} owns navigation`);
  assert.equal(g.replyX, 0, `start ${x} never tracks a reply`);
  assert.equal(g.replied, false);
  assert.ok(g.pageX > 0, `start ${x} moves the page (${g.pageX})`);
  assert.equal(g.haptic, 0);
}

for (const x of [29, 40, 120]) {
  const g = run(x, [[x + 16, 400], [x + 60, 402]], { direction: "right" });
  assert.equal(g.zone, null, `bubble at ${x} is not a back start`);
  assert.equal(g.owner, "reply");
  assert.equal(g.pageX, 0, "reply must not move the page");
  assert.ok(g.replyX > 0 && g.replyX <= 72, `1:1 reply offset ${g.replyX}`);
  assert.equal(g.replied, true);
  assert.equal(g.haptic, 1, "haptic once, at the reply threshold");
  assert.equal(g.scrollCancelled, true);
}

/* Right half, own message: leftward reply, page stays. */
{
  const g = run(300, [[280, 400], [230, 401]], { direction: "left" });
  assert.equal(g.owner, "reply");
  assert.equal(g.pageX, 0);
  assert.equal(g.replyX, -70);
  assert.equal(g.replied, true);
  assert.equal(g.haptic, 1);
}

/* Directions stay as they were: own = left, others = right. The other way aborts. */
{
  const ownWrong = run(300, [[330, 400], [370, 400]], { direction: "left" });
  assert.notEqual(ownWrong.owner, "reply");
  assert.equal(ownWrong.pageX, 0);
  assert.equal(ownWrong.replied, false);
  const otherWrong = run(120, [[100, 400], [60, 400]], { direction: "right" });
  assert.notEqual(otherWrong.owner, "reply");
  assert.equal(otherWrong.pageX, 0);
  assert.equal(otherWrong.replied, false);
}

/* 1:1 up to the cap, no elastic past it. Haptic only on the crossing sample. */
{
  const partial = run(80, [[110, 400]], { direction: "right" });
  assert.equal(partial.replyX, 30, "1:1 with the finger");
  assert.equal(partial.haptic, 0, "under the 48px threshold");
  assert.equal(partial.replied, false);
  const capped = run(80, [[100, 400], [200, 400]], { direction: "right" });
  assert.equal(capped.replyX, 72);
  assert.equal(capped.haptic, 1);
}

/* Vertical wins: neither gesture, and the scroll is not cancelled. */
{
  const g = run(80, [[84, 430]], { direction: "right", y: 200 });
  assert.equal(g.owner, null);
  assert.equal(g.pageX, 0);
  assert.equal(g.replyX, 0);
  assert.equal(g.scrollCancelled, false);
  assert.equal(g.replied, false);
}

/* Below the 10px slop nothing is decided. */
{
  const g = run(80, [[86, 404]], { direction: "right" });
  assert.equal(g.owner, null);
  assert.equal(g.replyX, 0);
  assert.equal(g.pageX, 0);
}

/* A reply claim drops a still-pending back gesture; a later back move is idle. */
{
  const back = createSwipeBackMachine();
  back.begin({ x: 80, y: 10, t: 0, width: W, zone: "body", canGoBack: true });
  assert.equal(back.state.phase, PHASE.PENDING);
  const reply = createReplySwipe();
  assert.equal(reply.begin({ x: 80, y: 10, direction: "right" }).owner, "pending");
  const drag = reply.move({ x: 100, y: 12 });
  assert.equal(drag.type, "drag");
  if (back.state.phase === PHASE.PENDING) back.reset();
  assert.equal(back.state.phase, PHASE.IDLE);
  assert.equal(back.move({ x: 180, y: 12, t: 40 }).type, "none");
}

/* An edge swipe that already locked is not something reply can start. */
{
  const back = createSwipeBackMachine();
  back.begin({ x: 8, y: 10, t: 0, width: W, zone: "edge", canGoBack: true });
  assert.equal(back.move({ x: 24, y: 12, t: 16 }).type, "lock");
  const drag = back.move({ x: 70, y: 14, t: 32 });
  assert.equal(drag.type, "drag");
  assert.ok(drag.x > 0);
  const reply = createReplySwipe();
  assert.equal(reply.begin({ x: 8, y: 10, direction: "right" }).owner, "edge");
  assert.equal(reply.move({ x: 70, y: 14 }).type, "none");
  assert.equal(reply.end().reply, false);
  assert.ok(back.state.x > 0, "locked edge swipe keeps the page");
}

/* Device-like touch events through the bubble driver. */
function fakeBubble() {
  const listeners = new Map();
  return {
    addEventListener(type, fn, opts) {
      listeners.set(type, { fn, opts });
    },
    removeEventListener(type, fn) {
      if (listeners.get(type)?.fn === fn) listeners.delete(type);
    },
    fire(type, event) {
      listeners.get(type)?.fn(event);
    },
    opts(type) {
      return listeners.get(type)?.opts;
    },
  };
}

function touchEvent(type, clientX, clientY, extra = {}) {
  const identifier = extra.identifier ?? 9;
  const touch = { identifier, clientX, clientY };
  const ended = type === "touchend" || type === "touchcancel";
  return {
    type,
    cancelable: extra.cancelable !== false,
    timeStamp: extra.timeStamp ?? 0,
    target: extra.target || { nodeType: 1, closest: () => null, parentElement: null },
    touches: ended ? [] : [touch],
    changedTouches: [touch],
    prevented: false,
    preventDefault() {
      this.prevented = true;
    },
  };
}

{
  const el = fakeBubble();
  const seen = { claim: 0, haptic: 0, xs: [], reply: 0, cancel: 0 };
  const detach = attachReplySwipe(el, {
    getDirection: () => "right",
    getEdgeWidth: () => 28,
    onClaim: () => { seen.claim += 1; },
    onMove: (x) => seen.xs.push(x),
    onHaptic: () => { seen.haptic += 1; },
    onReply: () => { seen.reply += 1; },
    onCancel: () => { seen.cancel += 1; },
  });
  assert.equal(el.opts("touchstart").passive, true, "start stays passive so the scroll can begin");
  assert.equal(el.opts("touchmove").passive, false, "move can preventDefault after the axis locks");

  const start = touchEvent("touchstart", 120, 500, { timeStamp: 5 });
  el.fire("touchstart", start);
  assert.equal(start.prevented, false);

  const slop = touchEvent("touchmove", 126, 506, { timeStamp: 20 });
  el.fire("touchmove", slop);
  assert.equal(slop.prevented, false, "undecided axis does not cancel the scroll");
  assert.equal(seen.claim, 0);

  const vertical = touchEvent("touchmove", 128, 540, { timeStamp: 40 });
  el.fire("touchmove", vertical);
  assert.equal(vertical.prevented, false, "vertical scroll is left alone");
  assert.equal(seen.cancel, 1);
  assert.deepEqual(seen.xs, []);

  detach();
}

{
  const el = fakeBubble();
  const seen = { claim: 0, haptic: 0, xs: [], reply: 0 };
  attachReplySwipe(el, {
    getDirection: () => "left",
    getEdgeWidth: () => 28,
    onClaim: () => { seen.claim += 1; },
    onMove: (x) => seen.xs.push(x),
    onHaptic: () => { seen.haptic += 1; },
    onReply: () => { seen.reply += 1; },
    onCancel: () => {},
  });
  el.fire("touchstart", touchEvent("touchstart", 300, 480, { identifier: 4, timeStamp: 1 }));
  const otherFinger = touchEvent("touchmove", 240, 480, { identifier: 8, timeStamp: 20 });
  el.fire("touchmove", otherFinger);
  assert.equal(otherFinger.prevented, false, "a different touch id is ignored");
  assert.equal(seen.claim, 0);

  const lock = touchEvent("touchmove", 284, 482, { identifier: 4, timeStamp: 30 });
  el.fire("touchmove", lock);
  assert.equal(lock.prevented, true);
  assert.equal(seen.claim, 1);
  assert.equal(seen.xs[0], -16, "1:1 left, own message");
  assert.equal(seen.haptic, 0);

  const cross = touchEvent("touchmove", 240, 482, { identifier: 4, timeStamp: 50 });
  el.fire("touchmove", cross);
  assert.equal(seen.haptic, 1);
  const again = touchEvent("touchmove", 220, 482, { identifier: 4, timeStamp: 70 });
  el.fire("touchmove", again);
  assert.equal(seen.haptic, 1, "threshold haptic does not repeat");
  el.fire("touchend", touchEvent("touchend", 220, 482, { identifier: 4, timeStamp: 90 }));
  assert.equal(seen.reply, 1);
}

{
  const el = fakeBubble();
  const seen = { claim: 0, reply: 0, xs: [] };
  attachReplySwipe(el, {
    getDirection: () => "right",
    getEdgeWidth: () => 28,
    onClaim: () => { seen.claim += 1; },
    onMove: (x) => seen.xs.push(x),
    onHaptic: () => {},
    onReply: () => { seen.reply += 1; },
    onCancel: () => {},
  });
  for (const x of [0, 12, 22, 24, 28]) {
    el.fire("touchstart", touchEvent("touchstart", x, 100));
    const move = touchEvent("touchmove", x + 80, 102);
    el.fire("touchmove", move);
    assert.equal(move.prevented, false, `edge start ${x} is not a reply`);
    el.fire("touchend", touchEvent("touchend", x + 80, 102));
  }
  assert.equal(seen.claim, 0);
  assert.equal(seen.reply, 0);
  assert.deepEqual(seen.xs, []);
}

{
  const el = fakeBubble();
  let claimed = 0;
  attachReplySwipe(el, {
    getDirection: () => "right",
    shouldIgnore: (target) => Boolean(target?.closest?.("button, a, textarea")),
    onClaim: () => { claimed += 1; },
    onMove: () => {},
    onReply: () => {},
    onCancel: () => {},
  });
  const button = { nodeType: 1, closest: (sel) => (sel.includes("button") ? button : null) };
  el.fire("touchstart", touchEvent("touchstart", 100, 100, { target: button }));
  el.fire("touchmove", touchEvent("touchmove", 160, 100, { target: button }));
  assert.equal(claimed, 0, "presses on buttons stay clicks");
}

/* Wiring: bubble yields the edge, claims by cancelling a pending back only. */
{
  const list = read("../components/chat/MessageList.jsx");
  const hook = read("../hooks/useEdgeSwipeBack.js");
  assert.match(list, /data-no-swipe-back=""/);
  assert.match(list, /getDirection: \(\) => \(replyLive\.current\.isOwn \? "left" : "right"\)/);
  assert.match(list, /drag=\{glass \|\| mediaOnly \? false : "x"\}/);
  assert.match(list, /isOwn \? \{ left: -72, right: 0 \} : \{ left: 0, right: 72 \}/);
  assert.match(list, /cancelSwipeBackIfPending/);
  assert.match(hook, /machine\.state\.phase !== PHASE\.PENDING/);
  assert.match(hook, /export function swipeBackEdgeBand/);
  assert.doesNotMatch(list, /direction: isOwn \? "right" : "left"/);
}

console.log("messageReplySwipe.selftest ok");
