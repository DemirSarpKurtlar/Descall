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
