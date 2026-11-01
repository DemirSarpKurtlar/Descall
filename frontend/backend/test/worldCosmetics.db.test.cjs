"use strict";

/**
 * world_cosmetics_purchase / world_look_save against a real Postgres
 * (supabase/migrations/20261106_world_cosmetics.sql on top of the promo base fixture).
 * Insufficient balance, idempotency (same request id, also in parallel), double submit with
 * two request ids in parallel, already owned items, frozen / banned wallets, bad input,
 * ledger + receipt rows, RLS and grants.
 * Skips cleanly when PROMO_TEST_PG_URL is not set (same throwaway Postgres as the promo tests).
 */

const pg = require("./promoPg.cjs");

if (!pg.available()) {
  console.log("worldCosmetics.db.test.cjs: skipped (set PROMO_TEST_PG_URL to a throwaway Postgres)");
  process.exit(0);
}

function assert(c, msg) {
  if (!c) throw new Error("FAIL: " + msg);
}
function eq(a, b, msg) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`FAIL: ${msg}\n  got:  ${JSON.stringify(a)}\n  want: ${JSON.stringify(b)}`);
}

const RICH = "00000000-0000-4000-8000-000000000101";
const POOR = "00000000-0000-4000-8000-000000000102";
const FROZEN = "00000000-0000-4000-8000-000000000103";
const BANNED = "00000000-0000-4000-8000-000000000104";
const TWIN = "00000000-0000-4000-8000-000000000105";

async function run() {
  const db = pg.freshDb("worldcos", { migrations: ["20261106_world_cosmetics.sql"] });
  const { url } = db;
  const buy = (user, requestId, items) => pg.rpc(url, "world_cosmetics_purchase", { p_user_id: user, p_request_id: requestId, p_items: items });
  const one = (sql) => pg.q(url, sql);
  const num = (sql) => Number(one(sql));
  try {
    one(`
      INSERT INTO users (id, username, descoin_balance, descoin_frozen, is_banned) VALUES
        ('${RICH}', 'rich', 1000, false, false),
        ('${POOR}', 'poor', 100, false, false),
        ('${FROZEN}', 'frozen', 1000, true, false),
        ('${BANNED}', 'banned', 1000, false, true),
        ('${TWIN}', 'twin', 400, false, false);
    `);

    // insufficient balance: nothing moves, nothing is stored (a later retry may succeed)
    let r = await buy(POOR, "req-poor-0001", [{ id: "top_varsity", price: 220 }]);
    eq(r, { ok: false, error: "insufficient", total: 220, balance: 100 }, "insufficient");
    eq(num(`SELECT descoin_balance FROM users WHERE id = '${POOR}'`), 100, "poor balance unchanged");
    eq(num(`SELECT count(*) FROM world_cosmetic_inventory WHERE user_id = '${POOR}'`), 0, "nothing owned");
    eq(num(`SELECT count(*) FROM world_cosmetic_purchases WHERE user_id = '${POOR}'`), 0, "no receipt for a failure");
    eq(num(`SELECT count(*) FROM descoin_ledger WHERE user_id = '${POOR}'`), 0, "no ledger row");

    // success: balance, ledger (shop_purchase), inventory and receipt together
    r = await buy(RICH, "req-rich-0001", [{ id: "top_varsity", price: 220 }, { id: "acc_cap", price: 90 }]);
    assert(r.ok && !r.replayed, "rich buys");
    eq([r.total, r.balance, r.charged, r.alreadyOwned], [310, 690, [{ id: "top_varsity", price: 220 }, { id: "acc_cap", price: 90 }], []], "purchase result");
    eq(num(`SELECT descoin_balance FROM users WHERE id = '${RICH}'`), 690, "balance debited");
    eq(one(`SELECT amount || ' ' || reason || ' ' || balance_after || ' ' || (meta->>'kind') FROM descoin_ledger WHERE user_id = '${RICH}'`), "-310 shop_purchase 690 world_cosmetic", "ledger row");
    eq(one(`SELECT string_agg(item_id || ':' || price_paid, ',' ORDER BY item_id) FROM world_cosmetic_inventory WHERE user_id = '${RICH}'`), "acc_cap:90,top_varsity:220", "owned items");
    eq(one(`SELECT total || ' ' || balance_after || ' ' || (ledger_id IS NOT NULL) FROM world_cosmetic_purchases WHERE user_id = '${RICH}'`), "310 690 true", "receipt row");

    // idempotency: same request id again, never a second charge
    r = await buy(RICH, "req-rich-0001", [{ id: "top_varsity", price: 220 }, { id: "acc_cap", price: 90 }]);
    eq([r.ok, r.replayed, r.total, r.balance], [true, true, 310, 690], "replay");
    eq(num(`SELECT count(*) FROM descoin_ledger WHERE user_id = '${RICH}'`), 1, "still one ledger row");

    // already owned: only the new item is charged
    r = await buy(RICH, "req-rich-0002", [{ id: "top_varsity", price: 220 }, { id: "hair_curly", price: 140 }]);
    eq([r.ok, r.total, r.balance, r.charged, r.alreadyOwned], [true, 140, 550, [{ id: "hair_curly", price: 140 }], ["top_varsity"]], "owned item not charged");
    r = await buy(RICH, "req-rich-0003", [{ id: "acc_cap", price: 90 }]);
    eq([r.ok, r.total, r.balance, r.charged], [true, 0, 550, []], "all owned: free no-op");
    eq(num(`SELECT count(*) FROM descoin_ledger WHERE user_id = '${RICH}'`), 2, "no ledger row for a no-op");

    // double submit in parallel: same id, and two different ids for the same item
    const same = await Promise.all([0, 1, 2].map(() => buy(TWIN, "req-twin-same", [{ id: "top_raincoat", price: 180 }])));
    eq(same.filter((x) => x.ok).length, 3, "all three answer ok");
    eq(same.filter((x) => !x.replayed).length, 1, "exactly one real purchase");
    const diff = await Promise.all(["req-twin-000a", "req-twin-000b"].map((id) => buy(TWIN, id, [{ id: "hair_fringe", price: 90 }])));
    eq(diff.map((x) => x.total).sort(), [0, 90], "second request finds it owned");
    eq(num(`SELECT descoin_balance FROM users WHERE id = '${TWIN}'`), 130, "400 - 180 - 90");
    eq(num(`SELECT count(*) FROM descoin_ledger WHERE user_id = '${TWIN}'`), 2, "two ledger rows");
    eq(num(`SELECT coalesce(sum(amount), 0) FROM descoin_ledger WHERE user_id = '${TWIN}'`), -270, "ledger explains the balance");

    // frozen / banned / unknown users
    eq((await buy(FROZEN, "req-frozen-01", [{ id: "top_vest", price: 120 }])).error, "wallet_frozen", "frozen wallet");
    eq((await buy(BANNED, "req-banned-01", [{ id: "top_vest", price: 120 }])).error, "invalid", "banned account");
    eq((await buy("00000000-0000-4000-8000-0000000009ff", "req-ghost-001", [{ id: "top_vest", price: 120 }])).error, "invalid", "unknown user");

    // bad input never reaches the balance
    const badInputs = [
      ["short", [{ id: "top_vest", price: 120 }]],
      ["req-bad-0001", []],
      ["req-bad-0002", [{ id: "top_vest", price: 0 }]],
      ["req-bad-0003", [{ id: "top_vest", price: -5 }]],
      ["req-bad-0004", [{ id: "top_vest", price: 12.5 }]],
      ["req-bad-0005", [{ id: "Top Vest", price: 120 }]],
      ["req-bad-0006", [{ id: "top_vest", price: 120 }, { id: "top_vest", price: 120 }]],
      ["req-bad-0007", [{ id: "top_vest", price: "120" }]],
      ["req-bad-0008", [{ id: "top_vest", price: 1e9 }]],
      ["req-bad-0009", { id: "top_vest", price: 120 }],
    ];
    for (const [rid, items] of badInputs) eq((await buy(RICH, rid, items)).error, "invalid", `bad input ${rid}`);
    eq(num(`SELECT descoin_balance FROM users WHERE id = '${RICH}'`), 550, "rich balance unchanged by bad input");

    // looks
    const saved = await pg.rpc(url, "world_look_save", { p_user_id: RICH, p_look: { v: 1, hair: "hair_curly", top: "top_varsity", face: "face_grin", acc: ["acc_cap"], skin: 2, colors: { top: 3 } } });
    eq([saved.ok, saved.look.top], [true, "top_varsity"], "look saved");
    await pg.rpc(url, "world_look_save", { p_user_id: RICH, p_look: { v: 1, hair: "hair_bob", top: "top_hoodie", face: "face_classic", acc: [], skin: 0, colors: {} } });
    eq(one(`SELECT look->>'hair' FROM world_avatar_looks WHERE user_id = '${RICH}'`), "hair_bob", "upsert");
    let threw = false;
    try {
      await pg.rpc(url, "world_look_save", { p_user_id: RICH, p_look: [1, 2] });
    } catch {
      threw = true;
    }
    assert(threw, "a look must be an object");

    // RLS on, no client grants
    eq(one(`SELECT string_agg(relname || ':' || relrowsecurity, ',' ORDER BY relname) FROM pg_class WHERE relname LIKE 'world_%' AND relkind = 'r'`),
      "world_avatar_looks:true,world_cosmetic_inventory:true,world_cosmetic_purchases:true", "RLS enabled");
    eq(one(`SELECT has_function_privilege('anon', 'public.world_cosmetics_purchase(uuid, text, jsonb)', 'EXECUTE')`), "f", "anon cannot buy");
    eq(one(`SELECT has_function_privilege('authenticated', 'public.world_look_save(uuid, jsonb)', 'EXECUTE')`), "f", "authenticated cannot save");
    eq(one(`SELECT has_function_privilege('service_role', 'public.world_cosmetics_purchase(uuid, text, jsonb)', 'EXECUTE')`), "t", "service role can buy");
    eq(one(`SELECT has_table_privilege('anon', 'public.world_cosmetic_inventory', 'SELECT')`), "f", "anon cannot read inventory");
  } finally {
    db.drop();
  }
  console.log("worldCosmetics.db.test: ok");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
