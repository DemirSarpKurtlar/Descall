"use strict";

/**
 * Sunucu inceleme (admin, section serverReview). Pure helpers for
 * routes/adminServerReview.js and lib/serverReviewStore.js; tested by
 * lib/serverReview.selftest.cjs.
 *
 * Same rule as DM inceleme (3.7.1): every list and the server detail are
 * metadata only (who, how many, when, which flags). The text of one channel is
 * returned only by POST .../channels/:channelId/view with a purpose
 * (report | security | legal) and a written reason of at least 10 characters;
 * the admin router asks for the step-up code and the route writes an audit row
 * with the purpose, the reason, the server, the channel and the range read.
 */

const { Permissions } = require("./serverPermissions");
const { apiError } = require("./apiError");

const SERVER_VIEW_PURPOSES = Object.freeze(["report", "security", "legal"]);
const REASON_MIN = 10;
const REASON_MAX = 300;
const PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;
const EDIT_HISTORY_MAX = 50;
const DAY_MS = 24 * 60 * 60 * 1000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INVITE_CODE_RE = /^[A-Za-z0-9_-]{2,64}$/;

function isUuid(value) {
  return UUID_RE.test(String(value || ""));
}

function isInviteCode(value) {
  return INVITE_CODE_RE.test(String(value || ""));
}

/**
 * The gate in front of channel content. Same rule as POST /dm/:key/view.
 * @returns {{ok: true, purpose: string, reason: string} | {ok: false, code: string, error: string}}
 */
function checkViewRequest(body) {
  const purpose = String(body?.purpose || "");
  const reason = typeof body?.reason === "string" ? body.reason.trim().slice(0, REASON_MAX) : "";
  if (!SERVER_VIEW_PURPOSES.includes(purpose)) {
    return { ok: false, ...apiError("Choose a review reason.", null, { code: "SERVER_VIEW_PURPOSE" }) };
  }
  if (reason.length < REASON_MIN) {
    return { ok: false, ...apiError("Write the reason in at least 10 characters.", null, { code: "SERVER_VIEW_REASON" }) };
  }
  return { ok: true, purpose, reason };
}

/* ---------- Roles: which permissions make someone server staff ---------- */

/** Permissions that let a member run or police the server, most powerful first. */
const DANGEROUS_PERMISSIONS = Object.freeze([
  "ADMINISTRATOR",
  "MANAGE_GUILD",
  "MANAGE_ROLES",
  "MANAGE_CHANNELS",
  "BAN_MEMBERS",
  "KICK_MEMBERS",
  "MODERATE_MEMBERS",
  "MANAGE_MESSAGES",
  "MANAGE_WEBHOOKS",
  "MENTION_EVERYONE",
]);

function toBigInt(value) {
  try {
    if (typeof value === "bigint") return value;
    if (value == null || value === "") return 0n;
    return BigInt(String(value));
  } catch {
    return 0n;
  }
}

/** Names of the dangerous permissions in a role's bitfield (ADMINISTRATOR implies all). */
function dangerousPermissions(bits) {
  const b = toBigInt(bits);
  if ((b & Permissions.ADMINISTRATOR) === Permissions.ADMINISTRATOR) return ["ADMINISTRATOR"];
  return DANGEROUS_PERMISSIONS.filter((name) => (b & Permissions[name]) === Permissions[name]);
}

/* ---------- Risk: explainable, every point has a named reason ---------- */

/**
 * 0..100 risk score for the server list. Weights are deliberate and shown to the
 * admin as factors (never a black box):
 *  - open reports about the server itself (15 each, at most 45)
 *  - open reports about its members (5 each, at most 20)
 *  - new server growing fast: younger than 14 days with 25+ joins in 7 days (20)
 *  - fast growth on an older server: 7-day joins are half the members (10, 10+ members)
 *  - many live invites (10+) or many invite uses (100+) (10)
 *  - listed in the public directory and not hidden (10)
 *  - 3+ bans / kicks / timeouts in 7 days (10)
 *  - community / public discovery on (5)
 */
function riskOf(s, nowMs = Date.now()) {
  const factors = [];
  let score = 0;
  const add = (id, points) => {
    if (points <= 0) return;
    factors.push(id);
    score += points;
  };
  const serverReports = Number(s.serverReports || 0);
  const memberReports = Number(s.memberReports || 0);
  add("serverReports", Math.min(45, serverReports * 15));
  add("memberReports", Math.min(20, memberReports * 5));
  const ageDays = s.createdAt ? (nowMs - Date.parse(s.createdAt)) / DAY_MS : Infinity;
  const joins7d = Number(s.joins7d || 0);
  const members = Number(s.members || 0);
  if (ageDays < 14 && joins7d >= 25) add("newFastGrowth", 20);
  else if (members >= 10 && joins7d * 2 >= members) add("fastGrowth", 10);
  if (Number(s.invitesActive || 0) >= 10 || Number(s.inviteUses || 0) >= 100) add("manyInvites", 10);
  if (s.listed && !s.hidden) add("directoryListed", 10);
  if (Number(s.modEvents7d || 0) >= 3) add("moderationEvents", 10);
  if (s.isPublic || s.communityEnabled) add("publicDiscovery", 5);
  return { score: Math.min(100, score), factors };
}

/** "low" < 25 <= "medium" < 50 <= "high". */
function riskLevel(score) {
  const n = Number(score) || 0;
  if (n >= 50) return "high";
  if (n >= 25) return "medium";
  return "low";
}

/* ---------- Server list: filter, sort, page (in memory over the aggregate) ---------- */

const LIST_FILTERS = Object.freeze(["all", "reported", "listed", "hidden", "public", "community", "new", "risky"]);
const LIST_SORTS = Object.freeze(["risk", "reports", "members", "messages", "growth", "newest"]);

function fold(text) {
  return String(text || "")
    .toLocaleLowerCase("tr")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ı/g, "i");
}

function parseListQuery(query = {}) {
  const filter = LIST_FILTERS.includes(String(query.filter)) ? String(query.filter) : "all";
  const sort = LIST_SORTS.includes(String(query.sort)) ? String(query.sort) : "risk";
  const page = Math.max(1, Math.min(10000, parseInt(query.page, 10) || 1));
  const limit = Math.max(1, Math.min(MAX_PAGE_SIZE, parseInt(query.limit, 10) || PAGE_SIZE));
  const q = String(query.q || "").trim().slice(0, 80);
  return { filter, sort, page, limit, q, refresh: query.refresh === "1" || query.refresh === true };
}

function passesFilter(row, filter, nowMs) {
  switch (filter) {
    case "reported":
      return row.reports.server + row.reports.members > 0;
    case "listed":
      return row.directory.listed && !row.directory.hidden;
    case "hidden":
      return row.directory.hidden;
    case "public":
      return row.isPublic;
    case "community":
      return row.communityEnabled;
    case "new":
      return row.createdAt && nowMs - Date.parse(row.createdAt) < 14 * DAY_MS;
    case "risky":
      return row.risk.score >= 25;
    default:
      return true;
  }
}

const SORTERS = {
  risk: (a, b) => b.risk.score - a.risk.score || b.reports.server + b.reports.members - (a.reports.server + a.reports.members) || b.members - a.members,
  reports: (a, b) => b.reports.server + b.reports.members - (a.reports.server + a.reports.members) || b.risk.score - a.risk.score,
  members: (a, b) => b.members - a.members,
  messages: (a, b) => b.messages.d7 - a.messages.d7 || b.messages.d30 - a.messages.d30,
  growth: (a, b) => b.joins7d - a.joins7d,
  newest: (a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")),
};

/**
 * @param {object[]} rows output of buildServerRows
 * @param {ReturnType<typeof parseListQuery>} plan
 */
function queryServers(rows, plan, nowMs = Date.now()) {
  const q = fold(plan.q).replace(/^@/, "");
  let out = rows.filter((r) => passesFilter(r, plan.filter, nowMs));
  if (q) {
    out = out.filter((r) => {
      if (String(r.id).toLowerCase() === q || String(r.id).toLowerCase().startsWith(q)) return true;
      return fold(r.name).includes(q) || fold(r.owner?.username).includes(q) || fold(r.owner?.displayName).includes(q);
    });
  }
  out = [...out].sort((a, b) => SORTERS[plan.sort](a, b) || String(a.name).localeCompare(String(b.name)));
  const total = out.length;
  const pages = Math.max(1, Math.ceil(total / plan.limit));
  const page = Math.min(plan.page, pages);
  return { servers: out.slice((page - 1) * plan.limit, page * plan.limit), total, page, pages, limit: plan.limit };
}

/**
 * Join the per-server aggregates into list rows. Metadata only: no message
 * text, no description, no topic ever reaches this shape.
 */
function buildServerRows({ servers = [], stats = new Map(), owners = new Map(), reports = new Map(), modEvents = new Map(), nowMs = Date.now() }) {
  return servers.map((s) => {
    const id = String(s.id);
    const st = stats.get(id) || {};
    const rep = reports.get(id) || { server: 0, members: 0 };
    const owner = owners.get(String(s.owner_id)) || null;
    const listed = Boolean(s.listed_in_directory);
    const hidden = Boolean(s.directory_hidden_at);
    const base = {
      id,
      name: s.name || "",
      iconUrl: s.icon_url || null,
      createdAt: s.created_at || null,
      isPublic: Boolean(s.is_public),
      communityEnabled: Boolean(s.community_enabled),
      owner: owner
        ? { id: String(owner.id), username: owner.username || null, displayName: owner.display_name || owner.username || null, avatarUrl: owner.avatar_url || null, isAdmin: Boolean(owner.is_admin) }
        : { id: s.owner_id ? String(s.owner_id) : null, username: null, displayName: null, avatarUrl: null, isAdmin: false },
      members: Number(st.members || 0),
      joins7d: Number(st.joins7d || 0),
      channels: Number(st.channels || 0),
      messages: { d7: Number(st.msgs7d || 0), d30: Number(st.msgs30d || 0), lastAt: st.lastMessageAt || null },
      invites: { active: Number(st.invitesActive || 0), uses: Number(st.inviteUses || 0) },
      directory: { listed, hidden, hiddenAt: s.directory_hidden_at || null },
      reports: { server: Number(rep.server || 0), members: Number(rep.members || 0) },
      modEvents7d: Number(modEvents.get(id) || 0),
    };
    base.risk = riskOf(
      {
        serverReports: base.reports.server,
        memberReports: base.reports.members,
        createdAt: base.createdAt,
        joins7d: base.joins7d,
        members: base.members,
        invitesActive: base.invites.active,
        inviteUses: base.invites.uses,
        listed,
        hidden,
        modEvents7d: base.modEvents7d,
        isPublic: base.isPublic,
        communityEnabled: base.communityEnabled,
      },
      nowMs
    );
    base.risk.level = riskLevel(base.risk.score);
    return base;
  });
}

/* ---------- Invites ---------- */

function inviteState(invite, nowMs = Date.now()) {
  if (invite?.expires_at && Date.parse(invite.expires_at) <= nowMs) return "expired";
  if (invite?.max_uses && Number(invite.uses || 0) >= Number(invite.max_uses)) return "used";
  return "active";
}

/* ---------- Channels tree (metadata: name, type, counts, last activity) ---------- */

function channelTree(channels = [], counts = new Map()) {
  const byPos = (a, b) => (Number(a.position) || 0) - (Number(b.position) || 0) || String(a.name).localeCompare(String(b.name));
  const node = (c) => {
    const st = counts.get(String(c.id)) || {};
    return {
      id: String(c.id),
      name: c.name || "",
      type: c.type || "text",
      parentId: c.parent_id ? String(c.parent_id) : null,
      position: Number(c.position) || 0,
      nsfw: Boolean(c.nsfw),
      messages: Number(st.messages || 0),
      lastAt: st.lastAt || null,
    };
  };
  const categories = channels.filter((c) => c.type === "category").sort(byPos);
  const catIds = new Set(categories.map((c) => String(c.id)));
  const loose = channels.filter((c) => c.type !== "category" && (!c.parent_id || !catIds.has(String(c.parent_id)))).sort(byPos).map(node);
  const groups = categories.map((cat) => ({
    ...node(cat),
    children: channels.filter((c) => c.type !== "category" && String(c.parent_id) === String(cat.id)).sort(byPos).map(node),
  }));
  return { loose, categories: groups };
}

/* ---------- Content (only behind the gate) ---------- */

function messageKind(row) {
  const media = String(row.media_type || "").toLowerCase();
  const raw = String(row.content || "");
  const type = String(row.message_type || "").toLowerCase();
  if (row.system_kind || (type && !["text", "user", "default"].includes(type))) return "system";
  if (media === "poll_v2" || media === "poll_end") return "poll";
  if (media === "app_card") return "card";
  if (media === "voice" || media === "audio" || raw.startsWith("__voice__:")) return "voice";
  if (media === "image" || media === "gif" || media === "sticker") return "image";
  if (media === "video") return "video";
  if (row.media_url) return "file";
  return "text";
}

/** Edit history entries as stored ({text, editedAt}), newest last, capped. */
function normalizeEditHistory(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((e) => e && typeof e === "object" && typeof e.text === "string")
    .slice(-EDIT_HISTORY_MAX)
    .map((e) => ({ text: e.text.slice(0, 4000), editedAt: e.editedAt || null }));
}

/**
 * Same shape as a DM edit (socket/handlers.js dm:message:edit): the text before
 * this edit and when it was replaced. Capped at the last 50 versions.
 */
function appendEditHistory(history, previousText, editedAt, max = EDIT_HISTORY_MAX) {
  const prev = Array.isArray(history) ? history.filter((e) => e && typeof e === "object") : [];
  if (typeof previousText !== "string") return prev.slice(-max);
  return [...prev, { text: previousText, editedAt }].slice(-max);
}

function voiceSeconds(raw) {
  const m = String(raw || "").match(/^__voice__:(\d+(?:\.\d+)?)/);
  return m ? Math.round(Number(m[1])) : null;
}

/** One channel message for the gated view. */
function mapReviewMessage(row, usersById = new Map()) {
  const kind = messageKind(row);
  const u = usersById.get(String(row.sender_id));
  const raw = String(row.content || "");
  const text = kind === "voice" || kind === "system" || kind === "card" ? "" : raw;
  const reply = row.reply_to && typeof row.reply_to === "object" ? row.reply_to : null;
  return {
    id: String(row.id),
    authorId: row.sender_id ? String(row.sender_id) : null,
    authorUsername: u?.username || String(row.sender_id || "").slice(0, 8),
    authorDisplayName: u?.display_name || u?.username || String(row.sender_id || "").slice(0, 8),
    authorAvatarUrl: u?.avatar_url || null,
    authorIsAdmin: Boolean(u?.is_admin),
    timestamp: row.created_at || null,
    editedAt: row.edited_at || null,
    edits: normalizeEditHistory(row.edit_history),
    pinnedAt: row.pinned_at || null,
    pinnedBy: row.pinned_by ? usersById.get(String(row.pinned_by))?.username || String(row.pinned_by).slice(0, 8) : null,
    kind,
    text,
    mediaUrl: kind === "text" || kind === "system" ? null : row.media_url || null,
    mediaType: row.media_type || null,
    voiceSeconds: kind === "voice" ? voiceSeconds(raw) : null,
    systemKind: kind === "system" ? row.system_kind || row.message_type || null : null,
    replyToId: reply ? String(reply.id || reply.messageId || "") || null : null,
  };
}

/**
 * Paging inside one channel: no cursor = the latest page; before = older than
 * that timestamp; after = newer. Cursors are ISO timestamps from the page the
 * admin already holds, so a view never leaves the opened channel.
 */
function parseCursor(body = {}) {
  const iso = (v) => {
    if (typeof v !== "string" || v.length > 40) return null;
    const ms = Date.parse(v);
    return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
  };
  const before = iso(body.before);
  const after = before ? null : iso(body.after);
  const limit = Math.max(1, Math.min(MAX_PAGE_SIZE, parseInt(body.limit, 10) || PAGE_SIZE));
  return { before, after, limit, direction: before ? "older" : after ? "newer" : "latest" };
}

/** Audit range for one page: direction, first / last timestamp, count. */
function rangeOf(cursor, messages) {
  const first = messages[0]?.timestamp || null;
  const last = messages[messages.length - 1]?.timestamp || null;
  return { direction: cursor.direction, from: first, to: last, count: messages.length };
}

/** Server audit log entry for the detail view (keys of the change, short values). */
function mapServerAudit(row, usersById = new Map()) {
  let changes = null;
  if (row.changes && typeof row.changes === "object") {
    const json = JSON.stringify(row.changes);
    changes = json.length > 300 ? `${json.slice(0, 297)}...` : json;
  }
  const actor = usersById.get(String(row.actor_id));
  return {
    id: String(row.id),
    action: row.action || "",
    actorId: row.actor_id ? String(row.actor_id) : null,
    actorUsername: actor?.username || (row.actor_id ? String(row.actor_id).slice(0, 8) : null),
    targetType: row.target_type || null,
    targetId: row.target_id || null,
    reason: row.reason ? String(row.reason).slice(0, 300) : null,
    changes,
    createdAt: row.created_at || null,
  };
}

/** Typed confirmation for deleting a server: the exact name, nothing else. */
function deleteConfirmed(serverName, typed) {
  return typeof typed === "string" && typed.trim().length > 0 && typed.trim() === String(serverName || "").trim();
}

module.exports = {
  SERVER_VIEW_PURPOSES,
  REASON_MIN,
  PAGE_SIZE,
  EDIT_HISTORY_MAX,
  DANGEROUS_PERMISSIONS,
  LIST_FILTERS,
  LIST_SORTS,
  isUuid,
  isInviteCode,
  checkViewRequest,
  dangerousPermissions,
  riskOf,
  riskLevel,
  parseListQuery,
  queryServers,
  buildServerRows,
  inviteState,
  channelTree,
  messageKind,
  normalizeEditHistory,
  appendEditHistory,
  mapReviewMessage,
  parseCursor,
  rangeOf,
  mapServerAudit,
  deleteConfirmed,
};
