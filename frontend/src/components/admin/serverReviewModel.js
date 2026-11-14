/**
 * Sunucu inceleme (admin, section serverReview): pure helpers for
 * AdminServerReview.jsx, tested by serverReview.selftest.mjs. The server
 * (backend/routes/adminServerReview.js) checks the same rules again.
 */

/** Same purposes and minimum reason as DM inceleme. */
export const SERVER_VIEW_PURPOSES = ["report", "security", "legal"];
export const SERVER_REASON_MIN = 10;

export function canSubmitView(purpose, reason) {
  return SERVER_VIEW_PURPOSES.includes(purpose) && String(reason || "").trim().length >= SERVER_REASON_MIN;
}

/** Typed confirmation for deleting a server: the exact name plus a reason. */
export function canConfirmDelete(serverName, typed, reason) {
  const name = String(serverName || "").trim();
  return Boolean(name) && String(typed || "").trim() === name && String(reason || "").trim().length >= SERVER_REASON_MIN;
}

export const LIST_FILTERS = ["all", "reported", "risky", "listed", "hidden", "public", "community", "new"];
export const LIST_SORTS = ["risk", "reports", "members", "messages", "growth", "newest"];
export const DETAIL_TABS = ["channels", "members", "staff", "invites", "audit", "reports", "directory"];
export const RISK_FACTORS = ["serverReports", "memberReports", "newFastGrowth", "fastGrowth", "manyInvites", "directoryListed", "moderationEvents", "publicDiscovery"];
export const DANGEROUS_PERMISSIONS = [
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
];
export const REPORT_REASONS = ["harassment", "hate_speech", "threats", "spam", "scam", "impersonation", "nsfw", "doxxing", "other"];
export const AUDIT_ACTIONS = [
  "MEMBER_BAN",
  "MEMBER_UNBAN",
  "MEMBER_KICK",
  "MEMBER_TIMEOUT",
  "MEMBER_TIMEOUT_CLEAR",
  "MEMBER_JOIN",
  "MEMBER_LEAVE",
  "MEMBER_ROLE_ADD",
  "MEMBER_ROLE_REMOVE",
  "ROLE_CREATE",
  "ROLE_UPDATE",
  "ROLE_DELETE",
  "CHANNEL_CREATE",
  "CHANNEL_UPDATE",
  "CHANNEL_DELETE",
  "INVITE_CREATE",
  "INVITE_DELETE",
  "SERVER_CREATE",
  "SERVER_UPDATE",
  "OWNERSHIP_TRANSFER",
  "DIRECTORY_UPDATE",
  "RULES_ACCEPT",
];

/** i18n key for a server error code, or null to show the message as sent. */
const ERROR_CODES = [
  "SERVER_VIEW_PURPOSE",
  "SERVER_VIEW_REASON",
  "SERVER_DELETE_CONFIRM",
  "SERVER_DELETE_REASON",
  "DIRECTORY_UNAVAILABLE",
  "CHANNEL_NOT_FOUND",
  "MESSAGE_NOT_FOUND",
  "INVITE_NOT_FOUND",
  "SERVER_NOT_FOUND",
  "ADMIN_PERMISSION_DENIED",
];
export function errorKey(err) {
  const code = String(err?.code || "");
  return ERROR_CODES.includes(code) ? `serverReview.err_${code}` : null;
}

export function auditActionKey(action) {
  return AUDIT_ACTIONS.includes(action) ? `serverReview.audit_${action}` : null;
}

export function reportReasonKey(reason) {
  return `serverReview.reason_${REPORT_REASONS.includes(reason) ? reason : "other"}`;
}

/** Query string for GET /server-review/servers. */
export function listQuery({ q = "", filter = "all", sort = "risk", page = 1, refresh = false } = {}) {
  const p = new URLSearchParams();
  const text = String(q || "").trim();
  if (text) p.set("q", text.slice(0, 80));
  if (filter && filter !== "all") p.set("filter", filter);
  if (sort && sort !== "risk") p.set("sort", sort);
  if (page > 1) p.set("page", String(page));
  if (refresh) p.set("refresh", "1");
  const s = p.toString();
  return s ? `?${s}` : "";
}

/**
 * Merge one page of the gated channel view into what is on screen. Pages come
 * from the same channel only; duplicates (same id) are dropped.
 * @returns {{messages: object[], hasOlder: boolean, hasNewer: boolean}}
 */
export function mergePage(current, page) {
  const prev = current?.messages || [];
  const incoming = page?.messages || [];
  const seen = new Set(prev.map((m) => m.id));
  const fresh = incoming.filter((m) => !seen.has(m.id));
  if (page?.direction === "older") {
    return { messages: [...fresh, ...prev], hasOlder: Boolean(page.hasMore), hasNewer: Boolean(current?.hasNewer) };
  }
  if (page?.direction === "newer") {
    return { messages: [...prev, ...fresh], hasOlder: Boolean(current?.hasOlder), hasNewer: Boolean(page.hasMore) };
  }
  return { messages: incoming, hasOlder: Boolean(page?.hasMore), hasNewer: false };
}

/** Role colour (integer) as CSS, or null for the default (0). */
export function roleColor(value) {
  const n = Number(value) || 0;
  if (n <= 0 || n > 0xffffff) return null;
  return `#${n.toString(16).padStart(6, "0")}`;
}

/** Channels in display order (loose first, then each category's children) for counting. */
export function flatChannels(tree) {
  if (!tree) return [];
  return [...(tree.loose || []), ...(tree.categories || []).flatMap((c) => c.children || [])];
}

export function isReadableChannel(channel) {
  return Boolean(channel) && channel.type !== "category";
}
