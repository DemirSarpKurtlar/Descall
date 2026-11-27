/**
 * Coarse per-IP burst limits in front of sensitive routers (defense in depth).
 *
 * The precise, per-account limits stay in lib/rateLimit.js (peek / recordFailure /
 * rejectIfLimited) inside each handler. This layer only caps raw request bursts from one
 * address with a standard middleware, so a flood is cut before any handler work runs.
 * The ceilings sit well above what the inner limiters allow, so normal use and the inner
 * limit responses are unchanged.
 */
const { rateLimit, ipKeyGenerator } = require("express-rate-limit");
const { ipOfRequest } = require("./clientIp");
const { TOO_MANY_TR } = require("./rateLimit");

function keyOf(req) {
  const ip = ipOfRequest(req) || req.ip || "unknown";
  // ipKeyGenerator groups IPv6 addresses by /56 so one host cannot rotate through its range.
  return ipKeyGenerator(ip);
}

/**
 * @param {{ windowMs?: number, limit: number, name: string }} opts
 */
function burstLimit({ windowMs = 60 * 1000, limit, name }) {
  const mw = rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    keyGenerator: keyOf,
    // The app sets "trust proxy" to its own proxy list; the key generator reads the client
    // address the same way the rest of the backend does, so the library check is not needed.
    validate: { trustProxy: false, xForwardedForHeader: false, keyGeneratorIpFallback: false },
    handler: (req, res) => {
      // Same message as the per-account limiter, so it is already in the translation catalogs.
      res.status(429).json({ error: TOO_MANY_TR, code: "RATE_LIMITED", limiter: name });
    },
  });
  // Lets unit tests that drive a router's middleware stack by hand recognise and skip it.
  mw.descallBurstLimit = name;
  return mw;
}

module.exports = { burstLimit };
