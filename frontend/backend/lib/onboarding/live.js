"use strict";

/**
 * Live numbers for the "Başla panosu": which public servers are alive right now.
 *
 * Candidates are servers whose owner opted into in-app discovery (servers.is_public), not
 * hidden by Descall moderation, with a live owner account. For each one the snapshot holds
 * real counts only (members, visibly online, people in voice, messages in the last hour and
 * day, an hourly sparkline, the median reply time a newcomer got). Nothing here is invented:
 * a server without activity simply is not "live".
 *
 * One snapshot is shared by every request for SNAPSHOT_TTL_MS (singleflight), so a burst of
 * new accounts costs one scan. Errors read as an empty list, never a 500 for the dashboard.
 */

const model = require("./model");

const SNAPSHOT_TTL_MS = 60_000;
const CANDIDATES_MAX = 80;
const MEMBER_SCAN = 5000;
const MESSAGE_SCAN = 20000;
const DAY = model.DAY_MS;

function db() {
  return require("../../db/supabase");
}

function runtime() {
  const shared = require("../../runtime/sharedState");
  return { presence: shared.presence, voiceCalls: shared.activeServerVoiceCalls };
}

let ioRef = null;
function setIo(io) {
  if (io) ioRef = io;
}

let cache = { at: 0, value: null, asked: new Set() };
let inflight = null;

/** Global online sparkline: one sample every 5 minutes (process-local ring of 19). */
const SPARK_EVERY_MS = 5 * 60 * 1000;
const sparkRing = [];
function onlineNow() {
  try {
    const { summarizePresence } = require("../presenceRoster");
    return summarizePresence(runtime().presence, { io: ioRef }).visibleCount || 0;
  } catch {
    return 0;
  }
}
function sampleOnline(now = Date.now()) {
  const n = onlineNow();
  const last = sparkRing[sparkRing.length - 1];
  if (!last || now - last.at >= SPARK_EVERY_MS) {
    sparkRing.push({ at: now, n });
    while (sparkRing.length > 19) sparkRing.shift();
  } else {
    last.n = Math.max(last.n, n);
  }
  return { now: n, spark: sparkRing.map((s) => s.n) };
}

function voiceRooms(channelIds, namesById) {
  const { voiceCalls } = runtime();
  const rooms = [];
  let total = 0;
  for (const id of channelIds) {
    const call = voiceCalls?.get?.(String(id).toLowerCase()) || voiceCalls?.get?.(String(id));
    const size = call?.participants?.size || 0;
    if (!size) continue;
    total += size;
    const people = [];
    for (const p of call.participants.values()) {
      if (people.length >= 3) break;
      const name = p?.displayName || p?.display_name || p?.username || null;
      people.push({ id: p?.id ? String(p.id) : null, name, avatarUrl: p?.avatarUrl || p?.avatar_url || null, speaking: Boolean(p?.speaking) });
    }
    rooms.push({ id: String(id), name: namesById.get(String(id)) || "", count: size, people });
  }
  rooms.sort((a, b) => b.count - a.count);
  return { rooms, total };
}

async function pageAll(build, max) {
  const out = [];
  for (let from = 0; from < max; from += 1000) {
    const { data, error } = await build().range(from, from + 999);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

/** Owners that are not banned / deleted (columns degrade before migrations). */
async function liveOwners(ids) {
  const list = [...new Set(ids.filter(Boolean).map(String))];
  if (!list.length) return new Set();
  for (const cols of ["id, is_banned, deleted_at", "id, is_banned", "id"]) {
    const { data, error } = await db().from("users").select(cols).in("id", list);
    if (!error) return new Set((data || []).filter((u) => !u.is_banned && !u.deleted_at).map((u) => String(u.id)));
  }
  return new Set();
}

async function loadCandidates(extraIds = []) {
  const cols = "id, name, icon_url, description, owner_id, is_public, directory_category, directory_tags, directory_hidden_at, updated_at, welcome_channel_id, rules_text";
  let q = db().from("servers").select(cols).eq("is_public", true).order("updated_at", { ascending: false }).limit(CANDIDATES_MAX);
  let { data, error } = await q;
  if (error) {
    // Older schema without the directory columns.
    ({ data, error } = await db()
      .from("servers")
      .select("id, name, icon_url, description, owner_id, is_public, updated_at, welcome_channel_id, rules_text")
      .eq("is_public", true)
      .order("updated_at", { ascending: false })
      .limit(CANDIDATES_MAX));
    if (error) throw error;
  }
  let rows = (data || []).filter((r) => !r.directory_hidden_at);
  const extra = extraIds.filter((id) => id && !rows.some((r) => String(r.id) === String(id)));
  if (extra.length) {
    const { data: more } = await db().from("servers").select("id, name, icon_url, description, owner_id, is_public, welcome_channel_id, rules_text").in("id", extra);
    rows = rows.concat((more || []).map((r) => ({ ...r, extra: true })));
  }
  const owners = await liveOwners(rows.map((r) => r.owner_id));
  return rows.filter((r) => owners.has(String(r.owner_id)));
}

/**
 * Build the snapshot.
 * @returns {Promise<{ at: number, servers: object[], online: {now:number, spark:number[]} }>}
 */
async function buildSnapshot({ now = Date.now(), extraIds = [] } = {}) {
  const rows = await loadCandidates(extraIds);
  const ids = rows.map((r) => r.id);
  if (!ids.length) return { at: now, servers: [], online: sampleOnline(now) };
  const { presence } = runtime();
  const { countVisibleOnline } = require("../invitePreviewExtras");

  const [members, messages, channels] = await Promise.all([
    pageAll(() => db().from("server_members").select("server_id, user_id, joined_at").in("server_id", ids).order("server_id", { ascending: true }), MEMBER_SCAN),
    pageAll(
      () =>
        db()
          .from("server_messages")
          .select("server_id, channel_id, sender_id, created_at")
          .in("server_id", ids)
          .gte("created_at", new Date(now - 7 * DAY).toISOString())
          .order("created_at", { ascending: true }),
      MESSAGE_SCAN
    ).catch(() => []),
    pageAll(() => db().from("server_channels").select("id, server_id, name, type").in("server_id", ids).order("server_id", { ascending: true }), 5000).catch(() => []),
  ]);

  const memByServer = new Map();
  for (const m of members) {
    const k = String(m.server_id);
    if (!memByServer.has(k)) memByServer.set(k, []);
    memByServer.get(k).push(m);
  }
  const msgByServer = new Map();
  for (const m of messages) {
    const k = String(m.server_id);
    if (!msgByServer.has(k)) msgByServer.set(k, []);
    msgByServer.get(k).push(m);
  }
  const voiceByServer = new Map();
  const nameById = new Map();
  for (const c of channels) {
    nameById.set(String(c.id), c.name || "");
    if (c.type !== "voice" && c.type !== "stage") continue;
    const k = String(c.server_id);
    if (!voiceByServer.has(k)) voiceByServer.set(k, []);
    voiceByServer.get(k).push(c.id);
  }

  const servers = rows.map((r) => {
    const k = String(r.id);
    const mem = memByServer.get(k) || [];
    const msgs = msgByServer.get(k) || [];
    const stamps = msgs.map((m) => Date.parse(m.created_at));
    const lastHour = stamps.filter((t) => now - t < 3600000).length;
    const last24h = stamps.filter((t) => now - t < DAY).length;
    const joinedAt = new Map(mem.filter((m) => m.joined_at).map((m) => [String(m.user_id), Date.parse(m.joined_at)]));
    const replyMinutes = model.medianReplyMinutes(msgs, joinedAt, { now });
    const voice = voiceRooms(voiceByServer.get(k) || [], nameById);
    const online = countVisibleOnline(mem.map((m) => m.user_id), presence, ioRef);
    const category = model.inferCategory({ category: r.directory_category, name: r.name, description: r.description, tags: r.directory_tags });
    const s = {
      id: k,
      name: r.name,
      iconUrl: r.icon_url || null,
      category,
      isPublic: Boolean(r.is_public),
      members: mem.length,
      online,
      lastHour,
      last24h,
      today: stamps.filter((t) => model.localDay(t) === model.localDay(now)).length,
      spark: model.hourlySeries(stamps, { now }),
      crowd: model.crowdHours(stamps),
      replyMinutes,
      inVoice: voice.total,
      voice: voice.rooms[0] || null,
      rulesCount: String(r.rules_text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean).length,
      welcomeChannelId: r.welcome_channel_id || null,
      memberIds: mem.map((m) => String(m.user_id)),
    };
    s.score = model.livenessScore(s);
    return s;
  });
  return { at: now, servers, online: sampleOnline(now) };
}

async function snapshot({ fresh = false, extraIds = [] } = {}) {
  const now = Date.now();
  const missing = extraIds.some((id) => id && !cache.asked?.has(String(id)));
  if (!fresh && !missing && cache.value && now - cache.at < SNAPSHOT_TTL_MS) {
    return { ...cache.value, online: sampleOnline(now) };
  }
  if (!inflight) {
    inflight = buildSnapshot({ now, extraIds })
      .then((value) => {
        cache = { at: Date.now(), value, asked: new Set(extraIds.filter(Boolean).map(String)) };
        return value;
      })
      .catch((err) => {
        console.warn("[onboarding] live snapshot failed:", err?.message || err);
        return cache.value || { at: now, servers: [], online: sampleOnline(now) };
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/** Public card shape (no member ids). */
function publicCard(s) {
  if (!s) return null;
  return {
    id: s.id,
    name: s.name,
    iconUrl: s.iconUrl,
    category: s.category,
    members: s.members,
    online: s.online,
    lastHour: s.lastHour,
    today: s.today,
    spark: s.spark,
    replyMinutes: s.replyMinutes,
    inVoice: s.inVoice,
    voice: s.voice,
    rank: s.rank || null,
    matched: Boolean(s.matched),
  };
}

function __resetForTests() {
  cache = { at: 0, value: null, asked: new Set() };
  inflight = null;
  sparkRing.length = 0;
}

module.exports = { snapshot, buildSnapshot, publicCard, sampleOnline, setIo, voiceRooms, __resetForTests, SNAPSHOT_TTL_MS };
