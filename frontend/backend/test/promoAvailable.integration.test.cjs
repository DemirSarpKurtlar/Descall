"use strict";

/**
 * GET /api/promo/available end to end: Express + real requireAuth + the real database functions
 * (promoPg.attachRpc). Covers sign-in, the summary carrying no codes, the per-account rate limit,
 * marking seen, and the redeem flow (list → redeem → gone from the list, history has it).
 * The no-Postgres half (shape whitelist, 429 headers) runs everywhere; the rest skips without
 * PROMO_TEST_PG_URL. Never points at a real Supabase.
 */

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";

const http = require("http");
const { createFakeSupabase } = require("./fakeSupabase.cjs");
const pg = require("./promoPg.cjs");

const ME = "00000000-0000-4000-8000-000000000001";
const YOU = "00000000-0000-4000-8000-000000000002";
const ADMIN = "00000000-0000-4000-8000-0000000000aa";

const supabasePath = require.resolve("../db/supabase");
const fake = createFakeSupabase({
  users: [
    { id: ME, username: "ayse", is_admin: false, active_sessions: [{ id: "s-me" }] },
    { id: YOU, username: "mert", is_admin: false, active_sessions: [{ id: "s-you" }] },
  ],
});
require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: fake };

const express = require("express");
const { signToken } = require("../config/jwt");
const { resetLimits } = require("../lib/rateLimit");
const promoRouter = require("../routes/promo");

function assert(c, msg) {
  if (!c) throw new Error("FAIL: " + msg);
}

async function call(base, method, path, { body, token } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = {};
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, headers: res.headers, body: json, text };
}

async function withServer(fn) {
  const app = express();
  app.set("io", { to: () => ({ emit() {} }), emit() {} });
  app.use(express.json());
  app.use("/api/promo", promoRouter);
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  try {
    await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    server.close();
  }
}

const me = signToken({ id: ME, username: "ayse", sid: "s-me" });
const you = signToken({ id: YOU, username: "mert", sid: "s-you" });

/** No database: auth, the response whitelist, summary has no codes, 429 + Retry-After. */
async function withoutDb(base) {
  resetLimits();
  for (const [m, p] of [["GET", "/api/promo/available"], ["GET", "/api/promo/available?summary=1"], ["POST", "/api/promo/available/seen"]]) {
    const r = await call(base, m, p, { body: m === "POST" ? { ids: [] } : undefined });
    assert(r.status === 401, `${m} ${p} needs sign-in (got ${r.status})`);
  }
  const bad = signToken({ id: ME, username: "ayse", sid: "revoked" });
  assert((await call(base, "GET", "/api/promo/available", { token: bad })).status === 401, "revoked session refused");

  const ID = "11111111-2222-4333-8444-555555555555";
  fake.rpc = async (name) => {
    if (name !== "promo_available_for") return { data: { ok: true, marked: 0, unseen: 0 }, error: null };
    return {
      data: {
        items: [
          { id: ID, code: "K7QM2XRD9PLAV4TE", scope: "personal", reward: { type: "descoin", amount: 250, secret: "x" },
            message: "Selam", expiresAt: null, remaining: null, seen: false, created_by: ADMIN, max_uses: 9 },
          { id: "bad", code: "short", scope: "personal", reward: { type: "descoin", amount: 1 } },
          { id: "x2", code: "AAAABBBBCCCCDDDD", scope: "weird", reward: { type: "mystery" } },
        ],
        serverNow: "2026-10-27T10:00:00Z",
      },
      error: null,
    };
  };
  let r = await call(base, "GET", "/api/promo/available", { token: me });
  assert(r.status === 200 && r.headers.get("cache-control") === "no-store", "list ok, no-store");
  assert(r.body.items.length === 1 && r.body.count === 1 && r.body.unseen === 1, "malformed rows dropped: " + r.text);
  assert(JSON.stringify(Object.keys(r.body.items[0]).sort()) === JSON.stringify(["code", "expiresAt", "id", "message", "remaining", "reward", "scope", "seen"]), "whitelisted item fields");
  assert(!r.text.includes("secret") && !r.text.includes(ADMIN) && !r.text.includes("max_uses"), "no extra fields leak");
  r = await call(base, "GET", "/api/promo/available?summary=1", { token: me });
  assert(r.status === 200 && r.body.count === 1 && r.body.unseen === 1 && !r.text.includes("K7QM") && !r.body.items, "summary carries no codes: " + r.text);
  fake.rpc = async () => ({ data: null, error: { message: "boom" } });
  r = await call(base, "GET", "/api/promo/available", { token: me });
  assert(r.status >= 500 && !r.text.includes("boom"), "db error → 5xx without internals");

  // rate limit: 30 per minute per account (summary and list share it), then 429 + Retry-After
  resetLimits();
  fake.rpc = async () => ({ data: { items: [], serverNow: "2026-10-27T10:00:00Z" }, error: null });
  for (let i = 0; i < 30; i += 1) {
    r = await call(base, "GET", i % 2 ? "/api/promo/available" : "/api/promo/available?summary=1", { token: me });
    assert(r.status === 200, `call ${i + 1} allowed (got ${r.status})`);
  }
  r = await call(base, "GET", "/api/promo/available", { token: me });
  assert(r.status === 429 && Number(r.headers.get("retry-after")) > 0, "31st call → 429 + Retry-After");
  assert((await call(base, "GET", "/api/promo/available", { token: you })).status === 200, "other accounts unaffected");
  resetLimits();
  let seenCalls = 0;
  fake.rpc = async (name, args) => {
    seenCalls += 1;
    return { data: { ok: true, marked: args.p_code_ids.length, unseen: 0 }, error: null };
  };
  r = await call(base, "POST", "/api/promo/available/seen", { token: me, body: { ids: "nope" } });
  assert(r.status === 200 && r.body.marked === 0 && seenCalls === 0, "garbage ids never reach the database");
  r = await call(base, "POST", "/api/promo/available/seen", { token: me, body: { ids: [ID.toUpperCase(), ID, "x"] } });
  assert(r.status === 200 && r.body.marked === 1, "ids validated + deduped");
  resetLimits();
}

/** Real database: the redeem flow and the no-leak check through HTTP. */
async function withDb(base) {
  const db = pg.freshDb("availhttp", { migrations: ["20261026_special_badges.sql", "20261027_promo_available.sql"] });
  try {
    pg.attachRpc(fake, db.url);
    pg.q(db.url, `
      INSERT INTO users (id, username, created_at, last_seen) VALUES
        ('${ADMIN}', 'admin', now() AT TIME ZONE 'UTC' - interval '400 days', now() AT TIME ZONE 'UTC'),
        ('${ME}', 'ayse', now() AT TIME ZONE 'UTC' - interval '30 days', now() AT TIME ZONE 'UTC'),
        ('${YOU}', 'mert', now() AT TIME ZONE 'UTC' - interval '30 days', now() AT TIME ZONE 'UTC');
      INSERT INTO promo_codes (code_norm, reward_type, reward_amount, reward_ref, popup_audience, created_by) VALUES
        ('PUBLICAAAAAAAAA1', 'descoin', 25, NULL, 'all', '${ADMIN}'),
        ('MINEAAAAAAAAAAA2', 'descoin', 100, NULL, 'selected', '${ADMIN}'),
        ('YOURSAAAAAAAAAA3', 'descoin', 100, NULL, 'selected', '${ADMIN}'),
        ('SECRETAAAAAAAAA4', 'descoin', 999, NULL, 'none', '${ADMIN}'),
        ('BADGEAAAAAAAAAA5', 'special_badge', NULL, 'kurucu', 'selected', '${ADMIN}');
      INSERT INTO promo_popup_targets (code_id, user_id) SELECT id, '${ME}' FROM promo_codes WHERE code_norm IN ('MINEAAAAAAAAAAA2', 'BADGEAAAAAAAAAA5');
      INSERT INTO promo_popup_targets (code_id, user_id) SELECT id, '${YOU}' FROM promo_codes WHERE code_norm = 'YOURSAAAAAAAAAA3';
    `);
    let r = await call(base, "GET", "/api/promo/available", { token: me });
    assert(r.status === 200, "list " + r.status + r.text);
    const codes = r.body.items.map((i) => i.code).sort();
    assert(JSON.stringify(codes) === JSON.stringify(["BADGEAAAAAAAAAA5", "MINEAAAAAAAAAAA2", "PUBLICAAAAAAAAA1"]), "my list: " + codes);
    assert(!r.text.includes("YOURS") && !r.text.includes("SECRET"), "someone else's and hidden codes never in my response");
    assert(r.body.unseen === 3, "3 unseen");
    r = await call(base, "GET", "/api/promo/available?summary=1", { token: me });
    assert(r.body.count === 3 && r.body.unseen === 3 && !r.text.includes("AAAA"), "summary");

    // seen clears the settings badge, only for my ids
    const yours = pg.q(db.url, "SELECT id FROM promo_codes WHERE code_norm = 'YOURSAAAAAAAAAA3'");
    const mine = (await call(base, "GET", "/api/promo/available", { token: me })).body.items.map((i) => i.id);
    r = await call(base, "POST", "/api/promo/available/seen", { token: me, body: { ids: [...mine, yours] } });
    assert(r.status === 200 && r.body.marked === 3 && r.body.unseen === 0, "seen " + r.text);
    assert((await call(base, "GET", "/api/promo/available?summary=1", { token: me })).body.unseen === 0, "badge cleared");
    assert((await call(base, "GET", "/api/promo/available?summary=1", { token: you })).body.unseen === 2, "yours untouched (YOURS + PUBLIC)");

    // redeem flow: Kullan → reward → the card is gone, history has it
    r = await call(base, "POST", "/api/promo/redeem", { token: me, body: { code: "MINE-AAAA-AAAA-AAA2" } });
    assert(r.status === 200 && r.body.reward.amount === 100 && r.body.balance === 100, "redeem " + r.text);
    r = await call(base, "POST", "/api/promo/redeem", { token: me, body: { code: "BADGEAAAAAAAAAA5" } });
    assert(r.status === 200 && r.body.reward.type === "special_badge" && r.body.reward.badgeId === "kurucu", "badge redeem " + r.text);
    r = await call(base, "GET", "/api/promo/available", { token: me });
    assert(JSON.stringify(r.body.items.map((i) => i.code)) === JSON.stringify(["PUBLICAAAAAAAAA1"]), "used codes left the list: " + r.text);
    r = await call(base, "GET", "/api/promo/history", { token: me });
    assert(r.body.items.length === 2, "history has both");
    // someone else's code is still not redeemable by me (no leak through redeem either)
    r = await call(base, "POST", "/api/promo/redeem", { token: me, body: { code: "YOURSAAAAAAAAAA3" } });
    assert(r.status !== 200, "not my code");
  } finally {
    db.drop();
  }
}

(async () => {
  await withServer(async (base) => {
    await withoutDb(base);
    if (pg.available()) await withDb(base);
    else console.log("promoAvailable.integration.test.cjs: database half skipped (set PROMO_TEST_PG_URL)");
  });
  console.log("promoAvailable.integration.test.cjs: ok");
})().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
