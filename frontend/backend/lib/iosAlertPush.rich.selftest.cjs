"use strict";
/**
 * 3.0.0 (A4): rich iOS message pushes (mockups 27/28).
 * Run: node frontend/backend/lib/iosAlertPush.rich.selftest.cjs
 */
const assert = require("node:assert/strict");
const push = require("./iosAlertPush");

const { buildAlertRequest, createIosAlertPusher, MESSAGE_CATEGORY } = push;

// ── DM: sender title, no subtitle, MESSAGE + mutable-content ──
{
  const { body } = buildAlertRequest(
    { type: "dm", fromId: "u-mert", fromName: "mert", text: "Yarın 10'da kütüphanede buluşalım mı?", messageId: "m1", senderAvatarUrl: "https://cdn.example/a.png", comm: true },
    "tr"
  );
  assert.equal(body.aps.alert.title, "mert");
  assert.equal(body.aps.alert.subtitle, undefined);
  assert.equal(body.aps.alert.body, "Yarın 10'da kütüphanede buluşalım mı?");
  assert.equal(body.aps.category, MESSAGE_CATEGORY);
  assert.equal(body.aps["mutable-content"], 1);
  assert.equal(body.aps["thread-id"], "dm:u-mert");
  assert.equal(body.conv, "dm:u-mert");
  assert.equal(body.senderId, "u-mert");
  assert.equal(body.senderName, "mert");
  assert.equal(body.senderAvatar, "https://cdn.example/a.png");
  assert.equal(body.comm, "1");
  assert.equal(body.messageId, "m1");
  assert.equal(body.rich, undefined, "internal flag never leaves the server");
}

// ── Display name wins over username when known ──
{
  const { body } = buildAlertRequest({ type: "dm", fromId: "u1", fromName: "mert42", senderDisplayName: "Mert", text: "hi" }, "tr");
  assert.equal(body.aps.alert.title, "Mert");
  assert.equal(body.senderName, "Mert");
}

// ── Group: title = sender, subtitle = 👥 group, body = text only ──
{
  const { body } = buildAlertRequest(
    { type: "group", groupId: "g1", groupName: "Hafta Sonu Ekibi", fromName: "Mert", excludeUserId: "u-mert", text: "Bu akşam 21:00'de sesli kanalda buluşuyoruz, gelen?", messageId: "m2" },
    "tr"
  );
  assert.equal(body.aps.alert.title, "Mert");
  assert.equal(body.aps.alert.subtitle, "👥 Hafta Sonu Ekibi");
  assert.equal(body.aps.alert.body, "Bu akşam 21:00'de sesli kanalda buluşuyoruz, gelen?");
  assert.equal(body.aps["thread-id"], "group:g1");
  assert.equal(body.senderId, "u-mert");
  assert.equal(body.groupName, "Hafta Sonu Ekibi");
}

// ── Server channel: subtitle "# genel · Oyun Gecesi" ──
{
  const { body } = buildAlertRequest(
    { type: "server-message", serverId: "s1", serverName: "Oyun Gecesi", channelId: "c1", channelName: "genel", fromName: "Zeynep", excludeUserId: "u-z", text: "Turnuva listesi 21:00'de açılıyor 🏆" },
    "tr"
  );
  assert.equal(body.aps.alert.title, "Zeynep");
  assert.equal(body.aps.alert.subtitle, "# genel · Oyun Gecesi");
  assert.equal(body.aps.alert.body, "Turnuva listesi 21:00'de açılıyor 🏆");
  assert.equal(body.aps["thread-id"], "channel:c1");
  assert.equal(body.conv, "channel:c1");
}

// ── Picture: "📷 Fotoğraf · caption" + thumbnail URL ──
{
  const { body } = buildAlertRequest(
    { type: "dm", fromId: "u-elif", fromName: "Elif", previewKind: "media", mediaKind: "image", mediaThumbUrl: "https://api.example/api/media/f/x.jpg?e=1&s=2", text: "Dün akşamki gün batımı 🌅" },
    "tr"
  );
  assert.equal(body.aps.alert.body, "📷 Fotoğraf · Dün akşamki gün batımı 🌅");
  assert.equal(body.mediaThumb, "https://api.example/api/media/f/x.jpg?e=1&s=2");
  assert.equal(body.mediaKind, "image");
  const en = buildAlertRequest({ type: "dm", fromId: "u", fromName: "E", previewKind: "media", mediaKind: "image", text: "" }, "en").body;
  assert.equal(en.aps.alert.body, "📷 Photo");
  assert.equal(en.mediaThumb, undefined);
  const file = buildAlertRequest({ type: "dm", fromId: "u", fromName: "E", previewKind: "media", text: "" }, "tr").body;
  assert.equal(file.aps.alert.body, "📎 Dosya gönderdi");
  const http = buildAlertRequest({ type: "dm", fromId: "u", fromName: "E", previewKind: "media", mediaKind: "image", mediaThumbUrl: "http://insecure/x.jpg", senderAvatarUrl: "javascript:alert(1)" }, "tr").body;
  assert.equal(http.mediaThumb, undefined, "only https thumbnails");
  assert.equal(http.senderAvatar, undefined, "only https avatars");
}

// ── Voice ──
{
  const { body } = buildAlertRequest({ type: "group", groupId: "g", groupName: "G", fromName: "A", previewKind: "voice" }, "tr");
  assert.equal(body.aps.alert.body, "🎤 Sesli mesaj");
}

// ── Mention: sender title, where · Senden bahsetti ──
{
  const ch = buildAlertRequest({ type: "mention", serverId: "s1", serverName: "Oyun Gecesi", channelId: "c1", channelName: "genel", fromName: "Zeynep", text: "@demir bak" }, "tr").body;
  assert.equal(ch.aps.alert.title, "Zeynep");
  assert.equal(ch.aps.alert.subtitle, "# genel · Oyun Gecesi · Senden bahsetti");
  assert.equal(ch.aps.category, MESSAGE_CATEGORY);
  const d = buildAlertRequest({ type: "mention", fromId: "u1", dmConversationId: "u1", fromName: "Ayşe", text: "@demir" }, "en").body;
  assert.equal(d.aps.alert.subtitle, "Mentioned you");
  assert.equal(d.conv, "dm:u1");
}

// ── Communication flag off: still rich (NSE thumbnail), no comm ──
{
  const { body } = buildAlertRequest({ type: "dm", fromId: "u1", fromName: "A", text: "x", comm: false }, "tr");
  assert.equal(body.comm, undefined);
  assert.equal(body.aps["mutable-content"], 1);
  assert.equal(push.commEnabled({ IOS_COMM_NOTIFICATIONS: "0" }), false);
  assert.equal(push.commEnabled({}), true);
}

// ── Calls and other types are unchanged: no MESSAGE, no mutable-content ──
{
  const call = buildAlertRequest({ type: "call", fromId: "u1", fromName: "Ayşe", callType: "voice" }, "tr").body;
  assert.equal(call.aps.category, "INCOMING_CALL");
  assert.equal(call.aps["mutable-content"], undefined);
  assert.equal(call.senderAvatar, undefined);
  const gcall = buildAlertRequest({ type: "group-call", groupId: "g", groupName: "G", fromName: "A" }, "tr").body;
  assert.equal(gcall.aps.category, "INCOMING_CALL");
  const fr = buildAlertRequest({ type: "friend-request", fromId: "u1", fromName: "A" }, "tr").body;
  assert.equal(fr.aps.category, undefined);
  assert.equal(fr.aps["mutable-content"], undefined);
}

// ── Payload stays under the APNs 4 KB limit with long inputs ──
{
  const name = "ğ".repeat(100);
  const long = "ğ".repeat(2000);
  const { body } = buildAlertRequest({ type: "server-message", serverId: "s", serverName: name, channelId: "c", channelName: name, fromName: name, text: long, senderAvatarUrl: `https://x/${"a".repeat(1000)}`, mediaKind: "image", previewKind: "media", mediaThumbUrl: `https://x/${"b".repeat(1000)}` }, "tr");
  assert.ok(Buffer.byteLength(JSON.stringify(body)) < 4096, `payload ${Buffer.byteLength(JSON.stringify(body))} bytes`);
}

// ── Pusher enrichment: one users lookup + one message lookup per event ──
(async () => {
  const TOKEN = "c".repeat(64);
  const calls = [];
  const tables = {
    device_push_tokens: [{ token: TOKEN, user_id: "bob", platform: "ios", locale: "tr" }],
    users: [
      { id: "bob", presence_status: "online", language: "tr", blocked_users: [] },
      { id: "u-elif", avatar_url: "https://cdn.example/elif.png", display_name: "Elif" },
    ],
    dm_messages: [{ id: "m9", media_url: "https://cdn.example/sunset.jpg", media_type: "image", mime_type: "image/jpeg" }],
  };
  const db = {
    from(table) {
      const filters = [];
      const q = {
        select() { return q; },
        eq(col, val) { filters.push((r) => r[col] === val); return q; },
        in(col, vals) { filters.push((r) => vals.includes(r[col])); return q; },
        delete() { return q; },
        maybeSingle() {
          calls.push(table);
          return Promise.resolve({ data: (tables[table] || []).filter((r) => filters.every((f) => f(r)))[0] || null, error: null });
        },
        then(resolve) {
          resolve({ data: (tables[table] || []).filter((r) => filters.every((f) => f(r))), error: null });
        },
      };
      return q;
    },
  };
  const sent = [];
  const pusher = createIosAlertPusher({
    getDb: () => db,
    transport: async (req) => { sent.push(req); return { status: 200, body: "" }; },
    context: { isForeground: () => false, isViewing: () => false },
    apnsConfig: () => ({ keyId: "k", teamId: "t", bundleId: "com.descall.app" }),
    getApnsJwt: () => "jwt",
    log: { warn() {} },
  });
  const res = await pusher.sendToUsers(["bob"], { type: "dm", fromId: "u-elif", fromName: "elif", previewKind: "media", text: "Dün akşamki gün batımı", messageId: "m9" });
  assert.equal(res.sent, 1);
  const payload = JSON.parse(sent[0].body);
  assert.equal(payload.aps.alert.title, "Elif");
  assert.equal(payload.senderAvatar, "https://cdn.example/elif.png");
  assert.equal(payload.mediaThumb, "https://cdn.example/sunset.jpg");
  assert.equal(payload.aps.alert.body, "📷 Fotoğraf · Dün akşamki gün batımı");
  assert.deepEqual(calls.sort(), ["dm_messages", "users"]);

  // A failing lookup never drops the push.
  const broken = createIosAlertPusher({
    getDb: () => ({
      from(table) {
        if (table === "device_push_tokens" || table === "users") {
          const q = db.from(table);
          if (table === "users") q.maybeSingle = () => Promise.reject(new Error("db down"));
          return q;
        }
        return db.from(table);
      },
    }),
    transport: async (req) => { sent.push(req); return { status: 200, body: "" }; },
    context: { isForeground: () => false, isViewing: () => false },
    apnsConfig: () => ({ keyId: "k", teamId: "t", bundleId: "com.descall.app" }),
    getApnsJwt: () => "jwt",
    log: { warn() {} },
  });
  const res2 = await broken.sendToUsers(["bob"], { type: "group", groupId: "g", groupName: "G", fromName: "elif", excludeUserId: "u-elif", text: "hey" });
  assert.equal(res2.sent, 1);
  const p2 = JSON.parse(sent[1].body);
  assert.equal(p2.aps.alert.title, "elif");
  assert.equal(p2.senderAvatar, undefined);

  console.log("iosAlertPush rich selftest ok");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
