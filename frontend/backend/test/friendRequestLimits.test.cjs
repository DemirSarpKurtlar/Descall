"use strict";
// Regression (polish scan 17 Nov 2026, world-social-05): a sender could loop
// POST /api/friends/request -> POST /api/friends/remove -> request and push the target
// every round. Now: at most 3 requests per pair in 24 h (429 after), and only the
// first one of a pair in 24 h is pushed. Runs on the fake db, push is stubbed.
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "t";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder";
const http = require("http");
const path = require("path");
const assert = require("assert");
const B = path.join(__dirname, "..");
const { createFakeSupabase } = require("./fakeSupabase.cjs");

const A = "11111111-1111-4111-8111-111111111111";
const T = "22222222-2222-4222-8222-222222222222";
const fake = createFakeSupabase({
  users: [{ id: A, username: "mallory", blocked_users: [] }, { id: T, username: "target", blocked_users: [] }],
  friendships: [],
});
const stub = (rel, exports) => {
  const p = require.resolve(path.join(B, rel));
  require.cache[p] = { id: p, filename: p, loaded: true, exports };
};
stub("db/supabase", fake);
stub("middleware/auth", { requireAuth: (req, _res, next) => { req.user = { id: A, username: "mallory" }; next(); } });
const pushes = [];
stub("lib/webPush", { sendFriendRequestPush: async (to) => { pushes.push(to); } });
stub("lib/reengage", { fire: () => {} });

(async () => {
  // Unit: per-sender cap across different targets.
  const lim = require(path.join(B, "lib/friendRequestLimits"));
  const now = Date.now();
  let refused = 0;
  for (let i = 0; i < lim.SENDER_MAX + 2; i += 1) {
    if (!lim.takeFriendRequest("sender-unit", `target-${i}`, now + i).ok) refused += 1;
  }
  assert.strictEqual(refused, 2, "sender cap");
  assert.strictEqual(lim.shouldPushFriendRequest("p", "q", now), true);
  assert.strictEqual(lim.shouldPushFriendRequest("p", "q", now + 1000), false, "second push in 24h skipped");
  assert.strictEqual(lim.shouldPushFriendRequest("p", "q", now + 25 * 3600e3), true, "after 24h again");

  const express = require(require.resolve("express", { paths: [B] }));
  const app = express();
  app.use(express.json());
  app.use("/api/friends", require(path.join(B, "routes/friends")));
  const srv = http.createServer(app);
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${srv.address().port}/api/friends`;
  const post = (p, body) => fetch(base + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

  const codes = [];
  for (let round = 0; round < 4; round += 1) {
    const r = await post("/request", { username: "target" });
    codes.push(r.status);
    if (r.status === 429) {
      const body = await r.json();
      assert.strictEqual(body.error, lim.TOO_MANY);
      assert.ok(r.headers.get("retry-after"), "Retry-After set");
    }
    await post("/remove", { friendId: T });
  }
  assert.deepStrictEqual(codes, [200, 200, 200, 429], `request loop: ${codes}`);
  assert.deepStrictEqual(pushes, [T], "only the first request of the pair pushed");
  console.log("friendRequestLimits test ok");
  srv.close();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
