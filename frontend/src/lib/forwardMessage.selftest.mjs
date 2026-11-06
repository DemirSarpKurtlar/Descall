// Selftest: forwarding (messaging phase 4).
//   node frontend/src/lib/forwardMessage.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  canForward, forwardPayload, forwardEmit, planForward, runForwardPlan, forwardTargets, isForwardedMessage,
  FORWARD_MAX_TARGETS,
} from "./forwardMessage.js";

const text = { id: "m1", text: "Bu akşam 9'da", from: { id: "u2" }, reactions: [{ emoji: "x" }], replyTo: { id: "m0", text: "eski" } };
const photo = { id: "m2", text: "", mediaUrl: "dsmedia://chat/a.jpg", mediaType: "image", mimeType: "image/jpeg", size: 1200, originalName: "a.jpg" };
const voice = { id: "m3", text: "", mediaUrl: "dsmedia://chat/v.webm", mediaType: "voice", duration: 7 };

// What can be forwarded.
assert.equal(canForward(text), true);
assert.equal(canForward(photo), true);
assert.equal(canForward(voice), true);
assert.equal(canForward({ ...text, id: "temp-1" }), false, "an unsent optimistic row");
assert.equal(canForward({ ...text, type: "call_summary" }), false);
assert.equal(canForward({ ...text, poll: { id: "p" } }), false);
assert.equal(canForward({ ...text, mediaType: "poll_v2" }), false);
assert.equal(canForward({ ...text, isGameMessage: true }), false);
assert.equal(canForward({ id: "m9", text: "  " }), false, "nothing to copy");

// Only the content is copied: never reactions, the quote or the author.
assert.deepEqual(forwardPayload(text), { text: "Bu akşam 9'da" });
assert.deepEqual(forwardPayload(photo), { text: "", mediaUrl: "dsmedia://chat/a.jpg", mediaType: "image", mimeType: "image/jpeg", size: 1200, originalName: "a.jpg" });

// One emit per target kind, always forwarded: true.
let [ev, data] = forwardEmit({ kind: "dm", id: "u3" }, forwardPayload(text), "t1");
assert.equal(ev, "dm:send");
assert.deepEqual(data, { toUserId: "u3", tempId: "t1", text: "Bu akşam 9'da", forwarded: true });
[ev, data] = forwardEmit({ kind: "group", id: "g1" }, forwardPayload(photo), "t2");
assert.equal(ev, "group:message");
assert.equal(data.forwarded, true);
assert.equal(data.mediaUrl, "dsmedia://chat/a.jpg");
[ev, data] = forwardEmit({ kind: "channel", id: "c1", serverId: "s1" }, forwardPayload(voice), "t3");
assert.equal(ev, "server:channel:message");
assert.equal(data.content, "__voice__:7", "voice notes keep the duration marker");
assert.equal(data.mediaType, "voice");
assert.equal(data.serverId, "s1");

// A plan: forward then the note, per target, capped at five targets.
let n = 0;
const ids = () => `id${(n += 1)}`;
const targets = Array.from({ length: 7 }, (_, i) => ({ kind: "dm", id: `u${i}` }));
const plan = planForward(targets, text, "  bak  ", ids);
assert.equal(plan.length, FORWARD_MAX_TARGETS * 2);
assert.equal(plan[0][1].forwarded, true);
assert.equal(plan[1][1].text, "bak");
assert.ok(!("forwarded" in plan[1][1]), "the note is a normal message");
assert.equal(planForward([{ kind: "dm", id: "u1" }], text, "", ids).length, 1, "no note, no second send");

// Sends are spaced out (DM rate limit) and in order.
const sent = [];
const waits = [];
const count = await runForwardPlan((e, d) => sent.push([e, d.tempId]), plan.slice(0, 3), { stagger: 260, wait: async (ms) => { waits.push(ms); } });
assert.equal(count, 3);
assert.deepEqual(sent.map((s) => s[1]), plan.slice(0, 3).map((p) => p[1].tempId));
assert.deepEqual(waits, [260, 260]);

// Targets: search across people, groups and channels (Turkish folding), removed groups hidden.
const fold = (s) => String(s || "").toLocaleLowerCase("tr");
const all = forwardTargets({
  friends: [{ id: "u1", username: "ayse", displayName: "Ayşe" }, { id: "u2", username: "mert", displayName: "Mert" }],
  groups: [{ id: "g1", name: "Hafta Sonu Ekibi" }, { id: "g2", name: "Eski", removed: true }],
  channels: [{ id: "c1", name: "genel", serverId: "s1", serverName: "Oyun Gecesi" }],
  fold,
});
assert.deepEqual(all.map((r) => r.key), ["dm:u1", "dm:u2", "group:g1", "channel:c1"]);
assert.deepEqual(forwardTargets({ friends: [{ id: "u1", username: "ayse", displayName: "Ayşe" }], query: "AYŞ", fold }).map((r) => r.key), ["dm:u1"]);

// Bubbles: the mark is a label, never a quote.
assert.equal(isForwardedMessage({ replyTo: { forwarded: true } }), true);
assert.equal(isForwardedMessage({ reply_to: { forwarded: true } }), true);
assert.equal(isForwardedMessage({ replyTo: { id: "m0", forwarded: true } }), false);

// Wiring: both message menus offer "İlet", the bubble hides the quote for a forward, the
// sheet is lazy (not in the chat bundle until used).
const here = dirname(fileURLToPath(import.meta.url));
const list = readFileSync(join(here, "../components/chat/MessageList.jsx"), "utf8");
assert.equal((list.match(/data-testid="menu-forward"/g) || []).length, 2, "desktop hover menu and the glass long-press menu");
assert.ok(list.includes("const reply = forwarded ? null : rawReply;"));
const host = readFileSync(join(here, "../components/chat/ChatSheetsHost.jsx"), "utf8");
assert.ok(host.includes('lazy(() => import("./ForwardSheet.jsx"))'));

console.log("forwardMessage selftest OK");
