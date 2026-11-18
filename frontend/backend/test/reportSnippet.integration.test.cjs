"use strict";
// Regression (security scan 17 Nov 2026): POST /api/reports stored the client's "snippet" as
// is, and the moderation desk listed it as a message written by the target, so anyone could
// make it look like an innocent user wrote something. The quote is now taken from the real
// message (written by the target, visible to the reporter) or not kept at all.
process.env.NODE_ENV = "test"; process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.SUPABASE_URL = "https://placeholder.supabase.co"; process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";
const assert = require("assert");
const http = require("http");
const express = require("express");
const { createFakeSupabase } = require("./fakeSupabase.cjs");
const T = "22222222-2222-4222-8222-222222222222", R = "11111111-1111-4111-8111-111111111111", O = "33333333-3333-4333-8333-333333333333";
const fake = createFakeSupabase({
  users: [
    { id: R, username: "reporter", active_sessions: [{ id: "s-r" }] },
    { id: T, username: "target", active_sessions: [] },
    { id: O, username: "other", active_sessions: [] },
  ],
  user_reports: [], flagged_messages: [],
  dm_messages: [
    { id: "dm-real", from_user_id: T, to_user_id: R, content: "gercek mesaj", created_at: "2026-11-17T20:00:00Z" },
    { id: "dm-other", from_user_id: T, to_user_id: O, content: "baskasina yazilan", created_at: "2026-11-17T20:00:00Z" },
  ],
});
require.cache[require.resolve("../db/supabase")] = { id: "s", filename: "s", loaded: true, exports: fake };
const { signToken } = require("../config/jwt");
const app = express();
app.set("io", { to() { return { emit() {} }; }, emit() {} });
app.use(express.json());
app.use("/api/reports", require("../routes/reports"));
(async () => {
  const srv = http.createServer(app); await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const tok = signToken({ id: R, username: "reporter", sid: "s-r" });
  const report = (contextId, snippet, reason) => fetch("http://127.0.0.1:" + srv.address().port + "/api/reports", {
    method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + tok },
    body: JSON.stringify({ targetId: T, reason, contextType: "dm", contextId, snippet }),
  });
  const rows = () => fake._tables.user_reports.rows;
  // A real message to the reporter: the stored quote is the message's own text.
  assert.strictEqual((await report("dm-real", "uydurma metin", "harassment")).status, 201);
  assert.strictEqual(rows().at(-1).snippet, "gercek mesaj", "quote comes from the database");
  // An invented quote with no such message, or a message the reporter never received: no quote.
  assert.strictEqual((await report("does-not-exist", "I will find where you live", "spam")).status, 201);
  assert.strictEqual(rows().at(-1).snippet, null, "invented text is not kept");
  assert.strictEqual((await report("dm-other", "x", "other")).status, 201);
  assert.strictEqual(rows().at(-1).snippet, null, "a DM between other people is not quoted");
  const desk = require("../lib/moderationDesk");
  const compiled = require("../lib/contentFilterCore").compileRules([]);
  const list = await desk.listFlagged({ status: "pending", source: "all" }, { compiled });
  const items = Array.isArray(list) ? list : list.items || [];
  assert.ok(!items.some((i) => String(i.content || "").includes("find where you live")), "desk never shows the invented text");
  console.log("reportSnippet test ok");
  srv.close();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
