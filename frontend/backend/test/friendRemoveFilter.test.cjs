"use strict";
// Regression (security scan 17 Nov 2026, P0): POST /api/friends/remove (routes/friends.js:272) and socket friend:remove
// (socket/handlers.js:594) put the client's friendId straight into a PostgREST or=()
// filter on a DELETE. A crafted friendId turns it into "match every row".
// The real supabase-js client talks to a local capture server (never production).
process.env.NODE_ENV = "test"; process.env.JWT_SECRET = "t";
const http = require("http");
const path = require("path");
const B = path.join(__dirname, "..");
const captured = [];
const pg = http.createServer((req, res) => {
  captured.push({ method: req.method, url: decodeURIComponent(req.url) });
  res.setHeader("content-type", "application/json");
  res.end(req.method === "DELETE" ? "" : "[]");
});
(async () => {
  await new Promise((r) => pg.listen(0, "127.0.0.1", r));
  process.env.SUPABASE_URL = "http://127.0.0.1:" + pg.address().port;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "local-test-key";
  // Auth is not under test: a stub puts the caller on req.user.
  const authPath = require.resolve(B + "/middleware/auth");
  require.cache[authPath] = { id: authPath, filename: authPath, loaded: true, exports: { requireAuth: (req, _res, next) => { req.user = { id: "11111111-1111-4111-8111-111111111111", username: "mallory" }; next(); } } };
  const express = require(require.resolve("express", { paths: [B] }));
  const app = express(); app.use(express.json()); app.use("/api/friends", require(B + "/routes/friends"));
  const srv = http.createServer(app); await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const assert = require("assert");
  const base = "http://127.0.0.1:" + srv.address().port + "/api/friends/remove";
  const post = (friendId) => fetch(base, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ friendId }) });
  // A crafted friendId that would widen the or() filter to every row: rejected, no DELETE sent.
  for (const evil of ["00000000-0000-4000-8000-000000000000),or(user_id.not.is.null", "x,user_id.neq.0", "a.b", 42]) {
    captured.length = 0;
    const r = await post(evil);
    assert.strictEqual(r.status, 400, `rejected: ${evil}`);
    assert.ok(!captured.some((c) => c.method === "DELETE"), `no DELETE for ${evil}`);
  }
  // A real friend id still removes exactly that pair.
  captured.length = 0;
  const ok = await post("22222222-2222-4222-8222-222222222222");
  const del = captured.find((c) => c.method === "DELETE" && c.url.includes("/friendships"));
  assert.ok(del, "valid id deletes");
  assert.ok(!/not\.is\.null|neq/.test(del.url), "filter stays the pair");
  void ok;
  console.log("friendRemoveFilter test ok");
  srv.close(); pg.close();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
