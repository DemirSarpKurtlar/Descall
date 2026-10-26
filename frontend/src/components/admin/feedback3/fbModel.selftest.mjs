import assert from "node:assert/strict";
import { relTime, sentAt, memberSince, genitive, deleteMessage, applyFilters, counts, titleOf, avatarColor, fileName, formatBytes, yearAblative } from "./fbModel.js";

const now = Date.parse("2026-10-26T18:49:00.000Z");
const ago = (m) => new Date(now - m * 60000).toISOString();
assert.equal(relTime(ago(14), now), "14 dk önce");
assert.equal(relTime(ago(240), now), "4 sa önce");
assert.equal(relTime(ago(95), now), "1 sa önce");
assert.equal(relTime(ago(1500), now), "Dün");
assert.equal(relTime(ago(3000), now), "2 gün önce");
assert.equal(relTime(ago(6000), now), "4 gün önce");
assert.equal(relTime(ago(0), now), "şimdi");
assert.equal(sentAt("2026-10-26T18:35:00.000Z"), "26 Eki · 21:35", "Istanbul time");
assert.equal(memberSince("2026-03-03T10:00:00.000Z"), "3 Mar 2026'dan beri");
assert.equal(yearAblative(2025), "ten");
assert.equal(yearAblative(2020), "den");
assert.equal(yearAblative(2030), "dan");
assert.equal(genitive("ayşe"), "ayşe'nin");
assert.equal(genitive("mert"), "mert'in");
assert.equal(genitive("ornek_kullanici"), "ornek_kullanici'nin");
assert.equal(genitive("doruk"), "doruk'un");
const f = { user: { username: "ornek_kullanici" }, attachments: ["a"], replies: [{ type: "reply" }, { type: "system" }] };
assert.equal(deleteMessage(f), "ornek_kullanici'nin bildirimi, eki ve 1 yanıt kalıcı olarak silinir. Bu işlem geri alınamaz.");
assert.equal(deleteMessage({ user: { username: "ali" }, attachments: [], replies: [] }), "ali'nin bildirimi kalıcı olarak silinir. Bu işlem geri alınamaz.");
const list = [
  { id: "a", status: "new", viewed: false, category: "bug", priority: "low", created_at: ago(5), user: { username: "zeyno" }, message: "Mikrofon" },
  { id: "b", status: "closed", viewed: true, category: "feature", priority: "critical", created_at: ago(50), user: { username: "ali" }, message: "Renk" },
];
assert.deepEqual(applyFilters(list, { q: "mikro" }).map((x) => x.id), ["a"]);
assert.deepEqual(applyFilters(list, { q: "B" }).map((x) => x.id), ["b"], "search by id");
assert.deepEqual(applyFilters(list, { status: "closed" }).map((x) => x.id), ["b"]);
assert.deepEqual(applyFilters(list, {}).map((x) => x.id), ["a", "b"], "open work first");
assert.deepEqual(applyFilters([{ ...list[1], status: "in_progress", created_at: ago(1) }, { ...list[0], created_at: ago(90) }, { ...list[0], id: "c", status: "resolved", created_at: ago(0) }]).map((x) => x.id), ["a", "b", "c"], "status, then newest");
assert.deepEqual(applyFilters(list, { sort: "oldest" }).map((x) => x.id), ["b", "a"]);
assert.deepEqual(applyFilters(list, { sort: "priority" }).map((x) => x.id), ["b", "a"]);
assert.deepEqual(applyFilters(list, { type: "bug", priority: "low" }).map((x) => x.id), ["a"]);
const c = counts(list);
assert.equal(c.byStatus.all, 2); assert.equal(c.byStatus.new, 1); assert.equal(c.unread, 1); assert.equal(c.byType.bug, 1);
assert.equal(titleOf({ subject: "  ", message: "İlk satır\nikinci" }), "İlk satır");
assert.equal(avatarColor("deneme"), "#2E9E5B");
assert.equal(avatarColor("test"), "#555");
assert.equal(fileName("https://cdn.x/u/ekran-goruntusu.png?x=1"), "ekran-goruntusu.png");
assert.equal(formatBytes(421888), "412 KB");
console.log("fbModel.selftest ok");
