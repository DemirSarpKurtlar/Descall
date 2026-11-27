"use strict";

/**
 * Growth 3B "Arkadaştan çağrı": on day 7 a friend calls you back, not the system.
 *
 *  1. findSuggestions (engine tick): accounts away 7..13 days that were active on at
 *     least 3 days before get ONE suggestion per absence (winback_calls.episode_key),
 *     shown to their closest friend (most voice minutes together x2 + DM messages,
 *     last 30 days) who is around and may call (account >= 30 days, 1 call a week).
 *  2. call: the friend taps "Çağır" (message editable). The target gets ONE push with the
 *     friend's face ("Kaan seni çağırıyor"); a target gets at most 2 calls a month.
 *  3. noteActive (auth middleware / socket activity): the target came back; once they were
 *     really active for 10 minutes within 72 h of the call, both get the reward (50 DesCoin
 *     by default, console setting) once, through lib/descoin.js with an idempotency key.
 *     No reward between two accounts on the same device or IP; suspicious sign-ups never.
 *  4. 14-day gift (campaign inactive14): claimed automatically on the first sign-in in 72 h.
 *
 * Nothing is sent while the re-engagement mode is not "live" (dry run logs what would go).
 */

const R = require("./rules");
const store = require("./store");

const DAY = R.DAY_MS;
const LEDGER_REASON_CALL = "winback_call";
const LEDGER_REASON_GIFT = "winback_gift";

function istDay(ms) {
  return require("../reengagePolicy").istDay(ms);
}

function deps(over = {}) {
  return {
    now: over.now || (() => Date.now()),
    mode: over.mode || (() => require("./mode").sendingMode()),
    descoin: over.descoin || require("../descoin"),
    push: over.push || (() => require("../webPush")),
    emit: over.emit || require("./io").emitToUser,
    log: over.log || console,
  };
}

/* ---- reading helpers ----------------------------------------------------- */

async function activeDaysSince(sinceDay) {
  const { selectPaged } = require("../selectPaged");
  const res = await selectPaged(() =>
    store.db().from("user_active_days").select("user_id, day", { count: "exact" }).gte("day", sinceDay).order("user_id", { ascending: true }).order("day", { ascending: true })
  );
  const map = new Map();
  for (const r of res.data || []) {
    const id = String(r.user_id);
    if (!map.has(id)) map.set(id, []);
    map.get(id).push(String(r.day).slice(0, 10));
  }
  return { ok: !res.error, map };
}

async function friendsOf(userId) {
  const { data } = await store
    .db()
    .from("friendships")
    .select("user_id, friend_id")
    .eq("status", "accepted")
    .or(`user_id.eq.${userId},friend_id.eq.${userId}`)
    .limit(500);
  return [...new Set((data || []).map((r) => (String(r.user_id) === String(userId) ? String(r.friend_id) : String(r.user_id))))].filter(
    (id) => id && id !== String(userId)
  );
}

const USER_COLS = "id, username, display_name, avatar_url, language, created_at, is_banned, deleted_at, deletion_requested_at, suspicious_signup, blocked_users, active_sessions, signup_visitor_key, timezone, email";

async function usersById(ids) {
  const out = new Map();
  for (const part of store.chunks([...new Set(ids.map(String))])) {
    let { data, error } = await store.db().from("users").select(USER_COLS).in("id", part);
    if (error) ({ data } = await store.db().from("users").select("id, username, display_name, avatar_url, language, created_at, is_banned, blocked_users").in("id", part));
    for (const u of data || []) out.set(String(u.id), u);
  }
  return out;
}

/**
 * Closeness of `target` with each friend in the last 30 days: DM messages both ways and
 * voice minutes in the same channel at the same time (descoin voice_activity rows, one per
 * paid heartbeat). Also the server they talk in most. Map friendId -> { voiceMinutes, dmMessages, serverId }.
 */
async function closeness(target, friends, now) {
  const since = new Date(now - 30 * DAY).toISOString();
  const out = new Map(friends.map((f) => [f, { voiceMinutes: 0, dmMessages: 0, servers: new Map() }]));
  if (!friends.length) return out;
  const db = store.db();
  for (const part of store.chunks(friends, 100)) {
    const [a, b] = await Promise.all([
      db.from("dm_messages").select("to_user_id").eq("from_user_id", target).in("to_user_id", part).gte("created_at", since).limit(5000),
      db.from("dm_messages").select("from_user_id").eq("to_user_id", target).in("from_user_id", part).gte("created_at", since).limit(5000),
    ]);
    for (const r of a.data || []) out.get(String(r.to_user_id)) && (out.get(String(r.to_user_id)).dmMessages += 1);
    for (const r of b.data || []) out.get(String(r.from_user_id)) && (out.get(String(r.from_user_id)).dmMessages += 1);
  }
  const bucket = (r) => `${r.meta?.channelId || ""}|${Math.floor(Date.parse(r.created_at) / (10 * 60 * 1000))}`;
  const { data: mine } = await db
    .from("descoin_ledger")
    .select("meta, created_at")
    .eq("user_id", target)
    .eq("reason", "voice_activity")
    .gte("created_at", since)
    .limit(5000);
  const slots = new Map();
  for (const r of mine || []) if (r.meta?.channelId) slots.set(bucket(r), r.meta?.serverId || null);
  if (slots.size) {
    for (const part of store.chunks(friends, 100)) {
      const { data } = await db
        .from("descoin_ledger")
        .select("user_id, meta, created_at")
        .in("user_id", part)
        .eq("reason", "voice_activity")
        .gte("created_at", since)
        .limit(20000);
      for (const r of data || []) {
        const k = bucket(r);
        if (!slots.has(k)) continue;
        const c = out.get(String(r.user_id));
        if (!c) continue;
        c.voiceMinutes += 1;
        const sid = slots.get(k);
        if (sid) c.servers.set(sid, (c.servers.get(sid) || 0) + 1);
      }
    }
  }
  for (const c of out.values()) {
    c.serverId = [...c.servers.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] || null;
    delete c.servers;
  }
  return out;
}

async function callCounts(field, ids, sinceMs) {
  const out = new Map();
  if (!ids.length) return out;
  const res = await store.callsWhere({ [field]: ids }, { since: new Date(sinceMs).toISOString(), sinceCol: "called_at", limit: 2000 });
  for (const r of res.rows || []) {
    if (!r.called_at) continue;
    const id = String(r[field]);
    out.set(id, (out.get(id) || 0) + 1);
  }
  return out;
}

/* ---- 1. suggestions ------------------------------------------------------ */

async function findSuggestions(opts = {}) {
  const d = deps(opts);
  const now = d.now();
  const summary = { considered: 0, suggested: 0, skipped: {} };
  const skip = (r) => (summary.skipped[r] = (summary.skipped[r] || 0) + 1);
  const today = istDay(now);
  const { ok, map } = await activeDaysSince(R.dayStr(R.dayNum(today) - 45));
  if (!ok) return { ...summary, error: "no_activity_table" };
  const targets = [];
  for (const [id, days] of map) {
    const abs = R.absence(days, today);
    const v = R.winbackTarget(abs);
    if (v.ok) targets.push({ id, abs });
  }
  if (!targets.length) return summary;
  // Already suggested for this absence?
  const keys = targets.map((t) => R.episodeKey(t.id, t.abs));
  const existing = new Set();
  for (const part of store.chunks(keys)) {
    const res = await store.callsWhere({ episode_key: part }, { limit: 2000 });
    if (!res.ready) return { ...summary, error: "not_ready" };
    for (const r of res.rows) existing.add(r.episode_key);
  }
  const fresh = targets.filter((t) => !existing.has(R.episodeKey(t.id, t.abs))).slice(0, opts.max || 200);
  const targetMonth = await callCounts("target_id", fresh.map((t) => t.id), now - 30 * DAY);
  for (const t of fresh) {
    summary.considered += 1;
    const friends = await friendsOf(t.id);
    if (!friends.length) {
      skip("no_friends");
      continue;
    }
    const users = await usersById([t.id, ...friends]);
    const target = users.get(t.id);
    const tv = R.targetAllowed(target, { callsThisMonth: targetMonth.get(t.id) || 0 });
    if (!tv.ok) {
      skip(tv.reason);
      continue;
    }
    // Callers who are around (active today or yesterday) and may call this week.
    const around = friends.filter((f) => {
      const days = map.get(f) || [];
      const a = R.absence(days, today);
      return a.absentDays != null && a.absentDays <= 1;
    });
    if (!around.length) {
      skip("no_friend_around");
      continue;
    }
    const week = await callCounts("caller_id", around, now - 7 * DAY);
    const close = await closeness(t.id, around, now);
    const blocks = new Set(Array.isArray(target?.blocked_users) ? target.blocked_users.map(String) : []);
    const cands = around.map((f) => {
      const u = users.get(f);
      const allowed = R.callerAllowed(u, { callsThisWeek: week.get(f) || 0 }, now);
      const blocked = blocks.has(f) || (Array.isArray(u?.blocked_users) && u.blocked_users.map(String).includes(t.id));
      return { id: f, ...(close.get(f) || {}), eligible: allowed.ok && !blocked };
    });
    const best = R.closestFriend(cands);
    if (!best) {
      skip("no_close_friend");
      continue;
    }
    let serverName = null;
    if (best.serverId) {
      const { data } = await store.db().from("servers").select("name").eq("id", best.serverId).maybeSingle();
      serverName = data?.name || null;
    }
    const row = await store.insertCall({
      episode_key: R.episodeKey(t.id, t.abs),
      caller_id: best.id,
      target_id: t.id,
      server_id: best.serverId || null,
      reason: { voiceMinutes: best.voiceMinutes || 0, dmMessages: best.dmMessages || 0, absentDays: t.abs.absentDays, serverName },
      status: "suggested",
      active_seconds: 0,
      reward_amount: 0,
      called_at: null,
      returned_at: null,
      rewarded_at: null,
      suggested_at: new Date(now).toISOString(),
      expires_at: new Date(now + R.WINBACK.suggestionTtlMs).toISOString(),
    });
    if (!row) continue;
    summary.suggested += 1;
    d.emit(best.id, "winback:suggestion", { id: row.id });
  }
  return summary;
}

/* ---- 2. the caller's card and the call ----------------------------------- */

function publicTarget(u, absentDays) {
  return {
    id: String(u.id),
    username: u.username,
    name: u.display_name || u.username,
    avatarUrl: u.avatar_url || null,
    absentDays,
  };
}

/** The open suggestion for `callerId`, or null. */
async function suggestionFor(callerId, opts = {}) {
  const d = deps(opts);
  const now = d.now();
  const res = await store.callsWhere({ caller_id: callerId, status: "suggested" }, { limit: 5 });
  const open = (res.rows || []).find((r) => Date.parse(r.expires_at || 0) > now);
  if (!open) return { ready: res.ready, suggestion: null };
  const users = await usersById([open.target_id]);
  const target = users.get(String(open.target_id));
  if (!target || target.is_banned || target.deleted_at) return { ready: true, suggestion: null };
  // Still away? (they may have come back on their own)
  const { data: days } = await store.db().from("user_active_days").select("day").eq("user_id", open.target_id).gte("day", R.dayStr(R.dayNum(istDay(now)) - 45)).limit(60);
  const abs = R.absence((days || []).map((x) => x.day), istDay(now));
  if (abs.absentDays != null && abs.absentDays < R.WINBACK.minAbsentDays) {
    await store.updateCall(open.id, { status: "expired" }, { status: "suggested" }).catch(() => null);
    return { ready: true, suggestion: null };
  }
  const cfg = await store.getConsole();
  let liveCount = null;
  if (open.server_id) {
    try {
      const { activeServerVoiceCalls } = require("../../runtime/sharedState");
      for (const call of activeServerVoiceCalls?.values?.() || []) {
        if (String(call?.serverId || "") === String(open.server_id)) liveCount = (liveCount || 0) + (call?.participants?.size || 0);
      }
    } catch {
      /* optional */
    }
  }
  return {
    ready: true,
    suggestion: {
      id: open.id,
      target: publicTarget(target, abs.absentDays ?? open.reason?.absentDays ?? 7),
      serverId: open.server_id || null,
      serverName: open.reason?.serverName || null,
      voiceMinutes: open.reason?.voiceMinutes || 0,
      dmMessages: open.reason?.dmMessages || 0,
      reward: cfg.callReward,
      liveInServer: liveCount,
      expiresAt: open.expires_at,
    },
  };
}

function badRequest(code, status = 400) {
  const e = new Error(code);
  e.code = code;
  e.status = status;
  return e;
}

/** The caller taps "Çağır". Returns { ok, sent, mode }. */
async function call(callerId, callId, { message = "", lang = "tr", ...opts } = {}) {
  const d = deps(opts);
  const now = d.now();
  const res = await store.callsWhere({ id: callId }, { limit: 1 });
  const row = res.rows?.[0];
  if (!row || String(row.caller_id) !== String(callerId)) throw badRequest("not_found", 404);
  if (row.status !== "suggested") throw badRequest("not_open", 409);
  if (Date.parse(row.expires_at || 0) <= now) throw badRequest("expired", 410);
  const users = await usersById([callerId, row.target_id]);
  const caller = users.get(String(callerId));
  const target = users.get(String(row.target_id));
  const week = await callCounts("caller_id", [String(callerId)], now - 7 * DAY);
  const cv = R.callerAllowed(caller, { callsThisWeek: week.get(String(callerId)) || 0 }, now);
  if (!cv.ok) throw badRequest(cv.reason, 429);
  const month = await callCounts("target_id", [String(row.target_id)], now - 30 * DAY);
  const tv = R.targetAllowed(target, { callsThisMonth: month.get(String(row.target_id)) || 0 });
  if (!tv.ok) throw badRequest(tv.reason, 429);
  const text = String(message || "").replace(/\s+/g, " ").trim().slice(0, 200);
  const mode = d.mode();
  if (mode === "off") throw badRequest("off", 503);
  const updated = await store.updateCall(row.id, { status: "called", called_at: new Date(now).toISOString(), message: text || null }, { status: "suggested" });
  if (!updated) throw badRequest("not_open", 409);
  if (mode === "dry_run") {
    (d.log.info || d.log.log).call(d.log, `[reengage] dry-run: would send friend_call push to user ${row.target_id}`);
    return { ok: true, sent: false, mode };
  }
  // Counted with the other win-back messages (2 a week) in lifecycle_messages.
  const kind = `friend_call:${row.id}`.slice(0, 64);
  try {
    await store.db().from("lifecycle_messages").insert({ user_id: row.target_id, kind, channel: "push", status: "sent", meta: { callerId }, campaign: "friend_call", lang: target?.language || null });
  } catch {
    /* tracking only */
  }
  const copy = require("./copy");
  const callerName = caller?.display_name || caller?.username || "";
  const serverName = row.reason?.serverName || "";
  await d
    .push()
    .sendGrowthPush([row.target_id], {
      type: "friend-call",
      fromId: callerId,
      fromName: callerName,
      avatar: caller?.avatar_url || null,
      tag: `friend-call-${callerId}`,
      deepLink: `/?dm=${encodeURIComponent(callerId)}`,
      rgKind: kind,
      texts: (l) => ({
        title: copy.rt(l, "push.callTitle", { caller: callerName }),
        body: text ? `"${text}"` : require("./rules").renderTemplate(copy.defaultTemplate("friend_call", l).pushBody, { sunucu: serverName || "Descall" }),
      }),
      actions: (l) => [
        { action: "rg_come", title: copy.rt(l, "push.come") },
        { action: "rg_reply", title: copy.rt(l, "push.reply") },
      ],
      extra: { serverId: row.server_id || null, callId: row.id },
    })
    .catch((err) => d.log.warn("[winback] call push failed:", err?.message || err));
  d.emit(row.target_id, "winback:called", { from: { id: String(callerId), name: callerName, avatarUrl: caller?.avatar_url || null }, message: text, serverId: row.server_id || null });
  return { ok: true, sent: true, mode };
}

async function dismiss(callerId, callId) {
  const res = await store.callsWhere({ id: callId }, { limit: 1 });
  const row = res.rows?.[0];
  if (!row || String(row.caller_id) !== String(callerId)) throw badRequest("not_found", 404);
  await store.updateCall(row.id, { status: "dismissed" }, { status: "suggested" });
  return { ok: true };
}

/* ---- 3. the target is back ---------------------------------------------- */

const lastSeen = new Map(); // userId -> ms of the last activity note

/**
 * Any authenticated activity of `userId` (requests, voice heartbeats, messages). Adds up
 * to 2 minutes of active time per note to open calls (returned within 72 h), claims the
 * 14-day gift, pays the call reward once 10 minutes are reached.
 */
async function noteActive(userId, { kind = "request", ...opts } = {}) {
  const d = deps(opts);
  const now = d.now();
  const prev = lastSeen.get(userId) || 0;
  if (kind === "request" && now - prev < 60_000) return null;
  lastSeen.set(userId, now);
  if (lastSeen.size > 50000) lastSeen.clear();
  const out = { returned: 0, rewarded: 0, gift: 0 };
  // Gift first (independent of calls).
  try {
    for (const g of await store.giftsOf(userId)) {
      if (Date.parse(g.expires_at) < now) continue;
      const won = await store.claimGift(userId, g.episode_key, new Date(now).toISOString());
      if (!won) continue;
      const r = await d.descoin.credit(userId, g.amount, LEDGER_REASON_GIFT, { episode: g.episode_key, idempotencyKey: `winback_gift:${userId}:${g.episode_key}` });
      out.gift += r?.credited || 0;
      d.emit(userId, "descoin:balance", { balance: r?.balance, delta: r?.credited || 0, reason: LEDGER_REASON_GIFT });
    }
  } catch (err) {
    d.log.warn("[winback] gift claim failed:", err?.message || err);
  }
  const res = await store.callsWhere({ target_id: userId, status: ["called", "returned"] }, { since: new Date(now - R.WINBACK.returnWindowMs).toISOString(), sinceCol: "called_at", limit: 5 });
  for (const c of res.rows || []) {
    let row = c;
    if (!row.returned_at) {
      row = (await store.updateCall(row.id, { returned_at: new Date(now).toISOString(), status: "returned" }, { returned_at: null })) || row;
      out.returned += 1;
      d.emit(row.caller_id, "winback:returned", { callId: row.id, targetId: String(userId) });
    }
    const add = prev && now - prev < 5 * 60_000 ? Math.min(120, Math.round((now - prev) / 1000)) : kind === "request" ? 30 : 60;
    const seconds = (Number(row.active_seconds) || 0) + add;
    row = (await store.updateCall(row.id, { active_seconds: seconds }, { active_seconds: Number(row.active_seconds) || 0 })) || { ...row, active_seconds: seconds };
    if (seconds >= R.WINBACK.minActiveSeconds && !row.rewarded_at) {
      const paid = await maybeReward(row, d, now);
      if (paid) out.rewarded += 1;
    }
  }
  return out;
}

async function maybeReward(row, d, now) {
  const users = await usersById([row.caller_id, row.target_id]);
  const cfg = await store.getConsole();
  const verdict = R.rewardDecision(row, { caller: users.get(String(row.caller_id)), target: users.get(String(row.target_id)), rewardAmount: cfg.callReward }, now);
  if (!verdict.pay) {
    if (["same_device", "same_ip", "suspicious", "late", "reward_off"].includes(verdict.reason)) {
      await store.updateCall(row.id, { status: "denied", deny_reason: verdict.reason }, { rewarded_at: null }).catch(() => null);
    }
    return false;
  }
  // Claim first (only one process pays), then pay both sides.
  const won = await store.updateCall(row.id, { status: "rewarded", rewarded_at: new Date(now).toISOString(), reward_amount: cfg.callReward }, { rewarded_at: null });
  if (!won) return false;
  for (const uid of [row.caller_id, row.target_id]) {
    try {
      const r = await d.descoin.credit(uid, cfg.callReward, LEDGER_REASON_CALL, {
        callId: row.id,
        role: String(uid) === String(row.caller_id) ? "caller" : "returner",
        idempotencyKey: `winback:${row.id}:${uid}`,
      });
      d.emit(uid, "descoin:balance", { balance: r?.balance, delta: r?.credited || 0, reason: LEDGER_REASON_CALL });
      d.emit(uid, "winback:rewarded", { callId: row.id, amount: r?.credited || 0 });
    } catch (err) {
      d.log.warn("[winback] reward credit failed:", err?.message || err);
    }
  }
  return true;
}

/** Offer the 14-day gift (campaign inactive14). */
async function offerGift(userId, episodeKey, amount, { now = Date.now() } = {}) {
  if (!(amount > 0)) return false;
  return store.insertGift({
    user_id: userId,
    episode_key: episodeKey,
    amount,
    offered_at: new Date(now).toISOString(),
    expires_at: new Date(now + R.WINBACK.gift14WindowMs).toISOString(),
  });
}

/** Expire suggestions past their time (engine tick). */
async function expireOld({ now = Date.now() } = {}) {
  const res = await store.callsWhere({ status: "suggested" }, { limit: 500 });
  let n = 0;
  for (const r of res.rows || []) {
    if (Date.parse(r.expires_at || 0) > now) continue;
    if (await store.updateCall(r.id, { status: "expired" }, { status: "suggested" }).catch(() => null)) n += 1;
  }
  return n;
}

/** Console panel: this week's friend-call funnel, DesCoin paid and the log. */
async function adminSummary({ now = Date.now(), days = 7 } = {}) {
  const since = new Date(now - days * DAY).toISOString();
  const res = await store.callsWhere({}, { since, limit: 2000 });
  const rows = res.rows || [];
  const called = rows.filter((r) => r.called_at);
  const returned = rows.filter((r) => r.returned_at);
  const rewarded = rows.filter((r) => r.rewarded_at);
  const ids = [...new Set(rows.flatMap((r) => [r.caller_id, r.target_id]).map(String))].slice(0, 400);
  const users = ids.length ? await usersById(ids) : new Map();
  const nameOf = (id) => {
    const u = users.get(String(id));
    return u ? u.display_name || u.username : null;
  };
  const log = rows
    .filter((r) => r.rewarded_at || r.status === "denied" || r.called_at)
    .sort((a, b) => Date.parse(b.rewarded_at || b.returned_at || b.called_at || b.suggested_at) - Date.parse(a.rewarded_at || a.returned_at || a.called_at || a.suggested_at))
    .slice(0, 30)
    .map((r) => ({
      id: r.id,
      at: r.rewarded_at || r.returned_at || r.called_at || r.suggested_at,
      status: r.status,
      caller: { id: r.caller_id, name: nameOf(r.caller_id) },
      target: { id: r.target_id, name: nameOf(r.target_id) },
      amount: r.reward_amount || 0,
      activeMinutes: Math.floor((Number(r.active_seconds) || 0) / 60),
      denyReason: r.deny_reason || null,
    }));
  return {
    ready: res.ready,
    shown: rows.length,
    called: called.length,
    returned: returned.length,
    rewarded: rewarded.length,
    rate: called.length ? Math.round((returned.length / called.length) * 1000) / 10 : null,
    descoin: rewarded.reduce((s, r) => s + 2 * (Number(r.reward_amount) || 0), 0),
    log,
  };
}

function __reset() {
  lastSeen.clear();
}

module.exports = {
  LEDGER_REASON_CALL,
  LEDGER_REASON_GIFT,
  findSuggestions,
  suggestionFor,
  call,
  dismiss,
  noteActive,
  offerGift,
  expireOld,
  adminSummary,
  closeness,
  __reset,
};
