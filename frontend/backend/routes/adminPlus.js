"use strict";

/**
 * Yönetim > Descall+ > Çalışma alanı (draft 5B section 4). Mounted in routes/admin.js as
 * /premium/plus, before /premium, so the whole admin chain (auth, admin, 2FA, step-up for writes,
 * section "premium") already applies. Every write goes to the admin audit log as premium_plus_*.
 *
 *   GET  /overview                    KPIs (MRR, subscribers, trial, boosted servers, affected members,
 *                                     gift -> subscriber, refunds), providers, config, paywall rules
 *   GET  /people?filter=&q=           list (all | trial | payment_issue | cancelling | refund | gift_waiting)
 *   GET  /people/:id                  detail workspace (membership, boosts, gifts, timeline, value)
 *   POST /people/:id/extend           { days, reason }        "Süre ekle"
 *   POST /people/:id/boosts/:boostId  { action: remove|restore, reason }   "Takviye düzelt"
 *   POST /people/:id/refund           { transactionId, reason, revoke }    "İade et..."
 *   GET  /servers   GET /gifts   GET /refunds   POST /refunds/:id { decision, note }
 *   GET  /config    PATCH /config { patch, note }   POST /config/undo/:historyId   GET /log
 */

const express = require("express");
const state = require("../runtime/sharedState");
const config = require("../lib/plus/config");
const limits = require("../lib/plus/limits");
const paywall = require("../lib/plus/paywall");
const providers = require("../lib/plus/payments");
const service = require("../lib/plus/service");
const premium = require("../lib/premium/service");

const router = express.Router();
const db = () => require("../db/supabase");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function audit(actor, action, target, meta) {
  try {
    state.appendAudit(actor.id, actor.username, action, target, meta);
  } catch {
    /* best effort */
  }
}

function handle(label, fn) {
  return async (req, res) => {
    res.set("Cache-Control", "no-store");
    try {
      res.json(await fn(req));
    } catch (err) {
      const status = err?.status || 500;
      if (status >= 500) console.error(`[admin/plus] ${label}:`, err?.code || err?.message || "error");
      res.status(status).json({ error: err?.code || "server_error", code: err?.code || "server_error", ...(err?.path ? { path: err.path } : {}) });
    }
  };
}

function bad(code, status = 400) {
  const e = new Error(code);
  e.code = code;
  e.status = status;
  return e;
}

router.get("/overview", handle("overview", async () => {
  const cfg = await config.load({ fresh: true });
  let metrics = null;
  try {
    const { data, error } = await db().rpc("premium_plus_metrics", { p_levels: cfg.levels.map((l) => l.boosts) });
    if (!error) metrics = data;
  } catch {
    metrics = null;
  }
  const { data: newSubs } = await db().from("subscription_events").select("user_id").eq("actor_kind", "payment").eq("kind", "grant").gte("created_at", new Date(Date.now() - 30 * 86400000).toISOString()).limit(5000);
  return {
    metrics,
    targets: { giftConversion: 20, boostedServers: 40 },
    config: cfg,
    configMeta: await config.meta(),
    providers: providers.statusAll(),
    moments: paywall.rules(cfg),
    salesAny: config.anySalesOn(cfg),
    newSubscribers30d: new Set((newSubs || []).map((r) => r.user_id)).size,
  };
}));

const FILTERS = ["all", "trial", "payment_issue", "cancelling", "refund", "gift_waiting"];

router.get("/people", handle("people", async (req) => {
  const filter = FILTERS.includes(req.query.filter) ? req.query.filter : "all";
  const q = String(req.query.q || "").trim().slice(0, 80);
  const now = new Date().toISOString();
  const { data: subs } = await db().from("user_subscriptions")
    .select("user_id, plan_id, status, ends_at, unlimited, is_free, source, origin, provider, platform, period, auto_renew, cancel_at_period_end, trial_ends_at, started_at, updated_at")
    .order("updated_at", { ascending: false }).limit(400);
  const list = subs || [];
  const { data: failed } = await db().from("payment_webhook_events").select("user_id").eq("event_type", "payment_failed").gte("received_at", new Date(Date.now() - 14 * 86400000).toISOString()).limit(500);
  const failedSet = new Set((failed || []).map((r) => String(r.user_id)));
  const { data: refunds } = await db().from("premium_refund_requests").select("user_id").eq("status", "pending").limit(500);
  const refundSet = new Set((refunds || []).map((r) => String(r.user_id)));
  const { data: waiting } = await db().from("premium_gifts").select("recipient_id, deliver_at").eq("status", "scheduled").limit(500);
  const active = (s) => s.status === "active" && (s.unlimited || s.ends_at > now);
  const rows = list.map((s) => ({
    userId: s.user_id,
    plan: s.plan_id,
    active: active(s),
    endsAt: s.ends_at,
    unlimited: s.unlimited,
    origin: s.origin || s.source,
    provider: s.provider,
    platform: s.platform,
    period: s.period,
    trial: Boolean(s.trial_ends_at && s.trial_ends_at > now && active(s)),
    trialEndsAt: s.trial_ends_at,
    cancelling: Boolean(s.cancel_at_period_end && active(s)),
    paymentIssue: failedSet.has(String(s.user_id)),
    refund: refundSet.has(String(s.user_id)),
    isFree: s.is_free,
  }));
  for (const w of waiting || []) {
    if (!rows.find((r) => r.userId === w.recipient_id)) rows.push({ userId: w.recipient_id, plan: null, active: false, giftWaiting: w.deliver_at });
    else rows.find((r) => r.userId === w.recipient_id).giftWaiting = w.deliver_at;
  }
  const counts = {
    all: rows.length,
    trial: rows.filter((r) => r.trial).length,
    payment_issue: rows.filter((r) => r.paymentIssue).length,
    cancelling: rows.filter((r) => r.cancelling).length,
    refund: rows.filter((r) => r.refund).length,
    gift_waiting: rows.filter((r) => r.giftWaiting).length,
  };
  let picked = rows.filter((r) => filter === "all" || (filter === "trial" && r.trial) || (filter === "payment_issue" && r.paymentIssue)
    || (filter === "cancelling" && r.cancelling) || (filter === "refund" && r.refund) || (filter === "gift_waiting" && r.giftWaiting));
  const people = await service.usersById(picked.map((r) => r.userId));
  picked = picked.map((r) => ({ ...r, user: service.publicUser(people.get(String(r.userId))) })).filter((r) => r.user);
  if (q) {
    const needle = q.toLowerCase().replace(/^@/, "");
    picked = picked.filter((r) => [r.user.username, r.user.displayName, r.userId].some((v) => String(v || "").toLowerCase().includes(needle)));
  }
  return { people: picked.slice(0, 200), counts };
}));

router.get("/people/:id", handle("person", async (req) => {
  const id = String(req.params.id);
  if (!UUID.test(id)) throw bad("not_found", 404);
  const cfg = await config.load();
  const [me, people] = await Promise.all([service.plusMe(id), service.usersById([id])]);
  const user = service.publicUser(people.get(id));
  if (!user) throw bad("not_found", 404);
  const { data: boosts } = await db().from("server_boosts").select("*").eq("user_id", id).order("created_at", { ascending: false }).limit(50);
  const serverIds = [...new Set((boosts || []).map((b) => b.server_id))];
  const [counts, names] = await Promise.all([
    service.boostCounts(serverIds),
    serverIds.length ? db().from("servers").select("id, name").in("id", serverIds).then((r) => r.data || []) : [],
  ]);
  let affected = 0;
  for (const sid of serverIds) {
    if (limits.levelFor(counts[sid] || 0, cfg.levels) > 0) {
      const { data: m } = await db().from("server_members").select("user_id").eq("server_id", sid).limit(5000);
      affected += (m || []).length;
    }
  }
  const { data: gifts } = await db().from("premium_gifts").select("*").or(`sender_id.eq.${id},recipient_id.eq.${id}`).order("created_at", { ascending: false }).limit(30);
  const giftPeople = await service.usersById((gifts || []).flatMap((g) => [g.sender_id, g.recipient_id]));
  const [{ data: events }, { data: txs }, { data: moments }] = await Promise.all([
    db().from("subscription_events").select("id, kind, new_plan, actor_kind, reason, meta, created_at").eq("user_id", id).order("created_at", { ascending: false }).limit(60),
    db().from("payment_transactions").select("id, provider, provider_ref, kind, status, amount_minor, currency, product, platform, period, gift_id, created_at").eq("user_id", id).order("created_at", { ascending: false }).limit(60),
    db().from("premium_paywall_events").select("moment, action, platform, created_at").eq("user_id", id).in("action", ["trial_started", "checkout", "converted"]).order("created_at", { ascending: false }).limit(20),
  ]);
  const lifetime = (txs || []).reduce((sum, t) => sum + (t.status === "succeeded" ? Number(t.amount_minor) || 0 : t.kind === "refund" ? -(Number(t.amount_minor) || 0) : 0), 0);
  const timeline = [
    ...(events || []).filter((e) => e.kind !== "coin_grant").map((e) => ({ type: "membership", kind: e.kind, actor: e.actor_kind, plan: e.new_plan, meta: e.meta || {}, at: e.created_at })),
    ...(txs || []).map((t) => ({ type: "payment", kind: t.kind, status: t.status, amountMinor: t.amount_minor, currency: t.currency, provider: t.provider, ref: t.provider_ref, product: t.product, at: t.created_at })),
    ...(boosts || []).map((b) => ({ type: "boost", kind: b.status === "removed" ? "boost_removed" : "boosted", serverName: names.find((s) => s.id === b.server_id)?.name || null, at: b.status === "removed" ? b.removed_at : b.created_at })),
    ...(gifts || []).map((g) => ({ type: "gift", kind: g.sender_id === id ? "gift_sent" : "gift_received", status: g.status, months: g.months, amountMinor: g.amount_minor, deliverAt: g.deliver_at, other: service.publicUser(giftPeople.get(String(g.sender_id === id ? g.recipient_id : g.sender_id))), at: g.paid_at || g.created_at })),
    ...(moments || []).map((m) => ({ type: "moment", kind: m.action, moment: m.moment, platform: m.platform, at: m.created_at })),
  ].filter((x) => x.at).sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 80);
  return {
    user,
    me,
    lifetimeMinor: lifetime,
    currency: cfg.currency,
    boosts: (boosts || []).map((b) => ({
      id: b.id, serverId: b.server_id, serverName: names.find((s) => s.id === b.server_id)?.name || null, status: b.status,
      count: counts[b.server_id] || 0, level: limits.levelFor(counts[b.server_id] || 0, cfg.levels), createdAt: b.created_at, removedReason: b.removed_reason || null,
    })),
    affectedMembers: affected,
    gifts: (gifts || []).map((g) => service.giftView(g, { viewer: id, people: giftPeople, cfg })),
    transactions: txs || [],
    timeline,
  };
}));

router.post("/people/:id/extend", handle("extend", async (req) => {
  const id = String(req.params.id);
  const days = Number(req.body?.days);
  const reason = String(req.body?.reason || "").trim();
  if (!Number.isInteger(days) || days < 1 || days > 365) throw bad("invalid_duration");
  if (!reason) throw bad("reason_required");
  const me = await service.plusMe(id);
  const body = me.active
    ? { op: "extend", days, reason, note: "plus_workspace", is_free: true, request_id: `plusx:${id.slice(0, 8)}:${Date.now()}` }
    : { op: "grant", plan: me.last_plan || "plus", days, reason, note: "plus_workspace", is_free: true, request_id: `plusx:${id.slice(0, 8)}:${Date.now()}` };
  const out = await premium.apply(req.user.id, id, body);
  audit(req.user, "premium_plus_extend", id, { days, reason: reason.slice(0, 120) });
  require("../lib/plus/notify").premiumChanged(id, { kind: "extended" });
  return { subscription: out.subscription };
}));

router.post("/people/:id/boosts/:boostId", handle("boost-fix", async (req) => {
  const id = String(req.params.id);
  const boostId = String(req.params.boostId);
  const action = String(req.body?.action || "");
  const reason = String(req.body?.reason || "").trim();
  if (!UUID.test(id) || !UUID.test(boostId)) throw bad("not_found", 404);
  if (!["remove", "restore"].includes(action)) throw bad("invalid_op");
  if (!reason) throw bad("reason_required");
  const patch = action === "remove"
    ? { status: "removed", removed_at: new Date().toISOString(), removed_reason: "admin", updated_at: new Date().toISOString() }
    : { status: "active", removed_at: null, removed_reason: null, grace_until: null, updated_at: new Date().toISOString() };
  const { data, error } = await db().from("server_boosts").update(patch).eq("id", boostId).eq("user_id", id).select("*").maybeSingle();
  if (error || !data) throw bad("not_found", 404);
  audit(req.user, "premium_plus_boost_fix", boostId, { user: id, server: data.server_id, action, reason: reason.slice(0, 120) });
  require("../lib/plus/notify").toServer(data.server_id, { kind: "boost_count", serverId: data.server_id });
  return { boost: { id: data.id, status: data.status } };
}));

router.post("/people/:id/refund", handle("refund", async (req) => {
  const id = String(req.params.id);
  const txId = String(req.body?.transactionId || "");
  const reason = String(req.body?.reason || "").trim();
  if (!reason) throw bad("reason_required");
  if (!UUID.test(txId)) throw bad("not_found", 404);
  const { data: tx } = await db().from("payment_transactions").select("*").eq("id", txId).eq("user_id", id).maybeSingle();
  if (!tx || tx.status !== "succeeded") throw bad("not_refundable", 409);
  let providerResult = "manual";
  if (tx.provider === "paddle" && providers.isConfigured("paddle")) {
    await providers.paddle.refund(tx.provider_ref, reason);
    providerResult = "requested";
  } else if (tx.provider === "iyzico" && providers.isConfigured("iyzico")) {
    await providers.iyzico.refund(tx.provider_ref, tx.amount_minor);
    providerResult = "requested";
  } else if (tx.provider === "apple" || tx.provider === "google" || tx.provider === "revenuecat") {
    providerResult = "store_only"; // refunds of store purchases are decided by Apple / Google
  }
  await db().from("premium_refund_requests").insert({
    user_id: id, transaction_id: tx.id, amount_minor: tx.amount_minor, currency: tx.currency, reason: reason.slice(0, 500),
    status: providerResult === "requested" ? "approved" : "pending", decided_by: req.user.id, decided_at: new Date().toISOString(),
  });
  if (req.body?.revoke === true && providerResult !== "store_only") {
    const days = tx.period === "yearly" ? 365 : 30;
    await db().rpc("premium_plus_apply", {
      p_user: id, p_op: "revoke", p_plan: null, p_days: days, p_ends_at: null, p_origin: "web", p_provider: tx.provider, p_platform: tx.platform,
      p_period: null, p_auto_renew: false, p_request_id: `admrefund:${tx.id}`, p_meta: { admin: req.user.id }, p_provider_sub_ref: null,
    });
    require("../lib/plus/notify").premiumChanged(id, { kind: "refund" });
  }
  audit(req.user, "premium_plus_refund", id, { tx: tx.id, amount: tx.amount_minor, provider: tx.provider, result: providerResult, reason: reason.slice(0, 120) });
  return { result: providerResult };
}));

router.get("/servers", handle("servers", async () => {
  const cfg = await config.load();
  const { data: boosts } = await db().from("server_boosts").select("server_id, user_id").neq("status", "removed").limit(10000);
  const per = new Map();
  for (const b of boosts || []) {
    const r = per.get(b.server_id) || { count: 0, people: new Set() };
    r.count += 1;
    r.people.add(b.user_id);
    per.set(b.server_id, r);
  }
  const ids = [...per.keys()];
  const { data: servers } = ids.length ? await db().from("servers").select("id, name, icon_url, owner_id").in("id", ids) : { data: [] };
  const { data: settings } = ids.length ? await db().from("server_plus_settings").select("server_id, goal_level, goal_due").in("server_id", ids) : { data: [] };
  return {
    servers: (servers || []).map((s) => {
      const r = per.get(s.id);
      const st = (settings || []).find((x) => x.server_id === s.id);
      return { id: s.id, name: s.name, iconUrl: s.icon_url, count: r.count, boosters: r.people.size, level: limits.levelFor(r.count, cfg.levels), goalLevel: st?.goal_level || null, goalDue: st?.goal_due || null };
    }).sort((a, b) => b.count - a.count),
  };
}));

router.get("/gifts", handle("gifts", async () => {
  const cfg = await config.load();
  const { data: gifts } = await db().from("premium_gifts").select("*").neq("status", "awaiting_payment").order("created_at", { ascending: false }).limit(200);
  const people = await service.usersById((gifts || []).flatMap((g) => [g.sender_id, g.recipient_id]));
  const { data: groups } = await db().from("premium_group_gifts").select("id, status, shares, organizer_id, recipient_id, created_at").order("created_at", { ascending: false }).limit(50);
  return {
    gifts: (gifts || []).map((g) => ({ ...service.giftView(g, { viewer: g.sender_id, people, cfg }), amountMinor: g.amount_minor, currency: g.currency, provider: g.provider })),
    groups: groups || [],
  };
}));

router.get("/refunds", handle("refunds", async () => {
  const { data } = await db().from("premium_refund_requests").select("*").order("created_at", { ascending: false }).limit(200);
  const people = await service.usersById((data || []).map((r) => r.user_id));
  return { refunds: (data || []).map((r) => ({ ...r, user: service.publicUser(people.get(String(r.user_id))) })) };
}));

router.post("/refunds/:id", handle("refund-decide", async (req) => {
  const id = String(req.params.id);
  const decision = String(req.body?.decision || "");
  if (!UUID.test(id)) throw bad("not_found", 404);
  if (!["approve", "reject"].includes(decision)) throw bad("invalid_op");
  const { data } = await db().from("premium_refund_requests").update({
    status: decision === "approve" ? "approved" : "rejected", decided_by: req.user.id, decided_at: new Date().toISOString(),
    decision_note: String(req.body?.note || "").slice(0, 500) || null,
  }).eq("id", id).eq("status", "pending").select("*").maybeSingle();
  if (!data) throw bad("not_found", 404);
  audit(req.user, "premium_plus_refund_decision", id, { decision, user: data.user_id });
  return { refund: data };
}));

router.get("/config", handle("config", async () => ({ config: await config.load({ fresh: true }), meta: await config.meta(), defaults: config.DEFAULTS, history: await config.history(30) })));

router.patch("/config", handle("config-save", async (req) => {
  const patch = req.body?.patch;
  const out = await config.save(patch, { actorId: req.user.id, note: req.body?.note || null });
  if (out.changed.length) {
    audit(req.user, "premium_plus_config", "offer", { changed: out.changed.slice(0, 20), version: out.version, historyId: out.historyId });
    require("../lib/plus/notify").toAdmins({ kind: "config", version: out.version });
  }
  return { config: out.cfg, changed: out.changed, version: out.version, historyId: out.historyId };
}));

router.post("/config/undo/:historyId", handle("config-undo", async (req) => {
  const out = await config.undo(req.params.historyId, { actorId: req.user.id });
  audit(req.user, "premium_plus_config_undo", String(req.params.historyId), { changed: out.changed.slice(0, 20), version: out.version });
  return { config: out.cfg, changed: out.changed, version: out.version };
}));

router.get("/log", handle("log", async (req) => {
  const [historyRows, auditOut, hooks] = await Promise.all([
    config.history(40),
    premium.listAudit({ ...(req.query || {}), q: "premium_plus" }, state.auditLog || []).catch(() => ({ entries: [] })),
    db().from("payment_webhook_events").select("provider, event_type, status, error, received_at").order("received_at", { ascending: false }).limit(40).then((r) => r.data || []),
  ]);
  return { config: historyRows, audit: auditOut?.entries || auditOut?.items || [], webhooks: hooks };
}));

module.exports = router;
