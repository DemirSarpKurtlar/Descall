"use strict";

/**
 * Race tests for promo redemption on a real Postgres: many separate connections hit the same
 * code at once. Skips when PROMO_TEST_PG_URL is not set (the Postgres CI job sets it).
 */

const pg = require("./promoPg.cjs");

if (!pg.available()) {
  console.log("promo.race.test.cjs: skipped (set PROMO_TEST_PG_URL to a throwaway Postgres)");
  process.exit(0);
}

function assert(c, msg) {
  if (!c) throw new Error("FAIL: " + msg);
}

const ADMIN = "00000000-0000-4000-8000-0000000000aa";
const uid = (i) => `00000000-0000-4000-9000-${String(i).padStart(12, "0")}`;

async function run() {
  const db = pg.freshDb("race");
  const { url } = db;
  try {
    pg.q(url, `
      INSERT INTO users (id, username, created_at) VALUES ('${ADMIN}', 'admin', now() AT TIME ZONE 'UTC' - interval '1 year');
      INSERT INTO users (id, username, created_at, descoin_balance)
        SELECT ('00000000-0000-4000-9000-' || lpad(g::text, 12, '0'))::uuid, 'u' || g, now() AT TIME ZONE 'UTC' - interval '30 days', 100
        FROM generate_series(1, 60) g;
      INSERT INTO shop_items (id, sku, name, category, price_descoin)
        VALUES ('00000000-0000-4000-8000-0000000000b1', 'frame_x', 'Çerçeve', 'frame', 300);
    `);
    const mk = (p) => pg.rpc(url, "promo_admin_create", { p_admin_id: ADMIN, p });
    const redeem = (user, code) => pg.rpc(url, "promo_redeem", { p_user_id: user, p_code: code, p_ip_hash: "race" });

    // 1) 50 different users race for a 10-use code: exactly 10 win, no over-issue.
    await mk({ code: "RACERACERACE0010", rewardType: "descoin", rewardAmount: 250, maxUses: 10 });
    const res = await Promise.all(Array.from({ length: 50 }, (_, i) => redeem(uid(i + 1), "RACERACERACE0010")));
    const wins = res.filter((r) => r.ok).length;
    const limits = res.filter((r) => r.error === "limit").length;
    assert(wins === 10, `exactly 10 winners, got ${wins}`);
    assert(limits === 40, `the rest see 'limit', got ${limits}: ${JSON.stringify(res.filter((r) => !r.ok && r.error !== "limit"))}`);
    const [used, reds, ledger, coins] = pg.q(url, `
      SELECT used_count FROM promo_codes WHERE code_norm = 'RACERACERACE0010'
      UNION ALL SELECT count(*) FROM promo_redemptions
      UNION ALL SELECT count(*) FROM descoin_ledger WHERE reason = 'promo'
      UNION ALL SELECT sum(descoin_balance) - 6000 FROM users WHERE username LIKE 'u%';`).split("\n").map(Number);
    assert(used === 10 && reds === 10 && ledger === 10 && coins === 2500, `counts line up: used=${used} reds=${reds} ledger=${ledger} coins=${coins}`);

    // 2) The same user fires 25 parallel redeems (double-click, two devices): one credit only.
    await mk({ code: "DOUBLESPENDDBL01", rewardType: "descoin", rewardAmount: 500 });
    const me = uid(55);
    const mine = await Promise.all(Array.from({ length: 25 }, () => redeem(me, "DOUBLESPENDDBL01")));
    assert(mine.filter((r) => r.ok).length === 1, "one success for the same user: " + JSON.stringify(mine.map((r) => r.error || "ok")));
    assert(mine.filter((r) => r.error === "used").length === 24, "the others see 'used'");
    const bal = Number(pg.q(url, `SELECT descoin_balance FROM users WHERE id = '${me}'`));
    assert(bal === 600, `balance credited once (100 + 500), got ${bal}`);
    const after = Number(pg.q(url, `SELECT balance_after FROM descoin_ledger WHERE user_id = '${me}' AND reason = 'promo'`));
    assert(after === 600, "ledger balance_after matches");

    // 3) Item code raced by one user who already owns it: one refund, never two.
    pg.q(url, `INSERT INTO user_inventory (user_id, item_id, acquired_via) VALUES ('${uid(56)}', '00000000-0000-4000-8000-0000000000b1', 'purchase')`);
    await mk({ code: "ITEMRACEITEMRACE", rewardType: "shop_item", rewardRef: "00000000-0000-4000-8000-0000000000b1" });
    const it = await Promise.all(Array.from({ length: 15 }, () => redeem(uid(56), "ITEMRACEITEMRACE")));
    assert(it.filter((r) => r.ok).length === 1, "one item redemption");
    assert(Number(pg.q(url, `SELECT descoin_balance FROM users WHERE id = '${uid(56)}'`)) === 400, "refunded exactly once (100 + 300)");

    // 4) Wrong-try lock holds under parallel guessing: at most 5 'invalid' answers, rest locked.
    const guesser = uid(57);
    const guesses = await Promise.all(Array.from({ length: 30 }, (_, i) => redeem(guesser, `GUESSGUESSGU${String(i).padStart(4, "0")}`)));
    const invalid = guesses.filter((r) => r.error === "invalid").length;
    assert(invalid === 5, `parallel guessing gets exactly 5 real answers, got ${invalid}`);
    assert(guesses.filter((r) => r.error === "rate_limited").length === 25, "the rest are locked");

    console.log("promo.race.test.cjs: ok");
  } finally {
    db.drop();
  }
}

run().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
