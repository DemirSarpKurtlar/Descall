"use strict";

/**
 * Product analytics helpers. No Google Ads cost/click invention.
 * Event writes must never fail signup/auth.
 */

const ALLOWED_EVENTS = new Set([
  "page_view",
  "visit",
  "signup_started",
  "signup_completed",
  "login",
  "app_opened",
  "first_action",
  "first_message",
  "profile_created",
  "first_session",
  "session_started",
  "session_ended",
]);

const ONCE_PER_USER = new Set([
  "signup_completed",
  "app_opened",
  "first_action",
  "first_message",
  "profile_created",
  "first_session",
]);

const HEADLINE_SOURCES = [
  "google_ads",
  "google_organic",
  "discord",
  "reddit",
  "youtube",
  "instagram",
  "twitter",
  "referral",
  "direct",
  "other",
];

const VISITOR_KEY_RE = /^[a-zA-Z0-9_-]{8,64}$/;

function sanitizeVisitorKey(value) {
  const text = String(value || "").trim();
  if (!VISITOR_KEY_RE.test(text)) return "";
  return text;
}

function sanitizeAnalyticsEvent({ event, props } = {}) {
  const name = String(event || "").trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
  if (!ALLOWED_EVENTS.has(name)) return { event: null, props: {} };
  const src = props && typeof props === "object" && !Array.isArray(props) ? props : {};
  const clean = {};
  const allow = ["path", "source", "method", "campaign"];
  for (const key of allow) {
    if (src[key] == null) continue;
    const val = String(src[key]).replace(/<[^>]*>/g, "").trim().slice(0, 180);
    if (val) clean[key] = val;
  }
  return { event: name, props: clean };
}

function isOncePerUserEvent(event) {
  return ONCE_PER_USER.has(String(event || ""));
}

function googleAdsMetrics({ adsSignups = 0, adsVisits = 0, adsCost = null } = {}) {
  const signups = Number(adsSignups) || 0;
  const clicks = Number(adsVisits) || 0;
  const cost = adsCost == null || adsCost === "" ? null : Number(adsCost);
  const costAvailable = Number.isFinite(cost) && cost >= 0;
  return {
    signups,
    clicks,
    conversionRate: clicks > 0 ? signups / clicks : null,
    costPerSignup: costAvailable && signups > 0 ? cost / signups : null,
    costAvailable,
  };
}

function buildLifecycleFunnel(counts = {}) {
  return [
    { key: "visitors", label: "Visitors", count: Number(counts.visitors) || 0 },
    { key: "signup_started", label: "Signup Started", count: Number(counts.signupStarted) || 0 },
    { key: "signup_completed", label: "Signup Completed", count: Number(counts.signupCompleted) || 0 },
    { key: "app_opened", label: "App Opened", count: Number(counts.appOpened) || 0 },
    { key: "first_action", label: "First Action", count: Number(counts.firstAction) || 0 },
    { key: "first_message", label: "First Message", count: Number(counts.firstMessage) || 0 },
  ];
}

function buildUserTimeline(user = {}) {
  const steps = [
    { key: "signup", at: user.signup_at || user.created_at || null },
    { key: "login", at: user.last_login_at || user.last_seen || null, done: Boolean(user.last_seen || user.last_login_at) },
    { key: "app_opened", at: user.first_app_opened_at || null },
    { key: "first_action", at: user.first_action_at || null },
    { key: "first_message", at: user.first_message_at || null },
  ];
  return steps.map((step) => ({
    ...step,
    done: step.done != null ? Boolean(step.done) : Boolean(step.at),
  }));
}

function activeUserCounts(rows = [], now = new Date()) {
  const t = now.getTime();
  const day = 24 * 60 * 60 * 1000;
  let activeToday = 0;
  let active7d = 0;
  let active30d = 0;
  for (const row of rows) {
    if (!row?.last_seen) continue;
    const seen = new Date(row.last_seen).getTime();
    if (Number.isNaN(seen)) continue;
    const age = t - seen;
    if (age <= day) activeToday += 1;
    if (age <= 7 * day) active7d += 1;
    if (age <= 30 * day) active30d += 1;
  }
  return { activeToday, active7d, active30d };
}

function headlineSourceCounts(bySource = {}) {
  const out = {};
  for (const key of HEADLINE_SOURCES) out[key] = 0;
  for (const [key, count] of Object.entries(bySource || {})) {
    const n = Number(count) || 0;
    if (key in out) out[key] += n;
    else out.other += n;
  }
  return out;
}

function signupWindowCounts(rows = [], now = new Date()) {
  const t = now.getTime();
  const day = 24 * 60 * 60 * 1000;
  const todayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  let today = 0;
  let last7 = 0;
  let last30 = 0;
  for (const row of rows) {
    const when = row.signup_at || row.created_at;
    if (!when) continue;
    const ms = new Date(when).getTime();
    if (Number.isNaN(ms)) continue;
    if (ms >= todayStart) today += 1;
    if (t - ms <= 7 * day) last7 += 1;
    if (t - ms <= 30 * day) last30 += 1;
  }
  return { signupsToday: today, signups7d: last7, signups30d: last30 };
}

module.exports = {
  ALLOWED_EVENTS,
  ONCE_PER_USER,
  HEADLINE_SOURCES,
  sanitizeVisitorKey,
  sanitizeAnalyticsEvent,
  isOncePerUserEvent,
  googleAdsMetrics,
  buildLifecycleFunnel,
  buildUserTimeline,
  activeUserCounts,
  headlineSourceCounts,
  signupWindowCounts,
};
