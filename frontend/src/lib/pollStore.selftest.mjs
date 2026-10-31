// Run: node frontend/src/lib/pollStore.selftest.mjs
import assert from "node:assert/strict";
import {
  setPollSnapshot, getPollSnapshot, subscribePoll, ensurePoll, bindPollSocket, votePoll,
  pollTimeLeft, pollEndedAt, __resetPollStore,
} from "./pollStore.js";
import { isLegacyPollText, parseLegacyPoll } from "./legacyPoll.js";
import { loadI18nCatalogs } from "../i18n/index.js";
import { setRuntimeLocale } from "../i18n/runtime.js";

await loadI18nCatalogs("tr");
setRuntimeLocale("tr");

// Time left in the UI language (Intl unit names, so Turkish short units carry a dot).
const now = Date.UTC(2026, 9, 18, 12, 0, 0);
assert.equal(pollTimeLeft(new Date(now + 42 * 60000).toISOString(), now), "42 dk. kaldı");
assert.equal(pollTimeLeft(new Date(now + 18 * 3600000).toISOString(), now), "18 sa. kaldı");
assert.equal(pollTimeLeft(new Date(now + 3 * 86400000).toISOString(), now), "3 gün kaldı");
assert.equal(pollTimeLeft(new Date(now - 1000).toISOString(), now), "Sona erdi");
assert.match(pollEndedAt({ closedAt: "2026-10-18T20:54:00Z" }), /18 Eki 23:54/);
setRuntimeLocale("en");
assert.equal(pollTimeLeft(new Date(now + 3 * 86400000).toISOString(), now), "3 days left");
assert.equal(pollTimeLeft(new Date(now + 42 * 60000).toISOString(), now), "42 mins left");
assert.equal(pollTimeLeft(new Date(now - 1000).toISOString(), now), "Ended");
setRuntimeLocale("tr");
assert.match(pollEndedAt({ closedAt: "2026-10-18T20:54:00Z" }, "en"), /18 Oct 23:54/);

// A neutral broadcast snapshot never overrides the viewer-specific one.
__resetPollStore();
let seen = 0;
const off = subscribePoll("m1", () => (seen += 1));
setPollSnapshot({ messageId: "m1", id: "p1", version: 2, revealed: true, myVotes: ["o1"], viewerSpecific: true });
setPollSnapshot({ messageId: "m1", id: "p1", version: 2, revealed: false, myVotes: [] });
assert.equal(getPollSnapshot("m1").revealed, true);
assert.ok(seen >= 1);
off();

// poll:get is batched and the ack result is stored as viewer-specific.
__resetPollStore();
const emits = [];
const handlers = {};
const fakeSocket = {
  connected: true,
  on: (ev, fn) => (handlers[ev] = fn),
  off: () => {},
  emit: (ev, payload, ack) => {
    emits.push({ ev, payload });
    if (ev === "poll:get") ack?.({ ok: true, polls: payload.messageIds.map((id) => ({ messageId: id, id: `p-${id}`, version: 1, revealed: false, myVotes: [] })) });
    if (ev === "poll:vote") ack?.({ ok: true, poll: { messageId: "a", id: "p-a", version: 2, revealed: true, myVotes: payload.optionIds } });
  },
};
bindPollSocket(fakeSocket);
ensurePoll("server", "a");
ensurePoll("server", "b");
await new Promise((r) => setTimeout(r, 80));
const gets = emits.filter((e) => e.ev === "poll:get");
assert.equal(gets.length, 1, "one batched poll:get");
assert.deepEqual(gets[0].payload.messageIds.sort(), ["a", "b"]);
const res = await votePoll(getPollSnapshot("a") || { id: "p-a" }, ["o2"]);
assert.equal(res.ok, true);
assert.equal(getPollSnapshot("a").revealed, true);
assert.deepEqual(getPollSnapshot("a").myVotes, ["o2"]);
assert.equal(typeof handlers["poll:changed"], "function");

// Legacy text polls render read-only.
assert.equal(isLegacyPollText("**Poll: Pizza mı?**\n1. Evet"), true);
assert.equal(isLegacyPollText("📊 Anket: Pizza mı?"), false);
assert.deepEqual(parseLegacyPoll("**Poll: Pizza \\*mı\\*?**\n1. Evet\n2. Hayır"), { question: "Pizza *mı*?", options: ["Evet", "Hayır"] });

console.log("pollStore selftest ok");
