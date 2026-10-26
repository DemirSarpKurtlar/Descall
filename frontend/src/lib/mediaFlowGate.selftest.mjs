import assert from "node:assert/strict";
import { createMediaFlowGate, sumAudioCounters } from "./mediaFlowGate.js";

function clock() {
  let t = 0;
  const timers = [];
  return {
    now: () => t,
    setTimer(fn, ms) {
      const id = { fn, at: t + ms };
      timers.push(id);
      return id;
    },
    clearTimer(id) {
      const i = timers.indexOf(id);
      if (i >= 0) timers.splice(i, 1);
    },
    async advance(ms) {
      const end = t + ms;
      for (;;) {
        timers.sort((a, b) => a.at - b.at);
        const next = timers[0];
        if (!next || next.at > end) break;
        timers.shift();
        t = next.at;
        await next.fn();
        await Promise.resolve();
      }
      t = end;
    },
  };
}

function pcWith(fn) {
  return { connectionState: "connected", getStats: async () => new Map(fn().map((s, i) => [String(i), s])) };
}

const out = (n) => ({ type: "outbound-rtp", kind: "audio", packetsSent: n });
const inn = (n) => ({ type: "inbound-rtp", kind: "audio", packetsReceived: n });

// Counter helper ignores video.
{
  const c = sumAudioCounters(new Map([["a", out(5)], ["b", inn(3)], ["v", { type: "outbound-rtp", kind: "video", packetsSent: 900 }]]));
  assert.deepEqual(c, { sent: 5, received: 3, hasOut: true, hasIn: true });
}

// Both directions rising → verified quickly, sending reported.
{
  const c = clock();
  let n = 0;
  const states = [];
  const sending = [];
  const g = createMediaFlowGate({
    getPc: () => pcWith(() => [out((n += 10)), inn(n)]),
    onState: (s) => states.push(s),
    onSending: (v) => sending.push(v),
    ...c,
  });
  g.start();
  await c.advance(600);
  assert.equal(g.state, "verified");
  assert.deepEqual(states, ["connecting", "verified"]);
  assert.deepEqual(sending, [true]);
}

// ICE "connected" but inbound frozen (non-zero!) → stays connecting, recovers at 6 s, retry at 15 s.
{
  const c = clock();
  let n = 0;
  const recovers = [];
  const g = createMediaFlowGate({
    getPc: () => pcWith(() => [out((n += 10)), inn(42)]),
    onRecover: (info) => recovers.push(info),
    ...c,
  });
  g.start();
  await c.advance(5_800);
  assert.equal(g.state, "connecting");
  assert.equal(g.sending, true);
  assert.equal(recovers.length, 0);
  await c.advance(400);
  assert.equal(recovers.length, 1, "one automatic recovery at 6 s");
  assert.equal(recovers[0].in, false);
  await c.advance(8_000);
  assert.equal(recovers.length, 1, "never a second automatic recovery");
  assert.equal(g.state, "connecting");
  await c.advance(1_200);
  assert.equal(g.state, "retry");
  // Manual retry: recovery runs again, clock restarts, audio comes back.
  let flowing = false;
  g.retry();
  assert.equal(recovers.length, 2);
  assert.equal(recovers[1].manual, true);
  assert.equal(g.state, "connecting");
  await c.advance(500);
  assert.equal(g.state, "connecting");
  flowing = true;
  let m = 100;
  const g2pc = pcWith(() => [out((n += 10)), inn(flowing ? (m += 5) : 42)]);
  // swap pc source
  g.stop();
  const g2 = createMediaFlowGate({ getPc: () => g2pc, ...c });
  g2.start();
  await c.advance(600);
  assert.equal(g2.state, "verified");
}

// Outbound frozen (mic blind spot) → never verified, sending false.
{
  const c = clock();
  let n = 0;
  const g = createMediaFlowGate({ getPc: () => pcWith(() => [out(7), inn((n += 10))]), ...c });
  g.start();
  await c.advance(3_000);
  assert.equal(g.state, "connecting");
  assert.equal(g.sending, false);
}

// No outbound audio sender at all → inbound alone verifies.
{
  const c = clock();
  let n = 0;
  const g = createMediaFlowGate({ getPc: () => pcWith(() => [inn((n += 10))]), ...c });
  g.start();
  await c.advance(600);
  assert.equal(g.state, "verified");
}

// stop() halts polling; getStats throwing is tolerated.
{
  const c = clock();
  let calls = 0;
  const g = createMediaFlowGate({
    getPc: () => ({ connectionState: "connected", getStats: async () => { calls += 1; throw new Error("x"); } }),
    ...c,
  });
  g.start();
  await c.advance(1_000);
  const before = calls;
  g.stop();
  await c.advance(2_000);
  assert.equal(calls, before);
  assert.equal(g.state, "idle");
}

console.log("mediaFlowGate.selftest: ok");
