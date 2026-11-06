// Selftest: per-conversation message drafts (messaging phase 4).
//   node frontend/src/lib/messageDrafts.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};

const d = await import("./messageDrafts.js");
const {
  draftKeyFor, readDraft, writeDraft, clearDraft, setDraftOwner, subscribeDrafts, getDraftsSnapshot,
  pruneDrafts, draftPreview, DRAFT_TTL_MS, MAX_DRAFTS, MAX_DRAFT_LENGTH, __resetDraftsForTest,
} = d;

// Keys: DM wins over group over channel; nothing open is null.
assert.equal(draftKeyFor({ dmUserId: "u1", groupId: "g1" }), "dm:u1");
assert.equal(draftKeyFor({ groupId: "g1", channelId: "c1" }), "group:g1");
assert.equal(draftKeyFor({ channelId: "c1" }), "channel:c1");
assert.equal(draftKeyFor({}), null);

// Write / read / blank removes; the snapshot and listeners follow.
setDraftOwner("me-1");
let pings = 0;
const off = subscribeDrafts(() => { pings += 1; });
writeDraft("dm:u1", "merhaba, yarın");
assert.equal(readDraft("dm:u1"), "merhaba, yarın");
assert.equal(getDraftsSnapshot()["dm:u1"], "merhaba, yarın");
const snapA = getDraftsSnapshot();
writeDraft("dm:u1", "merhaba, yarın"); // same text: no write, same snapshot object
assert.equal(getDraftsSnapshot(), snapA, "unchanged draft keeps the snapshot identity (no re-render)");
assert.equal(pings, 1);
writeDraft("group:g1", "  \n ");
assert.equal(readDraft("group:g1"), "", "whitespace is not a draft");
writeDraft("group:g1", "toplantı notu");
clearDraft("group:g1");
assert.equal(readDraft("group:g1"), "");
assert.ok(!("group:g1" in getDraftsSnapshot()));
off();

// Persisted per user: another account on the device does not see them, a reload does.
assert.ok(mem.has("descall:drafts:v1:me-1"));
setDraftOwner("me-2");
assert.equal(readDraft("dm:u1"), "", "drafts are per account");
writeDraft("dm:u1", "başka hesap");
setDraftOwner("me-1");
assert.equal(readDraft("dm:u1"), "merhaba, yarın");
__resetDraftsForTest();
setDraftOwner("me-1");
assert.equal(readDraft("dm:u1"), "merhaba, yarın", "survives a reload");

// Length cap.
writeDraft("dm:long", "x".repeat(MAX_DRAFT_LENGTH + 50));
assert.equal(readDraft("dm:long").length, MAX_DRAFT_LENGTH);

// Expiry and the newest-N cap.
const now = 1_800_000_000_000;
const pruned = pruneDrafts({
  "dm:old": { text: "eski", at: now - DRAFT_TTL_MS - 1 },
  "dm:new": { text: "yeni", at: now - 1000 },
  "dm:bad": { text: 42, at: now },
}, now);
assert.deepEqual(Object.keys(pruned), ["dm:new"]);
const many = {};
for (let i = 0; i < MAX_DRAFTS + 10; i += 1) many[`dm:${i}`] = { text: `t${i}`, at: now - i };
const kept = pruneDrafts(many, now);
assert.equal(Object.keys(kept).length, MAX_DRAFTS);
assert.ok(kept["dm:0"] && !kept[`dm:${MAX_DRAFTS + 5}`], "newest drafts win");

// List preview: one line, capped.
assert.equal(draftPreview("a\n\nb   c"), "a b c");
assert.equal(draftPreview("y".repeat(100), 10), `${"y".repeat(9)}…`);

// Wiring: the composer loads / saves per conversation and never saves an edit;
// the list rows show "Taslak:" except for the open chat.
const here = dirname(fileURLToPath(import.meta.url));
const composer = readFileSync(join(here, "../components/chat/MessageComposer.jsx"), "utf8");
assert.ok(composer.includes("draftKeyFor({ dmUserId: activeDmUser?.id, groupId: activeGroup?.id, channelId: activeChannel?.id })"));
assert.ok(/if \(!key \|\| editIdRef\.current\) return;\s*writeDraft\(key, messageRef\.current\)/.test(composer), "edit text is never saved as a draft");
assert.ok(/writeDraft\(prev, editIdRef\.current \? editStashRef\.current \?\? "" : messageRef\.current\)/.test(composer), "switching chats saves the chat we leave");
assert.ok(composer.includes("setMessage(readDraft(draftKey))"), "switching chats loads the new chat's draft");
assert.ok(composer.includes('window.addEventListener("pagehide", onHide)'), "a closing tab flushes the draft");
const sidebar = readFileSync(join(here, "../components/layout/ServerSidebar.jsx"), "utf8");
assert.ok(sidebar.includes("useConversationDraft(isActive || !dm.id ? null : `dm:${dm.id}`)"));
assert.ok(sidebar.includes("useConversationDraft(isActive || !group.id ? null : `group:${group.id}`)"));
assert.equal((sidebar.match(/isActive=\{isActive\}/g) || []).length >= 4, true, "every row passes isActive");
const app = readFileSync(join(here, "../App.jsx"), "utf8");
assert.ok(app.includes("if (me?.id) setDraftOwner(me.id);"), "drafts follow the signed-in account");

console.log("messageDrafts selftest OK");
