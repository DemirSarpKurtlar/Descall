"use strict";

/**
 * Shared APNs (Apple Push Notification service) plumbing for the iOS app.
 *
 * - Token-based auth: one ES256 JWT signed with the team .p8 key
 *   (APNS_KEY_ID, APNS_TEAM_ID, APNS_PRIVATE_KEY), reused for ~50 minutes.
 * - Used by lib/iosAlertPush.js (apns-push-type alert, topic = bundle id) and
 *   lib/voipPush.js (apns-push-type voip, topic = bundle id + ".voip").
 * - Production host (api.push.apple.com) unless the caller's sandbox env flag
 *   is "true": TestFlight and App Store builds get production tokens.
 * - Never log the key, the JWT or full device tokens.
 */

const http2 = require("http2");
const jwt = require("jsonwebtoken");

const PROD_HOST = "api.push.apple.com";
const SANDBOX_HOST = "api.sandbox.push.apple.com";

function isApnsDeviceToken(token) {
  return /^[0-9a-f]{64}$/i.test(String(token || "").trim());
}

function apnsConfig() {
  const keyId = String(process.env.APNS_KEY_ID || "").trim();
  const teamId = String(process.env.APNS_TEAM_ID || "").trim();
  const rawKey = String(process.env.APNS_PRIVATE_KEY || "");
  if (!keyId || !teamId || !rawKey.trim()) return null;
  const privateKey = rawKey.includes("\\n") ? rawKey.replace(/\\n/g, "\n") : rawKey;
  return {
    keyId,
    teamId,
    privateKey,
    bundleId: String(process.env.APNS_BUNDLE_ID || "com.descall.app").trim(),
    sandbox: String(process.env.APNS_USE_SANDBOX || "").toLowerCase() === "true",
  };
}

/** APNs host; `sandboxEnv` names the env flag that switches to the sandbox. */
function apnsHost(sandboxEnv = "APNS_USE_SANDBOX") {
  return String(process.env[sandboxEnv] || "").toLowerCase() === "true" ? SANDBOX_HOST : PROD_HOST;
}

let cachedJwt = "";
let cachedJwtIat = 0;
let cachedJwtKeyId = "";

function getApnsJwt(cfg) {
  const now = Math.floor(Date.now() / 1000);
  if (cachedJwt && cachedJwtKeyId === cfg.keyId && now - cachedJwtIat < 50 * 60) return cachedJwt;
  cachedJwt = jwt.sign({ iss: cfg.teamId, iat: now }, cfg.privateKey, {
    algorithm: "ES256",
    header: { alg: "ES256", kid: cfg.keyId },
  });
  cachedJwtIat = now;
  cachedJwtKeyId = cfg.keyId;
  return cachedJwt;
}

/**
 * True when APNs says the token will never work again: 410 Unregistered, or
 * 400 BadDeviceToken / DeviceTokenNotForTopic. 429 / 5xx are transient and
 * must never delete a token.
 */
function apnsTokenShouldDrop(status, responseBody) {
  if (status === 410) return true;
  return status === 400 && /BadDeviceToken|Unregistered|DeviceTokenNotForTopic/i.test(String(responseBody || ""));
}

/** One HTTP/2 POST to APNs. Resolves { status, body }; rejects on network errors. */
function http2Transport({ host, headers, body }) {
  return new Promise((resolve, reject) => {
    const client = http2.connect(`https://${host}`);
    const fail = (err) => {
      client.close();
      reject(err);
    };
    client.on("error", fail);
    const req = client.request(headers);
    let status = 0;
    let responseBody = "";
    req.on("response", (h) => {
      status = Number(h[":status"] || 0);
    });
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      responseBody += chunk;
    });
    req.on("end", () => {
      client.close();
      resolve({ status, body: responseBody });
    });
    req.on("error", fail);
    req.setTimeout(10_000, () => req.close(http2.constants.NGHTTP2_CANCEL));
    req.end(body);
  });
}

/** Short, non-identifying token label for logs. */
function tokenTail(token) {
  const s = String(token || "");
  return s ? `…${s.slice(-6)}` : "";
}

module.exports = {
  PROD_HOST,
  SANDBOX_HOST,
  isApnsDeviceToken,
  apnsConfig,
  apnsHost,
  getApnsJwt,
  apnsTokenShouldDrop,
  http2Transport,
  tokenTail,
};
