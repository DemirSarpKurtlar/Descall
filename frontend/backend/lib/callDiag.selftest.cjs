"use strict";
// node lib/callDiag.selftest.cjs — ring log sanitising, failure detection, error_logs rows.
const assert = require("assert");
const diag = require("./callDiag");

// ringRef: last 6 hex of the random ring UUID only.
assert.strictEqual(diag.ringRef("3F2504E0-4F89-11D3-9A0C-0305E82C3301"), "2c3301");
assert.strictEqual(diag.ringRef(""), "");
assert.strictEqual(diag.ringRef("abc"), "");

// Only whitelisted fields; ids / names / tokens never reach the log line.
const clean = diag.sanitizeRingFields({
  ev: "voip",
  ref: "2c3301",
  callerId: "8129c1b4-5daf-4d34-a42c-a7faa120c3f1",
  callerName: "Ayşe",
  token: "a".repeat(64),
  sent: 1.6,
  callerIce: 0,
  reason: "BadDeviceToken",
  skipped: false,
  status: "Bad Value With Spaces",
});
assert.deepStrictEqual(Object.keys(clean).sort(), ["callerIce", "ev", "reason", "ref", "sent", "skipped"].sort());
assert.strictEqual(clean.sent, 2);
assert.strictEqual(clean.reason, "baddevicetoken");
const lines = [];
diag.logRing("offer", { ref: "abcdef", earlyIce: 3, callerId: "x" }, { log: (...a) => lines.push(a.join(" ")) });
assert.ok(/^\[CallRing\] \{"ev":"offer","ref":"abcdef","earlyIce":3\}$/.test(lines[0]), lines[0]);

// Failure detection: the 27 Nov 2026 native line is a failure, a normal call is not.
const nativeFail = { answerSent: 2479, ice: 1412, socket: 1514, offer: 1788, answered: 2374, answerReady: 1813, audioSession: 2732, ended: 33318, kind: "dm", direction: "incoming", callType: "voice", result: "connect-timeout", platform: "ios-app", path: "native", push: "voip", entry: "callkit", turn: true };
assert.strictEqual(diag.isSetupFailure(nativeFail), true);
const jsCallerFail = { gum: 1224, offerSent: 2667, answerRecv: 11987, kind: "dm", direction: "outgoing", callType: "voice", result: "timeout", platform: "ios-app", path: "js", push: "none", entry: "tap" };
assert.strictEqual(diag.isSetupFailure(jsCallerFail), true, "JS timeout without ICE");
assert.strictEqual(diag.isSetupFailure({ ...jsCallerFail, ice: 5000 }), false, "connected but quiet is not a setup failure");
assert.strictEqual(diag.isSetupFailure({ kind: "dm", result: "done", ice: 300 }), false);
assert.strictEqual(diag.isSetupFailure({ kind: "dm", result: "ended" }), false, "hung up while ringing");
assert.strictEqual(diag.isSetupFailure({ kind: "group", result: "connect-timeout" }), false);
assert.strictEqual(diag.isSetupFailure({ kind: "dm", result: "closed", iceFailed: 9000 }), true);
assert.ok(/ICE never connected/.test(diag.failureMessage(nativeFail)));
assert.strictEqual(diag.errorPlatform(nativeFail), "iphone-app");
assert.strictEqual(diag.errorPlatform({ platform: "electron" }), "windows-app");

(async () => {
  const inserts = [];
  let t = 1_000_000;
  const db = { from: (table) => ({ insert: (row) => ({ select: async () => { inserts.push({ table, row }); return { data: [{ id: "1" }], error: null }; } }) }) };
  const rec = diag.createCallSetupFailureRecorder({ getDb: () => db, now: () => t, log: { warn() {} } });
  assert.strictEqual(await rec.record(nativeFail), true);
  assert.strictEqual(await rec.record(nativeFail), false, "throttled");
  assert.strictEqual(await rec.record({ kind: "dm", result: "done", ice: 1 }), false, "not a failure");
  t += diag.THROTTLE_MS + 1;
  assert.strictEqual(await rec.record(nativeFail), true, "after the throttle window");
  assert.strictEqual(inserts.length, 2);
  const row = inserts[0].row;
  assert.strictEqual(inserts[0].table, "error_logs");
  assert.strictEqual(row.severity, "warning");
  assert.strictEqual(row.source, "call");
  assert.strictEqual(row.user_id, "system");
  assert.strictEqual(row.platform, "iphone-app");
  assert.ok(row.fingerprint && row.fingerprint.length === 20);
  assert.ok(!/[0-9a-f]{8}-[0-9a-f]{4}/.test(row.message + row.stack), "no uuids in the row");
  // Missing columns fallback (older schema).
  const db2 = { calls: 0, from() { const self = this; return { insert: () => ({ select: async () => (++self.calls === 1 ? { error: { message: "column fingerprint does not exist" } } : { data: [{ id: "2" }], error: null }) }) }; } };
  const rec2 = diag.createCallSetupFailureRecorder({ getDb: () => db2, now: () => 9_000_000, log: { warn() {} } });
  assert.strictEqual(await rec2.record(jsCallerFail), true);
  assert.strictEqual(db2.calls, 2);
  console.log("callDiag.selftest ok");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
