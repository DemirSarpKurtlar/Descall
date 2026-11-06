// Selftest: "Görüldü" read receipts, client side (messaging phase 4).
//   node frontend/src/lib/readReceipts.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const { lastOwnMessage, dmSeen, groupSeenBy, namesSummary, readReceiptsSetting, storeReceiptsSetting, subscribeReceiptsSetting } = await import("./readReceipts.js");

const ME = "me";
const m = (id, from, minute, extra = {}) => ({ id, from: { id: from }, timestamp: `2026-11-06T10:${String(minute).padStart(2, "0")}:00.000Z`, ...extra });

// DM: only my newest message, only once read.
const dm = [m("1", ME, 1, { readAt: "2026-11-06T10:02:00Z" }), m("2", "ayse", 3), m("3", ME, 4)];
assert.equal(dmSeen(dm, ME), null, "my newest message is not read yet");
dm[2].readAt = "2026-11-06T10:05:00Z";
assert.deepEqual(dmSeen(dm, ME), { id: "3", at: "2026-11-06T10:05:00Z" });
assert.equal(lastOwnMessage([...dm, m("temp-9", ME, 6, { sending: true })], ME), null, "an unsent message means nothing is shown yet");
assert.equal(lastOwnMessage([m("1", ME, 1), { id: "c", type: "call_summary", from: { id: ME } }], ME).id, "1", "system rows are skipped");
assert.equal(dmSeen([], ME), null);

// Group: members whose read position is at/after my message; members who left are ignored.
const members = [{ id: ME, username: "demir" }, { id: "a", username: "ayse", displayName: "Ayşe" }, { id: "b", username: "mert", displayName: "Mert" }];
const gm = [m("g1", "a", 1), m("g2", ME, 10)];
assert.equal(groupSeenBy({ messages: gm, myId: ME, reads: [{ userId: "a", at: "2026-11-06T10:05:00Z" }], members }), null, "read before my message");
let s = groupSeenBy({ messages: gm, myId: ME, reads: [{ userId: "a", at: "2026-11-06T10:11:00Z" }, { userId: "x", at: "2026-11-06T10:12:00Z" }], members });
assert.deepEqual(s, { id: "g2", names: ["Ayşe"], everyone: false });
s = groupSeenBy({ messages: gm, myId: ME, reads: [{ userId: "a", at: "2026-11-06T10:11:00Z" }, { userId: "b", at: "2026-11-06T10:10:00Z" }, { userId: ME, at: "2026-11-06T10:20:00Z" }], members });
assert.equal(s.everyone, true, "everyone else read it");

// Names line.
assert.deepEqual(namesSummary(["Ayşe", "Mert"]), { shown: "Ayşe, Mert", more: 0 });
assert.deepEqual(namesSummary(["A", "B", "C", "D"]), { shown: "A, B", more: 2 });

// My switch: default on, stored, listeners told.
assert.equal(readReceiptsSetting(), true);
let pings = 0;
const off = subscribeReceiptsSetting(() => { pings += 1; });
storeReceiptsSetting(false);
assert.equal(readReceiptsSetting(), false);
assert.equal(pings, 1);
off();

// Wiring: one line under my newest bubble, hidden when my switch is off; the setting row.
const here = dirname(fileURLToPath(import.meta.url));
const list = readFileSync(join(here, "../components/chat/MessageList.jsx"), "utf8");
assert.ok(list.includes("{seen && seen.id === msg.id ? <SeenLine seen={seen} t={t} /> : null}"));
assert.ok(list.includes("if (!receiptsOn || isSearching || !myId) return null;"));
const panel = readFileSync(join(here, "../components/layout/UserPanel.jsx"), "utf8");
assert.ok(panel.includes('authedRequest("/api/read-receipts", { method: "PUT", body: { enabled: next } })'));
assert.ok(/setOn\(!next\);\s*storeReceiptsSetting\(!next\);/.test(panel), "a failed save rolls the switch back");
const css = readFileSync(join(here, "../styles/messaging-phase4.css"), "utf8");
assert.ok(/\.msg-seen \{[^}]*font-size: var\(--fs-11\)/.test(css));

console.log("readReceipts selftest OK");
