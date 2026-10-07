"use strict";
/**
 * Sign in with Apple (server side).
 *
 *  verifyIdentityToken(token)  – checks the JWT from the iOS sheet against Apple's public keys.
 *  exchangeAuthorizationCode() – trades the one-time code for a refresh token (stored encrypted)
 *  revokeRefreshToken()        – called when the account is deleted (App Review requirement).
 *
 * Env (Render): APPLE_TEAM_ID, APPLE_SIGNIN_KEY_ID, APPLE_SIGNIN_PRIVATE_KEY (.p8 contents, \n allowed),
 * optional APPLE_CLIENT_ID (defaults to the iOS bundle id com.descall.app).
 * Token verification works without the key; exchange/revoke need it.
 */
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { encryptSecret, decryptSecret } = require("./ai/cryptoKeys");

const APPLE_ISSUER = "https://appleid.apple.com";
const KEYS_URL = "https://appleid.apple.com/auth/keys";
const TOKEN_URL = "https://appleid.apple.com/auth/token";
const REVOKE_URL = "https://appleid.apple.com/auth/revoke";

function clientId() {
  return String(process.env.APPLE_CLIENT_ID || "com.descall.app").trim();
}

function audiences() {
  const extra = String(process.env.APPLE_EXTRA_AUDIENCES || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return [clientId(), ...extra];
}

let keyCache = { at: 0, keys: [] };

async function appleKeys(force = false) {
  if (!force && keyCache.keys.length && Date.now() - keyCache.at < 60 * 60 * 1000) return keyCache.keys;
  const res = await fetch(KEYS_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`Apple keys HTTP ${res.status}`);
  const data = await res.json();
  keyCache = { at: Date.now(), keys: Array.isArray(data?.keys) ? data.keys : [] };
  return keyCache.keys;
}

async function publicKeyFor(kid) {
  let jwk = (await appleKeys()).find((k) => k.kid === kid);
  if (!jwk) jwk = (await appleKeys(true)).find((k) => k.kid === kid);
  if (!jwk) throw new Error("Unknown Apple signing key");
  return crypto.createPublicKey({ key: jwk, format: "jwk" });
}

/** Returns { sub, email, emailVerified, isPrivateEmail } or throws. */
async function verifyIdentityToken(identityToken, { nonce } = {}) {
  const decoded = jwt.decode(identityToken, { complete: true });
  if (!decoded?.header?.kid) throw new Error("Malformed Apple identity token");
  const key = await publicKeyFor(decoded.header.kid);
  const payload = jwt.verify(identityToken, key, {
    algorithms: ["RS256"],
    issuer: APPLE_ISSUER,
    audience: audiences(),
  });
  if (nonce) {
    const hashed = crypto.createHash("sha256").update(String(nonce)).digest("hex");
    if (payload.nonce !== nonce && payload.nonce !== hashed) throw new Error("Apple nonce mismatch");
  }
  if (!payload?.sub) throw new Error("Apple token has no subject");
  const truthy = (v) => v === true || v === "true";
  return {
    sub: String(payload.sub),
    email: payload.email ? String(payload.email).trim().toLowerCase() : null,
    emailVerified: truthy(payload.email_verified),
    isPrivateEmail: truthy(payload.is_private_email),
  };
}

function signingConfigured() {
  return Boolean(
    process.env.APPLE_TEAM_ID && process.env.APPLE_SIGNIN_KEY_ID && process.env.APPLE_SIGNIN_PRIVATE_KEY
  );
}

function clientSecret() {
  const privateKey = String(process.env.APPLE_SIGNIN_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    { iss: process.env.APPLE_TEAM_ID, iat: now, exp: now + 300, aud: APPLE_ISSUER, sub: clientId() },
    privateKey,
    { algorithm: "ES256", keyid: process.env.APPLE_SIGNIN_KEY_ID }
  );
}

async function postForm(url, fields) {
  const body = new URLSearchParams(fields);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }
  return { ok: res.ok, status: res.status, data };
}

/** Returns the encrypted refresh token, or null when not configured / failed. */
async function exchangeAuthorizationCode(code) {
  if (!code || !signingConfigured()) return null;
  try {
    const { ok, status, data } = await postForm(TOKEN_URL, {
      client_id: clientId(),
      client_secret: clientSecret(),
      code: String(code),
      grant_type: "authorization_code",
    });
    if (!ok || !data.refresh_token) {
      console.warn("[APPLE] code exchange failed:", status, data?.error || "");
      return null;
    }
    return encryptSecret(data.refresh_token);
  } catch (err) {
    console.warn("[APPLE] code exchange error:", err?.message || err);
    return null;
  }
}

/** Revoke a stored (encrypted) refresh token. Returns true on success. */
async function revokeRefreshToken(encrypted) {
  if (!encrypted || !signingConfigured()) return false;
  try {
    const token = decryptSecret(encrypted);
    const { ok, status, data } = await postForm(REVOKE_URL, {
      client_id: clientId(),
      client_secret: clientSecret(),
      token,
      token_type_hint: "refresh_token",
    });
    if (!ok) console.warn("[APPLE] revoke failed:", status, data?.error || "");
    return ok;
  } catch (err) {
    console.warn("[APPLE] revoke error:", err?.message || err);
    return false;
  }
}

module.exports = {
  verifyIdentityToken,
  exchangeAuthorizationCode,
  revokeRefreshToken,
  signingConfigured,
};
