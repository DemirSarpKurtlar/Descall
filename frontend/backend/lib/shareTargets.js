"use strict";

/**
 * "Paylaş > Descall" (iOS share extension, Android share target, web share target).
 * Pure shaping and rules; routes/share.js and lib/shareService.js do the I/O.
 *
 *   shapeTargets   → { recents[], friends[], groups[], servers[] } for the share sheet list
 *   channelVerdict → can this member post (and attach) in this text channel, and why not
 *   pickRecents    → recent conversations from my own latest messages (+ "last shared" info)
 *   normalizeLink  → comparable form of a shared URL (duplicate-send warning)
 *   findDuplicates → which of the shared links / files already went to a conversation
 *   slowmodePlan   → when the remaining items of a slow-mode channel can go out
 *
 * Every conversation is addressed as "dm:<userId>", "group:<id>" or "channel:<id>" (the
 * same thread ids notifications, Siri and the Apple Watch use).
 */

const watch = require("./watchApi");

const MAX_ITEMS = 10;
const MAX_TEXT = 2000;
const MAX_FILE_BYTES = 100 * 1024 * 1024; // routes/media.js MAX_FILE_SIZE
const MAX_RECENTS = 8;
const MAX_FRIENDS = 200;
const MAX_GROUPS = 100;
const MAX_SERVERS = 50;
const MAX_CHANNELS_PER_SERVER = 60;
const DUPLICATE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const UNDO_WINDOW_MS = 2 * 60 * 1000;
// What /api/media/upload accepts (routes/media.js ALLOWED_*). Audio is left out: voice notes
// are recorded in the app; a shared audio file still goes as a document when its type is allowed.
const UPLOAD_MIMES = Object.freeze([
  "image/jpeg", "image/png", "image/webp", "image/gif",
  "video/mp4", "video/webm",
  "application/pdf", "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain", "text/csv", "application/zip", "application/x-zip-compressed", "application/x-rar-compressed",
  "application/json",
  "audio/mpeg", "audio/mp4", "audio/aac", "audio/x-m4a", "audio/m4a", "audio/wav", "audio/ogg", "audio/webm",
]);
const PRESENCE_ORDER = { online: 0, idle: 1, dnd: 2, offline: 3 };
const TEXT_TYPES = new Set(["text", "announcement"]);
const CONV_RE = /^(dm|group|channel):([0-9A-Za-z-]{1,64})$/;

// Permission bits (lib/serverPermissions.js), copied as BigInt so this file stays pure.
const BITS = Object.freeze({
  ADMINISTRATOR: 1n << 3n,
  MANAGE_CHANNELS: 1n << 4n,
  VIEW_CHANNEL: 1n << 10n,
  SEND_MESSAGES: 1n << 11n,
  MANAGE_MESSAGES: 1n << 13n,
  ATTACH_FILES: 1n << 15n,
});

function has(bits, flag) {
  let b;
  try {
    b = typeof bits === "bigint" ? bits : BigInt(bits || 0);
  } catch {
    return false;
  }
  if ((b & BITS.ADMINISTRATOR) === BITS.ADMINISTRATOR) return true;
  return (b & flag) === flag;
}

function clip(s, n) {
  const t = String(s == null ? "" : s).replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

function fold(s) {
  return String(s || "").toLocaleLowerCase("tr-TR").normalize("NFKD").replace(/[̀-ͯ]/g, "");
}

function idOk(id) {
  return /^[0-9a-zA-Z-]{1,64}$/.test(String(id || ""));
}

function parseConv(conv) {
  const m = CONV_RE.exec(String(conv || ""));
  return m ? { type: m[1], id: m[2], conv: `${m[1]}:${m[2]}` } : null;
}

function toTime(v) {
  const t = v instanceof Date ? v.getTime() : Date.parse(String(v || ""));
  return Number.isFinite(t) ? t : 0;
}

/**
 * Can I post here? bits: my channel bits (BigInt), sendAllowed: an overwrite explicitly
 * allows SEND_MESSAGES (announcement channels), timeoutUntil: my server timeout.
 * → { canSend, canAttach, reason, slowModeSec } with reason one of
 *   null | "no_permission" | "announcement" | "timed_out" | "no_attach".
 * Same rules as assertTextChannelAccess + the attachment check in server:channel:message.
 */
function channelVerdict({ type = "text", bits = 0n, sendAllowed = false, isOwner = false, slowmodeSeconds = 0, timeoutUntil = null, siteTimedOut = false, now = Date.now() } = {}) {
  const all = isOwner || has(bits, BITS.ADMINISTRATOR);
  const view = all || has(bits, BITS.VIEW_CHANNEL);
  const send = all || has(bits, BITS.SEND_MESSAGES);
  const manage = all || has(bits, BITS.MANAGE_MESSAGES);
  const slow = Math.max(0, Math.floor(Number(slowmodeSeconds) || 0));
  const slowModeSec = slow && !manage ? slow : 0;
  const out = (canSend, reason, canAttach = canSend) => ({ canSend, canAttach: canSend && canAttach, reason, slowModeSec });
  if (!view || !send) return out(false, "no_permission");
  if (type === "announcement" && !manage && !sendAllowed) return out(false, "announcement");
  if (!all && (siteTimedOut || toTime(timeoutUntil) > now)) return out(false, "timed_out");
  const attach = all || has(bits, BITS.ATTACH_FILES);
  return attach ? out(true, null) : out(true, "no_attach", false);
}

/**
 * My latest messages (dm / group / channel rows, newest first, any order across tables)
 * → { order: [conv...], byConv: Map(conv → { at, mediaCount }) }. mediaCount counts my
 * attachments in that conversation on the same day as the latest one ("dün 3 fotoğraf").
 */
function pickRecents(rows = [], { limit = MAX_RECENTS } = {}) {
  const byConv = new Map();
  for (const r of Array.isArray(rows) ? rows : []) {
    const p = parseConv(r?.conv);
    const at = toTime(r?.at);
    if (!p || !at) continue;
    const cur = byConv.get(p.conv) || { at: 0, mediaCount: 0, days: new Map() };
    if (at > cur.at) cur.at = at;
    if (r.media) {
      const day = new Date(at).toISOString().slice(0, 10);
      cur.days.set(day, (cur.days.get(day) || 0) + 1);
    }
    byConv.set(p.conv, cur);
  }
  for (const v of byConv.values()) {
    const day = new Date(v.at).toISOString().slice(0, 10);
    v.mediaCount = v.days.get(day) || 0;
    delete v.days;
  }
  const order = [...byConv.entries()].sort((a, b) => b[1].at - a[1].at).map(([c]) => c);
  return { order: order.slice(0, Math.max(1, Number(limit) || MAX_RECENTS)), all: order, byConv };
}

function lastShared(byConv, conv) {
  const v = byConv?.get?.(conv);
  if (!v) return null;
  return { at: new Date(v.at).toISOString(), mediaCount: v.mediaCount || 0 };
}

/** Rank inside a section: recent conversations first (most recent on top), then by name. */
function rankByRecent(list, recentOrder) {
  const pos = new Map((recentOrder || []).map((c, i) => [c, i]));
  return list.sort((a, b) => {
    const pa = pos.has(a.conv) ? pos.get(a.conv) : Infinity;
    const pb = pos.has(b.conv) ? pos.get(b.conv) : Infinity;
    if (pa !== pb) return pa - pb;
    return (PRESENCE_ORDER[a.presence] ?? 0) - (PRESENCE_ORDER[b.presence] ?? 0) || a.name.localeCompare(b.name, "tr");
  });
}

/**
 * Everything the share sheet lists.
 * friends: profile.enrichFriendEntry rows; groups: groupList.getUserGroups rows;
 * servers: buildMyServerList servers (VIEW-filtered channels); verdicts: Map(channelId →
 * channelVerdict); recentRows: see pickRecents; onlineIds: Set of online user ids.
 */
function shapeTargets({ friends = [], groups = [], servers = [], verdicts = new Map(), recentRows = [], onlineIds = new Set(), now = Date.now() } = {}) {
  const recents = pickRecents(recentRows);
  const outFriends = [];
  for (const f of Array.isArray(friends) ? friends : []) {
    if (!f?.id || !idOk(f.id)) continue;
    const name = clip(f.displayName || f.display_name || f.username || "", 40) || "?";
    const conv = `dm:${f.id}`;
    outFriends.push({
      conv,
      kind: "dm",
      id: String(f.id),
      name,
      username: f.username && f.username !== "?" ? String(f.username) : null,
      initials: watch.initialsOf(name),
      avatarUrl: watch.safeAvatar(f.avatarUrl),
      presence: watch.presenceOf(f.status),
      canSend: true,
      canAttach: true,
      reason: null,
      lastShared: lastShared(recents.byConv, conv),
    });
  }
  const outGroups = [];
  for (const g of Array.isArray(groups) ? groups : []) {
    if (!g?.id || !idOk(g.id) || g.removed || g.removedAt) continue;
    const name = clip(g.name || "", 40) || "?";
    const conv = `group:${g.id}`;
    const memberIds = Array.isArray(g.memberIds) ? g.memberIds.map(String) : [];
    outGroups.push({
      conv,
      kind: "group",
      id: String(g.id),
      name,
      initials: watch.initialsOf(name),
      avatarUrl: watch.safeAvatar(g.avatarUrl || g.avatar_url),
      memberCount: Math.max(memberIds.length, Number(g.memberCount) || 0),
      onlineCount: memberIds.filter((id) => onlineIds.has(id)).length,
      canSend: true,
      canAttach: true,
      reason: null,
      lastShared: lastShared(recents.byConv, conv),
    });
  }
  const outServers = [];
  for (const s of Array.isArray(servers) ? servers : []) {
    if (!s?.id || !idOk(s.id)) continue;
    const serverName = clip(s.name || "", 40) || "?";
    const chans = (Array.isArray(s.channels) ? s.channels : [])
      .filter((c) => c?.id && idOk(c.id) && TEXT_TYPES.has(String(c.type || "text")))
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .slice(0, MAX_CHANNELS_PER_SERVER)
      .map((c) => {
        const v = verdicts.get(String(c.id)) || channelVerdict({ type: c.type, bits: 0n, now });
        const conv = `channel:${c.id}`;
        return {
          conv,
          kind: "channel",
          id: String(c.id),
          name: clip(c.name || "", 40) || "?",
          serverId: String(s.id),
          serverName,
          type: c.type === "announcement" ? "announcement" : "text",
          nsfw: Boolean(c.nsfw),
          canSend: v.canSend,
          canAttach: v.canAttach,
          reason: v.reason,
          slowModeSec: v.slowModeSec,
          lastShared: lastShared(recents.byConv, conv),
        };
      });
    if (!chans.length) continue;
    outServers.push({
      id: String(s.id),
      name: serverName,
      initials: watch.initialsOf(serverName),
      iconUrl: watch.safeAvatar(s.iconUrl || s.icon_url || s.icon),
      memberCount: Number(s.memberCount) || 0,
      sendableCount: chans.filter((c) => c.canSend).length,
      channels: chans,
      lastAt: Math.max(0, ...chans.map((c) => toTime(c.lastShared?.at))),
    });
  }
  // Servers I posted in most recently first, then in my own list order.
  const serverOrder = outServers.map((s, i) => ({ s, i })).sort((a, b) => (b.s.lastAt - a.s.lastAt) || (a.i - b.i)).map((x) => x.s);
  for (const s of serverOrder) delete s.lastAt;

  const known = new Map();
  for (const x of outFriends) known.set(x.conv, x);
  for (const x of outGroups) known.set(x.conv, x);
  for (const s of serverOrder) for (const c of s.channels) known.set(c.conv, c);
  // Recents only list conversations that are still there and where I can post.
  const recentConvs = recents.all.filter((c) => known.get(c)?.canSend).slice(0, MAX_RECENTS);

  return {
    recents: recentConvs,
    friends: rankByRecent(outFriends, recents.all).slice(0, MAX_FRIENDS),
    groups: rankByRecent(outGroups, recents.all).slice(0, MAX_GROUPS),
    servers: serverOrder.slice(0, MAX_SERVERS),
    limits: { maxItems: MAX_ITEMS, maxBytes: MAX_FILE_BYTES, maxText: MAX_TEXT, mimes: UPLOAD_MIMES },
    generatedAt: new Date(now).toISOString(),
  };
}

/**
 * Comparable form of a URL: lower-case host without "www.", no fragment, no tracking
 * parameters (utm_*, fbclid, gclid, si, igshid), no trailing slash. null when not http(s).
 */
function normalizeLink(raw) {
  let u;
  try {
    u = new URL(String(raw || "").trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  const params = [...u.searchParams.entries()]
    .filter(([k]) => !/^(utm_|fbclid$|gclid$|igshid$|si$|mc_eid$|ref_src$)/i.test(k))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const q = params.length ? `?${params.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&")}` : "";
  const path = u.pathname.replace(/\/+$/, "") || "";
  return `${host}${path}${q}`;
}

/** Every http(s) link in a text, normalized, unique, at most 5. */
function linksIn(text) {
  const out = [];
  for (const m of String(text || "").matchAll(/https?:\/\/[^\s<>"']+/gi)) {
    const n = normalizeLink(m[0].replace(/[),.;!?]+$/, ""));
    if (n && !out.includes(n)) out.push(n);
    if (out.length >= 5) break;
  }
  return out;
}

/**
 * links: normalized links being shared; files: [{ name, size }]; rows: my recent messages
 * in this conversation [{ content, originalName, size, at }]. → newest match or null:
 * { kind: "link" | "file", at, value }.
 */
function findDuplicate({ links = [], files = [], rows = [], now = Date.now(), windowMs = DUPLICATE_WINDOW_MS } = {}) {
  const want = new Set((links || []).filter(Boolean));
  const fileKeys = new Set((files || []).filter((f) => f?.name && Number(f.size) > 0).map((f) => `${fold(f.name)}|${Number(f.size)}`));
  let best = null;
  for (const r of Array.isArray(rows) ? rows : []) {
    const at = toTime(r?.at);
    if (!at || now - at > windowMs) continue;
    if (best && at <= toTime(best.at)) continue;
    if (want.size) {
      const hit = linksIn(r.content).find((l) => want.has(l));
      if (hit) {
        best = { kind: "link", at: new Date(at).toISOString(), value: hit };
        continue;
      }
    }
    if (fileKeys.size && r.originalName && fileKeys.has(`${fold(r.originalName)}|${Number(r.size)}`)) {
      best = { kind: "file", at: new Date(at).toISOString(), value: clip(r.originalName, 80) };
    }
  }
  return best;
}

/**
 * A slow-mode channel takes one message per `slowModeSec`: the item that hit the limit and
 * every later one go out as scheduled messages, `retryAfterSec` from now and then one
 * slow-mode period apart (at least the scheduler's 30 s lead, plus a small margin).
 * → [Date ms] for `count` items.
 */
function slowmodePlan({ count = 0, slowModeSec = 0, retryAfterSec = 0, now = Date.now(), minLeadMs = 30 * 1000 } = {}) {
  const gap = Math.max(1, Math.floor(Number(slowModeSec) || 0)) * 1000 + 2000;
  const first = Math.max(minLeadMs + 5000, Math.max(0, Number(retryAfterSec) || 0) * 1000 + 2000);
  const out = [];
  for (let i = 0; i < Math.max(0, Math.floor(count)); i++) out.push(now + first + i * gap);
  return out;
}

/** Map a send error code to the reason the sheet shows (stable, lower case). */
function reasonOf(code) {
  const c = String(code || "").toLowerCase();
  if (["not_member", "missing_permission", "not_allowed", "no_permission", "forbidden"].includes(c)) return "no_permission";
  if (c === "announcement_read_only") return "announcement";
  if (c === "timed_out") return "timed_out";
  if (c === "slowmode" || c === "slow_mode") return "slowmode";
  if (c === "rules_required") return "rules_required";
  if (c === "blocked") return "blocked";
  if (c === "not_friends") return "not_friends";
  if (c === "content_blocked") return "content_blocked";
  if (c === "rate_limited") return "rate_limited";
  if (c === "attachment_unavailable" || c === "media_unavailable" || c === "bad_attachment") return "attachment_unavailable";
  if (c === "too_long") return "too_long";
  if (c === "too_many") return "too_many_scheduled";
  return "failed";
}

module.exports = {
  MAX_ITEMS,
  MAX_TEXT,
  MAX_FILE_BYTES,
  UPLOAD_MIMES,
  DUPLICATE_WINDOW_MS,
  UNDO_WINDOW_MS,
  BITS,
  parseConv,
  channelVerdict,
  pickRecents,
  shapeTargets,
  normalizeLink,
  linksIn,
  findDuplicate,
  slowmodePlan,
  reasonOf,
};
