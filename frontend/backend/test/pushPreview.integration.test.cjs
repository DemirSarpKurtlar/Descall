"use strict";

/**
 * Messaging phase 5: "Mesaj önizlemesi" off strips message text from
 * server-sent pushes (web push, Android FCM, iOS alert) for that user only.
 *   - lib/pushPreview.js: split, strip, save, before-migration fallback
 *   - lib/webPush.js: every message push type, per recipient
 *   - iOS alert text for a stripped event reads "Yeni mesaj" (no thumbnail lookup)
 *   - GET /api/messages/notify-thread hides text for that user
 *   - PUT/GET /api/push-preview
 *   node frontend/backend/test/pushPreview.integration.test.cjs
 */

process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";

const http = require("http");
const assert = require("node:assert/strict");
const webpushLib = require("web-push");
const { createFakeSupabase } = require("./fakeSupabase.cjs");

const vapid = webpushLib.generateVAPIDKeys();
process.env.WEB_PUSH_SUBJECT = "mailto:test@descall.invalid";
process.env.WEB_PUSH_PUBLIC_KEY = vapid.publicKey;
process.env.WEB_PUSH_PRIVATE_KEY = vapid.privateKey;

const fake = createFakeSupabase({
  users: [
    { id: "u-open", username: "open", language: "tr", push_preview: true, active_sessions: [{ id: "s-open" }] },
    { id: "u-shy", username: "shy", language: "tr", push_preview: false, active_sessions: [{ id: "s-shy" }] },
  ],
  web_push_subscriptions: [
    { user_id: "u-open", endpoint: "https://push.invalid/open", p256dh: "k", auth: "a" },
    { user_id: "u-shy", endpoint: "https://push.invalid/shy", p256dh: "k", auth: "a" },
  ],
});
const supabasePath = require.resolve("../db/supabase");
require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: fake };

// Capture every channel.
const web = [];
webpushLib.sendNotification = async (sub, body) => { web.push({ endpoint: sub.endpoint, body: JSON.parse(body) }); return {}; };
webpushLib.setVapidDetails = () => {};
const fcm = [];
const ios = [];
const fcmPath = require.resolve("../lib/fcm");
require.cache[fcmPath] = { id: fcmPath, filename: fcmPath, loaded: true, exports: { sendFcmToUsers: async (ids, p) => { fcm.push({ ids: [...ids], p }); } } };
const realIos = require("../lib/iosAlertPush");
const iosPath = require.resolve("../lib/iosAlertPush");
require.cache[iosPath] = { id: iosPath, filename: iosPath, loaded: true, exports: { ...realIos, sendIosAlertToUsers: async (ids, ev) => { ios.push({ ids: [...ids], ev }); } } };

const pp = require("../lib/pushPreview");
const webPush = require("../lib/webPush");

const SECRET = "Şifre 4815 kapıda";
const reset = () => { web.length = 0; fcm.length = 0; ios.length = 0; };
const leaks = (value) => JSON.stringify(value).includes("4815");
const byUser = (list, uid) => list.filter((x) => (x.ids || []).includes(uid));
const webFor = (uid) => web.filter((w) => w.endpoint.endsWith(uid === "u-open" ? "/open" : "/shy"));

(async () => {
  // lib/pushPreview.js
  const split = await pp.splitByPreview(["u-open", "u-shy", "u-open", null]);
  assert.deepEqual(split, { show: ["u-open"], hide: ["u-shy"] });
  assert.equal(await pp.previewEnabled("u-unknown"), true, "unknown user: on");
  const stripped = pp.stripPreview({ body: SECRET, text: SECRET, rawText: SECRET, preview: SECRET, previewKind: "media", mediaThumbUrl: "https://x/y.png", from: "ayse", i18n: { title: { key: "push.mentioned" }, body: { key: "push.attachmentPlain" } } });
  assert.ok(!leaks(stripped), "no text left");
  assert.equal(stripped.previewKind, "text", "no thumbnail lookup");
  assert.equal(stripped.from, "ayse", "sender name stays");
  assert.deepEqual(stripped.i18n, { title: { key: "push.mentioned" } });

  // DM push: the open user gets the text, the shy one "Yeni mesaj" on every channel.
  reset();
  await webPush.sendDmMessagePush(["u-open", "u-shy"], { body: SECRET, rawText: SECRET, previewKind: "text", from: "ayse", fromId: "u-a", messageId: "m1" });
  assert.ok(leaks(webFor("u-open")), "open: web push has the text");
  assert.equal(webFor("u-shy").length, 1, "shy: still notified");
  assert.ok(!leaks(webFor("u-shy")), "shy: web push without text");
  assert.equal(webFor("u-shy")[0].body.body, "Yeni mesaj", "shy: Turkish 'Yeni mesaj'");
  assert.ok(!leaks(byUser(fcm, "u-shy")), "shy: FCM without text");
  assert.ok(leaks(byUser(fcm, "u-open")), "open: FCM with text");
  const shyIos = byUser(ios, "u-shy")[0];
  assert.ok(shyIos && !leaks(shyIos), "shy: iOS event without text");
  assert.equal(realIos.describeEvent(shyIos.ev, "tr").body, "Yeni mesaj", "iOS card reads Yeni mesaj");
  assert.ok(leaks(byUser(ios, "u-open")), "open: iOS with text");

  // Mention push (server channel).
  reset();
  await webPush.sendMentionPush(["u-open", "u-shy"], { body: SECRET, text: SECRET, from: "ayse", serverId: "s1", channelId: "c1", messageId: "m2", i18n: { title: { key: "push.mentioned", vars: { from: "ayse" } } } });
  assert.ok(!leaks(webFor("u-shy")) && !leaks(byUser(fcm, "u-shy")) && !leaks(byUser(ios, "u-shy")), "mention: shy gets no text anywhere");
  assert.ok(leaks(webFor("u-open")), "mention: open keeps the text");

  // iOS-only message types: group, group mention, server channel; a picture message too.
  for (const fn of ["sendGroupMessagePush", "sendIosGroupMentionPush", "sendServerMessagePush"]) {
    reset();
    await webPush[fn](["u-open", "u-shy"], { text: SECRET, previewKind: "media", from: "ayse", fromId: "u-a", groupId: "g1", serverId: "s1", channelId: "c1", messageId: "m3" });
    const shy = byUser(ios, "u-shy")[0];
    assert.ok(shy && !leaks(shy), `${fn}: no text for shy`);
    assert.equal(shy.ev.previewKind, "text", `${fn}: no picture thumbnail for shy`);
    assert.ok(leaks(byUser(ios, "u-open")), `${fn}: open keeps the text`);
  }

  // Message request preview.
  reset();
  await webPush.sendMessageRequestPush("u-shy", { fromId: "u-a", from: "ayse", preview: SECRET });
  assert.ok(!leaks(web) && !leaks(ios), "message request: no preview text");

  // Before the migration: the column is missing → everyone "on", saving answers not_ready.
  const missing = createFakeSupabase({ users: [{ id: "u-x" }] });
  const colErr = { code: "42703", message: "column users.push_preview does not exist" };
  const broken = { from: () => ({ select: () => ({ in: async () => ({ data: null, error: colErr }) }), update: () => ({ eq: async () => ({ error: colErr }) }) }) };
  pp.__resetPushPreview();
  assert.deepEqual(await pp.hiddenSet(["u-x"], { getDb: () => broken }), new Set(), "missing column: nobody hidden");
  assert.deepEqual(await pp.setPreviewEnabled("u-x", false, { getDb: () => broken }), { ok: false, error: "not_ready" });
  assert.equal(pp.isReady(), false);
  assert.deepEqual(await pp.readSetting("u-x"), { enabled: true, ready: false }, "settings screen keeps its device value");
  pp.__resetPushPreview();
  void missing;

  // Routes: /api/push-preview and the notify-thread preview.
  const express = require("express");
  const { signToken } = require("../config/jwt");
  const { createNotifyActionsRouter } = require("../routes/notifyActions");
  const { signNotifyToken } = require("../lib/notifyActions");
  const app = express();
  app.use(express.json());
  const events = [];
  app.set("io", { to: (room) => ({ emit: (ev, p) => events.push({ room, ev, p }) }) });
  app.use("/api/push-preview", require("../routes/pushPreview"));
  const thread = { conv: "dm:u-a", type: "dm", title: "", subtitle: "", messages: [{ id: "m1", text: SECRET, kind: "text" }] };
  app.use("/api/messages", createNotifyActionsRouter({ actions: { thread: async () => thread }, sessionAllowed: async () => ({ ok: true }) }));
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const auth = (id) => ({ Authorization: `Bearer ${signToken({ id, username: id, sid: `s-${id.slice(2)}` })}`, "Content-Type": "application/json" });
  try {
    let res = await fetch(`${base}/api/push-preview`, { headers: auth("u-open") });
    assert.deepEqual(await res.json(), { enabled: true, ready: true });
    res = await fetch(`${base}/api/push-preview`, { method: "PUT", headers: auth("u-open"), body: JSON.stringify({ enabled: "no" }) });
    assert.equal(res.status, 400);
    res = await fetch(`${base}/api/push-preview`, { method: "PUT", headers: auth("u-open"), body: JSON.stringify({ enabled: false }) });
    assert.deepEqual(await res.json(), { ok: true, enabled: false });
    assert.equal(fake._tables.users.rows.find((u) => u.id === "u-open").push_preview, false, "stored per user");
    assert.ok(events.some((e) => e.room === "user:u-open" && e.ev === "push-preview:update"), "other devices told");
    assert.equal(await pp.previewEnabled("u-open"), false);

    const tok = (id, sid) => signNotifyToken({ userId: id, sid });
    res = await fetch(`${base}/api/messages/notify-thread?conv=dm:u-a`, { headers: { Authorization: `Bearer ${tok("u-shy", "s-shy")}` } });
    let body = await res.json();
    assert.equal(res.status, 200, JSON.stringify(body));
    assert.ok(!leaks(body), "expanded notification: no text for shy");
    assert.equal(body.previewHidden, true);
    await pp.setPreviewEnabled("u-open", true);
    res = await fetch(`${base}/api/messages/notify-thread?conv=dm:u-a`, { headers: { Authorization: `Bearer ${tok("u-open", "s-open")}` } });
    body = await res.json();
    assert.ok(leaks(body), "expanded notification: text for open");
  } finally {
    server.close();
  }
  console.log("pushPreview integration test OK");
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
