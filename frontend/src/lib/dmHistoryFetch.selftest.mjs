// Run: node frontend/src/lib/dmHistoryFetch.selftest.mjs
import assert from "node:assert/strict";
import { createPrefetchQueue, planStartupPrefetch, requestChatPrefetch, setChatPrefetchHandler } from "./chatPrefetch.js";
import { shouldPullDmHistory } from "./dmHistoryFetch.js";

assert.equal(shouldPullDmHistory("dm:history", false), true);
assert.equal(shouldPullDmHistory("dm:history", true), false);
assert.equal(shouldPullDmHistory("dm:set_active", false), false);
assert.equal(shouldPullDmHistory("dm:set_active", true), false);

const plan = planStartupPrefetch({
  dms: [{ id: "d1" }, { id: "d2" }, { id: "d3" }, { id: "d4" }, { id: "d5" }],
  groups: [{ id: "g1" }, { id: "g2" }],
  servers: [
    { id: "s1", channels: [{ id: "voice", type: "voice" }, { id: "text-1", type: "text" }] },
    { id: "s2", channels: [{ id: "text-2", type: "text" }] },
    { id: "s3", channels: [{ id: "text-3", type: "text" }] },
  ],
});
assert.deepEqual(plan.dmIds, ["d1", "d2", "d3", "d4"]);
assert.deepEqual(plan.groupIds, ["g1", "g2"]);
assert.deepEqual(plan.channels, [
  { serverId: "s1", channelId: "text-1" },
  { serverId: "s2", channelId: "text-2" },
]);

const queue = createPrefetchQueue(2);
let active = 0;
let max = 0;
const jobs = [];
for (let i = 0; i < 6; i += 1) {
  queue.enqueue(`k${i}`, () => new Promise((resolve) => {
    active += 1;
    max = Math.max(max, active);
    jobs.push(active);
    setTimeout(() => {
      active -= 1;
      resolve();
    }, 20);
  }));
}
assert.equal(queue.enqueue("k0", () => {}), false);
await new Promise((resolve) => setTimeout(resolve, 120));
assert.equal(max, 2);

const seen = [];
const stop = setChatPrefetchHandler((kind, id) => seen.push(`${kind}:${id}`));
requestChatPrefetch("dm", "d1");
requestChatPrefetch("group", "");
stop();
requestChatPrefetch("dm", "d2");
assert.deepEqual(seen, ["dm:d1"]);

console.log("dmHistoryFetch.selftest: ok");
