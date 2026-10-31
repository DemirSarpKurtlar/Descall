"use strict";

/**
 * Geri bildirim, user side (3.7.14, owner pick "A"): what the sender may send
 * and what they may read back.
 *
 * - sanitizeSubmission: kind (suggestion / bug / praise), message, optional
 *   area / frequency / likes / rating, up to 3 screenshot URLs on our own
 *   media storage, platform + app version only when the user ticked "Cihaz
 *   bilgisini ekle".
 * - shapeForUser: the sender's view of one row. Internal admin notes, admin
 *   ids / usernames, e-mail delivery fields and the raw user agent never leave
 *   this module; every team message is signed "Descall Ekibi".
 * - unreadFor / appendUserReply: read state and the user's answers, stored in
 *   the same admin_replies thread the admin panel already renders
 *   ({ type: "reply", isAdmin: false }).
 */

const KINDS = ["suggestion", "bug", "praise"];
const AREAS = ["chat", "voice", "server", "shop", "settings", "other"];
const FREQUENCIES = ["once", "sometimes", "always"];
const LIKES = ["voice", "design", "screen", "servers", "shop", "speed"];
const STATUSES = ["new", "in_progress", "resolved", "closed"];
const MAX_MESSAGE = 1000;
const MAX_REPLY = 1000;
const MIN_MESSAGE = 5;
const MAX_SHOTS = 3;

/** kind -> legacy category column (CHECK: bug, feature, improvement, security, other). */
const CATEGORY_OF = { suggestion: "feature", bug: "bug", praise: "improvement" };

const STATUS_FROM_TR = { "Yeni": "new", "İşlemde": "in_progress", "Çözüldü": "resolved", "Kapalı": "closed" };

function clip(s, n) {
  return String(s == null ? "" : s).slice(0, n);
}

function newId() {
  return Math.random().toString(36).slice(2, 12);
}

/** Screenshot / attachment URLs: https only, on our Supabase storage (or MEDIA_HOSTS). */
function isOwnMediaUrl(url, env = process.env) {
  if (typeof url !== "string" || url.length > 600) return false;
  let u;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol !== "https:") return false;
  const hosts = new Set();
  try { if (env.SUPABASE_URL) hosts.add(new URL(env.SUPABASE_URL).host); } catch { /* ignore */ }
  for (const h of String(env.MEDIA_HOSTS || "").split(",").map((s) => s.trim()).filter(Boolean)) hosts.add(h);
  if (hosts.has(u.host)) return true;
  // Supabase public / signed storage on any project host.
  return /\.supabase\.co$/.test(u.host) && u.pathname.startsWith("/storage/v1/object/");
}

/**
 * The submit body → the row fields we store, or { error }.
 * Accepts the old client shape too ({ category, priority, message }).
 */
function sanitizeSubmission(body, { userAgent = "", env = process.env } = {}) {
  const b = body && typeof body === "object" ? body : {};
  const message = String(b.message || "").trim();
  if (message.length < MIN_MESSAGE) return { error: "too_short" };
  let kind = KINDS.includes(b.kind) ? b.kind : null;
  if (!kind) kind = b.category === "bug" ? "bug" : b.category === "improvement" ? "praise" : "suggestion";
  const rating = Number.isInteger(b.rating) && b.rating >= 1 && b.rating <= 5 ? b.rating : null;
  const details = {};
  if (AREAS.includes(b.area)) details.area = b.area;
  if (kind === "bug" && FREQUENCIES.includes(b.frequency)) details.frequency = b.frequency;
  if (kind === "praise" && Array.isArray(b.likes)) {
    const likes = [...new Set(b.likes.filter((x) => LIKES.includes(x)))];
    if (likes.length) details.likes = likes;
  }
  const attachments = (Array.isArray(b.attachments) ? b.attachments : [])
    .filter((u) => isOwnMediaUrl(u, env))
    .slice(0, MAX_SHOTS);
  const includeDevice = b.includeDevice !== false;
  // Priority: a bug that happens every time is high, a bad rating raises it too.
  let priority = "medium";
  if (kind === "bug" && details.frequency === "always") priority = "high";
  else if (kind === "praise") priority = "low";
  else if (rating != null && rating <= 2) priority = "high";
  const legacyPriority = ["low", "medium", "high", "critical"].includes(b.priority) ? b.priority : null;
  return {
    row: {
      kind,
      category: CATEGORY_OF[kind],
      priority: b.kind ? priority : legacyPriority || priority,
      subject: clip(message.split(/\r?\n/, 1)[0], 200).trim(),
      message: clip(message, MAX_MESSAGE),
      rating,
      details,
      attachments,
      platform: includeDevice ? clip(b.platform || userAgent || "unknown", 160) : "hidden",
      app_version: includeDevice ? clip(b.appVersion || "unknown", 80) : "hidden",
    },
  };
}

function isTeamEntry(r) {
  return r && r.type !== "system" && !r.internal && r.isAdmin !== false;
}

function statusOfSystemEntry(r) {
  if (STATUSES.includes(r.status)) return r.status;
  const m = String(r.text || "").match(/durumu (.+?) yaptı/);
  return m ? STATUS_FROM_TR[m[1]] || null : null;
}

/** The thread as the sender sees it. Priority changes and notes are left out. */
function userThread(row) {
  const out = [];
  for (const r of Array.isArray(row?.admin_replies) ? row.admin_replies : []) {
    if (!r || typeof r !== "object" || r.internal) continue;
    if (r.type === "system") {
      const status = statusOfSystemEntry(r);
      if (status) out.push({ id: clip(r.id, 40), type: "status", status, created_at: r.created_at || null });
      continue;
    }
    const text = clip(r.text || r.message || "", 4000);
    if (!text && !(Array.isArray(r.attachments) && r.attachments.length)) continue;
    out.push({
      id: clip(r.id, 40),
      type: "message",
      fromTeam: r.isAdmin !== false,
      text,
      attachments: Array.isArray(r.attachments) ? r.attachments.filter((a) => typeof a === "string").slice(0, 5) : [],
      created_at: r.created_at || null,
    });
  }
  return out;
}

function unreadFor(row) {
  const since = row?.user_last_read_at ? new Date(row.user_last_read_at).getTime() : 0;
  let n = 0;
  for (const r of Array.isArray(row?.admin_replies) ? row.admin_replies : []) {
    if (!r || r.internal) continue;
    const at = new Date(r.created_at || 0).getTime();
    if (!(at > since)) continue;
    if (isTeamEntry(r) || (r.type === "system" && statusOfSystemEntry(r))) n += 1;
  }
  return n;
}

function shapeForUser(row, { withThread = true } = {}) {
  const thread = userThread(row);
  const lastTeam = [...thread].reverse().find((m) => m.type === "message");
  const kind = KINDS.includes(row.kind) ? row.kind
    : row.category === "bug" ? "bug" : row.category === "improvement" ? "praise" : "suggestion";
  const out = {
    id: row.id,
    kind,
    status: STATUSES.includes(row.status) ? row.status : "new",
    subject: row.subject ? clip(row.subject, 200) : clip(String(row.message || "").split(/\r?\n/, 1)[0], 200),
    message: String(row.message || ""),
    rating: Number.isInteger(row.rating) ? row.rating : null,
    details: row.details && typeof row.details === "object" ? {
      area: AREAS.includes(row.details.area) ? row.details.area : null,
      frequency: FREQUENCIES.includes(row.details.frequency) ? row.details.frequency : null,
      likes: Array.isArray(row.details.likes) ? row.details.likes.filter((x) => LIKES.includes(x)) : [],
    } : { area: null, frequency: null, likes: [] },
    attachments: Array.isArray(row.attachments) ? row.attachments.filter((a) => typeof a === "string") : [],
    device: row.platform === "hidden" ? null : deviceLabel(row.platform, row.app_version),
    created_at: row.created_at,
    updated_at: row.updated_at,
    unread: unreadFor(row),
    canReply: row.status !== "closed",
    last: lastTeam ? { fromTeam: lastTeam.fromTeam, text: clip(lastTeam.text, 140), created_at: lastTeam.created_at } : null,
  };
  if (withThread) out.thread = thread;
  return out;
}

/** "Windows · 3.7.14" from the stored user agent / tag; never the raw string. */
function deviceLabel(platform, version) {
  const ua = String(platform || "");
  let os = null;
  if (/iPad/.test(ua)) os = "iPad";
  else if (/iPhone|^ios$/i.test(ua)) os = "iPhone";
  else if (/Android/i.test(ua)) os = "Android";
  else if (/Windows/.test(ua) || /^(electron|desktop)$/i.test(ua)) os = "Windows";
  else if (/Mac OS X|Macintosh/.test(ua)) os = "Mac";
  else if (/Linux/.test(ua)) os = "Linux";
  else if (/^web$/i.test(ua)) os = "Web";
  const v = version && !/^(unknown|hidden)$/.test(version) ? clip(version, 20) : null;
  if (!os && !v) return null;
  return [os, v].filter(Boolean).join(" · ");
}

/** The user's answer appended to the thread; a resolved item reopens. Closed = 409. */
function appendUserReply(row, text, attachments = [], env = process.env) {
  const clean = String(text || "").trim().slice(0, MAX_REPLY);
  const shots = (Array.isArray(attachments) ? attachments : []).filter((u) => isOwnMediaUrl(u, env)).slice(0, MAX_SHOTS);
  if (!clean && !shots.length) return { error: "empty" };
  if (row.status === "closed") return { error: "closed" };
  const now = new Date().toISOString();
  const reply = { id: newId(), type: "reply", isAdmin: false, text: clean, attachments: shots, created_at: now };
  const replies = [...(Array.isArray(row.admin_replies) ? row.admin_replies : []), reply];
  const update = { admin_replies: replies, updated_at: now, user_last_read_at: now, viewed: false };
  if (row.status === "resolved") {
    update.status = "in_progress";
    replies.push({ id: newId(), type: "system", status: "in_progress", text: "Kullanıcı yanıt verdi, yeniden açıldı", created_at: now });
  }
  return { reply, update };
}

module.exports = {
  KINDS,
  AREAS,
  FREQUENCIES,
  LIKES,
  MAX_SHOTS,
  MIN_MESSAGE,
  CATEGORY_OF,
  isOwnMediaUrl,
  sanitizeSubmission,
  userThread,
  unreadFor,
  shapeForUser,
  deviceLabel,
  appendUserReply,
};
