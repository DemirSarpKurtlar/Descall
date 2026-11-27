"use strict";

/**
 * Growth 3B console audiences and the facts behind every message ({arkadas_1},
 * {arkadas_2}, {sunucu}, {sayi}, {bahsetme}). Each campaign's audience is computed from
 * what the server already stores: user_active_days (absence), users (sign-up, first
 * message), notify_settings, shared_streaks, push devices and e-mail consent.
 */

const R = require("./rules");
const store = require("./store");
const P = require("../reengagePolicy");

const DAY = R.DAY_MS;
const WINBACK_CAMPAIGNS = Object.freeze(["new_quiet", "inactive7", "inactive14", "friend_call"]);

const USER_COLS =
  "id, username, display_name, avatar_url, email, email_confirmed_at, email_notify_opt_out_at, language, timezone, created_at, first_message_at, is_banned, deleted_at, deletion_requested_at, suspicious_signup, signup_device, signup_os";
const USER_COLS_MIN = "id, username, display_name, avatar_url, email, email_confirmed_at, language, timezone, created_at, is_banned, deleted_at";

async function usersById(ids) {
  const out = new Map();
  for (const part of store.chunks([...new Set(ids.map(String))])) {
    let { data, error } = await store.db().from("users").select(USER_COLS).in("id", part);
    if (error) ({ data } = await store.db().from("users").select(USER_COLS_MIN).in("id", part));
    for (const u of data || []) out.set(String(u.id), u);
  }
  return out;
}

async function pushTargets(ids) {
  const out = new Set();
  for (const part of store.chunks(ids)) {
    const [web, dev] = await Promise.all([
      store.db().from("web_push_subscriptions").select("user_id").in("user_id", part),
      store.db().from("device_push_tokens").select("user_id, platform").in("user_id", part),
    ]);
    for (const r of web?.data || []) out.add(String(r.user_id));
    for (const r of dev?.data || []) if (r.platform !== "ios_voip") out.add(String(r.user_id));
  }
  return out;
}

/** Win-back messages per user in the last 7 days and today (the 1-a-day / 2-a-week rule). */
async function winbackHistory(ids, now) {
  const out = new Map();
  const since = new Date(now - 7 * DAY).toISOString();
  for (const part of store.chunks(ids)) {
    const { data, error } = await store
      .db()
      .from("lifecycle_messages")
      .select("user_id, campaign, sent_at, holdout")
      .in("user_id", part)
      .in("campaign", WINBACK_CAMPAIGNS)
      .gte("sent_at", since);
    if (error) continue;
    for (const r of data || []) {
      if (r.holdout) continue;
      const id = String(r.user_id);
      const v = out.get(id) || { week: 0, today: 0, last14: false };
      v.week += 1;
      if (now - P.toMs(r.sent_at) < DAY) v.today += 1;
      out.set(id, v);
    }
  }
  return out;
}

async function activeMap(sinceDay) {
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
  return map;
}

/**
 * Candidates of one campaign (before quiet hours / limits): [{ id, episode, absentDays }].
 */
async function candidates(campaignId, now) {
  const today = P.istDay(now);
  if (campaignId === "inactive7" || campaignId === "inactive14") {
    const map = await activeMap(R.dayStr(R.dayNum(today) - 60));
    const out = [];
    for (const [id, days] of map) {
      const abs = R.absence(days, today);
      if (abs.absentDays == null || abs.priorActive < R.WINBACK.priorActiveDays) continue;
      const lo = campaignId === "inactive7" ? 7 : 14;
      const hi = campaignId === "inactive7" ? 13 : 20;
      if (abs.absentDays < lo || abs.absentDays > hi) continue;
      out.push({ id, episode: abs.firstAbsentDay, absentDays: abs.absentDays });
    }
    if (campaignId === "inactive7" && out.length) {
      // A friend call goes first; the system message waits 24 h after the suggestion.
      const res = await store.callsWhere({ target_id: out.map((c) => c.id) }, { since: new Date(now - 14 * DAY).toISOString(), limit: 5000 });
      const by = new Map((res.rows || []).map((r) => [String(r.target_id), r]));
      return out.filter((c) => {
        const r = by.get(c.id);
        if (!r) return true;
        if (r.called_at) return false; // the friend called: no system message for this absence
        return now - P.toMs(r.suggested_at) >= R.WINBACK.systemFallbackAfterMs;
      });
    }
    return out;
  }
  if (campaignId === "new_quiet") {
    const { data } = await store
      .db()
      .from("users")
      .select("id, created_at, first_message_at")
      .gte("created_at", new Date(now - 7 * DAY).toISOString())
      .lte("created_at", new Date(now - DAY).toISOString())
      .is("first_message_at", null)
      .limit(3000);
    return (data || []).map((u) => ({ id: String(u.id), episode: P.istDay(P.toMs(u.created_at)), absentDays: null }));
  }
  if (campaignId === "weekly_digest") {
    const map = await activeMap(R.dayStr(R.dayNum(today) - 30));
    const weekKey = R.dayStr(R.dayNum(today) - ((new Date(now).getUTCDay() + 7) % 7));
    return [...map.keys()].map((id) => ({ id, episode: weekKey, absentDays: null }));
  }
  if (campaignId === "streak_reminder") {
    const { data } = await store.db().from("shared_streaks").select("*").eq("status", "active").gt("count", 0).limit(5000);
    const out = new Map();
    for (const s of data || []) {
      const v = R.streakView(s, today);
      if (!v.atRisk || v.count <= 0) continue;
      if (!v.aToday) out.set(String(s.user_a), { id: String(s.user_a), episode: today, peer: String(s.user_b), count: v.count });
      if (!v.bToday) out.set(String(s.user_b), { id: String(s.user_b), episode: today, peer: String(s.user_a), count: v.count });
    }
    return [...out.values()];
  }
  if (campaignId === "friend_call") {
    const res = await store.callsWhere({ status: "suggested" }, { limit: 2000 });
    return (res.rows || []).filter((r) => P.toMs(r.expires_at) > now).map((r) => ({ id: String(r.target_id), episode: r.episode_key, caller: String(r.caller_id) }));
  }
  return [];
}

/**
 * Audience with the "who is not in this wave" breakdown (the console card):
 *   noDevice: no push device and no usable e-mail (or no consent for e-mail-only campaigns)
 *   weekly: already got the win-back maximum this week (1 a day, 2 a week)
 *   unsubscribed: e-mail opt-out / type switched off
 *   quiet: in quiet hours now, will go later
 */
async function audience(campaignId, { now = Date.now(), channels = ["push", "email"] } = {}) {
  const cands = await candidates(campaignId, now);
  const ids = cands.map((c) => c.id);
  const users = ids.length ? await usersById(ids) : new Map();
  const [targets, history, settings] = await Promise.all([
    ids.length ? pushTargets(ids) : new Set(),
    WINBACK_CAMPAIGNS.includes(campaignId) && ids.length ? winbackHistory(ids, now) : new Map(),
    ids.length ? store.getSettingsMany(ids) : new Map(),
  ]);
  const excluded = { noDevice: 0, weekly: 0, unsubscribed: 0, quiet: 0 };
  const reachable = [];
  const later = [];
  for (const c of cands) {
    const u = users.get(c.id);
    if (!u || u.is_banned || u.deleted_at || u.deletion_requested_at) continue;
    const s = settings.get(c.id) || R.normalizeSettings(null);
    const typeKey = campaignId === "weekly_digest" ? "digest" : campaignId === "streak_reminder" ? "streak" : null;
    if (typeKey && s.types[typeKey] === false) {
      excluded.unsubscribed += 1;
      continue;
    }
    const emailOk = P.hasUsableEmail(u) && Boolean(u.email_confirmed_at) && !u.email_notify_opt_out_at;
    const pushOk = targets.has(c.id);
    const canPush = channels.includes("push") && pushOk;
    const canMail = channels.includes("email") && emailOk;
    if (!canPush && !canMail) {
      if (channels.includes("email") && P.hasUsableEmail(u) && u.email_notify_opt_out_at) excluded.unsubscribed += 1;
      else excluded.noDevice += 1;
      continue;
    }
    const h = history.get(c.id);
    if (h && (h.today >= 1 || h.week >= 2)) {
      excluded.weekly += 1;
      continue;
    }
    const entry = { ...c, user: u, settings: s, push: canPush, email: canMail };
    if (R.isQuietFor(s, u.timezone, now)) {
      excluded.quiet += 1;
      later.push(entry);
      continue;
    }
    reachable.push(entry);
  }
  return { total: cands.length, reachable, later, excluded };
}

/* ---- facts for the placeholders ----------------------------------------- */

/**
 * {arkadas_1}, {arkadas_2}: the friends most active in voice this week (in a server the
 * person shares); {sunucu}: that server; {sayi}: voice meetups there this week (10-minute
 * windows with two or more people talking); {bahsetme}: mentions of the person there.
 * Returns { vars, faces, serverId } (empty strings when unknown).
 */
async function factsFor(userId, { now = Date.now(), days = 7 } = {}) {
  const db = store.db();
  const since = new Date(now - days * DAY).toISOString();
  const { data: links } = await db
    .from("friendships")
    .select("user_id, friend_id")
    .eq("status", "accepted")
    .or(`user_id.eq.${userId},friend_id.eq.${userId}`)
    .limit(300);
  const friends = [...new Set((links || []).map((r) => (String(r.user_id) === String(userId) ? String(r.friend_id) : String(r.user_id))))];
  const vars = { arkadas_1: "", arkadas_2: "", sunucu: "", sayi: 0, bahsetme: 0 };
  let serverId = null;
  const faces = [];
  const minutes = new Map();
  const buckets = new Map(); // server -> Map(bucket -> Set(user))
  if (friends.length) {
    for (const part of store.chunks(friends, 100)) {
      const { data } = await db.from("descoin_ledger").select("user_id, meta, created_at").in("user_id", part).eq("reason", "voice_activity").gte("created_at", since).limit(20000);
      for (const r of data || []) {
        const sid = r.meta?.serverId;
        if (!sid) continue;
        minutes.set(String(r.user_id), (minutes.get(String(r.user_id)) || 0) + 2);
        const b = `${r.meta?.channelId || ""}|${Math.floor(Date.parse(r.created_at) / (10 * 60 * 1000))}`;
        if (!buckets.has(sid)) buckets.set(sid, new Map());
        const m = buckets.get(sid);
        if (!m.has(b)) m.set(b, new Set());
        m.get(b).add(String(r.user_id));
      }
    }
  }
  const { data: mine } = await db.from("server_members").select("server_id").eq("user_id", userId).limit(200);
  const myServers = new Set((mine || []).map((m) => String(m.server_id)));
  let best = null;
  for (const [sid, m] of buckets) {
    if (myServers.size && !myServers.has(String(sid))) continue;
    const meets = [...m.values()].filter((set) => set.size >= 2).length;
    if (!best || meets > best.meets) best = { sid: String(sid), meets };
  }
  if (best) {
    serverId = best.sid;
    vars.sayi = best.meets;
    const { data: srv } = await db.from("servers").select("name").eq("id", serverId).maybeSingle();
    vars.sunucu = srv?.name || "";
  } else if (myServers.size) {
    // No voice data: the server with the most messages this week.
    const ids = [...myServers].slice(0, 10);
    let top = null;
    for (const sid of ids) {
      const { count } = await db.from("server_messages").select("id", { count: "exact", head: true }).eq("server_id", sid).gte("created_at", since);
      if (!top || (count || 0) > top.count) top = { sid, count: count || 0 };
    }
    if (top) {
      serverId = top.sid;
      const { data: srv } = await db.from("servers").select("name").eq("id", serverId).maybeSingle();
      vars.sunucu = srv?.name || "";
      vars.sayi = top.count;
    }
  }
  const ranked = friends.filter((f) => minutes.has(f)).sort((a, b) => minutes.get(b) - minutes.get(a));
  const pick = (ranked.length ? ranked : friends).slice(0, 3);
  if (pick.length) {
    const { data: us } = await db.from("users").select("id, username, display_name, avatar_url").in("id", pick);
    const by = new Map((us || []).map((u) => [String(u.id), u]));
    for (const id of pick) {
      const u = by.get(id);
      if (u) faces.push({ id, name: u.display_name || u.username, avatar: u.avatar_url || null, minutes: minutes.get(id) || 0 });
    }
  }
  vars.arkadas_1 = faces[0]?.name || "";
  vars.arkadas_2 = faces[1]?.name || "";
  // Mentions of this person this week (in their servers).
  const { data: me } = await db.from("users").select("username").eq("id", userId).maybeSingle();
  if (me?.username) {
    let q = db.from("server_messages").select("id, server_id").ilike("content", `%@${String(me.username).replace(/[%_\\]/g, (c) => `\\${c}`)}%`).gte("created_at", since).limit(200);
    if (serverId) q = q.eq("server_id", serverId);
    const { data: ments } = await q;
    vars.bahsetme = (ments || []).length;
  }
  return { vars, faces, serverId };
}

module.exports = { WINBACK_CAMPAIGNS, usersById, pushTargets, candidates, audience, factsFor, winbackHistory };
