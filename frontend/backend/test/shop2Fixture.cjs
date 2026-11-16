"use strict";

/**
 * Shared seed + HTTP harness for the Market 2.0 integration tests (not a test file itself).
 * Two complete sets (8 pieces each), 24 singles over 4 rarities, one retired s2 item, one
 * inactive s2 item and one active legacy item.
 */

const http = require("http");
const { createFakeSupabase } = require("./fakeSupabase.cjs");

const DAY = 86_400_000;
const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const I = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const iso = (t) => new Date(t).toISOString();

const PIECES = ["avatar_frame", "banner", "profile_color", "profile_badge", "avatar_effect", "chat_bubble", "voice_tile", "join_sound"];
const PIECE_PRICES = [700, 800, 450, 400, 900, 650, 600, 500]; // sum 5000
const SINGLE_CATS = ["banner", "avatar_frame", "chat_bubble", "name_effect", "profile_aura", "theme"];
const RARITY_PRICE = { common: 200, rare: 420, epic: 700, legendary: 1200 };

function seedItems(now) {
  const items = [];
  let n = 1;
  for (const setKey of ["gece-limani", "bakir-kervan"]) {
    PIECES.forEach((cat, i) => {
      items.push({ id: I(n++), sku: `s2-${cat}-${setKey}`, name: `${setKey} ${cat}`, category: cat, price_descoin: PIECE_PRICES[i], rarity: i % 3 === 0 ? "legendary" : "epic", active: true, sort_order: i, set_key: setKey, created_at: iso(now - 40 * DAY), asset_url: cat === "banner" ? "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 600 200'><rect fill='#1e4b8f' width='600' height='200'/><circle fill='#35d0e0' cx='300' cy='100' r='40'/></svg>" : null });
    });
  }
  const rarities = ["common", "rare", "epic", "legendary"];
  for (let k = 0; k < 24; k += 1) {
    const r = rarities[k % 4];
    items.push({ id: I(n++), sku: `s2-single-${k}`, name: `Single ${k}`, category: SINGLE_CATS[k % SINGLE_CATS.length], price_descoin: RARITY_PRICE[r] + (k % 3) * 20, rarity: r, active: true, sort_order: 100 + k, set_key: null, created_at: iso(now - 30 * DAY) });
  }
  items.push({ id: I(90), sku: "s2-single-retired", name: "Retired", category: "banner", price_descoin: 300, rarity: "rare", active: true, retired_at: iso(now - DAY), sort_order: 900, created_at: iso(now - 30 * DAY) });
  items.push({ id: I(91), sku: "s2-single-inactive", name: "Inactive", category: "banner", price_descoin: 300, rarity: "rare", active: false, sort_order: 901, created_at: iso(now - 30 * DAY) });
  items.push({ id: I(92), sku: "old-banner", name: "Old banner", category: "banner", price_descoin: 300, rarity: "rare", active: true, sort_order: 902, created_at: iso(now - 300 * DAY) });
  return items;
}

function seed(now = Date.now()) {
  return {
    users: [
      { id: U(1), username: "buyer", active_sessions: [{ id: "s1" }], descoin_balance: 30000, created_at: iso(now - 60 * DAY) },
      { id: U(2), username: "friend", active_sessions: [{ id: "s2" }], descoin_balance: 8000, created_at: iso(now - 90 * DAY) },
      { id: U(3), username: "stranger", active_sessions: [{ id: "s3" }], descoin_balance: 8000, created_at: iso(now - 90 * DAY) },
      { id: U(4), username: "newbie", active_sessions: [{ id: "s4" }], descoin_balance: 8000, created_at: iso(now - DAY) },
      { id: U(5), username: "third", active_sessions: [{ id: "s5" }], descoin_balance: 8000, created_at: iso(now - 90 * DAY) },
      { id: U(6), username: "poor", active_sessions: [{ id: "s6" }], descoin_balance: 10, created_at: iso(now - 90 * DAY) },
      { id: U(9), username: "admin", active_sessions: [{ id: "s9" }], descoin_balance: 0, is_admin: true, created_at: iso(now - 400 * DAY) },
    ],
    friendships: [
      { id: "f1", user_id: U(1), friend_id: U(2), status: "accepted" },
      { id: "f2", user_id: U(1), friend_id: U(4), status: "accepted" },
      { id: "f3", user_id: U(2), friend_id: U(5), status: "accepted" },
      { id: "f4", user_id: U(5), friend_id: U(1), status: "accepted" },
      { id: "f5", user_id: U(4), friend_id: U(2), status: "accepted" },
    ],
    shop_items: seedItems(now),
    user_inventory: [{ id: "inv-1", user_id: U(1), item_id: I(17), acquired_via: "purchase", acquired_at: iso(now - 5 * DAY) }],
    shop_purchases: [],
    descoin_ledger: [],
  };
}

/**
 * Boots an express app with the shop2 user router at /shop2 and the admin router at
 * /admin/shop2 (admin auth chain replaced by a stub user, like the shop desk test).
 */
async function boot({ missingTables = [], now = Date.now() } = {}) {
  process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-do-not-use-in-prod";
  process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://placeholder.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder-key";
  const fake = createFakeSupabase(seed(now), { missingTables });
  const supabasePath = require.resolve("../db/supabase");
  require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: fake };
  const express = require("express");
  const { signToken } = require("../config/jwt");
  const emitted = [];
  const io = {
    emit: (ev, p) => emitted.push({ to: "all", ev, p }),
    to: (room) => ({ emit: (ev, p) => emitted.push({ to: room, ev, p }) }),
    sockets: { adapter: { rooms: new Map() }, sockets: new Map() },
  };
  const app = express();
  app.use(express.json());
  app.set("io", io);
  app.use("/shop2", require("../routes/shop2"));
  const adminRouter = require("../routes/adminShop2");
  app.use("/admin/shop2", (req, _res, next) => {
    req.user = { id: U(9), username: "admin" };
    next();
  }, adminRouter.routes || adminRouter);
  const srv = http.createServer(app);
  await new Promise((r) => srv.listen(0, r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const call = async (path, { method = "GET", body, user = 1, headers = {} } = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${signToken({ id: U(user), username: `u${user}`, sid: `s${user}` })}`, ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = {};
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text };
    }
    return { status: res.status, body: json, headers: res.headers };
  };
  const rows = (t) => fake._tables[t]?.rows || [];
  return { fake, call, rows, emitted, close: () => srv.close(), base };
}

function harness(name) {
  const failures = [];
  let passed = 0;
  async function check(label, fn) {
    try {
      await fn();
      passed += 1;
      if (process.env.TEST_VERBOSE) console.log(`PASS | ${label}`);
    } catch (err) {
      failures.push(`${label}: ${String(err.stack || err.message).split("\n").slice(0, 8).join(" | ").slice(0, 1200)}`);
      if (process.env.TEST_VERBOSE) console.log(`FAIL | ${label}`);
    }
  }
  function finish() {
    if (failures.length) {
      console.error(`${name}: ${failures.length} failed, ${passed} passed`);
      for (const f of failures) console.error(`  FAIL ${f}`);
      process.exit(1);
    }
    console.log(`${name}: ${passed} passed`);
    process.exit(0);
  }
  return { check, finish };
}

module.exports = { U, I, DAY, iso, PIECES, PIECE_PRICES, seed, boot, harness };
