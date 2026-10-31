"use strict";

/**
 * 3.7.17 Apple Watch API (/api/watch): session required, home list (DMs with a
 * message + groups, newest first, emoji media labels turned into Turkish words,
 * admin sections only for admins), thread (20 lines, empty DM = empty list),
 * send / read go through the notification actions with validation, friends
 * (offline people only counted), status (validated, saved, pushed to the
 * account's other devices), write rate limit.
 */

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";

const http = require("http");
const { createFakeSupabase } = require("./fakeSupabase.cjs");

const supabasePath = require.resolve("../db/supabase");
const fake = createFakeSupabase({
  users: [
    { id: "u-me", username: "demirr", active_sessions: [{ id: "s-1" }] },
    { id: "u-admin", username: "admin", active_sessions: [{ id: "s-2" }] },
    { id: "u-cold", username: "soguk", display_name: "Soğuk Kişi" },
  ],
});
require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: fake };

const express = require("express");
const { signToken } = require("../config/jwt");
const { NotifyActionError } = require("../lib/notifyActions");
const { resetLimits } = require("../lib/rateLimit");
const { createWatchRouter } = require("../routes/watch");

function assert(c, msg) {
  if (!c) throw new Error("FAIL: " + msg);
}

async function call(base, method, path, { body, token } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

const FRIENDS = {
  "u-ayse": { id: "u-ayse", username: "ayse", displayName: "Ayşe", avatarUrl: "https://cdn.example/a.png", status: "online" },
  "u-mert": { id: "u-mert", username: "mert", displayName: null, avatarUrl: "data:image/png;base64,xx", status: "invisible" },
  "u-sn": { id: "u-sn", username: "sn1pez53", displayName: null, avatarUrl: null, status: "dnd" },
  "u-cold": { id: "u-cold", username: "?", displayName: null, avatarUrl: null, status: "offline" },
};

async function run() {
  resetLimits();
  const calls = [];
  const emitted = [];
  const saved = [];
  const dirty = [];
  const presence = new Map([["u-me", { status: "idle", socketId: "x" }]]);
  const router = createWatchRouter({
    io: { to: (room) => ({ emit: (event, payload) => emitted.push({ room, event, payload }) }) },
    actions: {
      async thread(userId, opts) {
        calls.push(["thread", userId, opts]);
        if (opts.conv === "dm:u-cold00") throw new NotifyActionError(404, "empty");
        if (opts.conv === "dm:u-stranger") throw new NotifyActionError(403, "not_allowed");
        return { conv: opts.conv, title: "Ekip", subtitle: "", messages: [
          { id: "m1", fromId: "u-ayse", fromName: "Ayşe", mine: false, kind: "text", text: "Selam", at: "2026-10-31T10:00:00Z" },
          { id: "m2", fromId: "u-me", fromName: "demirr", mine: true, kind: "image", text: "", at: "2026-10-31T10:01:00Z" },
        ] };
      },
      async reply(io, userId, payload) { calls.push(["reply", userId, payload]); return { messageId: "new-1" }; },
      async read(io, userId, payload) { calls.push(["read", userId, payload]); return { ok: true }; },
    },
    userProfile: {
      enrichFriendEntry: (id) => ({ ...FRIENDS[id] }),
      loadUserProfile: async (id) => ({ id, username: id === "u-admin" ? "admin" : "demirr", display_name: "Demir", avatar_url: null, presence_status: "dnd" }),
      savePresenceStatus: async (id, status) => { saved.push([id, status]); return true; },
    },
    dmMessages: {
      listAcceptedFriendIds: async () => Object.keys(FRIENDS),
      buildDmPreviewMaps: async () => ({
        dmPreviewsByPeer: { "u-ayse": "Akşam sesli kanala gelir misin?", "u-sn": "\u{1F4F7} Photo" },
        dmLastActivityByPeer: { "u-ayse": "2026-10-31T10:05:00Z", "u-sn": "2026-10-31T09:00:00Z" },
      }),
    },
    groupList: { getUserGroups: async () => [
      { id: "g-1", name: "Ekip", avatarUrl: null, lastMessage: "can: maç 21:00 de", lastActivity: "2026-10-31T10:07:00Z" },
      { id: "g-old", name: "Eski", removed: true, lastActivity: "2026-10-31T11:00:00Z" },
    ] },
    adminPermissions: {
      loadRow: async (id) => (id === "u-admin" ? { id, username: "admin", is_admin: true } : { id, is_admin: false }),
      sectionsFor: (user) => (user.username === "admin" ? ["overview", "reports", "feedback"] : []),
    },
    state: { presence, bannedUserIds: new Set() },
    presenceFanout: { markPresenceDirty: (id) => dirty.push(id) },
  });
  const app = express();
  app.use(express.json());
  app.use("/api/watch", router);
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const me = signToken({ id: "u-me", username: "demirr", sid: "s-1" });
  const admin = signToken({ id: "u-admin", username: "admin", sid: "s-2" });
  try {
    let r = await call(base, "GET", "/api/watch/home");
    assert(r.status === 401, "home needs a session");

    r = await call(base, "GET", "/api/watch/home", { token: me });
    assert(r.status === 200, `home 200 (${r.status} ${JSON.stringify(r.body)})`);
    const convs = r.body.conversations.map((c) => c.conv);
    assert(JSON.stringify(convs) === JSON.stringify(["group:g-1", "dm:u-ayse", "dm:u-sn"]), `newest first, no empty DM, no removed group (${convs})`);
    const sn = r.body.conversations.find((c) => c.conv === "dm:u-sn");
    assert(sn.preview === "Fotoğraf" && sn.presence === "dnd", `photo label in Turkish, presence kept (${JSON.stringify(sn)})`);
    assert(r.body.me.status === "idle" && r.body.me.initials === "DE", `live status wins, initials (${JSON.stringify(r.body.me)})`);
    assert(r.body.adminSections === null, "no admin menu for a normal account");
    assert(!JSON.stringify(r.body).includes("data:image"), "no data: avatars");

    r = await call(base, "GET", "/api/watch/home", { token: admin });
    assert(JSON.stringify(r.body.adminSections) === JSON.stringify(["overview", "reports", "feedback"]), "admin sections for an admin");

    r = await call(base, "GET", "/api/watch/thread?conv=group:g-1", { token: me });
    assert(r.status === 200 && r.body.messages.length === 2 && r.body.messages[1].text === "Fotoğraf" && r.body.messages[1].mine === true, `thread lines (${JSON.stringify(r.body)})`);
    const tcall = calls.find((c) => c[0] === "thread");
    assert(tcall[2].limit === 20 && tcall[2].textMax === 500, "thread asks for 20 longer lines");
    r = await call(base, "GET", "/api/watch/thread?conv=dm:u-cold00", { token: me });
    assert(r.status === 200 && r.body.messages.length === 0, "empty DM is an empty thread");
    r = await call(base, "GET", "/api/watch/thread?conv=dm:u-stranger", { token: me });
    assert(r.status === 403 && r.body.error === "not_allowed", "permission errors pass through");
    r = await call(base, "GET", "/api/watch/thread?conv=evil", { token: me });
    assert(r.status === 400, "bad conv is 400");

    r = await call(base, "POST", "/api/watch/send", { token: me, body: { conv: "dm:u-ayse", text: "  Geliyorum " } });
    assert(r.status === 200 && r.body.messageId === "new-1", "send ok");
    const sc = calls.find((c) => c[0] === "reply");
    assert(sc[1] === "u-me" && sc[2].text === "Geliyorum" && sc[2].conv === "dm:u-ayse", "send goes to the reply action trimmed");
    r = await call(base, "POST", "/api/watch/send", { token: me, body: { conv: "dm:u-ayse", text: "   " } });
    assert(r.status === 400, "empty text 400");
    r = await call(base, "POST", "/api/watch/send", { token: me, body: { conv: "dm:u-ayse", text: "x".repeat(1001) } });
    assert(r.status === 400, "too long 400");

    r = await call(base, "POST", "/api/watch/read", { token: me, body: { conv: "group:g-1" } });
    assert(r.status === 200 && calls.some((c) => c[0] === "read" && c[2].conv === "group:g-1"), "read ok");

    r = await call(base, "GET", "/api/watch/friends", { token: me });
    assert(r.status === 200 && r.body.onlineCount === 2 && r.body.offlineCount === 2, `online / offline split (${JSON.stringify(r.body)})`);
    assert(r.body.online[0].name === "Ayşe" && r.body.online[1].presence === "dnd", "online first, then dnd");
    assert(!JSON.stringify(r.body).includes("mert"), "invisible friend is never named");

    r = await call(base, "POST", "/api/watch/status", { token: me, body: { status: "busy" } });
    assert(r.status === 400, "unknown status 400");
    r = await call(base, "POST", "/api/watch/status", { token: me, body: { status: "dnd" } });
    assert(r.status === 200 && presence.get("u-me").status === "dnd", "live presence updated");
    assert(saved.some((s) => s[0] === "u-me" && s[1] === "dnd"), "status saved");
    assert(emitted.some((e) => e.room === "user:u-me" && e.event === "status:current" && e.payload.status === "dnd"), "other devices told");
    assert(dirty.includes("u-me"), "presence fan-out marked");

    let limited = false;
    for (let i = 0; i < 40; i += 1) {
      const x = await call(base, "POST", "/api/watch/read", { token: me, body: { conv: "group:g-1" } });
      if (x.status === 429) { limited = true; break; }
    }
    assert(limited, "writes are rate limited");
    console.log("watchApi.integration ok");
  } finally {
    server.close();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
