const { verifyToken } = require("../config/jwt");
const { revokedSessionIds, usernameById } = require("../runtime/sharedState");
const { touchLastSeen } = require("../lib/presenceTouch");
const { recordActiveDay } = require("../lib/signupStats");
const ageGate = require("../lib/ageGate");
const { sessionAllowed } = require("../lib/sessionGuard");

function childCheckExempt(req) {
  const path = String(req.originalUrl || req.url || req.path || "").split("?")[0];
  return path.endsWith("/logout") || path.endsWith("/account/delete");
}

/**
 * Banned account (CONTRACT section 6): the section 1 body with a banTicket, so
 * the app shows the ban screen instead of silently signing out. A session the
 * ban itself signed out (revokeSessions) still gets it.
 */
async function rejectBannedAccount(res, decoded, session) {
  const moderation = require("../lib/moderation");
  const detail = moderation.activeBanDetail(decoded.sub);
  if (!detail) return false;
  if (!session.ok && !moderation.wasRevokedByBan(decoded.sub, decoded.sid)) return false;
  const { accountBanBody } = require("../lib/banExperience");
  const username = usernameById.get(decoded.sub) || decoded.username || null;
  res.status(403).json(await accountBanBody({ userId: decoded.sub, username, detail }));
  return true;
}

/** Access ban (IP / network / device, CONTRACT section 2). Admins are exempt. */
async function rejectAccessBanned(req, res, decoded) {
  try {
    const accessBans = require("../lib/accessBans");
    const hit = await accessBans.check({
      ip: require("../lib/sessions").clientIp(req),
      deviceId: req.get ? req.get("x-descall-device") : req.headers?.["x-descall-device"],
      action: "api",
      userId: decoded.sub,
      isAdmin: decoded.username === "admin",
      resolveIsAdmin: async () => {
        const row = await require("../lib/adminPermissions").loadRow(decoded.sub);
        return Boolean(row?.is_admin) || row?.username === "admin";
      },
    });
    if (!hit) return false;
    res.status(403).json(hit.publicBody);
    return true;
  } catch {
    return false; // a failing ban lookup never blocks a request
  }
}

async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or malformed Authorization header." });
  }

  const token = authHeader.slice(7);

  // Admin Token (dsk_admin_…): resolves to the owner account (lib/adminTokens/auth.js).
  if (token.startsWith("dsk_admin_")) {
    if (req.apiToken && req.user) return next(); // already resolved earlier in this chain
    try {
      return await require("../lib/adminTokens/auth").requireTokenAuth(req, res, next, token);
    } catch (err) {
      console.error("[auth] admin token:", err?.message || err);
      if (!res.headersSent) return res.status(500).json({ error: "Internal server error." });
      return undefined;
    }
  }

  let decoded;
  try {
    decoded = verifyToken(token);
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Token has expired." });
    }
    return res.status(401).json({ error: "Invalid token." });
  }

  try {
    // Pending sign-in and admin step-up tokens are never session tokens.
    if (decoded.pending2fa || decoded.stepUp) {
      return res.status(401).json({ error: "Two-factor verification required." });
    }
    // Scoped tokens (the ban ticket) only open their own endpoints.
    if (decoded.scope || !decoded.sub) {
      return res.status(401).json({ error: "Invalid token." });
    }
    const session = await sessionAllowed(decoded);
    if (session.code === "SESSION_CHECK_FAILED") {
      return res.status(503).json({
        error: "Could not verify your session. Try again.",
        code: "SESSION_CHECK_FAILED",
      });
    }
    if (await rejectBannedAccount(res, decoded, session)) return;
    if (!session.ok) {
      return res.status(401).json({
        error: "Session has been signed out.",
        code: session.code || "SESSION_REVOKED",
      });
    }
    if (await rejectAccessBanned(req, res, decoded)) return;
    // After a username change, older tokens still carry the old name; prefer the live one.
    req.user = {
      id: decoded.sub,
      username: usernameById.get(decoded.sub) || decoded.username,
      sid: decoded.sid || null,
    };
    touchLastSeen(req.user.id).catch(() => {});
    recordActiveDay(req.user.id).catch(() => {});
    if (childCheckExempt(req)) return next();
    ageGate.enforceChildClosure(req.user.id).then((block) => {
      if (!block) return next();
      const ids = new Set([...(block.sessionIds || []), req.user.sid].filter(Boolean));
      ids.forEach((sid) => revokedSessionIds.add(sid));
      return res.status(403).json({
        error: block.error,
        code: "under_age",
        deletionStarted: true,
      });
    }).catch(() => next());
  } catch (err) {
    console.error("[auth] requireAuth:", err?.message || err);
    if (!res.headersSent) return res.status(500).json({ error: "Internal server error." });
  }
}

module.exports = { requireAuth };
