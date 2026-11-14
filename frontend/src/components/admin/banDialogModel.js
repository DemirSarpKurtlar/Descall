/**
 * Admin ban dialog (ban experience, owner-approved draft 5-admin, 2026-11-14).
 * Pure mapping from the dialog's pills and checkboxes to the
 * POST /admin/users/:id/ban body (docs/design/ban-experience/CONTRACT.md, section 7),
 * plus the state handed to the user-facing ban screen preview.
 * Tested by banDialogModel.selftest.mjs; no React, no fetch.
 */

/** Sebep pills shown first (draft order); every other category sits behind "Diğer…". */
export const FEATURED_CATEGORIES = Object.freeze(["harassment", "spam", "hate_speech", "scam"]);

/** Süre pills in draft order; each maps to a server ban preset id. */
export const DURATION_PILLS = Object.freeze(["24h", "3d", "7d", "30d", "90d", "permanent"]);

/** Seconds per preset, used when /moderation/meta has not answered yet. */
export const DEFAULT_PRESET_SECONDS = Object.freeze({
  "24h": 24 * 3600,
  "3d": 3 * 86400,
  "7d": 7 * 86400,
  "30d": 30 * 86400,
  "90d": 90 * 86400,
  permanent: null,
});

export const DEFAULT_DURATION = "7d";
export const DEFAULT_CATEGORY = "harassment";
export const CUSTOM_DURATION = "custom";
export const OTHER_CATEGORY = "other";
export const MESSAGE_MAX = 500;
export const OTHER_TEXT_MAX = 200;

/** Default checkbox state (contract: revokeSessions and notifyEmail default on). */
export const DEFAULT_FLAGS = Object.freeze({ revokeSessions: true, notifyEmail: true, alsoAccessBan: false });

/**
 * Duration pills to render: the draft's six, kept only when the server lists the
 * preset (meta.banPresets). With no meta yet every pill shows.
 * @param {{id: string, seconds?: number|null}[]} [banPresets]
 */
export function durationPills(banPresets) {
  const list = Array.isArray(banPresets) ? banPresets : [];
  if (!list.length) return [...DURATION_PILLS];
  const ids = new Set(list.map((p) => p?.id));
  const pills = DURATION_PILLS.filter((id) => ids.has(id));
  return pills.length ? pills : [...DURATION_PILLS];
}

/** Whole minutes typed into the "Özel" field, or 0 when not a positive number. */
export function customMinutesValue(raw) {
  const n = Math.floor(Number(String(raw ?? "").replace(",", ".")));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Length of the chosen ban in seconds; null = permanent.
 * @param {string} durationId pill id or "custom"
 * @param {{customMinutes?: string|number, banPresets?: {id: string, seconds?: number|null}[]}} [opts]
 */
export function durationSeconds(durationId, { customMinutes, banPresets } = {}) {
  if (durationId === CUSTOM_DURATION) {
    const m = customMinutesValue(customMinutes);
    return m ? m * 60 : 0;
  }
  if (durationId === "permanent") return null;
  const fromMeta = (Array.isArray(banPresets) ? banPresets : []).find((p) => p?.id === durationId);
  if (fromMeta && (typeof fromMeta.seconds === "number" || fromMeta.seconds === null)) return fromMeta.seconds;
  return DEFAULT_PRESET_SECONDS[durationId] ?? 0;
}

/** True for admins and the owner (never bannable, server answers 403 ADMIN_PROTECTED). */
export function isProtectedTarget(target) {
  if (!target || typeof target !== "object") return false;
  const role = String(target.role || "").toLowerCase();
  return Boolean(
    target.isAdmin || target.is_admin || target.isOwner || target.is_owner || target.owner || role === "admin" || role === "owner"
  );
}

/** The server refused because the target is an admin or the owner. */
export function isProtectedError(err) {
  return Boolean(err) && err.code === "ADMIN_PROTECTED";
}

/**
 * First problem with the form, as a banAdmin.* key, or null when it can be sent.
 * @param {{category: string, otherText?: string, durationId: string, customMinutes?: string|number}} form
 */
export function banFormError(form) {
  if (!form?.category) return "banAdmin.errCategory";
  if (form.category === OTHER_CATEGORY && !String(form.otherText || "").trim()) return "banAdmin.errOtherText";
  if (form.durationId === CUSTOM_DURATION && !customMinutesValue(form.customMinutes)) return "banAdmin.errCustomMinutes";
  if (!form.durationId) return "banAdmin.errDuration";
  return null;
}

/**
 * Ban button state: disabled for a protected target, while sending, without a
 * target, or while the form is incomplete.
 */
export function canSubmitBan({ form, target, busy = false, protectedHit = false }) {
  if (busy || !target?.id) return false;
  if (protectedHit || isProtectedTarget(target)) return false;
  return banFormError(form) == null;
}

/**
 * Whether the red button is greyed out. Unlike canSubmitBan an incomplete form
 * keeps it clickable, so a press can say what is missing; a protected target
 * (admin / owner, or a 403 ADMIN_PROTECTED answer) never can be banned.
 */
export function banButtonDisabled({ target, busy = false, protectedHit = false }) {
  return Boolean(busy || !target?.id || protectedHit || isProtectedTarget(target));
}

/**
 * Request body for POST /admin/users/:id/ban (also sent to /admin/reports/:id/ban).
 * Preset pills send presetId; "Özel" sends durationSeconds only.
 */
export function buildBanPayload(form) {
  const flags = { ...DEFAULT_FLAGS, ...(form?.flags || {}) };
  const category = form?.category || DEFAULT_CATEGORY;
  const otherText = category === OTHER_CATEGORY ? String(form?.otherText || "").trim().slice(0, OTHER_TEXT_MAX) : "";
  const message = String(form?.message || "").trim().slice(0, MESSAGE_MAX);
  const body = {
    category,
    otherText: otherText || undefined,
    message: message || undefined,
    revokeSessions: Boolean(flags.revokeSessions),
    notifyEmail: Boolean(flags.notifyEmail),
    alsoAccessBan: Boolean(flags.alsoAccessBan),
  };
  if (form?.durationId === CUSTOM_DURATION) {
    body.durationSeconds = durationSeconds(CUSTOM_DURATION, { customMinutes: form.customMinutes });
  } else {
    body.presetId = form?.durationId || DEFAULT_DURATION;
  }
  return body;
}

/**
 * Label of the red button: "7 gün yasakla", "Kalıcı yasakla", "90 dakika yasakla".
 * Returns a key and its params; the component translates it.
 */
export function banButtonLabel(durationId, customMinutes) {
  if (durationId === "permanent") return { key: "banAdmin.banPermanent", params: {} };
  if (durationId === CUSTOM_DURATION) {
    return { key: "banAdmin.banCustom", params: { n: customMinutesValue(customMinutes) } };
  }
  return { key: "banAdmin.banFor", params: { duration: `banAdmin.dur.${durationId}` } };
}

/** Days / hours / minutes left, for the preview countdown. */
export function countdownParts(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  return { days: Math.floor(s / 86400), hours: Math.floor((s % 86400) / 3600), minutes: Math.floor((s % 3600) / 60) };
}

/**
 * State for the user-facing ban screen preview (components/ban/BanScreen.jsx):
 * { kind: "account", ban: {...section 1 ban}, live: false }.
 */
export function previewBanState({ target, form, categories, banPresets, now = Date.now() }) {
  const category = form?.category || DEFAULT_CATEGORY;
  const cat = (Array.isArray(categories) ? categories : []).find((c) => c?.id === category);
  const otherText = String(form?.otherText || "").trim();
  const seconds = durationSeconds(form?.durationId, { customMinutes: form?.customMinutes, banPresets });
  const bannedAt = new Date(now).toISOString();
  const expiresAt = seconds == null ? null : new Date(now + Math.max(0, seconds) * 1000).toISOString();
  return {
    kind: "account",
    ban: {
      categoryId: category,
      category,
      reason: category === OTHER_CATEGORY && otherText ? otherText : cat?.label || category,
      message: String(form?.message || "").trim() || null,
      bannedAt,
      expiresAt,
      username: target?.username || "",
      byAdmin: true,
    },
    // The banned user signs in with a ban ticket, so the real screen offers Appeal and the
    // data links; the preview shows that (it is inert, nothing is sent).
    ticket: "preview",
    appeal: { status: "none", submittedAt: null, canAppeal: true },
    live: false,
  };
}

/** Header line facts: "@kaanyilmaz · 3 şikayet · 2 cihaz" (counts only when known). */
export function headerFacts({ username, reportCount, deviceCount }) {
  const out = [];
  if (username) out.push({ kind: "username", value: `@${username}` });
  if (Number.isFinite(reportCount)) out.push({ kind: "reports", value: reportCount });
  if (Number.isFinite(deviceCount)) out.push({ kind: "devices", value: deviceCount });
  return out;
}

/* ── Appeals (GET /admin/appeals, POST /admin/appeals/:id/decide) ── */

export const APPEAL_STATUSES = Object.freeze(["pending", "accepted", "rejected"]);
export const APPEAL_TYPES = Object.freeze(["account", "access"]);

/** Query string for GET /admin/appeals. */
export function appealsQuery({ status = "pending", type = "" } = {}) {
  const q = new URLSearchParams();
  q.set("status", APPEAL_STATUSES.includes(status) ? status : "pending");
  if (APPEAL_TYPES.includes(type)) q.set("type", type);
  return `/appeals?${q.toString()}`;
}

/** Body for POST /admin/appeals/:id/decide. */
export function decidePayload(decision, note) {
  if (decision !== "accept" && decision !== "reject") throw new Error("decision must be accept or reject");
  const n = String(note || "").trim().slice(0, 1000);
  return { decision, note: n || undefined };
}

/** "kaan@example.com" → "ka***@example.com"; already masked or empty values pass through. */
export function maskEmail(email) {
  const s = String(email || "").trim();
  if (!s || s.includes("*")) return s;
  const at = s.indexOf("@");
  if (at < 1) return s;
  const name = s.slice(0, at);
  return `${name.slice(0, Math.min(2, name.length))}***${s.slice(at)}`;
}

const pick = (...vals) => vals.find((v) => v !== undefined && v !== null && v !== "");

/**
 * One appeal row from the server, in a single shape. The contract only says
 * "returns a list", so camelCase and snake_case fields are both accepted.
 */
export function normalizeAppeal(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const user = r.user || {};
  const ban = r.ban || {};
  const access = r.access || {};
  const type = pick(r.type, r.kind, r.access || r.access_code || r.accessCode ? "access" : "account") === "access" ? "access" : "account";
  return {
    id: String(pick(r.id, r.appealId, r.appeal_id) ?? ""),
    type,
    status: pick(r.status, "pending"),
    text: String(pick(r.text, r.body, r.message, "") || ""),
    createdAt: pick(r.createdAt, r.created_at, r.submittedAt, r.submitted_at, null),
    decidedAt: pick(r.decidedAt, r.decided_at, null),
    decidedBy: pick(r.decidedByUsername, r.decidedBy, r.decided_by_username, r.decided_by, null),
    note: pick(r.note, r.decidedNote, r.decided_note, r.decisionNote, r.decision_note, null),
    user: {
      id: pick(user.id, r.userId, r.user_id, null),
      username: pick(user.username, r.username, null),
      displayName: pick(user.displayName, user.display_name, r.displayName, r.display_name, null),
      avatarUrl: pick(user.avatarUrl, user.avatar_url, r.avatarUrl, r.avatar_url, null),
    },
    ban: {
      categoryId: pick(ban.categoryId, ban.category, r.categoryId, r.category, r.ban_category, null),
      reason: pick(ban.reason, r.reason, null),
      message: pick(ban.message, null),
      bannedAt: pick(ban.bannedAt, ban.banned_at, null),
      expiresAt: pick(ban.expiresAt, ban.expires_at, r.expiresAt, r.expires_at, null),
    },
    access: {
      code: pick(access.code, r.accessCode, r.access_code, r.code, null),
      kind: pick(access.kind, r.accessKind, r.access_kind, null),
      label: pick(access.label, access.masked, null),
      expiresAt: pick(access.expiresAt, access.expires_at, null),
    },
    email: pick(r.email, r.contactEmail, r.contact_email, null),
  };
}

/** Rows from the list response ({ appeals: [] } or a bare array). */
export function appealsFromResponse(data) {
  const list = Array.isArray(data) ? data : Array.isArray(data?.appeals) ? data.appeals : Array.isArray(data?.items) ? data.items : [];
  return list.map(normalizeAppeal).filter((a) => a.id);
}
