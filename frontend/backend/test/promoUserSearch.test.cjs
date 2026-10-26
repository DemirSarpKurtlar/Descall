"use strict";

/**
 * Admin promo "Seçilenler" people search: ranking (JS twin), the HTTP route
 * (admin-only, rate-limited, never leaks email/phone/IP, exclude + limit, JS
 * fallback while the SQL function is missing) and, when PROMO_TEST_PG_URL is
 * set, the real SQL function public.promo_admin_user_search on Postgres.
 */

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";

const fs = require("fs");
const path = require("path");
const http = require("http");
const s = require("../lib/promoUserSearch");

function assert(c, msg) {
  if (!c) throw new Error("FAIL: " + msg);
}
const eq = (a, b, msg) => assert(JSON.stringify(a) === JSON.stringify(b), `${msg}: got ${JSON.stringify(a)} want ${JSON.stringify(b)}`);

const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const PEOPLE = [
  { id: U(1), username: "demir", display_name: "Demir Sarp", avatar_url: null },
  { id: U(2), username: "ayse", display_name: "Ayşe Yılmaz", avatar_url: "/a/2.png" },
  { id: U(3), username: "ayse_k", display_name: "Ayşe Kaya", avatar_url: null },
  { id: U(4), username: "ilayda", display_name: "İlayda Çelik", avatar_url: null },
  { id: U(5), username: "cagri", display_name: "Çağrı Öztürk", avatar_url: null },
  { id: U(6), username: "ali.demirtas", display_name: "Ali Demirtaş", avatar_url: null },
  { id: U(7), username: "kaan", display_name: "Kaan", avatar_url: null, deleted_at: "2026-01-01" },
  { id: U(8), username: "selin", display_name: "Selin Aydın", avatar_url: null, is_banned: true },
  { id: U(9), username: "mayseli", display_name: "Mert", avatar_url: null },
];

function unit() {
  eq(s.fold("İLAYDA ılgın ŞĞÜÖÇ"), "ilayda ilgin sguoc", "fold");
  eq(s.cleanQuery("  @@Ayşe   Yıl\u0000 "), "Ayşe Yıl", "cleanQuery strips @, controls, spaces");
  eq(s.cleanQuery("x".repeat(80)).length, 32, "cleanQuery caps length");
  eq(s.cleanExclude(`${U(2)},nope,${U(3)}`), [U(2), U(3)], "cleanExclude keeps uuids");
  eq(s.clampLimit(undefined), 8, "default limit 8");
  eq(s.clampLimit(999), 20, "limit capped");
  const names = (q, o) => s.rankUsers(PEOPLE, q, o).map((u) => u.username);
  eq(names("ayse")[0], "ayse", "exact username first");
  eq(names("ayse").slice(0, 3), ["ayse", "ayse_k", "mayseli"], "prefix before contains");
  eq(names("AYŞE")[0], "ayse", "Turkish + case-insensitive");
  eq(names("@ayse_k")[0], "ayse_k", "@ prefix ignored");
  eq(names("ilay")[0], "ilayda", "İ folds to i");
  eq(names("çağ")[0], "cagri", "ç/ğ fold");
  eq(names("demirt")[0], "ali.demirtas", "word prefix inside name/username");
  eq(names("kaya")[0], "ayse_k", "display name word prefix");
  assert(!names("kaan").length, "deleted users never suggested");
  assert(!names("selin").length, "banned users never suggested");
  assert(!names("ayse", { exclude: [U(2)] }).includes("ayse"), "already-selected excluded");
  eq(names("a", { limit: 2 }).length, 2, "limit honoured");
  const pub = s.publicUser({ ...PEOPLE[1], email: "x@y.z", phone: "+90", last_ip: "1.2.3.4", is_admin: true });
  eq(Object.keys(pub).sort(), ["avatar_url", "display_name", "id", "username"], "public shape only");
}

async function httpRoute() {
  const { createFakeSupabase } = require("./fakeSupabase.cjs");
  const supabasePath = require.resolve("../db/supabase");
  const fake = createFakeSupabase({
    users: [
      { id: "u-admin", username: "demir", is_admin: true, active_sessions: [{ id: "s-a" }] },
      { id: "u-user", username: "nonadmin", is_admin: false, active_sessions: [{ id: "s-u" }] },
      ...PEOPLE.slice(1).map((p) => ({ ...p, email: `${p.username}@mail.test`, phone: "+905550000000", last_ip: "10.0.0.1" })),
    ],
  });
  const calls = [];
  let mode = "ok";
  fake.rpc = async (name, args) => {
    calls.push({ name, args });
    if (mode === "missing") return { data: null, error: { code: "PGRST202", message: "Could not find the function public.promo_admin_user_search" } };
    if (mode === "broken") return { data: null, error: { code: "XX000", message: "boom" } };
    return { data: [{ id: U(2), username: "ayse", display_name: "Ayşe Yılmaz", avatar_url: null, rank: 0, email: "leak@x", phone: "+90", last_ip: "1.1.1.1" }], error: null };
  };
  require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: fake };
  const express = require("express");
  const { signToken } = require("../config/jwt");
  const rateLimit = require("../lib/rateLimit");
  const app = express();
  app.use(express.json());
  app.use("/api/admin", require("../routes/admin"));
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const admin = signToken({ id: "u-admin", username: "demir", sid: "s-a" });
  const user = signToken({ id: "u-user", username: "nonadmin", sid: "s-u" });
  const get = async (p, token) => {
    const r = await fetch(base + p, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    return { status: r.status, headers: r.headers, body: await r.json().catch(() => ({})) };
  };
  try {
    rateLimit.resetLimits?.();
    assert((await get("/api/admin/promo-codes/users?q=ay")).status === 401, "anonymous refused");
    assert((await get("/api/admin/promo-codes/users?q=ay", user)).status === 403, "non-admin refused");
    assert(!calls.length, "non-admin never reached the database");

    let r = await get(`/api/admin/promo-codes/users?q=%40Ay%C5%9Fe&exclude=${U(3)},bad`, admin);
    assert(r.status === 200, "admin ok");
    assert(r.headers.get("cache-control") === "no-store", "no-store");
    eq(calls.at(-1).args, { p_q: "Ayşe", p_exclude: [U(3)], p_limit: 8 }, "rpc args cleaned");
    eq(Object.keys(r.body.users[0]).sort(), ["avatar_url", "display_name", "id", "username"], "no email/phone/IP/rank from rpc");
    assert(!/leak|mail\.test|\+90|10\.0\.0\.1/.test(JSON.stringify(r.body)), "nothing sensitive in body");

    r = await get("/api/admin/promo-codes/users?q=%20%40%20", admin);
    eq(r.body.users, [], "blank query → empty, no db call");

    mode = "missing";
    r = await get(`/api/admin/promo-codes/users?q=ay&exclude=${U(2)}`, admin);
    assert(r.status === 200, "fallback status");
    const got = r.body.users.map((u) => u.username);
    assert(got[0] === "ayse_k" && !got.includes("ayse"), "fallback ranks in JS and excludes: " + got);
    assert(!/mail\.test|\+90|10\.0\.0\.1/.test(JSON.stringify(r.body)), "fallback leaks nothing");

    mode = "broken";
    r = await get("/api/admin/promo-codes/users?q=ay", admin);
    assert(r.status === 500, "real db errors surface as 500, not empty");

    mode = "ok";
    rateLimit.resetLimits?.();
    let last;
    for (let i = 0; i < 125; i++) last = await get("/api/admin/promo-codes/users?q=ay", admin);
    assert(last.status === 429 && Number(last.headers.get("retry-after")) > 0, "rate limited with Retry-After");
    rateLimit.resetLimits?.();
  } finally {
    server.close();
  }
}

function db() {
  const pg = require("./promoPg.cjs");
  if (!pg.available()) {
    console.log("promoUserSearch db: skipped (no PROMO_TEST_PG_URL / psql)");
    return;
  }
  const { url, drop } = pg.freshDb("usersearch");
  try {
    const mig = fs.readFileSync(path.join(__dirname, "../../../supabase/migrations/20261027_promo_user_search.sql"), "utf8");
    pg.q(url, mig);
    pg.q(url, mig); // idempotent
    const rows = PEOPLE.map((p) => `(${pg.literal(p.id)}, ${pg.literal(p.username)}, ${pg.literal(p.display_name)}, ${pg.literal(p.avatar_url)}, ${p.is_banned ? "true" : "false"}, ${p.deleted_at ? pg.literal(p.deleted_at) : "NULL"})`);
    pg.q(url, `INSERT INTO public.users (id, username, display_name, avatar_url, is_banned, deleted_at) VALUES ${rows.join(",")};`);
    const search = (q, ex = [], lim = 8) =>
      pg.json(url, `SELECT coalesce(jsonb_agg(username ORDER BY ord), '[]') FROM (SELECT username, row_number() OVER () ord FROM public.promo_admin_user_search(${pg.literal(q)}, ${pg.literal(`{${ex.join(",")}}`)}::uuid[], ${lim})) t;`);
    for (const q of ["ayse", "AYŞE", "@ayse_k", "ilay", "İLAY", "ılay", "çağ", "demirt", "kaya", "ali", "a", "kaan", "selin", "mert"]) {
      const js = s.rankUsers(PEOPLE, q).map((u) => u.username);
      eq(search(q), js, `SQL and JS rank agree for "${q}"`);
    }
    assert(!search("ayse", [U(2)]).includes("ayse"), "SQL exclude");
    eq(search("a", [], 2).length, 2, "SQL limit");
    eq(search("a", [], 500).length <= 20, true, "SQL limit clamped");
    eq(pg.q(url, "SELECT promo_fold('İIıŞĞÜÖÇ')"), "iiisguoc", "promo_fold");
    const grants = pg.q(url, "SELECT string_agg(grantee, ',' ORDER BY grantee) FROM information_schema.routine_privileges WHERE routine_name = 'promo_admin_user_search' AND privilege_type = 'EXECUTE'");
    assert(!/anon|authenticated|PUBLIC/.test(grants) && /service_role/.test(grants), "execute only for service_role: " + grants);
  } finally {
    drop();
  }
}

(async () => {
  unit();
  await httpRoute();
  db();
  console.log("promoUserSearch.test.cjs: ok");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
