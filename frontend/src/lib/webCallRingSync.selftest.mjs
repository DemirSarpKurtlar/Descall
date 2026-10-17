// Web incoming call stops everywhere when the ring is over: socket
// ring-ended, other tabs (BroadcastChannel), the service worker (Web Push
// after the tab slept), notification close by tag, local timeout.
// Run from frontend/: node src/lib/webCallRingSync.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import {
  INCOMING_RING_TIMEOUT_MS,
  RING_CHANNEL,
  createRingChannel,
  ringEndedNotice,
  ringEventMatches,
} from "./callRingSync.js";

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");

// 1. Which events stop which ring.
const ringing = { mode: "incoming", peerId: "A", callUuid: "U-1" };
assert.ok(ringEventMatches(ringing, { fromUserId: "A", callUuid: "u-1" }), "uuid match is case-insensitive (CallKit upper-cases)");
assert.ok(!ringEventMatches(ringing, { fromUserId: "A", callUuid: "U-2" }), "an older ring's end must not stop a new ring");
assert.ok(ringEventMatches({ mode: "incoming", peerId: "A" }, { fromUserId: "A" }));
assert.ok(!ringEventMatches({ ...ringing, mode: "active" }, { fromUserId: "A", callUuid: "U-1" }), "never ends a connected call");
assert.ok(!ringEventMatches(ringing, { fromUserId: "B" }));
assert.equal(ringEndedNotice("answered_elsewhere"), "Arama başka bir cihazda yanıtlandı.");
assert.equal(ringEndedNotice("declined_elsewhere"), "Arama başka bir cihazda reddedildi.");
assert.ok(INCOMING_RING_TIMEOUT_MS > 45_000 && INCOMING_RING_TIMEOUT_MS <= 60_000, "local guard after the server's 45 s");

// 2. BroadcastChannel between tabs.
{
  const bus = new Map();
  class FakeChannel {
    constructor(name) { this.name = name; (bus.get(name) || bus.set(name, new Set()).get(name)).add(this); }
    postMessage(data) { for (const c of bus.get(this.name)) if (c !== this) c.onmessage?.({ data }); }
    close() { bus.get(this.name).delete(this); }
  }
  const got = [];
  const tabA = createRingChannel(() => {}, { Channel: FakeChannel });
  const tabB = createRingChannel((m) => got.push(m), { Channel: FakeChannel });
  tabA.post("handled", { fromUserId: "A", callUuid: "U-1" });
  assert.equal(got.length, 1);
  assert.equal(got[0].type, "handled");
  assert.equal(got[0].fromUserId, "A");
  tabB.close();
  tabA.post("handled", { fromUserId: "A" });
  assert.equal(got.length, 1);
  assert.equal(RING_CHANNEL, "descall-call-ring");
  const none = createRingChannel(() => {}, { Channel: null });
  none.post("handled", {});
  none.close();
}

// 3. Service worker: call-ring-ended push closes the ringing card, tells
//    open tabs to stop, and leaves a quiet Turkish result card.
{
  const listeners = {};
  const shown = [];
  const closed = [];
  const posted = [];
  const ringingCard = { tag: "call-A", data: { type: "call", fromId: "A" }, close() { closed.push(this.tag); } };
  const otherCall = { tag: "call-B", data: { type: "call", fromId: "B" }, close() { closed.push(this.tag); } };
  const ctx = {
    self: {
      addEventListener: (type, fn) => { listeners[type] = fn; },
      location: { origin: "https://descall.com" },
      registration: {
        getNotifications: async () => [ringingCard, otherCall, ...shown],
        showNotification: async (title, opts) => { shown.push({ title, ...opts, close() { closed.push(`result:${opts.tag}`); } }); },
      },
    },
    clients: { matchAll: async () => [{ focused: false, postMessage: (m) => posted.push(m) }] },
    setTimeout: (fn) => { fn(); return 0; },
    URL,
    console,
  };
  vm.createContext(ctx);
  vm.runInContext(read("../../public/sw.js"), ctx);
  let done;
  listeners.push({
    data: { json: () => ({ type: "call-ring-ended", outcome: "answered_elsewhere", fromId: "A", callUuid: "U-1", tag: "call-A", title: "Ada", body: "Arama başka bir cihazda yanıtlandı." }) },
    waitUntil: (p) => { done = p; },
  });
  await done;
  assert.ok(closed.includes("call-A"), "ringing card closed");
  assert.ok(!closed.includes("call-B"), "another caller's ring is untouched");
  assert.deepEqual(JSON.parse(JSON.stringify(posted[0])), { type: "descall:call-ring-ended", fromUserId: "A", callUuid: "U-1", reason: "answered_elsewhere" });
  assert.equal(shown[0].tag, "call-A", "replacement uses the same tag");
  assert.equal(shown[0].silent, true);
  assert.equal(shown[0].requireInteraction, false);
  assert.ok(closed.includes("result:call-A"), "answered elsewhere result card closes itself");

  // Ringing push: Turkish actions.
  let p2;
  listeners.push({ data: { json: () => ({ type: "call", title: "Ada arıyor", fromId: "A", tag: "call-A" }) }, waitUntil: (p) => { p2 = p; } });
  await p2;
  const ring = shown.at(-1);
  assert.deepEqual(JSON.parse(JSON.stringify(ring.actions.map((a) => a.title))), ["Yanıtla", "Reddet"]);
  assert.equal(ring.requireInteraction, true);
}

// 4. Wiring in the page.
{
  const useCall = read("../hooks/useCall.js");
  assert.match(useCall, /socket\.on\('call:ring-ended', onRingEnded\)/);
  assert.match(useCall, /socket\.emit\("call:ring-status"/);
  assert.match(useCall, /INCOMING_RING_TIMEOUT_MS/);
  assert.match(useCall, /ringChannelRef\.current\?\.post\("handled"/);
  assert.match(useCall, /descall:call-ring-ended/);
  assert.match(useCall, /notificationService\.dismissIncomingCall\(\{ kind: "dm"/);
  assert.match(useCall, /audioManager\.stop\("incomingCall"\)/);
  const webPush = read("../../backend/lib/webPush.js");
  assert.match(webPush, /type: "call-ring-ended"/);
  assert.match(webPush, /tag: payload\.callerId \? `call-\$\{payload\.callerId\}`/);
  const handlers = read("../../backend/socket/handlers.js");
  assert.match(handlers, /tag: `call-\$\{myId\}`/, "the ringing push and the end push share a tag");
}

console.log("webCallRingSync.selftest ok");
