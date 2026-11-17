"use strict";

/**
 * Promo admin form, badge reward: a badge code is always once per account, and a limited
 * badge (maxHolders) can't promise more uses than it has free places (reward_badge_slots).
 * Admin-only badges and unknown ids stay "reward_badge".
 */

process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";

const { createFakeSupabase } = require("./fakeSupabase.cjs");

const supabasePath = require.resolve("../db/supabase");
const fake = createFakeSupabase({ users: [] });
const CATALOG = [
  { id: "ilk100", no: 8, name: "İlk 100", tier: "efsanevi", grantMode: "promo", maxHolders: 100, active: true, holders: 97 },
  { id: "kurucu", no: 2, name: "Kurucu", tier: "efsanevi", grantMode: "promo", maxHolders: null, active: true, holders: 2 },
  { id: "facebook", no: 36, name: "Facebook", tier: "nadir", grantMode: "admin_only", maxHolders: null, active: true, holders: 4 },
];
const created = [];
fake.rpc = async (name, args) => {
  if (name === "special_badge_catalog") return { data: CATALOG, error: null };
  if (name === "promo_admin_create") {
    created.push(args.p);
    return { data: { ok: true, id: "00000000-0000-4000-8000-0000000000aa", code: args.p.code }, error: null };
  }
  return { data: null, error: { message: "unexpected rpc " + name } };
};
require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: fake };

const promo = require("../lib/promo");
const badges = require("../lib/specialBadges");

function assert(c, msg) {
  if (!c) throw new Error("FAIL: " + msg);
}

async function codeOf(fn) {
  try {
    await fn();
    return "ok";
  } catch (err) {
    return err.code || err.message;
  }
}

async function run() {
  const base = { code: "AAAABBBBCCCCDDDD", rewardType: "special_badge" };
  assert((await badges.promoSlotsLeft("ilk100")) === 3, "İlk 100 has 3 free places");
  assert((await badges.promoSlotsLeft("kurucu")) === null, "unlimited badge has no slot cap");
  assert((await badges.promoSlotsLeft("../x")) === null, "bad id");

  assert((await codeOf(() => promo.adminCreate("admin", { ...base, rewardRef: "ilk100", maxUses: 10 }))) === "reward_badge_slots", "10 uses > 3 places");
  assert((await codeOf(() => promo.adminCreate("admin", { ...base, rewardRef: "ilk100", maxUses: null }))) === "reward_badge_slots", "unlimited uses on a limited badge");
  assert((await codeOf(() => promo.adminCreate("admin", { ...base, rewardRef: "facebook", maxUses: 5 }))) === "reward_badge", "admin-only badge");
  assert((await codeOf(() => promo.adminCreate("admin", { ...base, rewardRef: "", maxUses: 5 }))) === "reward_badge", "no badge picked");
  assert(created.length === 0, "nothing reached the database");

  assert((await codeOf(() => promo.adminCreate("admin", { ...base, rewardRef: "ilk100", maxUses: 3, oncePerUser: false }))) === "ok", "3 uses fit");
  assert(created[0].oncePerUser === true, "badge codes are forced to once per account");
  assert((await codeOf(() => promo.adminCreate("admin", { ...base, code: "AAAABBBBCCCCDDDE", rewardRef: "kurucu", maxUses: null }))) === "ok", "unlimited badge, unlimited uses");
  assert(created[1].oncePerUser === true && created[1].maxUses === null, "kurucu code stored");
  console.log("promoBadgeSlots.unit.test: ok");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
