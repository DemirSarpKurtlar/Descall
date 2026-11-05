import assert from "node:assert/strict";
import {
  mergeIncomingDmMessage,
  mergeIncomingChatMessage,
  shouldAcceptLiveMessage,
} from "./liveMessageMerge.js";

const me = "user-alice";

// Same-user other device (iOS → Electron): no matching tempId → still append
{
  const cur = [{ id: "old-1", from: { id: "bob" }, text: "hi" }];
  const fromIos = {
    id: "real-99",
    from: { id: me },
    text: "from my phone",
    client: "ios",
    platform: "ios",
    // tempId from the phone; Electron never had that optimistic row
    tempId: "temp-phone-1",
  };
  const next = mergeIncomingDmMessage(cur, fromIos, me);
  assert.equal(next.length, 2);
  assert.equal(next[1].id, "real-99");
  assert.equal(next[1].text, "from my phone");
}

// Sending socket: tempId replaces optimistic row
{
  const cur = [
    { id: "temp-1", from: { id: me }, text: "draft", sending: true },
  ];
  const echo = {
    id: "real-1",
    from: { id: me },
    text: "draft",
    tempId: "temp-1",
  };
  const next = mergeIncomingDmMessage(cur, echo, me);
  assert.equal(next.length, 1);
  assert.equal(next[0].id, "real-1");
  assert.equal(next[0].sending, false);
}

// Missing / unknown client still accepted
for (const tag of [undefined, null, "ios", "electron", "web", "android", "wat"]) {
  const msg = { id: `m-${tag}`, from: { id: "x" }, text: "x", client: tag, platform: tag };
  assert.equal(shouldAcceptLiveMessage(msg), true, `accept client=${tag}`);
  const next = mergeIncomingDmMessage([], msg, me);
  assert.equal(next.length, 1);
}

// Dedup by real id
{
  const cur = [{ id: "m1", text: "a" }];
  const next = mergeIncomingDmMessage(cur, { id: "m1", text: "a" }, me);
  assert.equal(next, cur);
}

// Group/channel: other-device path (no temp match) appends
{
  const cur = [];
  const next = mergeIncomingChatMessage(
    cur,
    { id: "gm1", from: { id: me }, text: "grup" },
    undefined
  );
  assert.equal(next.length, 1);
  assert.equal(next[0].id, "gm1");
}

// Reject empty
assert.equal(shouldAcceptLiveMessage(null), false);
assert.equal(shouldAcceptLiveMessage({}), false);

console.log("liveMessageMerge.selftest: ok");
