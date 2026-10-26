"use strict";

/**
 * Promo-code HTTP layer: server-side admin authorisation, error → status mapping
 * (409/429 + Retry-After), balance socket event, popup nudges that never carry the code,
 * and that the database functions get normalised input. The database functions themselves
 * are covered by promo.db.test.cjs / promo.race.test.cjs on a real Postgres.
 */

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";
delete process.env.PROMO_RISK_UNKNOWN;

const http = require("http");
const { createFakeSupabase } = require("./fakeSupabase.cjs");

const supabasePath = require.resolve("../db/supabase");
const fake = createFakeSupabase({
  users: [
    { id: "u-admin", username: "demir", is_admin: true, active_sessions: [{ id: "s-a" }] },
    { id: "u-user", username: "ayse", is_admin: false, active_sessions: [{ id: "s-u" }] },
  ],
  shop_items: [
    { id: "i-1", name: "Aurora afişi", category: "banner", price_descoin: 400, active: true },
    { id: "i-2", name: "Eski", category: "frame", price_descoin: 100, active: false },
  ],
});
const calls = [];
let next = {};
fake.rpc = async (name, args) => {
  calls.push({ name, args });
  const r = next[name];
  if (r instanceof Error) return { data: null, error: { message: r.message } };
  return { data: typeof r === "function" ? r(args) : r ?? null, error: null };
};
require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: fake };

const express = require("express");
const { signToken } = require("../config/jwt");
const adminRouter = require("../routes/admin");
const promoRouter = require("../routes/promo");

const emitted = [];
const io = {
  emit: (event, payload) => emitted.push({ room: "*", event, payload }),
  to: (room) => ({ emit: (event, payload) => emitted.push({ room, event, payload }) }),
};

function assert(c, msg) {
  if (!c) throw new Error("FAIL: " + msg);
}

async function call(base, method, path, { body, token } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, headers: res.headers, body: await res.json().catch(() => ({})) };
}

async function run() {
  const app = express();
  app.set("io", io);
  app.use(express.json());
  app.use("/api/admin", adminRouter);
  app.use("/api/promo", promoRouter);
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const admin = signToken({ id: "u-admin", username: "demir", sid: "s-a" });
  const user = signToken({ id: "u-user", username: "ayse", sid: "s-u" });
  const CODE_ID = "11111111-2222-4333-8444-555555555555";
  try {
    // --- authorisation is enforced on the server
    for (const [m, p] of [["GET", "/api/admin/promo-codes"], ["POST", "/api/admin/promo-codes"], ["GET", "/api/admin/promo-codes/generate"],
      ["PATCH", `/api/admin/promo-codes/${CODE_ID}`], ["GET", `/api/admin/promo-codes/${CODE_ID}/redemptions`],
      ["GET", "/api/admin/promo-codes/users?q=ay"], ["GET", "/api/admin/promo-codes/shop-items"]]) {
      let r = await call(base, m, p, { body: m === "GET" ? undefined : {} });
      assert(r.status === 401, `anonymous refused on ${m} ${p}`);
      r = await call(base, m, p, { token: user, body: m === "GET" ? undefined : { rewardType: "descoin", rewardAmount: 999999 } });
      assert(r.status === 403, `non-admin refused on ${m} ${p}: ${r.status}`);
    }
    assert(!calls.some((c) => c.name === "promo_admin_create"), "non-admin never reached the database");
    for (const p of ["/api/promo/history", "/api/promo/popup"]) {
      assert((await call(base, "GET", p)).status === 401, "user routes need sign-in: " + p);
    }
    assert((await call(base, "POST", "/api/promo/redeem", { body: { code: "x" } })).status === 401, "redeem needs sign-in");

    // --- admin create: input cleaned, random code when none given, nudges carry only the id
    let r = await call(base, "GET", "/api/admin/promo-codes/generate", { token: admin });
    assert(r.status === 200 && /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{16}$/.test(r.body.code), "generated code alphabet");

    next.promo_admin_create = (a) => ({ ok: true, id: CODE_ID, code: a.p.code });
    r = await call(base, "POST", "/api/admin/promo-codes", { token: admin, body: {
      code: "k7qm-2xrd-9pla-v4te", rewardType: "descoin", rewardAmount: "250", maxUses: "250",
      message: "  2.14 için teşekkürler!  ", popupAudience: "all", minAccountAgeDays: 7, expiresAt: "2026-10-31T20:59:00.000Z",
    } });
    assert(r.status === 201 && r.body.code === "K7QM2XRD9PLAV4TE", "created: " + JSON.stringify(r.body));
    const sent = calls.at(-1);
    assert(sent.args.p_admin_id === "u-admin", "admin id comes from the token, not the body");
    assert(sent.args.p.rewardAmount === 250 && sent.args.p.maxUses === 250 && sent.args.p.message === "2.14 için teşekkürler!", "cleaned input");
    const nudge = emitted.find((e) => e.event === "promo:popup");
    assert(nudge && nudge.room === "*" && JSON.stringify(nudge.payload) === JSON.stringify({ id: CODE_ID }), "broadcast nudge has no code");

    emitted.length = 0;
    r = await call(base, "POST", "/api/admin/promo-codes", { token: admin, body: {
      rewardType: "descoin", rewardAmount: 50, maxUses: 1, popupAudience: "selected", targetUserIds: ["aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", "nope"],
    } });
    assert(r.status === 201 && /^[A-Z2-9]{16}$/.test(r.body.code), "random code when none typed");
    assert(JSON.stringify(calls.at(-1).args.p.targetUserIds) === JSON.stringify(["aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"]), "invalid target ids dropped");
    assert(emitted.length === 1 && emitted[0].room === "user:aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", "personal code nudges only its target");

    emitted.length = 0;
    r = await call(base, "POST", "/api/admin/promo-codes", { token: admin, body: { rewardType: "descoin", rewardAmount: 5, active: false, popupAudience: "all" } });
    assert(r.status === 201 && emitted.length === 0, "inactive code: no popup nudge");

    next.promo_admin_create = { ok: false, error: "code_taken" };
    r = await call(base, "POST", "/api/admin/promo-codes", { token: admin, body: { rewardType: "descoin", rewardAmount: 5 } });
    assert(r.status === 409 && r.body.code === "code_taken", "duplicate code → 409");
    r = await call(base, "POST", "/api/admin/promo-codes", { token: admin, body: { rewardType: "descoin", rewardAmount: 5, maxUses: -3 } });
    assert(r.status === 400 && r.body.code === "invalid_input", "bad limit → 400");

    next.promo_admin_update = { ok: true };
    r = await call(base, "PATCH", `/api/admin/promo-codes/${CODE_ID}`, { token: admin, body: { active: false } });
    assert(r.status === 200 && calls.at(-1).args.p.active === false, "pause");
    r = await call(base, "PATCH", "/api/admin/promo-codes/not-a-uuid", { token: admin, body: { active: false } });
    assert(r.status === 404, "bad id");
    next.promo_admin_update = { ok: false, error: "max_below_used" };
    r = await call(base, "PATCH", `/api/admin/promo-codes/${CODE_ID}`, { token: admin, body: { maxUses: 1 } });
    assert(r.status === 400 && r.body.code === "max_below_used", "limit below used count");

    next.promo_admin_overview = { kpis: { activeCodes: 1 }, codes: [] };
    r = await call(base, "GET", "/api/admin/promo-codes", { token: admin });
    assert(r.status === 200 && r.body.kpis.activeCodes === 1, "overview");
    r = await call(base, "GET", "/api/admin/promo-codes/shop-items", { token: admin });
    assert(r.status === 200 && r.body.items.length === 1 && r.body.items[0].id === "i-1", "only active shop items");
    r = await call(base, "GET", "/api/admin/promo-codes/users?q=a", { token: admin });
    assert(r.status === 200 && Array.isArray(r.body.users), "one letter already searches (closest match first)");
    r = await call(base, "GET", "/api/admin/promo-codes/users?q=ay%25", { token: admin });
    assert(r.status === 200 && Array.isArray(r.body.users), "user search");

    // --- redeem
    next.promo_redeem = { ok: true, codeId: CODE_ID, reward: { type: "descoin", amount: 250 }, balance: 1500 };
    emitted.length = 0;
    r = await call(base, "POST", "/api/promo/redeem", { token: user, body: { code: "k7qm–2xrd 9pla-v4te" } });
    assert(r.status === 200 && r.body.balance === 1500 && r.body.reward.amount === 250, "redeem ok");
    const rc = calls.at(-1);
    assert(rc.args.p_user_id === "u-user" && rc.args.p_code === "K7QM2XRD9PLAV4TE", "normalised code, user from token");
    assert(rc.args.p_risk_unknown === "allow", "unknown risk score defaults to allow");
    assert(/^[0-9a-f]{32}$/.test(rc.args.p_ip_hash) && !rc.args.p_ip_hash.includes("127.0.0.1"), "ip is hashed");
    assert(emitted.some((e) => e.room === "user:u-user" && e.event === "descoin:balance" && e.payload.balance === 1500), "balance pushed to the user's devices");

    const cases = [
      [{ ok: false, error: "used" }, 409, "used"],
      [{ ok: false, error: "limit" }, 409, "limit"],
      [{ ok: false, error: "expired" }, 400, "expired"],
      [{ ok: false, error: "invalid" }, 400, "invalid"],
      [{ ok: false, error: "badge_owned" }, 409, "badge_owned"],
      [{ ok: false, error: "wallet_frozen" }, 400, "wallet_frozen"],
      [{ ok: false, error: "something_internal" }, 400, "invalid"],
    ];
    for (const [res, status, code] of cases) {
      next.promo_redeem = res;
      r = await call(base, "POST", "/api/promo/redeem", { token: user, body: { code: "AAAA-BBBB-CCCC-DDDD" } });
      assert(r.status === status && r.body.code === code, `${res.error} → ${status}/${code}, got ${r.status}/${r.body.code}`);
    }
    next.promo_redeem = { ok: false, error: "age", days: 7, availableAt: "2026-11-01T10:00:00Z" };
    r = await call(base, "POST", "/api/promo/redeem", { token: user, body: { code: "AAAA" } });
    assert(r.status === 400 && r.body.days === 7 && r.body.availableAt, "age carries the date");
    next.promo_redeem = { ok: false, error: "rate_limited", retryAfter: 512 };
    r = await call(base, "POST", "/api/promo/redeem", { token: user, body: { code: "AAAA" } });
    assert(r.status === 429 && r.headers.get("retry-after") === "512" && r.body.retryAfter === 512, "lock → 429 + Retry-After");
    next.promo_redeem = new Error("connection reset password=hunter2");
    const origErr = console.error;
    const logged = [];
    console.error = (...a) => logged.push(a.join(" "));
    r = await call(base, "POST", "/api/promo/redeem", { token: user, body: { code: "AAAA" } });
    console.error = origErr;
    assert(r.status === 500 && r.body.code === "server_error" && !JSON.stringify(r.body).includes("hunter2"), "db error is not leaked to the client");
    const longCode = "A".repeat(5000);
    next.promo_redeem = { ok: false, error: "invalid" };
    await call(base, "POST", "/api/promo/redeem", { token: user, body: { code: longCode } });
    assert(calls.at(-1).args.p_code.length <= 64, "input is capped before the database");

    process.env.PROMO_RISK_UNKNOWN = "withhold";
    await call(base, "POST", "/api/promo/redeem", { token: user, body: { code: "AAAA" } });
    assert(calls.at(-1).args.p_risk_unknown === "withhold", "strict mode switch");
    delete process.env.PROMO_RISK_UNKNOWN;

    // --- popup + history
    next.promo_popup_for = { id: CODE_ID, code: "K7QM2XRD9PLAV4TE", message: "Selam", reward: { type: "descoin", amount: 250 } };
    r = await call(base, "GET", "/api/promo/popup", { token: user });
    assert(r.status === 200 && r.body.popup.id === CODE_ID && r.headers.get("cache-control") === "no-store", "popup for me");
    next.promo_popup_mark = { ok: true };
    r = await call(base, "POST", `/api/promo/popup/${CODE_ID}/seen`, { token: user, body: { snooze: true } });
    assert(r.status === 200 && calls.at(-1).args.p_snooze === true && calls.at(-1).args.p_user_id === "u-user", "snooze");
    r = await call(base, "POST", "/api/promo/popup/zzz/seen", { token: user, body: {} });
    assert(r.status === 404, "bad popup id");
    next.promo_history = [{ id: "r1", code: "K7QM2XRD9PLAV4TE", reward: { type: "descoin", amount: 250 }, at: "2026-10-26T10:00:00Z" }];
    r = await call(base, "GET", "/api/promo/history", { token: user });
    assert(r.status === 200 && r.body.items.length === 1, "history");

    console.log("promo.integration.test.cjs: ok");
  } finally {
    server.close();
  }
}

run().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
