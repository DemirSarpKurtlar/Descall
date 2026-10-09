/**
 * Incoming-call desktop notifications must close on every ring outcome,
 * and message notifications must not.
 *
 * Run: node frontend/src/lib/callNotificationClose.selftest.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  DM_INCOMING_TAG,
  beginIncomingShow,
  createIncomingCloseGate,
  incomingShowStillCurrent,
  markIncomingDismissed,
  planIncomingDismiss,
  shouldCloseCallNotification,
} from "./callNotificationClose.js";

const dmShown = [
  { tag: DM_INCOMING_TAG, data: { type: "call", fromId: "alice" } },
  { tag: "call-alice", data: { type: "call", fromId: "alice" } },
  { tag: "call-bob", data: { type: "call", fromId: "bob" } },
  { tag: "dm-alice", data: { type: "dm" } },
  { tag: "mention-1", data: { type: "mention" } },
  { tag: "missed-call-alice", data: { type: "missed-call" } },
  { tag: "group-call-g1", data: { type: "group-call", groupId: "g1" } },
];

const outcomes = ["accepted", "declined", "declined-elsewhere", "cancelled", "ended", "missed", "answered-elsewhere"];
for (const outcome of outcomes) {
  const plan = planIncomingDismiss({ kind: "dm", fromId: "alice", outcome }, dmShown);
  assert.ok(plan.closeTags.includes(DM_INCOMING_TAG), `${outcome} closes the page call tag`);
  assert.ok(plan.closeTags.includes("call-alice"), `${outcome} closes the push tag`);
  assert.deepEqual(
    plan.shownTags.filter((tag) => tag === DM_INCOMING_TAG || tag === "call-alice"),
    [DM_INCOMING_TAG, "call-alice"],
    `${outcome} selects only Alice's call notifications`,
  );
  assert.equal(plan.shownTags.includes("dm-alice"), false, `${outcome} leaves messages`);
  assert.equal(plan.shownTags.includes("mention-1"), false, `${outcome} leaves mentions`);
  assert.equal(plan.shownTags.includes("missed-call-alice"), false, `${outcome} leaves missed-call cards`);
  assert.equal(plan.shownTags.includes("call-bob"), false, `${outcome} leaves a different caller`);
  assert.equal(plan.shownTags.includes("group-call-g1"), false, `${outcome} leaves a group ring`);
}

const groupShown = [
  { tag: "group-call-g1", data: { type: "group-call", groupId: "g1" } },
  { tag: "group-call-Grup", data: { type: "group-call", groupId: "g1" } },
  { tag: "group-call-g2", data: { type: "group-call", groupId: "g2" } },
  { tag: DM_INCOMING_TAG, data: { type: "call", fromId: "alice" } },
  { tag: "group-room", data: { type: "group" } },
];
const groupPlan = planIncomingDismiss(
  { kind: "group", groupId: "g1", groupName: "Squad" },
  groupShown,
);
assert.ok(groupPlan.closeTags.includes("group-call-g1"));
assert.ok(groupPlan.closeTags.includes("group-call-Squad"));
assert.ok(groupPlan.shownTags.includes("group-call-g1"));
assert.ok(groupPlan.shownTags.includes("group-call-Grup"));
assert.equal(groupPlan.shownTags.includes("group-call-g2"), false);
assert.equal(groupPlan.shownTags.includes(DM_INCOMING_TAG), false);
assert.equal(groupPlan.shownTags.includes("group-room"), false);
assert.equal(
  shouldCloseCallNotification(
    { tag: "server-ch", data: { type: "server-message" } },
    groupPlan.query,
  ),
  false,
);

// In-flight show is dropped when that same ring ends before the async show finishes.
const gate = createIncomingCloseGate();
const first = beginIncomingShow(gate, "dm", "alice");
assert.equal(incomingShowStillCurrent(gate, first), true);
markIncomingDismissed(gate, "dm", "alice");
assert.equal(incomingShowStillCurrent(gate, first), false);
const redial = beginIncomingShow(gate, "dm", "alice");
assert.equal(incomingShowStillCurrent(gate, redial), true, "a later ring from the same person still shows");

// Replacing a group ring must not let the old dismiss cancel the new show.
const groups = createIncomingCloseGate();
beginIncomingShow(groups, "group", "g1");
const nextGroup = beginIncomingShow(groups, "group", "g2");
markIncomingDismissed(groups, "group", "g1");
assert.equal(incomingShowStillCurrent(groups, nextGroup), true);
markIncomingDismissed(groups, "group", "g2");
assert.equal(incomingShowStillCurrent(groups, nextGroup), false);

const same = createIncomingCloseGate();
const older = beginIncomingShow(same, "dm", "alice");
const newer = beginIncomingShow(same, "dm", "alice");
markIncomingDismissed(same, "dm", "alice");
assert.equal(incomingShowStillCurrent(same, older), false);
assert.equal(incomingShowStillCurrent(same, newer), false);

// A DM dismiss must not cancel an in-flight group show.
const mixed = createIncomingCloseGate();
const groupTicket = beginIncomingShow(mixed, "group", "g1");
const dmTicket = beginIncomingShow(mixed, "dm", "alice");
markIncomingDismissed(mixed, "dm", "alice");
assert.equal(incomingShowStillCurrent(mixed, dmTicket), false);
assert.equal(incomingShowStillCurrent(mixed, groupTicket), true);

function source(rel) {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

const service = source("./notificationService.js");
assert.match(service, /dismissIncomingCall\(/);
assert.match(service, /_shownByTag/);
assert.match(service, /new Notification\(/);
assert.match(service, /descall:close-call-notifications/);
assert.match(service, /closeNotification/);
assert.doesNotMatch(
  service.slice(service.indexOf("async dm("), service.indexOf("async incomingCall(")),
  /dismissIncomingCall/,
  "message helpers do not dismiss call notifications",
);

const calls = source("../hooks/useCall.js");
assert.match(calls, /dismissIncomingCall\(\{ kind: "dm"/);
assert.match(calls, /call:answered-elsewhere/);
assert.match(calls, /call:declined-elsewhere/);
assert.match(calls, /socket\.off\("call:answered-elsewhere"/);
assert.match(calls, /socket\.off\("call:declined-elsewhere"/);

const groupsHook = source("../hooks/useGroupCall.js");
assert.match(groupsHook, /dismissIncomingCall\(\{[\s\S]*kind: "group"/);
assert.match(groupsHook, /group:call:answered-elsewhere/);
assert.match(groupsHook, /group:call:declined-elsewhere/);
assert.match(groupsHook, /incomingCallRef\.current\?\.groupId === groupId/);

const sw = source("../../public/sw.js");
assert.match(sw, /descall:close-call-notifications/);
assert.match(sw, /getNotifications\(/);
assert.match(sw, /notification\.close\(\)/);
assert.match(sw, /requireInteraction: isCall/);

const electronMain = source("../../electron/main.cjs");
assert.match(electronMain, /notification:close/);
assert.match(electronMain, /closeShownNotification/);

const preload = source("../../electron/preload.cjs");
assert.match(preload, /closeNotification:/);

const groupServer = source("../../backend/socket/groupHandlers.js");
assert.match(groupServer, /group:call:answered-elsewhere/);
assert.match(groupServer, /group:call:declined-elsewhere/);

console.log("callNotificationClose.selftest: ok");
