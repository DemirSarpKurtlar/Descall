"use strict";

const supabase = require("../db/supabase");
const {
  sanitizeAnalyticsEvent,
  sanitizeVisitorKey,
  isOncePerUserEvent,
} = require("./userAnalytics");
const { classifyAcquisitionSource, isMissingColumnError } = require("./signupAttribution");

const MILESTONE_COLUMNS = {
  app_opened: "first_app_opened_at",
  first_session: "first_app_opened_at",
  first_action: "first_action_at",
  first_message: "first_message_at",
};

/** Process-local dedupe so hot paths (every DM) skip extra DB roundtrips. */
const seenOnce = new Set();

function onceStamp(userId, visitorKey, event) {
  if (userId && isOncePerUserEvent(event)) return `u:${userId}:${event}`;
  if (visitorKey && event === "signup_started") return `v:${visitorKey}:${event}`;
  return "";
}

function dayStamp(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

async function recordVisitorDay({ visitorKey, source, hasGclid, country, device } = {}) {
  const key = sanitizeVisitorKey(visitorKey);
  if (!key) return { skipped: true };
  try {
    const { error } = await supabase.from("analytics_visitor_days").upsert(
      {
        visitor_key: key,
        day: dayStamp(),
        first_touch_source: source || null,
        has_gclid: Boolean(hasGclid),
        country: country || null,
        device: device || null,
      },
      { onConflict: "visitor_key,day", ignoreDuplicates: true },
    );
    if (error && !isMissingColumnError(error)) {
      console.warn("[analytics] visitor day failed:", error.message);
    }
    return { ok: !error };
  } catch (err) {
    console.warn("[analytics] visitor day failed:", err?.message || err);
    return { error: String(err?.message || err) };
  }
}

async function insertEventRow({ userId, visitorKey, event, props }) {
  try {
    const row = {
      user_id: userId || null,
      visitor_key: visitorKey || null,
      event,
      props: props || {},
    };
    const { error } = await supabase.from("analytics_events").insert(row);
    if (!error) return { ok: true };
    if (error.code === "23505") return { ok: true, duplicate: true };
    if (isMissingColumnError(error)) return { skipped: true };
    console.warn("[analytics] event insert failed:", error.message);
    return { error: error.message };
  } catch (err) {
    console.warn("[analytics] event insert failed:", err?.message || err);
    return { error: String(err?.message || err) };
  }
}

async function markMilestoneColumn(userId, event) {
  const column = MILESTONE_COLUMNS[event];
  if (!userId || !column) return;
  try {
    const nowIso = new Date().toISOString();
    const { data, error: readError } = await supabase
      .from("users")
      .select("id, first_app_opened_at, first_action_at, first_message_at")
      .eq("id", userId)
      .maybeSingle();
    if (readError && isMissingColumnError(readError)) return;
    if (!data || data[column]) return;
    const patch = { [column]: nowIso };
    if ((event === "first_message" || event === "first_action") && !data.first_action_at) {
      patch.first_action_at = nowIso;
    }
    if ((event === "app_opened" || event === "first_session") && !data.first_app_opened_at) {
      patch.first_app_opened_at = nowIso;
    }
    const { error } = await supabase.from("users").update(patch).eq("id", userId);
    if (error && !isMissingColumnError(error)) {
      console.warn("[analytics] milestone update failed:", error.message);
    }
  } catch (err) {
    console.warn("[analytics] milestone update failed:", err?.message || err);
  }
}

/**
 * Best-effort analytics write. Never throws.
 */
async function recordAnalyticsEvent({ userId = null, visitorKey = "", event, props, source, hasGclid, country, device } = {}) {
  try {
    const clean = sanitizeAnalyticsEvent({ event, props });
    if (!clean.event) return { skipped: true, reason: "event" };
    const key = sanitizeVisitorKey(visitorKey);

    if (clean.event === "visit" || clean.event === "page_view") {
      return recordVisitorDay({
        visitorKey: key,
        source,
        hasGclid,
        country,
        device,
      });
    }

    if (isOncePerUserEvent(clean.event) && !userId) {
      // anonymous signup_started is allowed
      if (clean.event !== "signup_started") return { skipped: true, reason: "auth" };
    }

    const stamp = onceStamp(userId, key, clean.event);
    if (stamp && seenOnce.has(stamp)) return { ok: true, duplicate: true };

    const result = await insertEventRow({
      userId,
      visitorKey: key || null,
      event: clean.event,
      props: clean.props,
    });
    if (stamp && (result.ok || result.duplicate)) seenOnce.add(stamp);
    if (userId && !result.duplicate && !result.error) {
      await markMilestoneColumn(userId, clean.event);
    }
    return result;
  } catch (err) {
    console.warn("[analytics] record failed:", err?.message || err);
    return { error: String(err?.message || err) };
  }
}

async function recordSignupAnalytics(user, attributionColumns = {}) {
  if (!user?.id) return;
  void recordAnalyticsEvent({
    userId: user.id,
    event: "signup_completed",
    props: { method: attributionColumns.auth_method || "", source: attributionColumns.first_touch_source || "" },
  });
}

async function recordFirstMessage(userId) {
  if (!userId) return;
  void recordAnalyticsEvent({ userId, event: "first_message" });
  void recordAnalyticsEvent({ userId, event: "first_action" });
}

async function recordAppOpened(userId) {
  if (!userId) return;
  void recordAnalyticsEvent({ userId, event: "app_opened" });
  void recordAnalyticsEvent({ userId, event: "first_session" });
  void recordAnalyticsEvent({ userId, event: "session_started" });
}

async function flagSuspiciousSignup(userId, visitorKey) {
  const key = sanitizeVisitorKey(visitorKey);
  if (!userId || !key) return false;
  try {
    const { data } = await supabase
      .from("users")
      .select("id")
      .eq("signup_visitor_key", key)
      .neq("id", userId)
      .limit(1);
    if (data && data.length) {
      await supabase.from("users").update({ suspicious_signup: true }).eq("id", userId);
      return true;
    }
    await supabase.from("users").update({ signup_visitor_key: key }).eq("id", userId);
  } catch (err) {
    console.warn("[analytics] suspicious flag failed:", err?.message || err);
  }
  return false;
}

function classifyVisitSource(attribution) {
  const first = attribution?.first || attribution || {};
  return classifyAcquisitionSource(first);
}

module.exports = {
  recordAnalyticsEvent,
  recordSignupAnalytics,
  recordFirstMessage,
  recordAppOpened,
  recordVisitorDay,
  flagSuspiciousSignup,
  classifyVisitSource,
  dayStamp,
};
