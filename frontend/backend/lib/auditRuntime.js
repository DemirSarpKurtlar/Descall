"use strict";

/**
 * İşlem kaydı runtime (Nov 2026):
 *  - contextMiddleware: every /admin request runs inside an AsyncLocalStorage
 *    context, so the audit entry written anywhere down the call chain
 *    (state.appendAudit -> adminAuditStore.persist) can carry who sent it:
 *    masked IP, user agent, request id, endpoint, step-up used. Nothing about
 *    the request is stored in full (no raw IP, no headers, no body).
 *  - publish: live stream ping to the admin room ("admin:audit" with id, time,
 *    code and actor only; the rows themselves come from GET /admin/audit, which
 *    checks the "audit" section).
 *  - noteDenied: one "access_denied" entry per admin + section per 10 minutes
 *    when a request is refused by the section check (Reddedilen erişim).
 */

const { AsyncLocalStorage } = require("async_hooks");
const crypto = require("crypto");

const als = new AsyncLocalStorage();
let ioRef = null;
const deniedSeen = new Map();
const DENIED_EVERY_MS = 10 * 60 * 1000;

function setIo(io) {
  if (io && typeof io.to === "function") ioRef = io;
}

function getIo() {
  return ioRef;
}

function maskIp(ip) {
  try {
    return require("./clientIp").maskIp(ip);
  } catch {
    return null;
  }
}

function ipOf(req) {
  // Admin Token MCP calls reach the admin API over loopback; the bot's own address is kept.
  if (req?.apiTokenClientIp) return req.apiTokenClientIp;
  try {
    return require("./clientIp").ipOfRequest(req);
  } catch {
    return req?.ip || null;
  }
}

/** "Descall/3.4 (Windows NT 10.0) ..." trimmed to 160 characters. */
function cleanUa(ua) {
  const s = String(ua || "").replace(/[\r\n\t]+/g, " ").trim();
  return s ? s.slice(0, 160) : null;
}

function requestIdOf(req) {
  const given = req?.get ? req.get("x-request-id") : req?.headers?.["x-request-id"];
  if (given && /^[A-Za-z0-9._:-]{6,80}$/.test(String(given))) return String(given);
  return `req_${crypto.randomBytes(6).toString("hex")}`;
}

/** Express middleware (admin router, after requireAuth). */
function contextMiddleware(req, _res, next) {
  try {
    const io = req.app?.get?.("io");
    if (io) setIo(io);
  } catch {
    /* no app */
  }
  const ctx = {
    ipMasked: maskIp(ipOf(req)),
    userAgent: cleanUa(req.get ? req.get("user-agent") : req.headers?.["user-agent"]),
    requestId: requestIdOf(req),
    endpoint: `${String(req.method || "GET").toUpperCase()} ${String(req.baseUrl || "").replace(/^\/api/, "")}${String(req.path || "").replace(/\/[0-9a-f]{8}-[0-9a-f-]{27}/gi, "/:id")}`.slice(0, 160),
    stepUp: Boolean(req.get ? req.get("x-admin-step-up") : req.headers?.["x-admin-step-up"]),
  };
  als.run(ctx, () => next());
}

/** The request context of the running admin request, or null (socket, timers). */
function current() {
  return als.getStore() || null;
}

/** Live ping for open İşlem kaydı pages; never throws. */
function publish(entry) {
  if (!ioRef || !entry) return false;
  try {
    ioRef.to("admin").emit("admin:audit", {
      id: String(entry.id),
      at: entry.at || new Date().toISOString(),
      action: entry.action || null,
      actorUsername: entry.actorUsername || null,
    });
    return true;
  } catch {
    return false;
  }
}

/** Section check refused an admin: one entry per admin + section per 10 minutes. */
function noteDenied(user, section, req, { now = Date.now() } = {}) {
  if (!user?.id || !section) return false;
  const key = `${user.id}:${section}`;
  const last = deniedSeen.get(key) || 0;
  if (now - last < DENIED_EVERY_MS) return false;
  deniedSeen.set(key, now);
  if (deniedSeen.size > 2000) deniedSeen.clear();
  try {
    require("../runtime/sharedState").appendAudit(user.id, user.username, "access_denied", section, {
      method: String(req?.method || "GET").toUpperCase(),
      path: String(req?.path || "").replace(/\/[0-9a-f]{8}-[0-9a-f-]{27}/gi, "/:id").slice(0, 120),
      status: 403,
    });
    return true;
  } catch {
    return false;
  }
}

function __resetForTests() {
  ioRef = null;
  deniedSeen.clear();
}

module.exports = { contextMiddleware, current, publish, setIo, getIo, noteDenied, cleanUa, __resetForTests };
