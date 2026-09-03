"use strict";

const express = require("express");
const supabase = require("../db/supabase");
const state = require("../runtime/sharedState");
const { pruneDeadPresence, summarizePresence } = require("../lib/presenceRoster");
const reports = require("../lib/userReports");
const { isMissingColumnError } = require("../lib/signupAttribution");
const {
  istanbulDayKey,
  lastIstanbulDays,
  bucketSignupsByIstanbulDay,
  rssMb,
  countSince,
  mergeRecentlyActive,
  queryRows,
  withTimeout,
  deriveHealth,
  fetchDurableAdminCounts,
  fetchRecentOnlineRows,
  mergeOnlineSignal,
  siteUptimeFromStartedAt,
  mergeAuditEntries,
  mapModerationActionToAudit,
  isRecentlySeen,
} = require("../lib/adminOverview");
const { loadSystemSettings, applySystemConfigToState } = require("../lib/systemSettings");

const ROSTER_LIMIT = 20;
const QUERY_MS = 5000;
const JOINED_COLS = "id, username, display_name, avatar_url, created_at, signup_at, last_seen, first_touch_source";
const JOINED_COLS_FALLBACK = "id, username, display_name, avatar_url, created_at, last_seen";
const ACTIVE_COLS = "id, username, display_name, avatar_url, created_at, last_seen";

const router = express.Router();

function getIo(req) {
  return req.app.get("io");
}

function publicPerson(row) {
  return {
    id: row.id,
    username: row.username,
    displayName: row.displayName || row.display_name || row.username,
    avatarUrl: row.avatarUrl || row.avatar_url || null,
    lastSeen: row.last_seen || row.lastSeen || null,
    createdAt: row.signup_at || row.created_at || row.createdAt || null,
    source: row.first_touch_source || row.source || null,
    isOnline: Boolean(row.isOnline),
    status: row.status || (row.isOnline ? "online" : "offline"),
  };
}

function presenceFor(userId) {
  return state.presence.get(userId) || state.presence.get(String(userId)) || null;
}

function enrichDbRow(u, liveIds, onlineById) {
  const last_seen = state.userLastLoginAt.get(u.id) || state.lastSeenByUserId.get(u.id) || u.last_seen || null;
  const live = liveIds.has(String(u.id));
  const recent = onlineById && onlineById.get(String(u.id));
  const p = presenceFor(u.id);
  const isOnline = live || Boolean(recent) || isRecentlySeen(last_seen);
  const status = live
    ? (p?.status || "online")
    : isOnline
      ? (recent && (recent.presence_status || recent.status)) || "online"
      : "offline";
  return {
    ...u,
    displayName: u.display_name || u.username,
    last_seen,
    isOnline,
    status,
  };
}

router.get("/overview", async (req, res) => {
  try {
    const io = getIo(req);
    pruneDeadPresence(state.presence, io);
    const roster = summarizePresence(state.presence, { io });
    const memory = process.memoryUsage();
    const mem = rssMb(memory);
    const hourAgo = Date.now() - 60 * 60 * 1000;
    const errorsLastHour = countSince(state.serverErrorLog || [], hourAgo, "at");

    const since = new Date(Date.now() - 8 * 24 * 3600_000).toISOString();
    const nowIso = new Date().toISOString();
    const emptyInbox = { openCount: 0, uniqueTargets: 0, autoOpenUserId: null, hotTargets: [] };
    const emptyAudit = { data: [], error: { message: "timeout" } };
    let [joinedRes, activeRes, signupRes, feedbackRes, inbox, durable, auditRes, dbOnline, settings] = await Promise.all([
      withTimeout(
        supabase.from("users").select(JOINED_COLS).order("created_at", { ascending: false }).limit(ROSTER_LIMIT),
        QUERY_MS,
        { error: { message: "timeout" } }
      ),
      withTimeout(
        supabase.from("users").select(ACTIVE_COLS).not("last_seen", "is", null).order("last_seen", { ascending: false }).limit(ROSTER_LIMIT),
        QUERY_MS,
        { error: { message: "timeout" } }
      ),
      withTimeout(
        supabase.from("users").select("created_at, signup_at").gte("created_at", since),
        QUERY_MS,
        { error: { message: "timeout" } }
      ),
      withTimeout(
        supabase.from("user_feedback").select("id", { count: "exact", head: true }).eq("status", "new"),
        QUERY_MS,
        { count: 0, error: { message: "timeout" } }
      ),
      withTimeout(reports.summarizeInbox().catch(() => emptyInbox), QUERY_MS, emptyInbox),
      fetchDurableAdminCounts(supabase, { timeoutMs: QUERY_MS }),
      withTimeout(
        supabase
          .from("moderation_actions")
          .select("id, action_type, target_user_id, actor_user_id, created_at")
          .order("created_at", { ascending: false })
          .limit(8),
        QUERY_MS,
        emptyAudit
      ),
      fetchRecentOnlineRows(supabase, { timeoutMs: QUERY_MS }),
      loadSystemSettings(supabase, { timeoutMs: QUERY_MS }),
    ]);
    applySystemConfigToState(state, settings.config);

    if (joinedRes.error && isMissingColumnError(joinedRes.error)) {
      joinedRes = await withTimeout(
        supabase
          .from("users")
          .select(JOINED_COLS_FALLBACK)
          .order("created_at", { ascending: false })
          .limit(ROSTER_LIMIT),
        QUERY_MS,
        { error: { message: "timeout" } }
      );
    }
    const joinedRows = queryRows(joinedRes, "newly-joined");
    const activeRows = queryRows(activeRes, "recently-active");

    const signupRows = signupRes.error ? [] : signupRes.data || [];
    const dayKeys = lastIstanbulDays(7);
    const todayKey = istanbulDayKey();
    const signupsToday = signupRows.filter((row) => istanbulDayKey(row.signup_at || row.created_at) === todayKey).length;
    const sparkline = bucketSignupsByIstanbulDay(signupRows, dayKeys);

    const online = mergeOnlineSignal({ liveRows: roster.live, dbRows: dbOnline });
    const onlineById = new Map((dbOnline || []).filter((row) => row && row.id != null).map((row) => [String(row.id), row]));
    const liveIds = new Set([...(roster.live || []).map((row) => String(row.id)), ...online.ids]);
    const livePulse = (roster.live || []).map((row) => ({
      id: String(row.id),
      username: row.username || state.usernameById.get(row.id) || "?",
      display_name: null,
      displayName: row.username || state.usernameById.get(row.id) || "?",
      avatar_url: row.avatar_url || null,
      created_at: null,
      last_seen: state.userLastLoginAt.get(row.id) || state.lastSeenByUserId.get(row.id) || nowIso,
      isOnline: true,
      status: row.status || "online",
    }));

    const live = livePulse.slice(0, 12).map(publicPerson);
    const newlyJoined = joinedRows.map((u) => publicPerson(enrichDbRow(u, liveIds, onlineById)));
    const recentlyActive = mergeRecentlyActive({
      liveRows: livePulse,
      dbRows: activeRows.map((u) => enrichDbRow(u, liveIds, onlineById)),
      limit: ROSTER_LIMIT,
    }).map(publicPerson);

    const health = deriveHealth({
      maintenance: Boolean(state.systemConfig.maintenanceMode),
      chatFrozen: Boolean(state.systemConfig.chatFrozen),
      openReports: inbox.openCount || 0,
      hotTargets: (inbox.hotTargets || []).length,
      errorsLastHour,
      rssMb: mem,
    });

    res.json({
      generatedAt: new Date().toISOString(),
      health,
      live: {
        connected: online.connectedCount,
        visible: online.visibleCount,
        invisible: online.invisibleCount,
        statusCounts: online.statusCounts,
        people: live.length
          ? live
          : (dbOnline || []).slice(0, 12).map((row) =>
              publicPerson({
                ...row,
                displayName: row.display_name || row.username,
                isOnline: true,
                status: row.presence_status || row.status || "online",
              })
            ),
      },
      product: {
        signupsToday,
        sparkline,
        newFeedback: feedbackRes.error ? 0 : feedbackRes.count || 0,
      },
      safety: {
        openReports: inbox.openCount || 0,
        uniqueTargets: inbox.uniqueTargets || 0,
        hotTargets: inbox.hotTargets || [],
        autoOpenUserId: inbox.autoOpenUserId || null,
        bans: durable.bans || 0,
        timeouts: durable.timeouts || 0,
      },
      system: {
        uptime: siteUptimeFromStartedAt(settings.startedAt),
        maintenance: Boolean(state.systemConfig.maintenanceMode),
        chatFrozen: Boolean(state.systemConfig.chatFrozen),
        rssMb: mem,
        errorsLastHour,
        flaggedMessages: state.flaggedMessages?.length || 0,
      },
      newlyJoined,
      recentlyActive,
      recentAudit: mergeAuditEntries(
        (state.auditLog || []).slice(0, 8).map((e) => ({
          id: e.id,
          at: e.at,
          actor: e.actorUsername,
          actorUsername: e.actorUsername,
          action: e.action,
          target: e.target,
        })),
        queryRows(auditRes, "recent-audit").map((row) => mapModerationActionToAudit(row)),
        8
      ).map((e) => ({
        id: e.id,
        at: e.at,
        actor: e.actor,
        action: e.action,
        target: e.target,
      })),
    });
  } catch (err) {
    console.error("[overview]", err);
    res.status(500).json({ error: err.message || "Failed to load overview." });
  }
});

module.exports = router;
