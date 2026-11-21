"use strict";

/**
 * Admin Token authentication: `Authorization: Bearer dsk_admin_…` (REST), the same
 * secret in the socket.io handshake, and the MCP endpoint.
 *
 * A valid token resolves to the owner account exactly like an owner session
 * (req.user = { id, username, sid: null }) plus req.apiToken = { id, name }. The admin
 * chain treats it as an owner who already passed 2FA and step-up (owner decision:
 * tokens act directly). The admin rate limits still apply (their own bucket per token).
 *
 * Checks, in order: the migration is applied, the hash is known (current secret, or the
 * previous one inside its rotate grace window), not revoked, not expired, not paused,
 * the owner still is the owner, the address is inside the IP allowlist, and the address
 * is not a new one that the owner's auto-pause rules stop.
 *
 * MCP tool calls reach the admin API over loopback with the same token. Those inner
 * requests carry a one-time-use reference to the outer MCP call (x-descall-mcp-call),
 * registered only inside this process, so they are attributed to the bot's real
 * address and recorded once, as the MCP call.
 */

const crypto = require("crypto");
const core = require("./core");
const store = require("./store");
const usage = require("./usage");
const context = require("./context");

const MCP_CALL_HEADER = "x-descall-mcp-call";
const MCP_CALL_TTL_MS = 2 * 60 * 1000;
const SWEEP_MS = 60 * 1000;

const mcpCalls = new Map(); // nonce -> { tokenId, ip, country, tool, client, result, at }
const liveSockets = new Map(); // tokenId -> Set(socket)
const dropHooks = new Set(); // fn(tokenId, why, opts)
let sweepTimer = null;

function deny(status, error, code) {
  return { ok: false, status, body: { error, code } };
}

const DENY = {
  unavailable: () => deny(401, "Admin tokens are not set up yet.", "TOKENS_UNAVAILABLE"),
  invalid: () => deny(401, "Invalid token.", "TOKEN_INVALID"),
  revoked: () => deny(401, "This admin token was revoked.", "TOKEN_REVOKED"),
  expired: () => deny(401, "This admin token has expired.", "TOKEN_EXPIRED"),
  paused: () => deny(401, "This admin token is paused.", "TOKEN_PAUSED"),
  rotated: () => deny(401, "This admin token was replaced by a new one.", "TOKEN_ROTATED"),
  ip: () => deny(403, "This admin token cannot be used from this address.", "TOKEN_IP_NOT_ALLOWED"),
  failed: () => deny(503, "Could not verify your session. Try again.", "SESSION_CHECK_FAILED"),
};

/* ---------------- MCP inner calls ---------------- */

/** Register an MCP tool call; the loopback request sends the returned nonce. */
function registerMcpCall({ tokenId, ip, country, tool, client }) {
  const now = Date.now();
  for (const [k, v] of mcpCalls) if (now - v.at > MCP_CALL_TTL_MS) mcpCalls.delete(k);
  const nonce = crypto.randomBytes(18).toString("base64url");
  const entry = { tokenId, ip, country, tool, client, at: now, result: null, uses: 0 };
  mcpCalls.set(nonce, entry);
  return { nonce, entry, done: () => mcpCalls.delete(nonce) };
}

function mcpCallFor(req, tokenId) {
  const raw = req.get ? req.get(MCP_CALL_HEADER) : req.headers?.[MCP_CALL_HEADER];
  if (!raw) return null;
  const entry = mcpCalls.get(String(raw));
  if (!entry || entry.tokenId !== tokenId || Date.now() - entry.at > MCP_CALL_TTL_MS) return null;
  // Loopback only: the reference never leaves this process.
  const peer = String(req.socket?.remoteAddress || req.connection?.remoteAddress || "");
  if (!/^(127\.|::1$|::ffff:127\.)/.test(peer)) return null;
  entry.uses += 1;
  return entry;
}

/* ---------------- core check ---------------- */

/**
 * @param {object} p
 * @param {string} p.secret      the bearer value
 * @param {string} p.ip          client address
 * @param {string|null} p.country
 * @param {boolean} [p.skipAddressCheck] inner MCP call (the outer call was checked)
 * @returns {Promise<{ok: true, row, user, viaGrace} | {ok: false, status, body}>}
 */
async function authenticate({ secret, ip, country = null, skipAddressCheck = false, now = Date.now() }) {
  let found;
  try {
    if (!(await store.available({ now }))) return DENY.unavailable();
    if (!core.isWellFormed(secret)) return DENY.invalid();
    found = await store.findByHash(core.hashSecret(secret), { now });
  } catch (err) {
    if (err?.code === "TOKENS_UNAVAILABLE") return DENY.unavailable();
    console.error("[admin-tokens] lookup failed:", err?.message || err);
    return DENY.failed();
  }
  if (!found) return DENY.invalid();
  const { row, viaGrace } = found;
  if (viaGrace && !core.graceUntil(row, now)) return DENY.rotated();
  const status = core.statusOf(row, now);
  if (status === "revoked") return DENY.revoked();
  if (status === "expired") return DENY.expired();
  if (status === "paused") return DENY.paused();
  let owner;
  try {
    owner = await store.ownerRow(row.owner_id, { now });
  } catch {
    return DENY.failed();
  }
  if (!store.isOwnerRow(owner)) return DENY.invalid();
  if (!core.ipAllowed(ip, row.ip_allowlist)) return DENY.ip();
  if (!skipAddressCheck) {
    try {
      const verdict = await usage.checkAddress(row, { ip, country, now });
      if (verdict.paused) return DENY.paused();
    } catch {
      /* an alert failure never blocks the owner's bot */
    }
  }
  return {
    ok: true,
    row,
    viaGrace,
    user: { id: owner.id, username: owner.username, sid: null },
  };
}

function headerOf(req, name) {
  return req.get ? req.get(name) : req.headers?.[name];
}

/**
 * Express part of requireAuth for a dsk_admin_ bearer. Sets req.user / req.apiToken,
 * records the call when the response is done and runs the rest of the chain inside the
 * token context (audit tagging).
 */
async function requireTokenAuth(req, res, next, secret) {
  const clientIp = require("../clientIp");
  let ip = clientIp.ipOfRequest(req);
  let country = core.countryOf(req.headers);
  let entry = null;
  if (headerOf(req, MCP_CALL_HEADER)) {
    // Inner MCP call over loopback: use the outer call's address (checked there).
    try {
      const found = (await store.available()) ? await store.findByHash(core.hashSecret(secret)) : null;
      if (found) entry = mcpCallFor(req, found.row.id);
    } catch {
      entry = null;
    }
    if (entry) {
      ip = entry.ip;
      country = entry.country;
    }
  }
  const result = await authenticate({ secret, ip, country, skipAddressCheck: Boolean(entry) });
  if (!result.ok) {
    if (result.status === 401) res.set("WWW-Authenticate", 'Bearer realm="descall", error="invalid_token"');
    return res.status(result.status).json(result.body);
  }
  try {
    usage.setIo(req.app?.get?.("io"));
  } catch {
    /* no app */
  }
  return attach(req, res, next, result, { ip, country, entry });
}

function attach(req, res, next, result, { ip = null, country = null, entry = null }) {
  const { row, user } = result;
  req.user = user;
  req.apiToken = { id: row.id, name: row.name };
  if (ip) req.apiTokenClientIp = ip;
  const ctx = { tokenId: row.id, tokenName: row.name, auditIds: [] };
  const started = process.hrtime.bigint();
  const method = String(req.method || "GET").toUpperCase();
  const rawPath = String(req.originalUrl || req.url || "/");
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    const path = core.normalisePath(rawPath);
    const kind = core.destructiveKind(method, rawPath);
    const auditId = ctx.auditIds[ctx.auditIds.length - 1] || null;
    if (entry) {
      // Inner MCP call: the outer tools/call is the one recorded.
      entry.result = { status: res.statusCode, destructiveKind: entry.result?.destructiveKind || kind, auditId: auditId || entry.result?.auditId || null, method, path };
      return;
    }
    usage.record({
      tokenId: row.id,
      row,
      method,
      path,
      status: res.statusCode,
      ms,
      ip,
      country,
      via: "rest",
      tool: null,
      destructiveKind: kind,
      auditId,
      client: core.clientLabel({ userAgent: headerOf(req, "user-agent") }),
    });
  };
  res.on("finish", finish);
  res.on("close", finish);
  return context.run(ctx, () => next());
}

/* ---------------- socket.io ---------------- */

/** Bearer value of a socket handshake: auth.token, else an Authorization header. */
function socketSecret(socket) {
  const t = socket?.handshake?.auth?.token;
  if (typeof t === "string" && t) return t.startsWith("Bearer ") ? t.slice(7) : t;
  const h = String(socket?.handshake?.headers?.authorization || "");
  return h.startsWith("Bearer ") ? h.slice(7) : null;
}

async function authenticateSocket(socket, secret) {
  const clientIp = require("../clientIp");
  const ip = clientIp.ipOfSocket(socket);
  const country = core.countryOf(socket?.handshake?.headers);
  const result = await authenticate({ secret, ip, country });
  if (!result.ok) return result;
  socket.user = result.user;
  socket.apiToken = { id: result.row.id, name: result.row.name };
  socket.apiTokenHash = core.hashSecret(secret);
  let set = liveSockets.get(result.row.id);
  if (!set) {
    set = new Set();
    liveSockets.set(result.row.id, set);
  }
  set.add(socket);
  socket.once?.("disconnect", () => {
    const s = liveSockets.get(result.row.id);
    if (s) {
      s.delete(socket);
      if (!s.size) liveSockets.delete(result.row.id);
    }
  });
  usage.record({
    tokenId: result.row.id,
    row: result.row,
    method: "WS",
    path: "/socket.io",
    status: 101,
    ms: 0,
    ip,
    country,
    via: "rest",
    client: core.clientLabel({ userAgent: socket?.handshake?.headers?.["user-agent"] }),
  });
  startSweep();
  return result;
}

/* ---------------- live connections ---------------- */

function onDrop(fn) {
  dropHooks.add(fn);
  return () => dropHooks.delete(fn);
}

/**
 * Close what a token keeps open (sockets, MCP sessions and streams) after a revoke,
 * pause or rotate. keepHash: sockets that signed in with this secret stay (rotate with
 * a grace window keeps the old secret's sockets too, so nothing is dropped then).
 */
function dropLiveConnections(tokenId, why = "revoked", { keepHash = null } = {}) {
  let n = 0;
  const set = liveSockets.get(tokenId);
  if (set) {
    for (const socket of [...set]) {
      if (keepHash && socket.apiTokenHash === keepHash) continue;
      try {
        socket.emit?.("system:token", { reason: why });
        socket.disconnect?.(true);
      } catch {
        /* gone */
      }
      set.delete(socket);
      n += 1;
    }
    if (!set.size) liveSockets.delete(tokenId);
  }
  for (const fn of dropHooks) {
    try {
      n += Number(fn(tokenId, why, { keepHash })) || 0;
    } catch {
      /* hook failed */
    }
  }
  return n;
}

/** Sockets of expired tokens are closed once a minute (a revoke or pause closes them at once). */
function startSweep() {
  if (sweepTimer) return;
  sweepTimer = setInterval(async () => {
    if (!liveSockets.size) {
      clearInterval(sweepTimer);
      sweepTimer = null;
      return;
    }
    for (const tokenId of [...liveSockets.keys()]) {
      try {
        const row = await store.getById(tokenId);
        if (!row || core.statusOf(row) !== "active") dropLiveConnections(tokenId, row ? core.statusOf(row) : "revoked");
      } catch {
        /* next minute */
      }
    }
  }, SWEEP_MS);
  sweepTimer.unref?.();
}

function liveSocketCount(tokenId = null) {
  if (tokenId) return liveSockets.get(tokenId)?.size || 0;
  let n = 0;
  for (const s of liveSockets.values()) n += s.size;
  return n;
}

function __resetForTests() {
  mcpCalls.clear();
  liveSockets.clear();
  if (sweepTimer) clearInterval(sweepTimer);
  sweepTimer = null;
}

module.exports = {
  MCP_CALL_HEADER,
  DENY,
  authenticate,
  requireTokenAuth,
  socketSecret,
  authenticateSocket,
  registerMcpCall,
  mcpCallFor,
  onDrop,
  dropLiveConnections,
  liveSocketCount,
  __resetForTests,
};
