"use strict";

/**
 * Yönetici Paneli › Admin Token (owner only). Mounted inside routes/admin.js, so the
 * admin chain (auth, admin, rate limit, 2FA, step-up for every change) runs first; this
 * router adds the owner check. A request made with an admin token is allowed too.
 *
 *   GET    /tokens                      list + summary + alerts + auto-pause + MCP info
 *   POST   /tokens                      create { name, expiresIn, ipAllowlist } -> secret once
 *   GET    /tokens/:id                  token + usage + audit
 *   GET    /tokens/:id/calls?after=ISO  live console (newer than `after`)
 *   PATCH  /tokens/:id                  { name, paused, ipAllowlist }
 *   POST   /tokens/:id/rotate           { graceMinutes: 0 | 60 | 1440 } -> new secret once
 *   POST   /tokens/:id/revoke           { reason, note, confirmName }
 *   POST   /tokens/:id/restore          within 10 minutes of the revoke
 *   POST   /tokens/revoke-all           { reason, confirm: "TÜMÜNÜ İPTAL ET" }
 *   POST   /tokens/alerts/:alertId      { action: dismiss | pause | allow_ip }
 *   PUT    /tokens/auto-pause           { enabled, rules: { newCountry, newIp, burst } }
 *   GET    /openapi.json                OpenAPI 3.1 of the REST surface
 *
 * Every lifecycle change writes an admin audit entry (action security_token_*, target
 * token:<id>). The secret is only in the create / rotate response, never logged.
 */

const express = require("express");
const core = require("../lib/adminTokens/core");
const store = require("../lib/adminTokens/store");
const usage = require("../lib/adminTokens/usage");
const tokenAuth = require("../lib/adminTokens/auth");
const state = require("../runtime/sharedState");
const { userIsSuperAdmin } = require("../middleware/requireAdmin");
const { apiError } = require("../lib/apiError");

const router = express.Router();
const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MSG = {
  OWNER_ONLY: "Only the owner can manage admin tokens.",
  TOKENS_UNAVAILABLE: "Admin tokens are not set up yet.",
  TOKEN_NOT_FOUND: "Token not found.",
  NAME_REQUIRED: `Give the token a name (1-${core.NAME_MAX} characters).`,
  BAD_EXPIRY: "Choose an expiry: 1h, 1d, 7d, 30d, 90d or never.",
  BAD_IP: "Not a valid IP address or range: {entry}",
  CONFIRM_MISMATCH: "The confirmation does not match.",
  RESTORE_EXPIRED: "This token can no longer be restored (10 minutes have passed).",
  TOKEN_REVOKED: "This token was revoked.",
  BAD_REASON: "Choose a reason: leaked, unused, replaced or other.",
  BAD_GRACE: "Choose a grace period: 0, 60 or 1440 minutes.",
  BAD_ACTION: "Choose an action: dismiss, pause or allow_ip.",
  ALERT_NOT_FOUND: "Alert not found.",
  TOKEN_SELF_MANAGEMENT: "An admin token can only read, pause and revoke tokens. Sign in as the owner for this.",
  TOKEN_LIMIT: `At most ${store.ACTIVE_MAX} active admin tokens. Revoke one first.`,
};

function fail(res, status, code, vars) {
  return res.status(status).json(apiError(MSG[code] || code, vars || null, { code }));
}

function sendError(res, err, what) {
  if (err?.code === "TOKENS_UNAVAILABLE") return fail(res, 503, "TOKENS_UNAVAILABLE");
  console.error(`[admin-tokens] ${what}:`, err?.message || err);
  return res.status(500).json({ error: "Internal server error." });
}

async function ownerOnly(req, res, next) {
  try {
    if (req.apiToken || (await userIsSuperAdmin(req))) return next();
  } catch {
    /* refused below */
  }
  return fail(res, 403, "OWNER_ONLY");
}

router.use(["/tokens", "/openapi.json"], ownerOnly);

/**
 * Lead decision: a request made with an admin token may read the token pages and only
 * reduce power (pause, revoke, revoke-all, pause from an alert). Anything that adds power
 * or hides evidence (create, rotate, restore, resume, rename, IP list, allow an address,
 * dismiss an alert, auto-pause settings) needs an owner session.
 */
function sessionOnly(req, res) {
  if (!req.apiToken) return false;
  fail(res, 403, "TOKEN_SELF_MANAGEMENT");
  return true;
}

/** Refuse when the active (not revoked, not expired) tokens are already at the cap. */
async function overLimit(res, { except = null } = {}) {
  const active = await store.listActive();
  if (active.filter((r) => r.id !== except).length < store.ACTIVE_MAX) return false;
  fail(res, 409, "TOKEN_LIMIT");
  return true;
}

function audit(req, action, tokenId, meta = {}) {
  try {
    state.appendAudit(req.user.id, req.user.username, action, tokenId ? `token:${tokenId}` : "tokens", meta);
  } catch {
    /* audit optional */
  }
}

/** The creator's address as the token checks see it (strict); null when it cannot be trusted. */
function clientIp(req) {
  try {
    const a = require("../lib/adminTokens/clientAddress").ofRequest(req);
    return a.trusted ? a.ip : null;
  } catch {
    return null;
  }
}

function apiBase() {
  const raw = process.env.PUBLIC_API_URL || process.env.RENDER_EXTERNAL_URL || "https://des-call.onrender.com";
  return String(raw).replace(/\/+$/, "");
}

/* ---------------- views ---------------- */

/** Contract Token shape. */
function tokenView(row, { hourly = null, openAlert = false, now = Date.now() } = {}) {
  const hours = usage.hours24(hourly, now);
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    last4: row.last4,
    masked: core.masked(row.prefix, row.last4),
    status: core.statusOf(row, now),
    createdAt: row.created_at,
    createdIp: row.created_ip || null,
    expiresAt: row.expires_at || null,
    expiresIn: row.expires_in || "never",
    lastUsedAt: row.last_used_at || null,
    lastUsedIp: row.last_used_ip || null,
    lastUsedCountry: row.last_used_country || null,
    lastClient: row.last_client || null,
    // Calls not yet written to the database are added (flushes run every 15 s).
    requestCount: (Number(row.request_count) || 0) + usage.pendingCount(row.id),
    requests24h: hours.reduce((n, h) => n + h.count, 0),
    spark24h: hours.map((h) => h.count),
    ipAllowlist: Array.isArray(row.ip_allowlist) ? row.ip_allowlist : [],
    paused: Boolean(row.paused),
    pausedReason: row.paused ? row.paused_reason || "manual" : null,
    revokedAt: row.revoked_at || null,
    revokeReason: row.revoke_reason || null,
    revokeNote: row.revoke_note || null,
    restorableUntil: core.restorableUntil(row, now),
    graceUntil: core.graceUntil(row, now),
    hasOpenAlert: Boolean(openAlert),
  };
}

async function oneTokenView(row) {
  const now = Date.now();
  const hourly = (await usage.hourlyFor([row.id], now - 23 * 3600e3)).get(row.id);
  const alerts = await store.listAlerts({ tokenId: row.id, limit: 20 });
  return tokenView(row, { hourly, openAlert: alerts.some((a) => a.status === "open"), now });
}

/* ---------------- list ---------------- */

router.get("/tokens", async (_req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    if (!(await store.available())) return res.json({ available: false });
    const now = Date.now();
    const rows = await store.listTokens();
    const ids = rows.map((r) => r.id);
    const hourly = await usage.hourlyFor(ids, now - 47 * 3600e3);
    const alerts = await store.listAlerts({ limit: 200 });
    const names = new Map(rows.map((r) => [r.id, r.name]));
    const openBy = new Set(alerts.filter((a) => a.status === "open").map((a) => a.token_id));
    const tokens = rows.map((r) => tokenView(r, { hourly: hourly.get(r.id), openAlert: openBy.has(r.id), now }));
    const cur = Date.parse(core.hourKey(now));
    const last24 = usage.emptyAgg();
    const prev24 = usage.emptyAgg();
    for (const m of hourly.values()) {
      const a = usage.sumRange(m, cur - 23 * 3600e3, cur + 3600e3);
      const b = usage.sumRange(m, cur - 47 * 3600e3, cur - 23 * 3600e3);
      for (const k of Object.keys(last24)) {
        last24[k] += a[k];
        prev24[k] += b[k];
      }
    }
    // Open alerts first, newest first within each group.
    const sorted = [...alerts].sort((a, b) => {
      const rank = (x) => (x.status === "open" ? 0 : 1);
      if (rank(a) !== rank(b)) return rank(a) - rank(b);
      return String(b.created_at).localeCompare(String(a.created_at));
    });
    const settings = await store.getSettings();
    const mcp = require("../lib/adminTokens/mcp");
    res.json({
      available: true,
      tokens,
      summary: {
        active: tokens.filter((t) => t.status === "active").length,
        total: tokens.length,
        requests24h: last24.count,
        requestsPrev24h: prev24.count,
        destructive24h: { ban: last24.d_ban, delete: last24.d_delete, descoin: last24.d_descoin, broadcast: last24.d_broadcast, total: last24.destructive },
        alerts: alerts.filter((a) => a.status === "open").length,
      },
      alerts: sorted.slice(0, 50).map((a) => usage.alertView(a, names.get(a.token_id) || null)),
      autoPause: settings,
      mcp: {
        url: `${apiBase()}/mcp`,
        openSessions: mcp.openSessionCount(),
        tools: mcp.toolCount(),
        p50Ms: Math.round(core.percentile(usage.mcpLatencies(), 50)),
      },
    });
  } catch (e) {
    sendError(res, e, "list");
  }
});

/* ---------------- create ---------------- */

router.post("/tokens", async (req, res) => {
  try {
    if (sessionOnly(req, res)) return;
    if (!(await store.available())) return fail(res, 503, "TOKENS_UNAVAILABLE");
    const body = req.body || {};
    const name = core.cleanName(body.name);
    if (!name.ok) return fail(res, 400, "NAME_REQUIRED");
    const expiresIn = String(body.expiresIn ?? "30d");
    const exp = core.expiresAtFor(expiresIn);
    if (!exp.ok) return fail(res, 400, "BAD_EXPIRY");
    const allow = core.cleanAllowlist(body.ipAllowlist);
    if (!allow.ok) return fail(res, 400, "BAD_IP", { entry: allow.entry });
    if (await overLimit(res)) return;
    const secret = core.newSecret();
    const { prefix, last4 } = core.displayParts(secret);
    const now = new Date().toISOString();
    const row = await store.insertToken({
      owner_id: req.user.id,
      name: name.value,
      secret_hash: core.hashSecret(secret),
      prefix,
      last4,
      expires_in: expiresIn,
      expires_at: exp.value,
      ip_allowlist: allow.value,
      paused: false,
      revoked_at: null,
      grace_hash: null,
      grace_until: null,
      created_at: now,
      created_by: req.user.id,
      created_ip: clientIp(req),
      request_count: 0,
      updated_at: now,
    });
    audit(req, "security_token_create", row.id, { name: row.name, expiresIn, expiresAt: row.expires_at, ipAllowlist: allow.value.length });
    res.set("Cache-Control", "no-store");
    res.status(201).json({ token: tokenView(row), secret });
  } catch (e) {
    sendError(res, e, "create");
  }
});

/* ---------------- owner-wide actions (before /tokens/:id) ---------------- */

router.post("/tokens/revoke-all", async (req, res) => {
  try {
    if (!(await store.available())) return fail(res, 503, "TOKENS_UNAVAILABLE");
    const body = req.body || {};
    if (String(body.confirm || "").trim() !== core.REVOKE_ALL_CONFIRM) return fail(res, 400, "CONFIRM_MISMATCH");
    const reason = body.reason == null || body.reason === "" ? "other" : String(body.reason);
    if (!core.REVOKE_REASONS.includes(reason)) return fail(res, 400, "BAD_REASON");
    const note = cleanNote(body.note);
    // One update of every unrevoked row (repeated until none is left), then close what they keep open.
    const rows = await store.revokeAllActive({ revoked_at: new Date().toISOString(), revoked_by: req.user.id, revoke_reason: reason, revoke_note: note, grace_hash: null, grace_until: null });
    for (const r of rows) tokenAuth.dropLiveConnections(r.id, "revoked");
    audit(req, "security_token_revoke_all", null, { count: rows.length, reason, names: rows.map((r) => r.name).slice(0, 20) });
    res.json({ revoked: rows.length });
  } catch (e) {
    sendError(res, e, "revoke-all");
  }
});

router.put("/tokens/auto-pause", async (req, res) => {
  try {
    if (sessionOnly(req, res)) return;
    if (!(await store.available())) return fail(res, 503, "TOKENS_UNAVAILABLE");
    const body = req.body || {};
    const prev = await store.getSettings();
    const rules = body.rules && typeof body.rules === "object" ? body.rules : {};
    const next = {
      enabled: body.enabled === undefined ? prev.enabled : Boolean(body.enabled),
      rules: {
        newCountry: rules.newCountry === undefined ? prev.rules.newCountry : Boolean(rules.newCountry),
        newIp: rules.newIp === undefined ? prev.rules.newIp : Boolean(rules.newIp),
        burst: rules.burst === undefined ? prev.rules.burst : Boolean(rules.burst),
      },
    };
    const saved = await store.saveSettings(next, req.user.id);
    audit(req, "security_token_auto_pause_settings", null, { from: prev, to: saved });
    res.json({ autoPause: saved });
  } catch (e) {
    sendError(res, e, "auto-pause");
  }
});

router.post("/tokens/alerts/:alertId", async (req, res) => {
  try {
    if (!(await store.available())) return fail(res, 503, "TOKENS_UNAVAILABLE");
    if (!ID_RE.test(req.params.alertId)) return fail(res, 404, "ALERT_NOT_FOUND");
    const action = String(req.body?.action || "");
    if (!["dismiss", "pause", "allow_ip"].includes(action)) return fail(res, 400, "BAD_ACTION");
    if (action !== "pause" && sessionOnly(req, res)) return;
    const alert = await store.getAlert(req.params.alertId);
    if (!alert) return fail(res, 404, "ALERT_NOT_FOUND");
    let row = await store.getById(alert.token_id);
    if (!row) return fail(res, 404, "TOKEN_NOT_FOUND");
    const handled = { handled_at: new Date().toISOString(), handled_by: req.user.id, handled_action: action };
    let next;
    if (action === "dismiss") {
      next = await store.updateAlert(alert.id, { ...handled, status: "dismissed" });
    } else if (action === "pause") {
      if (!row.revoked_at && !row.paused) {
        row = await store.updateToken(row.id, { paused: true, paused_at: handled.handled_at, paused_reason: "manual" });
        tokenAuth.dropLiveConnections(row.id, "paused");
      }
      next = await store.updateAlert(alert.id, { ...handled, status: "resolved" });
    } else {
      if (!alert.ip) return fail(res, 400, "BAD_IP", { entry: "-" });
      const ip = core.cleanIpEntry(alert.ip);
      if (!ip) return fail(res, 400, "BAD_IP", { entry: String(alert.ip).slice(0, 64) });
      const patch = {};
      // A list in use gets the address; an empty list already allows every address.
      if (row.ip_allowlist.length && !core.ipAllowed(ip, row.ip_allowlist)) patch.ip_allowlist = [...row.ip_allowlist, ip].slice(0, core.MAX_ALLOWLIST);
      // The pause this alert caused is lifted.
      if (alert.auto_paused && row.paused && String(row.paused_reason || "").startsWith("auto:")) {
        patch.paused = false;
        patch.paused_at = null;
        patch.paused_reason = null;
      }
      if (Object.keys(patch).length) row = await store.updateToken(row.id, patch);
      usage.rememberIp(row.id, ip, alert.country || null);
      next = await store.updateAlert(alert.id, { ...handled, status: "resolved" });
    }
    audit(req, `security_token_alert_${action}`, row.id, { name: row.name, alertId: alert.id, kind: alert.kind, ip: alert.ip || null });
    res.json({ alert: usage.alertView(next, row.name), token: await oneTokenView(row) });
  } catch (e) {
    sendError(res, e, "alert");
  }
});

/* ---------------- one token ---------------- */

async function loadToken(req, res) {
  if (!(await store.available())) {
    fail(res, 503, "TOKENS_UNAVAILABLE");
    return null;
  }
  if (!ID_RE.test(String(req.params.id || ""))) {
    fail(res, 404, "TOKEN_NOT_FOUND");
    return null;
  }
  const row = await store.getById(req.params.id);
  if (!row) {
    fail(res, 404, "TOKEN_NOT_FOUND");
    return null;
  }
  return row;
}

function cleanNote(v) {
  const s = String(v ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").trim();
  return s ? s.slice(0, 300) : null;
}

const LIFECYCLE_SUMMARY = {
  security_token_create: "Token created",
  security_token_rename: "Renamed",
  security_token_pause: "Paused",
  security_token_resume: "Resumed",
  security_token_auto_pause: "Paused automatically",
  security_token_rotate: "Secret rotated",
  security_token_revoke: "Revoked",
  security_token_revoke_all: "Revoked with all tokens",
  security_token_restore: "Restored",
  security_token_ip_allowlist: "IP allowlist changed",
  security_token_alert_dismiss: "Alert dismissed",
  security_token_alert_pause: "Paused from an alert",
  security_token_alert_allow_ip: "Address allowed from an alert",
};

function auditSummary(e) {
  const m = e.meta || {};
  if (LIFECYCLE_SUMMARY[e.action]) {
    if (e.action === "security_token_rename" && m.to) return `Renamed to ${m.to}`;
    if (e.action === "security_token_rotate" && m.graceMinutes) return `Secret rotated (old one valid ${m.graceMinutes} min)`;
    if (e.action === "security_token_revoke" && m.reason) return `Revoked (${m.reason})`;
    if (e.action === "security_token_auto_pause" && m.kind) return `Paused automatically (${m.kind})`;
    return LIFECYCLE_SUMMARY[e.action];
  }
  const target = e.target ? ` ${e.target}` : "";
  if (e.action === "descoin_grant" && m.amount != null) return `descoin_grant ${m.amount}${target}`;
  return `${e.action}${target}`.slice(0, 160);
}

async function tokenAudit(row, calls) {
  const out = new Map();
  const add = (e) => {
    if (!e?.id || out.has(String(e.id))) return;
    out.set(String(e.id), e);
  };
  const target = `token:${row.id}`;
  const durable = await require("../lib/adminAuditStore").list({ target, limit: 100 });
  for (const e of durable || []) add(e);
  for (const e of state.auditLog) {
    if (e.target === target || e.meta?.token_id === row.id) add(e);
    if (out.size > 400) break;
  }
  // Entries the token's destructive calls wrote.
  const ids = [...new Set(calls.filter((c) => c.auditId).map((c) => c.auditId))].slice(0, 100);
  const missing = ids.filter((id) => !out.has(id));
  if (missing.length) {
    try {
      const res = await store.db().from("admin_audit").select("id, at, actor_id, actor_username, action, target, meta").in("id", missing);
      for (const r of res?.data || []) add({ id: r.id, at: r.at, action: r.action, target: r.target, meta: r.meta || {} });
    } catch {
      /* memory only */
    }
  }
  const { isUndoable } = require("../lib/auditConsoleModel");
  return [...out.values()]
    .filter((e) => e.target === target || e.action === "security_token_revoke_all" || e.meta?.token_id === row.id)
    .sort((a, b) => String(b.at).localeCompare(String(a.at)))
    .slice(0, 100)
    .map((e) => {
      const lifecycle = String(e.action || "").startsWith("security_token_");
      return {
        id: String(e.id),
        at: e.at,
        action: e.action,
        summary: auditSummary(e),
        auditId: lifecycle ? null : String(e.id),
        undoable: !lifecycle && isUndoable(e.action) && !e.meta?.undoOf,
      };
    });
}

router.get("/tokens/:id", async (req, res) => {
  try {
    const row = await loadToken(req, res);
    if (!row) return;
    const now = Date.now();
    const hourly = (await usage.hourlyFor([row.id], now - 23 * 3600e3)).get(row.id);
    const hours = usage.hours24(hourly, now);
    const total = hours.reduce((a, h) => {
      for (const k of Object.keys(a)) a[k] += k === "ms_max" ? 0 : Number(h[k]) || 0;
      return a;
    }, usage.emptyAgg());
    const calls = await usage.recentCalls(row.id, { limit: usage.RING_MAX });
    const top = new Map();
    for (const c of calls) {
      const key = c.via === "mcp" ? `MCP tools/call ${c.tool || "?"}` : `${c.method} ${c.path}`;
      const t = top.get(key) || { method: c.via === "mcp" ? "MCP" : c.method, path: c.via === "mcp" ? `tools/call ${c.tool || "?"}` : c.path, count: 0 };
      t.count += 1;
      top.set(key, t);
    }
    const ips = await usage.ips7d(row.id, now);
    const alerts = await store.listAlerts({ tokenId: row.id, limit: 20 });
    res.set("Cache-Control", "no-store");
    res.json({
      token: tokenView(row, { hourly, openAlert: alerts.some((a) => a.status === "open"), now }),
      usage: {
        hourly24: hours.map((h) => ({ hour: h.hour, count: h.count, destructive: h.destructive })),
        total24h: total.count,
        errorRate: total.count ? Math.round((total.errors / total.count) * 1000) / 1000 : 0,
        avgMs: total.count ? Math.round(total.ms_total / total.count) : 0,
        p95Ms: Math.round(core.percentile(calls.map((c) => c.ms), 95)),
        mcpShare: total.count ? Math.round((total.mcp / total.count) * 1000) / 1000 : 0,
        restShare: total.count ? Math.round(((total.count - total.mcp) / total.count) * 1000) / 1000 : 0,
        topEndpoints: [...top.values()].sort((a, b) => b.count - a.count).slice(0, 10),
        recentCalls: calls.slice(0, 50),
        ips7d: ips.map((i) => ({ ...i, allowed: core.ipAllowed(i.ip, row.ip_allowlist) })),
      },
      alerts: alerts.map((a) => usage.alertView(a, row.name)),
      audit: await tokenAudit(row, calls),
    });
  } catch (e) {
    sendError(res, e, "detail");
  }
});

router.get("/tokens/:id/calls", async (req, res) => {
  try {
    const row = await loadToken(req, res);
    if (!row) return;
    const after = typeof req.query.after === "string" && Number.isFinite(Date.parse(req.query.after)) ? req.query.after : null;
    res.set("Cache-Control", "no-store");
    res.json({ calls: await usage.recentCalls(row.id, { limit: 50, after }) });
  } catch (e) {
    sendError(res, e, "calls");
  }
});

router.patch("/tokens/:id", async (req, res) => {
  try {
    const row = await loadToken(req, res);
    if (!row) return;
    const body = req.body || {};
    // From a token only { paused: true } is allowed.
    if (req.apiToken && (body.name !== undefined || body.ipAllowlist !== undefined || (body.paused !== undefined && body.paused !== true))) {
      return fail(res, 403, "TOKEN_SELF_MANAGEMENT");
    }
    if (row.revoked_at) return fail(res, 409, "TOKEN_REVOKED");
    const patch = {};
    const events = [];
    if (body.name !== undefined) {
      const name = core.cleanName(body.name);
      if (!name.ok) return fail(res, 400, "NAME_REQUIRED");
      if (name.value !== row.name) {
        patch.name = name.value;
        events.push(["security_token_rename", { from: row.name, to: name.value }]);
      }
    }
    if (body.ipAllowlist !== undefined) {
      const allow = core.cleanAllowlist(body.ipAllowlist);
      if (!allow.ok) return fail(res, 400, "BAD_IP", { entry: allow.entry });
      if (JSON.stringify(allow.value) !== JSON.stringify(row.ip_allowlist)) {
        patch.ip_allowlist = allow.value;
        events.push(["security_token_ip_allowlist", { from: row.ip_allowlist, to: allow.value }]);
      }
    }
    if (body.paused !== undefined) {
      const paused = Boolean(body.paused);
      if (paused !== row.paused) {
        patch.paused = paused;
        patch.paused_at = paused ? new Date().toISOString() : null;
        patch.paused_reason = paused ? "manual" : null;
        events.push([paused ? "security_token_pause" : "security_token_resume", paused ? {} : { wasReason: row.paused_reason || null }]);
      }
    }
    let next = row;
    if (Object.keys(patch).length) {
      next = await store.updateToken(row.id, patch);
      if (patch.paused === true) tokenAuth.dropLiveConnections(row.id, "paused");
      if (patch.ip_allowlist) tokenAuth.dropLiveConnections(row.id, "ip_allowlist");
    }
    for (const [action, meta] of events) audit(req, action, row.id, { name: next.name, ...meta });
    res.json({ token: await oneTokenView(next) });
  } catch (e) {
    sendError(res, e, "update");
  }
});

router.post("/tokens/:id/rotate", async (req, res) => {
  try {
    const row = await loadToken(req, res);
    if (!row) return;
    if (sessionOnly(req, res)) return;
    if (row.revoked_at) return fail(res, 409, "TOKEN_REVOKED");
    if (core.statusOf(row) === "expired" && (await overLimit(res, { except: row.id }))) return;
    const grace = req.body?.graceMinutes === undefined || req.body?.graceMinutes === null ? 0 : Number(req.body.graceMinutes);
    if (!core.GRACE_OPTIONS.includes(grace)) return fail(res, 400, "BAD_GRACE");
    const secret = core.newSecret();
    const { prefix, last4 } = core.displayParts(secret);
    const now = Date.now();
    // A fresh secret gets a fresh lifetime of the same length (an expired token comes back).
    const exp = core.expiresAtFor(row.expires_in || "never", now);
    const next = await store.updateToken(row.id, {
      secret_hash: core.hashSecret(secret),
      prefix,
      last4,
      grace_hash: grace ? row.secret_hash : null,
      grace_until: grace ? new Date(now + grace * 60e3).toISOString() : null,
      rotated_at: new Date(now).toISOString(),
      expires_at: exp.ok ? exp.value : row.expires_at,
    });
    // Connections stay only on the new secret and, with a grace window, the one just replaced:
    // grace 0 closes the old secret's sockets and MCP sessions now, and a second rotate
    // closes the ones still on the grace secret it overwrites. The rest close when the
    // grace window ends.
    tokenAuth.dropLiveConnections(row.id, "rotated", { keepHashes: grace ? [next.secret_hash, row.secret_hash] : [next.secret_hash] });
    if (grace) tokenAuth.scheduleGraceEnd(row.id, next.grace_until);
    audit(req, "security_token_rotate", row.id, { name: row.name, graceMinutes: grace });
    res.set("Cache-Control", "no-store");
    res.json({ token: await oneTokenView(next), secret });
  } catch (e) {
    sendError(res, e, "rotate");
  }
});

router.post("/tokens/:id/revoke", async (req, res) => {
  try {
    const row = await loadToken(req, res);
    if (!row) return;
    const body = req.body || {};
    if (String(body.confirmName ?? "").trim() !== row.name) return fail(res, 400, "CONFIRM_MISMATCH");
    const reason = body.reason == null || body.reason === "" ? "other" : String(body.reason);
    if (!core.REVOKE_REASONS.includes(reason)) return fail(res, 400, "BAD_REASON");
    if (row.revoked_at) return res.json({ token: await oneTokenView(row) });
    const next = await store.updateToken(row.id, {
      revoked_at: new Date().toISOString(),
      revoked_by: req.user.id,
      revoke_reason: reason,
      revoke_note: cleanNote(body.note),
      grace_hash: null,
      grace_until: null,
    });
    tokenAuth.dropLiveConnections(row.id, "revoked");
    audit(req, "security_token_revoke", row.id, { name: row.name, reason, note: cleanNote(body.note) });
    res.json({ token: await oneTokenView(next) });
  } catch (e) {
    sendError(res, e, "revoke");
  }
});

router.post("/tokens/:id/restore", async (req, res) => {
  try {
    const row = await loadToken(req, res);
    if (!row) return;
    if (sessionOnly(req, res)) return;
    if (!row.revoked_at) return res.json({ token: await oneTokenView(row) });
    if (!core.restorableUntil(row)) return fail(res, 400, "RESTORE_EXPIRED");
    if (core.statusOf({ ...row, revoked_at: null }) !== "expired" && (await overLimit(res, { except: row.id }))) return;
    const next = await store.updateToken(row.id, { revoked_at: null, revoked_by: null, revoke_reason: null, revoke_note: null });
    audit(req, "security_token_restore", row.id, { name: row.name, revokedAt: row.revoked_at });
    res.json({ token: await oneTokenView(next) });
  } catch (e) {
    sendError(res, e, "restore");
  }
});

/* ---------------- OpenAPI ---------------- */

router.get("/openapi.json", (req, res) => {
  try {
    const doc = require("../lib/adminTokens/openapi").build(req.app, { serverUrl: apiBase() });
    res.set("Cache-Control", "no-store");
    res.json(doc);
  } catch (e) {
    sendError(res, e, "openapi");
  }
});

module.exports = router;
module.exports.tokenView = tokenView;
