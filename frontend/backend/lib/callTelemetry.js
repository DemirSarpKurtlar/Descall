"use strict";
// 3.0.0 (A0): server side of `call:telemetry`. Same schema as
// frontend/src/lib/callTelemetry.js (kept in sync by callTelemetry.selftest.mjs).
// Aggregate only: whitelisted fields, numbers rounded, strings limited to short
// lowercase tokens without digits, so no ids / uuids / names reach the log.

const NUMBER_FIELDS = Object.freeze([
  "gum", "gumStart", "gumEnd", "iceCfgStart", "iceCfgEnd", "offerSent", "answerRecv", "answerSent",
  "ice", "out", "in", "heard", "mediaVerified", "iceFailed", "iceCfgTurn", "iceCfgStunOnly",
  "answerToAudioMs", "mediaVerifiedMs", "reneg", "reconnects", "recovered", "retryShown",
  "socket", "offer", "answered", "answerReady", "iceConnected", "audioSession",
  "firstAudio", "firstOutAudio", "noInboundAudio", "ended", "callKitReady",
  "peers", "peersAudio", "firstAudioMs", "silentPeers",
  "tokenMs", "lkConnectMs", "lkFirstAudioMs", "published", "urlProbeMs",
]);
const STRING_FIELDS = Object.freeze([
  "kind", "direction", "callType", "result", "platform", "pair", "path", "push", "entry", "media", "tokenError",
]);
const BOOL_FIELDS = Object.freeze(["turn", "queued", "urlProbeSkipped"]);
const TOKEN_RE = /^[a-z][a-z_-]{0,31}$/;
const PAIR_RE = /^(host|srflx|prflx|relay|\?)\/(host|srflx|prflx|relay|\?)$/;
const MAX_PER_SOCKET = 30;

function sanitizeCallTelemetry(input) {
  if (!input || typeof input !== "object") return null;
  const out = {};
  for (const key of NUMBER_FIELDS) {
    const v = input[key];
    if (typeof v === "number" && Number.isFinite(v)) out[key] = Math.max(-1, Math.min(600000, Math.round(v)));
  }
  for (const key of STRING_FIELDS) {
    const v = input[key];
    if (typeof v !== "string") continue;
    const s = v.trim().toLowerCase().slice(0, 32);
    if (key === "pair" ? PAIR_RE.test(s) : TOKEN_RE.test(s)) out[key] = s;
  }
  for (const key of BOOL_FIELDS) {
    if (typeof input[key] === "boolean") out[key] = input[key];
  }
  return Object.keys(out).length ? out : null;
}

module.exports = { sanitizeCallTelemetry, NUMBER_FIELDS, STRING_FIELDS, BOOL_FIELDS, MAX_PER_SOCKET };
