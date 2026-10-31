"use strict";

/**
 * Admin > Geri Bildirim (3.0) helpers: row shaping for the list/detail, a
 * small user-agent reader for PLATFORM / CİHAZ, the PATCH whitelist and the
 * system lines written into the thread when an admin changes status/priority.
 * No raw user agents, IPs or emails leave this module.
 */

const STATUSES = ["new", "in_progress", "resolved", "closed"];
const PRIORITIES = ["low", "medium", "high", "critical"];
const CATEGORIES = ["bug", "feature", "improvement", "security", "general", "other"];

const { ref, put } = require("./botText");

// Turkish labels of OLD timeline lines ("demir durumu Çözüldü yaptı"); new lines are English
// with an i18n ref (bot.feedback.*). lib/userFeedback.js still reads the old ones.
const STATUS_TR = { new: "Yeni", in_progress: "İşlemde", resolved: "Çözüldü", closed: "Kapalı" };
const PRIORITY_TR = { low: "Düşük", medium: "Orta", high: "Yüksek", critical: "Kritik" };

function clip(s, n) {
  return String(s == null ? "" : s).slice(0, n);
}

/** PLATFORM + CİHAZ from the stored platform string (a user agent or a short tag). */
function readPlatform(raw) {
  const ua = String(raw || "");
  const out = { platform: null, device: null };
  if (!ua || ua === "unknown") return out;
  let m;
  if (/iPad/.test(ua)) {
    m = ua.match(/OS (\d+)[_.](\d+)/);
    out.platform = m ? `iPadOS ${m[1]}.${m[2]}` : "iPadOS";
    out.device = "iPad";
  } else if (/iPhone/.test(ua)) {
    m = ua.match(/OS (\d+)[_.](\d+)/);
    out.platform = m ? `iOS ${m[1]}.${m[2]}` : "iOS";
    out.device = "iPhone";
  } else if (/Android/.test(ua)) {
    m = ua.match(/Android (\d+(?:\.\d+)?)/);
    out.platform = m ? `Android ${m[1]}` : "Android";
    m = ua.match(/Android [^;]*; ([^;)]+?)(?: Build|\))/);
    out.device = m && !/^(K|wv)$/.test(m[1].trim()) ? clip(m[1].trim(), 40) : "Android";
  } else if (/Windows NT/.test(ua)) {
    out.platform = /Electron|Descall/i.test(ua) ? "Windows · app" : "Windows · web";
    out.device = "PC";
  } else if (/Mac OS X|Macintosh/.test(ua)) {
    out.platform = /Electron|Descall/i.test(ua) ? "macOS · app" : "macOS · web";
    out.device = "Mac";
  } else if (/Linux/.test(ua)) {
    out.platform = "Linux";
    out.device = "PC";
  } else if (/^(ios|android|web|electron|desktop|ipad)$/i.test(ua.trim())) {
    const k = ua.trim().toLowerCase();
    out.platform = { ios: "iOS", android: "Android", web: "Web", electron: "Desktop app", desktop: "Desktop", ipad: "iPadOS" }[k];
  } else {
    out.platform = clip(ua, 40);
  }
  return out;
}

const STATUS_OF_TR = Object.fromEntries(Object.entries(STATUS_TR).map(([k, v]) => [v, k]));
const PRIORITY_OF_TR = Object.fromEntries(Object.entries(PRIORITY_TR).map(([k, v]) => [v, k]));

/** i18n of a system line: stored on new lines; read from the Turkish text of old ones. */
function systemI18n(r) {
  if (r.type !== "system") return null;
  if (r.i18n && typeof r.i18n === "object") return r.i18n;
  const text = String(r.text || "");
  let m = /^(.+) durumu (.+) yaptı$/.exec(text);
  if (m && STATUS_OF_TR[m[2]]) return { text: ref("bot.feedback.statusChanged", { who: m[1], status: ref(`bot.feedback.status.${STATUS_OF_TR[m[2]]}`) }) };
  m = /^(.+) önceliği (.+) yaptı$/.exec(text);
  if (m && PRIORITY_OF_TR[m[2]]) return { text: ref("bot.feedback.priorityChanged", { who: m[1], priority: ref(`bot.feedback.priority.${PRIORITY_OF_TR[m[2]]}`) }) };
  if (text === "Kullanıcı yanıt verdi, yeniden açıldı") return { text: ref("bot.feedback.userReopened") };
  return null;
}

function shapeReply(r) {
  if (!r || typeof r !== "object") return null;
  const type = r.type === "system" ? "system" : r.internal ? "note" : "reply";
  return {
    id: clip(r.id || "", 40),
    type,
    internal: type === "note",
    isAdmin: type !== "reply" ? true : r.isAdmin !== false,
    text: clip(r.text || "", 4000),
    ...(systemI18n(r) ? { i18n: systemI18n(r) } : {}),
    adminUsername: r.adminUsername ? clip(r.adminUsername, 40) : null,
    attachments: Array.isArray(r.attachments) ? r.attachments.filter((a) => typeof a === "string").slice(0, 5) : [],
    created_at: r.created_at || null,
  };
}

/**
 * One list/detail row. `users` maps user_id -> { username, display_name,
 * avatar_url, created_at }, `counts` maps user_id -> number of feedbacks.
 */
function shapeFeedback(f, users = new Map(), counts = new Map()) {
  const u = users.get(String(f.user_id)) || {};
  const meta = readPlatform(f.platform);
  return {
    id: f.id,
    user: {
      id: f.user_id,
      username: u.username || f.username || "?",
      displayName: u.display_name || null,
      avatarUrl: u.avatar_url || null,
      createdAt: u.created_at || null,
      feedbackCount: counts.get(String(f.user_id)) || 1,
    },
    category: CATEGORIES.includes(f.category) ? f.category : "general",
    priority: PRIORITIES.includes(f.priority) ? f.priority : "medium",
    status: STATUSES.includes(f.status) ? f.status : "new",
    viewed: Boolean(f.viewed),
    subject: f.subject ? clip(f.subject, 200) : null,
    message: f.message || "",
    attachments: Array.isArray(f.attachments) ? f.attachments.filter((a) => typeof a === "string") : [],
    created_at: f.created_at,
    updated_at: f.updated_at,
    replies: (Array.isArray(f.admin_replies) ? f.admin_replies : []).map(shapeReply).filter(Boolean),
    // 3.7.14 form fields (null on older rows).
    kind: ["suggestion", "bug", "praise"].includes(f.kind) ? f.kind : null,
    rating: Number.isInteger(f.rating) ? f.rating : null,
    details: f.details && typeof f.details === "object" ? {
      area: typeof f.details.area === "string" ? clip(f.details.area, 20) : null,
      frequency: typeof f.details.frequency === "string" ? clip(f.details.frequency, 20) : null,
      likes: Array.isArray(f.details.likes) ? f.details.likes.filter((x) => typeof x === "string").slice(0, 8) : [],
    } : null,
    meta: {
      platform: meta.platform,
      version: f.app_version && f.app_version !== "unknown" ? clip(f.app_version, 40) : null,
      device: meta.device,
    },
  };
}

function statsOf(rows) {
  const byStatus = {}, byCategory = {}, byPriority = {};
  let unread = 0;
  for (const f of rows) {
    byStatus[f.status] = (byStatus[f.status] || 0) + 1;
    byCategory[f.category] = (byCategory[f.category] || 0) + 1;
    byPriority[f.priority] = (byPriority[f.priority] || 0) + 1;
    if (f.status === "new" && !f.viewed) unread += 1;
  }
  return { total: rows.length, byStatus, byCategory, byPriority, unread, new: unread };
}

/** Only status / priority / category may be changed from the panel. */
function sanitizePatch(body) {
  const out = {};
  if (!body || typeof body !== "object") return out;
  if (STATUSES.includes(body.status)) out.status = body.status;
  if (PRIORITIES.includes(body.priority)) out.priority = body.priority;
  if (CATEGORIES.includes(body.category)) out.category = body.category;
  return out;
}

function newId() {
  return Math.random().toString(36).slice(2, 12);
}

/**
 * Thread lines like "demir set the status to Resolved" (English text + i18n ref, so the
 * thread reads in each viewer's language; lib/botText.js).
 */
function systemLines(before, patch, adminUsername) {
  const name = clip(adminUsername || "", 40);
  const who = name || ref("bot.feedback.adminFallback");
  const at = new Date().toISOString();
  const out = [];
  if (patch.status && patch.status !== before.status) {
    out.push(put({ id: newId(), type: "system", status: patch.status, adminUsername: name || "admin", created_at: at }, "text", "bot.feedback.statusChanged", { who, status: ref(`bot.feedback.status.${patch.status}`) }));
  }
  if (patch.priority && patch.priority !== before.priority) {
    out.push(put({ id: newId(), type: "system", priority: patch.priority, adminUsername: name || "admin", created_at: at }, "text", "bot.feedback.priorityChanged", { who, priority: ref(`bot.feedback.priority.${patch.priority}`) }));
  }
  return out;
}

/** Search text for PostgREST .or(): strip the characters that change its grammar. */
function safeSearch(q) {
  return clip(q, 80).replace(/[%,()*\\:."']/g, " ").trim();
}

module.exports = {
  STATUSES, PRIORITIES, CATEGORIES, STATUS_TR, PRIORITY_TR,
  readPlatform, shapeFeedback, shapeReply, statsOf, sanitizePatch, systemLines, safeSearch, newId,
};
