// Selftest: optimistic reactions — add, rollback, duplicate broadcast, timeout.
import assert from "node:assert/strict";

const timers = [];
globalThis.setTimeout = (fn, ms) => { const h = { fn, ms, dead: false }; timers.push(h); return h; };
globalThis.clearTimeout = (h) => { if (h) h.dead = true; };
const runTimers = () => { while (timers.length) { const h = timers.shift(); if (!h.dead) h.fn(); } };

const m = await import("./reactionsOptimistic.js");
const { applyPending, reactionsReducer, toggleReaction, pendingFor, __resetReactionsStore } = m;

const ME = "u-me";
const OTHER = "u-other";

// ── reducer ────────────────────────────────────────────────────────────────
{
  let s = {};
  s = reactionsReducer(s, { type: "begin", messageId: "m1", emoji: "❤️", op: "add", reqId: "a" });
  assert.deepEqual(s, { m1: { "❤️": { op: "add", reqId: "a" } } });
  // a stale settle (older request) does not drop a newer tap
  assert.equal(reactionsReducer(s, { type: "settle", messageId: "m1", emoji: "❤️", reqId: "old" }), s);
  // an echo for the opposite op does not confirm
  assert.equal(reactionsReducer(s, { type: "echo", messageId: "m1", emoji: "❤️", removed: true }), s);
  // matching echo confirms (drops the overlay)
  assert.deepEqual(reactionsReducer(s, { type: "echo", messageId: "m1", emoji: "❤️", removed: false }), {});
  // settle = rollback
  assert.deepEqual(reactionsReducer(s, { type: "settle", messageId: "m1", emoji: "❤️", reqId: "a" }), {});
}

// ── applyPending ───────────────────────────────────────────────────────────
{
  const base = [{ emoji: "👍", userId: OTHER }];
  const add = applyPending(base, { "❤️": { op: "add" } }, ME, "m1");
  assert.equal(add.length, 2);
  assert.equal(add[1].emoji, "❤️");
  // duplicate: server echo already in base → no second row
  const both = applyPending([...base, { emoji: "❤️", userId: ME }], { "❤️": { op: "add" } }, ME, "m1");
  assert.equal(both.filter((r) => r.emoji === "❤️").length, 1);
  // remove hides only my row
  const rm = applyPending([{ emoji: "❤️", userId: ME }, { emoji: "❤️", userId: OTHER }], { "❤️": { op: "remove" } }, ME);
  assert.deepEqual(rm, [{ emoji: "❤️", userId: OTHER }]);
  // nothing pending → same reference (cheap re-render)
  assert.equal(applyPending(base, null, ME), base);
}

// ── store: ack ok ──────────────────────────────────────────────────────────
function fakeSocket({ ack = (cb) => cb({ ok: true }), connected = true } = {}) {
  const on = {};
  const emitted = [];
  return {
    connected,
    emitted,
    on(ev, fn) { (on[ev] ||= []).push(fn); },
    emit(ev, payload, cb) { emitted.push({ ev, payload }); ack(cb, payload, ev); },
    fire(ev, p) { (on[ev] || []).forEach((f) => f(p)); },
  };
}
const args = (extra) => ({ messageId: "m1", conversationType: "dm", conversationId: "u-other", emoji: "❤️", userId: ME, baseReactions: [], ...extra });

{
  __resetReactionsStore();
  let held;
  const sock = fakeSocket({ ack: (cb) => { held = cb; } });
  let failed = 0;
  const op = toggleReaction(args({ socket: sock, onFail: () => { failed += 1; } }));
  assert.equal(op, "add");
  assert.equal(sock.emitted[0].ev, "reaction:add");
  assert.ok(sock.emitted[0].payload.clientReqId, "carries clientReqId");
  // shown immediately (optimistic)
  assert.equal(applyPending([], pendingFor("m1"), ME, "m1").length, 1);
  held({ ok: true });
  assert.equal(pendingFor("m1"), null);
  runTimers();
  assert.equal(failed, 0, "ack ok never toasts");
}

// ── store: ack rejected → rollback + onFail ────────────────────────────────
{
  __resetReactionsStore();
  const sock = fakeSocket({ ack: (cb) => cb({ ok: false, error: "blocked" }) });
  let failedOp = null;
  toggleReaction(args({ socket: sock, onFail: (o) => { failedOp = o; } }));
  assert.equal(pendingFor("m1"), null, "rolled back");
  assert.equal(failedOp, "add");
}

// ── store: toggle off (remove) when mine exists ────────────────────────────
{
  __resetReactionsStore();
  const sock = fakeSocket();
  const op = toggleReaction(args({ socket: sock, baseReactions: [{ emoji: "❤️", userId: ME }] }));
  assert.equal(op, "remove");
  assert.equal(sock.emitted[0].ev, "reaction:remove");
}

// ── store: timeout with no ack (old server) but echo arrived → no toast ────
{
  __resetReactionsStore();
  const sock = fakeSocket({ ack: () => {} });
  let failed = 0;
  toggleReaction(args({ socket: sock, onFail: () => { failed += 1; } }));
  sock.fire("reaction:update", { messageId: "m1", emoji: "❤️", userId: ME, removed: false });
  assert.equal(pendingFor("m1"), null, "echo confirmed");
  runTimers();
  assert.equal(failed, 0);
}

// ── store: timeout with no ack and no echo → rollback + toast ──────────────
{
  __resetReactionsStore();
  const sock = fakeSocket({ ack: () => {} });
  let failed = 0;
  toggleReaction(args({ socket: sock, onFail: () => { failed += 1; } }));
  // someone else's broadcast for the same emoji must not confirm mine
  sock.fire("reaction:update", { messageId: "m1", emoji: "❤️", userId: OTHER, removed: false });
  assert.ok(pendingFor("m1"));
  runTimers();
  assert.equal(pendingFor("m1"), null);
  assert.equal(failed, 1);
}

// ── store: offline socket → rollback + toast ───────────────────────────────
{
  __resetReactionsStore();
  const sock = fakeSocket({ connected: false });
  let failed = 0;
  toggleReaction(args({ socket: sock, onFail: () => { failed += 1; } }));
  assert.ok(pendingFor("m1"), "tap lands first");
  assert.equal(sock.emitted.length, 0);
  runTimers();
  assert.equal(pendingFor("m1"), null);
  assert.equal(failed, 1);
}

// ── store: double tap twice fast = add then remove; stale ack ignored ──────
{
  __resetReactionsStore();
  const acks = [];
  const sock = fakeSocket({ ack: (cb) => acks.push(cb) });
  let failed = 0;
  assert.equal(toggleReaction(args({ socket: sock, onFail: () => { failed += 1; } })), "add");
  assert.equal(toggleReaction(args({ socket: sock, onFail: () => { failed += 1; } })), "remove");
  acks[0]({ ok: false }); // stale request: must not roll back the newer tap or toast
  assert.equal(pendingFor("m1")["❤️"].op, "remove");
  assert.equal(failed, 0);
  acks[1]({ ok: true });
  assert.equal(pendingFor("m1"), null);
}

// temp ids never emit
{
  __resetReactionsStore();
  const sock = fakeSocket();
  assert.equal(toggleReaction(args({ socket: sock, messageId: "temp-1" })), null);
  assert.equal(sock.emitted.length, 0);
}

console.log("reactionsOptimistic selftest: ok");
