"use strict";

/**
 * 3.7.33 Apple Watch tabs (/api/watch/servers, /calls, /activity): session required,
 * only text channels the member may view (buildMyServerList already filters), no voice /
 * stage / category / nsfw channels, https icons only, call history without recordings,
 * missed = incoming missed / cancelled ring, activity = incoming friend requests + the
 * last 7 days of missed calls, newest first. Pure shapers are checked directly too.
 */

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";

const http = require("http");
const { createFakeSupabase } = require("./fakeSupabase.cjs");

const now = Date.now();
const iso = (minAgo) => new Date(now - minAgo * 60000).toISOString();

const supabasePath = require.resolve("../db/supabase");
const fake = createFakeSupabase({
  users: [
    { id: "u-me", username: "demirr", active_sessions: [{ id: "s-1" }] },
    { id: "u-ayse", username: "ayse", display_name: "Ayşe", avatar_url: "https://cdn.example/a.png" },
    { id: "u-can", username: "can", display_name: null, avatar_url: "http://insecure/x.png" },
  ],
  friendships: [
    { user_id: "u-ayse", friend_id: "u-me", status: "pending", created_at: iso(5) },
    { user_id: "u-can", friend_id: "u-me", status: "accepted", created_at: iso(50) },
  ],
});
require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: fake };

const express = require("express");
const { signToken } = require("../config/jwt");
const { resetLimits } = require("../lib/rateLimit");
const { createWatchRouter } = require("../routes/watch");
const watch = require("../lib/watchApi");

function assert(c, msg) {
  if (!c) throw new Error("FAIL: " + msg);
}

async function call(base, path, token) {
  const res = await fetch(base + path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

const SERVERS = {
  servers: [
    {
      id: "s-1", name: "Descall Topluluk", iconUrl: "https://cdn.example/s.png", memberCount: 120, notificationLevel: "muted",
      timeoutUntil: new Date(now + 3600000).toISOString(),
      channels: [
        { id: "cat-1", type: "category", name: "Genel", position: 0 },
        { id: "c-gen", type: "text", name: "genel", parentId: "cat-1", position: 2 },
        { id: "c-duy", type: "announcement", name: "duyurular", parentId: "cat-1", position: 1 },
        { id: "c-voice", type: "voice", name: "Sesli", position: 3 },
        { id: "c-stage", type: "stage", name: "Sahne", position: 4 },
        { id: "c-nsfw", type: "text", name: "nsfw", nsfw: true, position: 5 },
        { id: "bad id!", type: "text", name: "kötü", position: 6 },
      ],
    },
    { id: "s-2", name: "Oyun", iconUrl: "data:image/png;base64,xx", memberCount: 3, channels: [] },
  ],
};

const CALLS = [
  { id: "c1", kind: "dm", direction: "incoming", callType: "voice", status: "missed", createdAt: iso(10), peer: { id: "u-ayse", username: "ayse", displayName: "Ayşe" } },
  { id: "c2", kind: "dm", direction: "outgoing", callType: "video", status: "missed", createdAt: iso(20), peer: { id: "u-can", username: "can" } },
  { id: "c3", kind: "dm", direction: "incoming", callType: "video", status: "cancelled", createdAt: iso(30), peer: { id: "u-can", username: "can" } },
  { id: "c4", kind: "dm", direction: "incoming", callType: "voice", status: "completed", durationSeconds: 125.4, createdAt: iso(40), peer: { id: "u-can", username: "can" } },
  { id: "group-9", kind: "group", callType: "voice", status: "missed", createdAt: iso(60 * 24 * 9), group: { id: "g-1", name: "Ekip" } },
  { id: "c5", kind: "dm", direction: "incoming", callType: "voice", status: "declined", createdAt: iso(70), peer: { id: "u-ayse", username: "ayse" } },
];

async function run() {
  resetLimits();
  const asked = [];
  const router = createWatchRouter({
    serverList: async (userId) => { asked.push(["servers", userId]); return SERVERS; },
    callLog: async (userId, opts) => { asked.push(["calls", userId, opts]); return CALLS; },
    state: { presence: new Map(), bannedUserIds: new Set() },
  });
  const app = express();
  app.use(express.json());
  app.use("/api/watch", router);
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const me = signToken({ id: "u-me", username: "demirr", sid: "s-1" });
  try {
    for (const p of ["/servers", "/calls", "/activity"]) {
      const r = await call(base, "/api/watch" + p);
      assert(r.status === 401, `${p} needs a session`);
    }

    let r = await call(base, "/api/watch/servers", me);
    assert(r.status === 200, `servers 200 (${r.status})`);
    const s1 = r.body.servers[0];
    assert(JSON.stringify(s1.channels.map((c) => c.conv)) === JSON.stringify(["channel:c-duy", "channel:c-gen"]), `text channels only, by position (${JSON.stringify(s1.channels)})`);
    assert(s1.channels[0].category === "Genel", "category name kept");
    assert(s1.muted === true && s1.timedOut === true && s1.initials === "DT", `flags + initials (${JSON.stringify(s1)})`);
    assert(r.body.servers[1].iconUrl === null, "no data: icons");
    assert(asked.some((a) => a[0] === "servers" && a[1] === "u-me"), "list asked for the signed-in user");

    r = await call(base, "/api/watch/calls", me);
    assert(r.status === 200 && r.body.calls.length === 6, `calls 200 (${JSON.stringify(r.body)})`);
    const byId = Object.fromEntries(r.body.calls.map((c) => [c.id, c]));
    assert(byId.c1.missed && !byId.c2.missed && byId.c3.missed && !byId.c4.missed && !byId.c5.missed, "missed only for incoming missed / cancelled rings");
    assert(byId.c4.durationSec === 125 && byId.c2.video === true && byId.c1.conv === "dm:u-ayse", "duration, video, conv");
    assert(byId["group-9"].kind === "group" && byId["group-9"].conv === "group:g-1" && byId["group-9"].direction === "group", "group call");
    assert(!JSON.stringify(r.body).toLowerCase().includes("record"), "no recording fields");
    assert(asked.find((a) => a[0] === "calls")[2].limit === 25, "small page");

    r = await call(base, "/api/watch/activity", me);
    assert(r.status === 200, `activity 200 (${r.status} ${JSON.stringify(r.body)})`);
    assert(r.body.requestCount === 1 && r.body.missedCount === 2, `counts (${JSON.stringify(r.body)})`);
    assert(JSON.stringify(r.body.items.map((i) => i.id)) === JSON.stringify(["req:u-ayse", "call:c1", "call:c3"]), `newest first, old group call dropped (${JSON.stringify(r.body.items)})`);
    assert(r.body.items[2].type === "missedVideo" && r.body.items[0].type === "friendRequest", "item types");

    // Pure shapers stay safe on junk input.
    assert(JSON.stringify(watch.shapeServers(null)) === '{"servers":[]}', "servers on null");
    assert(JSON.stringify(watch.shapeCalls("x")) === '{"calls":[]}', "calls on junk");
    assert(watch.shapeActivity({}).items.length === 0, "activity on nothing");
    console.log("watchTabs.integration ok");
  } finally {
    server.close();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
