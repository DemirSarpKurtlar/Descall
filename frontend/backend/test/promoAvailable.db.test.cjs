"use strict";

/**
 * "Kodlarım" list (promo_available_for) against a real Postgres: the eligibility matrix and the
 * no-leak guarantee (a code this account cannot redeem right now is never in its list).
 * Skips cleanly when PROMO_TEST_PG_URL is not set; the "Promo codes (Postgres)" CI job sets it.
 */

const pg = require("./promoPg.cjs");

if (!pg.available()) {
  console.log("promoAvailable.db.test.cjs: skipped (set PROMO_TEST_PG_URL to a throwaway Postgres)");
  process.exit(0);
}

function assert(c, msg) {
  if (!c) throw new Error("FAIL: " + msg);
}
function eq(a, b, msg) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`FAIL: ${msg}\n  got:  ${JSON.stringify(a)}\n  want: ${JSON.stringify(b)}`);
}

const U = (n) => `00000000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`;
const ADMIN = U(90);
const OLD = U(1);      // 30 days old, seen yesterday
const NEWB = U(2);     // created 1 hour ago
const IDLE = U(3);     // 90 days old, last seen 20 days ago
const BANNED = U(4);
const FROZEN = U(5);   // wallet frozen
const OTHER = U(6);    // 30 days old, the other target
const DELETED = U(7);
const ITEM = "00000000-0000-4000-8000-0000000000b1";

// 16-char codes; the first letters say what each one tests.
const C = {
  ALL: "ALLAAAAAAAAAAAA1",          // all, created now → OLD, IDLE, OTHER (not NEWB)
  ACTIVE: "ACTIVEAAAAAAAAA2",       // active_7d → OLD, OTHER (not IDLE, not NEWB)
  NONE: "NONEAAAAAAAAAAA3",         // popup 'none' → nobody, ever
  SOLO: "SOLOAAAAAAAAAAA4",         // selected, only OLD → personal
  GROUP: "GROUPAAAAAAAAAA5",        // selected, OLD + OTHER → group
  OTHERS: "OTHERSAAAAAAAA6",        // placeholder, replaced below (must be 16)
  EXPIRED: "EXPIREDAAAAAAAA7",
  FULL: "FULLAAAAAAAAAAA8",
  OFF: "OFFAAAAAAAAAAAA9",          // inactive
  LATER: "LATERAAAAAAAAAB1",        // starts tomorrow
  AGE: "AGEAAAAAAAAAAAB2",          // min age 60 days (OLD is 30) → hidden for OLD, shown for IDLE
  OLDPUB: "OLDPUBAAAAAAAAB3",       // all, but created before OLD signed up → hidden for OLD
  ITEMC: "ITEMCAAAAAAAAAB4",        // shop item → hidden while FROZEN
  MULTI: "MULTIAAAAAAAAAB5",        // once_per_user = false → stays after use
  BADGE: "BADGEAAAAAAAAAB6",        // kurucu badge
  ADMB: "ADMBAAAAAAAAAAB7",         // badge that later turns admin_only
};
C.OTHERS = "OTHERSAAAAAAAAB8";      // selected, only OTHER

async function run() {
  const db = pg.freshDb("available", { migrations: ["20261026_special_badges.sql", "20261027_promo_available.sql"] });
  const { url } = db;
  const rpc = (name, args) => pg.rpc(url, name, args);
  const one = (sql) => pg.q(url, sql);
  const list = async (uid) => (await rpc("promo_available_for", { p_user_id: uid })).items.map((i) => i.code).sort();
  const sorted = (...k) => k.map((x) => C[x]).sort();
  try {
    // the migration is idempotent
    one(require("fs").readFileSync(require("path").join(__dirname, "../../../supabase/migrations/20261027_promo_available.sql"), "utf8"));

    const ago = (iv) => `now() AT TIME ZONE 'UTC' - interval '${iv}'`;
    one(`
      INSERT INTO users (id, username, created_at, last_seen) VALUES
        ('${ADMIN}', 'admin', ${ago("400 days")}, ${ago("0 days")}),
        ('${OLD}', 'ayse', ${ago("30 days")}, ${ago("1 day")}),
        ('${NEWB}', 'newb', ${ago("1 hour")}, ${ago("0 days")}),
        ('${IDLE}', 'idle', ${ago("90 days")}, ${ago("20 days")}),
        ('${OTHER}', 'other', ${ago("30 days")}, ${ago("0 days")});
      INSERT INTO users (id, username, created_at, is_banned) VALUES ('${BANNED}', 'banned', ${ago("60 days")}, true);
      INSERT INTO users (id, username, created_at, descoin_frozen) VALUES ('${FROZEN}', 'frozen', ${ago("60 days")}, true);
      INSERT INTO users (id, username, created_at, deleted_at) VALUES ('${DELETED}', 'gone', ${ago("60 days")}, now());
      INSERT INTO shop_items (id, sku, name, category, price_descoin) VALUES ('${ITEM}', 'banner_aurora', 'Aurora afişi', 'banner', 400);
    `);
    const code = (c, cols) => {
      const base = { reward_type: "'descoin'", reward_amount: "50", popup_audience: "'all'", created_by: `'${ADMIN}'`, created_at: "now() - interval '2 hours'", ...cols };
      one(`INSERT INTO promo_codes (code_norm, ${Object.keys(base).join(", ")}) VALUES ('${c}', ${Object.values(base).join(", ")})`);
      return one(`SELECT id FROM promo_codes WHERE code_norm = '${c}'`);
    };
    const target = (c, ...uids) => one(uids.map((u) => `INSERT INTO promo_popup_targets (code_id, user_id) SELECT id, '${u}' FROM promo_codes WHERE code_norm = '${c}';`).join("\n"));

    code(C.ALL, { expires_at: "now() + interval '3 days'" });
    code(C.ACTIVE, { popup_audience: "'active_7d'" });
    code(C.NONE, { popup_audience: "'none'" });
    code(C.SOLO, { popup_audience: "'selected'", expires_at: "now() + interval '5 hours'" }); target(C.SOLO, OLD);
    code(C.GROUP, { popup_audience: "'selected'" }); target(C.GROUP, OLD, OTHER);
    code(C.OTHERS, { popup_audience: "'selected'" }); target(C.OTHERS, OTHER);
    code(C.EXPIRED, { expires_at: "now() - interval '1 minute'", starts_at: "now() - interval '2 days'" });
    code(C.FULL, { max_uses: "2", used_count: "2" });
    code(C.OFF, { active: "false" });
    code(C.LATER, { starts_at: "now() + interval '1 day'" });
    code(C.AGE, { min_account_age_days: "60" });
    code(C.OLDPUB, { created_at: "now() - interval '45 days'" });
    code(C.ITEMC, { reward_type: "'shop_item'", reward_amount: "NULL", reward_ref: `'${ITEM}'`, max_uses: "10", used_count: "3" });
    code(C.MULTI, { once_per_user: "false" });
    code(C.BADGE, { reward_type: "'special_badge'", reward_amount: "NULL", reward_ref: "'kurucu'", popup_audience: "'selected'" }); target(C.BADGE, OLD, OTHER);
    code(C.ADMB, { reward_type: "'special_badge'", reward_amount: "NULL", reward_ref: "'og'", popup_audience: "'selected'" }); target(C.ADMB, OLD);

    // ---- eligibility matrix
    eq(await list(OLD), sorted("ALL", "ACTIVE", "SOLO", "GROUP", "ITEMC", "MULTI", "BADGE", "ADMB"), "OLD: public codes newer than the account, own targets");
    eq(await list(OTHER), sorted("ALL", "ACTIVE", "GROUP", "OTHERS", "ITEMC", "MULTI", "BADGE"), "OTHER: own targets only");
    eq(await list(IDLE), sorted("ALL", "AGE", "ITEMC", "MULTI", "OLDPUB"), "IDLE: not active_7d; old enough for AGE; older than OLDPUB");
    eq(await list(NEWB), [], "NEWB: account newer than every public code, no targets");
    eq(await list(BANNED), [], "banned: nothing");
    eq(await list(DELETED), [], "deleted: nothing");
    eq(await list(FROZEN), [], "frozen wallet: no DesCoin / item codes");
    eq(await list("00000000-0000-4000-8000-0000000000ff"), [], "unknown user: nothing");

    // ---- shape, scope, order (personal first, then soonest expiry)
    const full = await rpc("promo_available_for", { p_user_id: OLD });
    eq(full.items[0].code, C.SOLO, "personal code first");
    eq(full.items[0].scope, "personal", "1 target = personal");
    eq(full.items.find((i) => i.code === C.GROUP).scope, "group", "2 targets = group");
    eq(full.items.find((i) => i.code === C.ALL).scope, "everyone", "public = everyone");
    eq(full.items[1].code, C.ADMB, "personal codes first (soonest expiry first among them)");
    eq(full.items[2].code, C.ALL, "then the soonest to expire");
    eq(full.items.find((i) => i.code === C.ITEMC).remaining, 7, "remaining uses when limited");
    eq(full.items.find((i) => i.code === C.ALL).remaining, null, "no remaining when unlimited");
    eq(full.items.find((i) => i.code === C.ITEMC).reward.type, "shop_item", "item reward");
    eq(full.items.find((i) => i.code === C.BADGE).reward, { type: "special_badge", badgeId: "kurucu" }, "badge reward");
    eq(Object.keys(full.items[0]).sort(), ["code", "expiresAt", "id", "message", "remaining", "reward", "scope", "seen"], "item fields");
    eq([full.count, full.unseen], [8, 8], "all unseen at first");
    assert(full.serverNow, "serverNow");

    // ---- no-leak: nothing the account can't use, even with a direct probe of every code
    const all = one(`SELECT string_agg(code_norm, ',') FROM promo_codes`).split(",");
    for (const uid of [OLD, OTHER, IDLE, NEWB, BANNED, FROZEN, DELETED]) {
      const mine = await list(uid);
      for (const c of mine) {
        const res = await rpc("promo_redeem", { p_user_id: uid, p_code: c, p_ip_hash: `probe-${uid}` });
        assert(res.ok, `${uid} listed ${c} but cannot redeem it: ${JSON.stringify(res)}`);
      }
      const raw = JSON.stringify(await rpc("promo_available_for", { p_user_id: uid }));
      for (const c of all) if (!mine.includes(c)) assert(!raw.includes(c), `${c} leaked to ${uid}`);
      assert(!raw.includes(C.NONE), "'none' code never listed");
    }
    // every listed code was redeemable; once_per_user ones are gone now, MULTI stays.
    eq(await list(OLD), [C.MULTI], "after redeeming: only the reusable code remains for OLD");
    eq(await list(OTHER), [C.MULTI], "after redeeming: only the reusable code remains for OTHER");
    eq(one(`SELECT count(*) FROM user_special_badges WHERE user_id = '${OLD}' AND badge_id = 'kurucu' AND revoked_at IS NULL`), "1", "badge granted on redeem");

    // ---- badge rules: owned / admin_only / full badge are hidden
    const B2 = "BADGEBBBBBBBBBB9";
    code(B2, { reward_type: "'special_badge'", reward_amount: "NULL", reward_ref: "'kurucu'", popup_audience: "'selected'" }); target(B2, OLD, IDLE);
    eq((await list(OLD)).includes(B2), false, "already owns the badge → hidden");
    eq((await list(IDLE)).includes(B2), true, "IDLE does not own it → listed");
    one(`UPDATE special_badges SET grant_mode = 'admin_only' WHERE id = 'kurucu'`);
    eq((await list(IDLE)).includes(B2), false, "admin_only badge → hidden");
    one(`UPDATE special_badges SET grant_mode = 'promo', max_holders = 2 WHERE id = 'kurucu'`);
    eq((await list(IDLE)).includes(B2), false, "badge full (2 holders) → hidden");
    one(`UPDATE special_badges SET max_holders = NULL, active = false WHERE id = 'kurucu'`);
    eq((await list(IDLE)).includes(B2), false, "inactive badge → hidden");
    one(`UPDATE special_badges SET active = true WHERE id = 'kurucu'`);
    eq((await list(IDLE)).includes(B2), true, "back to normal → listed");

    // ---- frozen: badge codes are fine, wallet ones are not
    const FB = "FROZENBBBBBBBBC1";
    code(FB, { reward_type: "'special_badge'", reward_amount: "NULL", reward_ref: "'efsane'", popup_audience: "'selected'" }); target(FB, FROZEN);
    const FD = "FROZENDDDDDDDDC2";
    code(FD, { popup_audience: "'selected'" }); target(FD, FROZEN);
    eq(await list(FROZEN), [FB], "frozen wallet: badge yes, DesCoin no");

    // ---- seen: marks only listed ids, ignores others (cannot be used to probe)
    const idle = await rpc("promo_available_for", { p_user_id: IDLE });
    const otherId = one(`SELECT id FROM promo_codes WHERE code_norm = '${C.OTHERS}'`);
    const m = await rpc("promo_available_mark_seen", { p_user_id: IDLE, p_code_ids: [idle.items[0].id, otherId, "not-a-uuid"] });
    eq([m.ok, m.marked, m.unseen], [true, 1, idle.unseen - 1], "marks only the account's own listed code");
    eq(one(`SELECT count(*) FROM promo_available_seen WHERE user_id = '${IDLE}'`), "1", "one row written");
    const again = await rpc("promo_available_mark_seen", { p_user_id: IDLE, p_code_ids: [idle.items[0].id] });
    eq(again.marked, 1, "re-marking is harmless");
    eq(one(`SELECT count(*) FROM promo_available_seen WHERE user_id = '${IDLE}'`), "1", "still one row");
    eq((await rpc("promo_available_for", { p_user_id: IDLE })).items.find((i) => i.id === idle.items[0].id).seen, true, "seen flag");
    eq((await rpc("promo_available_mark_seen", { p_user_id: IDLE, p_code_ids: { x: 1 } })).marked, 0, "non-array ignored");

    // ---- not reachable by anon/authenticated
    for (const fn of ["promo_available_for(uuid)", "promo_available_mark_seen(uuid, jsonb)", "promo_badge_receivable(uuid, text)"]) {
      eq(one(`SELECT has_function_privilege('anon', 'public.${fn}', 'EXECUTE')::text || has_function_privilege('authenticated', 'public.${fn}', 'EXECUTE')::text`), "falsefalse", `${fn} locked down`);
    }
    eq(one(`SELECT has_table_privilege('authenticated', 'public.promo_available_seen', 'SELECT')::text`), "false", "seen table locked down");

    console.log("promoAvailable.db.test.cjs: ok");
  } finally {
    db.drop();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
