// Selftest: "Görüldü" read receipts, client side (messaging phase 4).
//   node frontend/src/lib/readReceipts.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const { applyPeerRead, lastOwnMessage, dmSeen, groupSeenBy, namesSummary, readReceiptsSetting, storeReceiptsSetting, subscribeReceiptsSetting } = await import("./readReceipts.js");

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

// Polish messaging-02: live rows have no `to`; the peer's read still marks them.
{
  const me = "me", at = "2026-11-17T10:00:00.000Z";
  const rows = [
    { id: "a", from: { id: me }, timestamp: "2026-11-17T09:59:00.000Z" },
    { id: "b", from: { id: "peer" }, timestamp: "2026-11-17T09:59:30.000Z" },
    { id: "temp-1", from: { id: me }, sending: true },
    { id: "c", from: { id: me }, failed: true, timestamp: "2026-11-17T09:59:40.000Z" },
    { id: "d", from: { id: me }, timestamp: "2026-11-17T10:05:00.000Z" },
  ];
  const out = applyPeerRead(rows, me, at);
  assert.equal(out.find((m) => m.id === "a").readAt, at, "a live row without `to` is read");
  assert.equal(out.find((m) => m.id === "b").readAt, undefined, "the peer's own rows are untouched");
  assert.equal(out.find((m) => m.id === "temp-1").readAt, undefined);
  assert.equal(out.find((m) => m.id === "c").readAt, undefined, "a failed row is never read");
  assert.equal(out.find((m) => m.id === "d").readAt, undefined, "a row sent after the read stays unread");
  assert.equal(dmSeen(applyPeerRead(rows.slice(0, 2), me, at), me).id, "a", "Görüldü shows under my newest read row");
  assert.equal(dmSeen(out, me), null, "my newest row is unread, so no Görüldü yet");
  assert.equal(applyPeerRead(out, me, at), out, "no change returns the same list");
  const app = readFileSync(join(here, "../App.jsx"), "utf8");
  assert.ok(app.includes("applyPeerRead(cur, myIdRef.current, at)"), "App wires dm:peer_read through applyPeerRead");
  assert.ok(app.includes('document.visibilityState === "hidden"') && app.includes("pendingDmReadRef.current = convWith"), "a hidden window does not mark the open DM read (messaging-03)");
}

console.log("readReceipts selftest OK");
