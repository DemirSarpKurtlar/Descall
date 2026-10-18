const crypto = require("crypto");
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

if (!JWT_SECRET) {
  throw new Error("Missing JWT_SECRET in environment variables.");
}

/**
 * 2.11.7 (scale S3, ES256 phase B). Optional asymmetric signing so the
 * Cloudflare edge can check tokens with a PUBLIC key (no shared secret at the edge).
 *   JWT_ES256_PRIVATE_KEY  PEM (P-256). Unset = HS256 only, exactly as before.
 *   JWT_SIGN_ALG=ES256     start signing new tokens with it (verify accepts both
 *                          from the moment the key is set, so roll the key first,
 *                          then flip the alg; old HS256 tokens stay valid to expiry).
 * Verify always pins the algorithm by header: HS256 → secret, ES256 → public key.
 */
function loadEs256() {
  const pem = String(process.env.JWT_ES256_PRIVATE_KEY || "").replace(/\\n/g, "\n").trim();
  if (!pem) return null;
  try {
    const privateKey = crypto.createPrivateKey(pem);
    if (privateKey.asymmetricKeyType !== "ec" || privateKey.asymmetricKeyDetails?.namedCurve !== "prime256v1") {
      console.warn("[jwt] JWT_ES256_PRIVATE_KEY is not a P-256 key; ES256 disabled");
      return null;
    }
    const publicKey = crypto.createPublicKey(privateKey);
    const jwk = publicKey.export({ format: "jwk" });
    // RFC 7638 thumbprint as kid.
    const kid = crypto
      .createHash("sha256")
      .update(JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y }))
      .digest("base64url");
    return { privateKey, publicKey, kid, jwk: { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, kid, alg: "ES256", use: "sig" } };
  } catch (err) {
    console.warn("[jwt] JWT_ES256_PRIVATE_KEY unreadable; ES256 disabled:", err.message);
    return null;
  }
}

let es256 = loadEs256();

function signAlg() {
  return es256 && String(process.env.JWT_SIGN_ALG || "").toUpperCase() === "ES256" ? "ES256" : "HS256";
}

function sign(claims, expiresIn) {
  if (signAlg() === "ES256") {
    return jwt.sign(claims, es256.privateKey, { algorithm: "ES256", expiresIn, keyid: es256.kid });
  }
  return jwt.sign(claims, JWT_SECRET, { algorithm: "HS256", expiresIn });
}

function signToken(payload) {
  return sign({ sub: payload.id, username: payload.username, sid: payload.sid || null }, JWT_EXPIRES_IN);
}

/**
 * Short-lived token issued after a correct password when 2FA is enabled.
 * It cannot be used against requireAuth — only against the dedicated
 * /api/auth/2fa/verify-login endpoint — so a leaked "pending" token alone
 * never grants account access.
 */
function signPending2faToken(payload) {
  return sign({ sub: payload.id, username: payload.username, pending2fa: true }, "10m");
}

function headerAlg(token) {
  try {
    const head = JSON.parse(Buffer.from(String(token).split(".")[0] || "", "base64url").toString("utf8"));
    return head && typeof head.alg === "string" ? head.alg : null;
  } catch {
    return null;
  }
}

function verifyToken(token) {
  if (headerAlg(token) === "ES256") {
    if (!es256) throw new jwt.JsonWebTokenError("invalid algorithm");
    return jwt.verify(token, es256.publicKey, { algorithms: ["ES256"] });
  }
  return jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] });
}

/** Public keys for /.well-known/jwks.json (empty until a key is configured). */
function publicJwks() {
  return { keys: es256 ? [es256.jwk] : [] };
}

module.exports = {
  signToken,
  signPending2faToken,
  verifyToken,
  publicJwks,
  signAlg,
  _reloadEs256ForTests: () => (es256 = loadEs256()),
};
