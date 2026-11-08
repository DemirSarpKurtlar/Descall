"use strict";

/**
 * GET /admin/signup-stats       → JSON for Yönetici Paneli › Kayıt İstatistikleri
 * GET /admin/signup-stats/csv   → the trend as CSV
 * Mounted inside routes/admin.js after requireAuth + requireAdmin, so moderators get 403.
 * Query: granularity=day|week|month, from=YYYY-MM-DD, to=YYYY-MM-DD (Istanbul days).
 */

const express = require("express");
const supabase = require("../db/supabase");
const { isMissingColumnError } = require("../lib/signupAttribution");
const ss = require("../lib/signupStats");
const { bt, requestLang } = require("../lib/i18n");

const router = express.Router();
const PAGE = 1000;
const MAX_ROWS = 100000;

async function pageAll(build) {
  const out = [];
  for (let start = 0; start < MAX_ROWS; start += PAGE) {
    const { data, error } = await build().range(start, start + PAGE - 1);
    if (error) return { data: out, error };
    out.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return { data: out, error: null };
}

const missingTable = (e) => /does not exist|schema cache|relation/i.test(String(e?.message || ""));

async function loadStats(query, lang = "tr") {
  const range = ss.resolveRange(query);
  const sinceIso = new Date(Date.parse(`${ss.addDays(range.from, -1)}T00:00:00Z`)).toISOString();
  const full = "id, created_at, signup_at, auth_method, first_touch_source, signup_country, first_app_opened_at, deleted_at";
  // Newest columns first (20261111_signup_measurement.sql), then the older sets, so a
  // database that is not migrated yet still gets every stat it has columns for.
  const userCols = [`${full}, referred_by, heard_about, joined_via_invite_code`, `${full}, referred_by`, full, "id, created_at"];
  let users = { data: [], error: { code: "42703" } };
  for (const cols of userCols) {
    users = await pageAll(() => supabase.from("users").select(cols).order("id", { ascending: true }));
    if (!users.error || !isMissingColumnError(users.error)) break;
  }
  if (users.error) throw new Error("users");

  const attemptsQuery = (cols) => pageAll(() => supabase.from("signup_attempts").select(cols).gte("created_at", sinceIso).order("created_at", { ascending: true }));
  const [events, attemptsFull, active] = await Promise.all([
    pageAll(() => supabase.from("analytics_events").select("visitor_key, occurred_at").eq("event", "signup_started").gte("occurred_at", sinceIso).order("occurred_at", { ascending: true })),
    attemptsQuery("created_at, status, attempt_key, reason, reason_detail"),
    pageAll(() => supabase.from("user_active_days").select("user_id, day").gte("day", range.from).order("day", { ascending: true })),
  ]);
  // reason_detail not migrated yet: the coarse reason still splits validation / conflict.
  const attempts = attemptsFull.error && isMissingColumnError(attemptsFull.error) ? await attemptsQuery("created_at, status, attempt_key, reason") : attemptsFull;
  // One "started" per visitor per day (reloads of the form are not new starts).
  const seen = new Set();
  const startedDays = [];
  for (const e of events.error ? [] : events.data) {
    const d = ss.istDay(e.occurred_at);
    const k = `${e.visitor_key || ""}|${d}`;
    if (!d || seen.has(k)) continue;
    seen.add(k);
    startedDays.push(d);
  }
  if (attempts.error && !missingTable(attempts.error)) console.warn("[signup-stats] attempts read failed");
  if (active.error && !missingTable(active.error)) console.warn("[signup-stats] active days read failed");
  return ss.computeSignupStats({
    lang,
    users: users.data,
    startedDays,
    attempts: attempts.error ? [] : attempts.data,
    activeDays: active.error ? [] : active.data,
    range,
  });
}

router.get("/", async (req, res) => {
  try {
    res.setHeader("Cache-Control", "no-store");
    return res.json(await loadStats(req.query || {}, requestLang(req, "tr")));
  } catch {
    return res.status(500).json({ error: "Could not load sign-up statistics." });
  }
});

router.get("/csv", async (req, res) => {
  try {
    const lang = requestLang(req, "tr");
    const stats = await loadStats(req.query || {}, lang);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Disposition", `attachment; filename="${bt(lang, "stats.csvFilePrefix")}-${stats.range.from}_${stats.range.to}.csv"`);
    return res.send(ss.statsCsv(stats, lang));
  } catch {
    return res.status(500).json({ error: "Could not prepare the CSV." });
  }
});

module.exports = router;
