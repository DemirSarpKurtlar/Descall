"use strict";

/**
 * One checkout = one row in premium_checkouts, created before the provider is opened. The
 * provider gets the checkout id (Paddle custom_data, iyzico conversationId, Apple appAccountToken)
 * and every webhook finds the buyer and what was bought through it.
 *   kind self         Descall+ / Ultra monthly or yearly (3-day trial if the account never had one)
 *   kind gift         1 / 3 / 12 months for a friend, delivered now or at a chosen time
 *   kind group        organizer starts an "ortak hediye" (2-4 shares, 12 months) and pays share 1
 *   kind group_share  a friend pays their share from the link
 * Prices come from the offer config, never from the client.
 */

const config = require("./config");
const providers = require("./payments");
const service = require("./service");

let dbOverride = null;
const db = () => dbOverride || require("../../db/supabase");

const { PlusError } = service;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fail(code, status = 400, extra = null) {
  throw new PlusError(code, status, extra);
}

function cleanNote(v) {
  if (typeof v !== "string") return null;
  const s = v.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").trim();
  return s ? s.slice(0, 200) : null;
}

/** Validate a checkout request into a plan (no writes). */
async function plan(userId, body, { platform, cfg, me }) {
  const b = body && typeof body === "object" ? body : {};
  const kind = String(b.kind || "self");
  if (!["self", "gift", "group", "group_share"].includes(kind)) fail("invalid_kind");
  if (!config.salesOn(cfg, platform, userId)) fail("sales_off", 403);
  const providerId = providers.providerFor(cfg, platform);
  if (!providers.isConfigured(providerId)) fail("provider_not_configured", 503, { provider: providerId });

  if (kind === "self") {
    const p = String(b.plan || "plus");
    const period = String(b.period || "monthly");
    if (!config.PLAN_IDS.includes(p) || !config.PERIODS.includes(period)) fail("invalid_plan");
    if (me.active && !(me.plan === "plus" && p === "ultra") && !me.trial_ends_at) fail("already_active", 409);
    const key = config.priceKeyFor({ kind, plan: p, period });
    const amount = config.priceFor(cfg, key, platform);
    if (amount == null) fail("price_missing", 503);
    const trial = Boolean(cfg.features.trial) && !me.trial_used && !me.active && !me.ever_paid;
    return { kind, plan: p, period, months: period === "yearly" ? 12 : 1, key, amount, trial, providerId };
  }

  if (kind === "gift" || kind === "group") {
    if (!cfg.features.gifts) fail("gifts_off", 403);
    if (kind === "group" && !cfg.features.groupGifts) fail("group_gifts_off", 403);
    const to = String(b.recipientId || "");
    if (!UUID.test(to) || to === userId) fail("recipient_not_found", 404);
    if (!(await service.isFriend(userId, to)) || (await service.blocked(userId, to))) fail("recipient_not_friend", 403);
    const p = String(b.plan || "plus");
    if (!config.PLAN_IDS.includes(p)) fail("invalid_plan");
    const months = kind === "group" ? 12 : Number(b.months);
    if (!config.GIFT_MONTHS.includes(months)) fail("invalid_months");
    const key = config.priceKeyFor({ kind: "gift", plan: p, months });
    const full = config.priceFor(cfg, key, platform);
    if (full == null) fail("price_missing", 503);
    const deliverAt = service.parseDeliverAt(b.deliverAt, cfg);
    if (kind === "group") {
      const shares = Number(b.shares);
      if (!Number.isInteger(shares) || shares < 2 || shares > 4) fail("invalid_shares");
      return { kind, plan: p, months, key, full, shares, amount: Math.ceil(full / shares), recipientId: to, note: cleanNote(b.note), deliverAt, providerId };
    }
    return { kind, plan: p, months, key, amount: full, recipientId: to, note: cleanNote(b.note), deliverAt, askId: UUID.test(String(b.askId || "")) ? b.askId : null, providerId };
  }

  // group_share
  const groupId = String(b.groupId || "");
  if (!UUID.test(groupId)) fail("not_found", 404);
  const { data: g } = await db().from("premium_group_gifts").select("*").eq("id", groupId).maybeSingle();
  if (!g || g.status !== "collecting" || new Date(g.expires_at).getTime() <= Date.now()) fail("group_closed", 409);
  if (g.recipient_id === userId) fail("not_found", 404);
  const { data: paid } = await db().from("premium_group_gift_shares").select("user_id, status").eq("group_id", groupId);
  if ((paid || []).some((s) => s.user_id === userId && s.status === "paid")) fail("share_paid", 409);
  if ((paid || []).filter((s) => s.status === "paid").length >= g.shares) fail("group_closed", 409);
  return { kind, plan: g.plan, months: g.months, key: `gift_${g.plan}_${g.months}`, amount: g.share_minor, groupId, providerId };
}

async function providerPayload({ checkout, p, cfg, platform, buyer, ip, origin }) {
  const id = p.providerId;
  const productId = cfg.products?.[id]?.[p.key] || null;
  if (id === "apple" || id === "revenuecat") {
    if (!productId) fail("product_missing", 503, { key: p.key });
    return { provider: id, productId, appAccountToken: checkout.id, appUserId: checkout.user_id };
  }
  if (id === "paddle") {
    if (!productId) fail("product_missing", 503, { key: p.key });
    const tx = await providers.paddle.createTransaction({ checkout, priceId: productId });
    if (!tx.url) fail("provider_error", 502);
    return { provider: "paddle", token: tx.id, paymentPageUrl: tx.url, openExternal: true };
  }
  if (id === "iyzico") {
    const callbackUrl = `${origin}/api/plus/webhooks/iyzico/callback?checkout=${checkout.id}`;
    let res;
    if (p.kind === "self") {
      if (!productId) fail("product_missing", 503, { key: p.key });
      res = await providers.iyzico.initSubscription({ checkout, planRef: productId, buyer, callbackUrl });
    } else {
      res = await providers.iyzico.initPayment({ checkout, title: `Descall+ ${p.months}`, buyer, callbackUrl, ip });
    }
    // The hosted payment page (no third-party script runs inside the app): framed in the Descall+
    // window on the web, the system browser on desktop. The callback + webhook fulfil it.
    return {
      provider: "iyzico",
      token: res.token || null,
      paymentPageUrl: res.paymentPageUrl ? `${res.paymentPageUrl}${res.paymentPageUrl.includes("?") ? "&" : "?"}iframe=true` : null,
      openExternal: platform === "desktop",
    };
  }
  fail("provider_not_configured", 503, { provider: id });
  return null;
}

/** Create a checkout and the provider's instructions. */
async function create(userId, body, { platform = "web", ip = null, origin = "", user = {} } = {}) {
  const cfg = await config.load();
  const plat = config.normalizePlatform(platform);
  const me = await service.plusMe(userId);
  const p = await plan(userId, body, { platform: plat, cfg, me });
  let giftId = null;
  let groupId = p.groupId || null;
  if (p.kind === "gift") {
    const { data: g, error } = await db().from("premium_gifts").insert({
      sender_id: userId, recipient_id: p.recipientId, plan: p.plan, months: p.months, note: p.note, deliver_at: p.deliverAt,
      status: "awaiting_payment", platform: plat, provider: p.providerId, amount_minor: p.amount, currency: cfg.currency, ask_id: p.askId || null,
    }).select("id").single();
    if (error || !g) fail("server_error", 500);
    giftId = g.id;
  }
  if (p.kind === "group") {
    const { data: g, error } = await db().from("premium_group_gifts").insert({
      organizer_id: userId, recipient_id: p.recipientId, plan: p.plan, months: p.months, shares: p.shares, share_minor: p.amount,
      currency: cfg.currency, note: p.note, deliver_at: p.deliverAt, expires_at: new Date(Date.now() + cfg.gifts.groupExpiryDays * 86400000).toISOString(),
    }).select("id").single();
    if (error || !g) fail("server_error", 500);
    groupId = g.id;
    await db().from("premium_group_gift_shares").insert({ group_id: groupId, user_id: userId, status: "pending" });
  }
  if (p.kind === "group_share") {
    await db().from("premium_group_gift_shares").upsert({ group_id: groupId, user_id: userId, status: "pending" }, { onConflict: "group_id,user_id", ignoreDuplicates: true });
  }
  const row = {
    user_id: userId,
    kind: p.kind === "group" ? "group_share" : p.kind,
    plan: p.plan,
    period: p.period || null,
    months: p.kind === "self" ? null : p.months,
    trial: Boolean(p.trial),
    platform: plat,
    provider: p.providerId,
    amount_minor: p.amount,
    currency: cfg.currency,
    gift_id: giftId,
    group_id: groupId,
    source: typeof body?.source === "string" && /^[a-z][a-z0-9_]{1,40}$/.test(body.source) ? body.source : null,
  };
  const { data: checkout, error } = await db().from("premium_checkouts").insert(row).select("*").single();
  if (error || !checkout) fail("server_error", 500);
  let instructions;
  try {
    instructions = await providerPayload({ checkout, p, cfg, platform: plat, buyer: { email: (typeof body?.email === "string" && /^[^\s@]{1,64}@[^\s@]{1,190}$/.test(body.email) ? body.email : null) || user.email || null, fullName: typeof body?.fullName === "string" ? body.fullName.slice(0, 80) : user.display_name || user.username, locale: body?.locale }, ip, origin });
  } catch (err) {
    await db().from("premium_checkouts").update({ status: "failed", updated_at: new Date().toISOString() }).eq("id", checkout.id);
    throw err;
  }
  await db().from("premium_checkouts").update({ status: "pending", provider_ref: instructions?.token || null, updated_at: new Date().toISOString() }).eq("id", checkout.id);
  require("./paywall").track(userId, { moment: body?.moment && require("./paywall").isMoment(body.moment) ? body.moment : "server_paywall", action: "checkout", platform: plat, meta: { kind: p.kind, plan: p.plan } });
  return {
    checkout: {
      id: checkout.id,
      kind: p.kind,
      plan: p.plan,
      period: p.period || null,
      months: p.months || null,
      trial: Boolean(p.trial),
      trialDays: p.trial ? cfg.trial.days : 0,
      amountMinor: p.amount,
      vatMinor: config.vatOf(p.amount, cfg.vatPercent),
      vatPercent: cfg.vatPercent,
      currency: cfg.currency,
      giftId,
      groupId,
      shares: p.shares || null,
    },
    provider: instructions,
  };
}

async function get(userId, checkoutId) {
  if (!UUID.test(String(checkoutId || ""))) fail("not_found", 404);
  const { data: c } = await db().from("premium_checkouts").select("*").eq("id", checkoutId).eq("user_id", userId).maybeSingle();
  if (!c) fail("not_found", 404);
  let gift = null;
  if (c.gift_id) {
    const cfg = await config.load();
    const { data: g } = await db().from("premium_gifts").select("*").eq("id", c.gift_id).maybeSingle();
    if (g) {
      const people = await service.usersById([g.sender_id, g.recipient_id]);
      gift = service.giftView(g, { viewer: userId, people, cfg });
    }
  }
  return { checkout: { id: c.id, status: c.status, kind: c.kind, plan: c.plan, period: c.period, months: c.months, trial: c.trial, amountMinor: c.amount_minor, currency: c.currency, groupId: c.group_id }, gift };
}

function __setDbForTests(client) {
  dbOverride = client;
}

module.exports = { create, get, plan, __setDbForTests };
