"use strict";

/**
 * Admin Token authentication: `Authorization: Bearer dsk_admin_…` (REST), the same
 * secret in the socket.io handshake, and the MCP endpoint.
 *
 * A valid token resolves to the owner account exactly like an owner session
 * (req.user = { id, username, sid: null }) plus req.apiToken = { id, name }. The admin
 * chain treats it as an owner who already passed 2FA and step-up (owner decision:
 * tokens act directly). The admin rate limits still apply (their own bucket per token).
 * Token management from a token is limited to reading, pausing and revoking
 * (routes/adminTokens.js, TOKEN_SELF_MANAGEMENT).
 *
 * Checks, in order: the per-address failure limit (before any database lookup), the
 * migration is applied, the secret is well formed and known (current secret, or the
 * previous one inside its rotate grace window), not revoked, not expired, not paused,
 * the owner still is the owner, the address is inside the IP allowlist (an untrusted
 * address never is), and the address is not a new one that the owner's auto-pause rules
 * stop. The address comes from ./clientAddress.js (strict, one Cloudflare hop at most).
 *
 * MCP tool calls reach the admin API over loopback with the same token. Those inner
 * requests carry a single-use reference to the outer MCP call (x-descall-mcp-call),
 * registered only inside this process, so they are attributed to the bot's real
 * address and recorded once, as the MCP call.
 *
 * Live connections (sockets, MCP sessions) remember which secret opened them; a revoke,
 * pause, rotate or the end of a grace window closes the ones whose secret is no longer
 * accepted (dropLiveConnections / the sweep).
 */

const crypto = require("crypto");
const core = require("./core");
const store = require("./store");
const usage = require("./usage");
const context = require("./context");
const address = require("./clientAddress");

const MCP_CALL_HEADER = "x-descall-mcp-call";
const MCP_CALL_TTL_MS = 2 * 60 * 1000;
const SWEEP_MS = 60 * 1000;
const AUTH_FAIL_LIMIT = { windowMs: 10 * 60 * 1000, max: 30 };

const mcpCalls = new Map(); // nonce -> { tokenId, ip, trusted, country, tool, client, result, at, uses }
const liveSockets = new Map(); // tokenId -> Set(socket)
const liveSources = new Set(); // { drop(tokenId, why, opts) -> n, ids() -> tokenIds }
const graceTimers = new Map(); // tokenId -> timeout
let sweepTimer = null;

function deny(status, error, code, extra = {}) {
  return { ok: false, status, body: { error, code, ...extra } };
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
  limited: (sec) => deny(429, "Too many invalid admin tokens from this address. Try again later.", "TOKEN_AUTH_RATE_LIMITED", { retryAfterSec: sec }),
};

/* ---------------- failure limit ---------------- */

/** Bad tokens per address; untrusted addresses (attacker-chosen) share one bucket. */
function failKey(ip, trusted) {
  return trusted ? `admintoken:fail:${ip}` : "admintoken:fail:untrusted";
}

/* ---------------- MCP inner calls ---------------- */

/** Register an MCP tool call; the loopback request sends the returned nonce (single use). */
function registerMcpCall({ tokenId, ip, trusted = true, country, tool, client }) {
  const now = Date.now();
  for (const [k, v] of mcpCalls) if (now - v.at > MCP_CALL_TTL_MS) mcpCalls.delete(k);
  const nonce = crypto.randomBytes(18).toString("base64url");
  const entry = { tokenId, ip, trusted, country, tool, client, at: now, result: null, uses: 0 };
  mcpCalls.set(nonce, entry);
  return { nonce, entry, done: () => mcpCalls.delete(nonce) };
}

function headerOf(req, name) {
  return req.get ? req.get(name) : req.headers?.[name];
}

/** The outer MCP call of a loopback request, once. A second use of the nonce gets null. */
function mcpCallFor(req, tokenId) {
  const raw = headerOf(req, MCP_CALL_HEADER);
  if (!raw) return null;
  const entry = mcpCalls.get(String(raw));
  if (!entry || entry.tokenId !== tokenId || Date.now() - entry.at > MCP_CALL_TTL_MS) return null;
  if (entry.uses > 0) return null;
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
 * @param {string} p.ip          client address (./clientAddress.js)
 * @param {boolean} [p.trusted]  false: the address may be chosen by the caller
 * @param {string|null} [p.country]
 * @param {boolean} [p.skipAddressCheck] inner MCP call (the outer call was checked)
 * @returns {Promise<{ok: true, row, user, viaGrace, secretHash} | {ok: false, status, body}>}
 */
async function authenticate({ secret, ip, trusted = true, country = null, skipAddressCheck = false, now = Date.now() }) {
  const { peek, recordFailure } = require("../rateLimit");
  const key = failKey(ip, trusted);
  const gate = peek(key, { ...AUTH_FAIL_LIMIT, now });
  if (!gate.ok) return DENY.limited(gate.retryAfterSec || 60);
  const failed = (d) => {
    recordFailure(key, { ...AUTH_FAIL_LIMIT, now });
    return d;
  };
  let found;
  let hash;
  try {
    if (!core.isWellFormed(secret)) {
      if (!(await store.available({ now }))) return DENY.unavailable();
      return failed(DENY.invalid());
    }
    if (!(await store.available({ now }))) return DENY.unavailable();
    hash = core.hashSecret(secret);
    found = await store.findByHash(hash, { now });
  } catch (err) {
    if (err?.code === "TOKENS_UNAVAILABLE") return DENY.unavailable();
    console.error("[admin-tokens] lookup failed:", err?.message || err);
    return DENY.failed();
  }
  if (!found) return failed(DENY.invalid());
  const { row, viaGrace } = found;
  if (viaGrace && !core.graceUntil(row, now)) return failed(DENY.rotated());
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
  // An untrusted address never matches an allowlist entry.
  if (row.ip_allowlist.length && (!trusted || !core.ipAllowed(ip, row.ip_allowlist))) return DENY.ip();
  if (!skipAddressCheck) {
    try {
      const verdict = await usage.checkAddress(row, { ip, trusted, country, now });
      if (verdict.paused) return DENY.paused();
    } catch {
      /* an alert failure never blocks the owner's bot */
    }
  }
  return {
    ok: true,
    row,
    viaGrace,
    secretHash: hash,
    user: { id: owner.id, username: owner.username, sid: null },
  };
}

function sendDenied(res, result) {
  if (result.status === 401) res.set("WWW-Authenticate", 'Bearer realm="descall", error="invalid_token"');
  if (result.status === 429) res.set("Retry-After", String(result.body.retryAfterSec || 60));
  return res.status(result.status).json(result.body);
}

/**
 * Express part of requireAuth for a dsk_admin_ bearer. Sets req.user / req.apiToken,
 * records the call when the response is done and runs the rest of the chain inside the
 * token context (audit tagging).
 */
async function requireTokenAuth(req, res, next, secret) {
  let { ip, trusted, country } = address.ofRequest(req);
  let entry = null;
  if (headerOf(req, MCP_CALL_HEADER) && core.isWellFormed(secret)) {
    // Inner MCP call over loopback: the outer call's address (checked there).
    try {
      const found = (await store.available()) ? await store.findByHash(core.hashSecret(secret)) : null;
      if (found) entry = mcpCallFor(req, found.row.id);
    } catch {
      entry = null;
    }
    if (entry) ({ ip, trusted, country } = entry);
  }
  const result = await authenticate({ secret, ip, trusted, country, skipAddressCheck: Boolean(entry) });
  if (!result.ok) return sendDenied(res, result);
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
  const { ip, trusted, country } = address.ofSocket(socket);
  const result = await authenticate({ secret, ip, trusted, country });
  if (!result.ok) return result;
  socket.user = result.user;
  socket.apiToken = { id: result.row.id, name: result.row.name };
  socket.apiTokenHash = result.secretHash;
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

/** Another kind of live connection (MCP sessions): { drop(tokenId, why, { keepHashes }), ids() }. */
function registerLiveSource(source) {
  liveSources.add(source);
  return () => liveSources.delete(source);
}

/**
 * Close what a token keeps open (sockets, MCP sessions and streams). keepHashes: the
 * secrets still accepted; a connection opened with any other secret closes. Without
 * keepHashes everything closes (revoke, pause).
 */
function dropLiveConnections(tokenId, why = "revoked", { keepHashes = null } = {}) {
  const keep = Array.isArray(keepHashes) ? new Set(keepHashes.filter(Boolean)) : null;
  let n = 0;
  const set = liveSockets.get(tokenId);
  if (set) {
    for (const socket of [...set]) {
      if (keep && keep.has(socket.apiTokenHash)) continue;
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
  for (const src of liveSources) {
    try {
      n += Number(src.drop(tokenId, why, { keepHashes: keep ? [...keep] : null })) || 0;
    } catch {
      /* source failed */
    }
  }
  return n;
}

/** Secrets of a row that are accepted right now: the current one and a grace one in its window. */
function acceptedHashes(row, now = Date.now()) {
  if (!row || core.statusOf(row, now) !== "active") return [];
  return [row.secret_hash, core.graceUntil(row, now) ? row.grace_hash : null].filter(Boolean);
}

/** Close a token's connections whose secret is no longer accepted (after a grace window, expiry, ...). */
async function enforceToken(tokenId, now = Date.now()) {
  const row = await store.getById(tokenId);
  const keep = acceptedHashes(row, now);
  const why = !row ? "revoked" : core.statusOf(row, now) !== "active" ? core.statusOf(row, now) : "rotated";
  return dropLiveConnections(tokenId, why, { keepHashes: keep.length ? keep : null });
}

function liveTokenIds() {
  const ids = new Set(liveSockets.keys());
  for (const src of liveSources) {
    try {
      for (const id of src.ids() || []) ids.add(id);
    } catch {
      /* source failed */
    }
  }
  return [...ids];
}

/** One pass over every token with a live connection. */
async function sweepNow(now = Date.now()) {
  let n = 0;
  for (const tokenId of liveTokenIds()) {
    try {
      n += await enforceToken(tokenId, now);
    } catch {
      /* next pass */
    }
  }
  return n;
}

/** Once a minute while anything is connected. */
function startSweep() {
  if (sweepTimer) return;
  sweepTimer = setInterval(() => {
    if (!liveTokenIds().length) {
      clearInterval(sweepTimer);
      sweepTimer = null;
      return;
    }
    sweepNow().catch(() => {});
  }, SWEEP_MS);
  sweepTimer.unref?.();
}

/** Re-check the token right after its grace window ends (the old secret's connections close). */
function scheduleGraceEnd(tokenId, graceUntilIso) {
  const prev = graceTimers.get(tokenId);
  if (prev) clearTimeout(prev);
  const ms = Date.parse(graceUntilIso) - Date.now() + 1000;
  if (!Number.isFinite(ms) || ms <= 0 || ms > 2 ** 31 - 1) return;
  const t = setTimeout(() => {
    graceTimers.delete(tokenId);
    enforceToken(tokenId).catch(() => {});
  }, ms);
  t.unref?.();
  graceTimers.set(tokenId, t);
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
  for (const t of graceTimers.values()) clearTimeout(t);
  graceTimers.clear();
  if (sweepTimer) clearInterval(sweepTimer);
  sweepTimer = null;
}

module.exports = {
  MCP_CALL_HEADER,
  AUTH_FAIL_LIMIT,
  DENY,
  authenticate,
  sendDenied,
  requireTokenAuth,
  socketSecret,
  authenticateSocket,
  registerMcpCall,
  mcpCallFor,
  registerLiveSource,
  dropLiveConnections,
  acceptedHashes,
  enforceToken,
  sweepNow,
  startSweep,
  scheduleGraceEnd,
  liveSocketCount,
  __resetForTests,
};
