"use strict";

/**
 * Call-scoped tokens that let the native iOS app report what happened to a
 * CallKit call while its web layer can't run (phone locked / app suspended):
 *
 *   POST /api/calls/voip-status { callUuid, calleeId, token, status }
 *     status "answering" — answered on CallKit, the app is waiting to be opened
 *     status "failed"    — answered but the app never joined (native timeout)
 *
 * The token is an HMAC of (callUuid, calleeId) sent inside the VoIP push, so
 * the phone needs no stored login token and can only speak for that one ring.
 */

const crypto = require("crypto");

const PREFIX = "descall-voip-status:v1";

function statusSecret() {
  return String(process.env.VOIP_STATUS_SECRET || process.env.JWT_SECRET || "");
}

function signVoipStatus(callUuid, calleeId, secret = statusSecret()) {
  if (!secret || !callUuid || !calleeId) return "";
  return crypto
    .createHmac("sha256", secret)
    .update(`${PREFIX}:${callUuid}:${calleeId}`)
    .digest("hex");
}

function verifyVoipStatus(callUuid, calleeId, token, secret = statusSecret()) {
  const expected = signVoipStatus(String(callUuid || ""), String(calleeId || ""), secret);
  const given = String(token || "");
  if (!expected || given.length !== expected.length || !/^[0-9a-f]+$/i.test(given)) return false;
  return crypto.timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(given.toLowerCase(), "utf8"));
}

/** Absolute URL of the status endpoint for the push payload (https only). */
function voipStatusUrl() {
  const base = String(
    process.env.PUBLIC_API_URL || process.env.RENDER_EXTERNAL_URL || "https://des-call.onrender.com"
  ).replace(/\/+$/, "");
  return /^https:\/\//i.test(base) ? `${base}/api/calls/voip-status` : "";
}

module.exports = { signVoipStatus, verifyVoipStatus, voipStatusUrl };
