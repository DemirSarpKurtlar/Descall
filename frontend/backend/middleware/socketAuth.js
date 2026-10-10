const { verifyToken } = require("../config/jwt");
const { bannedUserIds, banDetailsByUser, revokedSessionIds, usernameById } = require("../runtime/sharedState");
const ageGate = require("../lib/ageGate");

function socketAuthMiddleware(socket, next) {
  const token = socket.handshake.auth?.token;

  if (!token) {
    return next(new Error("Authentication required: no token provided."));
  }

  try {
    const decoded = verifyToken(token);
    if (decoded.pending2fa) {
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
    if (decoded.sid && revokedSessionIds.has(decoded.sid)) {
      return next(new Error("Authentication failed: session has been signed out."));
    }
    const assign = () => {
      // After a username change, older tokens still carry the old name; prefer the live one.
      socket.user = {
        id: decoded.sub,
        username: usernameById.get(decoded.sub) || decoded.username,
        sid: decoded.sid || null,
      };
    };
    ageGate.enforceChildClosure(decoded.sub).then((block) => {
      if (block) {
        const ids = new Set([...(block.sessionIds || []), decoded.sid].filter(Boolean));
        ids.forEach((sid) => revokedSessionIds.add(sid));
        return next(new Error("Authentication failed: account closed because the account holder is under 13."));
      }
      assign();
      next();
    }).catch(() => {
      assign();
      next();
    });
    return;
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return next(new Error("Authentication failed: token has expired."));
    }
    return next(new Error("Authentication failed: invalid token."));
  }
}

module.exports = { socketAuthMiddleware };
