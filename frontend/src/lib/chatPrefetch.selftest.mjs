// node src/lib/chatPrefetch.selftest.mjs
import assert from "node:assert/strict";
import { planStartupPrefetch, startupPrefetchLimits } from "./chatPrefetch.js";

const dms = [1, 2, 3, 4, 5].map((id) => ({ id: `d${id}` }));
const groups = [1, 2, 3, 4, 5].map((id) => ({ id: `g${id}` }));
const servers = [1, 2, 3].map((id) => ({ id: `s${id}`, channels: [{ id: `c${id}`, type: "text" }] }));

// No navigator.connection (WebKit, Node): defaults, same plan as before.
assert.deepEqual(startupPrefetchLimits(null), { dmLimit: 4, groupLimit: 4, channelLimit: 2 });
assert.deepEqual(startupPrefetchLimits({ effectiveType: "4g", saveData: false }), { dmLimit: 4, groupLimit: 4, channelLimit: 2 });
const full = planStartupPrefetch({ dms, groups, servers, ...startupPrefetchLimits(null) });
assert.equal(full.dmIds.length, 4);
assert.equal(full.groupIds.length, 4);
assert.equal(full.channels.length, 2);

// Data Saver / 2G: only the first chat.
for (const c of [{ saveData: true, effectiveType: "4g" }, { effectiveType: "2g" }, { effectiveType: "slow-2g" }]) {
  const plan = planStartupPrefetch({ dms, groups, servers, ...startupPrefetchLimits(c) });
  assert.deepEqual(plan.dmIds, ["d1"]);
  assert.deepEqual(plan.groupIds, []);
  assert.deepEqual(plan.channels, []);
}

// 3G: fewer.
const slow = planStartupPrefetch({ dms, groups, servers, ...startupPrefetchLimits({ effectiveType: "3g" }) });
assert.equal(slow.dmIds.length, 2);
assert.equal(slow.groupIds.length, 2);
assert.equal(slow.channels.length, 0);

console.log("chatPrefetch selftest ok");
