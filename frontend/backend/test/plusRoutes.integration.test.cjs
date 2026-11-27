"use strict";

/**
 * Descall+ 2.0 user API (routes/plus.js) over real HTTP with the fake db:
 *  - signed out -> 401;
 *  - selling off (prod default): /offer hides prices, checkout -> 403 sales_off, limits keep 1440p 60,
 *    the paywall says "none";
 *  - selling on for web only: prices for web, free screen 1080p 30, ios unchanged, checkout without a
 *    configured provider -> 503 provider_not_configured (nothing created);
 *  - boosts: SQL errors map to statuses (no_slots 409, not_in_server 403);
 *  - paywall decide: full, then compact on the same day (and tracked);
 *  - cancel needs a reason; gift asks are limited to one a week.
 */

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.JWT_EXPIRES_IN = "7d";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";
for (const k of ["PADDLE_WEBHOOK_SECRET", "PADDLE_CLIENT_TOKEN", "PADDLE_API_KEY", "IYZICO_API_KEY", "IYZICO_SECRET_KEY", "IYZICO_MERCHANT_ID", "APPLE_IAP_ENABLED"]) delete process.env[k];

const http = require("http");
const { createFakeSupabase } = require("./fakeSupabase.cjs");

const ME = "00000000-0000-4000-8000-0000000000e1";
const FRIEND = "00000000-0000-4000-8000-0000000000e2";
const SERVER = "00000000-0000-4000-8000-0000000000f1";

const fake = createFakeSupabase({
  users: [
    { id: ME, username: "arda", active_sessions: [{ id: "s-arda" }], created_at: "2026-10-01T00:00:00.000Z" },
    { id: FRIEND, username: "ece", active_sessions: [{ id: "s-ece" }], created_at: "2026-10-01T00:00:00.000Z" },
  ],
  premium_offer_config: [{ id: "default", version: 1, config: {} }],
  premium_paywall_events: [],
  premium_gift_asks: [],
  premium_user_prefs: [],
  servers: [{ id: SERVER, name: "Gece Kuslari", owner_id: FRIEND }],
  server_members: [{ server_id: SERVER, user_id: ME }],
  friendships: [{ user_id: ME, friend_id: FRIEND, status: "accepted" }],
});
let boostAnswer = { ok: false, error: "no_slots" };
fake.rpc = async (name, args) => {
  if (name === "premium_me") return { data: { plan: null, status: "none" }, error: null };
  if (name === "premium_plus_me") return { data: { plan: null, active: false, trial_used: false }, error: null };
  if (name === "premium_boost_counts") return { data: {}, error: null };
  if (name === "premium_boost_assign") return { data: boostAnswer, error: null };
  return { data: null, error: null };
};
const supabasePath = require.resolve("../db/supabase");
require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: fake };

const express = require("express");
const { signToken } = require("../config/jwt");
const plusConfig = require("../lib/plus/config");

function assert(cond, msg) {
  if (!cond) throw new Error("FAIL: " + msg);
}

async function call(base, method, path, { body, token, platform } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(platform ? { "X-Descall-Platform": platform } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = {};
  try { json = await res.json(); } catch { json = {}; }
  return { status: res.status, body: json };
}

function setConfig(cfg) {
  fake._tables.premium_offer_config.rows[0].config = cfg;
  plusConfig.invalidate();
}

(async () => {
  const app = express();
  app.use(express.json());
  app.set("io", { to: () => ({ emit() {} }), emit() {} });
  app.use("/api/plus", require("../routes/plus"));
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const token = signToken({ id: ME, username: "arda", sid: "s-arda" });
  try {
    let r = await call(base, "GET", "/api/plus/offer");
    assert(r.status === 401, `signed out -> 401 (${r.status})`);

    r = await call(base, "GET", "/api/plus/offer", { token });
    assert(r.status === 200 && r.body.offer.salesOn === false && r.body.offer.prices === null, `offer off: ${JSON.stringify(r.body).slice(0, 200)}`);
    assert(r.body.moments.length === 13, "12 moments + the server paywall");
    r = await call(base, "POST", "/api/plus/checkout", { token, body: { kind: "self", plan: "plus", period: "monthly" } });
    assert(r.status === 403 && r.body.code === "sales_off", `checkout while off -> 403 (${r.status} ${JSON.stringify(r.body)})`);
    r = await call(base, "GET", "/api/plus/limits", { token });
    assert(r.status === 200 && r.body.limits.screen.height === 1440 && r.body.limits.screen.fps === 60 && r.body.limits.active === false, "no downgrade while off");
    r = await call(base, "POST", "/api/plus/paywall/decide", { token, body: { moment: "gif_upload" } });
    assert(r.body.show === "none", "paywall off");

    setConfig({ sales: { web: true } });
    r = await call(base, "GET", "/api/plus/offer", { token, platform: "web" });
    assert(r.body.offer.salesOn === true && r.body.offer.prices.plus_monthly === 6999, "web prices");
    r = await call(base, "GET", "/api/plus/offer", { token, platform: "ios" });
    assert(r.body.offer.salesOn === false, "ios still off");
    r = await call(base, "GET", "/api/plus/limits", { token, platform: "web" });
    assert(r.body.limits.screen.height === 1080 && r.body.limits.screen.fps === 30 && r.body.limits.screen.locked === true, "free web 1080p 30");
    r = await call(base, "GET", "/api/plus/limits", { token, platform: "ios" });
    assert(r.body.limits.screen.height === 1440, "ios keeps 1440p while ios selling is off");
    const checkoutsBefore = (fake._tables.premium_checkouts?.rows || []).length;
    r = await call(base, "POST", "/api/plus/checkout", { token, platform: "web", body: { kind: "self", plan: "plus", period: "monthly" } });
    assert(r.status === 503 && r.body.code === "provider_not_configured", `no provider -> 503 (${r.status} ${JSON.stringify(r.body)})`);
    assert((fake._tables.premium_checkouts?.rows || []).length === checkoutsBefore, "nothing created");

    r = await call(base, "POST", "/api/plus/paywall/decide", { token, platform: "web", body: { moment: "gif_upload" } });
    assert(r.body.show === "full", `first tap full (${JSON.stringify(r.body)})`);
    r = await call(base, "POST", "/api/plus/paywall/decide", { token, platform: "web", body: { moment: "gif_upload" } });
    assert(r.body.show === "compact", "same day compact");
    assert(fake._tables.premium_paywall_events.rows.filter((e) => e.moment === "gif_upload").length === 2, "both tracked");
    r = await call(base, "POST", "/api/plus/paywall/track", { token, platform: "web", body: { moment: "gif_upload", action: "first_frame" } });
    assert(r.body.ok === true, "first frame tracked");
    r = await call(base, "POST", "/api/plus/paywall/track", { token, body: { moment: "gif_upload", action: "converted" } });
    assert(r.body.ok === false, "clients cannot write conversions");

    r = await call(base, "POST", "/api/plus/boosts", { token, body: { serverId: SERVER } });
    assert(r.status === 409 && r.body.code === "no_slots", `no slots -> 409 (${r.status} ${JSON.stringify(r.body)})`);
    boostAnswer = { ok: false, error: "not_in_server" };
    r = await call(base, "POST", "/api/plus/boosts", { token, body: { serverId: SERVER } });
    assert(r.status === 403, "not in server -> 403");
    r = await call(base, "POST", "/api/plus/boosts", { token, body: { serverId: "nope" } });
    assert(r.status === 404, "bad id -> 404");

    r = await call(base, "POST", "/api/plus/cancel", { token, body: {} });
    assert(r.status === 400 && r.body.code === "reason_required", "cancel needs a reason");

    r = await call(base, "POST", "/api/plus/asks", { token, body: { toUserId: FRIEND } });
    assert(r.status === 200 && r.body.ask, `ask ok (${r.status} ${JSON.stringify(r.body)})`);
    r = await call(base, "POST", "/api/plus/asks", { token, body: { toUserId: FRIEND } });
    assert(r.status === 429 && r.body.code === "ask_weekly_limit", `second ask this week refused (${r.status} ${JSON.stringify(r.body)})`);

    r = await call(base, "PUT", "/api/plus/prefs", { token, body: { wishlist: true, gifNoteSeen: true } });
    assert(r.body.wishlist === true && r.body.gifNoteSeen === true, "prefs saved");

    r = await call(base, "GET", "/api/plus/hub", { token, platform: "web" });
    assert(r.status === 200, `hub 200 (${r.status} ${JSON.stringify(r.body).slice(0, 300)})`);
    assert(r.body.offer.salesOn === true && Array.isArray(r.body.servers) && r.body.servers[0]?.id === SERVER, "hub lists my servers");
    assert(r.body.servers[0].level === 0 && r.body.servers[0].progress.next.boosts === 2, "server progress");
    assert(r.body.boosts.slots === 0 && r.body.me.active === false, "free account has no boosts");
    assert(r.body.friends.some((f) => f.id === FRIEND), "friends for gifting");
    assert(r.body.tickets && r.body.gifts && Array.isArray(r.body.gifts.sent), "tickets and gifts present");
  } finally {
    server.close();
  }
  console.log("plus routes integration: ok");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
