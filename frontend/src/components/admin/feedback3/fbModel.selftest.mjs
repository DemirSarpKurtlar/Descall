import assert from "node:assert/strict";
import { relTime, sentAt, memberSince, deleteMessage, applyFilters, counts, titleOf, avatarColor, fileName, formatBytes, yearAblative, TYPES, PRIORITIES, STATUSES, SORTS } from "./fbModel.js";
import { ADMINX_TR } from "../../../i18n/locales/adminx.tr.js";
import { ADMINX_EN } from "../../../i18n/locales/adminx.en.js";
import { formatMessage } from "../../../i18n/message.js";

const tFor = (cat, tag) => (key, vars) => {
  const raw = key.replace(/^adminx\./, "").split(".").reduce((o, p) => o?.[p], cat);
  assert.equal(typeof raw, "string", `missing ${key}`);
  return formatMessage(raw, vars, tag);
};
const tr = tFor(ADMINX_TR, "tr-TR");
const en = tFor(ADMINX_EN, "en-GB");

const now = Date.parse("2026-10-26T18:49:00.000Z");
const ago = (m) => new Date(now - m * 60000).toISOString();
// Relative time comes from Intl in the UI locale (Turkish short style: "dk.", "sa.").
assert.equal(relTime(ago(14), "tr", now), "14 dk. önce");
assert.equal(relTime(ago(240), "tr", now), "4 sa. önce");
assert.equal(relTime(ago(95), "tr", now), "1 sa. önce");
assert.equal(relTime(ago(1500), "tr", now), "dün");
assert.equal(relTime(ago(3000), "tr", now), "2 gün önce");
assert.equal(relTime(ago(6000), "tr", now), "4 gün önce");
assert.equal(relTime(ago(0), "tr", now), "şimdi");
assert.equal(relTime(ago(14), "en", now), "14 min ago");
assert.equal(relTime(ago(1500), "en", now), "yesterday");
assert.equal(relTime(ago(60 * 24 * 20), "tr", now), "6 Eki");
assert.equal(sentAt("2026-10-26T18:35:00.000Z", "tr"), "26 Eki · 21:35", "Istanbul time");
assert.equal(sentAt("2026-10-26T18:35:00.000Z", "en"), "26 Oct · 21:35");
assert.equal(memberSince("2026-03-03T10:00:00.000Z", tr, "tr"), "3 Mar 2026'dan beri");
assert.equal(memberSince("2026-03-03T10:00:00.000Z", en, "en"), "since 3 Mar 2026");
assert.equal(yearAblative(2025), "ten");
assert.equal(yearAblative(2020), "den");
assert.equal(yearAblative(2030), "dan");
const f = { user: { username: "ornek_kullanici" }, attachments: ["a"], replies: [{ type: "reply" }, { type: "system" }] };
assert.equal(deleteMessage(f, tr, "tr"), "ornek_kullanici'nin bildirimi, eki ve 1 yanıt kalıcı olarak silinir. Bu işlem geri alınamaz.");
assert.equal(deleteMessage({ user: { username: "ali" }, attachments: [], replies: [] }, tr, "tr"), "ali'nin bildirimi kalıcı olarak silinir. Bu işlem geri alınamaz.");
assert.equal(deleteMessage({ user: { username: "mert" }, attachments: ["a", "b"], replies: [] }, tr, "tr"), "mert'in bildirimi ve ekleri kalıcı olarak silinir. Bu işlem geri alınamaz.");
assert.equal(deleteMessage(f, en, "en"), "ornek_kullanici's report, attachment and 1 reply will be deleted permanently. This can't be undone.");
const list = [
  { id: "a", status: "new", viewed: false, category: "bug", priority: "low", created_at: ago(5), user: { username: "zeyno" }, message: "Mikrofon" },
  { id: "b", status: "closed", viewed: true, category: "feature", priority: "critical", created_at: ago(50), user: { username: "ali" }, message: "Renk" },
];
assert.deepEqual(applyFilters(list, { q: "mikro", locale: "tr" }).map((x) => x.id), ["a"]);
assert.deepEqual(applyFilters(list, { q: "B", locale: "tr" }).map((x) => x.id), ["b"], "search by id");
assert.deepEqual(applyFilters(list, { status: "closed" }).map((x) => x.id), ["b"]);
assert.deepEqual(applyFilters(list, {}).map((x) => x.id), ["a", "b"], "open work first");
assert.deepEqual(applyFilters([{ ...list[1], status: "in_progress", created_at: ago(1) }, { ...list[0], created_at: ago(90) }, { ...list[0], id: "c", status: "resolved", created_at: ago(0) }]).map((x) => x.id), ["a", "b", "c"], "status, then newest");
assert.deepEqual(applyFilters(list, { sort: "oldest" }).map((x) => x.id), ["b", "a"]);
assert.deepEqual(applyFilters(list, { sort: "priority" }).map((x) => x.id), ["b", "a"]);
assert.deepEqual(applyFilters(list, { type: "bug", priority: "low" }).map((x) => x.id), ["a"]);
const c = counts(list);
assert.equal(c.byStatus.all, 2); assert.equal(c.byStatus.new, 1); assert.equal(c.unread, 1); assert.equal(c.byType.bug, 1);
assert.equal(titleOf({ subject: "  ", message: "İlk satır\nikinci" }, tr), "İlk satır");
assert.equal(titleOf({ subject: "", message: "" }, tr), "Geri bildirim");
assert.equal(avatarColor("deneme", "tr"), "#2E9E5B");
assert.equal(avatarColor("test", "tr"), "#555");
assert.equal(fileName("https://cdn.x/u/ekran-goruntusu.png?x=1", tr), "ekran-goruntusu.png");
assert.equal(fileName("https://cdn.x/", tr), "ek");
assert.equal(formatBytes(421888, "tr"), "412 KB");
assert.equal(formatBytes(5 * 1024 * 1024 + 200000, "tr"), "5,2 MB");
// Every label key the maps hand to t() exists in both catalogs.
for (const map of [TYPES, PRIORITIES, STATUSES]) for (const [key] of Object.values(map)) { tr(key); en(key); }
for (const key of Object.values(SORTS)) { tr(key); en(key); }
console.log("fbModel.selftest ok");
