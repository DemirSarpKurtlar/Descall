"use strict";

/**
 * 3D world rules: gate, call authorization, snapshot validation, rate limits, rooms.
 * Run: node frontend/backend/lib/world3d/worldCore.selftest.cjs
 */

const assert = require("assert");
const W = require("./worldCore");

// Gate: admins only (phase 1), desktop only.
assert.deepStrictEqual(W.canUseWorld({ isAdmin: true, app: "electron" }), { ok: true });
assert.deepStrictEqual(W.canUseWorld({ isAdmin: true, app: "web" }), { ok: true });
assert.strictEqual(W.canUseWorld({ isAdmin: false, app: "web" }).reason, "flag");
assert.strictEqual(W.canUseWorld({ isAdmin: true, app: "ios" }).reason, "platform");
assert.strictEqual(W.canUseWorld({ isAdmin: true, app: "android" }).reason, "platform");
assert.strictEqual(W.canUseWorld({ isAdmin: false, app: "ios", publicEnabled: true }).reason, "platform");
assert.deepStrictEqual(W.canUseWorld({ isAdmin: false, app: "web", publicEnabled: true }), { ok: true });
assert.strictEqual(W.isAdminRow({ is_admin: true }), true);
assert.strictEqual(W.isAdminRow({ username: "admin" }), true);
assert.strictEqual(W.isAdminRow({ is_admin: false, username: "bob" }, { username: "bob" }), false);
assert.strictEqual(W.isAdminRow(null, { username: "admin" }), true);

// Authorization: only participants of the live call.
const activeGroupCalls = new Map([["g1", { participants: new Set(["alice", "bob"]) }]]);
const activeServerVoiceCalls = new Map([["c1", { participants: new Map([["alice", {}]]) }]]);
const ctx = { activeGroupCalls, activeServerVoiceCalls };
assert.deepStrictEqual(W.authorizeWorldJoin({ ...ctx, kind: "group", id: "g1", userId: "bob" }), { ok: true, key: "world:group:g1" });
assert.strictEqual(W.authorizeWorldJoin({ ...ctx, kind: "group", id: "g1", userId: "eve" }).reason, "not_in_call");
assert.strictEqual(W.authorizeWorldJoin({ ...ctx, kind: "group", id: "g2", userId: "alice" }).reason, "not_in_call");
assert.deepStrictEqual(W.authorizeWorldJoin({ ...ctx, kind: "voice", id: "c1", userId: "alice" }), { ok: true, key: "world:voice:c1" });
assert.strictEqual(W.authorizeWorldJoin({ ...ctx, kind: "voice", id: "c1", userId: "bob" }).reason, "not_in_call");
assert.strictEqual(W.authorizeWorldJoin({ ...ctx, kind: "dm", id: "c1", userId: "alice" }).reason, "kind");
assert.strictEqual(W.authorizeWorldJoin({ ...ctx, kind: "voice", id: "../x", userId: "alice" }).reason, "bad_request");
assert.strictEqual(W.authorizeWorldJoin({ ...ctx, kind: "voice", id: "c1", userId: null }).reason, "bad_request");

// Snapshot validation.
assert.strictEqual(W.sanitizeSnapshot(null), null);
assert.strictEqual(W.sanitizeSnapshot([1, 2]), null);
assert.strictEqual(W.sanitizeSnapshot([0, 0, 0, 0, 99, 0, 0, -1]), null, "unknown state");
assert.strictEqual(W.sanitizeSnapshot(new Array(40).fill(0)), null, "oversized");
const s = W.sanitizeSnapshot([1.23456, 0, -2.5, 7, 1, 77, 999, 200]);
assert.deepStrictEqual(s, [1.23, 0, -2.5, 0.717, 1, 0, 255, -1], "yaw 7 rad wraps to 7 - 2PI");
assert.ok(s[3] > -Math.PI && s[3] <= Math.PI);
const far = W.sanitizeSnapshot([1e9, -1e9, NaN, 0, 0, 0, 0, -1]);
assert.deepStrictEqual(far.slice(0, 3), [30, -1, 0]);
// Teleport is pulled back to max speed * dt + slack.
const prev = { snap: [0, 0, 0, 0, 0, 0, 0, -1], at: 1000 };
const jumped = W.sanitizeSnapshot([20, 0, 0, 0, 1, 0, 0, -1], prev, 1100);
const maxStep = W.MAX_SPEED_MPS * 0.1 + 1.6;
assert.ok(Math.abs(jumped[0] - maxStep) < 0.02, `teleport clamp ${jumped[0]}`);
const walked = W.sanitizeSnapshot([0.12, 0, 0, 0, 1, 0, 0, -1], prev, 1100);
assert.strictEqual(walked[0], 0.12);

// Rate limiter.
let clock = 0;
const lim = W.createRateLimiter({ ratePerSec: 10, burst: 3, now: () => clock });
assert.ok(lim.take() && lim.take() && lim.take());
assert.strictEqual(lim.take(), false);
clock += 100;
assert.strictEqual(lim.take(), true);
assert.strictEqual(lim.take(), false);

// Chat cleaning.
assert.strictEqual(W.cleanChat("  hi\n\nthere\u0007 "), "hi there");
assert.strictEqual(W.cleanChat(""), "");
assert.strictEqual(W.cleanChat("x".repeat(500)).length, W.CHAT_MAX_LEN);

// Rooms: join, cap at 16, replace own socket, flush only changed, leave cleans up.
const rooms = new W.WorldRooms({ maxAvatars: 3, now: () => clock });
const key = W.roomKey("voice", "c1");
assert.ok(rooms.join(key, { kind: "voice", id: "c1", userId: "a", socketId: "s1" }).ok);
assert.ok(rooms.join(key, { kind: "voice", id: "c1", userId: "b", socketId: "s2" }).ok);
assert.ok(rooms.join(key, { kind: "voice", id: "c1", userId: "c", socketId: "s3" }).ok);
assert.strictEqual(rooms.join(key, { kind: "voice", id: "c1", userId: "d", socketId: "s4" }).reason, "full");
const again = rooms.join(key, { kind: "voice", id: "c1", userId: "a", socketId: "s9" });
assert.ok(again.ok && again.replaced === "s1", "same user in a new window replaces the old socket");
assert.strictEqual(rooms.leave(key, "a", "s1"), false, "stale socket cannot remove the new one");
assert.deepStrictEqual(rooms.flush(key), []);
clock += 100;
rooms.update(key, "b", [1, 0, 1, 0, 1, 0, 0, -1]);
assert.strictEqual(rooms.update(key, "zz", [1, 0, 1, 0, 1, 0, 0, -1]), null, "non-member snapshot ignored");
assert.deepStrictEqual(rooms.flush(key), [["b", 1, 0, 1, 0, 1, 0, 0, -1]]);
assert.deepStrictEqual(rooms.flush(key), [], "flush clears dirty set");
assert.strictEqual(rooms.roster(key).length, 3);
assert.ok(rooms.leave(key, "a", "s9"));
assert.ok(rooms.leave(key, "b"));
assert.ok(rooms.leave(key, "c"));
assert.strictEqual(rooms.room(key), null, "empty room is dropped");
assert.strictEqual(new W.WorldRooms().maxAvatars, 16);

console.log("worldCore.selftest: ok");
