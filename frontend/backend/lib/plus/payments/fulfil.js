"use strict";

/**
 * Turns one verified, normalized payment event into database changes, exactly once:
 *   payment_webhook_events (provider, event_id) is the idempotency key (a failed event is retried
 *   on the provider's next delivery), every membership change goes through premium_plus_apply with a
 *   request id derived from the provider's transaction, so a replay never pays or extends twice.
 *
 * Normalized event: { provider, eventId, type, checkoutId?, userId?, productKey?, product?,
 *   amountMinor?, currency?, endsAt?, transactionRef?, subscriptionRef?, platform? }
 * type: purchase | renewal | trial_start | cancel_at_end | resume | refund | expire | payment_failed | ignore
 */

const { parseKey } = require("./products");

let dbOverride = null;
const db = () => dbOverride || require("../../../db/supabase");
let hooks = { invalidate: () => {}, emit: () => {}, afterGiftPaid: async () => {} };

function configure(h) {
  hooks = { ...hooks, ...(h || {}) };
}

function reqId(...parts) {
  const raw = parts.filter(Boolean).join(":").replace(/[^A-Za-z0-9:_.-]/g, "_");
  const s = raw.length < 8 ? `${raw}________`.slice(0, 8) : raw;
  return s.slice(0, 100);
}

function summaryOf(ev) {
  return {
    type: ev.type,
    product: ev.productKey || null,
    amount: ev.amountMinor ?? null,
    currency: ev.currency || null,
    checkout: ev.checkoutId || null,
    tx: ev.transactionRef ? String(ev.transactionRef).slice(0, 80) : null,
    sub: ev.subscriptionRef ? String(ev.subscriptionRef).slice(0, 80) : null,
    platform: ev.platform || null,
    env: ev.environment || null,
  };
}

async function claimEvent(ev) {
  const row = { provider: ev.provider, event_id: String(ev.eventId).slice(0, 200), event_type: String(ev.type).slice(0, 120), status: "received", summary: summaryOf(ev) };
  const { error } = await db().from("payment_webhook_events").insert(row);
  if (!error) return { claimed: true };
  if (error.code === "23505" || /duplicate/i.test(error.message || "")) {
    const { data } = await db().from("payment_webhook_events").select("status").eq("provider", ev.provider).eq("event_id", row.event_id).maybeSingle();
    if (data?.status === "failed") {
      await db().from("payment_webhook_events").update({ status: "received", error: null }).eq("provider", ev.provider).eq("event_id", row.event_id);
      return { claimed: true, retry: true };
    }
    return { claimed: false, duplicate: true };
  }
  throw Object.assign(new Error("event_store_failed"), { code: "event_store_failed", status: 500 });
}

async function finishEvent(ev, status, { error = null, userId = null } = {}) {
  await db().from("payment_webhook_events").update({
    status,
    error: error ? String(error).slice(0, 500) : null,
    user_id: userId,
    processed_at: new Date().toISOString(),
  }).eq("provider", ev.provider).eq("event_id", String(ev.eventId).slice(0, 200));
}

async function rpc(name, args) {
  const { data, error } = await db().rpc(name, args);
  if (error) throw Object.assign(new Error("db_error"), { code: "db_error", status: 500, cause: error });
  return data;
}

async function findCheckout(id) {
  if (!id) return null;
  const { data } = await db().from("premium_checkouts").select("*").eq("id", id).maybeSingle();
  return data || null;
}

async function subscriptionByRef(provider, subRef) {
  if (!subRef) return null;
  const { data } = await db().from("user_subscriptions").select("user_id, plan_id, period").eq("provider", provider).eq("provider_sub_ref", String(subRef)).maybeSingle();
  return data || null;
}

async function recordTransaction(row) {
  const { error } = await db().from("payment_transactions").insert({ ...row, verified_at: new Date().toISOString() });
  if (error && !(error.code === "23505" || /duplicate/i.test(error.message || ""))) {
    throw Object.assign(new Error("tx_store_failed"), { code: "tx_store_failed", status: 500 });
  }
}

const ORIGIN = { apple: "store", google: "store", revenuecat: "store", paddle: "web", iyzico: "web" };

async function applyEvent(ev, cfg) {
  const checkout = await findCheckout(ev.checkoutId);
  const sub = checkout?.user_id || ev.userId ? null : await subscriptionByRef(ev.provider, ev.subscriptionRef);
  // A bare renewal (iyzico subscription order) names no product: it renews what the person has.
  const product = ev.product || parseKey(ev.productKey)
    || (checkout ? parseKey(checkout.kind === "self" ? `${checkout.plan}_${checkout.period}` : `gift_${checkout.plan}_${checkout.months}`) : null)
    || (sub ? parseKey(`${sub.plan_id}_${sub.period || "monthly"}`) : null);
  const userId = checkout?.user_id || ev.userId || sub?.user_id || null;
  if (["ignore", "expire"].includes(ev.type)) return { status: "ignored", userId };
  if (!userId) return { status: "failed", error: "unknown_user" };
  const platform = ev.platform || checkout?.platform || null;

  if (ev.type === "payment_failed") {
    hooks.emit(userId, { kind: "payment_failed" });
    return { status: "processed", userId };
  }

  if (ev.type === "cancel_at_end" || ev.type === "resume") {
    const res = await rpc("premium_plus_apply", {
      p_user: userId, p_op: ev.type, p_plan: null, p_days: null, p_ends_at: null, p_origin: ORIGIN[ev.provider] || "web",
      p_provider: ev.provider, p_platform: platform, p_period: null, p_auto_renew: ev.type === "resume",
      p_request_id: reqId(ev.provider, ev.type, ev.eventId), p_meta: { event: ev.eventId }, p_provider_sub_ref: ev.subscriptionRef || null,
    });
    hooks.invalidate(userId);
    hooks.emit(userId, { kind: ev.type });
    return { status: res?.ok === false && res.error !== "not_active" ? "failed" : "processed", userId, error: res?.ok === false ? res.error : null };
  }

  if (ev.type === "refund") {
    const { data: tx } = await db().from("payment_transactions").select("*").eq("provider", ev.provider).eq("provider_ref", String(ev.transactionRef || "")).maybeSingle();
    const days = tx?.period === "yearly" ? 365 : tx?.product ? (parseKey(tx.product)?.days || 30) : 30;
    if (tx?.gift_id) {
      await db().from("premium_gifts").update({ status: "refunded", updated_at: new Date().toISOString() }).eq("id", tx.gift_id).in("status", ["awaiting_payment", "scheduled", "delivered", "returned"]);
    } else {
      await rpc("premium_plus_apply", {
        p_user: tx?.user_id || userId, p_op: "revoke", p_plan: null, p_days: days, p_ends_at: null, p_origin: ORIGIN[ev.provider] || "web",
        p_provider: ev.provider, p_platform: platform, p_period: null, p_auto_renew: false,
        p_request_id: reqId(ev.provider, "refund", ev.transactionRef || ev.eventId), p_meta: { event: ev.eventId }, p_provider_sub_ref: null,
      });
    }
    await recordTransaction({
      provider: ev.provider, provider_ref: reqId("refund", ev.transactionRef || ev.eventId), user_id: tx?.user_id || userId, plan_id: tx?.plan_id || null,
      kind: "refund", status: "refunded", amount_minor: ev.amountMinor ?? tx?.amount_minor ?? null, currency: ev.currency || tx?.currency || null,
      product: tx?.product || null, platform, refund_of: tx?.id || null, gift_id: tx?.gift_id || null, raw: summaryOf(ev),
    });
    await db().from("premium_refund_requests").update({ status: "approved", decided_at: new Date().toISOString() }).eq("transaction_id", tx?.id || "00000000-0000-0000-0000-000000000000").eq("status", "pending");
    hooks.invalidate(userId);
    hooks.emit(userId, { kind: "refund" });
    return { status: "processed", userId };
  }

  // purchase / renewal / trial_start
  if (!product) return { status: "failed", userId, error: "unknown_product" };
  const amount = ev.amountMinor ?? checkout?.amount_minor ?? null;
  const currency = ev.currency || checkout?.currency || null;
  const kind = checkout?.kind || (product.kind === "gift" ? "gift" : "self");

  // A gift / group share delivers what the checkout says, so the product the provider charged
  // must be that one: Paddle.js and StoreKit let the buyer pick the price id and put any checkout
  // id in custom_data / appAccountToken (the 1-month price must not pay a 12-month gift).
  if ((kind === "gift" || kind === "group_share") && ev.product && checkout && ev.product.key !== `gift_${checkout.plan}_${checkout.months}`) {
    return { status: "failed", userId, error: "product_mismatch" };
  }

  if (kind === "gift") {
    if (!checkout?.gift_id) return { status: "failed", userId, error: "gift_missing" };
    const { data: gift } = await db().from("premium_gifts").update({
      status: "scheduled", paid_at: new Date().toISOString(), provider: ev.provider, order_ref: String(ev.transactionRef || "").slice(0, 200),
      amount_minor: amount, currency, updated_at: new Date().toISOString(),
    }).eq("id", checkout.gift_id).eq("status", "awaiting_payment").select("*").maybeSingle();
    await recordTransaction({
      provider: ev.provider, provider_ref: String(ev.transactionRef || ev.eventId), user_id: userId, plan_id: product.plan, kind: "purchase",
      status: "succeeded", amount_minor: amount, currency, product: product.key, platform, period: "once", gift_id: checkout.gift_id, checkout_id: checkout.id, raw: summaryOf(ev),
    });
    await db().from("premium_checkouts").update({ status: "paid", provider_ref: String(ev.transactionRef || "").slice(0, 200), updated_at: new Date().toISOString() }).eq("id", checkout.id);
    if (gift) await hooks.afterGiftPaid(gift);
    hooks.emit(userId, { kind: "gift_paid", giftId: checkout.gift_id });
    return { status: "processed", userId };
  }

  if (kind === "group_share") {
    const res = await rpc("premium_group_share_paid", { p_group: checkout.group_id, p_user: userId, p_order_ref: String(ev.transactionRef || "").slice(0, 200), p_provider: ev.provider, p_platform: platform });
    await recordTransaction({
      provider: ev.provider, provider_ref: String(ev.transactionRef || ev.eventId), user_id: userId, plan_id: product.plan, kind: "purchase",
      status: "succeeded", amount_minor: amount, currency, product: `group:${product.key}`, platform, period: "once", checkout_id: checkout.id, raw: summaryOf(ev),
    });
    await db().from("premium_checkouts").update({ status: "paid", updated_at: new Date().toISOString() }).eq("id", checkout.id);
    if (res?.complete && res.gift_id) {
      const { data: gift } = await db().from("premium_gifts").select("*").eq("id", res.gift_id).maybeSingle();
      if (gift) await hooks.afterGiftPaid(gift);
    }
    hooks.emit(userId, { kind: "group_share_paid", groupId: checkout.group_id });
    return { status: "processed", userId };
  }

  const op = ev.type === "trial_start" ? "trial" : ev.type === "renewal" ? "renew" : "purchase";
  const days = ev.type === "trial_start" ? Number(cfg?.trial?.days || 3) : product.days;
  const res = await rpc("premium_plus_apply", {
    p_user: userId, p_op: op, p_plan: product.plan, p_days: days, p_ends_at: ev.endsAt || null,
    p_origin: op === "trial" ? "trial" : ORIGIN[ev.provider] || "web", p_provider: ev.provider, p_platform: platform,
    p_period: product.period, p_auto_renew: true, p_request_id: reqId(ev.provider, ev.transactionRef || ev.eventId),
    p_meta: { event: ev.eventId, checkout: checkout?.id || null, product: product.key }, p_provider_sub_ref: ev.subscriptionRef || null,
  });
  if (res?.ok === false) {
    // A trial that is no longer allowed (used before) still bills normally at the store; record it.
    if (!(op === "trial" && ["trial_used", "already_active"].includes(res.error))) return { status: "failed", userId, error: res.error };
  }
  if (op !== "trial") {
    await recordTransaction({
      provider: ev.provider, provider_ref: String(ev.transactionRef || ev.eventId), user_id: userId, plan_id: product.plan,
      kind: op === "renew" ? "renewal" : "purchase", status: "succeeded", amount_minor: amount, currency, product: product.key,
      platform, period: product.period, period_end: ev.endsAt || null, checkout_id: checkout?.id || null, raw: summaryOf(ev),
    });
  }
  if (checkout) await db().from("premium_checkouts").update({ status: "paid", provider_ref: String(ev.transactionRef || "").slice(0, 200), updated_at: new Date().toISOString() }).eq("id", checkout.id);
  hooks.invalidate(userId);
  hooks.emit(userId, { kind: op === "trial" ? "trial_started" : op === "renew" ? "renewed" : "purchased", plan: product.plan });
  return { status: "processed", userId };
}

/** Process one event. Returns { duplicate } | { status, userId, error }. Never applies twice. */
async function fulfil(ev, { cfg } = {}) {
  if (!ev || !ev.provider || !ev.eventId) return { status: "failed", error: "bad_event" };
  const claim = await claimEvent(ev);
  if (!claim.claimed) return { duplicate: true };
  try {
    const out = await applyEvent(ev, cfg);
    await finishEvent(ev, out.status, { error: out.error || null, userId: out.userId || null });
    return out;
  } catch (err) {
    await finishEvent(ev, "failed", { error: err?.code || "error" }).catch(() => {});
    throw err;
  }
}

function __setDbForTests(client) {
  dbOverride = client;
}

module.exports = { fulfil, applyEvent, reqId, summaryOf, configure, __setDbForTests };
