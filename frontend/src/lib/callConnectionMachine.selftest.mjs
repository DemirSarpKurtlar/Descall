// Reconnect state machine: ICE restart with backoff (no teardown), restart
// held across socket loss, network-change restart, glare avoidance,
// give-up only after a long outage, debounced UI status.
// Run from frontend/: node src/lib/callConnectionMachine.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  BACKOFF_MS,
  DISCONNECTED_GRACE_MS,
  GIVE_UP_MS,
  GIVE_UP_PEER_OFFLINE_MS,
  POLITE_EXTRA_MS,
  createCallRecovery,
  createStatusDebouncer,
  deriveLinkState,
} from "./callConnectionMachine.js";

function fakeClock() {
  let t = 0;
  let seq = 0;
  const timers = new Map();
  return {
    now: () => t,
    setTimer: (fn, ms) => { const id = ++seq; timers.set(id, { at: t + ms, fn }); return id; },
    clearTimer: (id) => timers.delete(id),
    advance(ms) {
      const end = t + ms;
      for (;;) {
        let next = null;
        for (const [id, tm] of timers) if (tm.at <= end && (!next || tm.at < next[1].at)) next = [id, tm];
        if (!next) break;
        timers.delete(next[0]);
        t = next[1].at;
        next[1].fn();
      }
      t = end;
    },
  };
}

function machine(opts = {}) {
  const clock = fakeClock();
  const log = { restarts: [], statuses: [], lost: 0 };
  const r = createCallRecovery({
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    restart: (info) => log.restarts.push({ at: clock.now(), ...info }),
    onStatus: (s) => log.statuses.push(s),
    onLost: () => { log.lost += 1; },
    ...opts,
  });
  return { r, clock, log };
}
const C = { connectionState: "connected", iceConnectionState: "connected" };
const D = { connectionState: "disconnected", iceConnectionState: "disconnected" };
const F = { connectionState: "failed", iceConnectionState: "failed" };

// deriveLinkState merges both pc states.
assert.equal(deriveLinkState(C), "connected");
assert.equal(deriveLinkState({ connectionState: "connected", iceConnectionState: "disconnected" }), "connected");
assert.equal(deriveLinkState({ connectionState: "connecting", iceConnectionState: "checking" }), "connecting");
assert.equal(deriveLinkState({ iceConnectionState: "completed" }), "connected");
assert.equal(deriveLinkState(F), "failed");
assert.equal(deriveLinkState({ connectionState: "closed" }), "closed");

// 1. A short blip heals itself inside the grace: no restart, no "lost".
{
  const { r, clock, log } = machine();
  r.update(C);
  r.update(D);
  assert.equal(log.statuses.at(-1), "reconnecting");
  clock.advance(DISCONNECTED_GRACE_MS - 100);
  r.update(C);
  clock.advance(120_000);
  assert.equal(log.restarts.length, 0);
  assert.equal(log.lost, 0);
  assert.equal(log.statuses.at(-1), "connected");
}

// 2. Disconnected stays → restarts with exponential backoff, never a teardown.
{
  const { r, clock, log } = machine();
  r.update(C);
  r.update(D);
  clock.advance(DISCONNECTED_GRACE_MS);
  assert.equal(log.restarts.length, 1);
  clock.advance(BACKOFF_MS[0]);
  assert.equal(log.restarts.length, 2);
  clock.advance(BACKOFF_MS[1]);
  assert.equal(log.restarts.length, 3);
  const gaps = log.restarts.slice(1).map((x, i) => x.at - log.restarts[i].at);
  assert.deepEqual(gaps, [BACKOFF_MS[0], BACKOFF_MS[1]]);
  r.update(C);
  assert.equal(log.statuses.at(-1), "connected");
  const n = log.restarts.length;
  clock.advance(60_000);
  assert.equal(log.restarts.length, n, "no restarts once healthy");
}

// 3. "failed" restarts immediately.
{
  const { r, clock, log } = machine();
  r.update(C);
  r.update(F);
  clock.advance(0);
  assert.equal(log.restarts.length, 1);
}

// 4. Socket down when a restart comes due → held, sent on reconnect.
{
  const { r, clock, log } = machine();
  r.update(C);
  r.socketChanged(false);
  r.update(D);
  clock.advance(DISCONNECTED_GRACE_MS + 5000);
  assert.equal(log.restarts.length, 0, "an offer cannot travel without signaling");
  assert.equal(r._state().pendingRestart, true);
  r.socketChanged(true);
  assert.equal(log.restarts.length, 1, "sent the moment the socket is back");
}

// 5. Network change restarts at once, even while ICE still says connected.
{
  const { r, clock, log } = machine();
  r.update(C);
  r.networkChanged();
  clock.advance(0);
  assert.equal(log.restarts.length, 1);
  assert.equal(log.restarts[0].forced, true);
  clock.advance(60_000);
  assert.equal(log.restarts.length, 1, "no backoff loop while healthy");
  assert.equal(log.lost, 0);
}

// 6. Glare: the polite side waits longer, so the impolite side offers first.
{
  const a = machine({ polite: false });
  const b = machine({ polite: true });
  for (const m of [a, b]) { m.r.update(C); m.r.update(D); }
  a.clock.advance(DISCONNECTED_GRACE_MS);
  b.clock.advance(DISCONNECTED_GRACE_MS);
  assert.equal(a.log.restarts.length, 1);
  assert.equal(b.log.restarts.length, 0);
  b.clock.advance(POLITE_EXTRA_MS);
  assert.equal(b.log.restarts.length, 1);
}

// 7. Give up only after a long outage; sooner when the peer's sockets are gone.
{
  const { r, clock, log } = machine();
  r.update(C);
  r.update(D);
  clock.advance(GIVE_UP_MS - 1);
  assert.equal(log.lost, 0);
  clock.advance(2);
  assert.equal(log.lost, 1);
  assert.equal(log.statuses.at(-1), "lost");
}
{
  const { r, clock, log } = machine();
  r.update(C);
  r.update(D);
  r.setPeerOnline(false);
  clock.advance(GIVE_UP_PEER_OFFLINE_MS + 1);
  assert.equal(log.lost, 1);
}
{
  // Socket loss alone (pc healthy) never ends the call.
  const { r, clock, log } = machine();
  r.update(C);
  r.socketChanged(false);
  r.setPeerOnline(false);
  clock.advance(10 * 60_000);
  assert.equal(log.lost, 0);
  assert.equal(log.statuses.at(-1), "connected");
}

// 8. Before the first connect the face is "connecting", not "reconnecting".
{
  const { r, log } = machine();
  r.update({ connectionState: "connecting", iceConnectionState: "checking" });
  r.update(D);
  assert.ok(!log.statuses.includes("reconnecting"));
}

// 9. Debounced status: a 300 ms blip never shows "Yeniden bağlanıyor…".
{
  const d = createStatusDebouncer({ enterMs: 700, exitMs: 500, initial: "connected" });
  assert.equal(d.push("reconnecting", 0), "connected");
  assert.equal(d.push("connected", 300), "connected");
  assert.equal(d.push("reconnecting", 1000), "connected");
  assert.equal(d.tick(1700), "reconnecting");
  assert.equal(d.push("connected", 2000), "reconnecting", "stays until stable");
  assert.equal(d.tick(2400), "reconnecting");
  assert.equal(d.tick(2500), "connected");
  assert.equal(d.pendingMs(2500), null);
}

// 10. useCall / useGroupCall drive it (no leftover one-shot recovery).
{
  const useCall = readFileSync(new URL("../hooks/useCall.js", import.meta.url), "utf8");
  assert.match(useCall, /createCallRecovery\(/);
  assert.match(useCall, /recoveryRef\.current\?\.socketChanged\(true\)/);
  assert.match(useCall, /recoveryRef\.current\?\.socketChanged\(false\)/);
  assert.match(useCall, /recoveryRef\.current\?\.networkChanged\(\)/);
  assert.match(useCall, /call:peer-presence/);
  assert.match(useCall, /type: "rollback"/, "a stale offer is rolled back before a restart");
  assert.doesNotMatch(useCall, /attemptIceRecovery/);
  const group = readFileSync(new URL("../hooks/useGroupCall.js", import.meta.url), "utf8");
  assert.match(group, /createCallRecovery\(/);
  assert.doesNotMatch(group, /schedulePeerCleanup\(6000\)/, "a group peer is not removed after 6 s of trouble");
  const server = readFileSync(new URL("../../backend/server.js", import.meta.url), "utf8");
  assert.match(server, /pingInterval:\s*12000/);
  assert.match(server, /pingTimeout:\s*10000/);
}

console.log("callConnectionMachine.selftest ok");
