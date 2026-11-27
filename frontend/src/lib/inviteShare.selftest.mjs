// Davet Merkezi helpers: node src/lib/inviteShare.selftest.mjs
import assert from "node:assert/strict";
import {
  normalizeChannel, inviteShortUrl, displayInviteUrl, whatsappShareUrl, landingUsernameFromPath, channelFromSearch,
  countdownParts, stageSegments, milestoneRing, sparkPath, channelBar, filterFriends, friendCounts,
  rememberInviteOpen, peekInviteOpen, clearInviteOpen,
} from "./inviteShare.js";

const mem = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
};
globalThis.localStorage = mem();
globalThis.sessionStorage = mem();

assert.equal(normalizeChannel("WhatsApp"), "wa");
assert.equal(normalizeChannel("cp"), "link");
assert.equal(normalizeChannel("<x>"), null);
assert.equal(inviteShortUrl("ece"), "https://descall.com/r/ece");
assert.equal(inviteShortUrl("ece", "wa"), "https://descall.com/r/ece?k=wa");
assert.equal(inviteShortUrl("ece", "link"), "https://descall.com/r/ece", "plain copy has no tag");
assert.equal(inviteShortUrl("bad name!"), "https://descall.com/register");
assert.equal(displayInviteUrl("ece"), "descall.com/r/ece");
assert.ok(whatsappShareUrl("Gel", "https://descall.com/r/ece?k=wa").startsWith("https://wa.me/?text=Gel%20https%3A%2F%2Fdescall.com%2Fr%2Fece%3Fk%3Dwa"));
assert.equal(landingUsernameFromPath("/r/ece"), "ece");
assert.equal(landingUsernameFromPath("/r/bora.aksoy/"), "bora.aksoy");
assert.equal(landingUsernameFromPath("/r/%3Cscript%3E"), "");
assert.equal(landingUsernameFromPath("/register"), "");
assert.equal(channelFromSearch("?k=tt"), "tt");
assert.equal(channelFromSearch("?k=zz"), "link");

assert.deepEqual(countdownParts(14 * 3600000), { n: 14, unit: "h" });
assert.deepEqual(countdownParts(13.2 * 3600000), { n: 14, unit: "h" }, "rounds up");
assert.deepEqual(countdownParts(35 * 60000), { n: 35, unit: "m" });
assert.deepEqual(countdownParts(60 * 3600000), { n: 3, unit: "d" });
assert.equal(countdownParts(0), null);

assert.deepEqual(stageSegments({ stage: 3, waiting: true, status: "waiting_return" }), ["d", "d", "d", "w"]);
assert.deepEqual(stageSegments({ stage: 2, status: "waiting_message" }), ["d", "d", "", ""]);
assert.deepEqual(stageSegments({ stage: 3, status: "reviewing" }), ["d", "d", "d", ""]);
assert.deepEqual(stageSegments({ stage: 4, status: "paid" }), ["k", "k", "k", "k"]);
assert.deepEqual(stageSegments({ stage: 1 }), ["d", "", "", ""]);
assert.deepEqual(stageSegments({ stage: 2, status: "expired" }), ["x", "x", "", ""]);

const ms = { count: 6, list: [{ at: 3 }, { at: 10 }, { at: 25 }] };
assert.deepEqual(milestoneRing(ms).target, 10);
assert.equal(milestoneRing(ms).pct, 0.6);
assert.equal(milestoneRing({ count: 30, list: ms.list }).done, true);

assert.equal(sparkPath([1]), "");
assert.ok(sparkPath([0, 2, 1], 100, 28).startsWith("M2.0 26.0 L50.0 2.0"));

assert.deepEqual(channelBar([{ channel: "wa", signups: 7 }, { channel: "ig", signups: 3 }, { channel: "tt", signups: 2 }]).map((x) => x.pct), [58, 25, 17]);
assert.deepEqual(channelBar([]), []);

const friends = [{ status: "paid" }, { status: "waiting_return" }, { status: "waiting_message" }, { status: "reviewing" }];
assert.deepEqual(friendCounts(friends), { all: 4, pending: 2, active: 1, review: 1 });
assert.equal(filterFriends(friends, "review").length, 1);

const saved = rememberInviteOpen({ username: "ece", channel: "wa", openId: "abc", now: 1000 });
assert.equal(saved.channel, "wa");
assert.equal(peekInviteOpen(2000).openId, "abc");
assert.equal(peekInviteOpen(1000 + 8 * 24 * 3600000), null, "expires after 7 days");
assert.equal(sessionStorage.getItem("descall:inviteRef"), "ece", "the register flow sees the ref");
clearInviteOpen();
assert.equal(peekInviteOpen(2000), null);

console.log("inviteShare selftest ok");
