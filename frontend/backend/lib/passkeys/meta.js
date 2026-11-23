"use strict";

/**
 * Small pure helpers for passkeys: provider names by AAGUID, a default name for a new
 * passkey, the platform label, the client data challenge, and the public list shape.
 */

/**
 * Well-known passkey providers (community AAGUID list, passkey-authenticator-aaguids).
 * Only names; the AAGUID is self-reported and never trusted for any decision.
 */
const PROVIDERS = Object.freeze({
  "fbfc3007-154e-4ecc-8c0b-6e020557d7bd": "iCloud Keychain",
  "dd4ec289-e01d-41c9-bb89-70fa845d4bf2": "iCloud Keychain",
  "ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4": "Google Password Manager",
  "adce0002-35bc-c60a-648b-0b25f1f05503": "Chrome on Mac",
  "08987058-cadc-4b81-b6e1-30de50dcbe96": "Windows Hello",
  "9ddd1817-af5a-4672-a2b9-3e3dd95000a9": "Windows Hello",
  "6028b017-b1d4-4c02-b4b3-afcdafc96bb2": "Windows Hello",
  "bada5566-a7aa-401f-bd96-45619a55120d": "1Password",
  "d548826e-79b4-db40-a3d8-11116f7e8349": "Bitwarden",
  "531126d6-e717-415c-9320-3d9aa6981239": "Dashlane",
  "53414d53-554e-4700-0000-000000000000": "Samsung Pass",
  "50726f74-6f6e-5061-7373-50726f746f6e": "Proton Pass",
  "b84e4048-15dc-4dd0-8640-f4f60813c8af": "NordPass",
  "0ea242b4-43c4-4a1b-8b17-dd6d0b6baec6": "Keeper",
  "891494da-2c90-4d31-a9cd-4eab0aed1309": "Microsoft Password Manager",
  "f3809540-7f14-49c1-a8b3-8f813b225541": "Enpass",
  "cb69481e-8ff7-4039-93ec-0a2729a154a8": "YubiKey 5",
  "ee882879-721c-4913-9775-3dfcce97072a": "YubiKey 5",
  "fa2b99dc-9e39-4257-8f92-4a30d23c4118": "YubiKey 5",
});

const PLATFORMS = new Set(["web", "ios", "android", "windows", "electron", "macos", "linux", "other"]);

function providerName(aaguid) {
  const key = String(aaguid || "").toLowerCase();
  return PROVIDERS[key] || null;
}

function normalizePlatform(raw) {
  const p = String(raw || "").trim().toLowerCase();
  if (p === "ipad") return "ios";
  if (p === "tauri") return "windows";
  return PLATFORMS.has(p) ? p : "other";
}

/** Device label from a User-Agent (same buckets as lib/sessions.js describeDevice, shorter). */
function deviceFromUserAgent(userAgent = "") {
  const ua = String(userAgent || "");
  if (/iPad/i.test(ua)) return "iPad";
  if (/iPhone|iPod/i.test(ua)) return "iPhone";
  if (/Android/i.test(ua)) return "Android";
  if (/Windows/i.test(ua)) return "Windows";
  if (/Mac OS X|Macintosh/i.test(ua)) return "Mac";
  if (/CrOS/i.test(ua)) return "Chromebook";
  if (/Linux/i.test(ua)) return "Linux";
  return null;
}

const PLATFORM_LABEL = { ios: "iPhone", android: "Android", windows: "Windows", electron: "Windows", macos: "Mac", linux: "Linux" };

/** Name for a new passkey when the user typed none: "iCloud Keychain (iPhone)", "Windows Hello". */
function defaultPasskeyName({ aaguid, platform, userAgent } = {}) {
  const provider = providerName(aaguid);
  const device = deviceFromUserAgent(userAgent) || PLATFORM_LABEL[normalizePlatform(platform)] || null;
  if (provider && device && !provider.toLowerCase().includes(device.toLowerCase()) && provider !== "Windows Hello") {
    return `${provider} (${device})`.slice(0, 64);
  }
  return (provider || (device ? `${device} passkey` : "Passkey")).slice(0, 64);
}

/** User-typed name: trimmed, control characters removed, 1..64 characters. Empty = null. */
function sanitizeName(raw) {
  const s = String(raw == null ? "" : raw)
    .replace(/[\u0000-\u001f\u007f​-‏‪-‮⁦-⁩]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return null;
  return Array.from(s).slice(0, 64).join("");
}

/** The challenge inside a response's clientDataJSON (base64url), or null. Never trusted alone. */
function challengeFromResponse(response) {
  try {
    const raw = response?.response?.clientDataJSON;
    if (typeof raw !== "string" || raw.length > 4096) return null;
    const json = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    const c = json?.challenge;
    return typeof c === "string" && /^[A-Za-z0-9_-]{32,128}$/.test(c) ? c : null;
  } catch {
    return null;
  }
}

/** Basic shape check before anything touches the database. */
function looksLikeCredentialResponse(response, kind) {
  if (!response || typeof response !== "object") return false;
  if (response.type !== "public-key") return false;
  if (typeof response.id !== "string" || !/^[A-Za-z0-9_-]{16,1400}$/.test(response.id)) return false;
  if (typeof response.rawId !== "string" || response.rawId !== response.id) return false;
  const r = response.response;
  if (!r || typeof r !== "object" || typeof r.clientDataJSON !== "string") return false;
  if (kind === "register") return typeof r.attestationObject === "string" && r.attestationObject.length < 64 * 1024;
  return typeof r.authenticatorData === "string" && typeof r.signature === "string" && r.signature.length < 4096;
}

const TRANSPORTS = new Set(["ble", "cable", "hybrid", "internal", "nfc", "smart-card", "usb"]);
function cleanTransports(list) {
  return Array.isArray(list) ? [...new Set(list.filter((t) => TRANSPORTS.has(t)))] : [];
}

/** Public list item (never the public key or the raw counter decisions). */
function publicPasskey(row) {
  if (!row) return null;
  return {
    id: row.id,
    // Public by design (the authenticator shows it to any site that asks); lets the web
    // client keep the browser's passkey list in step (WebAuthn Signal API).
    credentialId: row.credential_id || null,
    name: row.name,
    provider: providerName(row.aaguid),
    platform: row.platform || null,
    device: row.created_device || null,
    synced: Boolean(row.backup_state),
    backupEligible: Boolean(row.backup_eligible),
    deviceType: row.device_type || null,
    transports: Array.isArray(row.transports) ? row.transports : [],
    createdAt: row.created_at || null,
    lastUsedAt: row.last_used_at || null,
    lastUsedPlatform: row.last_used_platform || null,
    useCount: Number(row.use_count) || 0,
    suspended: Boolean(row.suspended_at),
    suspendedReason: row.suspended_at ? row.suspended_reason || "counter" : null,
  };
}

module.exports = {
  PROVIDERS,
  providerName,
  normalizePlatform,
  deviceFromUserAgent,
  defaultPasskeyName,
  sanitizeName,
  challengeFromResponse,
  looksLikeCredentialResponse,
  cleanTransports,
  publicPasskey,
};
