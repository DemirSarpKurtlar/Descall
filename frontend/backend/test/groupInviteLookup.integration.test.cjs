"use strict";
// Regression (security scan 17 Nov 2026): group invite codes came from Math.random and the
// public GET /api/groups/invite-links/:code had no limit. Codes are now 10 characters from
// crypto.randomInt, and unknown codes are counted per IP (429 after 60 misses).
process.env.NODE_ENV = "test"; process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.SUPABASE_URL = "https://placeholder.supabase.co"; process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";
const assert = require("assert");
const http = require("http");
const express = require("express");
const { createFakeSupabase } = require("./fakeSupabase.cjs");
const fake = createFakeSupabase({
  groups: [{ id: "g1", name: "Ekip", avatar_url: null, created_by: "u1" }],
  group_members: [{ group_id: "g1", user_id: "u1" }],
  group_invite_links: [{ code: "AbCd2345", group_id: "g1", creator_id: "u1", max_uses: null, uses: 0, expires_at: null, created_at: "2026-11-17T00:00:00Z" }],
  users: [{ id: "u1", username: "u1" }],
});
require.cache[require.resolve("../db/supabase")] = { id: "s", filename: "s", loaded: true, exports: fake };
const app = express(); app.use(express.json()); app.use("/api/groups", require("../routes/groups"));
(async () => {
  const srv = http.createServer(app); await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const get = (code) => fetch("http://127.0.0.1:" + srv.address().port + "/api/groups/invite-links/" + encodeURIComponent(code));
  assert.strictEqual((await get("AbCd2345")).status, 200, "an existing 8-character code still works");
  let limited = false;
  for (let i = 0; i < 80 && !limited; i += 1) limited = (await get("Zz" + String(i).padStart(6, "0"))).status === 429;
  assert.ok(limited, "guessing unknown codes is rate limited");
  console.log("groupInviteLookup test ok");
  srv.close();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
