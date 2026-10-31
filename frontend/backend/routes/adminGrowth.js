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
const supabase = require("../db/supabase");
const g = require("../lib/growthInsights");

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
      .range(from, from + 999);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}
const isAdminRow = (u) => Boolean(u.is_admin) || u.username === "admin";

async function rpcAll(fn, args) {
  const out = [];
  for (let from = 0; from < 200000; from += 1000) {
    const { data, error } = await supabase.rpc(fn, args).range(from, from + 999);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

function unavailable(res, err) {
  const missing = err?.code === "PGRST202" || err?.code === "42883";
  if (missing) return res.status(503).json({ error: "Insights are not enabled yet.", code: "INSIGHTS_UNAVAILABLE" });
  console.error("[admin-growth]", err?.message || err);
  return res.status(500).json({ error: "Could not load insights." });
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
      supabase
        .from("analytics_events")
        .select("event, user_id")
        .in("event", ["signup_started", "signup_completed", "first_session", "first_message"])
        .gte("occurred_at", new Date(Date.now() - days * 86400000).toISOString())
        .limit(20000)
        .then((r) => (r.error ? [] : r.data || [])),
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
    res.set("Cache-Control", "no-store");
    res.json({ ...report, funnel, days, today: t, generatedAt: new Date().toISOString() });
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
      supabase
        .from("shop_purchases")
        .select("item_id, amount_descoin, status, created_at")
        .gte("created_at", new Date(Date.now() - (days + 1) * 86400000).toISOString())
        .limit(20000)
        .then((r) => (r.error ? [] : r.data || [])),
      supabase.from("shop_items").select("id, name, category").limit(5000).then((r) => (r.error ? [] : r.data || [])),
      supabase
        .from("descoin_ledger")
        .select("user_id, amount")
        .in("reason", ["admin_grant", "admin_revoke"])
        .limit(50000)
        .then((r) => (r.error ? [] : r.data || [])),
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

module.exports = router;
