"use strict";
// Private chat media (2.11.2): upload purpose=message → private bucket, signed URL route,
// refresh only for conversation members, outgoing JSON / Socket.IO rewrite of stored refs.
// Run from frontend/: node backend/test/privateMedia.integration.test.cjs
process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";
process.env.MEDIA_PUBLIC_BASE_URL = "http://media.test";

const http = require("http");
const zlib = require("zlib");
const assert = require("node:assert/strict");
const { createFakeSupabase } = require("./fakeSupabase.cjs");
const fake = createFakeSupabase({
  users: [
    { id: "u-alice", username: "alice", active_sessions: [{ id: "s-a" }] },
    { id: "u-bob", username: "bob", active_sessions: [{ id: "s-b" }] },
    { id: "u-eve", username: "eve", active_sessions: [{ id: "s-e" }] },
  ],
  dm_messages: [],
  media_uploads: [],
  group_members: [],
  server_members: [],
  group_messages: [],
  server_messages: [],
});
const supabasePath = require.resolve("../db/supabase");
require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: fake };

const express = require("express");
const { Server } = require("socket.io");
const { io: ioClient } = require("socket.io-client");
const { signToken } = require("../config/jwt");
const pm = require("../lib/privateMedia");
const media = require("../routes/media");

const tok = (id, sid) => signToken({ id, username: id.slice(2), sid });
const alice = tok("u-alice", "s-a");
const bob = tok("u-bob", "s-b");
const eve = tok("u-eve", "s-e");

(async () => {
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server);
  pm.installPrivateMediaHooks({ io, express });
  app.use(express.json());
  app.use(require("../middleware/gzipJson"));
  app.use("/api/media", media);
  const big = "x".repeat(4000);
  app.get("/echo", (_req, res) => res.json({ big, m: { media_url: "sb://media-private/images/5-a.png" } }));
  app.get("/echo-small", (_req, res) => res.json({ media_url: "sb://media-private/images/5-a.png" }));
  const sharedPayload = { media_url: "sb://media-private/files/6-b.pdf" };
  io.on("connection", (socket) => {
    socket.join("room");
    socket.emit("direct", sharedPayload);
    socket.on("ask", (cb) => cb({ list: [sharedPayload] }));
    socket.on("go", () => io.to("room").emit("broadcast", sharedPayload));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    // Upload with purpose=message lands in the private bucket and returns a signed URL.
    const fd = new FormData();
    fd.append("purpose", "message");
    fd.append("file", new Blob([Buffer.from("PNGDATA")], { type: "image/png" }), "a.png");
    let res = await fetch(`${base}/api/media/upload`, { method: "POST", headers: { Authorization: `Bearer ${alice}` }, body: fd });
    assert.equal(res.status, 200);
    const up = await res.json();
    assert.match(up.url, /^http:\/\/media\.test\/api\/media\/f\/images\/[\w.-]+\?e=\d+&s=/);
    const path = pm.parseMediaUrl(up.url).path;
    assert.ok(fake.storage._buckets["media-private"].has(path), "stored in private bucket");
    assert.ok(!fake.storage._buckets.media?.has(path), "not in public bucket");
    const row = fake._tables.media_uploads.rows.at(-1);
    assert.equal(row.public_url, `sb://media-private/${path}`, "media_uploads keeps the ref, not a URL");

    // Without purpose (group photo, server icon, old clients) the upload stays public.
    const fd2 = new FormData();
    fd2.append("file", new Blob([Buffer.from("x")], { type: "image/png" }), "icon.png");
    res = await fetch(`${base}/api/media/upload`, { method: "POST", headers: { Authorization: `Bearer ${alice}` }, body: fd2 });
    const pub = await res.json();
    assert.match(pub.url, /\/object\/public\/media\/images\//);

    // Signed route: valid → 302 to a Supabase signed URL; tampered → 403.
    const local = up.url.replace("http://media.test", base);
    res = await fetch(local, { redirect: "manual" });
    assert.equal(res.status, 302);
    assert.match(res.headers.get("location"), /\/object\/sign\/media-private\//);
    res = await fetch(local.replace(/s=[^&]+/, "s=AAAA"), { redirect: "manual" });
    assert.equal(res.status, 403);
    res = await fetch(`${base}/api/media/f/images/%2e%2e%2f%2e%2e%2fx?e=1&s=1`, { redirect: "manual" });
    assert.ok(res.status === 403 || res.status === 404);

    // Refresh: alice (uploader) and bob (DM recipient) get a fresh URL, eve gets nothing.
    fake._tables.dm_messages.rows.push({ from_user_id: "u-alice", to_user_id: "u-bob", media_url: `sb://media-private/${path}` });
    const refresh = async (token, urls) => {
      const r = await fetch(`${base}/api/media/refresh`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ urls }),
      });
      return { status: r.status, body: await r.json() };
    };
    const expired = `http://media.test/api/media/f/${path}?e=1&s=old`;
    let r = await refresh(bob, [expired]);
    assert.equal(r.status, 200);
    assert.ok(r.body.urls[expired]?.includes(`/api/media/f/${path}?e=`), "member gets a fresh URL");
    r = await refresh(eve, [expired]);
    assert.deepEqual(r.body.urls, {}, "non-member gets nothing");
    r = await refresh(alice, [`https://placeholder.supabase.co/storage/v1/object/public/media/${path}`]);
    assert.equal(Object.keys(r.body.urls).length, 1, "legacy public URL can be exchanged by a member");
    res = await fetch(`${base}/api/media/refresh`, { method: "POST" });
    assert.equal(res.status, 401);

    // Outgoing JSON (plain and gzip path) carries signed URLs, never refs.
    res = await fetch(`${base}/echo-small`);
    let body = await res.json();
    assert.match(body.media_url, /\/api\/media\/f\/images\/5-a\.png\?e=/);
    const raw = await new Promise((resolve, reject) => {
      http.get(`${base}/echo`, { headers: { "Accept-Encoding": "gzip" } }, (resp) => {
        const chunks = [];
        resp.on("data", (c) => chunks.push(c));
        resp.on("end", () => resolve({ enc: resp.headers["content-encoding"], buf: Buffer.concat(chunks) }));
      }).on("error", reject);
    });
    assert.equal(raw.enc, "gzip");
    body = JSON.parse(zlib.gunzipSync(raw.buf).toString());
    assert.match(body.m.media_url, /\/api\/media\/f\/images\/5-a\.png\?e=/);

    // Socket.IO: direct emit, ack and room broadcast are rewritten; shared object untouched.
    const client = ioClient(base, { transports: ["websocket"] });
    const direct = await new Promise((resolve) => client.once("direct", resolve));
    assert.match(direct.media_url, /\/api\/media\/f\/files\/6-b\.pdf\?e=/);
    const ack = await new Promise((resolve) => client.emit("ask", resolve));
    assert.match(ack.list[0].media_url, /\/api\/media\/f\/files\/6-b\.pdf\?e=/);
    const bc = new Promise((resolve) => client.once("broadcast", resolve));
    client.emit("go");
    assert.match((await bc).media_url, /\/api\/media\/f\/files\/6-b\.pdf\?e=/);
    assert.equal(sharedPayload.media_url, "sb://media-private/files/6-b.pdf", "server-side object not mutated");
    client.close();
    console.log("privateMedia integration OK");
  } finally {
    io.close();
    server.close();
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
