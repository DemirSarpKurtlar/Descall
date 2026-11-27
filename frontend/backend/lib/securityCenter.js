"use strict";

/**
 * Güvenlik Merkezi (admin remake, owner-approved Draft A "Komuta merkezi", Nov 2026):
 * the overview the page reads, the impact numbers of the lock dialog, the 2FA reminder,
 * the minimum DM account age guard, and attach(io) (server.js): live pushes to admins
 * who may open the section, the lock expiry timer.
 */

const state = require("../runtime/sharedState");
const sec = require("./securitySettings");
const events = require("./securityEvents");
const locks = require("./securityLocks");
const { computeScore } = require("./securityScore");

let dbOverride = null;
const db = () => dbOverride || require("../db/supabase");

function withTimeout(promise, ms, fallback) {
  let timer;
  return Promise.race([
    Promise.resolve(promise).catch(() => fallback),
    new Promise((resolve) => {
      timer = setTimeout(() => resolve(fallback), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

/* ---------------- live room ---------------- */

/**
 * Socket room "admin-security": admins who may open the section join it with
 * `security:subscribe` (the shared "admin" room only holds the owner account).
 */
function attach(io) {
  if (!io) return;
  events.attachIo(io);
  locks.startTimer(io);
  io.on("connection", (socket) => {
    socket.on("security:subscribe", async () => {
      try {
        const user = socket.user;
        if (!user?.id) return;
        const perms = require("./adminPermissions");
        const row = await perms.loadRow(user.id);
        if (!perms.isOwner(user, row) && !row?.is_admin) return;
        if (!perms.canOpen(user, row, "security")) return;
        socket.join("admin-security");
      } catch {
        /* not allowed */
      }
    });
    socket.on("security:unsubscribe", () => {
      try {
        socket.leave("admin-security");
      } catch {
        /* gone */
      }
    });
  });
}

/* ---------------- inputs ---------------- */

async function loadAdmins() {
  let res = await withTimeout(db().from("users").select("id, username, is_admin, totp_enabled_at").eq("is_admin", true).limit(200), 5000, { data: null, error: { message: "timeout" } });
  if (res?.error) {
    res = await withTimeout(db().from("users").select("id, username, is_admin").eq("is_admin", true).limit(200), 5000, { data: [] });
    return { admins: (res?.data || []).map((u) => ({ id: u.id, username: u.username, twoFactor: true })), known: false };
  }
  const rows = res?.data || [];
  // The owner account counts even when is_admin is not set on it.
  if (!rows.some((u) => u.username === "admin")) {
    const own = await withTimeout(db().from("users").select("id, username, totp_enabled_at").eq("username", "admin").maybeSingle(), 3000, { data: null });
    if (own?.data) rows.push({ ...own.data, is_admin: true });
  }
  return { admins: rows.map((u) => ({ id: u.id, username: u.username, twoFactor: Boolean(u.totp_enabled_at) })), known: true };
}

let auditProbe = { at: 0, ok: true };
async function auditDurable(now = Date.now()) {
  if (now - auditProbe.at < 10 * 60 * 1000) return auditProbe.ok;
  const res = await withTimeout(db().from("admin_audit").select("id", { head: true, count: "exact" }).limit(1), 4000, { error: { message: "timeout" } });
  const missing = res?.error && (res.error.code === "42P01" || res.error.code === "PGRST205" || /does not exist|not find/i.test(String(res.error.message || "")));
  auditProbe = { at: now, ok: !missing };
  return auditProbe.ok;
}

function accessBansReady() {
  try {
    const ab = require("./accessBans");
    return typeof ab.isAvailable === "function" ? ab.isAvailable() : true;
  } catch {
    return false;
  }
}

function activeBanCount() {
  try {
    const ab = require("./accessBans");
    return typeof ab.activeCount === "function" ? ab.activeCount() : 0;
  } catch {
    return 0;
  }
}

function isSourceBanned(source) {
  try {
    const ab = require("./accessBans");
    return Boolean(ab.match({ ip: source.sourceRef || null, network: source.netRef || null, device: null }));
  } catch {
    return false;
  }
}

/* ---------------- overview ---------------- */

/**
 * Everything the page shows on load (and again on each live push / poll).
 * @param {{ totpKnown?: boolean, now?: number }} opts
 */
async function overview({ totpKnown = true, now = Date.now() } = {}) {
  try {
    await require("./accessBans").refresh();
  } catch {
    /* ban list optional */
  }
  const sinceIso = new Date(now - 48 * 3600 * 1000).toISOString();
  const turnstile = require("./turnstile");
  const [rows, adminInfo, weekAgo, auditOk, humanCheck] = await Promise.all([
    withTimeout(events.rowsSince(sinceIso), 6000, []),
    withTimeout(loadAdmins(), 6000, { admins: [], known: false }),
    withTimeout(events.postureWeekAgo(now), 4000, null),
    withTimeout(auditDurable(now), 5000, true),
    withTimeout(turnstile.adminStatus({ config: state.systemConfig, now }).catch(() => null), 6000, null),
  ]);
  const settings = sec.securityView(state.systemConfig, now);
  const score = computeScore({
    config: settings,
    admins: adminInfo.admins,
    env: {
      humanCheck: turnstile.humanCheckOk(humanCheck),
      // The one-step fix only helps when no TURNSTILE_ENFORCE env var pins the mode.
      humanCheckConfigured: Boolean(humanCheck?.configured) && !humanCheck?.envOverride,
      totpEnforced: totpKnown,
      accessBans: accessBansReady(),
      eventLog: events.persistent(),
      auditLog: auditOk,
    },
  });
  events.recordPosture(score.score, now).catch(() => {});
  const stats = events.computeStats(rows, now, { activeBans: activeBanCount(), isBanned: isSourceBanned });
  const lockCount = Object.keys(settings.locks).length;
  return {
    now: new Date(now).toISOString(),
    settings,
    score: { ...score, weekAgo, delta: weekAgo == null ? null : score.score - weekAgo },
    threat: events.threatLevel(rows, now, { locksActive: lockCount }),
    stats,
    alerts: buildAlerts({ stats, settings, score, now }),
    persistent: { events: events.persistent(), history: require("./settingsHistory").persistent() },
    totpEnforced: totpKnown,
    humanCheck,
  };
}

/** Header "Uyarılar" menu: what needs an admin's eye right now. */
function buildAlerts({ stats, settings, score, now = Date.now() }) {
  const out = [];
  if (stats.spike) out.push({ id: `burst:${stats.spike.id}`, kind: "burst", tone: "red", at: stats.spike.at, vars: { ip: stats.spike.ipMasked || "", count: stats.bursts24h }, eventId: stats.spike.id });
  for (const [mode, lock] of Object.entries(settings.locks || {})) {
    out.push({ id: `lock:${mode}:${lock.startedAt}`, kind: lock.until ? "lock" : "lockOpen", tone: "amber", at: lock.startedAt, vars: { mode, until: lock.until, by: lock.by || "" } });
  }
  const k = stats.kpis;
  if (k.failedLogins.pct != null && k.failedLogins.pct >= 100 && k.failedLogins.value >= 50) out.push({ id: "spike:failed", kind: "failedSpike", tone: "red", at: new Date(now).toISOString(), vars: { pct: k.failedLogins.pct } });
  if (k.lockedAccounts.delta >= 10) out.push({ id: "spike:locked", kind: "lockedSpike", tone: "amber", at: new Date(now).toISOString(), vars: { n: k.lockedAccounts.delta } });
  const twofa = score.checks.find((c) => c.id === "admin2fa");
  if (twofa && !twofa.ok) out.push({ id: "check:admin2fa", kind: "admin2fa", tone: "amber", at: null, vars: twofa.vars });
  return out;
}

/** "Etki önizlemesi" of the lock dialog. */
async function impact(io, now = Date.now()) {
  let online = 0;
  try {
    const { pruneDeadPresence, summarizePresence } = require("./presenceRoster");
    pruneDeadPresence(state.presence, io);
    online = summarizePresence(state.presence, { io }).connectedCount || 0;
  } catch {
    online = 0;
  }
  const since = new Date(now - 3600 * 1000).toISOString();
  const count = (q) => withTimeout(Promise.resolve(q).then((r) => (r?.error ? null : Number(r?.count || 0))), 5000, null);
  const [signups, dms] = await Promise.all([
    count(db().from("users").select("id", { head: true, count: "exact" }).gte("created_at", since)),
    count(db().from("dm_messages").select("id", { head: true, count: "exact" }).gte("created_at", since)),
  ]);
  return { online, signupsLastHour: signups, dmsLastHour: dms };
}

/* ---------------- 2FA reminder ---------------- */

// Reminder popup text per language (backend/i18n/securityReminder.js).
const REMIND_TEXT = require("../i18n/securityReminder");

/** Live reminder popup to each admin without 2FA who is connected now. */
async function remindTwoFactor({ io, actor }) {
  const { admins } = await loadAdmins();
  const missing = admins.filter((a) => !a.twoFactor);
  if (!missing.length) return { missing: 0, reached: 0, people: [] };
  const langs = {};
  try {
    const { data } = await db().from("users").select("id, language").in("id", missing.map((a) => a.id));
    for (const r of data || []) langs[r.id] = r.language;
  } catch {
    /* default language */
  }
  let reached = 0;
  const popup = require("./adminBroadcastPopup");
  for (const admin of missing) {
    const lang = REMIND_TEXT[langs[admin.id]] ? langs[admin.id] : "en";
    const [title, body, cta] = REMIND_TEXT[lang];
    const built = popup.buildPopupPayload({ title, body, severity: "warning", ctaUrl: "/settings/security", ctaLabel: cta }, { actor });
    if (!built.ok) continue;
    const payload = { ...built.popup, icon: "lock", track: false };
    delete payload.emoji;
    let hit = false;
    for (const [, sock] of io?.sockets?.sockets || []) {
      if (sock.user?.id !== admin.id) continue;
      try {
        sock.emit("admin:popup", payload);
        hit = true;
      } catch {
        /* gone */
      }
    }
    if (hit) reached += 1;
  }
  return { missing: missing.length, reached, people: missing.map((a) => a.username) };
}

/* ---------------- DM account age guard ---------------- */

const ageCache = new Map(); // userId -> { at, createdAt }
const AGE_TTL = 30 * 60 * 1000;

async function accountCreatedAt(userId) {
  const hit = ageCache.get(userId);
  if (hit && Date.now() - hit.at < AGE_TTL) return hit.createdAt;
  let createdAt = null;
  try {
    const { data } = await withTimeout(db().from("users").select("created_at").eq("id", userId).maybeSingle(), 3000, { data: null });
    createdAt = data?.created_at || null;
  } catch {
    createdAt = null;
  }
  ageCache.set(userId, { at: Date.now(), createdAt });
  if (ageCache.size > 20000) ageCache.delete(ageCache.keys().next().value);
  return createdAt;
}

/**
 * Socket dm:error body when this account is too new to send DMs, else null.
 * Unknown age (lookup failed) never blocks.
 */
async function dmAccountAgeBlock({ config, userId, isAdmin = false, now = Date.now() }) {
  const hours = Math.floor(Number(config?.dmMinAccountAgeHours) || 0);
  if (isAdmin || hours <= 0 || !userId) return null;
  const createdAt = await accountCreatedAt(userId);
  const t = Date.parse(createdAt || "");
  if (!Number.isFinite(t)) return null;
  const readyAt = t + hours * 3600 * 1000;
  if (now >= readyAt) return null;
  const { apiText } = require("./apiError");
  return {
    ...apiText("message", "New accounts can send direct messages {hours, plural, one {# hour} other {# hours}} after signing up.", { hours }),
    code: "DM_ACCOUNT_TOO_NEW",
    retryAfterMs: readyAt - now,
  };
}

function __setDbForTests(client) {
  dbOverride = client;
  ageCache.clear();
  auditProbe = { at: 0, ok: true };
}

module.exports = { attach, overview, impact, remindTwoFactor, dmAccountAgeBlock, buildAlerts, loadAdmins, __setDbForTests };
