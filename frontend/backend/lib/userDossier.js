"use strict";

/**
 * Assembles one admin "user file" from existing sources — identity, signup,
 * sessions, moderation, reports, wallet — without dump-style lists.
 */

const supabase = require("../db/supabase");
const state = require("../runtime/sharedState");
const moderation = require("./moderation");
const descoin = require("./descoin");
const { listSessions } = require("./sessions");
const { pruneDeadPresence, getPresenceEntry } = require("./presenceRoster");
const { reportsForUser } = require("./userReports");
const { isMissingColumnError } = require("./signupAttribution");
const dossierModel = require("./userDossierModel");
const sections = require("./userDossierSections");

// Optional profile columns (later migrations); a missing one only hides that line.
const USER_SELECT_EXTRA = "email_confirmed_at, birth_date, language, auth_provider, two_factor_enabled, totp_enabled_at, deletion_requested_at";

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

/** Session ids with a connected socket right now (socket.user.sid). */
function liveSessionIds(io, userId) {
  const out = new Set();
  try {
    const room = io?.sockets?.adapter?.rooms?.get(`user:${String(userId)}`);
    if (!room) return out;
    for (const socketId of room) {
      const sid = io.sockets.sockets.get(socketId)?.user?.sid;
      if (sid) out.add(sid);
    }
  } catch {
    /* no live view (tests) */
  }
  return out;
}

async function loadUserRow(userId) {
  const full = await supabase.from("users").select(USER_SELECT_FULL).eq("id", userId).maybeSingle();
  if (!full.error) return full.data;
  if (!isMissingColumnError(full.error)) throw new Error(full.error.message);
  const safe = await supabase.from("users").select(USER_SELECT_SAFE).eq("id", userId).maybeSingle();
  if (safe.error) throw new Error(safe.error.message);
  return safe.data;
}

async function loadExtraRow(userId) {
  const res = await sections.soft(() => supabase.from("users").select(USER_SELECT_EXTRA).eq("id", userId).maybeSingle());
  if (!res.error) return res.rows[0] || {};
  // One column missing: fall back to the ones every database has had for a while.
  const basic = await sections.soft(() => supabase.from("users").select("email_confirmed_at, birth_date, language").eq("id", userId).maybeSingle());
  return basic.rows[0] || {};
}

function count(build) {
  return sections.soft(build).then((r) => (typeof r.count === "number" ? r.count : null));
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

  const [history, reports, ledger, sessions, extra, linked, voice30d, subscription, notes, serverCount, groupCount] = await Promise.all([
    moderation.listHistory({ targetUserId: user.id, limit: 40 }).catch(() => []),
    reportsForUser(user.id, { limit: 40 }).catch(() => ({
      against: [],
      filed: [],
      openCount: 0,
      totalAgainst: 0,
    })),
    descoin.getLedger(user.id, { limit: 20 }).catch(() => []),
    listSessions(user.id).catch(() => []),
    loadExtraRow(user.id).catch(() => ({})),
    sections.loadLinked(user.id, { user }).catch(() => ({ accounts: [], bannedCount: 0, ready: false })),
    sections.voiceSeconds30d(user.id).catch(() => null),
    sections.loadSubscription(user.id).catch(() => ({ ready: false, current: null })),
    sections.listNotes(user.id, { limit: 50 }).catch(() => ({ ready: false, notes: [] })),
    count(() => supabase.from("server_members").select("server_id", { count: "exact", head: true }).eq("user_id", user.id)),
    count(() => supabase.from("group_members").select("group_id", { count: "exact", head: true }).eq("user_id", user.id)),
  ]);

  const frozen = Boolean(user.descoin_frozen);
  const createdAt = user.signup_at || user.created_at || null;
  const createdMs = Date.parse(createdAt || "");
  const accountAgeDays = Number.isFinite(createdMs) ? Math.max(0, (Date.now() - createdMs) / dossierModel.DAY_MS) : null;
  const risk = dossierModel.scoreDossierRisk({
    openReports: reports.openCount,
    totalReports: reports.totalAgainst,
    banned,
    timedOut: Boolean(timeout),
    suspiciousSignup: Boolean(user.suspicious_signup),
    historyCount: (history || []).length,
    linkedBanned: linked.bannedCount || 0,
    accountAgeDays,
  });
  const devices = new Set((sessions || []).map((s) => s?.deviceHash || s?.device || s?.id).filter(Boolean)).size;
  const birthYear = /^\d{4}/.test(String(extra.birth_date || "")) ? Number(String(extra.birth_date).slice(0, 4)) : null;

  return {
    identity: {
      id: user.id,
      username: user.username,
      displayName: user.display_name || user.username,
      email: user.email || null,
      avatarUrl: user.avatar_url || presence?.avatar_url || null,
      emailMasked: dossierModel.maskEmail(user.email),
      emailVerified: extra.email_confirmed_at ? true : extra.email_confirmed_at === null ? false : null,
      isAdmin: Boolean(user.is_admin) || user.username === "admin",
      isOwner: user.username === "admin",
      createdAt: user.created_at || user.signup_at || null,
      accountAgeDays: accountAgeDays == null ? null : Math.floor(accountAgeDays),
      birthYear,
      language: extra.language || null,
      authProvider: extra.auth_provider || null,
      twoFactor: Boolean(extra.two_factor_enabled || extra.totp_enabled_at),
      pendingDeletion: Boolean(extra.deletion_requested_at),
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
      ip: dossierModel.maskIp(s.ip),
      live: Boolean(s.id && liveSessionIds(io, user.id).has(s.id)),
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
    risk,
    linked: {
      count: linked.accounts.length,
      bannedCount: linked.bannedCount || 0,
      ready: Boolean(linked.ready),
      top: linked.accounts.slice(0, 3).map((a) => ({ id: a.id, username: a.username, banned: a.banned, kinds: a.kinds })),
    },
    subscription: subscription.current,
    notes: { ready: Boolean(notes.ready), count: notes.notes.length, latest: notes.notes.slice(0, 2) },
    stats: {
      openReports: reports.openCount || 0,
      devices,
      linked: linked.accounts.length,
      voiceSeconds30d: voice30d,
      descoin: Number(user.descoin_balance) || 0,
      servers: serverCount,
      groups: groupCount,
    },
    generatedAt: new Date().toISOString(),
  };
}

module.exports = { buildDossier };
