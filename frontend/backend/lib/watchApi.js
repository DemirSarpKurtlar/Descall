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
const KIND_LABEL = {
  image: "Fotoğraf",
  gif: "GIF",
  video: "Video",
  voice: "Sesli mesaj",
  file: "Dosya",
  poll: "Anket",
};

function clip(s, n) {
  const t = String(s == null ? "" : s).replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

function initialsOf(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  const first = Array.from(parts[0])[0] || "";
  const second = parts.length > 1 ? Array.from(parts[1])[0] || "" : Array.from(parts[0])[1] || "";
  return (first + second).toLocaleUpperCase("tr-TR");
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
   the watch shows a Turkish word instead (no emoji in the UI, owner rule). */
const PREVIEW_LABELS = [
  ["\u{1F4DE} Call", "Arama"],
  ["\u{1F4F7} Photo", "Fotoğraf"],
  ["\u{1F3A4} Voice message", "Sesli mesaj"],
  ["\u{1F4CE} Attachment", "Dosya"],
];

function localizePreview(text) {
  let out = String(text || "");
  for (const [from, to] of PREVIEW_LABELS) out = out.split(from).join(to);
  return out;
}

/** Preview text from formatDmPreview / formatGroupListPreview results (string or object). */
function previewText(p) {
  if (!p) return "";
  if (typeof p === "string") return clip(localizePreview(p), PREVIEW_MAX);
  const kind = p.kind || p.type || null;
  const text = p.text || p.content || p.preview || "";
  if (text) return clip(localizePreview(text), PREVIEW_MAX);
  return KIND_LABEL[kind] || "";
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
function shapeHome({ me, myStatus, friends = [], previews = {}, lastActivity = {}, groups = [], adminSections = null }) {
  const rows = [];
  for (const f of friends) {
    if (!f?.id) continue;
    const at = lastActivity[f.id] || null;
    const text = previewText(previews[f.id]);
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
      preview: previewText(g.lastMessage),
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

function shapeThread(out) {
  return {
    conv: out?.conv || null,
    title: clip(out?.title || "", 40),
    subtitle: clip(out?.subtitle || "", 40),
    messages: (Array.isArray(out?.messages) ? out.messages : []).map((m) => ({
      id: String(m.id),
      mine: Boolean(m.mine),
      author: clip(m.fromName || "", 30),
      text: m.text || (KIND_LABEL[m.kind] ? KIND_LABEL[m.kind] : ""),
      kind: m.kind || "text",
      at: m.at || null,
    })),
  };
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
};
