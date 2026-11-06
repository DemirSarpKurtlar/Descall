// DM caller side: the ringback can not loop forever.
// Before: only the server's call:declined (no_answer, 45 s) ended an
// unanswered outgoing ring; when it was lost (backend restart dropped the
// in-memory ring, the caller's socket stayed down) the ringback kept going
// until the caller hung up. The incoming side already had a local guard.
// Run from frontend/: node src/lib/outgoingRingGuard.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
const {
  INCOMING_RING_TIMEOUT_MS,
  OUTGOING_ANSWERING_TIMEOUT_MS,
  OUTGOING_RING_TIMEOUT_MS,
  outgoingRingGuardMs,
} = await import("./callRingSync.js");

// 1. After the server's 45 s, never before it (the server's no_answer wins).
assert.ok(OUTGOING_RING_TIMEOUT_MS > 45_000 && OUTGOING_RING_TIMEOUT_MS <= 60_000);
assert.equal(OUTGOING_RING_TIMEOUT_MS, INCOMING_RING_TIMEOUT_MS, "same margin as the callee guard");
assert.equal(outgoingRingGuardMs(), OUTGOING_RING_TIMEOUT_MS);
assert.equal(outgoingRingGuardMs({ calleeAnswering: false }), OUTGOING_RING_TIMEOUT_MS);

// 2. Callee answered on a locked iPhone and is unlocking: the server keeps that
// ring 120 s, so the caller must not give up at 50 s.
assert.equal(outgoingRingGuardMs({ calleeAnswering: true }), OUTGOING_ANSWERING_TIMEOUT_MS);
assert.ok(OUTGOING_ANSWERING_TIMEOUT_MS > 120_000);

// 3. Wiring: useCall runs the guard while dialing and hangs up like the user would.
const src = readFileSync(new URL("../hooks/useCall.js", import.meta.url), "utf8");
const guard = src.slice(src.indexOf("// Outgoing ring guard"), src.indexOf("// Outgoing ring: after the caller's socket comes back"));
assert.ok(guard.length > 0, "guard effect present");
assert.match(guard, /if \(mode !== "outgoing"\) return undefined;/);
assert.match(guard, /outgoingRingGuardMs\(\{ calleeAnswering \}\)/);
assert.match(guard, /if \(modeRef\.current !== "outgoing"\) return;/, "an answered / ended call is left alone");
assert.match(guard, /endCallRef\.current\?\.\(/, "ends through endCall: call:cancel to the server, ringback stops");
assert.match(guard, /return \(\) => clearTimeout\(timer\)/, "timer cleared when the ring ends");
assert.match(guard, /\}, \[mode, calleeAnswering\]\);/);

console.log("outgoingRingGuard selftest ok");
