"use strict";

/**
 * Faz 3 (3.7.5): Elde tutma + DesCoin ekonomisi. Mounted inside routes/admin.js
 * (requireAdmin + 2FA + step-up + sections "retention" / "economy").
 *   GET /growth/retention?days=7|30|90
 *   GET /growth/economy?days=7|30|90
 * SQL helpers: supabase/migrations/20261102_insights_functions.sql.
 * Math: lib/growthInsights.js.
 */

const express = require("express");
const { apiError } = require("../lib/apiError");
const supabase = require("../db/supabase");
const g = require("../lib/growthInsights");
const { selectPaged } = require("../lib/selectPaged");

const router = express.Router();
const TZ = "Europe/Istanbul";
const RANGES = [7, 30, 90];

function today() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
function rangeOf(req) {
  const n = Number(req.query.days);
  return RANGES.includes(n) ? n : 30;
}
function localDay(ts) {
  if (!ts) return null;
  const iso = /[zZ]|[+-]\d\d:?\d\d$/.test(String(ts)) ? String(ts) : `${ts}Z`;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

async function allUsers() {
  const out = [];
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error } = await supabase
      .from("users")
      .select("id, username, created_at, signup_at, is_admin, descoin_balance, descoin_frozen")
      .order("id", { ascending: true })
      .range(from, from + 999);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}
const isAdminRow = (u) => Boolean(u.is_admin) || u.username === "admin";

// Each page re-runs the function: a stable order keeps pages from repeating or
// skipping rows (polish admin-b-13).
const RPC_ORDER = { admin_activity_days: ["user_id", "day"], admin_descoin_flow: ["day", "reason"] };
async function rpcAll(fn, args) {
  const out = [];
  for (let from = 0; from < 200000; from += 1000) {
    let q = supabase.rpc(fn, args);
    for (const col of RPC_ORDER[fn] || []) q = q.order(col, { ascending: true });
    const { data, error } = await q.range(from, from + 999);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

function unavailable(res, err) {
  const missing = err?.code === "PGRST202" || err?.code === "42883";
  if (missing) return res.status(503).json(apiError("Insights are not enabled yet.", null, { code: "INSIGHTS_UNAVAILABLE" }));
  console.error("[admin-growth]", err?.message || err);
  return res.status(500).json(apiError("Could not load insights."));
}

router.get("/growth/retention", async (req, res) => {
  try {
    const days = rangeOf(req);
    const t = today();
    // Cohorts look back 10 weeks and the 2nd-month return needs 60 days.
    const since = g.dayStr(g.dayNum(t) - Math.max(days, 70, 60) - 7);
    const [activity, users, funnelRows] = await Promise.all([
      rpcAll("admin_activity_days", { p_since: since, p_tz: TZ }),
      allUsers(),
      // .limit(20000) does not lift the 1000-row cap: read in pages (polish admin-b-04).
      selectPaged(() =>
        supabase
          .from("analytics_events")
          .select("event, user_id", { count: "exact" })
          .in("event", ["signup_started", "signup_completed", "first_session", "first_message"])
          .gte("occurred_at", new Date(Date.now() - days * 86400000).toISOString())
          .order("id", { ascending: true })
      ).then((r) => (r.error ? [] : r.data || [])),
    ]);
    const report = g.retentionReport({
      activity,
      users: users.map((u) => ({ id: u.id, signupDay: localDay(u.signup_at || u.created_at), isAdmin: isAdminRow(u) })),
      today: t,
      days,
    });
    const admins = new Set(users.filter(isAdminRow).map((u) => String(u.id)));
    const funnel = {};
    for (const step of ["signup_started", "signup_completed", "first_session", "first_message"]) {
      const rows = funnelRows.filter((r) => r.event === step && !admins.has(String(r.user_id)));
      // signup_started fires before an account exists: count events, else distinct accounts.
      funnel[step] = step === "signup_started" ? rows.length : new Set(rows.map((r) => r.user_id).filter(Boolean)).size;
    }
    // Re-engagement sends per day and kind (lib/reengage.js); null before the migration.
    const reengagement = await require("../lib/reengage")
      .reengage()
      .adminCounts({ days })
      .then((r) => (r.available ? r : { ...r, rows: null }))
      .catch(() => null);
    res.set("Cache-Control", "no-store");
    res.json({ ...report, funnel, reengagement, days, today: t, generatedAt: new Date().toISOString() });
  } catch (err) {
    unavailable(res, err);
  }
});

router.get("/growth/economy", async (req, res) => {
  try {
    const days = rangeOf(req);
    const t = today();
    const since = g.dayStr(g.dayNum(t) - days + 1);
    const [flow, users, purchases, items, grants] = await Promise.all([
      rpcAll("admin_descoin_flow", { p_since: since, p_tz: TZ }),
      allUsers(),
      selectPaged(() =>
        supabase
          .from("shop_purchases")
          .select("item_id, amount_descoin, status, created_at", { count: "exact" })
          .gte("created_at", new Date(Date.now() - (days + 1) * 86400000).toISOString())
          .order("id", { ascending: true })
      ).then((r) => (r.error ? [] : r.data || [])),
      selectPaged(() => supabase.from("shop_items").select("id, name, category", { count: "exact" }).order("id", { ascending: true })).then((r) => (r.error ? [] : r.data || [])),
      selectPaged(() =>
        supabase
          .from("descoin_ledger")
          .select("user_id, amount", { count: "exact" })
          .in("reason", ["admin_grant", "admin_revoke"])
          .order("id", { ascending: true })
      ).then((r) => (r.error ? [] : r.data || [])),
    ]);
    const granted = new Map();
    for (const row of grants) granted.set(String(row.user_id), (granted.get(String(row.user_id)) || 0) + (Number(row.amount) || 0));
    const report = g.economyReport({
      flow,
      balances: users.map((u) => ({ id: u.id, username: u.username, balance: u.descoin_balance, granted: granted.get(String(u.id)) || 0, isAdmin: isAdminRow(u), frozen: Boolean(u.descoin_frozen) })),
      purchases: purchases.map((p) => ({ ...p, created_at: localDay(p.created_at) || p.created_at })),
      items,
      today: t,
      days,
    });
    res.set("Cache-Control", "no-store");
    res.json({ ...report, days, today: t, generatedAt: new Date().toISOString() });
  } catch (err) {
    unavailable(res, err);
  }
});

/**
 * "Başla panosu" (growth phase 2A): did the first five minutes work?
 *   GET /growth/onboarding?days=7|30|90   funnel (opened > previewed > joined > first hello),
 *                                         first message within the first day vs sign-ups,
 *                                         which interest and which server card brought the
 *                                         first messages, D1 of dashboard openers vs others,
 *                                         and the settings (official community server).
 *   PUT /growth/onboarding/config         { communityServerId, enabled, autoJoin, rehberEnabled, rewardsEnabled }
 * Admin accounts are left out of every number, like the rest of this page.
 */
const onbModel = require("../lib/onboarding/model");
const onbStore = require("../lib/onboarding/store");
const ONB_EVENTS = ["onboarding_opened", "onboarding_previewed", "onboarding_joined", "onboarding_first_hello", "onboarding_undo", "onboarding_hidden"];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Pure summary (tested in lib/onboarding/adminReport.selftest.cjs through module.exports.onboardingReport). */
function onboardingReport({ events, users, interestsByUser, activity, sinceMs, now = Date.now() }) {
  const admins = new Set(users.filter(isAdminRow).map((u) => String(u.id)));
  const real = (id) => id && !admins.has(String(id));
  const distinct = (ev) => new Set(events.filter((e) => e.event === ev && real(e.user_id)).map((e) => String(e.user_id))).size;
  const funnel = {
    opened: distinct("onboarding_opened"),
    previewed: distinct("onboarding_previewed"),
    joined: distinct("onboarding_joined"),
    firstHello: distinct("onboarding_first_hello"),
    undone: distinct("onboarding_undo"),
    hidden: distinct("onboarding_hidden"),
  };
  const fresh = users.filter((u) => real(u.id) && Date.parse(u.signup_at || u.created_at) >= sinceMs);
  const within = (u) => u.first_message_at && Date.parse(u.first_message_at) - Date.parse(u.signup_at || u.created_at) <= 86400000;
  const firstDay = { signups: fresh.length, firstMessage: fresh.filter((u) => u.first_message_at).length, firstDayMessage: fresh.filter(within).length };
  firstDay.pct = fresh.length ? Math.round((firstDay.firstDayMessage / fresh.length) * 1000) / 10 : null;

  // Which interest: of the accounts that picked it, how many sent the first message.
  const helloUsers = new Set(events.filter((e) => e.event === "onboarding_first_hello" && real(e.user_id)).map((e) => String(e.user_id)));
  const byInterest = onbModel.INTERESTS.map((id) => {
    const pickers = [...interestsByUser.entries()].filter(([uid, list]) => real(uid) && list.includes(id)).map(([uid]) => uid);
    const hello = pickers.filter((uid) => helloUsers.has(String(uid))).length;
    return { id, picked: pickers.length, firstHello: hello, pct: pickers.length ? Math.round((hello / pickers.length) * 1000) / 10 : null };
  }).filter((r) => r.picked > 0).sort((a, b) => b.firstHello - a.firstHello || b.picked - a.picked);

  // Which server card: previews, joins and first messages per server (and per slot).
  const perServer = new Map();
  const bump = (sid, key) => {
    if (!sid) return;
    if (!perServer.has(sid)) perServer.set(sid, { serverId: sid, previewed: 0, joined: 0, firstHello: 0 });
    perServer.get(sid)[key] += 1;
  };
  const seen = new Set();
  for (const e of events) {
    if (!real(e.user_id)) continue;
    const sid = e.props?.server;
    if (!UUID_RE.test(String(sid || ""))) continue;
    const key = e.event === "onboarding_previewed" ? "previewed" : e.event === "onboarding_joined" ? "joined" : e.event === "onboarding_first_hello" ? "firstHello" : null;
    if (!key) continue;
    const dedupe = `${key}:${e.user_id}:${sid}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    bump(String(sid), key);
  }
  const bySlot = {};
  for (const e of events) {
    if (e.event !== "onboarding_first_hello" || !real(e.user_id)) continue;
    const slot = String(e.props?.slot || "other");
    bySlot[slot] = (bySlot[slot] || 0) + 1;
  }

  // D1: openers of the dashboard vs everyone else who signed up in the range.
  const opened = new Set(events.filter((e) => e.event === "onboarding_opened" && real(e.user_id)).map((e) => String(e.user_id)));
  const activeDays = new Map();
  for (const a of activity || []) {
    const id = String(a.user_id);
    if (!activeDays.has(id)) activeDays.set(id, new Set());
    activeDays.get(id).add(a.day);
  }
  const d1 = (list) => {
    const eligible = list.filter((u) => now - Date.parse(u.signup_at || u.created_at) >= 2 * 86400000);
    const kept = eligible.filter((u) => {
      const start = Date.parse(u.signup_at || u.created_at);
      const next = new Date(start + 86400000);
      const day = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(next);
      return activeDays.get(String(u.id))?.has(day);
    }).length;
    return { eligible: eligible.length, kept, pct: eligible.length ? Math.round((kept / eligible.length) * 1000) / 10 : null };
  };
  const cohort = { opened: d1(fresh.filter((u) => opened.has(String(u.id)))), others: d1(fresh.filter((u) => !opened.has(String(u.id)))) };
  return { funnel, firstDay, byInterest, byServer: [...perServer.values()].sort((a, b) => b.firstHello - a.firstHello || b.joined - a.joined || b.previewed - a.previewed).slice(0, 12), bySlot, cohort };
}

router.get("/growth/onboarding", async (req, res) => {
  try {
    const days = rangeOf(req);
    const sinceMs = Date.now() - days * 86400000;
    const sinceIso = new Date(sinceMs).toISOString();
    const [events, users, onbRows, settings, activity] = await Promise.all([
      selectPaged(() =>
        supabase
          .from("analytics_events")
          .select("event, user_id, props", { count: "exact" })
          .in("event", ONB_EVENTS)
          .gte("occurred_at", sinceIso)
          .order("id", { ascending: true })
      ).then((r) => (r.error ? [] : r.data || [])),
      selectPaged(() =>
        supabase.from("users").select("id, username, is_admin, created_at, signup_at, first_message_at", { count: "exact" }).gte("created_at", new Date(sinceMs - 86400000).toISOString()).order("id", { ascending: true })
      ).then((r) => (r.error ? [] : r.data || [])),
      selectPaged(() => supabase.from("user_onboarding").select("user_id, interests", { count: "exact" }).gte("created_at", sinceIso).order("user_id", { ascending: true })).then((r) => (r.error ? [] : r.data || [])),
      onbStore.getSettings({ fresh: true }),
      rpcAll("admin_activity_days", { p_since: g.dayStr(g.dayNum(today()) - days - 3), p_tz: TZ }).catch(() => []),
    ]);
    const interestsByUser = new Map(onbRows.map((r) => [String(r.user_id), Array.isArray(r.interests) ? r.interests : []]));
    const report = onboardingReport({ events, users, interestsByUser, activity, sinceMs });
    const ids = report.byServer.map((r) => r.serverId);
    if (settings.communityServerId) ids.push(String(settings.communityServerId));
    const names = new Map();
    if (ids.length) {
      const { data } = await supabase.from("servers").select("id, name, icon_url").in("id", [...new Set(ids)]);
      for (const s of data || []) names.set(String(s.id), { name: s.name, iconUrl: s.icon_url || null });
    }
    report.byServer = report.byServer.map((r) => ({ ...r, name: names.get(r.serverId)?.name || null, iconUrl: names.get(r.serverId)?.iconUrl || null }));
    const community = settings.communityServerId ? { id: String(settings.communityServerId), ...(names.get(String(settings.communityServerId)) || { name: null, iconUrl: null }) } : null;
    res.set("Cache-Control", "no-store");
    res.json({ ...report, settings: { ...settings, community }, days, generatedAt: new Date().toISOString() });
  } catch (err) {
    unavailable(res, err);
  }
});

router.put("/growth/onboarding/config", async (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const patch = {};
    if ("communityServerId" in body) {
      const id = body.communityServerId ? String(body.communityServerId).trim() : null;
      if (id && !UUID_RE.test(id)) return res.status(400).json(apiError("Bad server id."));
      if (id) {
        const { data } = await supabase.from("servers").select("id").eq("id", id).maybeSingle();
        if (!data) return res.status(404).json(apiError("Server not found."));
      }
      patch.communityServerId = id;
    }
    for (const k of ["enabled", "autoJoin", "rehberEnabled", "rewardsEnabled"]) if (k in body) patch[k] = Boolean(body[k]);
    const before = await onbStore.getSettings({ fresh: true });
    const settings = await onbStore.saveSettings(patch, req.user?.id);
    try {
      require("../runtime/sharedState").appendAudit(req.user?.id, req.user?.username, "ONBOARDING_SETTINGS", "onboarding", { before, after: settings });
    } catch {
      /* audit is best effort */
    }
    res.json({ settings });
  } catch (err) {
    console.error("[admin-growth] onboarding config:", err?.message || err);
    res.status(500).json(apiError("Onboarding settings could not be saved."));
  }
});

module.exports = router;
module.exports.onboardingReport = onboardingReport;
