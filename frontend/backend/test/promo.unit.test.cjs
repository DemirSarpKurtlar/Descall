"use strict";

/** lib/promo.js pure helpers + the promo exemption from the DesCoin earning cap. */

process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";

const { createFakeSupabase } = require("./fakeSupabase.cjs");

const supabasePath = require.resolve("../db/supabase");
const fake = createFakeSupabase({
  users: [{ id: "u-eda", username: "eda", descoin_balance: 0, descoin_frozen: false }],
  descoin_ledger: [],
});
require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: fake };

const promo = require("../lib/promo");
const descoin = require("../lib/descoin");

function assert(c, msg) {
  if (!c) throw new Error("FAIL: " + msg);
}

async function run() {
  assert(promo.normalizeCode(" k7qm-2xrd–9pla v4te\n") === "K7QM2XRD9PLAV4TE", "normalize");
  assert(promo.normalizeCode(null) === "", "normalize null");
  assert(promo.formatCode("k7qm2xrd9plav4te") === "K7QM-2XRD-9PLA-V4TE", "format");
  assert(promo.formatCode("K7QM2XRD9PLAV4TE", "–") === "K7QM–2XRD–9PLA–V4TE", "format en dash");

  for (const bad of ["O", "0", "I", "1"]) assert(!promo.CODE_ALPHABET.includes(bad), "alphabet excludes " + bad);
  assert(new Set(promo.CODE_ALPHABET).size === promo.CODE_ALPHABET.length, "alphabet unique");
  const seen = new Set();
  for (let i = 0; i < 2000; i += 1) {
    const c = promo.generateCode();
    assert(c.length === 16 && /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]+$/.test(c), "generated: " + c);
    seen.add(c);
  }
  assert(seen.size === 2000, "no collisions in 2000 codes");
  assert(promo.generateCode(() => 0) === "A".repeat(16), "injectable randomness");

  const h1 = promo.ipHash("203.0.113.9");
  assert(h1 === promo.ipHash("203.0.113.9") && h1 !== promo.ipHash("203.0.113.10") && h1.length === 32, "ip hash stable");
  assert(!h1.includes("203"), "ip not in hash");
  assert(promo.ipHash("") === null, "no ip → null");

  delete process.env.PROMO_RISK_UNKNOWN;
  assert(promo.riskUnknownMode() === "allow", "default allow");
  process.env.PROMO_RISK_UNKNOWN = "WITHHOLD";
  assert(promo.riskUnknownMode() === "withhold", "strict");
  process.env.PROMO_RISK_UNKNOWN = "bogus";
  assert(promo.riskUnknownMode() === "allow", "unknown value → allow");
  delete process.env.PROMO_RISK_UNKNOWN;

  const c = promo.cleanCreateInput({ code: "abcd-efgh-jkmn-pqrs", rewardType: "descoin", rewardAmount: "100.9", message: "x".repeat(300),
    maxUses: "", minAccountAgeDays: "-4", popupAudience: "evil", oncePerUser: false });
  assert(c.code === "ABCDEFGHJKMNPQRS" && c.rewardAmount === 100 && c.message.length === 140, "clean basic");
  assert(c.maxUses === null && c.minAccountAgeDays === 0 && c.popupAudience === "none" && c.oncePerUser === false && c.active === true, "clean defaults");
  assert(c.rewardRef === null, "descoin has no ref");
  const it = promo.cleanCreateInput({ rewardType: "shop_item", rewardRef: "abc", rewardAmount: 5 });
  assert(it.rewardAmount === null && it.rewardRef === "abc" && it.code.length === 16, "item input");
  let threw = null;
  try { promo.cleanCreateInput({ rewardType: "descoin", rewardAmount: 1, expiresAt: "not a date" }); } catch (e) { threw = e; }
  assert(threw && threw.code === "invalid_input" && threw.status === 400, "bad date");

  // Promo coins must not use up the activity earning cap (decision: code DesCoin is outside the daily cap).
  await descoin.credit("u-eda", descoin.GLOBAL_DAILY_CAP, "promo", {});
  const after = await descoin.creditCapped("u-eda", 1, "message_activity", {});
  assert(after.credited === 1, "promo credit does not consume the daily earning cap: " + JSON.stringify(after));

  console.log("promo.unit.test.cjs: ok");
}

run().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
