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
const NUM_KEYS = ["rawRms", "processedRms", "contextSampleRate", "captureSampleRate", "nsUnderruns", "bytesSent", "bytesReceived", "packetsSent", "packetsReceived", "audioLevelOut", "audioLevelIn", "ageMs", "iceFetchAttempts", "iceFetchStatus", "peerCount", "outPacketsLost", "outFractionLost", "rttMs"];
const STR_KEYS = ["audioContextState", "nsEngine", "nsEngineReason", "nsFallback", "trackReadyState", "iceConnectionState", "connectionState", "candidateType", "localCandidateType", "remoteCandidateType", "candidateProtocol", "kind"];
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
    } else if (s.type === "remote-inbound-rtp" && (s.kind === "audio" || s.mediaType === "audio")) {
      // What the far end reports about OUR audio: uplink loss and round trip,
      // so "my voice cuts" can be told apart from a capture problem.
      if (s.packetsLost != null) out.outPacketsLost = (out.outPacketsLost || 0) + Math.max(0, Number(s.packetsLost) || 0);
      if (s.fractionLost != null) out.outFractionLost = Math.max(out.outFractionLost || 0, Number(s.fractionLost) || 0);
      if (s.roundTripTime != null) out.rttMs = Math.max(out.rttMs || 0, Math.round((Number(s.roundTripTime) || 0) * 1000));
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

const STATE_RANK = { failed: 5, disconnected: 4, closed: 3, new: 2, checking: 2, connecting: 2, connected: 1, completed: 1 };

/** The peer connection in the worst state (mesh calls: the link most likely to be the problem). */
export function worstPeer(pcs = []) {
  let worst = null;
  for (const pc of pcs) {
    if (!pc) continue;
    if (!worst || (STATE_RANK[pc.connectionState] || 0) > (STATE_RANK[worst.connectionState] || 0)) worst = pc;
  }
  return worst;
}

/** Merge per-peer summaries: counters add up, levels / loss / rtt take the max, relay wins. */
export function mergeSummaries(list = []) {
  const out = {};
  const SUM = ["bytesSent", "bytesReceived", "packetsSent", "packetsReceived", "outPacketsLost"];
  const MAX = ["audioLevelIn", "audioLevelOut", "outFractionLost", "rttMs"];
  for (const s of list) {
    if (!s) continue;
    for (const k of SUM) if (s[k] != null) out[k] = (out[k] || 0) + s[k];
    for (const k of MAX) if (s[k] != null) out[k] = Math.max(out[k] ?? -Infinity, s[k]);
    for (const k of ["localCandidateType", "remoteCandidateType", "candidateProtocol"]) if (s[k] && !out[k]) out[k] = s[k];
    if (s.candidateType && (out.candidateType !== "relay")) out.candidateType = s.candidateType;
  }
  return out;
}

/**
 * Collect a snapshot now. `deps` are injected so this file has no import
 * cycle: { pc, localTrack, uiMuted, ns: getNoiseSuppressionDiagnostics(), ice: getIceConfigStatus(), kind }.
 * Mesh calls (group, server voice) pass `pcs` (every peer connection) instead
 * of `pc`: the states come from the worst link, the counters from all links.
 */
export async function captureVoiceDiagnostics({ pc, pcs, localTrack, uiMuted, ns = {}, ice = {}, kind = "dm" } = {}) {
  const peers = Array.isArray(pcs) ? pcs.filter(Boolean) : pc ? [pc] : [];
  const statePc = Array.isArray(pcs) ? worstPeer(peers) : pc;
  const snap = {
    kind,
    nsEnabled: Boolean(ns.enabled),
    nsEngine: ns.engine || "off",
    nsFallback: ns.fallback || undefined,
    audioContextState: ns.audioContextState || "none",
    rawRms: ns.rawRms ?? undefined,
    processedRms: ns.processedRms ?? undefined,
    contextSampleRate: ns.contextSampleRate ?? undefined,
    captureSampleRate: ns.captureSampleRate ?? undefined,
    nsUnderruns: ns.underruns ?? undefined,
    nsEngineReason: ns.engineReason || undefined,
    trackEnabled: localTrack ? Boolean(localTrack.enabled) : undefined,
    trackMuted: localTrack ? Boolean(localTrack.muted) : undefined,
    trackReadyState: localTrack?.readyState || "none",
    uiMuted: typeof uiMuted === "boolean" ? uiMuted : undefined,
    iceConnectionState: statePc?.iceConnectionState || "none",
    connectionState: statePc?.connectionState || "none",
    peerCount: Array.isArray(pcs) ? peers.length : undefined,
    turnPresent: Boolean(ice.turnPresent),
    iceConfigFetchOk: Boolean(ice.fetchOk),
    iceFetchAttempts: ice.fetchAttempts ?? undefined,
    iceFetchStatus: ice.fetchStatus ?? undefined,
  };
  const summaries = await Promise.all(peers.map(async (p) => {
    try {
      if (p && typeof p.getStats === "function" && p.connectionState !== "closed") return summarizeStats(await p.getStats());
    } catch {
      /* stats are best effort */
    }
    return null;
  }));
  Object.assign(snap, peers.length === 1 ? summaries[0] || {} : mergeSummaries(summaries));
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
