/**
 * Ban screen state (owner-approved drafts, docs/design/ban-experience). Pure helpers that turn
 * what the server says (docs/design/ban-experience/CONTRACT.md) into what BanScreen shows:
 *   { kind: "account", ban, ticket, appeal, live }   account banned by an admin
 *   { kind: "access", access, live }                  this device / network is blocked
 * Old servers only send { code, ban } or a socket message; those still map to a screen, just
 * without a ticket (no in-app appeal / export / delete, the support address is shown instead).
 */

export const ACCOUNT_BANNED = "ACCOUNT_BANNED";
export const ACCESS_BANNED = "ACCESS_BANNED";

function str(v) {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function normalizeBan(ban = {}) {
  const categoryId = str(ban.categoryId) || str(ban.category) || "other";
  return {
    categoryId,
    // English category label from the server ("Harassment / Bullying"); translated at render.
    reason: str(ban.reason),
    message: str(ban.message),
    bannedAt: str(ban.bannedAt),
    expiresAt: str(ban.expiresAt),
    username: str(ban.username),
    byAdmin: ban.byAdmin !== false,
  };
}

function normalizeAppeal(appeal) {
  if (!appeal || typeof appeal !== "object") return { status: "none", submittedAt: null, canAppeal: true };
  const status = ["none", "pending", "rejected", "accepted"].includes(appeal.status) ? appeal.status : "none";
  return {
    status,
    submittedAt: str(appeal.submittedAt),
    canAppeal: appeal.canAppeal !== false,
    // false only when the server says there is no verified email for the result.
    emailOnFile: appeal.emailOnFile !== false,
  };
}

function normalizeAccess(access = {}, expiresAt = null) {
  return {
    code: str(access.code),
    kind: ["ip", "network", "device"].includes(access.kind) ? access.kind : null,
    createdAt: str(access.createdAt),
    expiresAt: str(access.expiresAt) || str(expiresAt),
  };
}

/** A failed login / session restore. Returns a ban state or null when it is not a ban. */
export function banStateFromError(err) {
  if (!err) return null;
  const body = err.body && typeof err.body === "object" ? err.body : {};
  const code = err.code || body.code || null;
  if (code === ACCESS_BANNED) {
    return { kind: "access", access: normalizeAccess(body.access, body.expiresAt), live: false };
  }
  if (code === ACCOUNT_BANNED || err.ban || body.ban) {
    return {
      kind: "account",
      ban: normalizeBan(body.ban || err.ban || {}),
      ticket: str(body.banTicket),
      appeal: normalizeAppeal(body.appeal),
      live: false,
    };
  }
  return null;
}

/** socket "system:kick". Plain kicks (no ban) return null; the caller keeps the old toast. */
export function banStateFromKick(payload = {}) {
  if (payload.action === "access_ban") {
    return { kind: "access", access: normalizeAccess(payload.access, payload.expiresAt), live: true };
  }
  if (payload.action !== "ban") return null;
  return {
    kind: "account",
    ban: normalizeBan({
      categoryId: payload.categoryId || payload.category,
      reason: payload.categoryLabel || (payload.reason && payload.reason !== payload.message ? payload.reason : null),
      message: payload.message,
      bannedAt: payload.bannedAt,
      expiresAt: payload.expiresAt,
      username: payload.username,
    }),
    ticket: str(payload.banTicket),
    appeal: normalizeAppeal(payload.appeal),
    live: true,
  };
}

/** Socket handshake refusals that mean a ban (server text is English). */
export function isBanSocketMessage(msg) {
  const s = String(msg || "").toLowerCase();
  return s.includes("authentication failed: banned") || s.includes("from this device or network is blocked");
}

/** Countdown parts until `expiresAt`; null when permanent or already over. */
export function remainingParts(expiresAt, now = Date.now()) {
  if (!expiresAt) return null;
  const end = new Date(expiresAt).getTime();
  if (!Number.isFinite(end)) return null;
  const ms = end - now;
  if (ms <= 0) return null;
  const totalMin = Math.ceil(ms / 60_000);
  return { days: Math.floor(totalMin / 1440), hours: Math.floor((totalMin % 1440) / 60), minutes: totalMin % 60 };
}

/** Whole days of a timed ban, for the title ("7 gün askıya alındı"); null for odd lengths. */
export function banLengthDays(bannedAt, expiresAt) {
  const a = new Date(bannedAt || 0).getTime();
  const b = new Date(expiresAt || 0).getTime();
  if (!bannedAt || !expiresAt || !Number.isFinite(a) || !Number.isFinite(b) || b <= a) return null;
  const days = (b - a) / 86_400_000;
  const rounded = Math.round(days);
  return rounded >= 1 && Math.abs(days - rounded) < 0.05 ? rounded : null;
}

/** Hours of a short timed ban (< 1 day) for the title; null otherwise. */
export function banLengthHours(bannedAt, expiresAt) {
  const a = new Date(bannedAt || 0).getTime();
  const b = new Date(expiresAt || 0).getTime();
  if (!bannedAt || !expiresAt || !Number.isFinite(a) || !Number.isFinite(b) || b <= a) return null;
  const hours = (b - a) / 3_600_000;
  const rounded = Math.round(hours);
  return rounded >= 1 && rounded < 24 && Math.abs(hours - rounded) < 0.05 ? rounded : null;
}

export const APPEAL_MIN = 20;
export const APPEAL_MAX = 2000;

export function appealTextError(text) {
  const n = String(text || "").trim().length;
  if (n < APPEAL_MIN) return "short";
  if (n > APPEAL_MAX) return "long";
  return null;
}

export function isEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || "").trim());
}
