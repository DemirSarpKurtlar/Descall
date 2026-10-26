"use strict";
// routes/media.js upload hardening: one file per request, client file names
// cannot put path characters into the storage key.
process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";
process.env.MEDIA_PUBLIC_BASE_URL = "http://media.test";

const http = require("http");
const assert = require("node:assert/strict");
const { createFakeSupabase } = require("./fakeSupabase.cjs");
const fake = createFakeSupabase({
  users: [{ id: "u-alice", username: "alice", active_sessions: [{ id: "s-a" }] }],
  media_uploads: [],
});
const supabasePath = require.resolve("../db/supabase");
require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: fake };

const express = require("express");
const { signToken } = require("../config/jwt");
const media = require("../routes/media");

const alice = signToken({ id: "u-alice", username: "alice", sid: "s-a" });
const keys = () => [...(fake.storage._buckets.media?.keys() || [])];

(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/media", media);
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => res.status(400).json({ error: "upload rejected", code: err.code }));
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const send = (fd) => fetch(`${base}/api/media/upload`, { method: "POST", headers: { Authorization: `Bearer ${alice}` }, body: fd });
  try {
    let fd = new FormData();
    fd.append("file", new Blob([Buffer.from("x")], { type: "image/png" }), "ok.png");
    let res = await send(fd);
    assert.equal(res.status, 200, "normal upload works");
    assert.ok(keys().some((k) => /^images\/\d+-[a-z0-9]+\.png$/.test(k)), "png extension kept");

    fd = new FormData();
    fd.append("file", new Blob([Buffer.from("x")], { type: "image/png" }), "a./x/../evil");
    res = await send(fd);
    assert.equal(res.status, 200);
    const last = keys().at(-1);
    assert.match(last, /^images\/\d+-[a-z0-9]+\.bin$/, "path characters from the file name never reach the key");

    const before = keys().length;
    fd = new FormData();
    fd.append("file", new Blob([Buffer.from("x")], { type: "image/png" }), "1.png");
    fd.append("file", new Blob([Buffer.from("y")], { type: "image/png" }), "2.png");
    res = await send(fd);
    assert.notEqual(res.status, 200, "two files in one request rejected");
    assert.equal(keys().length, before, "nothing stored for rejected request");

    res = await fetch(`${base}/api/media/upload`, { method: "POST", body: new FormData() });
    assert.equal(res.status, 401, "anonymous upload refused");
    console.log("mediaUploadHardening: all checks passed");
  } finally {
    server.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
