"use strict";

/**
 * Native glance API shaping (4.2: Siri / Shortcuts / Spotlight, iOS widgets, Live Activity,
 * Android shortcuts). Pure functions, no I/O; routes/native.js does the reads.
 *
 * Every payload is small and flat for native clients (Swift DescallKit/DescallModels.swift,
 * Android DescallShortcutsPlugin): no cosmetics, no e-mail, https avatars only.
 *
 *   shapeFriendList   → { friends: [{ id, username, name, initials, avatarUrl, presence, customStatus, conv }] }
 *   shapeUnread       → { total, dms, groups, channels, top: [{ conv, kind, title, count }] }
 *   shapeVoiceRooms   → [{ serverId, serverName, channelId, channelName, type, occupantCount, occupants[] }]
 *   shapeDestinations → { destinations: [{ id, kind, title, subtitle, serverId, channelId, groupId }] }
 *   shapeSummary      → { me, unread, friends: { onlineCount, offlineCount, online[] }, voice[], generatedAt }
 */

const watch = require("./watchApi");

const STATUSES = ["online", "idle", "dnd", "invisible"];
const MAX_FRIENDS = 200;
const MAX_ONLINE_GLANCE = 12;
const MAX_TOP_UNREAD = 8;
const MAX_VOICE_ROOMS = 20;
const MAX_OCCUPANTS = 8;
const MAX_DESTINATIONS = 60;
const COUNT_CAP = 99;
const TOTAL_CAP = 999;
const VOICE_TYPES = new Set(["voice", "stage"]);
const TEXT_TYPES = new Set(["text", "announcement"]);
const PRESENCE_ORDER = { online: 0, idle: 1, dnd: 2, offline: 3 };

function clip(s, n) {
  const t = String(s == null ? "" : s).replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

function nameOf(u) {
  return clip(u?.displayName || u?.display_name || u?.username || "", 40) || "?";
}

function fold(s) {
  return String(s || "").toLocaleLowerCase("tr-TR").normalize("NFKD").replace(/[̀-ͯ]/g, "");
}

function matches(q, ...fields) {
  const needle = fold(q).trim();
  if (!needle) return true;
  return fields.some((f) => fold(f).includes(needle));
}

function capCount(n, cap = COUNT_CAP) {
  const v = Math.floor(Number(n) || 0);
  return v > 0 ? Math.min(cap, v) : 0;
}

function idOk(id) {
  return /^[0-9a-zA-Z-]{1,64}$/.test(String(id || ""));
}

/** Read an object or a Map the same way. */
function entriesOf(m) {
  if (!m) return [];
  if (m instanceof Map) return [...m.entries()];
  if (typeof m === "object") return Object.entries(m);
  return [];
}

/**
 * Friend entries (profile.enrichFriendEntry rows) → the full friend list with presence.
 * q filters on username / display name (accent and case folded); ids keeps only those ids.
 */
function shapeFriendList(entries = [], { q = "", ids = null, limit = MAX_FRIENDS } = {}) {
  const allow = Array.isArray(ids) && ids.length ? new Set(ids.map(String)) : null;
  const out = [];
  for (const f of Array.isArray(entries) ? entries : []) {
    if (!f?.id || !idOk(f.id)) continue;
    if (allow && !allow.has(String(f.id))) continue;
    const name = nameOf(f);
    if (!matches(q, f.username, name)) continue;
    out.push({
      id: String(f.id),
      username: f.username && f.username !== "?" ? String(f.username) : null,
      name,
      initials: watch.initialsOf(name),
      avatarUrl: watch.safeAvatar(f.avatarUrl),
      presence: watch.presenceOf(f.status),
      customStatus: f.customStatus ? clip(f.customStatus, 60) : null,
      conv: `dm:${f.id}`,
    });
  }
  out.sort((a, b) => (PRESENCE_ORDER[a.presence] - PRESENCE_ORDER[b.presence]) || a.name.localeCompare(b.name, "tr"));
  return { friends: out.slice(0, Math.max(1, Math.min(MAX_FRIENDS, Number(limit) || MAX_FRIENDS))) };
}

/**
 * Unread counts across DMs, groups and server text channels.
 * @param {object} a
 * @param {Map|object} a.dmUnreadByPeer   peerId → count (friends only)
 * @param {Map|object} a.groupUnread      groupId → count
 * @param {Map|object} a.channelUnread    channelId → count (muted servers already left out)
 * @param {Map} a.friendsById             peerId → friend entry
 * @param {Map} a.groupsById              groupId → { name }
 * @param {Map} a.channelsById            channelId → { name, serverName }
 * @param {Set} a.mutedPeers              DMs the user muted (not counted)
 */
function shapeUnread({ dmUnreadByPeer, groupUnread, channelUnread, friendsById = new Map(), groupsById = new Map(), channelsById = new Map(), mutedPeers = new Set() } = {}) {
  const rows = [];
  let dms = 0;
  let groups = 0;
  let channels = 0;
  for (const [peer, raw] of entriesOf(dmUnreadByPeer)) {
    const n = capCount(raw);
    if (!n || !idOk(peer) || mutedPeers.has(String(peer))) continue;
    const f = friendsById.get(String(peer));
    if (!f) continue; // friends only, like the in-app badge
    dms += n;
    rows.push({ conv: `dm:${peer}`, kind: "dm", title: nameOf(f), count: n });
  }
  for (const [gid, raw] of entriesOf(groupUnread)) {
    const n = capCount(raw);
    const g = groupsById.get(String(gid));
    if (!n || !idOk(gid) || !g) continue;
    groups += n;
    rows.push({ conv: `group:${gid}`, kind: "group", title: clip(g.name || "Grup", 40), count: n });
  }
  for (const [cid, raw] of entriesOf(channelUnread)) {
    const n = capCount(raw);
    const c = channelsById.get(String(cid));
    if (!n || !idOk(cid) || !c) continue;
    channels += n;
    const title = c.serverName ? `${clip(c.serverName, 24)} #${clip(c.name, 24)}` : `#${clip(c.name, 40)}`;
    rows.push({ conv: `channel:${cid}`, kind: "channel", title, count: n, serverId: c.serverId ? String(c.serverId) : null });
  }
  rows.sort((a, b) => b.count - a.count || a.title.localeCompare(b.title, "tr"));
  return {
    total: Math.min(TOTAL_CAP, dms + groups + channels),
    dms: Math.min(TOTAL_CAP, dms),
    groups: Math.min(TOTAL_CAP, groups),
    channels: Math.min(TOTAL_CAP, channels),
    top: rows.slice(0, MAX_TOP_UNREAD),
  };
}

function occupantOf(member, key) {
  const id = String(member?.id || key || "");
  if (!idOk(id)) return null;
  const name = nameOf(member);
  return { id, name, initials: watch.initialsOf(name), avatarUrl: watch.safeAvatar(member?.avatarUrl || member?.avatar_url) };
}

/**
 * Voice / stage channels the user can see, with who is in them.
 * @param {object[]} servers   buildMyServerList().servers (channels already filtered to VIEW_CHANNEL)
 * @param {Map} activeCalls    sharedState.activeServerVoiceCalls (channelId → { participants: Map })
 * @param {object} opts        q: filter; occupiedOnly: only rooms with someone in them
 */
function shapeVoiceRooms(servers = [], activeCalls = new Map(), { q = "", occupiedOnly = false, limit = MAX_VOICE_ROOMS } = {}) {
  const rooms = [];
  let serverIndex = -1;
  for (const s of Array.isArray(servers) ? servers : []) {
    serverIndex += 1;
    if (!s?.id) continue;
    const serverName = clip(s.name || "Sunucu", 40);
    for (const c of Array.isArray(s.channels) ? s.channels : []) {
      if (!c?.id || !idOk(c.id) || !VOICE_TYPES.has(String(c.type || ""))) continue;
      const channelName = clip(c.name || "ses", 40);
      if (!matches(q, channelName, serverName)) continue;
      const call = activeCalls?.get?.(c.id) || activeCalls?.get?.(String(c.id)) || null;
      const occupants = [];
      let count = 0;
      if (call?.participants) {
        for (const [key, member] of entriesOf(call.participants)) {
          const o = occupantOf(member, key);
          if (!o) continue;
          count += 1;
          if (occupants.length < MAX_OCCUPANTS) occupants.push(o);
        }
      }
      if (occupiedOnly && !count) continue;
      rooms.push({
        serverId: String(s.id),
        serverName,
        channelId: String(c.id),
        channelName,
        type: String(c.type) === "stage" ? "stage" : "voice",
        occupantCount: count,
        occupants,
        position: Number(c.position) || 0,
        serverIndex,
      });
    }
  }
  // Busy rooms first, then the user's own server order (list_position) and channel order.
  rooms.sort((a, b) => b.occupantCount - a.occupantCount || a.serverIndex - b.serverIndex || a.position - b.position);
  return rooms.slice(0, Math.max(1, Number(limit) || MAX_VOICE_ROOMS)).map(({ position, serverIndex: _i, ...r }) => r);
}

/** Servers, their text channels and groups, for "open ..." intents and Spotlight. */
function shapeDestinations({ servers = [], groups = [], q = "", limit = MAX_DESTINATIONS } = {}) {
  const out = [];
  for (const s of Array.isArray(servers) ? servers : []) {
    if (!s?.id || !idOk(s.id)) continue;
    const serverName = clip(s.name || "Sunucu", 40);
    if (matches(q, serverName)) {
      out.push({ id: `server:${s.id}`, kind: "server", title: serverName, subtitle: null, serverId: String(s.id), channelId: null, groupId: null });
    }
    const chans = (Array.isArray(s.channels) ? s.channels : [])
      .filter((c) => c?.id && idOk(c.id) && TEXT_TYPES.has(String(c.type || "text")) && !c.nsfw)
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    for (const c of chans) {
      const name = clip(c.name || "kanal", 40);
      if (!matches(q, name, serverName)) continue;
      out.push({ id: `channel:${c.id}`, kind: "channel", title: `#${name}`, subtitle: serverName, serverId: String(s.id), channelId: String(c.id), groupId: null });
    }
  }
  for (const g of Array.isArray(groups) ? groups : []) {
    if (!g?.id || !idOk(g.id) || g.removed || g.removedAt) continue;
    const name = clip(g.name || "Grup", 40);
    if (!matches(q, name)) continue;
    out.push({ id: `group:${g.id}`, kind: "group", title: name, subtitle: null, serverId: null, channelId: null, groupId: String(g.id) });
  }
  return { destinations: out.slice(0, Math.max(1, Number(limit) || MAX_DESTINATIONS)) };
}

function shapeSummary({ me = {}, myStatus = "online", friends = [], unread, voice = [], now = Date.now() } = {}) {
  const list = shapeFriendList(friends).friends;
  const online = list.filter((f) => f.presence !== "offline");
  const name = nameOf(me);
  return {
    me: {
      id: me?.id ? String(me.id) : null,
      username: me?.username || null,
      name,
      initials: watch.initialsOf(name),
      avatarUrl: watch.safeAvatar(me?.avatarUrl),
      status: STATUSES.includes(myStatus) ? myStatus : "online",
    },
    unread: unread || shapeUnread(),
    friends: { onlineCount: online.length, offlineCount: list.length - online.length, online: online.slice(0, MAX_ONLINE_GLANCE) },
    voice: Array.isArray(voice) ? voice.filter((r) => r.occupantCount > 0).slice(0, MAX_VOICE_ROOMS) : [],
    generatedAt: new Date(now).toISOString(),
  };
}

module.exports = {
  STATUSES,
  MAX_FRIENDS,
  MAX_OCCUPANTS,
  COUNT_CAP,
  TOTAL_CAP,
  fold,
  matches,
  shapeFriendList,
  shapeUnread,
  shapeVoiceRooms,
  shapeDestinations,
  shapeSummary,
};
