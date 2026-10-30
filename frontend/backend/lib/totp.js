"use strict";

/**
 * Authenticator-app two-factor (3.2.0): RFC 6238 TOTP (HMAC-SHA1, 30 s, 6
 * digits; what Google Authenticator, Microsoft Authenticator, 1Password and
 * Authy expect), single-use recovery codes, and the secret encrypted at rest
 * (AES-256-GCM). Pure helpers; routes/twoFactor.js does the I/O.
 *
 * Secret key: TOTP_ENC_KEY (32+ chars) when set, otherwise derived from
 * JWT_SECRET with HKDF so deploys need no new env var. Rotating the key makes
 * stored secrets unreadable (users re-enrol), so set TOTP_ENC_KEY once and keep it.
 */

const crypto = require("crypto");

const STEP_SEC = 30;
const DIGITS = 6;
const WINDOW = 1; // accept the previous / next 30 s step (clock drift)
const ISSUER = "Descall";
const RECOVERY_COUNT = 10;
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(buf) {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(str) {
  const clean = String(str || "").toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx < 0) throw new Error("invalid base32");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** 20 random bytes = 160-bit secret, base32 (32 chars). */
function generateSecret() {
  return base32Encode(crypto.randomBytes(20));
}

function hotp(secretB32, counter) {
  const key = base32Decode(secretB32);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const mac = crypto.createHmac("sha1", key).update(msg).digest();
  const offset = mac[mac.length - 1] & 0x0f;
  const bin = ((mac[offset] & 0x7f) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3];
  return String(bin % 10 ** DIGITS).padStart(DIGITS, "0");
}

function counterAt(nowMs) {
  return Math.floor(nowMs / 1000 / STEP_SEC);
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/**
 * Check a 6-digit code. `lastCounter` is the step of the last accepted code:
 * a code at or before it is a replay and is refused.
 * @returns {{ok: true, counter: number} | {ok: false, reason: "format"|"replay"|"mismatch"}}
 */
function verifyTotp(secretB32, code, { now = Date.now(), lastCounter = null, window = WINDOW } = {}) {
  const digits = String(code || "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(digits)) return { ok: false, reason: "format" };
  const current = counterAt(now);
  let replay = false;
  for (let d = -window; d <= window; d += 1) {
    const c = current + d;
    if (c < 0) continue;
    if (safeEqual(hotp(secretB32, c), digits)) {
      if (lastCounter != null && c <= Number(lastCounter)) {
        replay = true;
        continue;
      }
      return { ok: true, counter: c };
    }
  }
  return { ok: false, reason: replay ? "replay" : "mismatch" };
}

/** otpauth:// URI the authenticator app reads from the QR code. */
function otpauthUri(secretB32, accountName) {
  const label = encodeURIComponent(`${ISSUER}:${String(accountName || "user")}`);
  const params = new URLSearchParams({ secret: secretB32, issuer: ISSUER, algorithm: "SHA1", digits: String(DIGITS), period: String(STEP_SEC) });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/* ---------- secret at rest ---------- */

function encKey() {
  const explicit = process.env.TOTP_ENC_KEY;
  if (explicit && explicit.length >= 32) return crypto.createHash("sha256").update(explicit).digest();
  const base = process.env.JWT_SECRET;
  if (!base) throw new Error("TOTP_ENC_KEY or JWT_SECRET required");
  return Buffer.from(crypto.hkdfSync("sha256", Buffer.from(base), Buffer.from("descall-totp-v1"), Buffer.from("totp-secret"), 32));
}

/** "v1:<iv>:<tag>:<ciphertext>" (base64url parts). */
function encryptSecret(secretB32) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encKey(), iv);
  const ct = Buffer.concat([cipher.update(String(secretB32), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), ct.toString("base64url")].join(":");
}

function decryptSecret(blob) {
  const [v, iv, tag, ct] = String(blob || "").split(":");
  if (v !== "v1" || !iv || !tag || !ct) throw new Error("bad secret blob");
  const decipher = crypto.createDecipheriv("aes-256-gcm", encKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]).toString("utf8");
}

/* ---------- recovery codes ---------- */

/** "abcde-fghij" style, 10 per set; shown once, stored as hashes. */
function generateRecoveryCodes(count = RECOVERY_COUNT) {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789"; // no 0/o/1/l/i
  const one = () => {
    let s = "";
    const bytes = crypto.randomBytes(10);
    for (let i = 0; i < 10; i += 1) s += alphabet[bytes[i] % alphabet.length];
    return `${s.slice(0, 5)}-${s.slice(5)}`;
  };
  return Array.from({ length: count }, one);
}

function normalizeRecovery(code) {
  return String(code || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function hashRecovery(code) {
  return crypto.createHmac("sha256", encKey()).update(normalizeRecovery(code)).digest("hex");
}

/** Index of the matching unused hash, or -1. */
function matchRecovery(code, hashes) {
  const n = normalizeRecovery(code);
  if (n.length !== 10) return -1;
  const h = hashRecovery(n);
  return (Array.isArray(hashes) ? hashes : []).findIndex((x) => typeof x === "string" && safeEqual(x, h));
}

module.exports = {
  STEP_SEC,
  DIGITS,
  RECOVERY_COUNT,
  base32Encode,
  base32Decode,
  generateSecret,
  hotp,
  counterAt,
  verifyTotp,
  otpauthUri,
  encryptSecret,
  decryptSecret,
  generateRecoveryCodes,
  hashRecovery,
  matchRecovery,
};
