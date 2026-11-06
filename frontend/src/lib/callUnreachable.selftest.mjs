// node src/lib/callUnreachable.selftest.mjs — 3.7.27 (Mac ↔ Windows silent calls):
// a call whose ICE never connects and fails again after restarts says
// "unreachable" (UI: "Bağlantı kurulamadı" + Tekrar dene) instead of silence.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { UNREACHABLE_AFTER_RESTARTS, createCallRecovery } from "./callConnectionMachine.js";

function setup() {
  let t = 0; let seq = 0; const timers = new Map();
  const log = { restarts: 0, statuses: [], lost: 0 };
  const r = createCallRecovery({
    now: () => t,
    setTimer: (fn, ms) => { const id = ++seq; timers.set(id, { at: t + ms, fn }); return id; },
    clearTimer: (id) => timers.delete(id),
    restart: () => { log.restarts += 1; },
    onStatus: (s) => log.statuses.push(s),
    onLost: () => { log.lost += 1; },
  });
  const advance = (ms) => {
    const end = t + ms;
    for (;;) {
      let next = null;
      for (const [id, tm] of timers) if (tm.at <= end && (!next || tm.at < next[1].at)) next = [id, tm];
      if (!next) break;
      timers.delete(next[0]); t = next[1].at; next[1].fn();
    }
    t = end;
  };
  return { r, log, advance };
}
const F = { connectionState: "failed", iceConnectionState: "failed" };
const CHK = { connectionState: "connecting", iceConnectionState: "checking" };
const C = { connectionState: "connected", iceConnectionState: "connected" };

{
  const { r, log, advance } = setup();
  r.update(CHK);
  for (let i = 0; i <= UNREACHABLE_AFTER_RESTARTS; i += 1) {
    r.update(F);
    advance(16000); // the next backoff restart fires
    r.update(CHK);
  }
  r.update(F);
  assert.ok(log.restarts >= UNREACHABLE_AFTER_RESTARTS, "restarts were tried first");
  assert.equal(log.statuses.at(-1), "unreachable");
  r.update(CHK);
  assert.equal(log.statuses.at(-1), "unreachable", "a new checking round keeps the failed face");
  // Tekrar dene
  const before = log.restarts;
  r.retryNow();
  assert.equal(log.statuses.at(-1), "connecting");
  advance(1);
  assert.equal(log.restarts, before + 1, "retry restarts ICE at once");
  r.update(C);
  assert.equal(log.statuses.at(-1), "connected");
}
{
  // One failure on the way (first restart heals it): never "unreachable".
  const { r, log, advance } = setup();
  r.update(CHK); r.update(F); advance(1); r.update(C);
  assert.ok(!log.statuses.includes("unreachable"));
}
{
  // A call that was connected and drops goes "reconnecting", never "unreachable".
  const { r, log, advance } = setup();
  r.update(C);
  for (let i = 0; i < 5; i += 1) { r.update(F); advance(20000); }
  assert.ok(!log.statuses.includes("unreachable"));
}

// Wiring: useCall shows it, CallOverlay renders the Turkish state with retry.
const useCall = readFileSync(new URL("../hooks/useCall.js", import.meta.url), "utf8");
assert.match(useCall, /setConnectFailed\(status === "unreachable"\)/);
assert.match(useCall, /retryConnection/);
const overlay = readFileSync(new URL("../components/CallOverlay.jsx", import.meta.url), "utf8");
assert.match(overlay, /call\?\.connectFailed/);
assert.match(overlay, /call\?\.retryConnection\?\.\(\)/);
const tr = readFileSync(new URL("../i18n/locales/tr.js", import.meta.url), "utf8");
assert.match(tr, /"Couldn't connect\.": "Bağlantı kurulamadı\."/);
assert.match(tr, /"Gürültü engelleme sesini kesiyordu, normal mikrofona geçtik\."/);

{
  // Slow ICE failures: GIVE_UP_MS without ever connecting → "unreachable", not a silent "lost".
  const { r, log, advance } = setup();
  r.update(CHK); r.update(F);
  advance(70_000);
  assert.equal(log.statuses.at(-1), "unreachable");
  assert.equal(log.lost, 0, "no teardown for a call that never connected");
}

console.log("callUnreachable.selftest ok");
