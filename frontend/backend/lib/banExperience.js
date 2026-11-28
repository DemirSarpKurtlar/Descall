"use strict";

/**
 * Ban experience (docs/design/ban-experience/CONTRACT.md, 2026-11-14).
 *
 *   - accountBanBody(): the ACCOUNT_BANNED 403 body (section 1) with a fresh
 *     banTicket and the appeal state, used by sign-in, 2FA, Google / Apple and
 *     requireAuth (section 6).
 *   - appeals: public.ban_appeals (supabase/migrations/20261114_ban_appeals.sql).
 *     A missing table never breaks sign-in: the appeal state is then
 *     { status: "none", canAppeal: false } and the appeal endpoints answer 503.
 *   - performBan(): one ban path for every admin route (single, bulk, report,
 *     dossier): optional access ban of the account's devices, session
 *     revocation, live kick and the notification email.
 *   - Owner and admin accounts can never be banned (403 ADMIN_PROTECTED).
 *
 * The server only sends English (and the TR + EN email); the app translates
 * categoryId and the error texts.
 */

const { signBanTicket } = require("../config/jwt");
const state = require("../runtime/sharedState");
const { apiError } = require("./apiError");
const EMAIL_COPY = require("../i18n/banEmail");

let dbOverride = null;
const db = () => dbOverride || require("../db/supabase");

const APPEAL_MIN = 20;
const APPEAL_MAX = 2000;
const APPEALS_UNAVAILABLE = Object.freeze(apiError("Appeals are not available yet. Try again later.", null, { code: "APPEALS_UNAVAILABLE" }));
const ADMIN_PROTECTED = Object.freeze(apiError("Owner and admin accounts cannot be banned.", null, { code: "ADMIN_PROTECTED" }));
// Timeouts, kicks, signing out and wallet freezes against admin accounts (same code, so the
// panel shows the same notice as for a ban).
const ADMIN_TARGET_PROTECTED = Object.freeze(apiError("This action cannot be used on an owner or admin account.", null, { code: "ADMIN_PROTECTED" }));

function moderation() {
  return require("./moderation");
}

function isMissingTable(error) {
  if (!error) return false;
  const code = String(error.code || "");
  if (code === "42P01" || code === "PGRST205") return true;
  return /ban_appeals/.test(String(error.message || "")) && /(does not exist|schema cache)/i.test(String(error.message || ""));
}

function appealsUnavailableError() {
  const err = new Error(APPEALS_UNAVAILABLE.error);
  err.status = 503;
  err.code = APPEALS_UNAVAILABLE.code;
  return err;
}

/* ---------------- ban body ---------------- */

function categoryIdOf(category) {
  const id = String(category || "other");
  return moderation().MOD_CATEGORIES.some((c) => c.id === id) ? id : "other";
}

/** Ban detail ({ category, reason, message, bannedAt, expiresAt, bannedBy }) from a users row. */
function detailFromUserRow(row) {
  return {
    category: row?.ban_category || "other",
    reason: row?.ban_reason || null,
    message: row?.ban_message || null,
    bannedAt: row?.banned_at || null,
    expiresAt: row?.ban_expires_at || null,
    bannedBy: row?.banned_by || null,
  };
}

/** The `ban` object of CONTRACT section 1. */
function publicBan(detail, username) {
  const category = detail?.category || "other";
  return {
    categoryId: categoryIdOf(category),
    category,
    reason: detail?.reason || moderation().categoryLabel(category),
    message: detail?.message || null,
    bannedAt: detail?.bannedAt || null,
    expiresAt: detail?.expiresAt || null,
    username: username || null,
    // Every ban path today is an admin action (routes/admin.js, routes/adminPeople.js).
    byAdmin: true,
  };
}

function publicAppeal(row, { available = true } = {}) {
  if (!available) return { status: "none", submittedAt: null, canAppeal: false };
  if (!row || row.status === "accepted") return { status: "none", submittedAt: null, canAppeal: true };
  return {
    status: row.status === "rejected" ? "rejected" : "pending",
    submittedAt: row.created_at || null,
    // One appeal per ban: a pending or rejected appeal closes the button.
    canAppeal: false,
  };
}

/** Latest account appeal for this ban (made at or after bannedAt). Never throws. */
async function latestAccountAppeal(userId, bannedAt) {
  try {
    let q = db()
      .from("ban_appeals")
      .select("id, status, created_at, decided_at")
      .eq("type", "account")
      .eq("user_id", userId);
    if (bannedAt) q = q.gte("created_at", bannedAt);
    const { data, error } = await q.order("created_at", { ascending: false }).limit(1);
    if (error) {
      if (!isMissingTable(error)) console.warn("[ban-appeals] lookup:", error.message);
      return { available: false, row: null };
    }
    return { available: true, row: (data || [])[0] || null };
  } catch (err) {
    console.warn("[ban-appeals] lookup:", err?.message || err);
    return { available: false, row: null };
  }
}

async function appealStateFor(userId, bannedAt) {
  const { available, row } = await latestAccountAppeal(userId, bannedAt);
  return publicAppeal(row, { available });
}

/** CONTRACT section 1 body (with a fresh 30 min banTicket). */
async function accountBanBody({ userId, username, detail, emailOnFile }) {
  const appeal = await appealStateFor(userId, detail?.bannedAt || null);
  return {
    ...apiError("Account is banned.", null, { code: "ACCOUNT_BANNED" }),
    ban: publicBan(detail, username || state.usernameById.get(String(userId)) || null),
    banTicket: signBanTicket({ id: userId }),
    // emailOnFile false: no verified address, so the appeal result is not emailed
    // (the ban screen says it shows up there instead). Unknown = left out.
    appeal: typeof emailOnFile === "boolean" ? { ...appeal, emailOnFile } : appeal,
  };
}

/* ---------------- protection ---------------- */

function isProtectedRow(row) {
  return Boolean(row && (row.username === "admin" || row.is_admin || row.is_super_admin));
}

/** { row, protected, found } for a ban target, read fresh from the database. */
async function banTarget(userId) {
  const perms = require("./adminPermissions");
  perms.invalidate(userId);
  const row = await perms.loadRow(userId);
  return { row, found: Boolean(row), protected: isProtectedRow(row) };
}

/**
 * True when `userId` is an admin / owner account that this action may not touch. Timeouts and
 * kicks never reach one (like bans and the Moderasyon masası bulk tool); with ownerMay, the
 * owner may still act (signing out a compromised admin, freezing a wallet).
 */
async function targetProtected(userId, { actorIsOwner = false, ownerMay = false } = {}) {
  const t = await banTarget(userId);
  if (!t.found || !t.protected) return false;
  return !(ownerMay && actorIsOwner);
}

/* ---------------- email ---------------- */

function fill(template, vars = {}) {
  return String(template).replace(/\{(\w+)\}/g, (m, k) => (vars[k] == null ? m : String(vars[k])));
}

function formatWhen(iso, lang) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  try {
    if (lang === "tr") {
      return `${d.toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", dateStyle: "long", timeStyle: "short" })} ${EMAIL_COPY.tr.timeZone}`;
    }
    return `${d.toLocaleString("en-GB", { timeZone: "UTC", dateStyle: "long", timeStyle: "short" })} ${EMAIL_COPY.en.timeZone}`;
  } catch {
    return d.toISOString();
  }
}

const RULE = "----------------------------------------";

function greeting(lang, username) {
  const c = EMAIL_COPY[lang];
  return username ? fill(c.greeting, { who: `@${username}` }) : c.greetingNoName;
}

/** TR + EN plain-text ban notice ({ subject, text }). Copy: backend/i18n/banEmail.js. */
function buildBanEmail({ username, detail }) {
  const { SUPPORT_EMAIL } = require("./mailer");
  const cat = categoryIdOf(detail?.category);
  const custom = cat === "other" && detail?.reason && detail.reason !== "Other" ? detail.reason : null;
  const labels = {
    tr: custom || EMAIL_COPY.tr.categories[cat] || moderation().categoryLabel(cat),
    en: custom || moderation().categoryLabel(cat),
  };
  const note = detail?.message ? String(detail.message).trim() : "";
  const temporary = Boolean(detail?.expiresAt);
  const part = (lang) => {
    const c = EMAIL_COPY[lang];
    const lines = [greeting(lang, username), "", temporary ? c.banTemporary : c.banPermanent, "", fill(c.reason, { label: labels[lang] })];
    if (note) lines.push(fill(c.note, { note }));
    lines.push(temporary ? fill(c.ends, { when: formatWhen(detail.expiresAt, lang) }) : c.permanent);
    lines.push("", c.howToAppeal, fill(c.questions, { email: SUPPORT_EMAIL }));
    return lines;
  };
  const subjectKey = temporary ? "subjectTemporary" : "subjectPermanent";
  return {
    subject: `${EMAIL_COPY.tr[subjectKey]} / ${EMAIL_COPY.en[subjectKey]}`,
    text: [...part("tr"), "", RULE, "", ...part("en"), "", "Descall"].join("\n"),
  };
}

/** TR + EN plain-text appeal decision ({ subject, text }). */
function buildAppealResultEmail({ type, decision, note, accessCode, username }) {
  const { SUPPORT_EMAIL } = require("./mailer");
  const accepted = decision === "accept";
  const cleanNote = note ? String(note).trim() : "";
  const key =
    type === "access"
      ? accepted ? "appealAccessAccepted" : "appealAccessRejected"
      : accepted ? "appealAccountAccepted" : "appealAccountRejected";
  const part = (lang) => {
    const c = EMAIL_COPY[lang];
    const lines = [greeting(lang, username), "", fill(c[key], { code: accessCode || "" }).replace(/\s{2,}/g, " ")];
    if (cleanNote) lines.push(fill(c.note, { note: cleanNote }));
    lines.push("", fill(c.questions, { email: SUPPORT_EMAIL }));
    return lines;
  };
  const subjectKey = accepted ? "subjectAppealAccepted" : "subjectAppealRejected";
  return {
    subject: `${EMAIL_COPY.tr[subjectKey]} / ${EMAIL_COPY.en[subjectKey]}`,
    text: [...part("tr"), "", RULE, "", ...part("en"), "", "Descall"].join("\n"),
  };
}

async function sendPlainEmail(to, { subject, text }) {
  if (!to) return false;
  try {
    const { sendEmail } = require("./mailer");
    const r = await sendEmail({ to, subject, text });
    return Boolean(r?.sent);
  } catch (err) {
    console.warn("[ban-email] send failed:", err?.message || err);
    return false;
  }
}

/* ---------------- one ban path for every admin route ---------------- */

const ACCESS_DURATIONS = [
  ["1d", 86400],
  ["7d", 7 * 86400],
  ["30d", 30 * 86400],
  ["90d", 90 * 86400],
];

/** Access-ban duration that covers an account ban of `seconds` (null = permanent). */
function accessDurationFor(seconds) {
  if (seconds == null) return "permanent";
  for (const [id, s] of ACCESS_DURATIONS) if (seconds <= s) return id;
  return "permanent";
}

function flag(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "string") return !["false", "0", "no", "off"].includes(value.toLowerCase());
  return Boolean(value);
}

/** Ban options from a request body (CONTRACT section 7 defaults). */
function banOptionsFrom(body = {}) {
  return {
    revokeSessions: flag(body.revokeSessions, true),
    notifyEmail: flag(body.notifyEmail, true),
    alsoAccessBan: flag(body.alsoAccessBan, false),
    accessDuration: typeof body.accessDuration === "string" ? body.accessDuration : null,
  };
}

/**
 * Apply an account ban and everything around it. The caller has already
 * checked the target (banTarget) and that it is not protected.
 */
async function performBan({
  io,
  actor,
  targetUserId,
  category,
  otherText,
  message,
  presetId,
  durationSeconds,
  revokeSessions = true,
  notifyEmail = true,
  alsoAccessBan = false,
  accessDuration = null,
  username = null,
}) {
  const mod = moderation();
  const result = await mod.applyBan({
    targetUserId,
    actorUserId: actor?.id || null,
    category,
    otherText,
    message,
    presetId: presetId || "permanent",
    durationSeconds,
  });
  const detail = mod.activeBanDetail(targetUserId) || {
    category: result.category,
    reason: result.reason,
    message: result.message,
    bannedAt: new Date().toISOString(),
    expiresAt: result.expiresAt,
  };
  const extra = { sessionsRevoked: 0, emailed: false, accessBan: null };

  // Devices and addresses come from the saved sessions: read them before revoking.
  if (alsoAccessBan) {
    const accessBans = require("./accessBans");
    try {
      const duration = accessDuration && Object.prototype.hasOwnProperty.call(accessBans.DURATIONS, accessDuration)
        ? accessDuration
        : accessDurationFor(result.durationSeconds);
      const r = await accessBans.banAccountAccess({
        userId: targetUserId,
        duration,
        reason: result.reason,
        actor,
      });
      extra.accessBan = { added: r.added.length, skipped: r.skipped, duration };
    } catch (err) {
      extra.accessBan = { added: 0, error: err?.message || "Access ban failed.", code: err?.code || null };
    }
  }

  if (revokeSessions) {
    try {
      const { clearAllSessions } = require("./sessions");
      const removed = await clearAllSessions(targetUserId);
      mod.noteBanRevokedSessions(targetUserId, removed);
      extra.sessionsRevoked = removed.length;
    } catch (err) {
      console.warn("[ban] session revoke failed:", err?.message || err);
    }
  }

  let targetUsername = username;
  let emailRow = null;
  if (notifyEmail || !targetUsername) {
    const { data } = await db()
      .from("users")
      .select("id, username, email, email_confirmed_at")
      .eq("id", targetUserId)
      .maybeSingle();
    emailRow = data || null;
    targetUsername = targetUsername || emailRow?.username || null;
  }

  if (io) {
    const { kickUser } = require("../socket/adminHandlers");
    await kickUser(io, {
      actorId: actor?.id,
      actorUsername: actor?.username,
      targetUserId,
      reason: result.reason,
      action: "ban",
      category: result.category,
      message: result.message,
      bannedAt: detail.bannedAt,
      expiresAt: result.expiresAt,
      username: targetUsername,
    });
    if (extra.accessBan?.added) {
      try {
        await require("../routes/adminAccess").kickMatching(io);
      } catch (err) {
        console.warn("[ban] access kick failed:", err?.message || err);
      }
    }
  }

  if (notifyEmail && emailRow?.email && emailRow.email_confirmed_at) {
    extra.emailed = await sendPlainEmail(emailRow.email, buildBanEmail({ username: targetUsername, detail }));
  }

  return { ...result, bannedAt: detail.bannedAt, ...extra };
}

/* ---------------- appeals ---------------- */

function cleanAppealText(raw) {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (text.length < APPEAL_MIN || text.length > APPEAL_MAX) return null;
  return text;
}

async function insertAppeal(row) {
  const { data, error } = await db().from("ban_appeals").insert(row).select("*").single();
  if (error) {
    if (isMissingTable(error)) throw appealsUnavailableError();
    throw new Error(error.message || "Could not save the appeal.");
  }
  return data;
}

function publicAdminAppeal(row, { usersById = {}, accessById = {} } = {}) {
  const user = row.user_id ? usersById[row.user_id] || null : null;
  const access = row.access_ban_id ? accessById[row.access_ban_id] || null : null;
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    text: row.text,
    email: row.email || null,
    createdAt: row.created_at || null,
    decidedAt: row.decided_at || null,
    decidedBy: row.decided_by ? usersById[row.decided_by]?.username || null : null,
    decidedNote: row.decided_note || null,
    userId: row.user_id || null,
    username: user?.username || null,
    ban: user && row.type === "account"
      ? {
          active: Boolean(user.is_banned),
          categoryId: categoryIdOf(user.ban_category),
          reason: user.ban_reason || null,
          message: user.ban_message || null,
          bannedAt: user.banned_at || null,
          expiresAt: user.ban_expires_at || null,
        }
      : null,
    accessCode: row.access_code || null,
    accessBanId: row.access_ban_id || null,
    access: access
      ? {
          code: row.access_code || null,
          kind: access.kind,
          createdAt: access.created_at || null,
          expiresAt: access.expires_at || null,
          active: !access.revoked_at && !(access.expires_at && Date.parse(access.expires_at) <= Date.now()),
        }
      : null,
  };
}

async function listAppeals({ status, type, limit = 200 } = {}) {
  let q = db().from("ban_appeals").select("*").order("created_at", { ascending: false }).limit(Math.min(500, Math.max(1, Number(limit) || 200)));
  if (["pending", "accepted", "rejected"].includes(status)) q = q.eq("status", status);
  if (["account", "access"].includes(type)) q = q.eq("type", type);
  const { data, error } = await q;
  if (error) {
    if (isMissingTable(error)) throw appealsUnavailableError();
    throw new Error(error.message);
  }
  return enrichAppeals(data || []);
}

async function listAppealsByIds(ids) {
  const { data, error } = await db().from("ban_appeals").select("*").in("id", ids);
  if (error) {
    if (isMissingTable(error)) throw appealsUnavailableError();
    throw new Error(error.message);
  }
  return enrichAppeals(data || []);
}

async function enrichAppeals(rows) {
  const userIds = [...new Set(rows.flatMap((r) => [r.user_id, r.decided_by]).filter(Boolean))];
  const accessIds = [...new Set(rows.map((r) => r.access_ban_id).filter(Boolean))];
  const usersById = {};
  const accessById = {};
  if (userIds.length) {
    const { data: users } = await db()
      .from("users")
      .select("id, username, is_banned, ban_category, ban_reason, ban_message, banned_at, ban_expires_at")
      .in("id", userIds);
    for (const u of users || []) usersById[u.id] = u;
  }
  if (accessIds.length) {
    const { data: bans } = await db()
      .from("access_bans")
      .select("id, kind, created_at, expires_at, revoked_at")
      .in("id", accessIds);
    for (const b of bans || []) accessById[b.id] = b;
  }
  return rows.map((r) => publicAdminAppeal(r, { usersById, accessById }));
}

function __setDbForTests(client) {
  dbOverride = client;
}

module.exports = {
  APPEAL_MIN,
  APPEAL_MAX,
  APPEALS_UNAVAILABLE,
  ADMIN_PROTECTED,
  ADMIN_TARGET_PROTECTED,
  targetProtected,
  isMissingTable,
  appealsUnavailableError,
  categoryIdOf,
  detailFromUserRow,
  publicBan,
  publicAppeal,
  latestAccountAppeal,
  appealStateFor,
  accountBanBody,
  isProtectedRow,
  banTarget,
  buildBanEmail,
  buildAppealResultEmail,
  sendPlainEmail,
  accessDurationFor,
  banOptionsFrom,
  performBan,
  cleanAppealText,
  insertAppeal,
  publicAdminAppeal,
  listAppeals,
  listAppealsByIds,
  __setDbForTests,
};
