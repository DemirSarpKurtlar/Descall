"use strict";

/**
 * Growth 3B "Bildirim merkezi: kişiler ve sunucular". One read gives the settings page
 * everything: notification types, quiet hours, the voice budget, important people (max 8),
 * friends with their prefs and a short live line, servers with their level (the existing
 * server_members.notification_level), and per person "this month they called you to voice
 * N times, you joined M". Person message level "never" and "Sustur" are mirrored into the
 * existing per-DM options (conversation_notify_prefs), so every app keeps honouring them.
 */

const R = require("./rules");
const store = require("./store");

const MAX_FRIENDS = 500;
const DAY = R.DAY_MS;

function istDay(ms) {
  return require("../reengagePolicy").istDay(ms);
}

async function friendLinks(me) {
  const { data } = await store
    .db()
    .from("friendships")
    .select("user_id, friend_id, created_at")
    .eq("status", "accepted")
    .or(`user_id.eq.${me},friend_id.eq.${me}`)
    .limit(MAX_FRIENDS);
  const since = new Map();
  for (const r of data || []) {
    const id = String(r.user_id) === String(me) ? String(r.friend_id) : String(r.user_id);
    if (id && id !== String(me)) since.set(id, r.created_at || null);
  }
  return since;
}

async function friendIds(me) {
  return [...(await friendLinks(me)).keys()];
}

function voiceSeatOf(ids, state) {
  const out = new Map();
  const want = new Set(ids);
  try {
    for (const call of state.activeServerVoiceCalls?.values?.() || []) {
      const people = [...(call?.participants?.keys?.() || [])].map(String);
      for (const uid of people) {
        if (!want.has(uid)) continue;
        out.set(uid, { serverId: String(call.serverId || ""), channelId: String(call.channelId || ""), channelName: call.channelName || null, with: people.filter((p) => p !== uid) });
      }
    }
  } catch {
    /* optional */
  }
  return out;
}

/** The whole center for `me`. */
async function stateFor(me, { now = Date.now(), state = require("../../runtime/sharedState") } = {}) {
  const db = store.db();
  const [settings, persons, links, me_] = await Promise.all([
    store.getSettings(me),
    store.listPersons(me),
    friendLinks(me),
    db.from("users").select("id, timezone, notify_friend_voice, email_notify_opt_out_at").eq("id", me).maybeSingle(),
  ]);
  const friends = [...links.keys()];
  const prefs = new Map((persons.rows || []).map((r) => [String(r.peer_id), R.normalizePerson(r)]));
  const ids = [...new Set([...friends, ...prefs.keys()])].slice(0, MAX_FRIENDS);
  const users = new Map();
  for (const part of store.chunks(ids)) {
    const { data } = await db.from("users").select("id, username, display_name, avatar_url, last_seen, presence_status, created_at").in("id", part);
    for (const u of data || []) users.set(String(u.id), u);
  }
  // Shared streaks and this month's "in voice" pushes about each person.
  const { rows: streaks } = await store.streaksOf(me).catch(() => ({ rows: [] }));
  const today = istDay(now);
  const streakBy = new Map(
    streaks.map((s) => {
      const peer = String(s.user_a) === String(me) ? String(s.user_b) : String(s.user_a);
      return [peer, R.streakView(s, today).count];
    })
  );
  const monthStart = new Date(now - 30 * DAY).toISOString();
  const { data: pushes } = await db
    .from("lifecycle_messages")
    .select("kind, meta, opened_at, return_kind")
    .eq("user_id", me)
    .like("kind", "friend_voice%")
    .gte("sent_at", monthStart)
    .limit(500);
  const voiceStats = new Map();
  for (const p of pushes || []) {
    const from = String(p.meta?.fromId || "");
    if (!from) continue;
    const v = voiceStats.get(from) || { called: 0, joined: 0 };
    v.called += 1;
    if (p.opened_at || p.return_kind === "voice") v.joined += 1;
    voiceStats.set(from, v);
  }
  const seats = voiceSeatOf(ids, state);
  const { data: memberships } = await db.from("server_members").select("server_id, notification_level").eq("user_id", me).limit(200);
  const serverIds = (memberships || []).map((m) => String(m.server_id));
  const mutual = new Map();
  if (serverIds.length && ids.length) {
    for (const part of store.chunks(ids, 100)) {
      const { data: mm } = await db.from("server_members").select("user_id, server_id").in("server_id", serverIds).in("user_id", part).limit(5000);
      for (const m of mm || []) mutual.set(String(m.user_id), (mutual.get(String(m.user_id)) || 0) + 1);
    }
  }
  const presence = (id) => state.presence?.get?.(id)?.status || (state.presence?.has?.(id) ? "online" : null);
  const serverNames = new Map();
  const wantServers = [...new Set([...seats.values()].map((s) => s.serverId).filter(Boolean))];
  if (wantServers.length) {
    const { data } = await db.from("servers").select("id, name").in("id", wantServers);
    for (const s of data || []) serverNames.set(String(s.id), s.name);
  }
  const people = ids
    .map((id) => {
      const u = users.get(id);
      if (!u) return null;
      const p = prefs.get(id) || R.normalizePerson(null);
      const seat = seats.get(id);
      return {
        id,
        username: u.username,
        name: u.display_name || u.username,
        avatarUrl: u.avatar_url || null,
        friend: links.has(id),
        friendSince: links.get(id) || null,
        mutualServers: mutual.get(id) || 0,
        presence: presence(id) || "offline",
        lastSeen: u.last_seen || null,
        voice: seat
          ? {
              serverId: seat.serverId,
              serverName: serverNames.get(seat.serverId) || null,
              channelId: seat.channelId,
              channelName: seat.channelName,
              withNames: seat.with.map((w) => users.get(w)?.display_name || users.get(w)?.username).filter(Boolean).slice(0, 3),
            }
          : null,
        sharedStreak: streakBy.get(id) || 0,
        thisMonth: voiceStats.get(id) || { called: 0, joined: 0 },
        prefs: p,
        badge: R.personBadge(p, now),
      };
    })
    .filter(Boolean);
  people.sort((a, b) => Number(b.prefs.important) - Number(a.prefs.important) || (Date.parse(a.prefs.importantAt || 0) - Date.parse(b.prefs.importantAt || 0)) || String(a.name).localeCompare(String(b.name), "tr"));

  // Servers: level + how many important people are members + messages this week.
  const servers = [];
  if (serverIds.length) {
    const { data: srv } = await db.from("servers").select("id, name, icon_url").in("id", serverIds);
    const importantIds = people.filter((p) => p.prefs.important).map((p) => p.id);
    const impBy = new Map();
    if (importantIds.length) {
      const { data: mem } = await db.from("server_members").select("server_id, user_id").in("server_id", serverIds).in("user_id", importantIds).limit(2000);
      for (const m of mem || []) impBy.set(String(m.server_id), (impBy.get(String(m.server_id)) || 0) + 1);
    }
    const weekAgo = new Date(now - 7 * DAY).toISOString();
    const counts = new Map();
    await Promise.all(
      serverIds.slice(0, 30).map(async (sid) => {
        const { count } = await db.from("server_messages").select("id", { count: "exact", head: true }).eq("server_id", sid).gte("created_at", weekAgo);
        counts.set(sid, Number(count) || 0);
      })
    );
    const levelOf = new Map((memberships || []).map((m) => [String(m.server_id), R.SERVER_LEVELS.includes(m.notification_level) ? m.notification_level : "all"]));
    for (const s of srv || []) {
      const id = String(s.id);
      servers.push({ id, name: s.name, iconUrl: s.icon_url || null, level: levelOf.get(id) || "all", importantHere: impBy.get(id) || 0, messagesThisWeek: counts.get(id) ?? null });
    }
    servers.sort((a, b) => b.importantHere - a.importantHere || (b.messagesThisWeek || 0) - (a.messagesThisWeek || 0));
  }
  const hist = (await store.hourHistograms([me], { now })).get(String(me)) || R.hourHistogram([]);
  return {
    ready: persons.ready !== false,
    settings,
    importantMax: R.IMPORTANT_MAX,
    importantCount: people.filter((p) => p.prefs.important).length,
    people,
    servers,
    emailOn: !me_?.data?.email_notify_opt_out_at,
    bestHour: R.bestHour(hist, settings),
    timezone: require("../reengagePolicy").recipientTimeZone(me_?.data?.timezone),
  };
}

/** Footnote of the drawer: pushes about `peer` today and when the next may come. */
async function nextWindow(me, peer, { now = Date.now() } = {}) {
  const [settings, person] = await Promise.all([store.getSettings(me), store.getPerson(me, peer)]);
  const { data: u } = await store.db().from("users").select("timezone").eq("id", me).maybeSingle();
  const { data } = await store
    .db()
    .from("lifecycle_messages")
    .select("kind, meta, sent_at")
    .eq("user_id", me)
    .like("kind", "friend_voice%")
    .gte("sent_at", new Date(now - DAY).toISOString())
    .limit(50);
  const normal = (data || []).filter((r) => String(r.kind).startsWith("friend_voice:")).map((r) => r.sent_at);
  const vip = (data || []).filter((r) => String(r.kind).startsWith(`friend_voice_vip:${peer}:`)).map((r) => r.sent_at);
  const fromPeer = (data || []).filter((r) => String(r.meta?.fromId || "") === String(peer)).length;
  const w = R.nextVoiceWindow({ person, settings, history: { normal, vip }, tz: u?.timezone }, now);
  return { ...w, fromPeerToday: fromPeer, earliestAt: new Date(w.earliestAt).toISOString(), nextAt: new Date(w.nextAt).toISOString() };
}

/** Save the account settings. */
async function saveSettings(me, body) {
  const current = await store.getSettings(me);
  const v = R.validateSettingsPatch(body, current);
  if (!v.ok) return v;
  await store.saveSettings(me, v.row);
  return { ok: true, settings: v.settings };
}

/** Save one person (important, levels, mute...). Mirrors "never" / "Sustur" into DM prefs. */
async function savePerson(me, peer, body, { now = Date.now() } = {}) {
  if (String(me) === String(peer)) return { ok: false, error: "self" };
  const [current, count] = await Promise.all([store.getPerson(me, peer), store.importantCount(me, peer)]);
  const v = R.validatePersonPatch(body, current, { importantCount: count, now });
  if (!v.ok) return v;
  await store.savePerson(me, peer, v.row);
  let mirrored = null;
  if (body.messages !== undefined || body.mute !== undefined) {
    try {
      const np = require("../notifyPrefs");
      const level = v.person.messages === "never" ? "none" : "all";
      const row = { conv_type: "dm", conv_id: peer, level, muted_until: v.person.mutedUntil };
      const out = await np.savePref(me, row);
      mirrored = out?.ok ? { convType: "dm", convId: peer, level, mutedUntil: v.person.mutedUntil } : null;
    } catch {
      /* the person row is the source of truth for growth 3B pushes */
    }
  }
  return { ok: true, person: v.person, badge: R.personBadge(v.person, now), dmPref: mirrored };
}

module.exports = { stateFor, nextWindow, saveSettings, savePerson, friendIds };
