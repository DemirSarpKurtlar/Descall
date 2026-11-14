/**
 * Kullanıcı dosyası (admin user file, owner-approved Draft A, Nov 2026).
 * Pure helpers for the page, its dialogs and the user-list quick menu:
 * timeline filters, risk display, stat formatting, dialog payloads and which
 * actions an admin may see. No React, no fetch (dossier.selftest.mjs).
 */

export const DOSSIER_TABS = Object.freeze(["overview", "timeline", "linked", "communities", "activity", "wallet", "moderation", "notes"]);

/** Timeline type -> filter group (same map as backend/lib/userDossierModel.js). */
export const TIMELINE_GROUPS = Object.freeze({
  signup: "profile",
  first_message: "profile",
  login: "security",
  report: "report",
  mod: "moderation",
  ledger: "wallet",
  purchase: "wallet",
  subscription: "subscription",
  server_join: "community",
  server_own: "community",
  group_join: "community",
  admin: "admin",
  note: "admin",
});

export const TIMELINE_FILTERS = Object.freeze(["all", "security", "moderation", "report", "wallet", "subscription", "profile", "community", "admin"]);

/** Dot colour per group (draft palette). */
export const GROUP_COLORS = Object.freeze({
  security: "#587af5",
  moderation: "#f2a93b",
  report: "#ff8a8d",
  wallet: "#9b5de5",
  subscription: "#34c77b",
  profile: "#7a7f93",
  community: "#22c3a6",
  admin: "#b6c4ff",
});

export function groupOf(item) {
  if (!item) return "admin";
  return item.group || TIMELINE_GROUPS[item.type] || "admin";
}

function ms(value) {
  const t = Date.parse(value || "");
  return Number.isFinite(t) ? t : NaN;
}

/** Several lists -> one, newest first, no duplicates (type + id), rows without a time dropped. */
export function mergeTimeline(...lists) {
  const seen = new Set();
  const out = [];
  for (const list of lists) {
    for (const item of Array.isArray(list) ? list : []) {
      if (!item?.type || item.id == null || !Number.isFinite(ms(item.at))) continue;
      const key = `${item.type}:${item.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
  }
  return out.sort((a, b) => ms(b.at) - ms(a.at));
}

export function filterTimeline(items, filter = "all") {
  const list = Array.isArray(items) ? items : [];
  if (!filter || filter === "all") return list;
  return list.filter((it) => groupOf(it) === filter);
}

export function timelineCounts(items) {
  const out = { all: 0 };
  for (const it of Array.isArray(items) ? items : []) {
    out.all += 1;
    const g = groupOf(it);
    out[g] = (out[g] || 0) + 1;
  }
  return out;
}

/* ---------------------------------------------------------------- risk */

export const RISK_TONES = Object.freeze({ low: "green", watch: "gold", high: "orange", critical: "red" });

export function riskTone(level) {
  return RISK_TONES[level] || "green";
}

/** Reason rows for the risk card: points first (highest), the zero-point info rows last. */
export function riskRows(risk) {
  const reasons = Array.isArray(risk?.reasons) ? risk.reasons : [];
  return [...reasons].sort((a, b) => (b.points || 0) - (a.points || 0));
}

/** "+18" / "-0" style label for a reason row. */
export function pointsLabel(points) {
  const n = Number(points) || 0;
  return n > 0 ? `+${n}` : "-0";
}

/* --------------------------------------------------------------- stats */

/** 115000 -> "115K" (locale aware), small numbers stay whole. */
export function compactNumber(value, intlTag = "en") {
  const n = Number(value) || 0;
  if (Math.abs(n) < 10000) return new Intl.NumberFormat(intlTag).format(n);
  return new Intl.NumberFormat(intlTag, { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

/** Voice seconds -> { n, unit } with unit "h" (whole hours) or "m" (under an hour). null = unknown. */
export function voiceAmount(seconds) {
  if (seconds == null || !Number.isFinite(Number(seconds))) return null;
  const s = Math.max(0, Number(seconds));
  if (s < 3600) return { n: Math.round(s / 60), unit: "m" };
  return { n: Math.round(s / 3600), unit: "h" };
}

/** Bar heights (percent, min 6 so a quiet day still shows) for a series of numbers. */
export function barHeights(values, minPct = 6) {
  const list = (Array.isArray(values) ? values : []).map((v) => Math.max(0, Number(v) || 0));
  const max = Math.max(0, ...list);
  if (!max) return list.map(() => 0);
  return list.map((v) => (v ? Math.max(minPct, Math.round((v / max) * 100)) : 0));
}

/** Whole days between two times (signup age). */
export function daysBetween(from, to = Date.now()) {
  const a = ms(from);
  const b = typeof to === "number" ? to : ms(to);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((b - a) / 86400000));
}

/** Session icon from the device label the server wrote ("Descall Desktop", "Safari on iOS", ...). */
export function sessionKind(device) {
  const d = String(device || "");
  if (/Desktop|Windows|macOS|Linux/i.test(d)) return "desktop";
  if (/iOS|Android|iPhone|iPad/i.test(d)) return "phone";
  return "web";
}

/** Link kinds that point to the same device (the strong evidence). */
export function isStrongLink(kinds) {
  return (Array.isArray(kinds) ? kinds : []).some((k) => k === "device" || k === "session_device");
}

/* ------------------------------------------------------------- timeout */

export const TIMEOUT_PILLS = Object.freeze([
  { id: "10m", seconds: 600 },
  { id: "1h", seconds: 3600 },
  { id: "6h", seconds: 6 * 3600 },
  { id: "1d", seconds: 86400 },
  { id: "3d", seconds: 3 * 86400 },
  { id: "7d", seconds: 7 * 86400 },
]);
export const CUSTOM = "custom";
export const TIMEOUT_REASONS = Object.freeze(["spam", "harassment", "language", "voice_abuse"]);
export const NOTE_MAX = 500;

export function minutesValue(raw) {
  const n = Math.floor(Number(String(raw ?? "").replace(",", ".")));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Seconds for a timeout pill or the custom minutes (0 = invalid; the server needs >= 60 s). */
export function timeoutSeconds(durationId, customMinutes) {
  if (durationId === CUSTOM) return Math.min(30 * 86400, minutesValue(customMinutes) * 60);
  return TIMEOUT_PILLS.find((p) => p.id === durationId)?.seconds || 0;
}

export function canSubmitTimeout(form) {
  if (!form) return false;
  if (timeoutSeconds(form.durationId, form.customMinutes) < 60) return false;
  if (form.category === "other" && !String(form.otherText || "").trim()) return false;
  return Boolean(form.category);
}

/** POST /admin/users/:id/timeout body. */
export function buildTimeoutPayload(form) {
  const message = String(form?.message || "").trim().slice(0, NOTE_MAX);
  return {
    category: form?.category || "other",
    ...(form?.category === "other" ? { otherText: String(form?.otherText || "").trim().slice(0, 200) } : {}),
    ...(message ? { message } : {}),
    durationSeconds: timeoutSeconds(form?.durationId, form?.customMinutes),
    notify: form?.notify !== false,
  };
}

/** "59:58" / "6:59:58" / "2 days" countdown for the preview (seconds -> parts). */
export function countdownParts(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n) => String(n).padStart(2, "0");
  if (d >= 1) return { days: d, clock: null };
  return { days: 0, clock: h ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}` };
}

/* -------------------------------------------------------------- wallet */

export const WALLET_MODES = Object.freeze(["give", "take", "freeze"]);
export const REASON_MAX = 300;

export function parseAmount(raw) {
  const digits = String(raw ?? "").replace(/[^\d]/g, "");
  if (!digits) return 0;
  const n = Number(digits);
  return Number.isSafeInteger(n) ? n : 0;
}

/** Balance after the change; null when the amount cannot be taken. */
export function walletPreview(balance, mode, amount) {
  const b = Math.max(0, Number(balance) || 0);
  const a = Math.max(0, Number(amount) || 0);
  if (mode === "give") return b + a;
  if (mode === "take") return a > b ? null : b - a;
  return b;
}

export function canSubmitWallet({ mode, amount, reason, balance }) {
  if (mode === "freeze") return true;
  const a = parseAmount(amount);
  if (!a || !String(reason || "").trim()) return false;
  return walletPreview(balance, mode, a) != null;
}

/** POST /admin/descoin/grant body (negative amount = take). */
export function buildWalletGrant({ mode, amount, reason, message }) {
  const a = parseAmount(amount);
  const body = { amount: mode === "take" ? -a : a, reason: String(reason || "").trim().slice(0, REASON_MAX) };
  const note = String(message || "").trim();
  if (mode === "give" && note) body.message = note.slice(0, 280);
  return body;
}

/** POST /admin/credits/update body + preview. */
export function creditsPreview(current, operation, amount) {
  const c = Math.max(0, Number(current) || 0);
  const a = parseAmount(amount);
  return operation === "remove" ? Math.max(0, c - a) : c + a;
}

/* --------------------------------------------------------------- notes */

export const NOTE_BODY_MAX = 2000;
export function noteValid(body) {
  const s = String(body ?? "").trim();
  return s.length >= 1 && s.length <= NOTE_BODY_MAX;
}

/* ------------------------------------------------------------- actions */

/** Admin section each action needs (the server checks the same paths). */
export const ACTION_SECTIONS = Object.freeze({
  open: "people",
  timeout: "moderation",
  untimeout: "moderation",
  ban: "moderation",
  unban: "moderation",
  kick: "moderation",
  sessions: "people",
  wallet: "casino",
  freeze: "people",
  badges: "specialBadges",
  lens: "people",
  export: "people",
  gift: "casino",
  premium: "premium",
  credits: "casino",
  popup: "livepopup",
  dmReview: "dmReview",
  serverReview: "serverReview",
  accessBan: "accessBans",
  audit: "audit",
  makeAdmin: "staff",
});

/** May this admin use the action? `can(section)`; owner-only actions need `owner`. */
export function actionAllowed(id, { can = () => true, owner = false } = {}) {
  if (id === "makeAdmin") return Boolean(owner);
  const section = ACTION_SECTIONS[id];
  if (!section) return false;
  return Boolean(can(section));
}

/**
 * "Daha fazla" menu, in order; sections separated by "sep".
 * @param {{can?: (s: string) => boolean, owner?: boolean, identity?: object, moderation?: object}} ctx
 */
export function moreMenuItems(ctx = {}) {
  const id = ctx.identity || {};
  const mod = ctx.moderation || {};
  const groups = [
    ["gift", "premium", "credits", "popup"],
    ["dmReview", "serverReview", "accessBan", "audit"],
    [mod.timeout ? "untimeout" : null, mod.banned ? "unban" : null, ctx.owner && !id.isOwner ? "makeAdmin" : null].filter(Boolean),
  ];
  const out = [];
  for (const group of groups) {
    const allowed = group.filter((a) => actionAllowed(a, ctx));
    if (!allowed.length) continue;
    if (out.length) out.push("sep");
    out.push(...allowed);
  }
  return out;
}

/** Quick menu on a row of the Kullanıcılar list. */
export const ROW_MENU = Object.freeze(["open", "wallet", "timeout", "ban", "kick", "gift"]);
export function rowMenuItems(ctx = {}) {
  return ROW_MENU.filter((a) => actionAllowed(a, ctx));
}

/** Server error code -> dossier copy key (null = show the server text). */
const ERROR_CODES = Object.freeze({
  NOTES_UNAVAILABLE: "dossier.err_notesUnavailable",
  NOTE_INVALID: "dossier.err_noteInvalid",
  NOTE_NOT_YOURS: "dossier.err_noteNotYours",
  USER_OFFLINE: "dossier.err_userOffline",
  ADMIN_PERMISSION_DENIED: "dossier.err_noAccess",
  NOTHING_TO_BAN: "dossier.err_nothingToBan",
  ADMIN_PROTECTED: "dossier.err_protected",
});
export function errorKey(err) {
  return ERROR_CODES[err?.code] || null;
}
