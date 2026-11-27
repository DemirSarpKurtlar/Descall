"use strict";

/**
 * Pays the "Başla panosu" checklist. Server-authoritative: a step pays only when the server
 * sees the fact (interests saved, a server joined, the first real message, a voice minute,
 * an accepted friend), once per account (onboarding_rewards primary key), through
 * descoin.creditCapped (reason onboarding_reward), so the wallet freeze and the global
 * daily cap still apply. Suspicious sign-ups (same device as another account) and accounts
 * past their five days never earn. Admins can switch rewards off (onboarding_settings).
 */

const model = require("./model");
const store = require("./store");

function deps() {
  return { descoin: require("../descoin") };
}

function emitTo(io, userId, event, payload) {
  try {
    io?.to?.(`user:${userId}`)?.emit?.(event, payload);
  } catch {
    /* best effort */
  }
}

/** May this account earn onboarding rewards at all? */
function eligible(account, settings, now = Date.now()) {
  if (!account || !settings?.rewardsEnabled || settings.enabled === false) return false;
  if (account.suspicious_signup || account.is_banned || account.deleted_at) return false;
  return model.inWindow(account.signup_at || account.created_at, now);
}

/**
 * Pay one step. Returns { paid, amount, balance } (paid false when already claimed, not
 * eligible, or the cap left nothing).
 */
async function payStep({ userId, step, io = null, account = null, settings = null, now = Date.now(), d = deps() }) {
  const def = model.STEPS.find((s) => s.id === step);
  if (!def) return { paid: false, amount: 0 };
  const acc = account || (await store.accountFacts(userId));
  const cfg = settings || (await store.getSettings());
  if (!eligible(acc, cfg, now)) return { paid: false, amount: 0, reason: "not_eligible" };
  const won = await store.claimStep(userId, step, def.reward);
  if (!won) return { paid: false, amount: 0, reason: "claimed" };
  let result;
  try {
    result = await d.descoin.creditCapped(userId, def.reward, "onboarding_reward", { step });
  } catch (err) {
    // Nothing was paid: give the claim back so a later refresh can try again.
    await store.releaseClaim(userId, step);
    console.warn("[onboarding] reward credit failed:", err?.message || err);
    return { paid: false, amount: 0, reason: "error" };
  }
  const amount = Number(result?.credited) || 0;
  if (amount !== def.reward) await store.setClaimAmount(userId, step, amount);
  if (amount > 0) {
    emitTo(io, userId, "descoin:balance", { balance: result.balance, delta: amount, reason: "onboarding_reward" });
  }
  emitTo(io, userId, "onboarding:reward", { step, amount, balance: result?.balance ?? null, capped: result?.capped || null });
  return { paid: amount > 0, amount, balance: result?.balance ?? null };
}

module.exports = { payStep, eligible };
