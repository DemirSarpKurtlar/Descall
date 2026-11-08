"use strict";

/**
 * Re-engagement (item 4): bring people back without spamming them.
 *
 *  1. onVoiceJoin: "<friend> is in voice in <server>" push to accepted friends who
 *     are away (offline or idle), can see + connect to that channel, did not mute
 *     the server / channel / the friend's DM, are not on Do Not Disturb, kept the
 *     "Friend is in voice" switch on, and are outside 23:00-09:00 local time.
 *     At most one per recipient per 6 h and three per 24 h.
 *  2. onFriendRequest / onServerInviteDm: email fallback (the push already exists)
 *     when the recipient is offline and has no push device or was not seen for a
 *     day; at most one per kind per recipient per Istanbul day.
 *  3. runLifecycle (scheduler, every 15-60 min): day 3 and day 7 emails to new
 *     accounts that were not active again after their sign-up day, with a verified
 *     email, a confirmed product-update opt-in (marketing_subscribers) and no
 *     unsubscribe.
 *
 * Every send is claimed first in lifecycle_messages (unique user_id + kind), so a
 * restart or a second instance never sends twice. Rules: lib/reengagePolicy.js.
 *
 * Switches: REENGAGE_ENABLED=1 (default off), REENGAGE_DRY_RUN=1 (log only, writes
 * nothing), REENGAGE_FEATURES (subset of friend_voice,activity_email,lifecycle),
 * REENGAGE_TICK_MINUTES (15-60, default 30), REENGAGE_MAX_EMAILS_PER_TICK (default 50).
 * Before supabase/migrations/20261111_reengagement.sql runs nothing is sent in live
 * mode (no sent markers, no opt-out columns); dry-run still logs.
 */

const P = require("./reengagePolicy");
const { buildReengageEmail } = require("./reengageEmail");

const TABLE = "lifecycle_messages";
const DAY_MS = 24 * 60 * 60 * 1000;
const JOIN_COOLDOWN_MS = 15 * 60 * 1000;
const MAX_FRIENDS = 500;
const MAX_VOICE_CANDIDATES = 100;
const CHUNK = 150;

const BASE_COLS = [
  "id",
  "username",
  "display_name",
  "email",
  "email_confirmed_at",
  "language",
  "timezone",
  "created_at",
  "last_seen",
  "presence_status",
  "blocked_users",
  "is_banned",
  "deleted_at",
  "deletion_requested_at",
];
const NEW_COLS = ["notify_friend_voice", "email_notify_opt_out_at"];
const MIN_COLS = ["id", "username", "email", "language", "timezone", "created_at", "last_seen", "presence_status", "blocked_users"];

function errText(error) {
  return `${error?.message || ""} ${error?.details || ""} ${error?.hint || ""}`;
}
function isMissingTableErr(error, table) {
  if (!error) return false;
  const code = String(error.code || "");
  const text = errText(error);
  return (code === "42P01" || code === "PGRST205" || /relation|table|schema cache/i.test(text)) && text.includes(table);
}
function isMissingColumnErr(error) {
  if (!error) return false;
  const code = String(error.code || "");
  return code === "42703" || code === "PGRST204" || /column .* does not exist|could not find the .* column/i.test(errText(error));
}
function isUniqueViolation(error) {
  return String(error?.code || "") === "23505" || /duplicate key|unique constraint/i.test(errText(error));
}

function chunks(list, size = CHUNK) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

function createReengage(deps = {}) {
  const getDb = deps.getDb || (() => require("../db/supabase"));
  const getEnv = deps.env ? () => deps.env : () => process.env;
  const now = deps.now || (() => Date.now());
  const log = deps.log || console;
  const getState = deps.state ? () => deps.state : () => require("../runtime/sharedState");
  const getPush = deps.push ? () => deps.push : () => require("./webPush");
  const sendEmail = deps.sendEmail || ((msg) => require("./mailer").sendEmail(msg));
  const channelBits =
    deps.channelBits ||
    ((db, serverId, channelId, ids) => require("./serverPermissions").resolveChannelPermissionsBulk(db, serverId, channelId, ids));
  const canJoinBits =
    deps.canJoinBits ||
    ((bits) => {
      const { hasPermission, Permissions } = require("./serverPermissions");
      return hasPermission(bits, Permissions.VIEW_CHANNEL) && hasPermission(bits, Permissions.CONNECT);
    });
  const dmMuted = deps.dmMuted || ((uid, peer) => require("./dmConversationPrefs").isMuted(uid, peer));
  const dmLevel = deps.dmLevel || ((uid, peer) => require("./notifyPrefs").levelFor(uid, "dm", peer));

  let tableMissing = false;
  let columnsMissing = false;
  let warnedTable = false;
  let lifecycleRunning = false;
  let timer = null;
  const dryRunSeen = new Set();
  const joinCooldown = new Map();

  const mode = () => P.mode(getEnv());
  const on = (feature) => mode() !== "off" && P.featureOn(feature, getEnv());
  const emailConfigured = () => Boolean(getEnv().RESEND_API_KEY);

  function warnNotReady() {
    if (warnedTable) return;
    warnedTable = true;
    log.warn("[reengage] lifecycle_messages or the users opt-out columns are missing (20261111_reengagement.sql); live sends are skipped");
  }

  /** Live mode needs the sent markers and the opt-out columns; dry-run does not. */
  function liveReady() {
    if (mode() !== "live") return true;
    if (tableMissing || columnsMissing) {
      warnNotReady();
      return false;
    }
    return true;
  }

  /** users rows for `part`; optional columns that are missing are dropped one by one. */
  async function selectUsers(part) {
    let cols = columnsMissing ? [...BASE_COLS] : [...BASE_COLS, ...NEW_COLS];
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const { data, error } = await getDb().from("users").select(cols.join(", ")).in("id", part);
      if (!error) return data || [];
      if (!isMissingColumnErr(error)) {
        log.warn("[reengage] user load failed:", error.message);
        return [];
      }
      const text = errText(error);
      if (NEW_COLS.some((c) => text.includes(c))) {
        // Migration not applied: opt-outs can't be stored, so live sends stop (liveReady).
        columnsMissing = true;
        cols = cols.filter((c) => !NEW_COLS.includes(c));
        continue;
      }
      const bad = cols.find((c) => !MIN_COLS.includes(c) && !NEW_COLS.includes(c) && text.includes(c));
      cols = bad ? cols.filter((c) => c !== bad) : cols.filter((c) => MIN_COLS.includes(c) || NEW_COLS.includes(c));
    }
    return [];
  }

  async function loadUsers(ids) {
    const out = new Map();
    const list = [...new Set((ids || []).filter(Boolean).map(String))];
    for (const part of chunks(list)) {
      for (const row of await selectUsers(part)) out.set(String(row.id), row);
    }
    return out;
  }

  async function usersWithPushTargets(ids) {
    const list = [...new Set((ids || []).filter(Boolean).map(String))];
    const out = new Set();
    for (const part of chunks(list)) {
      const [web, dev] = await Promise.all([
        getDb().from("web_push_subscriptions").select("user_id").in("user_id", part),
        getDb().from("device_push_tokens").select("user_id, platform").in("user_id", part),
      ]);
      for (const r of web?.data || []) out.add(String(r.user_id));
      for (const r of dev?.data || []) if (r.platform !== "ios_voip") out.add(String(r.user_id));
    }
    return out;
  }

  /** "claimed" | "dry_run" | "exists" | "unavailable" */
  async function claim(userId, kind, channel, meta = {}) {
    const key = `${userId}|${kind}`;
    if (mode() === "dry_run") {
      if (dryRunSeen.has(key)) return "exists";
      dryRunSeen.add(key);
      if (dryRunSeen.size > 20000) dryRunSeen.clear();
      return "dry_run";
    }
    if (tableMissing) return "unavailable";
    const { error } = await getDb()
      .from(TABLE)
      .insert({ user_id: userId, kind, channel, status: "claimed", meta, sent_at: new Date(now()).toISOString() });
    if (!error) return "claimed";
    if (isUniqueViolation(error)) return "exists";
    if (isMissingTableErr(error, TABLE)) {
      tableMissing = true;
      warnNotReady();
    } else log.warn("[reengage] claim failed:", error.message);
    return "unavailable";
  }

  async function mark(userId, kind, status) {
    if (mode() !== "live") return;
    const { error } = await getDb().from(TABLE).update({ status }).eq("user_id", userId).eq("kind", kind);
    if (error) log.warn("[reengage] status update failed:", error.message);
  }

  /** Map userId -> [sent_at] of friend-in-voice pushes in the last 24 h. */
  async function friendVoiceHistory(ids) {
    const out = new Map();
    if (tableMissing) return out;
    const since = new Date(now() - DAY_MS).toISOString();
    for (const part of chunks(ids)) {
      const { data, error } = await getDb()
        .from(TABLE)
        .select("user_id, sent_at")
        .in("user_id", part)
        .like("kind", "friend_voice:%")
        .gte("sent_at", since);
      if (error) {
        if (isMissingTableErr(error, TABLE)) tableMissing = true;
        // Unknown history: treat as "just sent" so nobody is pushed twice.
        for (const id of part) out.set(id, [now()]);
        continue;
      }
      for (const r of data || []) {
        const id = String(r.user_id);
        if (!out.has(id)) out.set(id, []);
        out.get(id).push(r.sent_at);
      }
    }
    return out;
  }

  function dryLog(what, userId, extra = {}) {
    const line = `[reengage] dry-run: would send ${what} to user ${userId}`;
    (log.info || log.log).call(log, line, JSON.stringify(extra));
  }

  /* ---- 1. friend is in voice ---------------------------------------------- */

  async function onVoiceJoin({ joinerId, serverId, channelId, channelName, channelType } = {}) {
    const result = { sent: 0, considered: 0, skipped: null, reasons: {} };
    try {
      if (!on("friend_voice")) return { ...result, skipped: "off" };
      if (!joinerId || !serverId || !channelId) return { ...result, skipped: "bad_input" };
      if (channelType && !["voice", "stage"].includes(channelType)) return { ...result, skipped: "not_voice" };
      if (!liveReady()) return { ...result, skipped: "not_ready" };
      const t = now();
      const coolKey = `${joinerId}|${channelId}`;
      if (t - (joinCooldown.get(coolKey) || 0) < JOIN_COOLDOWN_MS) return { ...result, skipped: "cooldown" };
      joinCooldown.set(coolKey, t);
      if (joinCooldown.size > 5000) joinCooldown.clear();

      const db = getDb();
      const joiner = String(joinerId);
      const { data: links, error: fErr } = await db
        .from("friendships")
        .select("user_id, friend_id")
        .eq("status", "accepted")
        .or(`user_id.eq.${joiner},friend_id.eq.${joiner}`)
        .limit(MAX_FRIENDS);
      if (fErr) throw fErr;
      const friendIds = [...new Set((links || []).map((r) => String(r.user_id) === joiner ? String(r.friend_id) : String(r.user_id)))].filter(
        (id) => id && id !== joiner
      );
      if (!friendIds.length) return { ...result, skipped: "no_friends" };

      const { presence, activeServerVoiceCalls } = getState();
      const inVoice = new Set();
      for (const call of activeServerVoiceCalls?.values?.() || []) {
        for (const uid of call?.participants?.keys?.() || []) inVoice.add(String(uid));
      }
      const presenceOf = (id) => presence?.get?.(id)?.status || (presence?.has?.(id) ? "online" : null);
      // Cheap filter first: only people who are away and not already in voice.
      let cands = friendIds.filter((id) => {
        const p = presenceOf(id);
        return (!p || p === "idle") && !inVoice.has(id);
      });
      if (!cands.length) return { ...result, skipped: "nobody_away" };
      cands = cands.slice(0, MAX_VOICE_CANDIDATES);

      const { data: members, error: mErr } = await db
        .from("server_members")
        .select("user_id, notification_level")
        .eq("server_id", serverId)
        .in("user_id", cands);
      if (mErr) throw mErr;
      const levelOf = new Map((members || []).map((r) => [String(r.user_id), r.notification_level || "all"]));
      cands = cands.filter((id) => levelOf.has(id));
      if (!cands.length) return { ...result, skipped: "no_members" };

      const [users, mutesRes, bits, pushTargets, history, serverRes] = await Promise.all([
        loadUsers([...cands, joiner]),
        db.from("server_channel_mutes").select("user_id").eq("channel_id", channelId).in("user_id", cands),
        channelBits(db, serverId, channelId, cands),
        usersWithPushTargets(cands),
        friendVoiceHistory(cands),
        db.from("servers").select("id, name").eq("id", serverId).maybeSingle(),
      ]);
      if (!liveReady()) return { ...result, skipped: "not_ready" };
      const muted = new Set((mutesRes?.data || []).map((r) => String(r.user_id)));
      const joinerRow = users.get(joiner) || {};
      const joinerBlocks = new Set(Array.isArray(joinerRow.blocked_users) ? joinerRow.blocked_users.map(String) : []);
      const friendName = joinerRow.display_name || joinerRow.username || null;
      const serverName = serverRes?.data?.name || null;

      const eligible = [];
      for (const id of cands) {
        const u = users.get(id);
        if (!u) continue;
        result.considered += 1;
        const [muteDm, level] = await Promise.all([
          Promise.resolve(dmMuted(id, joiner)).catch(() => false),
          Promise.resolve(dmLevel(id, joiner)).catch(() => "all"),
        ]);
        const verdict = P.friendVoiceEligible(
          {
            presence: presenceOf(id),
            inVoice: inVoice.has(id),
            storedStatus: u.presence_status,
            optIn: u.notify_friend_voice !== false,
            banned: Boolean(u.is_banned),
            deleted: Boolean(u.deleted_at || u.deletion_requested_at),
            blocksJoiner: Array.isArray(u.blocked_users) && u.blocked_users.map(String).includes(joiner),
            joinerBlocks: joinerBlocks.has(id),
            canJoin: canJoinBits(bits?.get?.(id) ?? 0n),
            serverLevel: levelOf.get(id),
            channelMuted: muted.has(id),
            dmMuted: Boolean(muteDm),
            dmLevel: level,
            hasPushTarget: pushTargets.has(id),
            timezone: u.timezone,
            sentAt: history.get(id) || [],
          },
          t
        );
        if (verdict.ok) eligible.push(id);
        else result.reasons[verdict.reason] = (result.reasons[verdict.reason] || 0) + 1;
      }
      if (!eligible.length) return result;

      const kind = P.friendVoiceKind(t);
      const meta = { serverId, channelId, fromId: joiner };
      const toSend = [];
      for (const id of eligible) {
        const c = await claim(id, kind, "push", meta);
        if (c === "claimed") toSend.push(id);
        else if (c === "dry_run") dryLog("friend_voice push", id, { serverId, channelId, fromId: joiner });
      }
      if (!toSend.length) return result;
      await getPush().sendFriendVoicePush(toSend, {
        friendId: joiner,
        friendName,
        serverId,
        serverName,
        channelId,
        channelName,
      });
      await Promise.all(toSend.map((id) => mark(id, kind, "sent")));
      result.sent = toSend.length;
      return result;
    } catch (err) {
      log.warn("[reengage] friend voice push skipped:", err?.message || err);
      return { ...result, skipped: "error" };
    }
  }

  /* ---- 2. friend request / server invite email fallback ------------------- */

  async function activityEmail(kindBase, emailKind, { toUserId, fromId, fromName, server, inviteCode }) {
    const to = String(toUserId || "");
    if (!to) return { sent: false, reason: "bad_input" };
    const { presence } = getState();
    const online = Boolean(presence?.has?.(to));
    if (online) return { sent: false, reason: "online" };
    if (mode() === "live" && !emailConfigured()) return { sent: false, reason: "email_off" };
    const users = await loadUsers([to]);
    if (!liveReady()) return { sent: false, reason: "not_ready" };
    const u = users.get(to);
    if (!u) return { sent: false, reason: "no_user" };
    if (fromId && Array.isArray(u.blocked_users) && u.blocked_users.map(String).includes(String(fromId))) {
      return { sent: false, reason: "blocked" };
    }
    const t = now();
    const hasPushTarget = (await usersWithPushTargets([to])).has(to);
    const verdict = P.activityEmailEligible(u, { online, hasPushTarget, alreadySentToday: false }, t);
    if (!verdict.ok) return { sent: false, reason: verdict.reason };
    const kind = P.dailyKind(kindBase, t);
    const c = await claim(to, kind, "email", { fromId: fromId || null });
    if (c === "exists") return { sent: false, reason: "already_sent" };
    if (c === "unavailable") return { sent: false, reason: "not_ready" };
    const mail = buildReengageEmail({
      kind: emailKind,
      lang: u.language,
      origin: P.publicOrigin(getEnv()),
      username: u.username,
      from: fromName,
      server,
      inviteCode,
      unsubUrl: P.unsubscribeUrl(to, "activity", getEnv()),
    });
    if (c === "dry_run") {
      dryLog(`${kindBase}`, to, { lang: mail.lang });
      return { sent: false, reason: "dry_run" };
    }
    try {
      const res = await sendEmail({ to: u.email, subject: mail.subject, text: mail.text, html: mail.html, headers: mail.headers });
      await mark(to, kind, res?.sent ? "sent" : "failed");
      return { sent: Boolean(res?.sent), reason: res?.sent ? null : "not_sent" };
    } catch (err) {
      await mark(to, kind, "failed");
      log.warn("[reengage] activity email failed:", err?.message || err);
      return { sent: false, reason: "error" };
    }
  }

  async function onFriendRequest({ toUserId, fromId, fromName } = {}) {
    try {
      if (!on("activity_email")) return { sent: false, reason: "off" };
      return await activityEmail("friend_request_email", "friendRequest", { toUserId, fromId, fromName });
    } catch (err) {
      log.warn("[reengage] friend request email skipped:", err?.message || err);
      return { sent: false, reason: "error" };
    }
  }

  /** A DM that carries a server invite link (the DM push already went out). */
  async function onServerInviteDm({ toUserId, fromId, fromName, text } = {}) {
    try {
      if (!on("activity_email")) return { sent: false, reason: "off" };
      const code = P.inviteCodeFromText(text, getEnv());
      if (!code) return { sent: false, reason: "no_invite" };
      if (getState().presence?.has?.(String(toUserId || ""))) return { sent: false, reason: "online" };
      const db = getDb();
      const { data: invite } = await db.from("server_invites").select("server_id").eq("code", code).maybeSingle();
      if (!invite?.server_id) return { sent: false, reason: "bad_invite" };
      const [{ data: srv }, { data: member }] = await Promise.all([
        db.from("servers").select("id, name").eq("id", invite.server_id).maybeSingle(),
        db.from("server_members").select("user_id").eq("server_id", invite.server_id).eq("user_id", toUserId).maybeSingle(),
      ]);
      if (!srv) return { sent: false, reason: "bad_invite" };
      if (member) return { sent: false, reason: "already_member" };
      return await activityEmail("server_invite_email", "serverInvite", { toUserId, fromId, fromName, server: srv.name, inviteCode: code });
    } catch (err) {
      log.warn("[reengage] server invite email skipped:", err?.message || err);
      return { sent: false, reason: "error" };
    }
  }

  /* ---- 3. day 3 / day 7 lifecycle emails ---------------------------------- */

  async function runLifecycle() {
    const summary = { mode: mode(), considered: 0, sent: 0, dryRun: 0, failed: 0, reasons: {} };
    if (!on("lifecycle")) return { ...summary, skipped: "off" };
    if (summary.mode === "live" && !emailConfigured()) return { ...summary, skipped: "email_off" };
    if (lifecycleRunning) return { ...summary, skipped: "running" };
    lifecycleRunning = true;
    try {
      const t = now();
      const env = getEnv();
      const maxPerTick = Math.max(1, Math.min(500, Number(env.REENGAGE_MAX_EMAILS_PER_TICK) || 50));
      const db = getDb();
      const since = new Date(t - P.LIFECYCLE_WINDOWS.day7[1] * DAY_MS).toISOString();
      const until = new Date(t - P.LIFECYCLE_WINDOWS.day3[0] * DAY_MS).toISOString();
      const { data: rows, error } = await db
        .from("users")
        .select("id, created_at")
        .gte("created_at", since)
        .lte("created_at", until)
        .order("created_at", { ascending: true })
        .limit(5000);
      if (error) throw error;
      const due = (rows || []).filter((r) => P.lifecycleKindFor(r.created_at, t));
      if (!due.length) return summary;
      const users = await loadUsers(due.map((r) => r.id));
      if (!liveReady()) return { ...summary, skipped: "not_ready" };
      const ids = [...users.keys()];

      // Already sent (or claimed) lifecycle kinds.
      const sentKeys = new Set();
      for (const part of chunks(ids)) {
        if (tableMissing) break;
        const { data, error: sErr } = await db.from(TABLE).select("user_id, kind").in("user_id", part).in("kind", P.LIFECYCLE_KINDS);
        if (sErr) {
          if (isMissingTableErr(sErr, TABLE)) tableMissing = true;
          else throw sErr;
          continue;
        }
        for (const r of data || []) sentKeys.add(`${r.user_id}|${r.kind}`);
      }
      if (!liveReady()) return { ...summary, skipped: "not_ready" };

      // Marketing consent by address (lowercase, as lib/marketingOptIn.js stores it).
      const emails = [...new Set([...users.values()].map((u) => String(u.email || "").trim().toLowerCase()).filter(Boolean))];
      const consent = new Map();
      for (const part of chunks(emails)) {
        const { data, error: cErr } = await db.from("marketing_subscribers").select("email, confirmed_at, unsubscribed_at").in("email", part);
        if (cErr) break; // table missing or unreadable: nobody has consent
        for (const r of data || []) consent.set(String(r.email).toLowerCase(), r);
      }

      // Activity after sign-up (user_active_days); null = unknown -> last_seen decides.
      let activeByUser = new Map();
      let activeKnown = true;
      const sinceDay = P.istDay(new Date(since));
      for (const part of chunks(ids)) {
        const { data, error: aErr } = await db.from("user_active_days").select("user_id, day").in("user_id", part).gte("day", sinceDay);
        if (aErr) {
          activeKnown = false;
          break;
        }
        for (const r of data || []) {
          const id = String(r.user_id);
          if (!activeByUser.has(id)) activeByUser.set(id, []);
          activeByUser.get(id).push(r.day);
        }
      }
      if (!activeKnown) activeByUser = null;

      for (const u of users.values()) {
        if (summary.sent + summary.dryRun >= maxPerTick) break;
        const kind = P.lifecycleKindFor(u.created_at, t);
        if (!kind) continue;
        summary.considered += 1;
        const verdict = P.lifecycleEligible(
          u,
          {
            kind,
            activeDays: activeByUser ? activeByUser.get(String(u.id)) || [] : null,
            consent: consent.get(String(u.email || "").trim().toLowerCase()) || null,
            alreadySent: sentKeys.has(`${u.id}|${kind}`),
          },
          t
        );
        if (!verdict.ok) {
          summary.reasons[verdict.reason] = (summary.reasons[verdict.reason] || 0) + 1;
          continue;
        }
        const c = await claim(u.id, kind, "email", {});
        if (c === "exists") continue;
        if (c === "unavailable") break;
        const mail = buildReengageEmail({
          kind,
          lang: u.language,
          origin: P.publicOrigin(env),
          username: u.username,
          unsubUrl: P.unsubscribeUrl(u.id, "lifecycle", env),
        });
        if (c === "dry_run") {
          summary.dryRun += 1;
          dryLog(`lifecycle ${kind} email`, u.id, { lang: mail.lang });
          continue;
        }
        try {
          const res = await sendEmail({ to: u.email, subject: mail.subject, text: mail.text, html: mail.html, headers: mail.headers });
          await mark(u.id, kind, res?.sent ? "sent" : "failed");
          if (res?.sent) summary.sent += 1;
          else summary.failed += 1;
        } catch (err) {
          summary.failed += 1;
          await mark(u.id, kind, "failed");
          log.warn("[reengage] lifecycle email failed:", err?.message || err);
        }
      }
      if (summary.sent || summary.dryRun || summary.failed) log.log?.("[reengage] lifecycle tick", JSON.stringify(summary));
      return summary;
    } catch (err) {
      log.warn("[reengage] lifecycle tick failed:", err?.message || err);
      return { ...summary, skipped: "error" };
    } finally {
      lifecycleRunning = false;
    }
  }

  function start() {
    if (timer) return;
    const minutes = Math.max(15, Math.min(60, Number(getEnv().REENGAGE_TICK_MINUTES) || 30));
    const first = setTimeout(() => void runLifecycle(), 2 * 60 * 1000);
    const every = setInterval(() => void runLifecycle(), minutes * 60 * 1000);
    first.unref?.();
    every.unref?.();
    timer = { first, every };
    log.log?.(`[reengage] scheduler every ${minutes} min, mode ${mode()}`);
  }

  function stop() {
    if (!timer) return;
    clearTimeout(timer.first);
    clearInterval(timer.every);
    timer = null;
  }

  /* ---- settings, unsubscribe, admin counts -------------------------------- */

  async function readPrefs(userId) {
    const { data, error } = await getDb().from("users").select("notify_friend_voice, email_notify_opt_out_at").eq("id", userId).maybeSingle();
    if (error) {
      if (isMissingColumnErr(error)) columnsMissing = true;
      return { friendVoice: true, email: true, ready: false };
    }
    return { friendVoice: data?.notify_friend_voice !== false, email: !data?.email_notify_opt_out_at, ready: Boolean(data) };
  }

  async function savePrefs(userId, { friendVoice, email } = {}) {
    const patch = {};
    if (typeof friendVoice === "boolean") patch.notify_friend_voice = friendVoice;
    if (typeof email === "boolean") patch.email_notify_opt_out_at = email ? null : new Date(now()).toISOString();
    if (!Object.keys(patch).length) return { ok: false, error: "nothing_to_save" };
    const { error } = await getDb().from("users").update(patch).eq("id", userId);
    if (error) {
      if (isMissingColumnErr(error)) {
        columnsMissing = true;
        return { ok: false, error: "not_ready" };
      }
      return { ok: false, error: "failed" };
    }
    return { ok: true, ...(await readPrefs(userId)) };
  }

  /** One-click unsubscribe. { ok, lang }. "lifecycle" also ends the product-update opt-in. */
  async function unsubscribe({ userId, scope, token } = {}) {
    const env = getEnv();
    if (!P.verifyUnsub(userId, scope, token, env)) return { ok: false, lang: null };
    const db = getDb();
    const { data: u } = await db.from("users").select("id, email, language").eq("id", userId).maybeSingle();
    if (!u) return { ok: false, lang: null };
    const { error } = await db
      .from("users")
      .update({ email_notify_opt_out_at: new Date(now()).toISOString() })
      .eq("id", userId)
      .is("email_notify_opt_out_at", null);
    if (error && !isMissingColumnErr(error)) log.warn("[reengage] unsubscribe failed:", error.message);
    if (scope === "lifecycle" && u.email) {
      const { error: mErr } = await db
        .from("marketing_subscribers")
        .update({ unsubscribed_at: new Date(now()).toISOString(), confirm_token: null })
        .eq("email", String(u.email).trim().toLowerCase())
        .is("unsubscribed_at", null);
      if (mErr && !isMissingTableErr(mErr, "marketing_subscribers")) log.warn("[reengage] marketing unsubscribe failed:", mErr.message);
    }
    // A missing column still answers "done": nothing can be sent without it (liveReady).
    return { ok: true, lang: u.language || null };
  }

  /**
   * Sent counts per Istanbul day and kind ("friend_voice", "day3", ...) for the admin
   * retention report. { mode, available, rows: [{ day, kind, channel, sent, failed }] }.
   */
  async function adminCounts({ days = 30 } = {}) {
    const out = { mode: mode(), available: true, rows: [] };
    const since = new Date(now() - Math.max(1, Math.min(90, Number(days) || 30)) * DAY_MS).toISOString();
    const { data, error } = await getDb()
      .from(TABLE)
      .select("kind, channel, status, sent_at")
      .gte("sent_at", since)
      .order("sent_at", { ascending: false })
      .limit(50000);
    if (error) return { ...out, available: false };
    const agg = new Map();
    for (const r of data || []) {
      const kind = String(r.kind || "").split(":")[0];
      const day = P.istDay(P.toMs(r.sent_at));
      const key = `${day}|${kind}|${r.channel}`;
      if (!agg.has(key)) agg.set(key, { day, kind, channel: r.channel, sent: 0, failed: 0 });
      const row = agg.get(key);
      if (r.status === "failed") row.failed += 1;
      else row.sent += 1;
    }
    out.rows = [...agg.values()].sort((a, b) => (a.day === b.day ? a.kind.localeCompare(b.kind) : a.day < b.day ? 1 : -1));
    return out;
  }

  function __reset() {
    tableMissing = false;
    columnsMissing = false;
    warnedTable = false;
    dryRunSeen.clear();
    joinCooldown.clear();
  }

  return {
    mode,
    onVoiceJoin,
    onFriendRequest,
    onServerInviteDm,
    runLifecycle,
    start,
    stop,
    readPrefs,
    savePrefs,
    unsubscribe,
    adminCounts,
    __reset,
  };
}

let instance = null;
function reengage() {
  if (!instance) instance = createReengage();
  return instance;
}

/** Fire-and-forget helpers for the socket / route call sites (never throw, never block). */
function fire(method, payload) {
  try {
    const r = reengage();
    if (r.mode() === "off") return;
    setImmediate(() => {
      Promise.resolve(r[method](payload)).catch(() => {});
    });
  } catch {
    /* best effort */
  }
}

module.exports = { createReengage, reengage, fire };
