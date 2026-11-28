import assert from "node:assert/strict";
import { inviteBoardView, compactCount } from "./inviteBoard.js";

// Before the dashboard loads: rules fallback, zeros, not loaded.
const empty = inviteBoardView(null);
assert.equal(empty.loaded, false);
assert.deepEqual([empty.a, empty.b, empty.active, empty.earned, empty.pendingCount], [100, 50, 0, 0, 0]);
assert.equal(empty.nextLeft, null);

// Live rules win over the old hard-coded 100 / 50.
const data = {
  rules: { inviterReward: 120, inviteeReward: 60 },
  totals: { earned: 360, pending: 120 },
  milestones: { count: 3, next: 5, list: [{ at: 1, reached: true }, { at: 3, reached: true }, { at: 5, reached: false }, { at: 10, reached: false }] },
  wallet: [{ id: "w1" }],
  paused: false,
  notices: [{ id: "n1" }, { id: "n2" }],
};
const v = inviteBoardView(data);
assert.deepEqual([v.a, v.b, v.active, v.earned, v.pendingCount, v.pendingCoins, v.unread], [120, 60, 3, 360, 1, 120, 2]);
assert.equal(v.nextLeft, 2);
assert.equal(v.progress, 0, "progress counts from the last reached milestone (3) to the next (5)");
assert.equal(inviteBoardView({ ...data, milestones: { ...data.milestones, count: 4 } }).progress, 0.5);
assert.equal(v.allDone, false);

// Every milestone reached.
const done = inviteBoardView({ ...data, milestones: { count: 12, next: null, list: [{ at: 10, reached: true }] } });
assert.equal(done.allDone, true);
assert.equal(done.nextLeft, null);
assert.equal(inviteBoardView({ paused: true }).paused, true);

assert.equal(compactCount(950), "950");
assert.ok(/1[,.]2/.test(compactCount(1200, "en")), compactCount(1200, "en"));
assert.equal(compactCount(-5), "0");
console.log("inviteBoard.selftest: ok");
