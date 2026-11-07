"use strict";

/**
 * Messaging phase 5: one attachment on a scheduled message.
 *   - only the author's own private upload, image / video / document / file
 *   - attachment-only rows (no caption) work; text-only stays as before
 *   - it goes out with the message (DM path inserts the file and pushes "attachment")
 *   - cancelled or failed rows delete the stored upload; a file a message or
 *     another pending row still uses is kept
 *   - before the migration: 503 attach_not_ready, text-only still works
 *   node frontend/backend/test/scheduledAttachment.integration.test.cjs
 */

process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";

const assert = require("node:assert/strict");
const { createFakeSupabase } = require("./fakeSupabase.cjs");

const pushCalls = [];
const pushPath = require.resolve("../lib/webPush");
require.cache[pushPath] = {
  id: pushPath,
  filename: pushPath,
  loaded: true,
  exports: new Proxy({}, { get: (_, name) => async (...args) => { pushCalls.push({ name, args }); return { ok: true }; } }),
};

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const A = id(1), B = id(2), G = id(10);
const up = (path, uploader, extra = {}) => ({ id: `up-${path}`, uploader_id: uploader, storage_path: path, public_url: `sb://media-private/${path}`, media_type: "image", mime_type: "image/png", file_size: 2048, original_name: "plan.png", ...extra });
const fake = createFakeSupabase({
  users: [
    { id: A, username: "alice", active_sessions: [{ id: "s-a" }], blocked_users: [] },
    { id: B, username: "bora", active_sessions: [{ id: "s-b" }], blocked_users: [] },
  ],
  friendships: [{ id: "f1", user_id: A, friend_id: B, status: "accepted" }],
  scheduled_messages: [],
  dm_messages: [],
  group_messages: [],
  server_messages: [],
  media_uploads: [
    up("images/1-plan.png", A),
    up("files/2-rapor.pdf", A, { media_type: "document", mime_type: "application/pdf", original_name: "rapor.pdf", file_size: 50000 }),
    up("files/3-ses.m4a", A, { media_type: "audio", mime_type: "audio/mp4", original_name: "ses.m4a" }),
    up("images/4-bora.png", B),
    up("images/5-iptal.png", A),
    up("images/6-hata.png", A),
    up("images/7-ortak.png", A),
    up("images/8-gonderilmis.png", A),
  ],
  device_push_tokens: [],
});
for (const p of ["images/1-plan.png", "files/2-rapor.pdf", "images/5-iptal.png", "images/6-hata.png", "images/7-ortak.png", "images/8-gonderilmis.png"]) {
  fake.storage.from("media-private").upload(p, Buffer.from("x"), { contentType: "image/png" });
}
const supabasePath = require.resolve("../db/supabase");
require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: fake };

const pm = require("../lib/privateMedia");
const { createScheduledMessages, ScheduleError } = require("../lib/scheduledMessages");

let clock = Date.parse("2026-11-09T12:00:00.000Z");
const sent = [];
let failNext = null;
const actions = {
  reply: async (io, userId, opts) => {
    if (failNext) { const e = failNext; failNext = null; throw e; }
    sent.push({ userId, ...opts });
    return { messageId: `msg-${sent.length}` };
  },
};
const io = { to: () => ({ emit() {} }) };
const svc = createScheduledMessages({ getDb: () => fake, now: () => clock, actions, canSend: async () => true, log: { warn() {} } });
const iso = (ms) => new Date(clock + ms).toISOString();
const rejects = async (p, status, code) => {
  await assert.rejects(p, (e) => e instanceof ScheduleError && e.status === status && e.code === code, `${status} ${code}`);
};
const stored = (path) => fake.storage._buckets["media-private"]?.has(path);
const uploadRow = (path) => fake._tables.media_uploads.rows.find((r) => r.storage_path === path);
const settle = () => new Promise((r) => setTimeout(r, 20));
const signed = (path) => pm.signedUrlForPath(path); // what the app got back from /api/media/upload

(async () => {
  // Validation: own private upload, allowed kinds.
  await rejects(svc.create(A, { convType: "dm", convId: B, content: "", sendAt: iso(3600e3) }), 400, "empty");
  await rejects(svc.create(A, { convType: "dm", convId: B, content: "x", sendAt: iso(3600e3), attachment: { url: signed("images/4-bora.png") } }), 400, "bad_attachment");
  await rejects(svc.create(A, { convType: "dm", convId: B, content: "x", sendAt: iso(3600e3), attachment: { url: "https://evil.example/a.png" } }), 400, "bad_attachment");
  await rejects(svc.create(A, { convType: "dm", convId: B, content: "x", sendAt: iso(3600e3), attachment: { url: "https://placeholder.supabase.co/storage/v1/object/public/media/images/1-plan.png" } }), 400, "bad_attachment");
  await rejects(svc.create(A, { convType: "dm", convId: B, content: "x", sendAt: iso(3600e3), attachment: { url: signed("files/3-ses.m4a") } }), 400, "bad_attachment");
  await rejects(svc.create(A, { convType: "dm", convId: B, content: "x", sendAt: iso(3600e3), attachment: { url: signed("quarantine/images/1-plan.png") } }), 400, "bad_attachment");

  // Attachment-only (no caption): stored, listed with the file and an empty caption.
  const a = await svc.create(A, { convType: "dm", convId: B, content: "  ", sendAt: iso(3600e3), attachment: { url: signed("images/1-plan.png"), mediaType: "file", originalName: "spoof.exe" } });
  assert.equal(a.content, "", "no caption");
  assert.deepEqual(a.attachment, { url: "sb://media-private/images/1-plan.png", mediaType: "image", mimeType: "image/png", size: 2048, originalName: "plan.png" }, "details come from the upload, not the client");
  assert.equal(fake._tables.scheduled_messages.rows.find((r) => r.id === a.id).content, " ", "content column keeps one character");
  // With a caption, to a group.
  const b = await svc.create(A, { convType: "group", convId: G, content: "Rapor ekte", sendAt: iso(2 * 3600e3), attachment: signed("files/2-rapor.pdf") });
  assert.equal(b.attachment.mediaType, "document");
  // Editing the caption of an attachment-only row may leave it empty; a text-only row may not.
  assert.equal((await svc.update(A, a.id, { content: "" })).content, "");
  const t = await svc.create(A, { convType: "dm", convId: B, content: "sadece metin", sendAt: iso(3 * 3600e3) });
  assert.equal(t.attachment, null);
  await rejects(svc.update(A, t.id, { content: " " }), 400, "empty");

  // Going out: the file goes with the message; the upload stays (the message uses it now).
  clock += 3601e3;
  await svc.tick(io);
  assert.deepEqual(sent[0], {
    userId: A,
    conv: `dm:${B}`,
    text: "",
    markRead: false,
    media: { url: "sb://media-private/images/1-plan.png", mediaType: "image", mimeType: "image/png", size: 2048, originalName: "plan.png" },
  });
  assert.ok(stored("images/1-plan.png"), "sent file kept");
  clock += 3600e3;
  await svc.tick(io);
  assert.equal(sent[1].text, "Rapor ekte");
  assert.equal(sent[1].media.mediaType, "document");
  clock += 3600e3;
  await svc.tick(io);
  assert.equal(sent[2].text, "sadece metin");
  assert.equal(sent[2].media, undefined, "text-only row sends no media field");

  // Cancel: the stored upload is deleted (storage object + media_uploads row).
  const c = await svc.create(A, { convType: "dm", convId: B, content: "iptal", sendAt: iso(3600e3), attachment: { url: signed("images/5-iptal.png") } });
  await svc.cancel(A, c.id);
  await settle();
  assert.ok(!stored("images/5-iptal.png"), "cancelled: file removed");
  assert.equal(uploadRow("images/5-iptal.png"), undefined, "cancelled: upload row removed");

  // Failure: deleted too.
  const d = await svc.create(A, { convType: "dm", convId: B, content: "olmadı", sendAt: iso(60e3), attachment: { url: signed("images/6-hata.png") } });
  clock += 2 * 60e3;
  failNext = Object.assign(new Error("blocked"), { code: "blocked" });
  await svc.tick(io);
  await settle();
  assert.equal(fake._tables.scheduled_messages.rows.find((r) => r.id === d.id).status, "failed");
  assert.ok(!stored("images/6-hata.png"), "failed: file removed");

  // Interrupted (crash mid-send) → failed later → deleted.
  const e = await svc.create(A, { convType: "dm", convId: B, content: "yarım", sendAt: iso(60e3), attachment: { url: signed("images/7-ortak.png") } });
  // A second pending row uses the same file: it must survive the first one's cleanup.
  const f = await svc.create(A, { convType: "dm", convId: B, content: "aynı dosya", sendAt: iso(24 * 3600e3), attachment: { url: signed("images/7-ortak.png") } });
  await fake.from("scheduled_messages").update({ status: "sending", updated_at: new Date(clock).toISOString() }).eq("id", e.id);
  clock += 10 * 60e3;
  await svc.tick(io);
  await settle();
  assert.equal(fake._tables.scheduled_messages.rows.find((r) => r.id === e.id).error, "interrupted");
  assert.ok(stored("images/7-ortak.png"), "kept: another pending row uses it");
  await svc.cancel(A, f.id);
  await settle();
  assert.ok(!stored("images/7-ortak.png"), "last user gone: removed");

  // A file a sent message already carries is never deleted.
  fake._tables.dm_messages.rows.push({ id: "dm-old", from_user_id: A, to_user_id: B, content: "", media_url: "sb://media-private/images/8-gonderilmis.png" });
  const g = await svc.create(A, { convType: "dm", convId: B, content: "tekrar", sendAt: iso(3600e3), attachment: { url: signed("images/8-gonderilmis.png") } });
  await svc.cancel(A, g.id);
  await settle();
  assert.ok(stored("images/8-gonderilmis.png"), "kept: a message uses it");

  // Before the migration (no media_ref column): attachments answer 503, text still works.
  const realFrom = fake.from.bind(fake);
  fake.from = (table) => {
    const q = realFrom(table);
    if (table === "scheduled_messages") {
      const origInsert = q.insert.bind(q);
      q.insert = (row) => {
        if (row && row.media_ref) {
          const err = { code: "PGRST204", message: "Could not find the 'media_ref' column of 'scheduled_messages' in the schema cache" };
          q.single = async () => ({ data: null, error: err });
          return q;
        }
        return origInsert(row);
      };
    }
    return q;
  };
  fake._tables.media_uploads.rows.push(up("images/9-yeni.png", A));
  await rejects(svc.create(A, { convType: "dm", convId: B, content: "x", sendAt: iso(3600e3), attachment: { url: signed("images/9-yeni.png") } }), 503, "attach_not_ready");
  assert.equal((await svc.create(A, { convType: "dm", convId: B, content: "metin", sendAt: iso(3600e3) })).content, "metin");
  fake.from = realFrom;

  // The real DM send path with the file (lib/notifyActions.js reply → replyDm).
  const shared = require("../runtime/sharedState");
  shared.usernameById.set(B, "bora");
  const notify = require("../lib/notifyActions").createNotifyActions({ getDb: () => fake });
  const emitted = [];
  const io2 = { to: (room) => ({ emit: (ev, p) => emitted.push({ room, ev, p }) }), sockets: { adapter: { rooms: new Map([[`user:${B}`, new Set(["sock-b"])]]) }, sockets: new Map() } };
  await assert.rejects(notify.reply(io2, A, { conv: `dm:${B}`, text: "  " }), (err) => err.code === "empty", "no text and no file: refused");
  shared.rateLimitDm.clear();
  const out = await notify.reply(io2, A, { conv: `dm:${B}`, text: "", markRead: false, media: { url: "sb://media-private/images/1-plan.png", mediaType: "image", mimeType: "image/png", size: 2048, originalName: "plan.png" } });
  const row = fake._tables.dm_messages.rows.find((r) => r.id === out.messageId);
  assert.equal(row.media_url, "sb://media-private/images/1-plan.png");
  assert.equal(row.media_type, "image");
  assert.equal(row.original_name, "plan.png");
  assert.equal(row.content, "");
  const live = emitted.find((x) => x.room === `user:${B}` && x.ev === "dm:message");
  assert.ok(live && live.p.mediaUrl.startsWith("sb://media-private/"), "peer gets the file");
  const push = pushCalls.find((p) => p.name === "sendDmMessagePush");
  assert.equal(push.args[1].previewKind, "media");
  assert.deepEqual(push.args[1].i18n, { body: { key: "push.attachmentPlain" } }, "push says an attachment was sent");
  // Someone else's file is refused at send time.
  shared.rateLimitDm.clear();
  await assert.rejects(
    notify.reply(io2, A, { conv: `dm:${B}`, text: "", media: { url: "sb://media-private/images/4-bora.png", mediaType: "image" } }),
    (err) => err.code === "attachment_unavailable"
  );

  console.log("scheduledAttachment integration test OK");
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
