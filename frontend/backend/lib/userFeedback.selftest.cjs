"use strict";
// Run: node backend/lib/userFeedback.selftest.cjs
// 3.7.14 Geri bildirim A, sender side: validation, the user's view of the thread
// (no internal notes / admin names / raw UA), unread, replies.
const assert = require("node:assert/strict");
const uf = require("./userFeedback");

const env = { SUPABASE_URL: "https://abc.supabase.co" };
const shot = "https://abc.supabase.co/storage/v1/object/public/media/images/x.png";

// Submission
assert.equal(uf.sanitizeSubmission({ message: "kısa" }).error, "too_short");
let r = uf.sanitizeSubmission({ kind: "bug", message: "Sesli aramada ses gidiyor", area: "voice", frequency: "always", attachments: [shot, "http://evil.example/x.png", "https://evil.example/x.png", shot, shot, shot], platform: "Windows", appVersion: "3.7.14" }, { env }).row;
assert.equal(r.kind, "bug");
assert.equal(r.category, "bug");
assert.equal(r.priority, "high", "a bug that happens every time is high");
assert.deepEqual(r.details, { area: "voice", frequency: "always" });
assert.equal(r.attachments.length, 3, "max 3 screenshots, only our storage");
assert.ok(r.attachments.every((u) => u === shot));
assert.equal(r.platform, "Windows");
r = uf.sanitizeSubmission({ kind: "praise", message: "Arayüz çok temiz", rating: 5, likes: ["voice", "design", "nope", "voice"], frequency: "always" }, { env }).row;
assert.equal(r.category, "improvement");
assert.equal(r.priority, "low");
assert.equal(r.rating, 5);
assert.deepEqual(r.details, { likes: ["voice", "design"] }, "frequency only for bugs, likes deduped and whitelisted");
r = uf.sanitizeSubmission({ kind: "suggestion", message: "Etkinlik takvimi olsun", includeDevice: false, platform: "Windows" }, { env, userAgent: "Mozilla/5.0" }).row;
assert.equal(r.platform, "hidden", "device info only when the user ticks it");
assert.equal(r.app_version, "hidden");
// Old client shape still works.
r = uf.sanitizeSubmission({ category: "bug", priority: "critical", message: "Eski istemci mesajı" }, { env }).row;
assert.equal(r.kind, "bug");
assert.equal(r.priority, "critical");
assert.equal(uf.sanitizeSubmission({ kind: "praise", message: "x".repeat(2000) }, { env }).row.message.length, 1000);

// Media URL guard
assert.equal(uf.isOwnMediaUrl("https://abc.supabase.co/storage/v1/object/public/a.png", env), true);
assert.equal(uf.isOwnMediaUrl("https://other.supabase.co/storage/v1/object/public/a.png", env), true);
assert.equal(uf.isOwnMediaUrl("https://other.supabase.co/rest/v1/users", env), false);
assert.equal(uf.isOwnMediaUrl("javascript:alert(1)", env), false);

// The user's view: no internal notes, no admin names / ids, status lines structured.
const row = {
  id: "11111111-1111-1111-1111-111111111111",
  user_id: "u1", kind: "bug", category: "bug", status: "in_progress",
  subject: "Sesli aramada ses gidiyor", message: "Sesli aramada ses gidiyor\nÇıkıp girince düzeliyor",
  platform: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Descall/3.7.14 Electron/30", app_version: "3.7.14",
  email_status: "sent", email_error: null,
  admin_replies: [
    { id: "s1", type: "system", text: "demir durumu İşlemde yaptı", adminUsername: "demir", created_at: "2026-10-30T10:00:00Z" },
    { id: "n1", text: "kullanıcı çok sinirli, gizli not", internal: true, isAdmin: true, adminId: "a1", adminUsername: "demir", created_at: "2026-10-30T10:01:00Z" },
    { id: "r1", text: "Bluetooth kulaklık mı kullanıyorsun?", internal: false, isAdmin: true, adminId: "a1", adminUsername: "demir", created_at: "2026-10-30T10:02:00Z" },
    { id: "p1", type: "system", text: "demir önceliği Yüksek yaptı", adminUsername: "demir", created_at: "2026-10-30T10:03:00Z" },
    { id: "u1r", type: "reply", isAdmin: false, text: "Evet, Bluetooth.", created_at: "2026-10-30T11:00:00Z" },
    { id: "l1", admin_id: "a1", admin_username: "demir", message: "Eski panelden yanıt", created_at: "2026-10-30T12:00:00Z" },
  ],
  user_last_read_at: "2026-10-30T10:30:00Z",
  created_at: "2026-10-30T09:00:00Z", updated_at: "2026-10-30T12:00:00Z",
};
const view = uf.shapeForUser(row);
const json = JSON.stringify(view);
assert.ok(!json.includes("gizli not"), "internal note never reaches the user");
assert.ok(!/demir|adminId|adminUsername|admin_id|a1"/.test(json), "no admin names or ids");
assert.ok(!json.includes("Mozilla"), "no raw user agent");
assert.ok(!json.includes("email"), "no e-mail delivery fields");
assert.equal(view.device, "Windows · 3.7.14");
assert.deepEqual(view.thread.map((m) => m.type === "status" ? `status:${m.status}` : `${m.fromTeam ? "team" : "me"}:${m.text}`), [
  "status:in_progress",
  "team:Bluetooth kulaklık mı kullanıyorsun?",
  "me:Evet, Bluetooth.",
  "team:Eski panelden yanıt",
], "priority lines dropped, legacy `message` replies shown");
assert.equal(view.unread, 1, "only team messages / status lines after the last read count");
assert.equal(view.last.text, "Eski panelden yanıt");
assert.equal(view.canReply, true);
assert.equal(uf.shapeForUser({ ...row, status: "closed" }).canReply, false);
assert.equal(uf.shapeForUser(row, { withThread: false }).thread, undefined);
assert.equal(uf.shapeForUser({ ...row, platform: "hidden", app_version: "hidden" }).device, null);
// Structured status on new system lines.
assert.equal(uf.userThread({ admin_replies: [{ id: "x", type: "system", status: "resolved", text: "x durumu Çözüldü yaptı" }] })[0].status, "resolved");

// Replies
let out = uf.appendUserReply(row, "  Hâlâ oluyor  ", [], env);
assert.equal(out.reply.isAdmin, false);
assert.equal(out.reply.type, "reply");
assert.equal(out.reply.text, "Hâlâ oluyor");
assert.equal(out.update.status, undefined, "in progress stays in progress");
assert.ok(out.update.user_last_read_at);
out = uf.appendUserReply({ ...row, status: "resolved" }, "Yine oldu", [], env);
assert.equal(out.update.status, "in_progress", "a reply reopens a resolved item");
assert.equal(out.update.admin_replies.at(-1).type, "system");
assert.equal(uf.appendUserReply({ ...row, status: "closed" }, "selam", [], env).error, "closed");
assert.equal(uf.appendUserReply(row, "   ", [], env).error, "empty");
assert.equal(uf.appendUserReply(row, "", [shot], env).reply.attachments.length, 1);

console.log("userFeedback.selftest ok");
