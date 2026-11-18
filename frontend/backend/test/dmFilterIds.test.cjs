"use strict";
// Regression (security scan 17 Nov 2026): DM helpers put the peer id into PostgREST or()
// filters. isAcceptedFriend (cache miss) and dmPairFilter must refuse ids carrying PostgREST
// syntax, otherwise dm:pinned:list / dm:history / dm:message:pin could read or touch every
// row. The real supabase-js client talks to a local capture server (never production).
process.env.NODE_ENV = "test"; process.env.JWT_SECRET = "t";
const http = require("http");
const path = require("path");
const assert = require("assert");
const B = path.join(__dirname, "..");
const captured = [];
const pg = http.createServer((req, res) => {
  captured.push(decodeURIComponent(req.url));
  res.setHeader("content-type", "application/json");
  // Answer every read with one row, as a widened filter would.
  res.end(JSON.stringify([{ user_id: "x" }]));
});
(async () => {
  await new Promise((r) => pg.listen(0, "127.0.0.1", r));
  process.env.SUPABASE_URL = "http://127.0.0.1:" + pg.address().port;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "local-test-key";
  const dm = require(B + "/lib/dmMessages");
  const me = "11111111-1111-4111-8111-111111111111";
  for (const evil of ["x),or(id.not.is.null", "a,b", "a.b", "", 42, null]) {
    captured.length = 0;
    assert.strictEqual(await dm.isAcceptedFriend(me, evil), false, `refused: ${evil}`);
    assert.strictEqual(captured.length, 0, `no query for ${evil}`);
    assert.strictEqual(dm.isSafeFilterId(evil), false);
  }
  await assert.rejects(dm.loadDmMessages(me, "x),or(id.not.is.null"), (e) => e.code === "BAD_ID");
  assert.ok(!captured.some((u) => /not\.is\.null/.test(u)), "no widened filter was sent");
  // A plain id still queries (cache miss) and answers from the database.
  captured.length = 0;
  assert.strictEqual(await dm.isAcceptedFriend(me, "22222222-2222-4222-8222-222222222222"), true);
  assert.ok(captured.some((u) => u.includes("/friendships")), "valid id queries friendships");
  console.log("dmFilterIds test ok");
  pg.close();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
