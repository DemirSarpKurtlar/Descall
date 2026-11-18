"use strict";
// Regression (polish scan 17 Nov 2026, world-social-12): POST /api/friends/block stored any
// string in users.blocked_users and reported success even when the database write failed.
process.env.NODE_ENV = "test";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder";
const http = require("http");
const path = require("path");
const assert = require("assert");
const B = path.join(__dirname, "..");
const { createFakeSupabase } = require("./fakeSupabase.cjs");
const ME = "11111111-1111-4111-8111-111111111111";
const T = "22222222-2222-4222-8222-222222222222";
const fake = createFakeSupabase({
  users: [{ id: ME, username: "me", blocked_users: [] }, { id: T, username: "t", blocked_users: [] }],
  friendships: [],
});
const stub = (rel, exports) => {
  const p = require.resolve(path.join(B, rel));
  require.cache[p] = { id: p, filename: p, loaded: true, exports };
};
stub("db/supabase", fake);
stub("middleware/auth", { requireAuth: (req, _res, next) => { req.user = { id: ME, username: "me" }; next(); } });

(async () => {
  const express = require(require.resolve("express", { paths: [B] }));
  const app = express();
  app.use(express.json());
  app.use("/api/friends", require(path.join(B, "routes/friends")));
  const srv = http.createServer(app);
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${srv.address().port}/api/friends`;
  const post = (p, body) => fetch(base + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const stored = () => fake._tables.users.rows.find((r) => r.id === ME).blocked_users;

  assert.strictEqual((await post("/block", { userId: "x".repeat(5000) })).status, 400, "garbage id refused");
  assert.strictEqual((await post("/block", { userId: "a),or(x" })).status, 400, "filter characters refused");
  assert.strictEqual((await post("/block", { userId: "33333333-3333-4333-8333-333333333333" })).status, 404, "unknown user");
  assert.deepStrictEqual(stored(), [], "nothing stored");

  const ok = await post("/block", { userId: T });
  assert.strictEqual(ok.status, 200);
  assert.deepStrictEqual(stored(), [T]);

  // A failed write is reported and the cache does not claim the change.
  const realFrom = fake.from.bind(fake);
  fake.from = (table) => {
    const q = realFrom(table);
    if (table === "users") {
      const realUpdate = q.update.bind(q);
      q.update = (...a) => { const u = realUpdate(...a); u.eq = () => Promise.resolve({ data: null, error: { message: "boom" } }); return u; };
    }
    return q;
  };
  const failed = await post("/unblock", { userId: T });
  assert.strictEqual(failed.status, 500, "write failure is not success");
  fake.from = realFrom;
  const list = await (await fetch(base + "/blocked")).json();
  assert.deepStrictEqual(list.blocked.map((u) => u.id), [T], "still blocked after the failed unblock");
  console.log("blockList test ok");
  srv.close();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
