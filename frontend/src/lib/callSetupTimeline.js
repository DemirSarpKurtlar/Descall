/**
 * Per-call setup timeline for DM calls: how long from the tap (call / accept)
 * until audio actually flows. Logged once per call to the console as
 * `[CallSetup] {...}`; a non-personal Sentry diagnostic is sent only when the
 * setup was slow, so field reports carry real numbers (no names / ids).
 *
 * Marks are ms since the tap: gum (mic ready), offer / answer sent or
 * received, ice (ICE connected), out (first outbound audio packets), in (first
 * inbound audio packets), heard (remote audio energy > 0).
 *
 * 3.0.0 (A0): split phases gumStart/gumEnd and iceCfgStart/iceCfgEnd,
 * mediaVerified (outbound packetsSent AND inbound packetsReceived both rising
 * between two stats samples, the "audio flows both ways" moment), meta tags
 * (path js|native, push voip|alert|none, entry tap|callkit|notification|inapp)
 * and counters (reneg, reconnects). Summaries carry no ids or names.
 */

const POLL_MS = 100;
const MAX_WATCH_MS = 20_000;
const SLOW_MS = 3_000;
// Inbound energy can stay 0 (remote muted / silent room); once media is
// verified both ways, stop waiting for "heard" after this long.
const HEARD_GRACE_MS = 8_000;

export const META_VALUES = Object.freeze({
  path: ["js", "native"],
  push: ["voip", "alert", "none"],
  entry: ["tap", "callkit", "notification", "inapp"],
});

function pickMeta(meta) {
  const out = {};
  for (const [key, allowed] of Object.entries(META_VALUES)) {
    if (meta && allowed.includes(meta[key])) out[key] = meta[key];
  }
  return out;
}

export function createCallSetupTimeline({
  now = () => (typeof performance !== "undefined" ? performance.now() : Date.now()),
  report = () => {},
  log = (...a) => console.info(...a),
  context = () => ({}),
  // Every summary (also fast / failed ones) → server log `[CallTelemetry]`.
  onSummary = () => {},
} = {}) {
  let tl = null;
  let timer = null;

  function stopPoll() {
    if (timer != null) clearInterval(timer);
    timer = null;
  }

  function start(direction, callType, meta = {}) {
    stopPoll();
    tl = {
      t0: now(),
      direction,
      callType: callType || "voice",
      marks: {},
      meta: { path: "js", ...pickMeta(meta) },
      counts: { reneg: 0, reconnects: 0 },
      done: false,
      pair: null,
      last: null,
    };
  }

  function mark(name) {
    if (!tl || tl.done || tl.marks[name] != null) return;
    tl.marks[name] = Math.round(now() - tl.t0);
  }

  /** path / push / entry tags (see META_VALUES). Unknown values are dropped. */
  function setMeta(meta = {}) {
    if (!tl || tl.done) return;
    Object.assign(tl.meta, pickMeta(meta));
  }

  /** reneg / reconnects counters. */
  function count(name) {
    if (!tl || tl.done || !(name in tl.counts)) return;
    tl.counts[name] += 1;
  }

  function finish(reason = "done") {
    if (!tl || tl.done) return;
    tl.done = true;
    stopPoll();
    const m = tl.marks;
    // The answer moment: when the callee sent it / the caller received it.
    const answerAt = tl.direction === "incoming" ? m.answerSent : m.answerRecv;
    const audioAt = m.heard ?? m.in ?? null;
    const summary = {
      kind: "dm",
      direction: tl.direction,
      callType: tl.callType,
      result: reason,
      ...tl.meta,
      ...m,
      answerToAudioMs: answerAt != null && audioAt != null ? audioAt - answerAt : null,
      mediaVerifiedMs: answerAt != null && m.mediaVerified != null ? Math.max(0, m.mediaVerified - answerAt) : null,
      reneg: tl.counts.reneg,
      reconnects: tl.counts.reconnects,
      pair: tl.pair,
      ...context(),
    };
    try {
      log("[CallSetup]", JSON.stringify(summary));
    } catch {
      /* ignore */
    }
    try {
      onSummary(summary);
    } catch {
      /* ignore */
    }
    const slow = reason !== "done" || (summary.answerToAudioMs != null && summary.answerToAudioMs > SLOW_MS);
    if (slow && reason !== "ended") {
      try {
        report("dm_call_setup_slow", { area: "call_setup", ...summary });
      } catch {
        /* ignore */
      }
    }
  }

  /** Watch the peer connection's stats until audio flows both ways. */
  function watch(pc) {
    if (!tl || tl.done || !pc || typeof pc.getStats !== "function" || timer != null) return;
    const startedAt = now();
    let busy = false;
    timer = setInterval(async () => {
      if (!tl || tl.done) return stopPoll();
      if (pc.connectionState === "closed") return finish("closed");
      if (pc.connectionState === "failed" || pc.iceConnectionState === "failed") {
        tl.marks.iceFailed = tl.marks.iceFailed ?? Math.round(now() - tl.t0);
      }
      if (now() - startedAt > MAX_WATCH_MS) return finish("timeout");
      if (busy) return;
      busy = true;
      try {
        const stats = await pc.getStats();
        let pairId = null;
        let sent = 0;
        let received = 0;
        stats.forEach((st) => {
          if (st.type === "transport" && st.selectedCandidatePairId) pairId = st.selectedCandidatePairId;
          if (st.type === "outbound-rtp" && st.kind === "audio") {
            sent += Number(st.packetsSent) || 0;
            if (st.packetsSent > 0) mark("out");
          }
          if (st.type === "inbound-rtp" && st.kind === "audio") {
            received += Number(st.packetsReceived) || 0;
            if (st.packetsReceived > 0) mark("in");
            if (st.totalAudioEnergy > 0 || st.audioLevel > 0) mark("heard");
          }
        });
        // Both counters rose since the first sample (not just "> 0": a stale
        // receiver/sender reports a frozen non-zero count).
        if (tl.last && sent > tl.last.sent && received > tl.last.received) mark("mediaVerified");
        if (!tl.last) tl.last = { sent, received };
        if (pairId && !tl.pair) {
          const pair = stats.get?.(pairId);
          const loc = pair && stats.get?.(pair.localCandidateId);
          const rem = pair && stats.get?.(pair.remoteCandidateId);
          if (loc || rem) tl.pair = `${loc?.candidateType || "?"}/${rem?.candidateType || "?"}`;
        }
        if (tl.marks.out != null && tl.marks.mediaVerified != null && (tl.marks.heard != null || now() - startedAt > HEARD_GRACE_MS)) {
          finish("done");
        }
      } catch {
        /* ignore */
      } finally {
        busy = false;
      }
    }, POLL_MS);
  }

  function end() {
    if (tl && !tl.done) finish("ended");
    tl = null;
    stopPoll();
  }

  return { start, mark, setMeta, count, watch, finish, end, _state: () => tl };
}
