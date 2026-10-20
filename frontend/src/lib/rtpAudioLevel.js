/**
 * Audio levels straight from WebRTC, without an AudioContext.
 *
 * - Remote: RTCRtpReceiver.getSynchronizationSources() carries the RFC 6464
 *   level of the packets actually being played (0–1, 1 = 0 dBov). Synchronous
 *   and cheap; supported by Chromium/Electron, Safari/WKWebView and Firefox.
 * - Local: the sender's "media-source" stats audioLevel is the level of the
 *   track that is really being SENT — after noise suppression and after any
 *   replaceTrack (device switch, iOS mic restart). The raw localStream the
 *   tile shows can be a different (or dead) track.
 *
 * Both return null when unknown so the analyser path stays in charge.
 */

/** A level older than this is stale (the peer stopped sending / DTX). */
// Was 1000 ms: with Opus DTX no packets arrive after speech ends, so the
// last *speech* level stayed "fresh" for a second and held the ring on.
// Packets arrive every 20 ms while talking; 250 ms is plenty.
export const RTP_LEVEL_FRESH_MS = 250;

/** Engines disagree on the clock (epoch ms vs performance.now()); accept either. */
function clocks() {
  const list = [Date.now()];
  if (typeof performance !== "undefined" && typeof performance.now === "function") list.push(performance.now());
  return list;
}

/** Max level over contributing sources that are fresh. Pure; exported for tests. */
export function levelFromSources(sources, nows = clocks(), freshMs = RTP_LEVEL_FRESH_MS) {
  if (!Array.isArray(sources) || !sources.length) return null;
  let best = null;
  for (const s of sources) {
    if (!s || typeof s.audioLevel !== "number") continue;
    if (typeof s.timestamp === "number") {
      const fresh = nows.some((n) => Math.abs(n - s.timestamp) <= freshMs);
      if (!fresh) continue;
    }
    best = best == null ? s.audioLevel : Math.max(best, s.audioLevel);
  }
  // Sources exist but all are stale: the peer is silent (DTX) → 0, not unknown.
  return best == null ? 0 : best;
}

export function readRemoteAudioLevel(pc, { excludeTrackIds = null } = {}) {
  if (!pc || typeof pc.getReceivers !== "function" || pc.connectionState === "closed") return null;
  const exclude = excludeTrackIds instanceof Set
    ? excludeTrackIds
    : new Set(Array.isArray(excludeTrackIds) ? excludeTrackIds : []);
  let result = null;
  for (const r of pc.getReceivers()) {
    if (r?.track?.kind !== "audio" || exclude.has(r.track.id)) continue;
    if (typeof r.getSynchronizationSources !== "function") continue;
    let lvl = null;
    try {
      lvl = levelFromSources(r.getSynchronizationSources());
    } catch {
      lvl = null;
    }
    if (lvl != null) result = result == null ? lvl : Math.max(result, lvl);
  }
  return result;
}

/** audioLevel of the media-source stat in a getStats() report. */
export function levelFromStatsReport(report) {
  if (!report || typeof report.forEach !== "function") return null;
  let level = null;
  report.forEach((stat) => {
    if (stat?.type === "media-source" && stat.kind === "audio" && typeof stat.audioLevel === "number") {
      level = level == null ? stat.audioLevel : Math.max(level, stat.audioLevel);
    }
  });
  return level;
}

/**
 * Polls the mic sender's stats (getStats is async, so it cannot sit inside
 * the 40 ms analyser tick). read() returns the latest level, or null.
 */
export function createLocalLevelProbe({ getPc, excludeSender = () => null, intervalMs = 150, staleMs = 1200 } = {}) {
  let timer = 0;
  let level = null;
  let at = 0;
  let inFlight = false;
  const poll = async () => {
    if (inFlight) return;
    const pc = getPc?.();
    if (!pc || pc.connectionState === "closed" || typeof pc.getSenders !== "function") {
      level = null;
      return;
    }
    const skip = excludeSender?.();
    const sender = pc.getSenders().find((s) => s?.track?.kind === "audio" && s !== skip);
    if (!sender || typeof sender.getStats !== "function" || sender.track?.enabled === false) {
      level = sender?.track?.enabled === false ? 0 : null;
      at = Date.now();
      return;
    }
    inFlight = true;
    try {
      const v = levelFromStatsReport(await sender.getStats());
      level = v;
      at = Date.now();
    } catch {
      level = null;
    } finally {
      inFlight = false;
    }
  };
  return {
    start() {
      if (timer || typeof setInterval === "undefined") return;
      void poll();
      timer = setInterval(poll, intervalMs);
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = 0;
      level = null;
    },
    read() {
      if (level == null || Date.now() - at > staleMs) return null;
      return level;
    },
    _poll: poll,
  };
}
