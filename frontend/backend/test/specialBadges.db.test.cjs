"use strict";

/**
 * Special badges against a real Postgres: grant / take back / equip / #001 uniqueness /
 * account deletion / promo-code hook and races. The migration's functions are the source of
 * truth. Skips cleanly without SPECIAL_BADGES_TEST_PG_URL (or PROMO_TEST_PG_URL); the
 * "Special badges (Postgres)" CI job sets it.
 */

const pg = require("./specialBadgesPg.cjs");

if (!pg.available()) {
  console.log("specialBadges.db.test.cjs: skipped (set SPECIAL_BADGES_TEST_PG_URL to a throwaway Postgres)");
  process.exit(0);
}

function assert(c, msg) {
  if (!c) throw new Error("FAIL: " + msg);
}
function eq(a, b, msg) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`FAIL: ${msg}\n  got:  ${JSON.stringify(a)}\n  want: ${JSON.stringify(b)}`);
}

const ADMIN = "00000000-0000-4000-8000-0000000000aa";
const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

async function run() {
  // The badge migration must also stand alone (prod may apply it before or after the promo one).
  const solo = pg.freshDb("solo", { withPromo: false });
  try {
    eq(pg.q(solo.url, "SELECT count(*) FROM special_badges"), "36", "standalone migration seeds 36 badges");
    pg.q(solo.url, require("fs").readFileSync(pg.BADGE_MIGRATION, "utf8"));
    eq(pg.q(solo.url, "SELECT count(*) FROM special_badges"), "36", "re-running the migration is a no-op");
  } finally {
    solo.drop();
  }

  const db = pg.freshDb("main");
  const { url } = db;
  const rpc = (name, args) => pg.rpc(url, name, args);
  const one = (sql) => pg.q(url, sql);
  const grant = (user, badge, source = "admin", note = null) =>
    rpc("special_badge_grant", { p_user_id: user, p_badge_id: badge, p_source: source, p_actor_id: source === "admin" ? ADMIN : null, p_note: note });
  try {
    const users = [ADMIN, ...Array.from({ length: 30 }, (_, i) => U(i + 1))];
    one(`INSERT INTO users (id, username, created_at, last_seen) VALUES ${users
      .map((id, i) => `('${id}', 'user${i}', now() AT TIME ZONE 'UTC' - interval '60 days', now() AT TIME ZONE 'UTC')`)
      .join(", ")};`);

    // ---- catalog
    eq(one("SELECT count(*) FROM special_badges"), "36", "36 badges");
    eq(one("SELECT string_agg(no::text, ',' ORDER BY no) = string_agg(g::text, ',' ORDER BY g) FROM special_badges JOIN generate_series(1,36) g ON g = no"), "t", "numbers 1..36");
    eq(one("SELECT id || ':' || tier || ':' || grant_mode || ':' || no FROM special_badges WHERE id = 'facebook'"), "facebook:nadir:admin_only:36", "Facebook is #36, Nadir, admin only");
    eq(one("SELECT description FROM special_badges WHERE id = 'facebook'"), "Bilen bilir. Satılmaz, kodla da çıkmaz; yalnızca elle verilir.", "Facebook copy");
    eq(one("SELECT count(*) FROM special_badges WHERE NOT active"), "0", "all badges are active");
    eq(one("SELECT max_holders FROM special_badges WHERE id = 'no001'"), "1", "#001 has one holder");
    eq(one("SELECT has_table_privilege('anon', 'public.user_special_badges', 'SELECT')"), "f", "anon cannot read holders");
    eq(one("SELECT has_function_privilege('authenticated', 'public.special_badge_grant(uuid,text,text,uuid,text,uuid)', 'EXECUTE')"), "f", "clients cannot grant");
    eq(one("SELECT relrowsecurity FROM pg_class WHERE relname = 'user_special_badges'"), "t", "RLS on");

    // ---- grant
    const g1 = await grant(U(1), "beta", "admin", "  test  ");
    eq([g1.ok, g1.granted, g1.serial], [true, true, 1], "first beta is #1");
    eq((await grant(U(2), "beta")).serial, 2, "second beta is #2");
    eq(await grant(U(1), "beta").then((r) => [r.granted, r.error]), [false, "owned"], "owning twice is refused");
    eq(one(`SELECT note FROM user_special_badges WHERE user_id = '${U(1)}'`), "test", "note trimmed");
    eq((await grant(U(1), "nope")).error, "badge_not_found", "unknown badge");
    eq((await grant(U(1), "facebook", "promo")).error, "admin_only", "Facebook never comes from a code");
    eq((await grant(U(1), "facebook", "admin")).granted, true, "admin can give Facebook");
    eq((await grant("00000000-0000-4000-8000-00000000ffff", "beta")).error, "user_not_found", "unknown user");
    eq((await rpc("special_badge_grant", { p_user_id: U(3), p_badge_id: "beta", p_source: "shop" })).error, "source", "there is no shop source: badges cannot be bought");

    // ---- #001 uniqueness
    eq((await grant(U(3), "no001")).serial, 1, "#001 goes to the first person");
    eq((await grant(U(4), "no001")).error, "taken", "#001 cannot go to a second person");
    eq((await rpc("special_badge_revoke", { p_user_id: U(3), p_badge_id: "no001", p_actor_id: ADMIN, p_reason: "yanlış kişi" })).ok, true, "admin takes #001 back");
    eq((await grant(U(4), "no001")).serial, 1, "#001 can be given again after it is taken back");
    one(`UPDATE users SET deleted_at = now() WHERE id = '${U(4)}'`);
    eq((await grant(U(5), "no001")).serial, 1, "a deleted holder's #001 is released on the next grant");
    eq(one(`SELECT revoke_reason FROM user_special_badges WHERE user_id = '${U(4)}' AND badge_id = 'no001'`), "account_deleted", "release reason");
    eq((await grant(U(4), "beta")).error, "user_not_found", "deleted accounts get nothing");

    // ---- equip
    eq((await rpc("special_badge_equip", { p_user_id: U(2), p_badge_id: "og" })).error, "not_owned", "cannot wear an unowned badge");
    eq((await rpc("special_badge_equip", { p_user_id: U(1), p_badge_id: "beta" })).equipped, "beta", "wear beta");
    const sw = await rpc("special_badge_equip", { p_user_id: U(1), p_badge_id: "facebook" });
    eq([sw.equipped, sw.previous], ["facebook", "beta"], "switching reports the previous one");
    eq(one(`SELECT string_agg(badge_id, ',') FROM user_special_badges WHERE user_id = '${U(1)}' AND equipped`), "facebook", "one badge worn at a time");
    const rv = await rpc("special_badge_revoke", { p_user_id: U(1), p_badge_id: "facebook", p_actor_id: ADMIN, p_reason: null });
    eq([rv.ok, rv.wasEquipped], [true, true], "taking back a worn badge reports it");
    eq(one(`SELECT count(*) FROM user_special_badges WHERE user_id = '${U(1)}' AND equipped`), "0", "taking back drops it from the profile");
    eq(one(`SELECT count(*) FROM user_special_badges WHERE user_id = '${U(1)}' AND revoked_at IS NOT NULL AND revoke_notified_at IS NULL`), "1", "the holder will be told");
    eq((await rpc("special_badge_equip", { p_user_id: U(1), p_badge_id: "facebook" })).error, "not_owned", "a taken-back badge cannot be worn");
    eq((await rpc("special_badge_revoke", { p_user_id: U(1), p_badge_id: "facebook" })).error, "not_owned", "nothing to take back twice");
    eq((await rpc("special_badge_equip", { p_user_id: U(1), p_badge_id: null })).equipped, null, "wear nothing");
    eq((await grant(U(1), "facebook")).serial, 2, "unlimited badges never reuse a number");

    // ---- account deletion releases everything
    await rpc("special_badge_equip", { p_user_id: U(2), p_badge_id: "beta" });
    eq(await rpc("special_badge_release_user", { p_user_id: U(2) }), 1, "release counts rows");
    eq(one(`SELECT count(*) FROM user_special_badges WHERE user_id = '${U(2)}' AND revoked_at IS NULL`), "0", "nothing left after release");
    eq(one(`SELECT count(*) FROM special_badge_audit WHERE user_id = '${U(2)}' AND action = 'release'`), "1", "release audited");

    // ---- races: serials stay unique, #001 still has one holder
    await rpc("special_badge_revoke", { p_user_id: U(5), p_badge_id: "no001" });
    const racers = Array.from({ length: 12 }, (_, i) => U(10 + i));
    const ogs = await Promise.all(racers.map((u) => grant(u, "og")));
    eq(ogs.map((r) => r.serial).sort((a, b) => a - b), Array.from({ length: 12 }, (_, i) => i + 1), "12 parallel grants get #1..#12");
    const firsts = await Promise.all(racers.map((u) => grant(u, "no001")));
    eq(firsts.filter((r) => r.granted).length, 1, "parallel #001 grants: exactly one wins");
    eq(firsts.filter((r) => r.error === "taken").length, 11, "the rest are told it is taken");
    const flips = await Promise.all(["og", "no001", null, "og", "og", null].map((b) => rpc("special_badge_equip", { p_user_id: racers[0], p_badge_id: b })));
    assert(flips.every((r) => r.ok || r.error === "not_owned"), "parallel equips do not error");
    assert(Number(one(`SELECT count(*) FROM user_special_badges WHERE user_id = '${racers[0]}' AND equipped`)) <= 1, "never two worn");

    // ---- read models
    const cat = await rpc("special_badge_catalog", {});
    eq(cat.length, 36, "catalog lists 36");
    eq(cat[0].id, "no001", "ordered by number");
    eq(cat.find((b) => b.id === "og").holders, 12, "holder counts are live");
    eq(cat.find((b) => b.id === "no001").holders, 1, "#001 has one holder");
    const ov = await rpc("special_badge_admin_overview", {});
    eq([ov.catalog, ov.active], [36, 36], "overview counts the catalog");
    eq(ov.granted, Number(one("SELECT count(*) FROM user_special_badges WHERE revoked_at IS NULL")), "overview counts live grants");

    const mine = await rpc("special_badge_user_badges", { p_user_id: U(1) });
    eq(mine.map((b) => b.id).sort(), ["beta", "facebook"], "a person's live badges");
    eq(mine.find((b) => b.id === "facebook").grantedBy.username, "user0", "granted by the admin");
    eq(await rpc("special_badge_user_badges", { p_user_id: U(4) }), [], "a deleted account shows nothing");
    const worn = await rpc("special_badge_equipped_for", { p_user_ids: `{${racers.join(",")}}` });
    assert(worn.every((w) => racers.includes(w.userId)), "equipped lookup by ids");
    const hold = await rpc("special_badge_holders", { p_badge_id: "og", p_limit: 5 });
    eq(hold.map((h) => h.serial), [1, 2, 3, 4, 5], "holders by serial");
    const log = await rpc("special_badge_audit_list", { p_limit: 3 });
    eq(log.length, 3, "audit is paged");
    const pend = await rpc("special_badge_pending", { p_user_id: U(1) });
    eq(pend.revoked.map((r) => r.id), ["facebook"], "take-back is pending for the holder");
    assert(pend.granted.some((g) => g.id === "beta"), "grant is pending");
    const ids = [...pend.granted, ...pend.revoked].map((r) => r.rowId);
    eq(await rpc("special_badge_mark_notified", { p_user_id: U(1), p_row_ids: `{${ids.join(",")}}` }), ids.length, "marked once");
    eq(await rpc("special_badge_pending", { p_user_id: U(1) }), { granted: [], revoked: [] }, "nothing pending after delivery");
    eq(await rpc("special_badge_mark_notified", { p_user_id: U(2), p_row_ids: `{${ids.join(",")}}` }), 0, "cannot mark someone else's rows");

    // ---- promo hook
    if (db.promo) {
      const mk = (p) => pg.rpc(url, "promo_admin_create", { p_admin_id: ADMIN, p });
      const code = (c, ref) => ({ code: c, rewardType: "special_badge", rewardRef: ref, maxUses: 10 });
      let failed = null;
      try { await mk(code("FACEBOOK00000000", "facebook")); } catch (err) { failed = err.message; }
      assert(failed && /not_promo_grantable/.test(failed), "a Facebook code cannot be created");
      failed = null;
      const holder = firsts.findIndex((r) => r.granted);
      assert(holder >= 0, "someone holds #001");
      try { await mk(code("TEKIL00000000000", "no001")); } catch (err) { failed = err.message; }
      assert(failed && /not_promo_grantable/.test(failed), "a held #001 cannot go on a code");
      const made = await mk(code("BETAKODU00000000", "beta"));
      assert(made.ok, "beta code created: " + JSON.stringify(made));
      const r1 = await pg.rpc(url, "promo_redeem", { p_user_id: U(25), p_code: "BETAKODU00000000", p_ip_hash: "ip1" });
      eq([r1.ok, r1.reward && r1.reward.type, r1.reward && r1.reward.badgeId], [true, "special_badge", "beta"], "redeeming gives the badge");
      eq(one(`SELECT source || ':' || (promo_code_id IS NOT NULL) FROM user_special_badges WHERE user_id = '${U(25)}' AND badge_id = 'beta'`), "promo:true", "grant records the code");
      await grant(U(26), "beta");
      const r2 = await pg.rpc(url, "promo_redeem", { p_user_id: U(26), p_code: "BETAKODU00000000", p_ip_hash: "ip2" });
      eq([r2.ok, r2.error], [false, "badge_owned"], "already owned reads as badge_owned");
      eq(one(`SELECT used_count FROM promo_codes WHERE code_norm = 'BETAKODU00000000'`), "1", "a refused redemption does not use the code");
      // A code that names a badge later switched to admin-only cannot give it.
      one(`UPDATE special_badges SET grant_mode = 'admin_only' WHERE id = 'beta'`);
      const r3 = await pg.rpc(url, "promo_redeem", { p_user_id: U(27), p_code: "BETAKODU00000000", p_ip_hash: "ip3" });
      eq([r3.ok, r3.error], [false, "unavailable"], "admin-only badge reads as unavailable");
      one(`UPDATE special_badges SET grant_mode = 'promo' WHERE id = 'beta'`);
      eq(one("SELECT public.promo_badges_available()"), "t", "promo sees the badge catalog");
      eq((await rpc("special_badge_admin_overview", {})).activeCodes, 1, "the beta code counts as an active badge code");
    } else {
      console.log("specialBadges.db.test.cjs: promo migration not in the tree, promo hook checks skipped");
    }

    console.log("specialBadges.db.test.cjs: ok");
  } finally {
    db.drop();
  }
}

run().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
