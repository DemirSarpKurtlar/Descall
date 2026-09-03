"use strict";

/**
 * Assembles one admin "user file" from existing sources — identity, signup,
 * sessions, moderation, reports, wallet, Dima — without dump-style lists.
 */

const supabase = require("../db/supabase");
const state = require("../runtime/sharedState");
const moderation = require("./moderation");
const descoin = require("./descoin");
const { listSessions } = require("./sessions");
const { pruneDeadPresence, getPresenceEntry } = require("./presenceRoster");
const { reportsForUser, scoreRisk } = require("./userReports");
const { isMissingColumnError } = require("./signupAttribution");

const USER_SELECT_FULL =
  "id, username, display_name, email, avatar_url, created_at, signup_at, last_seen, auth_method, first_touch_source, last_touch_source, first_touch_campaign, first_touch_medium, first_touch_term, first_touch_gclid, first_touch_referrer, first_touch_landing_page, signup_device, signup_browser, signup_os, signup_country, first_app_opened_at, first_action_at, first_message_at, suspicious_signup, is_admin, is_banned, ban_category, ban_reason, ban_message, banned_at, ban_expires_at, timeout_until, timeout_category, timeout_reason, timeout_message, timed_out_at, descoin_balance, descoin_frozen, active_sessions";

const USER_SELECT_SAFE =
  "id, username, display_name, email, avatar_url, created_at, last_seen, is_admin, is_banned, descoin_balance, active_sessions";

function liveSockets(io, userId) {
  if (!io?.sockets?.adapter?.rooms) return [];
  const room = io.sockets.adapter.rooms.get(`user:${String(userId)}`);
  if (!room) return [];
  return [...room].filter(Boolean).map((socketId) => {
    const sock = io.sockets.sockets.get(socketId);
    return {
      socketId,
      connected: Boolean(sock),
      userAgent: sock?.handshake?.headers?.["user-agent"]
        ? String(sock.handshake.headers["user-agent"]).slice(0, 180)
        : null,
    };
  });
}

async function loadUserRow(userId) {
  const full = await supabase.from("users").select(USER_SELECT_FULL).eq("id", userId).maybeSingle();
  if (!full.error) return full.data;
  if (!isMissingColumnError(full.error)) throw new Error(full.error.message);
  const safe = await supabase.from("users").select(USER_SELECT_SAFE).eq("id", userId).maybeSingle();
  if (safe.error) throw new Error(safe.error.message);
  return safe.data;
}

async function loadDimaUsage(userId) {
  try {
    const { data: convos, error } = await supabase
      .from("dimaai_conversations")
      .select("id, updated_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(200);
    if (error) return { conversationCount: 0, messageCount: 0, lastUsedAt: null, unavailable: true };
    const rows = convos || [];
    const ids = rows.map((c) => c.id);
    let messageCount = 0;
    if (ids.length) {
      const msg = await supabase
        .from("dimaai_messages")
        .select("id", { count: "exact", head: true })
        .in("conversation_id", ids);
      if (!msg.error) messageCount = msg.count || 0;
    }
    return {
      conversationCount: rows.length,
      messageCount,
      lastUsedAt: rows[0]?.updated_at || null,
      unavailable: false,
    };
  } catch {
    return { conversationCount: 0, messageCount: 0, lastUsedAt: null, unavailable: true };
  }
}

async function buildDossier(userId, { io } = {}) {
  const user = await loadUserRow(userId);
  if (!user) {
    const err = new Error("User not found.");
    err.code = "NOT_FOUND";
    throw err;
  }

  pruneDeadPresence(state.presence, io);
  const presence = getPresenceEntry(state.presence, user.id);
  const banned = moderation.isBanned(user.id) || Boolean(user.is_banned);
  const timeout = moderation.getActiveTimeout(user.id);
  const lastSeen =
    state.userLastLoginAt.get(user.id) ||
    state.lastSeenByUserId.get(user.id) ||
    user.last_seen ||
    null;

  const [history, reports, ledger, sessions, dima] = await Promise.all([
    moderation.listHistory({ targetUserId: user.id, limit: 40 }).catch(() => []),
    reportsForUser(user.id, { limit: 40 }).catch(() => ({
      against: [],
      filed: [],
      openCount: 0,
      totalAgainst: 0,
    })),
    descoin.getLedger(user.id, { limit: 20 }).catch(() => []),
    listSessions(user.id).catch(() => []),
    loadDimaUsage(user.id),
  ]);

  const frozen = Boolean(user.descoin_frozen);
  const risk = scoreRisk({
    openReports: reports.openCount,
    totalReports: reports.totalAgainst,
    banned,
    timedOut: Boolean(timeout),
    suspiciousSignup: Boolean(user.suspicious_signup),
    historyCount: (history || []).length,
  });

  return {
    identity: {
      id: user.id,
      username: user.username,
      displayName: user.display_name || user.username,
      email: user.email || null,
      avatarUrl: user.avatar_url || presence?.avatar_url || null,
      isAdmin: Boolean(user.is_admin) || user.username === "admin",
      createdAt: user.created_at || user.signup_at || null,
      lastSeen,
      presence: presence
        ? { status: presence.status || "online", socketId: presence.socketId || null }
        : { status: "offline", socketId: null },
    },
    signup: {
      at: user.signup_at || user.created_at || null,
      authMethod: user.auth_method || null,
      firstSource: user.first_touch_source || null,
      lastSource: user.last_touch_source || null,
      campaign: user.first_touch_campaign || null,
      medium: user.first_touch_medium || null,
      term: user.first_touch_term || null,
      gclid: user.first_touch_gclid ? true : false,
      referrer: user.first_touch_referrer || null,
      landingPage: user.first_touch_landing_page || null,
      device: user.signup_device || null,
      browser: user.signup_browser || null,
      os: user.signup_os || null,
      country: user.signup_country || null,
      firstAppOpenedAt: user.first_app_opened_at || null,
      firstActionAt: user.first_action_at || null,
      firstMessageAt: user.first_message_at || null,
      suspicious: Boolean(user.suspicious_signup),
    },
    sessions: (sessions || []).map((s) => ({
      id: s.id,
      device: s.device || null,
      ip: s.ip || null,
      createdAt: s.createdAt || s.created_at || null,
      lastActiveAt: s.lastActiveAt || s.last_active_at || null,
    })),
    sockets: liveSockets(io, user.id),
    moderation: {
      banned,
      ban: banned
        ? {
            category: user.ban_category || null,
            reason: user.ban_reason || null,
            message: user.ban_message || null,
            bannedAt: user.banned_at || null,
            expiresAt: user.ban_expires_at || null,
          }
        : null,
      timeout: timeout || null,
      history: history || [],
    },
    reports,
    wallet: {
      balance: Number(user.descoin_balance) || 0,
      frozen,
      ledger: ledger || [],
    },
    dima,
    risk,
    generatedAt: new Date().toISOString(),
  };
}

module.exports = { buildDossier };
