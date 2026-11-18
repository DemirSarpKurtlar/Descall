// node src/lib/serverDisconnectRevive.selftest.mjs
import assert from "node:assert/strict";
import { installServerDisconnectRevive, reviveDelayMs, REVIVE_MAX_MS, REVIVE_JITTER_MS } from "./serverDisconnectRevive.js";

function fakeSocket() {
  const h = {};
  const s = {
    connected: true,
    active: true,
    connects: 0,
    on(ev, fn) { (h[ev] ||= []).push(fn); },
    off(ev, fn) { h[ev] = (h[ev] || []).filter((f) => f !== fn); },
    emit(ev, ...a) { for (const f of h[ev] || []) f(...a); },
    connect() { s.connects += 1; s.active = true; },
    drop(reason) { s.connected = false; s.active = reason !== "io server disconnect" && reason !== "io client disconnect"; s.emit("disconnect", reason); },
    up() { s.connected = true; s.active = true; s.emit("connect"); },
  };
  return s;
}
function clock() {
  let t = 0;
  const timers = [];
  return {
    now: () => t,
    setTimeout: (fn, ms) => { const id = { fn, at: t + ms }; timers.push(id); return id; },
    clearTimeout: (id) => { const i = timers.indexOf(id); if (i >= 0) timers.splice(i, 1); },
    advance(ms) { t += ms; for (const x of [...timers].sort((a, b) => a.at - b.at)) if (x.at <= t) { timers.splice(timers.indexOf(x), 1); x.fn(); } },
    pending: () => timers.length,
  };
}

// Delay: grows, capped, jittered.
assert.equal(reviveDelayMs(0, () => 0), 1500);
assert.equal(reviveDelayMs(1, () => 0), 3000);
assert.equal(reviveDelayMs(20, () => 0), REVIVE_MAX_MS);
assert.equal(reviveDelayMs(0, () => 1), 1500 + REVIVE_JITTER_MS);

// Server drain: reconnects once after the delay.
{
  const c = clock();
  const s = fakeSocket();
  installServerDisconnectRevive(s, { now: c.now, setTimeout: c.setTimeout, clearTimeout: c.clearTimeout, rand: () => 0, log() {} });
  s.drop("io server disconnect");
  c.advance(1499);
  assert.equal(s.connects, 0, "not before the delay");
  c.advance(1);
  assert.equal(s.connects, 1, "reconnects after an io server disconnect");
}

// Our own disconnect (logout, transport swap) and transport drops are left alone.
{
  const c = clock();
  const s = fakeSocket();
  installServerDisconnectRevive(s, { now: c.now, setTimeout: c.setTimeout, clearTimeout: c.clearTimeout, rand: () => 0, log() {} });
  s.drop("io client disconnect");
  s.up();
  s.drop("transport close");
  c.advance(60_000);
  assert.equal(s.connects, 0);
  assert.equal(c.pending(), 0);
}

// No token (logout / maintenance cleared it): stays down.
{
  const c = clock();
  const s = fakeSocket();
  installServerDisconnectRevive(s, { canRevive: () => false, now: c.now, setTimeout: c.setTimeout, clearTimeout: c.clearTimeout, rand: () => 0, log() {} });
  s.drop("io server disconnect");
  c.advance(60_000);
  assert.equal(s.connects, 0);
}

// A server that kicks right away backs off; a stable connection resets it.
{
  const c = clock();
  const s = fakeSocket();
  installServerDisconnectRevive(s, { now: c.now, setTimeout: c.setTimeout, clearTimeout: c.clearTimeout, rand: () => 0, log() {} });
  s.drop("io server disconnect"); c.advance(1500); s.up();
  s.drop("io server disconnect"); c.advance(2999); assert.equal(s.connects, 1, "second try waits 3 s");
  c.advance(1); assert.equal(s.connects, 2);
  s.up(); c.advance(31_000);
  s.drop("io server disconnect"); c.advance(1500); assert.equal(s.connects, 3, "backoff reset after a stable connection");
}

// Dispose cancels a pending revive.
{
  const c = clock();
  const s = fakeSocket();
  const r = installServerDisconnectRevive(s, { now: c.now, setTimeout: c.setTimeout, clearTimeout: c.clearTimeout, rand: () => 0, log() {} });
  s.drop("io server disconnect");
  r.dispose();
  c.advance(60_000);
  assert.equal(s.connects, 0);
}

console.log("serverDisconnectRevive selftest: ok");
