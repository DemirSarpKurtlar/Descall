"use strict";

/**
 * Passkey (WebAuthn) relying party settings, read from the environment.
 *
 *   PASSKEYS_ENABLED            "0" / "false" turns every passkey endpoint off (kill switch).
 *   PASSKEY_RP_ID               relying party id, default descall.com.
 *   PASSKEY_RP_NAME             name shown by the authenticator, default Descall.
 *   PASSKEY_ORIGINS             comma list of web origins, default https://descall.com.
 *                               www.descall.com 301s to the apex, so no page runs there.
 *                               The Windows desktop paths (Tauri: webauthn.dll with a
 *                               clientDataJSON the app builds; iOS: ASAuthorization) all
 *                               report https://descall.com, so they need nothing extra.
 *   PASSKEY_ANDROID_CERT_SHA256 comma list of SHA-256 fingerprints (AA:BB:..., 32 bytes,
 *                               the same value as in assetlinks.json) of the certificates
 *                               that sign the Android app: the upload key for a sideloaded
 *                               APK and the Play App Signing key for a Play install.
 *                               Each becomes origin android:apk-key-hash:<base64url>.
 *                               ANDROID_CERT_SHA256 (the build-time name) is read too.
 *
 * The fingerprints are public (anyone can read them from the APK); no secret lives here.
 */

const DEFAULT_RP_ID = "descall.com";
const DEFAULT_ORIGINS = ["https://descall.com"];
const FINGERPRINT_RE = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;

function list(raw) {
  return String(raw || "")
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** "AA:BB:.." (any case, with or without colons) -> normalized "AA:BB:.." or null. */
function normalizeFingerprint(raw) {
  const hex = String(raw || "").replace(/[^0-9a-fA-F]/g, "").toUpperCase();
  if (hex.length !== 64) return null;
  const fp = hex.match(/.{2}/g).join(":");
  return FINGERPRINT_RE.test(fp) ? fp : null;
}

/** SHA-256 cert fingerprint -> the clientDataJSON origin Android Credential Manager reports. */
function androidOriginFromFingerprint(raw) {
  const fp = normalizeFingerprint(raw);
  if (!fp) return null;
  const bytes = Buffer.from(fp.replace(/:/g, ""), "hex");
  return `android:apk-key-hash:${bytes.toString("base64url")}`;
}

function isWebOrigin(o) {
  try {
    const u = new URL(o);
    if (u.origin !== o) return false;
    if (u.protocol === "https:") return true;
    // Local development only (rp id localhost).
    return u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1");
  } catch {
    return false;
  }
}

/** True when a web origin may use this rp id (same host or a subdomain of it). */
function originMatchesRpId(origin, rpId) {
  try {
    const host = new URL(origin).hostname;
    return host === rpId || host.endsWith(`.${rpId}`);
  } catch {
    return false;
  }
}

function readConfig(env = process.env) {
  const enabledRaw = String(env.PASSKEYS_ENABLED ?? "1").trim().toLowerCase();
  const enabled = !["0", "false", "off", "no"].includes(enabledRaw);
  const rpId = String(env.PASSKEY_RP_ID || DEFAULT_RP_ID).trim().toLowerCase() || DEFAULT_RP_ID;
  const rpName = String(env.PASSKEY_RP_NAME || "Descall").trim().slice(0, 64) || "Descall";
  const configured = list(env.PASSKEY_ORIGINS);
  const webOrigins = (configured.length ? configured : DEFAULT_ORIGINS)
    .filter(isWebOrigin)
    .filter((o) => originMatchesRpId(o, rpId));
  const fingerprints = [...new Set([...list(env.PASSKEY_ANDROID_CERT_SHA256), ...list(env.ANDROID_CERT_SHA256)].map(normalizeFingerprint).filter(Boolean))];
  const androidOrigins = fingerprints.map(androidOriginFromFingerprint).filter(Boolean);
  const origins = [...new Set([...webOrigins, ...androidOrigins])];
  return Object.freeze({
    enabled,
    rpId,
    rpName,
    webOrigins: Object.freeze(webOrigins),
    androidOrigins: Object.freeze(androidOrigins),
    androidFingerprints: Object.freeze(fingerprints),
    origins: Object.freeze(origins),
    /** The origin the desktop native paths put in clientDataJSON. */
    desktopOrigin: webOrigins[0] || `https://${rpId}`,
    timeoutMs: 5 * 60 * 1000,
  });
}

function isAllowedOrigin(config, origin) {
  return typeof origin === "string" && config.origins.includes(origin);
}

module.exports = {
  DEFAULT_RP_ID,
  readConfig,
  isAllowedOrigin,
  normalizeFingerprint,
  androidOriginFromFingerprint,
  originMatchesRpId,
};
