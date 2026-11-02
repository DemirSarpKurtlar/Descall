"use strict";

/**
 * Descall+ / Ultra against a real Postgres: admin apply (grant, extend, change_plan, cancel,
 * set_end, set_unlimited), unlimited vs dated, one membership per user, lazy expiry + sweeper,
 * DesCoin gift exactly once per 30-day cycle (with catch-up after a sleep), idempotent retries,
 * bulk partial failure, append-only events, campaign redeem limits and the races between them.
 * Skips cleanly without PREMIUM_TEST_PG_URL (or PROMO_TEST_PG_URL); the "Premium (Postgres)" CI
 * job sets it.
 */

const pg = require("./premiumPg.cjs");

if (!pg.available()) {
  console.log("premium.db.test.cjs: skipped (set PREMIUM_TEST_PG_URL to a throwaway Postgres)");
  process.exit(0);
}

function assert(c, msg) {
  if (!c) throw new Error("FAIL: " + msg);
}
function eq(a, b, msg) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`FAIL: ${msg}\n  got:  ${JSON.stringify(a)}\n  want: ${JSON.stringify(b)}`);
}
async function rejects(p, re, msg) {
  try {
    await p;
  } catch (err) {
    assert(re.test(String(err.message)), `${msg}: ${err.message}`);
    return;
  }
  throw new Error("FAIL: expected an error: " + msg);
}

const ADMIN = "00000000-0000-4000-8000-0000000000aa";
const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const GHOST = "00000000-0000-4000-8000-00000000ffff";

async function run() {
  const db = pg.freshDb("main");
  const { url } = db;
  const one = (sql) => pg.q(url, sql);
  const rpc = (name, args) => pg.rpc(url, name, args);
  const apply = (user, op, extra = {}) =>
    rpc("premium_admin_apply", {
      p_actor: ADMIN, p_user: user, p_op: op, p_plan: extra.plan ?? null, p_days: extra.days ?? null,
      p_ends_at: extra.ends_at ?? null, p_unlimited: extra.unlimited ?? null, p_is_free: extra.is_free ?? true,
      p_reason: extra.reason === undefined ? "test" : extra.reason, p_note: extra.note ?? null,
      p_request_id: extra.request_id ?? null, p_batch: null,
    });
  const balance = (u) => Number(one(`SELECT descoin_balance FROM users WHERE id = '${u}'`));
  const ledgerSum = (u) => Number(one(`SELECT coalesce(sum(amount), 0) FROM descoin_ledger WHERE user_id = '${u}'`));
  const gifts = (u) => Number(one(`SELECT count(*) FROM descoin_ledger WHERE user_id = '${u}' AND reason = 'premium_gift'`));
  const events = (u, kind) => Number(one(`SELECT count(*) FROM subscription_events WHERE user_id = '${u}'${kind ? ` AND kind = '${kind}'` : ""}`));

  try {
    const users = [ADMIN, ...Array.from({ length: 60 }, (_, i) => U(i + 1))];
    one(`INSERT INTO users (id, username, display_name, email, created_at) VALUES ${users
      .map((id, i) => `('${id}', 'user${i}', 'Kişi ${i}', 'person${i}@example.com', now() AT TIME ZONE 'UTC' - interval '60 days')`)
      .join(", ")};`);

    // ---- catalogue, security
    eq(one("SELECT string_agg(id || ':' || monthly_descoin, ',' ORDER BY sort) FROM premium_plans"), "plus:5000,ultra:15000", "plans seeded");
    eq(one("SELECT count(*) FROM premium_plans WHERE price_minor IS NOT NULL OR currency IS NOT NULL"), "0", "no prices in phase 1");
    eq(one("SELECT jsonb_array_length(features) FROM premium_plans WHERE id = 'ultra'"), "47", "ultra lists every key");
    for (const t of ["premium_plans", "user_subscriptions", "subscription_events", "premium_bulk_batches", "premium_bulk_results",
      "premium_campaigns", "premium_campaign_redemptions", "payment_transactions"]) {
      eq(one(`SELECT relrowsecurity FROM pg_class WHERE relname = '${t}'`), "t", `RLS on ${t}`);
      eq(one(`SELECT has_table_privilege('anon', 'public.${t}', 'SELECT')`), "f", `anon cannot read ${t}`);
      eq(one(`SELECT has_table_privilege('authenticated', 'public.${t}', 'INSERT')`), "f", `clients cannot write ${t}`);
    }
    eq(one("SELECT has_function_privilege('authenticated', 'public.premium_admin_apply(uuid,uuid,text,text,integer,timestamptz,boolean,boolean,text,text,text,uuid)', 'EXECUTE')"), "f", "clients cannot apply");
    eq(one("SELECT has_function_privilege('anon', 'public.premium_campaign_redeem(uuid,text)', 'EXECUTE')"), "f", "anon cannot redeem directly");
    eq(one("SELECT has_function_privilege('service_role', 'public.premium_run_scheduled()', 'EXECUTE')"), "t", "service role runs the sweeper");
    eq(one("SELECT prosecdef FROM pg_proc WHERE proname = 'premium_admin_apply'"), "t", "SECURITY DEFINER");
    eq(one("SELECT count(*) FROM payment_transactions"), "0", "payments table stays empty");
    eq(one("SELECT premium_mask_email('demodemo@gmail.com')"), "de***@g***.com", "masked e-mail");
    eq(one("SELECT premium_mask_email('a@b')"), "***@b***", "short e-mail still masked");

    // ---- grant: dated, first gift paid at the grant
    let r = await apply(U(1), "grant", { plan: "plus", days: 30, request_id: "req-grant-u1" });
    eq([r.ok, r.subscription.plan_id, r.subscription.status, r.subscription.unlimited, r.event.kind], [true, "plus", "active", false, "grant"], "grant plus 30d");
    eq(r.coin_cycles_paid_now, 1, "first gift at the grant");
    eq([balance(U(1)), ledgerSum(U(1)), gifts(U(1))], [5000, 5000, 1], "5000 DesCoin through the ledger");
    eq(one(`SELECT meta->>'plan' FROM descoin_ledger WHERE user_id = '${U(1)}'`), "plus", "ledger row names the plan");
    eq(events(U(1)), 2, "grant + coin_grant events");
    eq(one(`SELECT (next_coin_at - started_at) = interval '30 days' FROM user_subscriptions WHERE user_id = '${U(1)}'`), "t", "next gift in 30 days");

    // retry with the same request id: same answer, nothing new
    const again = await apply(U(1), "grant", { plan: "plus", days: 30, request_id: "req-grant-u1" });
    eq([again.ok, again.replay, again.event.id], [true, true, r.event.id], "idempotent retry");
    eq([balance(U(1)), events(U(1))], [5000, 2], "retry neither pays nor logs again");

    // one active membership per user
    eq((await apply(U(1), "grant", { plan: "ultra", days: 10 })).error, "already_active", "second grant refused");
    eq(one(`SELECT count(*) FROM user_subscriptions WHERE user_id = '${U(1)}'`), "1", "one row per user");

    // validation
    eq((await apply(U(2), "grant", { plan: "gold", days: 5 })).error, "invalid_plan", "unknown plan");
    eq((await apply(U(2), "grant", { plan: "plus" })).error, "invalid_duration", "dated grant needs a duration");
    eq((await apply(U(2), "grant", { plan: "plus", days: 0 })).error, "invalid_duration", "days >= 1");
    eq((await apply(U(2), "grant", { plan: "plus", days: 3, reason: "  " })).error, "reason_required", "reason required");
    eq((await apply(U(2), "fly", { plan: "plus", days: 3 })).error, "invalid_op", "unknown op");
    eq((await apply(GHOST, "grant", { plan: "plus", days: 3 })).error, "user_not_found", "unknown user");
    eq((await apply(U(2), "extend", { days: 3 })).error, "not_active", "extend needs a membership");
    eq((await apply(U(2), "grant", { plan: "plus", days: 3, request_id: "bad id!" })).error, "invalid_request_id", "request id shape");

    // ---- extend, change_plan, set_end, set_unlimited, cancel
    const end0 = one(`SELECT ends_at FROM user_subscriptions WHERE user_id = '${U(1)}'`);
    r = await apply(U(1), "extend", { days: 10 });
    eq([r.ok, r.event.kind], [true, "extend"], "extend");
    eq(one(`SELECT ends_at - '${end0}'::timestamptz FROM user_subscriptions WHERE user_id = '${U(1)}'`), "10 days", "extended by 10 days");
    eq(r.event.prev_ends_at !== r.event.new_ends_at, true, "event keeps before / after");
    r = await apply(U(1), "change_plan", { plan: "ultra" });
    eq([r.ok, r.subscription.plan_id, r.event.prev_plan, r.event.new_plan], [true, "ultra", "plus", "ultra"], "upgrade to ultra");
    eq((await apply(U(1), "change_plan", { plan: "ultra" })).error, "same_plan", "same plan refused");
    eq(balance(U(1)), 5000, "changing plan pays nothing extra now");
    const future = one("SELECT (now() + interval '90 days')::text");
    r = await apply(U(1), "set_end", { ends_at: future });
    eq([r.ok, r.subscription.ends_at !== null], [true, true], "set_end");
    eq((await apply(U(1), "set_end", { ends_at: "2001-01-01T00:00:00Z" })).error, "invalid_end", "end in the past refused");
    r = await apply(U(1), "set_unlimited", { unlimited: true });
    eq([r.ok, r.subscription.unlimited, r.subscription.ends_at], [true, true, null], "unlimited");
    eq((await apply(U(1), "extend", { days: 5 })).error, "already_unlimited", "cannot extend unlimited");
    eq((await apply(U(1), "set_unlimited", { unlimited: false })).error, "invalid_end", "back to dated needs an end");
    r = await apply(U(1), "set_unlimited", { unlimited: false, days: 20 });
    eq([r.ok, r.subscription.unlimited], [true, false], "unlimited back to dated");
    await rejects(pg.psqlAsync(url, `UPDATE user_subscriptions SET unlimited = true WHERE user_id = '${U(1)}'`), /end_shape/, "unlimited needs ends_at null");
    await rejects(pg.psqlAsync(url, `UPDATE user_subscriptions SET ends_at = NULL WHERE user_id = '${U(1)}'`), /end_shape/, "dated needs ends_at");
    r = await apply(U(1), "cancel", { reason: "test bitti" });
    eq([r.ok, r.subscription.status, r.subscription.active, r.subscription.next_coin_at], [true, "cancelled", false, null], "cancel");
    eq((await apply(U(1), "cancel")).error, "not_active", "cancel twice");
    eq((await rpc("premium_me", { p_user: U(1) })).plan, null, "cancelled = no plan");
    r = await apply(U(1), "grant", { plan: "plus", unlimited: true });
    eq([r.ok, r.subscription.unlimited, r.coin_cycles_paid_now], [true, true, 1], "grant again after cancel, unlimited, gift paid");
    eq([balance(U(1)), ledgerSum(U(1))], [10000, 10000], "balance matches ledger");

    // ---- lazy expiry and the sweeper
    await apply(U(3), "grant", { plan: "ultra", days: 30 });
    eq(balance(U(3)), 15000, "ultra gift 15000");
    one(`UPDATE user_subscriptions SET ends_at = now() - interval '1 minute', started_at = now() - interval '29 days',
         next_coin_at = now() + interval '1 day' WHERE user_id = '${U(3)}'`);
    let me = await rpc("premium_me", { p_user: U(3) });
    eq([me.plan, me.status], [null, "expired"], "inactive as soon as ends_at passes, sweeper or not");
    eq((await apply(U(3), "extend", { days: 5 })).error, "not_active", "a lapsed membership cannot be extended");
    let ex = await rpc("premium_expire_due", {});
    eq(ex.expired, 1, "sweeper marks it expired");
    eq(ex.user_ids, [U(3)], "and says who");
    eq([one(`SELECT status FROM user_subscriptions WHERE user_id = '${U(3)}'`), events(U(3), "expire")], ["expired", 1], "expire event");
    eq((await rpc("premium_expire_due", {})).expired, 0, "nothing to expire twice");
    eq(balance(U(3)), 15000, "no gift after the end");

    // ---- coin gift exactly once per cycle, with catch-up after a long sleep
    await apply(U(4), "grant", { plan: "plus", unlimited: true });
    one(`UPDATE user_subscriptions SET started_at = now() - interval '95 days', next_coin_at = now() - interval '65 days' WHERE user_id = '${U(4)}'`);
    let g = await rpc("premium_grant_due_coins", {});
    eq([g.users, g.cycles], [1, 3], "three missed cycles (-65, -35, -5 days) paid");
    eq([balance(U(4)), gifts(U(4)), ledgerSum(U(4))], [20000, 4, 20000], "each cycle once, ledger matches");
    eq((await rpc("premium_grant_due_coins", {})).cycles, 0, "second sweep pays nothing");
    eq(one(`SELECT next_coin_at > now() AND next_coin_at < now() + interval '30 days' FROM user_subscriptions WHERE user_id = '${U(4)}'`), "t", "next cycle in the future");
    eq(one(`SELECT count(DISTINCT cycle_at) FROM subscription_events WHERE user_id = '${U(4)}' AND kind = 'coin_grant'`), "4", "distinct cycles");
    await rejects(pg.psqlAsync(url, `INSERT INTO descoin_ledger (user_id, amount, reason, meta, balance_after)
      SELECT user_id, amount, reason, meta, balance_after FROM descoin_ledger WHERE user_id = '${U(4)}' AND reason = 'premium_gift' LIMIT 1`),
      /descoin_ledger_premium_gift_key/, "the ledger refuses a second row for a cycle");

    // dated membership that ended while the backend slept: cycles that started before the end are still paid
    await apply(U(5), "grant", { plan: "plus", days: 60 });
    one(`UPDATE user_subscriptions SET started_at = now() - interval '70 days', ends_at = now() - interval '10 days',
         next_coin_at = now() - interval '40 days' WHERE user_id = '${U(5)}'`);
    ex = await rpc("premium_run_scheduled", {});
    eq(ex.skipped, false, "scheduler ran");
    eq([balance(U(5)), gifts(U(5))], [10000, 2], "the cycle at -40d is paid, the one at -10d (= end) is not");
    eq(one(`SELECT status FROM user_subscriptions WHERE user_id = '${U(5)}'`), "expired", "then it expires");

    // wallet frozen: the cycle passes, nothing is credited, the event says why
    await apply(U(6), "grant", { plan: "plus", days: 90 });
    one(`UPDATE users SET descoin_frozen = true WHERE id = '${U(6)}'`);
    one(`UPDATE user_subscriptions SET next_coin_at = now() - interval '1 day' WHERE user_id = '${U(6)}'`);
    await rpc("premium_grant_due_coins", {});
    eq([balance(U(6)), gifts(U(6))], [5000, 1], "frozen wallet gets no gift");
    eq(one(`SELECT meta->>'withheld' FROM subscription_events WHERE user_id = '${U(6)}' AND kind = 'coin_grant' ORDER BY created_at DESC LIMIT 1`), "wallet_frozen", "withheld reason");

    // ---- append-only events
    await rejects(pg.psqlAsync(url, `UPDATE subscription_events SET reason = 'x' WHERE user_id = '${U(1)}'`), /append-only/, "events cannot be updated");
    await rejects(pg.psqlAsync(url, `DELETE FROM subscription_events WHERE user_id = '${U(1)}'`), /append-only/, "events cannot be deleted");
    await rejects(pg.psqlAsync(url, "TRUNCATE subscription_events"), /append-only/, "events cannot be truncated");

    // ---- own-row RLS for authenticated
    one(`GRANT USAGE ON SCHEMA public TO authenticated`);
    eq(one(`BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub', '${U(4)}', true);
            SELECT count(*) || '/' || (SELECT count(*) FROM subscription_events) FROM user_subscriptions; COMMIT;`).split("\n").pop(),
      `1/${events(U(4))}`, "a user sees only their own row and events");

    // ---- bulk: partial failure, per-user results, idempotent retry
    const bulkArgs = {
      p_actor: ADMIN, p_user_ids: [U(10), U(11), U(1), GHOST, U(12), U(10)], p_op: "grant", p_plan: "ultra", p_days: 14,
      p_ends_at: null, p_unlimited: null, p_is_free: true, p_reason: "beta", p_note: null, p_request_id: "bulk-req-0001",
    };
    let b = await rpc("premium_admin_bulk", bulkArgs);
    eq([b.ok, b.replay, b.batch.total, b.batch.ok, b.batch.failed], [true, false, 5, 3, 2], "3 ok, 2 failed, duplicates folded");
    eq(b.results.filter((x) => !x.ok).map((x) => x.error).sort(), ["already_active", "user_not_found"], "per-user reasons");
    eq([balance(U(10)), balance(U(11)), balance(U(12))], [15000, 15000, 15000], "each new member gets the ultra gift");
    b = await rpc("premium_admin_bulk", bulkArgs);
    eq([b.replay, b.batch.ok], [true, 3], "retry returns the same batch");
    eq([balance(U(10)), events(U(10), "grant")], [15000, 1], "retry does not grant twice");
    eq(one("SELECT count(*) FROM premium_bulk_batches"), "1", "one batch row");
    eq((await rpc("premium_bulk_get", { p_batch: b.batch.id })).results.length, 5, "batch readable");
    eq((await rpc("premium_admin_bulk", { ...bulkArgs, p_request_id: null })).error, "invalid_request_id", "bulk needs a request id");
    eq(one(`SELECT count(*) FROM subscription_events WHERE batch_id = '${b.batch.id}'`), "3", "events carry the batch");

    // ---- campaigns (phase 1: free_membership only)
    one(`INSERT INTO premium_campaigns (code, kind, plan_id, duration_days, total_limit, per_user_limit, percent_off) VALUES
         ('BETA2026', 'free_membership', 'plus', 7, 3, 1, NULL),
         ('PERCENT10', 'percent', NULL, NULL, NULL, 1, 10),
         ('OLDCODE', 'free_membership', 'plus', 7, NULL, 1, NULL),
         ('ONLYYOU', 'free_membership', 'ultra', 3, NULL, 1, NULL);
         UPDATE premium_campaigns SET starts_at = now() - interval '10 days', ends_at = now() - interval '1 day' WHERE code = 'OLDCODE';
         UPDATE premium_campaigns SET allowed_user_ids = ARRAY['${U(21)}']::uuid[] WHERE code = 'ONLYYOU';`);
    const redeem = (u, code) => rpc("premium_campaign_redeem", { p_user: u, p_code: code });
    r = await redeem(U(20), "beta-2026");
    eq([r.ok, r.subscription.plan_id, r.subscription.source, r.event.kind], [true, "plus", "campaign", "campaign_redeem"], "free membership redeemed");
    eq(balance(U(20)), 5000, "campaign members get the gift too");
    eq((await redeem(U(20), "BETA2026")).error, "used", "per-user limit while active");
    eq((await redeem(U(10), "BETA2026")).error, "already_active", "an active member cannot stack a campaign");
    one(`UPDATE user_subscriptions SET ends_at = now() - interval '1 second' WHERE user_id = '${U(20)}'`);
    eq((await redeem(U(20), "BETA2026")).error, "used", "per-user limit");
    eq((await redeem(U(22), "PERCENT10")).error, "not_redeemable", "percent coupons change nothing in phase 1");
    eq((await redeem(U(22), "OLDCODE")).error, "expired", "ended campaign");
    eq((await redeem(U(22), "NOPE1234")).error, "invalid", "unknown code");
    eq((await redeem(U(22), "ONLYYOU")).error, "invalid", "not on the allowed list");
    eq((await redeem(U(21), "ONLYYOU")).ok, true, "allowed user");
    eq((await redeem(U(23), "BETA2026")).ok, true, "second use");
    eq((await redeem(U(24), "BETA2026")).ok, true, "third use");
    eq((await redeem(U(25), "BETA2026")).error, "limit", "total limit");
    eq(one("SELECT used_count FROM premium_campaigns WHERE code = 'BETA2026'"), "3", "counter matches");
    one("UPDATE premium_campaigns SET active = false WHERE code = 'ONLYYOU'");
    const st = await rpc("premium_campaign_stats", { p_campaign: one("SELECT id FROM premium_campaigns WHERE code = 'BETA2026'") });
    eq([st.used_count, st.remaining, st.unique_users], [3, 0, 3], "campaign stats");

    // ---- read models
    const dash = await rpc("premium_admin_dashboard", {});
    eq([dash.payments_integrated, dash.paid_count], [false, null], "no payments yet");
    eq(dash.active_total, Number(one("SELECT count(*) FROM user_subscriptions WHERE status = 'active' AND (unlimited OR ends_at > now())")), "active total is live");
    eq(dash.active_plus + dash.active_ultra, dash.active_total, "plus + ultra");
    const an = await rpc("premium_admin_analytics", { p_from: one("SELECT (now() - interval '7 days')::text"), p_to: null, p_bucket: "day" });
    assert(Array.isArray(an.series) && an.series.length >= 7, "daily series");
    eq(an.series.reduce((s, x) => s + x.acquisitions, 0), Number(one("SELECT count(*) FROM subscription_events WHERE kind IN ('grant','campaign_redeem') AND created_at > now() - interval '8 days'")), "acquisitions add up");
    eq(an.free_paid.paid, null, "paid is null, never invented");
    eq(an.conversion.denominator_label, "accounts_created_in_range", "conversion names its denominator");
    eq(an.conversion.value, null, "no accounts created in range: null, not 0");
    assert(an.series[an.series.length - 1].active > 0, "active per bucket");
    const found = await rpc("premium_admin_user_search", { p_q: "person10@", p_limit: 5 });
    eq(found.map((u) => u.id), [U(10)], "search by e-mail");
    eq(found[0].email_masked, "pe***@e***.com", "only masked e-mail");
    assert(!JSON.stringify(found).includes("person10@example.com"), "raw e-mail never returned");
    eq((await rpc("premium_admin_user_search", { p_q: U(11) }))[0].id, U(11), "search by id");
    eq((await rpc("premium_admin_user_search", { p_q: "Kişi 12" }))[0].id, U(12), "search by display name");
    eq((await rpc("premium_admin_user_search", { p_q: "%" })).length, 0, "LIKE wildcards are literal");
    const det = await rpc("premium_admin_user", { p_user: U(1) });
    eq([det.user.id, det.subscription.plan_id], [U(1), "plus"], "user detail");
    assert(det.events.length >= 8 && det.events[0].created_at >= det.events[1].created_at, "events newest first");
    eq((await rpc("premium_active_for", { p_user_ids: [U(1), U(3), U(10)] })).map((x) => x.user_id).sort(), [U(1), U(10)].sort(), "active lookup");
    me = await rpc("premium_me", { p_user: U(10) });
    eq([me.plan, me.monthly_descoin, me.status], ["ultra", 15000, "active"], "premium_me");

    // ---- races
    // 1) 20 parallel grants to one user with different request ids: exactly one wins.
    const racer = U(40);
    const grants = await Promise.all(Array.from({ length: 20 }, (_, i) => apply(racer, "grant", { plan: "plus", days: 30, request_id: `race-grant-${i}` })));
    eq(grants.filter((x) => x.ok).length, 1, "one grant wins");
    eq(grants.filter((x) => x.error === "already_active").length, 19, "the rest see already_active");
    eq([balance(racer), gifts(racer)], [5000, 1], "one gift");
    // 2) the same request sent 15 times at once: one event.
    const same = await Promise.all(Array.from({ length: 15 }, () => apply(U(41), "grant", { plan: "ultra", days: 30, request_id: "race-same-req" })));
    assert(same.every((x) => x.ok), "all answers ok");
    eq(new Set(same.map((x) => x.event.id)).size, 1, "one event id");
    eq([events(U(41), "grant"), balance(U(41))], [1, 15000], "granted once");
    // 3) extend and cancel racing: both serialise, state stays consistent.
    const mix = await Promise.all([apply(racer, "extend", { days: 5 }), apply(racer, "cancel"), apply(racer, "extend", { days: 5 })]);
    assert(mix.some((x) => x.ok), "some succeed");
    const after = one(`SELECT status FROM user_subscriptions WHERE user_id = '${racer}'`);
    eq(after, "cancelled", "cancel lands");
    // 4) parallel schedulers and sweeps pay a cycle once.
    for (const u of [U(42), U(43), U(44)]) {
      await apply(u, "grant", { plan: "plus", unlimited: true });
      one(`UPDATE user_subscriptions SET next_coin_at = now() - interval '61 days' WHERE user_id = '${u}'`);
    }
    await Promise.all([
      ...Array.from({ length: 6 }, () => rpc("premium_run_scheduled", {})),
      ...Array.from({ length: 6 }, () => rpc("premium_grant_due_coins", {})),
    ]);
    for (const u of [U(42), U(43), U(44)]) eq([gifts(u), balance(u)], [4, 20000], "cycles paid once under parallel sweeps");
    // 5) 15 users race for a campaign with 5 uses.
    one("INSERT INTO premium_campaigns (code, kind, plan_id, duration_days, total_limit) VALUES ('RUSH5', 'free_membership', 'plus', 3, 5)");
    const rush = await Promise.all(Array.from({ length: 15 }, (_, i) => redeem(U(45 + i), "RUSH5")));
    eq(rush.filter((x) => x.ok).length, 5, "exactly five redemptions");
    eq(one("SELECT used_count FROM premium_campaigns WHERE code = 'RUSH5'"), "5", "counter at the limit");

    // ---- ledger and balances agree for everyone
    eq(one("SELECT count(*) FROM users u WHERE u.descoin_balance <> (SELECT coalesce(sum(amount), 0) FROM descoin_ledger l WHERE l.user_id = u.id)"), "0", "reconcilable: balance = ledger sum");
    eq(one("SELECT count(*) FROM subscription_events e WHERE kind = 'coin_grant' AND coins > 0 AND NOT EXISTS (SELECT 1 FROM descoin_ledger l WHERE l.reason = 'premium_gift' AND (l.meta->>'premium_event_id')::uuid = e.id)"), "0", "every paid cycle has its ledger row");

    // ---- the migration can be applied twice
    pg.q(url, require("fs").readFileSync(pg.PREMIUM_MIGRATION, "utf8"));
    eq(one("SELECT count(*) FROM premium_plans"), "2", "re-running the migration is a no-op");
  } finally {
    db.drop();
  }
  console.log("premium.db.test.cjs: ok");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
