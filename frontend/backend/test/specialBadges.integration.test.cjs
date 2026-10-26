"use strict";

/**
 * Special badges HTTP layer: server-side admin authorisation, error → status mapping, the
 * equip/take-back socket events and profile broadcast, the read-only shape others see, and
 * that special badges have no purchase path. The rules themselves live in Postgres and are
 * covered by specialBadges.db.test.cjs.
 */

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";

const http = require("http");
const { createFakeSupabase } = require("./fakeSupabase.cjs");

const ADMIN = "aaaaaaaa-0000-4000-8000-000000000001";
const USER = "aaaaaaaa-0000-4000-8000-000000000002";
const OTHER = "aaaaaaaa-0000-4000-8000-000000000003";

const supabasePath = require.resolve("../db/supabase");
const fake = createFakeSupabase({
  users: [
    { id: ADMIN, username: "demir", is_admin: true, active_sessions: [{ id: "s-a" }] },
    { id: USER, username: "ayse", is_admin: false, active_sessions: [{ id: "s-u" }] },
    { id: OTHER, username: "mert", is_admin: false, active_sessions: [{ id: "s-o" }] },
  ],
  shop_items: [],
  user_inventory: [],
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
const badgeRouter = require("../routes/specialBadges");
const shopRouter = require("../routes/shop");

const emitted = [];
const rooms = new Map();
const io = {
  emit: (event, payload) => emitted.push({ room: "*", event, payload }),
  to: (room) => ({ emit: (event, payload) => emitted.push({ room, event, payload }) }),
  sockets: { adapter: { rooms }, sockets: new Map() },
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
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

const CATALOG = [
  { id: "no001", no: 1, name: "#001", tier: "tekil", description: "x", grantMode: "promo", maxHolders: 1, active: true, holders: 1 },
  { id: "beta", no: 20, name: "Beta", tier: "nadir", description: "y", grantMode: "promo", maxHolders: null, active: true, holders: 3 },
  { id: "facebook", no: 36, name: "Facebook", tier: "nadir", description: "z", grantMode: "admin_only", maxHolders: null, active: true, holders: 1 },
];

async function run() {
  const app = express();
  app.set("io", io);
  app.use(express.json());
  app.use("/api/admin", adminRouter);
  app.use("/api/special-badges", badgeRouter);
  app.use("/api/shop", shopRouter);
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const admin = signToken({ id: ADMIN, username: "demir", sid: "s-a" });
  const user = signToken({ id: USER, username: "ayse", sid: "s-u" });
  try {
    // --- authorisation is enforced on the server
    const adminRoutes = [
      ["GET", "/api/admin/special-badges"], ["GET", "/api/admin/special-badges/audit"],
      ["GET", "/api/admin/special-badges/beta/holders"],
      ["POST", "/api/admin/special-badges/facebook/grant"], ["POST", "/api/admin/special-badges/facebook/revoke"],
    ];
    for (const [m, p] of adminRoutes) {
      let r = await call(base, m, p, { body: m === "GET" ? undefined : { userId: USER } });
      assert(r.status === 401, `anonymous refused on ${m} ${p}: ${r.status}`);
      r = await call(base, m, p, { token: user, body: m === "GET" ? undefined : { userId: USER } });
      assert(r.status === 403, `non-admin refused on ${m} ${p}: ${r.status}`);
    }
    for (const [m, p] of [["GET", "/api/special-badges/catalog"], ["GET", `/api/special-badges/users/${USER}`], ["PUT", "/api/special-badges/me/equipped"]]) {
      assert((await call(base, m, p, { body: m === "PUT" ? { badgeId: null } : undefined })).status === 401, `sign-in needed: ${m} ${p}`);
    }
    assert(!calls.some((c) => /grant|revoke|equip/.test(c.name)), "refused callers never reached the database");

    // --- catalog: public shape hides grant rules
    next.special_badge_catalog = CATALOG;
    let r = await call(base, "GET", "/api/special-badges/catalog", { token: user });
    assert(r.status === 200 && r.body.badges.length === 3, "catalog listed");
    assert(r.body.badges[2].holders === 1 && r.body.badges[2].grantMode === undefined, "users do not see grant rules");
    next.special_badge_admin_overview = { catalog: 36, active: 36, granted: 5, equipped: 2, activeCodes: 1 };
    r = await call(base, "GET", "/api/admin/special-badges", { token: admin });
    assert(r.status === 200 && r.body.kpis.granted === 5 && r.body.badges[2].grantMode === "admin_only", "admin sees rules + KPIs");

    // --- someone else's badges, read-only
    next.special_badge_user_badges = [
      { id: "facebook", serial: 1, grantedAt: "2026-10-26T10:00:00Z", via: "admin", equipped: true, grantedBy: { id: ADMIN, username: "demir", displayName: "Demir" } },
      { id: "beta", serial: 7, grantedAt: "2026-10-20T10:00:00Z", via: "promo", equipped: false, grantedBy: null },
    ];
    r = await call(base, "GET", `/api/special-badges/users/${OTHER}`, { token: user });
    assert(r.status === 200 && r.body.equipped === "facebook" && r.body.badges.length === 2, "other person's badges");
    assert(r.body.badges[1].via === "promo" && r.body.badges[0].grantedBy.username === "demir", "via + giver");
    assert((await call(base, "GET", "/api/special-badges/users/not-a-uuid", { token: user })).status === 400, "bad id refused");
    r = await call(base, "GET", "/api/special-badges/users/me", { token: user });
    assert(calls.at(-1).args.p_user_id === USER, "users/me resolves to the caller");

    // --- equip
    next.special_badge_equip = (args) => (args.p_badge_id === "og" ? { ok: false, error: "not_owned" } : { ok: true, equipped: args.p_badge_id, previous: null });
    r = await call(base, "PUT", "/api/special-badges/me/equipped", { token: user, body: { badgeId: "og" } });
    assert(r.status === 404 && r.body.error === "not_owned", "cannot wear an unowned badge");
    r = await call(base, "PUT", "/api/special-badges/me/equipped", { token: user, body: { badgeId: "Bad Id!" } });
    assert(r.status === 400, "malformed id refused before the database");
    emitted.length = 0;
    r = await call(base, "PUT", "/api/special-badges/me/equipped", { token: user, body: { badgeId: "beta" } });
    assert(r.status === 200 && r.body.equipped === "beta", "wear beta");
    assert(calls.at(-1).name !== "special_badge_equip" || calls.at(-1).args.p_user_id === USER, "equips only the caller");
    assert(emitted.some((e) => e.room === `user:${USER}` && e.event === "special-badge:equipped"), "own devices hear about it");
    r = await call(base, "PUT", "/api/special-badges/me/equipped", { token: user, body: { badgeId: null } });
    assert(r.status === 200 && r.body.equipped === null, "take it off");

    // --- admin grant / revoke, errors mapped
    next.special_badge_grant = (args) => {
      if (args.p_badge_id === "no001") return { ok: false, error: "taken" };
      if (args.p_badge_id === "beta") return { ok: true, granted: false, error: "owned" };
      return { ok: true, granted: true, serial: 2, id: "bbbbbbbb-0000-4000-8000-000000000009" };
    };
    r = await call(base, "POST", "/api/admin/special-badges/no001/grant", { token: admin, body: { userId: USER } });
    assert(r.status === 409 && r.body.error === "taken", "#001 to a second person is a 409");
    r = await call(base, "POST", "/api/admin/special-badges/beta/grant", { token: admin, body: { userId: USER } });
    assert(r.status === 409 && r.body.error === "owned", "already owned is a 409");
    r = await call(base, "POST", "/api/admin/special-badges/facebook/grant", { token: admin, body: { userId: "nope" } });
    assert(r.status === 400, "bad user id");
    rooms.set(`user:${USER}`, new Set(["sock1"]));
    next.special_badge_pending = { granted: [{ rowId: "bbbbbbbb-0000-4000-8000-000000000009", id: "facebook", serial: 2, via: "admin", from: { id: ADMIN, username: "demir" } }], revoked: [] };
    next.special_badge_mark_notified = 1;
    emitted.length = 0;
    r = await call(base, "POST", "/api/admin/special-badges/facebook/grant", { token: admin, body: { userId: USER, note: "  hoş geldin  " } });
    assert(r.status === 200 && r.body.serial === 2, "admin grants Facebook");
    const g = calls.filter((c) => c.name === "special_badge_grant").at(-1);
    assert(g.args.p_source === "admin" && g.args.p_actor_id === ADMIN && g.args.p_note === "hoş geldin", "grant is attributed and trimmed");
    assert(emitted.some((e) => e.room === `user:${USER}` && e.event === "special-badge:granted" && e.payload.id === "facebook"), "online holder is told");
    assert(calls.some((c) => c.name === "special_badge_mark_notified"), "delivery recorded");

    next.special_badge_revoke = { ok: true, serial: 2, wasEquipped: true };
    next.special_badge_pending = { granted: [], revoked: [{ rowId: "bbbbbbbb-0000-4000-8000-000000000009", id: "facebook", serial: 2, reason: "test" }] };
    emitted.length = 0;
    r = await call(base, "POST", "/api/admin/special-badges/facebook/revoke", { token: admin, body: { userId: USER, reason: "test" } });
    assert(r.status === 200 && r.body.wasEquipped === true, "admin takes it back");
    assert(emitted.some((e) => e.event === "special-badge:revoked" && e.payload.id === "facebook"), "holder is told it was taken back");
    next.special_badge_revoke = { ok: false, error: "not_owned" };
    r = await call(base, "POST", "/api/admin/special-badges/facebook/revoke", { token: admin, body: { userId: USER } });
    assert(r.status === 404, "nothing to take back");

    next.special_badge_holders = [{ userId: USER, username: "ayse", serial: 1 }];
    r = await call(base, "GET", "/api/admin/special-badges/beta/holders", { token: admin });
    assert(r.status === 200 && r.body.holders.length === 1, "holders");
    next.special_badge_audit_list = [{ id: 1, action: "grant", badgeId: "beta" }];
    r = await call(base, "GET", "/api/admin/special-badges/audit?limit=5", { token: admin });
    assert(r.status === 200 && r.body.entries.length === 1 && calls.at(-1).args.p_limit === 5, "audit");

    // --- database failures are 500s with no detail
    next.special_badge_grant = new Error("boom: secret detail");
    r = await call(base, "POST", "/api/admin/special-badges/facebook/grant", { token: admin, body: { userId: USER } });
    assert(r.status === 500 && r.body.error === "server_error" && !JSON.stringify(r.body).includes("secret"), "500 hides detail");

    // --- no purchase path: the shop cannot sell a special badge
    const before = calls.length;
    for (const itemId of ["facebook", "no001", "beta"]) {
      r = await call(base, "POST", "/api/shop/purchase", { token: user, body: { itemId } });
      assert(r.status >= 400, `shop refuses special badge ${itemId}: ${r.status}`);
    }
    assert(!calls.slice(before).some((c) => c.name.startsWith("special_badge")), "shop never touches special badges");
    assert((await call(base, "POST", "/api/special-badges/facebook/purchase", { token: user, body: {} })).status === 404, "no purchase route");

    console.log("specialBadges.integration.test.cjs: ok");
  } finally {
    server.close();
  }
}

run().then(() => process.exit(0)).catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
