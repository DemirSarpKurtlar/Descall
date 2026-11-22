"use strict";

const supabase = require("../db/supabase");
const state = require("../runtime/sharedState");

/** Rich reason taxonomy for bans/timeouts — keys are stable API ids. */
const MOD_CATEGORIES = [
  { id: "harassment", label: "Harassment / Bullying", group: "safety" },
  { id: "hate_speech", label: "Hate Speech", group: "safety" },
  { id: "threats", label: "Threats / Violence", group: "safety" },
  { id: "self_harm", label: "Self-Harm Content", group: "safety" },
  { id: "child_safety", label: "Child Safety", group: "safety" },
  { id: "extremism", label: "Extremism", group: "safety" },
  { id: "spam", label: "Spam", group: "abuse" },
  { id: "scam", label: "Scam / Phishing", group: "abuse" },
  { id: "fraud", label: "Fraud", group: "abuse" },
  { id: "malware", label: "Malware / Malicious Links", group: "abuse" },
  { id: "advertising", label: "Unauthorized Advertising", group: "abuse" },
  { id: "raid", label: "Raid / Coordinated Attack", group: "abuse" },
  { id: "impersonation", label: "Impersonation", group: "identity" },
  { id: "multi_account", label: "Multiple Accounts Abuse", group: "identity" },
  { id: "ban_evasion", label: "Ban Evasion", group: "identity" },
  { id: "underage", label: "Underage User", group: "identity" },
  { id: "nsfw", label: "NSFW / Sexual Content", group: "content" },
  { id: "illegal", label: "Illegal Content", group: "content" },
  { id: "doxxing", label: "Doxxing / Privacy Violation", group: "content" },
  { id: "copyright", label: "Copyright Infringement", group: "content" },
  { id: "language", label: "Abusive Language", group: "content" },
  { id: "voice_abuse", label: "Voice Chat Abuse", group: "platform" },
  { id: "screenshare_abuse", label: "Screen Share Abuse", group: "platform" },
  { id: "feature_abuse", label: "Feature Abuse", group: "platform" },
  { id: "report_abuse", label: "False Reports / Report Abuse", group: "platform" },
  { id: "disruptive", label: "Disruptive Behavior", group: "community" },
  { id: "tos", label: "Terms of Service Violation", group: "community" },
  { id: "guidelines", label: "Community Guidelines Violation", group: "community" },
  { id: "suspicious", label: "Suspicious Activity", group: "community" },
  { id: "other", label: "Other", group: "other" },
];

const CATEGORY_IDS = new Set(MOD_CATEGORIES.map((c) => c.id));

const TIMEOUT_PRESETS = [
  { id: "5m", label: "5 minutes", seconds: 5 * 60 },
  { id: "15m", label: "15 minutes", seconds: 15 * 60 },
  { id: "30m", label: "30 minutes", seconds: 30 * 60 },
  { id: "1h", label: "1 hour", seconds: 60 * 60 },
  { id: "6h", label: "6 hours", seconds: 6 * 60 * 60 },
  { id: "12h", label: "12 hours", seconds: 12 * 60 * 60 },
  { id: "24h", label: "24 hours", seconds: 24 * 60 * 60 },
  { id: "3d", label: "3 days", seconds: 3 * 24 * 60 * 60 },
  { id: "7d", label: "7 days", seconds: 7 * 24 * 60 * 60 },
  { id: "14d", label: "14 days", seconds: 14 * 24 * 60 * 60 },
  { id: "30d", label: "30 days", seconds: 30 * 24 * 60 * 60 },
];

const BAN_PRESETS = [
  { id: "permanent", label: "Permanent", seconds: null },
  { id: "24h", label: "24 hours", seconds: 24 * 60 * 60 },
  { id: "3d", label: "3 days", seconds: 3 * 24 * 60 * 60 },
  { id: "7d", label: "7 days", seconds: 7 * 24 * 60 * 60 },
  { id: "30d", label: "30 days", seconds: 30 * 24 * 60 * 60 },
  { id: "90d", label: "90 days", seconds: 90 * 24 * 60 * 60 },
  { id: "365d", label: "1 year", seconds: 365 * 24 * 60 * 60 },
];

function categoryLabel(id) {
  return MOD_CATEGORIES.find((c) => c.id === id)?.label || id || "Other";
}

function normalizeCategory(category, otherText) {
  const id = String(category || "other").trim();
  if (!CATEGORY_IDS.has(id)) return { category: "other", reason: String(otherText || category || "Other").trim() };
  if (id === "other") {
    const reason = String(otherText || "").trim();
    return { category: "other", reason: reason || "Other" };
  }
  return { category: id, reason: categoryLabel(id) };
}

function resolveDurationSeconds({ durationSeconds, presetId, presets }) {
  if (durationSeconds != null && Number.isFinite(Number(durationSeconds))) {
    const n = Math.floor(Number(durationSeconds));
    if (n > 0) return n;
  }
  if (presetId === "permanent" || presetId === "perm") return null;
  const preset = (presets || []).find((p) => p.id === presetId);
  if (preset) return preset.seconds;
  return null;
}

function expiresFromSeconds(seconds) {
  if (seconds == null) return null;
  return new Date(Date.now() + seconds * 1000).toISOString();
}

function publicBanPayload(row) {
  if (!row?.is_banned) return null;
  if (row.ban_expires_at && new Date(row.ban_expires_at).getTime() <= Date.now()) return null;
  return {
    banned: true,
    category: row.ban_category || "other",
    categoryLabel: categoryLabel(row.ban_category),
    reason: row.ban_reason || null,
    message: row.ban_message || null,
    bannedAt: row.banned_at || null,
    expiresAt: row.ban_expires_at || null,
  };
}

function publicTimeoutPayload(entryOrRow) {
  if (!entryOrRow) return null;
  const until = entryOrRow.until || entryOrRow.timeout_until;
  if (!until || new Date(until).getTime() <= Date.now()) return null;
  return {
    timedOut: true,
    category: entryOrRow.category || entryOrRow.timeout_category || "other",
    categoryLabel: categoryLabel(entryOrRow.category || entryOrRow.timeout_category),
    reason: entryOrRow.reason || entryOrRow.timeout_reason || null,
    message: entryOrRow.message || entryOrRow.timeout_message || null,
    until,
    timedOutAt: entryOrRow.timedOutAt || entryOrRow.timed_out_at || null,
  };
}

function getActiveTimeout(userId) {
  const entry = state.timedOutUsers.get(String(userId));
  if (!entry) return null;
  if (new Date(entry.until).getTime() <= Date.now()) {
    state.timedOutUsers.delete(String(userId));
    clearTimeoutInDb(userId).catch(() => {});
    return null;
  }
  return publicTimeoutPayload(entry);
}

function isTimedOut(userId) {
  return Boolean(getActiveTimeout(userId));
}

function isBanned(userId) {
  return state.bannedUserIds.has(String(userId));
}

async function recordAction({
  actionType,
  targetUserId,
  actorUserId,
  category,
  reason,
  message,
  durationSeconds,
  expiresAt,
  meta = {},
}) {
  const { data, error } = await supabase
    .from("moderation_actions")
    .insert({
      action_type: actionType,
      target_user_id: targetUserId,
      actor_user_id: actorUserId || null,
      category: category || null,
      reason: reason || null,
      message: message || null,
      duration_seconds: durationSeconds ?? null,
      expires_at: expiresAt || null,
      meta,
    })
    .select("*")
    .single();
  if (error) {
    console.warn("[moderation] recordAction failed:", error.message);
    return null;
  }
  return data;
}

async function clearTimeoutInDb(userId) {
  await supabase
    .from("users")
    .update({
      timeout_until: null,
      timeout_category: null,
      timeout_reason: null,
      timeout_message: null,
      timed_out_at: null,
      timed_out_by: null,
    })
    .eq("id", userId);
}

async function applyBan({
  targetUserId,
  actorUserId,
  category,
  otherText,
  message,
  presetId,
  durationSeconds,
}) {
  const { category: cat, reason } = normalizeCategory(category, otherText);
  const seconds = resolveDurationSeconds({
    durationSeconds,
    presetId: presetId || "permanent",
    presets: BAN_PRESETS,
  });
  const expiresAt = expiresFromSeconds(seconds);
  const now = new Date().toISOString();
  const msg = String(message || "").trim() || null;

  const { error } = await supabase
    .from("users")
    .update({
      is_banned: true,
      ban_category: cat,
      ban_reason: reason,
      ban_message: msg,
      banned_at: now,
      banned_by: actorUserId || null,
      ban_expires_at: expiresAt,
      // Ban supersedes an active timeout
      timeout_until: null,
      timeout_category: null,
      timeout_reason: null,
      timeout_message: null,
      timed_out_at: null,
      timed_out_by: null,
    })
    .eq("id", targetUserId);

  if (error) throw new Error(error.message);

  const detail = {
    category: cat,
    reason,
    message: msg,
    bannedAt: now,
    expiresAt,
    bannedBy: actorUserId || null,
  };
  state.bannedUserIds.add(String(targetUserId));
  state.timedOutUsers.delete(String(targetUserId));
  state.banDetailsByUser.set(String(targetUserId), detail);
  noteLocalBanChange(targetUserId, detail);

  await recordAction({
    actionType: "ban",
    targetUserId,
    actorUserId,
    category: cat,
    reason,
    message: msg,
    durationSeconds: seconds,
    expiresAt,
  });

  return {
    ok: true,
    category: cat,
    reason,
    message: msg,
    expiresAt,
    durationSeconds: seconds,
  };
}

async function revokeBan({ targetUserId, actorUserId, note }) {
  const { error } = await supabase
    .from("users")
    .update({
      is_banned: false,
      ban_category: null,
      ban_reason: null,
      ban_message: null,
      banned_at: null,
      banned_by: null,
      ban_expires_at: null,
    })
    .eq("id", targetUserId);
  if (error) throw new Error(error.message);

  state.bannedUserIds.delete(String(targetUserId));
  state.banDetailsByUser.delete(String(targetUserId));
  noteLocalBanChange(targetUserId, null);
  forgetBanRevokedSessions(targetUserId);

  await recordAction({
    actionType: "unban",
    targetUserId,
    actorUserId,
    message: note || null,
  });

  return { ok: true };
}

async function applyTimeout({
  targetUserId,
  actorUserId,
  category,
  otherText,
  message,
  presetId,
  durationSeconds,
}) {
  const { category: cat, reason } = normalizeCategory(category, otherText);
  const seconds = resolveDurationSeconds({
    durationSeconds,
    presetId: presetId || "1h",
    presets: TIMEOUT_PRESETS,
  });
  if (!seconds || seconds < 60) {
    throw new Error("Timeout duration must be at least 60 seconds.");
  }
  const until = expiresFromSeconds(seconds);
  const now = new Date().toISOString();
  const msg = String(message || "").trim() || null;

  const { error } = await supabase
    .from("users")
    .update({
      timeout_until: until,
      timeout_category: cat,
      timeout_reason: reason,
      timeout_message: msg,
      timed_out_at: now,
      timed_out_by: actorUserId || null,
    })
    .eq("id", targetUserId);
  if (error) throw new Error(error.message);

  const entry = {
    until,
    category: cat,
    reason,
    message: msg,
    timedOutAt: now,
    actorId: actorUserId || null,
  };
  state.timedOutUsers.set(String(targetUserId), entry);

  await recordAction({
    actionType: "timeout",
    targetUserId,
    actorUserId,
    category: cat,
    reason,
    message: msg,
    durationSeconds: seconds,
    expiresAt: until,
  });

  return {
    ok: true,
    ...publicTimeoutPayload(entry),
    durationSeconds: seconds,
  };
}

async function revokeTimeout({ targetUserId, actorUserId, note }) {
  await clearTimeoutInDb(targetUserId);
  state.timedOutUsers.delete(String(targetUserId));
  await recordAction({
    actionType: "untimeout",
    targetUserId,
    actorUserId,
    message: note || null,
  });
  return { ok: true };
}

/* ---------------- ban state sync ---------------- */

const SYNC_INTERVAL_MS = 60 * 1000;
const PAGE_SIZE = 1000;
const sync = {
  loadedOnce: false,
  lastLoadAt: 0,
  timer: null,
  retryTimer: null,
  retryDelayMs: 0,
  running: null,
  // Bans / unbans made by this process while a reload is in flight: a reload that
  // started before the change must not undo it.
  localChanges: new Map(),
};

function withoutReplication(fn) {
  try {
    return require("./cluster").withoutReplication(fn);
  } catch {
    return fn();
  }
}

/** A ban / unban made on another node (lib/cluster/sharedStore.js): a reload must not undo it. */
function noteRemoteBanChange(userId, detail) {
  noteLocalBanChange(userId, detail);
}

function noteLocalBanChange(userId, detail) {
  sync.localChanges.set(String(userId), { at: Date.now(), detail });
  if (sync.localChanges.size > 2000) {
    const cutoff = Date.now() - 10 * SYNC_INTERVAL_MS;
    for (const [id, c] of sync.localChanges) if (c.at < cutoff) sync.localChanges.delete(id);
  }
}

/**
 * Sessions the ban signed out (revokeSessions). Their tokens still get the ban
 * screen (with a ticket) instead of a silent sign-out. In memory only: after a
 * restart those tokens answer 401 and the user sees the ban at the next sign-in.
 */
const banRevokedSessions = new Map(); // userId -> Set(sid)

function noteBanRevokedSessions(userId, sessionIds) {
  const ids = (sessionIds || []).filter(Boolean).map(String);
  if (!ids.length) return;
  const key = String(userId);
  const set = banRevokedSessions.get(key) || new Set();
  for (const id of ids) set.add(id);
  banRevokedSessions.set(key, set);
}

function wasRevokedByBan(userId, sid) {
  if (!sid) return false;
  return Boolean(banRevokedSessions.get(String(userId))?.has(String(sid)));
}

function forgetBanRevokedSessions(userId) {
  banRevokedSessions.delete(String(userId));
}

/** Active ban detail from memory ({ category, reason, message, bannedAt, expiresAt, bannedBy }) or null. */
function activeBanDetail(userId) {
  const id = String(userId);
  if (!state.bannedUserIds.has(id)) return null;
  const detail = state.banDetailsByUser.get(id) || {};
  if (detail.expiresAt && new Date(detail.expiresAt).getTime() <= Date.now()) {
    state.bannedUserIds.delete(id);
    state.banDetailsByUser.delete(id);
    return null;
  }
  return detail;
}

/** Every row of a select, read in pages of 1000 (PostgREST caps a single read). */
async function selectAllPages(build, pageSize = PAGE_SIZE) {
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await build().range(from, from + pageSize - 1);
    if (error) throw new Error(error.message || String(error));
    const page = data || [];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

function banDetailFromRow(row) {
  return {
    category: row.ban_category || "other",
    reason: row.ban_reason || null,
    message: row.ban_message || null,
    bannedAt: row.banned_at || null,
    expiresAt: row.ban_expires_at || null,
    bannedBy: row.banned_by || null,
  };
}

const BAN_SELECT = "id, ban_category, ban_reason, ban_message, banned_at, banned_by, ban_expires_at";

/**
 * Load bans and timeouts from the database into memory. Throws when the ban
 * list could not be read; the in-memory state is then left as it was (never
 * cleared), so a failing reload does not lift every ban.
 */
async function reloadModerationState() {
  const startedAt = Date.now();
  const nowIso = new Date(startedAt).toISOString();

  // Expire temporary bans whose clock has elapsed (best effort).
  try {
    await supabase
      .from("users")
      .update({
        is_banned: false,
        ban_category: null,
        ban_reason: null,
        ban_message: null,
        banned_at: null,
        banned_by: null,
        ban_expires_at: null,
      })
      .eq("is_banned", true)
      .not("ban_expires_at", "is", null)
      .lte("ban_expires_at", nowIso);
  } catch (e) {
    console.warn("[moderation] expire bans:", e?.message || e);
  }

  const banned = await selectAllPages(() =>
    supabase.from("users").select(BAN_SELECT).eq("is_banned", true).order("id", { ascending: true })
  );

  const nextIds = new Set();
  const nextDetails = new Map();
  for (const row of banned) {
    if (row.ban_expires_at && new Date(row.ban_expires_at).getTime() <= startedAt) continue;
    const id = String(row.id);
    nextIds.add(id);
    nextDetails.set(id, banDetailFromRow(row));
  }
  // Changes this process made after the read started win over the read.
  for (const [id, change] of sync.localChanges) {
    if (change.at < startedAt - 1000) continue;
    if (change.detail) {
      nextIds.add(id);
      nextDetails.set(id, change.detail);
    } else {
      nextIds.delete(id);
      nextDetails.delete(id);
    }
  }
  // Every node reloads from the database itself: this bulk rewrite is not replicated
  // (lib/cluster; a no-op wrapper on a single node). Single changes above are.
  withoutReplication(() => {
    state.bannedUserIds.clear();
    state.banDetailsByUser.clear();
    for (const id of nextIds) state.bannedUserIds.add(id);
    for (const [id, d] of nextDetails) state.banDetailsByUser.set(id, d);
  });
  for (const id of [...banRevokedSessions.keys()]) if (!nextIds.has(id)) banRevokedSessions.delete(id);

  // Timeouts: same rule, a failed read keeps the current map.
  try {
    await supabase
      .from("users")
      .update({
        timeout_until: null,
        timeout_category: null,
        timeout_reason: null,
        timeout_message: null,
        timed_out_at: null,
        timed_out_by: null,
      })
      .not("timeout_until", "is", null)
      .lte("timeout_until", nowIso);
  } catch (e) {
    console.warn("[moderation] expire timeouts:", e?.message || e);
  }
  try {
    const timed = await selectAllPages(() =>
      supabase
        .from("users")
        .select("id, timeout_until, timeout_category, timeout_reason, timeout_message, timed_out_at, timed_out_by")
        .not("timeout_until", "is", null)
        .gt("timeout_until", nowIso)
        .order("id", { ascending: true })
    );
    withoutReplication(() => {
      state.timedOutUsers.clear();
      for (const row of timed) {
        state.timedOutUsers.set(String(row.id), {
          until: row.timeout_until,
          category: row.timeout_category || "other",
          reason: row.timeout_reason || null,
          message: row.timeout_message || null,
          timedOutAt: row.timed_out_at || null,
          actorId: row.timed_out_by || null,
        });
      }
    });
  } catch (e) {
    console.warn("[moderation] load timeouts (kept previous):", e?.message || e);
  }

  sync.loadedOnce = true;
  sync.lastLoadAt = Date.now();
  for (const [id, change] of sync.localChanges) if (change.at < startedAt - 1000) sync.localChanges.delete(id);
  return { bans: state.bannedUserIds.size, timeouts: state.timedOutUsers.size };
}

/**
 * Load bans now. Never throws; resolves true on success. A failure before the
 * first successful load is logged loudly and retried with backoff (5 s,
 * doubling to 60 s) until one succeeds; a later failure keeps the last good state.
 */
async function loadModerationStateFromDb() {
  if (sync.running) return sync.running;
  sync.running = (async () => {
    try {
      const counts = await reloadModerationState();
      sync.retryDelayMs = 0;
      if (!sync.loggedLoad) {
        sync.loggedLoad = true;
        console.log(`[moderation] Loaded bans=${counts.bans} timeouts=${counts.timeouts}`);
      }
      return true;
    } catch (e) {
      if (!sync.loadedOnce) {
        sync.retryDelayMs = Math.min(60 * 1000, sync.retryDelayMs ? sync.retryDelayMs * 2 : 5000);
        console.error(
          `[moderation] CRITICAL: could not load account bans (${e?.message || e}). ` +
            `Banned accounts are NOT enforced until this succeeds. Retrying in ${sync.retryDelayMs / 1000}s.`
        );
        if (!sync.retryTimer) {
          sync.retryTimer = setTimeout(() => {
            sync.retryTimer = null;
            loadModerationStateFromDb();
          }, sync.retryDelayMs);
          sync.retryTimer.unref?.();
        }
      } else {
        console.warn("[moderation] ban reload failed, keeping the last good state:", e?.message || e);
      }
      return false;
    } finally {
      sync.running = null;
    }
  })();
  return sync.running;
}

/** First load now, then a reload every 60 s (bans made on other instances, expiries). */
async function startModerationSync({ intervalMs = SYNC_INTERVAL_MS } = {}) {
  const ok = await loadModerationStateFromDb();
  if (!sync.timer) {
    sync.timer = setInterval(() => {
      loadModerationStateFromDb();
    }, intervalMs);
    sync.timer.unref?.();
  }
  return ok;
}

function stopModerationSync() {
  if (sync.timer) clearInterval(sync.timer);
  if (sync.retryTimer) clearTimeout(sync.retryTimer);
  sync.timer = null;
  sync.retryTimer = null;
}

function syncStatus() {
  return { loadedOnce: sync.loadedOnce, lastLoadAt: sync.lastLoadAt, retryDelayMs: sync.retryDelayMs };
}

function __resetSyncForTests() {
  stopModerationSync();
  sync.loadedOnce = false;
  sync.loggedLoad = false;
  sync.lastLoadAt = 0;
  sync.retryDelayMs = 0;
  sync.running = null;
  sync.localChanges.clear();
  banRevokedSessions.clear();
}

async function listActiveSanctions() {
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const banCols =
    "id, username, avatar_url, display_name, is_banned, ban_category, ban_reason, ban_message, banned_at, ban_expires_at";
  const timeoutCols =
    "id, username, avatar_url, display_name, timeout_until, timeout_category, timeout_reason, timeout_message, timed_out_at, timed_out_by";

  let [banRes, timeoutRes] = await Promise.all([
    supabase
      .from("users")
      .select(banCols)
      .eq("is_banned", true)
      .or("ban_expires_at.is.null,ban_expires_at.gt.\"" + nowIso + "\"")
      .limit(500),
    supabase
      .from("users")
      .select(timeoutCols)
      .not("timeout_until", "is", null)
      .gt("timeout_until", nowIso)
      .limit(500),
  ]);

  if (banRes.error) {
    console.warn("[moderation] list bans:", banRes.error.message);
    banRes = await supabase
      .from("users")
      .select("id, username, avatar_url, display_name, is_banned")
      .eq("is_banned", true)
      .limit(500);
  }
  if (timeoutRes.error) {
    console.warn("[moderation] list timeouts:", timeoutRes.error.message);
    timeoutRes = { data: [] };
  }

  const bans = [];
  for (const row of banRes.data || []) {
    if (row.ban_expires_at && new Date(row.ban_expires_at).getTime() <= now) continue;
    bans.push({
      userId: row.id,
      type: "ban",
      category: row.ban_category || "other",
      categoryLabel: categoryLabel(row.ban_category),
      reason: row.ban_reason || null,
      message: row.ban_message || null,
      bannedAt: row.banned_at || null,
      expiresAt: row.ban_expires_at || null,
      username: row.username || state.usernameById.get(row.id) || String(row.id).slice(0, 8),
      avatarUrl: row.avatar_url || null,
      displayName: row.display_name || null,
    });
  }

  const timeouts = [];
  for (const row of timeoutRes.data || []) {
    const payload = publicTimeoutPayload(row);
    if (!payload) continue;
    timeouts.push({
      userId: row.id,
      type: "timeout",
      ...payload,
      username: row.username || state.usernameById.get(row.id) || String(row.id).slice(0, 8),
      avatarUrl: row.avatar_url || null,
      displayName: row.display_name || null,
    });
  }

  return { bans, timeouts };
}

async function listHistory({ limit = 50, targetUserId } = {}) {
  let q = supabase
    .from("moderation_actions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(Math.min(200, Math.max(1, limit)));
  if (targetUserId) q = q.eq("target_user_id", targetUserId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const rows = data || [];
  const userIds = [
    ...new Set(rows.flatMap((r) => [r.target_user_id, r.actor_user_id].filter(Boolean))),
  ];
  let usersById = {};
  if (userIds.length) {
    const { data: users } = await supabase
      .from("users")
      .select("id, username, avatar_url")
      .in("id", userIds);
    for (const u of users || []) usersById[u.id] = u;
  }
  return rows.map((r) => ({
    ...r,
    categoryLabel: categoryLabel(r.category),
    targetUsername: usersById[r.target_user_id]?.username || null,
    actorUsername: usersById[r.actor_user_id]?.username || null,
  }));
}

async function fetchUserBanRow(userId) {
  const { data } = await supabase
    .from("users")
    .select(
      "id, username, is_banned, ban_category, ban_reason, ban_message, banned_at, ban_expires_at, timeout_until, timeout_category, timeout_reason, timeout_message, timed_out_at"
    )
    .eq("id", userId)
    .maybeSingle();
  return data;
}

module.exports = {
  MOD_CATEGORIES,
  TIMEOUT_PRESETS,
  BAN_PRESETS,
  categoryLabel,
  normalizeCategory,
  publicBanPayload,
  publicTimeoutPayload,
  getActiveTimeout,
  isTimedOut,
  isBanned,
  applyBan,
  revokeBan,
  applyTimeout,
  revokeTimeout,
  loadModerationStateFromDb,
  reloadModerationState,
  startModerationSync,
  stopModerationSync,
  syncStatus,
  activeBanDetail,
  noteBanRevokedSessions,
  wasRevokedByBan,
  forgetBanRevokedSessions,
  __resetSyncForTests,
  listActiveSanctions,
  listHistory,
  fetchUserBanRow,
  recordAction,
  noteRemoteBanChange,
};
