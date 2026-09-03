/**
 * Run: node frontend/src/components/dimaai/pendingActions.selftest.mjs
 */
import { actionFingerprint, collapsePendingActions, mergePendingActionLists } from "./pendingActions.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const a = {
  id: "1",
  type: "dm",
  status: "pending",
  preview: { body: "sa", recipient: { username: "yigit" } },
};
const b = {
  id: "2",
  type: "dm",
  status: "confirmed",
  preview: { body: "sa", recipient: { username: "yigit" } },
};

assert(actionFingerprint(a) === actionFingerprint(b), "same recipient+body must share a fingerprint");
const collapsed = collapsePendingActions([a, b]);
assert(collapsed.length === 1, "duplicate cards must collapse to one");
assert(collapsed[0].id === "2", "confirmed copy must win over pending");

const merged = mergePendingActionLists(
  [{ id: "1", status: "pending", preview: a.preview }],
  [{ id: "1", status: "confirmed", preview: a.preview }],
);
assert(merged[0].status === "confirmed", "local confirmed must not be overwritten by stale pending");

console.log("pendingActions.selftest.mjs: ok");
