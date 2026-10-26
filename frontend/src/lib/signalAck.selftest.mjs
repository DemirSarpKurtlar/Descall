import assert from "node:assert/strict";
import { emitWithAck } from "./signalAck.js";

function clock() {
  let timers = [];
  return {
    setTimer(fn, ms) { const t = { fn, ms }; timers.push(t); return t; },
    clearTimer(t) { timers = timers.filter((x) => x !== t); },
    fire() { const list = timers; timers = []; list.forEach((t) => t.fn()); },
    get pending() { return timers.length; },
  };
}

function sock({ ackOn = Infinity } = {}) {
  const sent = [];
  return {
    connected: true,
    sent,
    emit(event, payload, ack) {
      sent.push({ event, payload });
      if (sent.length >= ackOn) ack?.({ ok: true });
    },
  };
}

// Acked at once → one send, no retry timer left.
{
  const c = clock();
  const s = sock({ ackOn: 1 });
  const h = emitWithAck(() => s, "call:offer", { toUserId: "x" }, c);
  assert.equal(s.sent.length, 1);
  assert.equal(h.acked, true);
  assert.equal(c.pending, 0);
}

// Lost twice → re-sent every 3 s until acked.
{
  const c = clock();
  const s = sock({ ackOn: 3 });
  const h = emitWithAck(() => s, "call:answer", { toUserId: "x", answer: {} }, c);
  assert.equal(s.sent.length, 1);
  c.fire();
  assert.equal(s.sent.length, 2);
  c.fire();
  assert.equal(s.sent.length, 3);
  assert.equal(h.acked, true);
  c.fire();
  assert.equal(s.sent.length, 3, "no send after the ack");
  assert.deepEqual(s.sent[2].payload, s.sent[0].payload, "same payload re-sent");
}

// Never acked (old backend) → gives up after maxTries.
{
  const c = clock();
  const s = sock();
  let gaveUp = 0;
  emitWithAck(() => s, "call:end", { toUserId: "x" }, { ...c, onGiveUp: () => { gaveUp += 1; } });
  for (let i = 0; i < 6; i += 1) c.fire();
  assert.equal(s.sent.length, 3);
  assert.equal(gaveUp, 1);
}

// Socket down → waits (no send counted) and sends once it is back.
{
  const c = clock();
  const s = sock({ ackOn: 1 });
  s.connected = false;
  const h = emitWithAck(() => s, "call:offer", {}, c);
  assert.equal(s.sent.length, 0);
  c.fire();
  assert.equal(s.sent.length, 0);
  s.connected = true;
  c.fire();
  assert.equal(s.sent.length, 1);
  assert.equal(h.acked, true);
}

// shouldRetry false (call already over) stops the re-send; cancel() too.
{
  const c = clock();
  const s = sock();
  let live = true;
  emitWithAck(() => s, "call:offer", {}, { ...c, shouldRetry: () => live });
  live = false;
  c.fire();
  assert.equal(s.sent.length, 1);
  const s2 = sock();
  const h = emitWithAck(() => s2, "call:offer", {}, c);
  h.cancel();
  c.fire();
  assert.equal(s2.sent.length, 1);
}

console.log("signalAck.selftest: ok");
