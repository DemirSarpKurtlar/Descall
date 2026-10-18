// HS256 app-JWT check at the edge (scale plan §7, phase A). Same rules as
// backend middleware/auth.js + socketAuth: signature, exp, no pending2fa.
// Render still runs the full check (session revocation, bans, age gate) on the
// Socket.IO CONNECT packet; this only keeps garbage away from the Hub.
const enc = new TextEncoder();
const keyCache = new Map();

function b64uToBytes(s) {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function hmacKey(secret) {
  if (!keyCache.has(secret)) {
    keyCache.set(secret, crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]));
  }
  return keyCache.get(secret);
}

export async function verifyAppJwt(token, secret, nowSec = Math.floor(Date.now() / 1000)) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return { ok: false, code: "malformed" };
  const [h, p, s] = parts;
  let header;
  let claims;
  try {
    header = JSON.parse(new TextDecoder().decode(b64uToBytes(h)));
    claims = JSON.parse(new TextDecoder().decode(b64uToBytes(p)));
  } catch {
    return { ok: false, code: "malformed" };
  }
  if (!header || header.alg !== "HS256") return { ok: false, code: "alg" };
  let valid = false;
  try {
    valid = await crypto.subtle.verify("HMAC", await hmacKey(secret), b64uToBytes(s), enc.encode(`${h}.${p}`));
  } catch {
    valid = false;
  }
  if (!valid) return { ok: false, code: "signature" };
  if (typeof claims.exp !== "number" || claims.exp <= nowSec) return { ok: false, code: "expired" };
  if (claims.pending2fa) return { ok: false, code: "pending2fa" };
  if (typeof claims.sub !== "string" || !claims.sub) return { ok: false, code: "sub" };
  return { ok: true, uid: claims.sub, sid: claims.sid || null };
}

const ecKeyCache = new Map();

function parseJwks(raw) {
  try {
    const data = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(data?.keys) ? data.keys.filter((k) => k && k.kty === "EC" && k.crv === "P-256" && k.kid) : [];
  } catch {
    return [];
  }
}

function ecKey(jwk) {
  if (!ecKeyCache.has(jwk.kid)) {
    ecKeyCache.set(
      jwk.kid,
      crypto.subtle.importKey("jwk", { kty: "EC", crv: "P-256", x: jwk.x, y: jwk.y, ext: true }, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"])
    );
  }
  return ecKeyCache.get(jwk.kid);
}

/**
 * ES256 app-JWT check with PUBLIC keys only (scale S3, phase B). `jwks` is the
 * JSON of GET /api/jwks.json (Worker var JWT_JWKS), so the edge never holds a secret.
 */
export async function verifyAppJwtEs256(token, jwks, nowSec = Math.floor(Date.now() / 1000)) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return { ok: false, code: "malformed" };
  const [h, p, s] = parts;
  let header;
  let claims;
  try {
    header = JSON.parse(new TextDecoder().decode(b64uToBytes(h)));
    claims = JSON.parse(new TextDecoder().decode(b64uToBytes(p)));
  } catch {
    return { ok: false, code: "malformed" };
  }
  if (!header || header.alg !== "ES256") return { ok: false, code: "alg" };
  const jwk = parseJwks(jwks).find((k) => k.kid === header.kid);
  if (!jwk) return { ok: false, code: "kid" };
  let valid = false;
  try {
    valid = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, await ecKey(jwk), b64uToBytes(s), enc.encode(`${h}.${p}`));
  } catch {
    valid = false;
  }
  if (!valid) return { ok: false, code: "signature" };
  if (typeof claims.exp !== "number" || claims.exp <= nowSec) return { ok: false, code: "expired" };
  if (claims.pending2fa) return { ok: false, code: "pending2fa" };
  if (typeof claims.sub !== "string" || !claims.sub) return { ok: false, code: "sub" };
  return { ok: true, uid: claims.sub, sid: claims.sid || null };
}

/** Header alg of a JWT ("HS256", "ES256", …) or null. */
export function jwtAlg(token) {
  try {
    const h = JSON.parse(new TextDecoder().decode(b64uToBytes(String(token).split(".")[0] || "")));
    return typeof h?.alg === "string" ? h.alg : null;
  } catch {
    return null;
  }
}

/**
 * Edge pre-check. ES256 tokens need JWT_JWKS; HS256 tokens need JWT_SECRET. With
 * neither configured for that alg the check is skipped ({ ok: true, uid: "" }):
 * Render always runs the full check on the Socket.IO CONNECT packet.
 */
export async function verifyEdgeJwt(token, env, nowSec) {
  const alg = jwtAlg(token);
  if (alg === "ES256") return env.JWT_JWKS ? verifyAppJwtEs256(token, env.JWT_JWKS, nowSec) : { ok: true, uid: "" };
  if (alg === "HS256") return env.JWT_SECRET ? verifyAppJwt(token, env.JWT_SECRET, nowSec) : { ok: true, uid: "" };
  return { ok: false, code: "alg" };
}

/** `Sec-WebSocket-Protocol: descall.v1, jwt.<token>` → token (or null). */
export function tokenFromProtocols(header) {
  const list = String(header || "").split(",").map((x) => x.trim()).filter(Boolean);
  if (!list.includes("descall.v1")) return null;
  const t = list.find((x) => x.startsWith("jwt."));
  return t ? t.slice(4) : null;
}

/** Constant-time string compare for the bridge secret. */
export function safeEqual(a, b) {
  const x = enc.encode(String(a || ""));
  const y = enc.encode(String(b || ""));
  let diff = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0;
}
