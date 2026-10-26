/**
 * 3.0.0 (A0): one sender for every call-setup summary (DM JS, DM native
 * CallKit, group mesh, server voice / LiveKit) → socket `call:telemetry`.
 *
 * Aggregate only: the field list below is the whole schema, strings must be
 * short lowercase tokens (no digits, so no ids / uuids can slip through) and
 * numbers are rounded. When the socket is down the summary waits in a small
 * sessionStorage queue (max 10) and is flushed on the next connect.
 */

export const CALL_TELEMETRY_NUMBER_FIELDS = Object.freeze([
  // DM timeline marks (ms since tap)
  "gum", "gumStart", "gumEnd", "iceCfgStart", "iceCfgEnd", "offerSent", "answerRecv", "answerSent",
  "ice", "out", "in", "heard", "mediaVerified", "iceFailed", "iceCfgTurn", "iceCfgStunOnly",
  "answerToAudioMs", "mediaVerifiedMs", "reneg", "reconnects", "recovered", "retryShown",
  // Native (CallKit) engine marks
  "socket", "offer", "answered", "answerReady", "iceConnected", "audioSession",
  "firstAudio", "firstOutAudio", "noInboundAudio", "ended", "callKitReady",
  // Group mesh
  "peers", "peersAudio", "firstAudioMs", "silentPeers",
  // Server voice (LiveKit)
  "tokenMs", "lkConnectMs", "lkFirstAudioMs", "published", "urlProbeMs",
]);

export const CALL_TELEMETRY_STRING_FIELDS = Object.freeze([
  "kind", "direction", "callType", "result", "platform", "pair", "path", "push", "entry", "media", "tokenError",
]);

export const CALL_TELEMETRY_BOOL_FIELDS = Object.freeze(["turn", "queued", "urlProbeSkipped"]);

const TOKEN_RE = /^[a-z][a-z_-]{0,31}$/;
const PAIR_RE = /^(host|srflx|prflx|relay|\?)\/(host|srflx|prflx|relay|\?)$/;
const QUEUE_KEY = "descall:call-telemetry-queue";
export const CALL_TELEMETRY_QUEUE_MAX = 10;

/** Whitelist + normalise one summary. Returns null when nothing is left. */
export function sanitizeCallTelemetry(input) {
  if (!input || typeof input !== "object") return null;
  const out = {};
  for (const key of CALL_TELEMETRY_NUMBER_FIELDS) {
    const v = input[key];
    if (typeof v === "number" && Number.isFinite(v)) out[key] = Math.max(-1, Math.min(600_000, Math.round(v)));
  }
  for (const key of CALL_TELEMETRY_STRING_FIELDS) {
    const v = input[key];
    if (typeof v !== "string") continue;
    const s = v.trim().toLowerCase().slice(0, 32);
    if (key === "pair" ? PAIR_RE.test(s) : TOKEN_RE.test(s)) out[key] = s;
  }
  for (const key of CALL_TELEMETRY_BOOL_FIELDS) {
    if (typeof input[key] === "boolean") out[key] = input[key];
  }
  return Object.keys(out).length ? out : null;
}

function defaultStorage() {
  try {
    return typeof sessionStorage !== "undefined" ? sessionStorage : null;
  } catch {
    return null;
  }
}

export function createCallTelemetrySender({ getSocket = () => null, storage = defaultStorage() } = {}) {
  function readQueue() {
    if (!storage) return [];
    try {
      const arr = JSON.parse(storage.getItem(QUEUE_KEY) || "[]");
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }
  function writeQueue(arr) {
    if (!storage) return;
    try {
      if (arr.length) storage.setItem(QUEUE_KEY, JSON.stringify(arr.slice(-CALL_TELEMETRY_QUEUE_MAX)));
      else storage.removeItem(QUEUE_KEY);
    } catch {
      /* quota / private mode */
    }
  }
  function connectedSocket() {
    try {
      const s = getSocket();
      return s && s.connected ? s : null;
    } catch {
      return null;
    }
  }

  function send(summary) {
    const clean = sanitizeCallTelemetry(summary);
    if (!clean) return false;
    const socket = connectedSocket();
    if (socket) {
      try {
        socket.emit("call:telemetry", clean);
        return true;
      } catch {
        /* fall through to queue */
      }
    }
    writeQueue([...readQueue(), { ...clean, queued: true }]);
    return false;
  }

  function flush() {
    const socket = connectedSocket();
    if (!socket) return 0;
    const queued = readQueue();
    if (!queued.length) return 0;
    writeQueue([]);
    let sent = 0;
    for (const item of queued) {
      const clean = sanitizeCallTelemetry(item);
      if (!clean) continue;
      try {
        socket.emit("call:telemetry", clean);
        sent += 1;
      } catch {
        /* drop */
      }
    }
    return sent;
  }

  return { send, flush, pending: () => readQueue().length };
}
