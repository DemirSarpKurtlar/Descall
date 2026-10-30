"use strict";

// node backend/lib/errorGroups.selftest.cjs
// Hata Kayıtları (3.7.0): the same bug groups together across support codes,
// releases and minified names; platforms from the user agent; regressions.
const assert = require("assert");
const eg = require("./errorGroups");

const S1 = "@https://descall.com/assets/App-BfP4awCc.js:121:208734\nfl@https://descall.com/assets/vendor-react-DXWwXfUl.js:40:24324";
const S2 = "@https://descall.com/assets/App-BVFZRQIq.js:121:198193\nfl@https://descall.com/assets/vendor-react-DXWwXfUl.js:40:24324";
const M = (code) => `[${code}] undefined is not an object (evaluating 'navigator.mediaDevices.addEventListener')`;

assert.strictEqual(eg.fingerprint(M("693A8ADF"), S1), eg.fingerprint(M("5BA17601"), S2), "support code and bundle hash ignored");
assert.strictEqual(eg.fingerprint("[1822490B] Cannot access 'L' before initialization", ""), eg.fingerprint("[D0B4FD6D] Cannot access 'O' before initialization", ""), "minified names ignored");
assert.notStrictEqual(eg.fingerprint("TypeError: a is undefined", S1), eg.fingerprint("TypeError: b is null", S1));
assert.strictEqual(eg.topFrame(S1), "App.js");
assert.strictEqual(eg.topFrame("    at useCall (https://x/assets/App-AbCdEf12.js:1:2)\n    at r (https://x/assets/vendor-react-x1y2z3a4.js:1:2)"), "App.js:useCall");
assert.strictEqual(eg.normalizeMessage("Failed to load 12 items from https://a.b/c?d=1 for 3f2a9c1e-1111-4111-8111-111111111111"), "Failed to load <n> items from <url> for <id>");
assert.strictEqual(eg.titleOf("[ABCDEF12] Boom\nmore"), "Boom");
console.log("ok - fingerprints");

const SAF = "Mozilla/5.0 (iPhone; CPU iPhone OS 27_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.2 Mobile/15E148 Safari/604.1";
const APP = "Mozilla/5.0 (iPhone; CPU iPhone OS 27_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";
assert.strictEqual(eg.platformOf(SAF), "iphone-web");
assert.strictEqual(eg.platformOf(APP), "iphone-app");
assert.strictEqual(eg.platformOf("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Electron/38.0 Safari/537.36"), "windows-app");
assert.strictEqual(eg.platformOf("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36"), "desktop-web");
assert.strictEqual(eg.platformOf("Mozilla/5.0 (Linux; Android 15; wv) AppleWebKit/537.36"), "android-app");
assert.strictEqual(eg.platformOf("", "server"), "server");
console.log("ok - platforms");

const now = Date.parse("2026-10-31T12:00:00Z");
const rows = [
  { id: "a", message: M("11111111"), stack: S1, user_agent: APP, user_id: "u1", timestamp: "2026-10-31T11:00:00Z", severity: "high" },
  { id: "b", message: M("22222222"), stack: S2, user_agent: SAF, user_id: "u2", timestamp: "2026-10-30T11:00:00Z" },
  { id: "c", message: M("33333333"), stack: S2, user_agent: SAF, user_id: "anonymous", timestamp: "2026-10-25T11:00:00Z" },
  { id: "d", message: "[44444444] Other crash", stack: "", user_agent: APP, user_id: "u1", timestamp: "2026-10-29T11:00:00Z" },
];
let groups = eg.groupRows(rows, new Map(), { now, range: "7d" });
assert.strictEqual(groups.length, 2);
const g = groups.find((x) => x.count === 3);
assert.strictEqual(g.users, 2, "anonymous not counted, u1 + u2");
assert.deepStrictEqual(g.platforms, { "iphone-app": 1, "iphone-web": 2 });
assert.strictEqual(g.sampleId, "a", "newest event is the sample");
assert.strictEqual(g.trend.length, 7);
assert.strictEqual(g.trend.reduce((s, v) => s + v, 0), 3);
assert.strictEqual(g.isNew, false, "first seen 6 days ago");
assert.strictEqual(eg.sortGroups(groups, "count")[0].fingerprint, g.fingerprint);
console.log("ok - grouping");

const states = new Map([[g.fingerprint, { status: "resolved", resolved_at: "2026-10-31T00:00:00Z" }]]);
groups = eg.groupRows(rows, states, { now, range: "7d" });
const r = groups.find((x) => x.fingerprint === g.fingerprint);
assert.strictEqual(r.status, "open", "came back after it was resolved");
assert.strictEqual(r.regressed, true);
const quiet = eg.groupRows(rows.slice(1), new Map([[g.fingerprint, { status: "resolved", resolved_at: "2026-10-31T00:00:00Z" }]]), { now, range: "7d" });
assert.strictEqual(quiet.find((x) => x.fingerprint === g.fingerprint).status, "resolved", "no new event → stays resolved");
const ign = eg.groupRows(rows, new Map([[g.fingerprint, { status: "ignored" }]]), { now });
assert.strictEqual(ign.find((x) => x.fingerprint === g.fingerprint).status, "ignored");
console.log("ok - status and regressions\nerrorGroups.selftest: ok");
