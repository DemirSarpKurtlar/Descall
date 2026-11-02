/**
 * Voice diagnostic snapshot (3.7.27), attached to call-related feedback so a
 * "ses gitmiyor" report says WHY: AudioContext state, noise-suppression
 * engine / fallback, local track flags, raw vs processed level, bytes
 * sent / received, ICE state, selected candidate type, TURN, ice-config fetch.
 *
 * No personal data: no IPs, ports, candidate addresses, device labels or ids,
 * user ids. `sanitizeVoiceDiagnostics` (also used by the backend) whitelists
 * the keys and clips every value.
 */

const STATE_RE = /^[a-z-]{1,24}$/;
const NUM_KEYS = ["rawRms", "processedRms", "bytesSent", "bytesReceived", "packetsSent", "packetsReceived", "audioLevelOut", "audioLevelIn", "ageMs", "iceFetchAttempts", "iceFetchStatus"];
const STR_KEYS = ["audioContextState", "nsEngine", "nsFallback", "trackReadyState", "iceConnectionState", "connectionState", "candidateType", "localCandidateType", "remoteCandidateType", "candidateProtocol", "kind"];
const BOOL_KEYS = ["nsEnabled", "trackEnabled", "trackMuted", "uiMuted", "turnPresent", "iceConfigFetchOk"];

export function sanitizeVoiceDiagnostics(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const out = {};
  for (const k of NUM_KEYS) {
    const n = Number(input[k]);
    if (input[k] != null && Number.isFinite(n)) out[k] = Math.max(-1e12, Math.min(1e12, Math.round(n * 1e5) / 1e5));
  }
  for (const k of STR_KEYS) {
    const v = typeof input[k] === "string" ? input[k].trim().toLowerCase() : "";
    if (v && STATE_RE.test(v)) out[k] = v;
  }
  for (const k of BOOL_KEYS) {
    if (typeof input[k] === "boolean") out[k] = input[k];
  }
  return Object.keys(out).length ? out : null;
}

let lastSnapshot = null;
let lastAt = 0;

/** Pure: pick the useful numbers out of an RTCStatsReport-like iterable. */
export function summarizeStats(report) {
  const out = {};
  if (!report) return out;
  const byId = new Map();
  const list = [];
  report.forEach?.((s) => {
    byId.set(s.id, s);
    list.push(s);
  });
  for (const s of list) {
    if (s.type === "outbound-rtp" && (s.kind === "audio" || s.mediaType === "audio")) {
      out.bytesSent = (out.bytesSent || 0) + (Number(s.bytesSent) || 0);
      out.packetsSent = (out.packetsSent || 0) + (Number(s.packetsSent) || 0);
    } else if (s.type === "inbound-rtp" && (s.kind === "audio" || s.mediaType === "audio")) {
      out.bytesReceived = (out.bytesReceived || 0) + (Number(s.bytesReceived) || 0);
      out.packetsReceived = (out.packetsReceived || 0) + (Number(s.packetsReceived) || 0);
      if (s.audioLevel != null) out.audioLevelIn = Number(s.audioLevel);
    } else if (s.type === "media-source" && s.kind === "audio" && s.audioLevel != null) {
      out.audioLevelOut = Number(s.audioLevel);
    }
  }
  let pair = null;
  for (const s of list) {
    if (s.type === "transport" && s.selectedCandidatePairId) pair = byId.get(s.selectedCandidatePairId) || pair;
  }
  if (!pair) pair = list.find((s) => s.type === "candidate-pair" && (s.selected || (s.nominated && s.state === "succeeded"))) || null;
  if (pair) {
    const local = byId.get(pair.localCandidateId);
    const remote = byId.get(pair.remoteCandidateId);
    if (local?.candidateType) out.localCandidateType = local.candidateType;
    if (remote?.candidateType) out.remoteCandidateType = remote.candidateType;
    out.candidateType = local?.candidateType === "relay" || remote?.candidateType === "relay" ? "relay" : (local?.candidateType || remote?.candidateType || undefined);
    if (local?.protocol) out.candidateProtocol = local.protocol;
  }
  return out;
}

/**
 * Collect a snapshot now. `deps` are injected so this file has no import
 * cycle: { pc, localTrack, uiMuted, ns: getNoiseSuppressionDiagnostics(), ice: getIceConfigStatus(), kind }.
 */
export async function captureVoiceDiagnostics({ pc, localTrack, uiMuted, ns = {}, ice = {}, kind = "dm" } = {}) {
  const snap = {
    kind,
    nsEnabled: Boolean(ns.enabled),
    nsEngine: ns.engine || "off",
    nsFallback: ns.fallback || undefined,
    audioContextState: ns.audioContextState || "none",
    rawRms: ns.rawRms ?? undefined,
    processedRms: ns.processedRms ?? undefined,
    trackEnabled: localTrack ? Boolean(localTrack.enabled) : undefined,
    trackMuted: localTrack ? Boolean(localTrack.muted) : undefined,
    trackReadyState: localTrack?.readyState || "none",
    uiMuted: typeof uiMuted === "boolean" ? uiMuted : undefined,
    iceConnectionState: pc?.iceConnectionState || "none",
    connectionState: pc?.connectionState || "none",
    turnPresent: Boolean(ice.turnPresent),
    iceConfigFetchOk: Boolean(ice.fetchOk),
    iceFetchAttempts: ice.fetchAttempts ?? undefined,
    iceFetchStatus: ice.fetchStatus ?? undefined,
  };
  try {
    if (pc && typeof pc.getStats === "function" && pc.connectionState !== "closed") {
      Object.assign(snap, summarizeStats(await pc.getStats()));
    }
  } catch {
    /* stats are best effort */
  }
  lastSnapshot = sanitizeVoiceDiagnostics(snap);
  lastAt = Date.now();
  return lastSnapshot;
}

/** The last snapshot of this session (call ended within `maxAgeMs`), with its age. */
export function getLastVoiceDiagnostics({ maxAgeMs = 6 * 60 * 60 * 1000, now = Date.now() } = {}) {
  if (!lastSnapshot || now - lastAt > maxAgeMs) return null;
  return { ...lastSnapshot, ageMs: now - lastAt };
}

export function _setLastVoiceDiagnosticsForTests(snap, at = Date.now()) {
  lastSnapshot = snap;
  lastAt = at;
}
