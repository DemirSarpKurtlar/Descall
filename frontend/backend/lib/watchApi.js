"use strict";

/**
 * Apple Watch API shaping (3.7.17). Pure functions, no I/O.
 *
 * The watch app talks to the iPhone over WatchConnectivity and the iPhone calls
 * /api/watch/* with the signed-in session, so every payload here is small and
 * flat: no cosmetics, no banners, no raw user agents, no e-mail fields.
 *
 *   shapeHome    → { me, conversations[], adminSections }
 *   shapeFriends → { online[], offlineCount }
 *   shapeThread  → { conv, title, subtitle, messages[] }
 */

const STATUSES = ["online", "idle", "dnd", "invisible"];
const MAX_CONVERSATIONS = 30;
const MAX_ONLINE = 40;
const PREVIEW_MAX = 90;
const { bt } = require("./i18n");

// Media words the watch shows, in the account's language (backend/i18n/<locale>.js watch.*).
const KIND_KEYS = { image: "watch.photo", gif: "watch.gif", video: "watch.video", voice: "watch.voice", file: "watch.file", poll: "watch.poll" };

function kindLabel(kind, lang) {
  return KIND_KEYS[kind] ? bt(lang, KIND_KEYS[kind]) : "";
}

function clip(s, n) {
  const t = String(s == null ? "" : s).replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

/** Same rule as the web letter avatar (src/lib/avatarFallback.js avatarInitials). */
function initialsOf(name) {
  const parts = String(name || "")
    .trim()
    .replace(/^@+/, "")
    .split(/[\s._\-]+/u)
    .map((p) => p.replace(/^[^\p{L}\p{N}]+/u, ""))
    .filter(Boolean);
  if (!parts.length) return "?";
  const first = Array.from(parts[0])[0] || "";
  const second = parts.length > 1 ? Array.from(parts[1])[0] || "" : "";
  return (first + second).toLocaleUpperCase("tr-TR") || "?";
}

function displayName(u) {
  return String(u?.displayName || u?.display_name || u?.username || "").trim() || "?";
}

/** Only https avatars reach the watch (no data: URLs, no http). */
function safeAvatar(url) {
  return typeof url === "string" && /^https:\/\/[^\s]{1,500}$/.test(url) ? url : null;
}

function presenceOf(status) {
  if (status === "invisible") return "offline";
  return ["online", "idle", "dnd"].includes(status) ? status : "offline";
}

/* formatDmPreview / formatGroupListPreview label media with an emoji + English word;
   the watch shows a plain word in the account's language instead (no emoji in the UI, owner rule). */
const PREVIEW_LABELS = [
  ["\u{1F4DE} Call", "watch.call"],
  ["\u{1F4F7} Photo", "watch.photo"],
  ["\u{1F3A4} Voice message", "watch.voice"],
  ["\u{1F4CE} Attachment", "watch.file"],
];

function localizePreview(text, lang = "tr") {
  let out = String(text || "");
  for (const [from, key] of PREVIEW_LABELS) out = out.split(from).join(bt(lang, key));
  return out;
}

/** Preview text from formatDmPreview / formatGroupListPreview results (string or object). */
function previewText(p, lang = "tr") {
  if (!p) return "";
  if (typeof p === "string") return clip(localizePreview(p, lang), PREVIEW_MAX);
  const kind = p.kind || p.type || null;
  const text = p.text || p.content || p.preview || "";
  if (text) return clip(localizePreview(text, lang), PREVIEW_MAX);
  return kindLabel(kind, lang);
}

function toMs(at) {
  const t = at ? new Date(at).getTime() : 0;
  return Number.isFinite(t) ? t : 0;
}

/**
 * @param {object} args
 * @param {object} args.me            enriched own entry ({ id, username, displayName, avatarUrl })
 * @param {string} args.myStatus      stored presence status (online / idle / dnd / invisible)
 * @param {object[]} args.friends     enriched friend entries (enrichFriendEntry)
 * @param {object} args.previews      dmPreviewsByPeer
 * @param {object} args.lastActivity  dmLastActivityByPeer
 * @param {object[]} args.groups      getUserGroups() items
 * @param {string[]|null} args.adminSections sections the account may open, null for non-admins
 */
function shapeHome({ me, myStatus, friends = [], previews = {}, lastActivity = {}, groups = [], adminSections = null, lang = "tr" }) {
  const rows = [];
  for (const f of friends) {
    if (!f?.id) continue;
    const at = lastActivity[f.id] || null;
    const text = previewText(previews[f.id], lang);
    if (!at && !text) continue;
    const name = displayName(f);
    rows.push({
      conv: `dm:${f.id}`,
      kind: "dm",
      title: name,
      initials: initialsOf(name),
      avatarUrl: safeAvatar(f.avatarUrl),
      presence: presenceOf(f.status),
      preview: text,
      at,
    });
  }
  for (const g of groups) {
    if (!g?.id || g.removed || g.removedAt) continue;
    const name = clip(g.name || "Grup", 40);
    rows.push({
      conv: `group:${g.id}`,
      kind: "group",
      title: name,
      initials: initialsOf(name),
      avatarUrl: safeAvatar(g.avatarUrl),
      presence: null,
      preview: previewText(g.lastMessage, lang),
      at: g.lastActivity || null,
    });
  }
  rows.sort((a, b) => toMs(b.at) - toMs(a.at));
  const meName = displayName(me);
  return {
    me: {
      id: me?.id || null,
      name: meName,
      username: me?.username || null,
      initials: initialsOf(meName),
      avatarUrl: safeAvatar(me?.avatarUrl),
      status: STATUSES.includes(myStatus) ? myStatus : "online",
    },
    conversations: rows.slice(0, MAX_CONVERSATIONS),
    adminSections: Array.isArray(adminSections) && adminSections.length ? adminSections : null,
  };
}

const PRESENCE_ORDER = { online: 0, idle: 1, dnd: 2 };

function shapeFriends(friends = []) {
  const online = [];
  let offlineCount = 0;
  for (const f of friends) {
    if (!f?.id) continue;
    const presence = presenceOf(f.status);
    if (presence === "offline") {
      offlineCount += 1;
      continue;
    }
    const name = displayName(f);
    online.push({
      id: f.id,
      conv: `dm:${f.id}`,
      name,
      initials: initialsOf(name),
      avatarUrl: safeAvatar(f.avatarUrl),
      presence,
      customStatus: f.customStatus ? clip(f.customStatus, 60) : null,
    });
  }
  online.sort((a, b) => (PRESENCE_ORDER[a.presence] - PRESENCE_ORDER[b.presence]) || a.name.localeCompare(b.name, "tr"));
  return { online: online.slice(0, MAX_ONLINE), onlineCount: online.length, offlineCount };
}

function shapeThread(out, { lang = "tr" } = {}) {
  return {
    conv: out?.conv || null,
    title: clip(out?.title || "", 40),
    subtitle: clip(out?.subtitle || "", 40),
    messages: (Array.isArray(out?.messages) ? out.messages : []).map((m) => ({
      id: String(m.id),
      mine: Boolean(m.mine),
      author: clip(m.fromName || "", 30),
      text: m.text || kindLabel(m.kind, lang),
      kind: m.kind || "text",
      at: m.at || null,
    })),
  };
}


/* ---- 3.7.33: servers, calls, activity (the iOS tab bar on the watch) ---- */

const MAX_SERVERS = 40;
const MAX_CHANNELS = 30;
const MAX_CALLS = 25;
const MAX_REQUESTS = 15;
// Only text channels open on the watch (voice, stage and categories stay on the phone).
const WATCH_CHANNEL_TYPES = new Set(["text", "announcement"]);

/**
 * buildMyServerList() result (channels are already filtered to what the member may view)
 * → { servers: [{ id, name, initials, iconUrl, memberCount, muted, timedOut, channels: [{ conv, name, category }] }] }
 */
function shapeServers(payload, { now = Date.now() } = {}) {
  const list = Array.isArray(payload?.servers) ? payload.servers : [];
  const servers = [];
  for (const s of list) {
    if (!s?.id) continue;
    const all = Array.isArray(s.channels) ? s.channels : [];
    const categories = new Map(all.filter((c) => c?.type === "category").map((c) => [c.id, clip(c.name, 30)]));
    const channels = all
      .filter((c) => c?.id && WATCH_CHANNEL_TYPES.has(String(c.type || "text")) && !c.nsfw && validConv(`channel:${c.id}`))
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .slice(0, MAX_CHANNELS)
      .map((c) => ({ conv: `channel:${c.id}`, name: clip(c.name || "kanal", 40), category: categories.get(c.parentId) || null }));
    const name = clip(s.name || "Sunucu", 40);
    const timeoutMs = s.timeoutUntil ? toMs(s.timeoutUntil) : 0;
    servers.push({
      id: String(s.id),
      name,
      initials: initialsOf(name),
      iconUrl: safeAvatar(s.iconUrl),
      memberCount: Number(s.memberCount) || 0,
      muted: s.notificationLevel === "muted",
      timedOut: timeoutMs > now,
      channels,
    });
  }
  return { servers: servers.slice(0, MAX_SERVERS) };
}

/** listCallsForUser() rows → { calls: [{ id, kind, title, initials, avatarUrl, conv, direction, video, missed, durationSec, at }] } */
function shapeCalls(rows = []) {
  const calls = [];
  for (const c of Array.isArray(rows) ? rows : []) {
    if (!c?.id) continue;
    const group = c.kind === "group";
    const peerName = group ? clip(c.group?.name || "Grup", 40) : displayName(c.peer);
    const peerId = group ? c.group?.id : c.peer?.id;
    const conv = peerId && validConv(`${group ? "group" : "dm"}:${peerId}`) ? `${group ? "group" : "dm"}:${peerId}` : null;
    const status = String(c.status || "");
    // dm_calls: completed / missed / cancelled / declined. A ring the caller gave up on is
    // missed for the callee; an outgoing call nobody answered is not "missed" for the caller.
    const missed = group ? status === "missed" : c.direction === "incoming" && (status === "missed" || status === "cancelled");
    calls.push({
      id: String(c.id),
      kind: group ? "group" : "dm",
      title: peerName,
      initials: initialsOf(peerName),
      avatarUrl: safeAvatar(group ? c.group?.avatarUrl : c.peer?.avatarUrl),
      conv,
      direction: group ? "group" : (c.direction === "outgoing" ? "outgoing" : "incoming"),
      video: c.callType === "video",
      missed,
      active: status === "active",
      durationSec: Number.isFinite(Number(c.durationSeconds)) ? Math.max(0, Math.round(Number(c.durationSeconds))) : null,
      at: c.createdAt || c.endedAt || c.startedAt || null,
    });
  }
  return { calls: calls.slice(0, MAX_CALLS) };
}

/**
 * Notifications on the watch ("Etkinlik"): incoming friend requests + missed calls of
 * the last 7 days, newest first. → { items: [{ id, type, title, initials, avatarUrl, conv, at }], requestCount, missedCount }
 */
function shapeActivity({ requests = [], calls = [], now = Date.now() } = {}) {
  const items = [];
  for (const r of (Array.isArray(requests) ? requests : []).slice(0, MAX_REQUESTS)) {
    if (!r?.id) continue;
    const name = displayName(r);
    items.push({ id: `req:${r.id}`, type: "friendRequest", title: name, initials: initialsOf(name), avatarUrl: safeAvatar(r.avatarUrl || r.avatar_url), conv: null, at: r.requestedAt || null });
  }
  const weekAgo = now - 7 * 24 * 3600 * 1000;
  let missedCount = 0;
  for (const c of shapeCalls(calls).calls) {
    if (!c.missed || toMs(c.at) < weekAgo) continue;
    missedCount += 1;
    items.push({ id: `call:${c.id}`, type: c.video ? "missedVideo" : "missedCall", title: c.title, initials: c.initials, avatarUrl: c.avatarUrl, conv: c.conv, at: c.at });
  }
  items.sort((a, b) => toMs(b.at) - toMs(a.at));
  return { items: items.slice(0, 30), requestCount: Math.min(requests?.length || 0, 99), missedCount };
}

/** conv must look like dm:<id>, group:<id> or channel:<id> with a uuid-ish id. */
function validConv(conv) {
  return /^(dm|group|channel):[0-9a-zA-Z-]{1,64}$/.test(String(conv || ""));
}

module.exports = {
  STATUSES,
  MAX_CONVERSATIONS,
  initialsOf,
  previewText,
  presenceOf,
  safeAvatar,
  shapeHome,
  shapeFriends,
  shapeThread,
  validConv,
  shapeServers,
  shapeCalls,
  shapeActivity,
};
