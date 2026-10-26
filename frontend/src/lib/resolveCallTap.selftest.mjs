import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  resolveCallTap,
  isCallTap,
  notificationTapAction,
  DM_RING_WINDOW_MS,
  GROUP_CALL_FRESH_MS,
} from "./callTap.js";

const here = dirname(fileURLToPath(import.meta.url));
const NOW = 1_800_000_000_000;
const UUID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const dmPush = { type: "call", callKind: "dm", fromId: "u1", callUuid: UUID, callType: "voice", startedAt: String(NOW - 5_000), action: "call-tap" };
const groupPush = { type: "group-call", callKind: "group", groupId: "g1", groupName: "Ekip", callType: "video", startedAt: NOW - 30_000, action: "call-tap" };

// ── DM ──
assert.equal(isCallTap(dmPush), true);
assert.equal(isCallTap({ ...dmPush, action: "answer" }), false, "buttons are not body taps");
assert.equal(resolveCallTap({ data: dmPush, now: NOW, dm: { mode: "incoming", peerId: "u1", callUuid: UUID } }).action, "accept", "ringing here → connect directly");
assert.equal(resolveCallTap({ data: dmPush, now: NOW, dm: { mode: "incoming", peerId: "u1" } }).action, "accept");
assert.equal(
  resolveCallTap({ data: dmPush, now: NOW, dm: { mode: "incoming", peerId: "u1", callUuid: "bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee" } }).action,
  "await-ring",
  "a different ring from the same caller is not accepted blindly"
);
assert.equal(resolveCallTap({ data: dmPush, now: NOW, dm: { mode: "active", peerId: "u1" } }).action, "open-call");
assert.equal(resolveCallTap({ data: dmPush, now: NOW, dm: { mode: "incoming", peerId: "u2" } }).action, "await-ring", "another caller ringing");
assert.equal(resolveCallTap({ data: dmPush, now: NOW, dm: {} }).action, "await-ring", "cold start waits for the offer");
const old = resolveCallTap({ data: { ...dmPush, startedAt: NOW - DM_RING_WINDOW_MS - 1 }, now: NOW, dm: {} });
assert.equal(old.action, "ended", "old ring → 'Arama sona erdi' + 'Geri ara'");
assert.equal(old.peerId, "u1");
assert.equal(old.callType, "voice");
assert.equal(resolveCallTap({ data: { ...dmPush, startedAt: undefined }, now: NOW, dm: {} }).action, "await-ring", "no startedAt (old backend) → ask the server");
assert.equal(resolveCallTap({ data: { type: "call", action: "call-tap", conversationId: "u9" }, now: NOW }).peerId, "u9");
assert.equal(resolveCallTap({ data: { type: "call", action: "call-tap" }, now: NOW }).action, "none");

// ── group: never auto-joins ──
assert.equal(resolveCallTap({ data: groupPush, now: NOW, groupBanner: { groupId: "g1" } }).action, "group-join");
assert.equal(resolveCallTap({ data: groupPush, now: NOW, groupIncoming: { groupId: "g1" } }).source, "incoming");
assert.equal(resolveCallTap({ data: groupPush, now: NOW, groupBanner: { groupId: "g2" } }).action, "group-await");
assert.equal(resolveCallTap({ data: { ...groupPush, startedAt: NOW - GROUP_CALL_FRESH_MS - 1 }, now: NOW }).action, "group-ended");
for (const r of [
  resolveCallTap({ data: groupPush, now: NOW, groupBanner: { groupId: "g1" } }),
  resolveCallTap({ data: groupPush, now: NOW }),
]) {
  assert.notEqual(r.action, "accept");
  assert.notEqual(r.action, "join");
}
assert.equal(resolveCallTap({ data: { type: "dm", action: "call-tap" }, now: NOW }).action, "none");

// ── tap action mapping (nativePush + service worker) ──
assert.equal(notificationTapAction({ actionId: "tap", data: dmPush, ios: true }), "call-tap");
assert.equal(notificationTapAction({ actionId: "tap", data: { type: "call", action: "answer" } }), "call-tap", "payload's default 'answer' no longer accepts a body tap");
assert.equal(notificationTapAction({ actionId: "answer", data: dmPush }), "answer");
assert.equal(notificationTapAction({ actionId: "JOIN", data: groupPush }), "answer");
assert.equal(notificationTapAction({ actionId: "DECLINE", data: dmPush }), "decline");
assert.equal(notificationTapAction({ actionId: "tap", data: { type: "dm" }, ios: true }), "open");
assert.equal(notificationTapAction({ actionId: "tap", data: { type: "dm", action: "reply" } }), "reply");

// ── wiring (source) ──
const native = readFileSync(join(here, "nativePush.js"), "utf8");
assert.ok(native.includes("notificationTapAction({ actionId: event?.actionId, data, ios: IS_IOS })"));
assert.ok(native.includes('action: "received"'), "foreground call push never accepts");
const sw = readFileSync(join(here, "../../public/sw.js"), "utf8");
assert.ok(sw.includes('isCallPush ? "call-tap"'));
const app = readFileSync(join(here, "../App.jsx"), "utf8");
assert.ok(app.includes("if (isCallTap(data)) {"));
assert.ok(app.includes("resolveCallTap({"));

// ── push payloads carry callUuid / callKind / startedAt (no names added) ──
const require = createRequire(import.meta.url);
process.env.SUPABASE_URL ||= "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "placeholder-key";
const ios = require("../../backend/lib/iosAlertPush.js");
const dm = ios.describeEvent({ type: "call", fromId: "u1", fromName: "Ayşe", callType: "voice", callUuid: UUID.toUpperCase(), startedAt: NOW }, "tr");
assert.equal(dm.data.callUuid, UUID);
assert.equal(dm.data.callKind, "dm");
assert.equal(dm.data.startedAt, NOW);
const grp = ios.describeEvent({ type: "group-call", groupId: "g1", groupName: "Ekip", fromName: "Ayşe", callType: "video", callUuid: "not-a-uuid", startedAt: NOW }, "tr");
assert.equal(grp.data.callKind, "group");
assert.equal(grp.data.callUuid, undefined, "invalid ids are dropped");
assert.equal(grp.data.startedAt, NOW);
const handlers = readFileSync(join(here, "../../backend/socket/handlers.js"), "utf8");
assert.ok(/callKind: "dm",\s*startedAt: Date\.now\(\)/.test(handlers));
const groupHandlers = readFileSync(join(here, "../../backend/socket/groupHandlers.js"), "utf8");
assert.ok(groupHandlers.includes('callKind: "group"') && groupHandlers.includes("startedAt: groupCallStartedAt"));

console.log("resolveCallTap.selftest: ok");
