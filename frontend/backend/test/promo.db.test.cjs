"use strict";

/**
 * Promo codes against a real Postgres (the migration's functions are the source of truth).
 * Skips cleanly when PROMO_TEST_PG_URL is not set; the "Promo codes (Postgres)" CI job sets it.
 */

const pg = require("./promoPg.cjs");

if (!pg.available()) {
  console.log("promo.db.test.cjs: skipped (set PROMO_TEST_PG_URL to a throwaway Postgres)");
  process.exit(0);
}

function assert(c, msg) {
  if (!c) throw new Error("FAIL: " + msg);
}
function eq(a, b, msg) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`FAIL: ${msg}\n  got:  ${JSON.stringify(a)}\n  want: ${JSON.stringify(b)}`);
}

const ADMIN = "00000000-0000-4000-8000-0000000000aa";
const OLD = "00000000-0000-4000-8000-000000000001";   // 30-day-old account, active
const NEWB = "00000000-0000-4000-8000-000000000002";  // created today
const IDLE = "00000000-0000-4000-8000-000000000003";  // old but not seen for 20 days
const BANNED = "00000000-0000-4000-8000-000000000004";
const RISKY = "00000000-0000-4000-8000-000000000005";
const TRUSTED = "00000000-0000-4000-8000-000000000006";
const FROZEN = "00000000-0000-4000-8000-000000000007";
const ITEM = "00000000-0000-4000-8000-0000000000b1";

async function run() {
  const db = pg.freshDb("dbtest");
  const { url } = db;
  const rpc = (name, args) => pg.rpc(url, name, args);
  const one = (sql) => pg.q(url, sql);
  try {
    one(`
      INSERT INTO users (id, username, created_at, last_seen, descoin_balance) VALUES
        ('${ADMIN}', 'admin', now() AT TIME ZONE 'UTC' - interval '400 days', now() AT TIME ZONE 'UTC', 0),
        ('${OLD}', 'ayse', now() AT TIME ZONE 'UTC' - interval '30 days', now() AT TIME ZONE 'UTC' - interval '1 day', 1250),
        ('${IDLE}', 'idle', now() AT TIME ZONE 'UTC' - interval '90 days', now() AT TIME ZONE 'UTC' - interval '20 days', 0),
        ('${RISKY}', 'risky', now() AT TIME ZONE 'UTC' - interval '60 days', now() AT TIME ZONE 'UTC', 10),
        ('${TRUSTED}', 'trusted', now() AT TIME ZONE 'UTC' - interval '60 days', now() AT TIME ZONE 'UTC', 0);
      INSERT INTO users (id, username, created_at, is_banned) VALUES ('${BANNED}', 'banned', now() AT TIME ZONE 'UTC' - interval '60 days', true);
      INSERT INTO users (id, username, created_at, descoin_frozen) VALUES ('${FROZEN}', 'frozen', now() AT TIME ZONE 'UTC' - interval '60 days', true);
      INSERT INTO shop_items (id, sku, name, category, price_descoin) VALUES ('${ITEM}', 'banner_aurora', 'Aurora afişi', 'banner', 400);
      INSERT INTO descoin_ledger (user_id, amount, reason, balance_after) VALUES ('${OLD}', 1250, 'admin_grant', 1250);
    `);

    // ---- constraints were widened, not narrowed: the existing row is still valid, new reasons pass.
    eq(one(`SELECT convalidated FROM pg_constraint WHERE conname = 'descoin_ledger_reason_check'`), "t", "ledger check validated");
    one(`INSERT INTO descoin_ledger (user_id, amount, reason) VALUES ('${ADMIN}', 1, 'shop_refund')`);
    one(`DELETE FROM descoin_ledger WHERE user_id = '${ADMIN}'`);

    // ---- normalisation
    eq(one(`SELECT promo_normalize(' k7qm-2xrd–9pla v4te ')`), "K7QM2XRD9PLAV4TE", "normalize drops dashes/spaces, uppercases");

    // ---- admin create validation
    const mk = (p) => rpc("promo_admin_create", { p_admin_id: ADMIN, p });
    eq((await mk({ code: "SHORT", rewardType: "descoin", rewardAmount: 5 })).error, "code_format", "16 chars required");
    eq((await mk({ code: "AAAABBBBCCCCDDDD", rewardType: "descoin", rewardAmount: 0 })).error, "reward_amount", "positive amount");
    eq((await mk({ code: "AAAABBBBCCCCDDDD", rewardType: "shop_item", rewardRef: "nope" })).error, "reward_item", "item must exist");
    eq((await mk({ code: "AAAABBBBCCCCDDDD", rewardType: "special_badge", rewardRef: "ekim29" })).error, "badges_unavailable", "badge codes wait for the badge catalog");
    eq((await mk({ code: "AAAABBBBCCCCDDDD", rewardType: "descoin", rewardAmount: 5, popupAudience: "selected", targetUserIds: [] })).error, "targets", "selected needs targets");
    eq((await mk({ code: "AAAABBBBCCCCDDDD", rewardType: "descoin", rewardAmount: 5, expiresAt: "2001-01-01T00:00:00Z" })).error, "expires_past", "no past expiry");

    const dc = await mk({ code: "k7qm-2xrd-9pla-v4te", rewardType: "descoin", rewardAmount: 250, maxUses: 250,
      minAccountAgeDays: 7, popupAudience: "all", message: "2.14 için teşekkürler!" });
    assert(dc.ok && dc.code === "K7QM2XRD9PLAV4TE", "create descoin code: " + JSON.stringify(dc));
    eq((await mk({ code: "K7QM2XRD9PLAV4TE", rewardType: "descoin", rewardAmount: 1 })).error, "code_taken", "codes are unique");
    eq(one(`SELECT action FROM promo_audit WHERE code_id = '${dc.id}'`), "create", "create is audited");

    // ---- redeem descoin: credited once, ledger reason promo, balance_after right
    const r1 = await rpc("promo_redeem", { p_user_id: OLD, p_code: "k7qm 2xrd 9pla v4te", p_ip_hash: "ipA" });
    assert(r1.ok, "redeem ok: " + JSON.stringify(r1));
    eq(r1.reward, { type: "descoin", amount: 250 }, "reward shape");
    eq(r1.balance, 1500, "new balance 1250 + 250");
    eq(one(`SELECT reason || ':' || amount || ':' || balance_after FROM descoin_ledger WHERE user_id = '${OLD}' AND reason = 'promo'`), "promo:250:1500", "ledger row");
    eq((await rpc("promo_redeem", { p_user_id: OLD, p_code: "K7QM2XRD9PLAV4TE", p_ip_hash: "ipA" })).error, "used", "once per person");
    eq(one(`SELECT used_count FROM promo_codes WHERE id = '${dc.id}'`), "1", "used_count moved once");

    // ---- account age, banned, frozen, unknown
    const age = await rpc("promo_redeem", { p_user_id: NEWB, p_code: "K7QM2XRD9PLAV4TE" });
    eq(age.error, "invalid", "unknown user id is just invalid");
    one(`INSERT INTO users (id, username, created_at) VALUES ('${NEWB}', 'yeni', now() AT TIME ZONE 'UTC' - interval '2 days')`);
    const age2 = await rpc("promo_redeem", { p_user_id: NEWB, p_code: "K7QM2XRD9PLAV4TE" });
    eq([age2.error, age2.days], ["age", 7], "account younger than 7 days is refused");
    eq((await rpc("promo_redeem", { p_user_id: BANNED, p_code: "K7QM2XRD9PLAV4TE" })).error, "invalid", "banned accounts cannot redeem");
    eq((await rpc("promo_redeem", { p_user_id: FROZEN, p_code: "K7QM2XRD9PLAV4TE" })).error, "wallet_frozen", "frozen wallet gets no promo coins");

    // ---- paused / expired / limit
    await rpc("promo_admin_update", { p_admin_id: ADMIN, p_code_id: dc.id, p: { active: false } });
    eq((await rpc("promo_redeem", { p_user_id: IDLE, p_code: "K7QM2XRD9PLAV4TE" })).error, "invalid", "paused code refused");
    await rpc("promo_admin_update", { p_admin_id: ADMIN, p_code_id: dc.id, p: { active: true } });
    eq((await rpc("promo_admin_update", { p_admin_id: ADMIN, p_code_id: dc.id, p: { maxUses: 0 } })).ok, true, "maxUses 0 = unlimited");
    one(`UPDATE promo_codes SET max_uses = 1 WHERE id = '${dc.id}'`);
    eq((await rpc("promo_redeem", { p_user_id: IDLE, p_code: "K7QM2XRD9PLAV4TE" })).error, "limit", "full code refused");
    eq((await rpc("promo_admin_update", { p_admin_id: ADMIN, p_code_id: dc.id, p: { maxUses: 0 } })).ok, true, "reopen");
    one(`UPDATE promo_codes SET expires_at = now() - interval '1 minute' WHERE id = '${dc.id}'`);
    eq((await rpc("promo_redeem", { p_user_id: IDLE, p_code: "K7QM2XRD9PLAV4TE" })).error, "expired", "expired code refused");
    eq((await rpc("promo_admin_update", { p_admin_id: ADMIN, p_code_id: dc.id, p: { maxUses: 0, expiresAt: null } })).ok, true, "clear expiry");
    eq((await rpc("promo_admin_update", { p_admin_id: ADMIN, p_code_id: dc.id, p: { maxUses: 0 } })).ok, true, "noop update ok");

    // ---- shop item: granted; already owned -> refund in DesCoin
    const it = await mk({ code: "YAZS2NUAUR2RA8NR", rewardType: "shop_item", rewardRef: ITEM, maxUses: 60 });
    assert(it.ok, "item code");
    const g1 = await rpc("promo_redeem", { p_user_id: IDLE, p_code: "YAZS2NUAUR2RA8NR" });
    assert(g1.ok && g1.reward.alreadyOwned === false && g1.reward.name === "Aurora afişi", "item granted: " + JSON.stringify(g1));
    eq(one(`SELECT acquired_via FROM user_inventory WHERE user_id = '${IDLE}'`), "promo", "inventory via promo");
    one(`INSERT INTO user_inventory (user_id, item_id, acquired_via) VALUES ('${OLD}', '${ITEM}', 'purchase')`);
    const g2 = await rpc("promo_redeem", { p_user_id: OLD, p_code: "YAZS2NUAUR2RA8NR" });
    assert(g2.ok && g2.reward.alreadyOwned === true && g2.reward.refund === 400, "already owned -> refund: " + JSON.stringify(g2));
    eq(g2.balance, 1900, "refund credited 1500 + 400");
    eq(one(`SELECT count(*) FROM user_inventory WHERE user_id = '${OLD}'`), "1", "no duplicate inventory row");
    eq(one(`SELECT meta->>'kind' FROM descoin_ledger WHERE user_id = '${OLD}' AND amount = 400`), "owned_item_refund", "refund ledger kind");

    // ---- risk gate (anti-bot descoin_risk): unknown = allow (default) / withhold (strict); 70+ withheld; trusted ok
    const rk = await mk({ code: "RISKRISKRISKRISK", rewardType: "descoin", rewardAmount: 100 });
    const strict = await rpc("promo_redeem", { p_user_id: RISKY, p_code: "RISKRISKRISKRISK", p_risk_unknown: "withhold" });
    assert(strict.ok && strict.balance === 10, "strict mode withholds when no score exists: " + JSON.stringify(strict));
    eq(one(`SELECT withheld FROM promo_redemptions WHERE user_id = '${RISKY}'`), "t", "withheld flagged");
    one(`CREATE TABLE descoin_risk (user_id uuid PRIMARY KEY, score int NOT NULL, trusted boolean NOT NULL DEFAULT false);
         INSERT INTO descoin_risk VALUES ('${RISKY}', 82, false), ('${TRUSTED}', 95, true), ('${IDLE}', 69, false);`);
    const rk2 = await mk({ code: "RISKRISKRISK0002", rewardType: "descoin", rewardAmount: 100 });
    const risky = await rpc("promo_redeem", { p_user_id: RISKY, p_code: "RISKRISKRISK0002" });
    assert(risky.ok && risky.balance === 10, "risk 82: success shown, no coins: " + JSON.stringify(risky));
    eq(one(`SELECT count(*) FROM descoin_ledger WHERE user_id = '${RISKY}'`), "0", "no ledger row for withheld");
    const trusted = await rpc("promo_redeem", { p_user_id: TRUSTED, p_code: "RISKRISKRISK0002" });
    eq(trusted.balance, 100, "trusted override gets coins");
    const s69 = await rpc("promo_redeem", { p_user_id: IDLE, p_code: "RISKRISKRISK0002" });
    eq(s69.balance, 100, "score 69 gets coins");
    assert(rk.ok && rk2.ok, "risk codes created");

    // ---- badge extension point
    one(`CREATE TABLE user_special_badges (user_id uuid, badge_id text, PRIMARY KEY (user_id, badge_id));
         CREATE FUNCTION promo_grant_special_badge(p_user_id uuid, p_badge_id text, p_code_id uuid) RETURNS boolean
         LANGUAGE sql AS $$ WITH ins AS (INSERT INTO user_special_badges VALUES (p_user_id, p_badge_id) ON CONFLICT DO NOTHING RETURNING 1)
                         SELECT EXISTS (SELECT 1 FROM ins) $$;`);
    const bd = await mk({ code: "EKIM29CMHRYT2026", rewardType: "special_badge", rewardRef: "ekim29" });
    assert(bd.ok, "badge code once the catalog exists");
    const b1 = await rpc("promo_redeem", { p_user_id: OLD, p_code: "EKIM-29CM-HRYT-2026" });
    eq(b1.reward, { type: "special_badge", badgeId: "ekim29" }, "badge reward");
    const bd2 = await mk({ code: "EKIM29CMHRYT2027", rewardType: "special_badge", rewardRef: "ekim29", maxUses: 5 });
    const b2 = await rpc("promo_redeem", { p_user_id: OLD, p_code: "EKIM29CMHRYT2027" });
    eq(b2.error, "badge_owned", "badge already owned");
    eq(one(`SELECT used_count || '/' || (SELECT count(*) FROM promo_redemptions WHERE code_id = '${bd2.id}') FROM promo_codes WHERE id = '${bd2.id}'`), "0/0", "owned badge does not use the code");

    // ---- personal (selected) single-use code
    const pc = await mk({ code: "BETAT3STV214QA7R", rewardType: "descoin", rewardAmount: 50, maxUses: 1,
      popupAudience: "selected", targetUserIds: [IDLE] });
    eq(pc.targets, 1, "one target");
    eq((await rpc("promo_redeem", { p_user_id: TRUSTED, p_code: "BETAT3STV214QA7R" })).error, "invalid", "someone else's personal code reads as invalid");
    assert((await rpc("promo_redeem", { p_user_id: IDLE, p_code: "BETAT3STV214QA7R" })).ok, "owner redeems personal code");

    // ---- not once-per-user: the same person can use it again until the limit
    await mk({ code: "MULTIMULTIMULTI1", rewardType: "descoin", rewardAmount: 1, maxUses: 3, oncePerUser: false });
    for (let i = 0; i < 3; i += 1) assert((await rpc("promo_redeem", { p_user_id: TRUSTED, p_code: "MULTIMULTIMULTI1" })).ok, "multi use " + i);
    eq((await rpc("promo_redeem", { p_user_id: TRUSTED, p_code: "MULTIMULTIMULTI1" })).error, "limit", "multi use stops at limit");

    // ---- wrong-try lock: 5 wrong tries in 10 minutes -> 10-minute lock (used/limit/age do not count)
    const LOCKU = "00000000-0000-4000-8000-0000000000c1";
    one(`INSERT INTO users (id, username, created_at) VALUES ('${LOCKU}', 'lock', now() AT TIME ZONE 'UTC' - interval '60 days')`);
    for (let i = 0; i < 5; i += 1) eq((await rpc("promo_redeem", { p_user_id: LOCKU, p_code: `WRONGWRONGWRONG${i}` })).error, "invalid", "wrong " + i);
    const locked = await rpc("promo_redeem", { p_user_id: LOCKU, p_code: "K7QM2XRD9PLAV4TE" });
    assert(locked.error === "rate_limited" && locked.retryAfter > 590 && locked.retryAfter <= 600, "locked for ~10 min: " + JSON.stringify(locked));
    one(`UPDATE promo_attempts SET created_at = created_at - interval '11 minutes' WHERE user_id = '${LOCKU}'`);
    assert((await rpc("promo_redeem", { p_user_id: LOCKU, p_code: "K7QM2XRD9PLAV4TE" })).ok, "unlocked after 10 minutes");
    // per-IP: 30 wrong tries in an hour from one IP hash locks that IP for everyone
    one(`INSERT INTO promo_attempts (user_id, ip_hash, ok, result, created_at)
         SELECT gen_random_uuid(), 'ipZ', false, 'invalid', now() - (g * interval '1 minute') FROM generate_series(1, 30) g`);
    eq((await rpc("promo_redeem", { p_user_id: TRUSTED, p_code: "YAZS2NUAUR2RA8NR", p_ip_hash: "ipZ" })).error, "rate_limited", "IP lock");
    eq(one(`SELECT count(*) FROM promo_attempts WHERE result = 'locked' AND ip_hash = 'ipZ'`), "1", "locked try logged");

    // ---- popup audience
    one(`DELETE FROM promo_codes; DELETE FROM promo_attempts;`);
    one(`INSERT INTO users (id, username, created_at, last_seen) VALUES
          ('00000000-0000-4000-8000-0000000000d1', 'later', now() AT TIME ZONE 'UTC' + interval '1 minute', now() AT TIME ZONE 'UTC')`);
    const all = await mk({ code: "POPALLPOPALLPOP1", rewardType: "descoin", rewardAmount: 250, popupAudience: "all", message: "Selam" });
    const pop = await rpc("promo_popup_for", { p_user_id: OLD });
    assert(pop && pop.id === all.id && pop.code === "POPALLPOPALLPOP1" && pop.message === "Selam", "old account sees 'all' popup: " + JSON.stringify(pop));
    eq(await rpc("promo_popup_for", { p_user_id: "00000000-0000-4000-8000-0000000000d1" }), null, "accounts created after the code never get the 'all' popup");
    eq(await rpc("promo_popup_for", { p_user_id: BANNED }), null, "banned: no popup");
    // "Sonra" -> back once after 24h, then never
    await rpc("promo_popup_mark", { p_user_id: OLD, p_code_id: all.id, p_snooze: true });
    eq(await rpc("promo_popup_for", { p_user_id: OLD }), null, "snoozed: hidden");
    one(`UPDATE promo_popup_seen SET snoozed_until = now() - interval '1 second' WHERE user_id = '${OLD}'`);
    eq((await rpc("promo_popup_for", { p_user_id: OLD }))?.id, all.id, "back after 24h");
    await rpc("promo_popup_mark", { p_user_id: OLD, p_code_id: all.id, p_snooze: true });
    eq(await rpc("promo_popup_for", { p_user_id: OLD }), null, "second Sonra is final");
    // closing without snooze is final
    await rpc("promo_popup_mark", { p_user_id: IDLE, p_code_id: all.id, p_snooze: false });
    eq(await rpc("promo_popup_for", { p_user_id: IDLE }), null, "seen once: final");
    // active_7d skips idle accounts
    const act = await mk({ code: "POPACTPOPACTPOP1", rewardType: "descoin", rewardAmount: 5, popupAudience: "active_7d" });
    eq((await rpc("promo_popup_for", { p_user_id: TRUSTED }))?.id, act.id, "active account sees active_7d");
    one(`DELETE FROM promo_popup_seen`);
    eq((await rpc("promo_popup_for", { p_user_id: IDLE }))?.id, all.id, "idle account only gets the 'all' one");
    // redeeming hides the popup
    assert((await rpc("promo_redeem", { p_user_id: TRUSTED, p_code: "POPACTPOPACTPOP1" })).ok, "redeem from popup");
    eq((await rpc("promo_popup_for", { p_user_id: TRUSTED }))?.id, all.id, "used code's popup is gone, next one shows");
    // selected
    const sel = await mk({ code: "POPSELPOPSELPOP1", rewardType: "descoin", rewardAmount: 5, popupAudience: "selected", targetUserIds: [NEWB] });
    eq((await rpc("promo_popup_for", { p_user_id: NEWB }))?.id, sel.id, "selected target sees it");
    eq(await rpc("promo_popup_for", { p_user_id: "00000000-0000-4000-8000-0000000000d1" }), null, "non-target sees nothing");

    // ---- admin overview + history
    const ov = await rpc("promo_admin_overview", {});
    assert(ov.kpis.activeCodes >= 3 && Array.isArray(ov.codes) && ov.badgesAvailable === true && ov.audience.all >= 8 && ov.audience.active7d >= 3, "overview: " + JSON.stringify(ov.kpis));
    const hist = await rpc("promo_history", { p_user_id: TRUSTED });
    assert(hist.length >= 1 && hist[0].code === "POPACTPOPACTPOP1", "history newest first");
    const reds = await rpc("promo_admin_redemptions", { p_code_id: act.id });
    eq([reds.total, reds.items[0].user.username], [1, "trusted"], "redemptions list");

    // ---- migration re-runs cleanly (idempotent, additive)
    pg.q(url, require("fs").readFileSync(require("path").join(__dirname, "../../../supabase/migrations/20261026_promo_codes.sql"), "utf8"));
    eq(one(`SELECT count(*) > 0 FROM promo_redemptions`), "t", "re-applying keeps data");

    console.log("promo.db.test.cjs: ok");
  } finally {
    db.drop();
  }
}

run().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
