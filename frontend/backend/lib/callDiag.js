"use strict";

/**
 * DM ring / call-setup diagnostics (27 Nov 2026, "iOS'ta uygulama kapalıyken
 * arama Bağlanıyor'da kalıp kapanıyor").
 *
 * 1. `[CallRing] {...}` lines in the Render log, one per step of a ring:
 *    offer (tracked after the async checks, how many caller candidates it
 *    already holds), voip (APNs result), resume (what a woken callee got),
 *    answer. Fields are whitelisted numbers / short tokens plus `ref`, the
 *    last 6 hex characters of the random per-ring CallKit UUID, so the lines
 *    of one ring can be read together. No user ids, names or tokens.
 * 2. A failed call setup reported by a client (`call:telemetry`) becomes one
 *    warning row in error_logs (admin "Hata Kayıtları"), grouped per failure
 *    shape and throttled, so the next failure is visible without Render logs.
 */

const RING_NUMBER_FIELDS = Object.freeze([
  "setupMs", "earlyIce", "keptIce", "callerIce", "tokens", "sent", "failed", "dropped", "ms", "ringMs", "offers",
]);
const RING_STRING_FIELDS = Object.freeze(["ev", "ref", "callee", "status", "reason", "state"]);
const RING_BOOL_FIELDS = Object.freeze(["skipped", "renegotiation", "online", "resumed"]);
const TOKEN_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/;

/** Last 6 hex characters of a ring UUID (random, not personal), or "". */
function ringRef(callUuid) {
  const hex = String(callUuid || "").toLowerCase().replace(/[^0-9a-f]/g, "");
  return hex.length >= 6 ? hex.slice(-6) : "";
}

function sanitizeRingFields(fields = {}) {
  const out = {};
  for (const key of RING_STRING_FIELDS) {
    const v = fields[key];
    if (typeof v !== "string") continue;
    const s = v.trim().toLowerCase().slice(0, 32);
    if (TOKEN_RE.test(s)) out[key] = s;
  }
  for (const key of RING_NUMBER_FIELDS) {
    const v = fields[key];
    if (typeof v === "number" && Number.isFinite(v)) out[key] = Math.max(-1, Math.min(600_000, Math.round(v)));
  }
  for (const key of RING_BOOL_FIELDS) {
    if (typeof fields[key] === "boolean") out[key] = fields[key];
  }
  return out;
}

function logRing(ev, fields = {}, log = console) {
  try {
    log.log("[CallRing]", JSON.stringify(sanitizeRingFields({ ...fields, ev })));
  } catch {
    /* never break signalling for a log line */
  }
}

// Native engine failures (DescallNativeCall.fail reasons) and the JS
// timeline's "no media within 20 s" result.
const FAILED_RESULTS = new Set(["connect-timeout", "lost", "auth", "pc", "remote-sdp", "answer", "local-sdp", "no-audio"]);

/**
 * Did this telemetry summary describe a DM call whose media never connected?
 * Group / server voice summaries and normal hang-ups are not failures.
 */
/**
 * ICE reached "connected" at some point. Careful: the native engine's "ice"
 * mark is "ICE servers fetched"; its connection mark is "iceConnected". The
 * JS timeline's "ice" is the connection.
 */
function iceEverConnected(summary) {
  if (summary.path === "native") return summary.iceConnected != null;
  return summary.ice != null || summary.iceConnected != null;
}

function isSetupFailure(summary) {
  if (!summary || summary.kind !== "dm") return false;
  const result = String(summary.result || "");
  if (FAILED_RESULTS.has(result)) return true;
  if (result === "timeout") {
    // JS timeline: 20 s after the answer. Only a failure when ICE never
    // connected (a connected call that is merely quiet is not).
    return !iceEverConnected(summary);
  }
  return summary.iceFailed != null && !iceEverConnected(summary);
}

function failureShape(summary) {
  const path = summary.path || "js";
  const direction = summary.direction || "?";
  const result = summary.result || "?";
  const push = summary.push || "none";
  const entry = summary.entry || "?";
  const platform = summary.platform || "?";
  return { path, direction, result, push, entry, platform };
}

function failureMessage(summary) {
  const f = failureShape(summary);
  const iceNever = !iceEverConnected(summary);
  const what = iceNever ? "ICE never connected" : "no audio";
  return `DM call setup failed (${what}): ${f.direction} ${f.path} on ${f.platform}, result ${f.result}, push ${f.push}, entry ${f.entry}`;
}

function errorPlatform(summary) {
  const p = String(summary.platform || "");
  if (p === "ios-app") return "iphone-app";
  if (p === "android-app") return "android-app";
  if (p === "electron" || p === "tauri") return "windows-app";
  if (p === "web") return "desktop-web";
  return "other";
}

const THROTTLE_MS = 60_000;

function createCallSetupFailureRecorder(deps = {}) {
  const getDb = deps.getDb || (() => require("../db/supabase"));
  const now = deps.now || (() => Date.now());
  const log = deps.log || console;
  const lastByShape = new Map();

  /** Never throws; resolves true when a row was written. */
  async function record(summary) {
    if (!isSetupFailure(summary)) return false;
    const message = failureMessage(summary);
    const t = now();
    const last = lastByShape.get(message) || 0;
    if (t - last < THROTTLE_MS) return false;
    lastByShape.set(message, t);
    if (lastByShape.size > 200) lastByShape.clear();
    try {
      const errorGroups = require("./errorGroups");
      const base = {
        message,
        // The whole (already sanitized, id-free) summary: timeline marks in ms.
        stack: JSON.stringify(summary).slice(0, 4000),
        url: "/admin/panel?tab=errors",
        user_agent: "descall-call-telemetry",
        user_id: "system",
        timestamp: new Date(t).toISOString(),
        resolved: false,
        severity: "warning",
        source: "call",
      };
      const db = getDb();
      let res = await db
        .from("error_logs")
        .insert({ ...base, fingerprint: errorGroups.fingerprint(message, null), platform: errorPlatform(summary), app_version: null })
        .select("id");
      if (res?.error) res = await db.from("error_logs").insert(base).select("id");
      if (res?.error) {
        log.warn("[CallDiag] error_logs insert failed:", res.error.message || res.error);
        return false;
      }
      return true;
    } catch (err) {
      log.warn("[CallDiag] record failed:", err?.message || err);
      return false;
    }
  }

  return { record };
}

let defaultRecorder = null;
function recordCallSetupFailure(summary) {
  if (!defaultRecorder) defaultRecorder = createCallSetupFailureRecorder();
  return defaultRecorder.record(summary);
}

module.exports = {
  ringRef,
  sanitizeRingFields,
  logRing,
  isSetupFailure,
  failureMessage,
  errorPlatform,
  createCallSetupFailureRecorder,
  recordCallSetupFailure,
  THROTTLE_MS,
};
