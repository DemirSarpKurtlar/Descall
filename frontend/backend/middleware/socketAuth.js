const { verifyToken } = require("../config/jwt");
const { bannedUserIds, banDetailsByUser, revokedSessionIds, usernameById } = require("../runtime/sharedState");
const ageGate = require("../lib/ageGate");
const { sessionAllowed } = require("../lib/sessionGuard");
const { peek, recordFailure } = require("../lib/rateLimit");

/** Visitor IP behind Render + Cloudflare or the edge hub (lib/clientIp.js). */
function socketIp(socket) {
  return require("../lib/clientIp").ipOfSocket(socket);
}

async function accessCheck(socket, decoded) {
  try {
    const accessBans = require("../lib/accessBans");
    const row = await require("../lib/adminPermissions").loadRow(decoded.sub).catch(() => null);
    const isAdmin = Boolean(row?.is_admin) || row?.username === "admin" || decoded.username === "admin";
    const hit = await accessBans.check({
      ip: socketIp(socket),
      deviceId: socket.handshake?.auth?.device,
      action: "socket",
      userId: decoded.sub,
      isAdmin,
    });
    return Boolean(hit);
  } catch {
    return false; // a failing ban lookup never blocks a connection
  }
}

function socketAuthMiddleware(socket, next) {
  const ipGate = peek(`socket:${socketIp(socket)}`, { windowMs: 60 * 1000, max: 120 });
  if (!ipGate.ok) {
    return next(new Error("Too many connections. Try again shortly."));
  }
  recordFailure(`socket:${socketIp(socket)}`, { windowMs: 60 * 1000, max: 120 });
  const token = socket.handshake.auth?.token;

  if (!token) {
    return next(new Error("Authentication required: no token provided."));
  }

  try {
    const decoded = verifyToken(token);
    if (decoded.pending2fa || decoded.stepUp) {
      return next(new Error("Authentication failed: two-factor verification required."));
    }
    if (bannedUserIds.has(decoded.sub)) {
      const detail = banDetailsByUser.get(decoded.sub);
      if (detail?.expiresAt && new Date(detail.expiresAt).getTime() <= Date.now()) {
        bannedUserIds.delete(decoded.sub);
        banDetailsByUser.delete(decoded.sub);
      } else {
        const msg = detail?.message || detail?.reason || "account is banned";
        return next(new Error(`Authentication failed: banned — ${msg}`));
      }
    }
    const assign = () => {
      socket.user = {
        id: decoded.sub,
        username: usernameById.get(decoded.sub) || decoded.username,
        sid: decoded.sid || null,
      };
    };
    sessionAllowed(decoded)
      .then((session) => {
        if (!session.ok) {
          return next(new Error("Authentication failed: session has been signed out."));
        }
        return ageGate.enforceChildClosure(decoded.sub).then((block) => {
          if (block) {
            const ids = new Set([...(block.sessionIds || []), decoded.sid].filter(Boolean));
            ids.forEach((sid) => revokedSessionIds.add(sid));
            return next(new Error("Authentication failed: account closed because the account holder is under 13."));
          }
          // Erişim yasağı (3.5.0): banned IP / network / device, admins exempt.
          return accessCheck(socket, decoded).then((blocked) => {
            if (blocked) return next(new Error("Authentication failed: Bu cihazdan veya ağdan Descall'a erişim engellendi."));
            assign();
            next();
          });
        });
      })
      .catch(() => {
        next(new Error("Authentication failed: session check failed."));
      });
    return;
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return next(new Error("Authentication failed: token has expired."));
    }
    return next(new Error("Authentication failed: invalid token."));
  }
}

module.exports = { socketAuthMiddleware, socketIp };
