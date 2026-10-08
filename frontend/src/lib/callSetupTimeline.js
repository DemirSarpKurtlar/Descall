/**
 * Per-call setup timeline for DM calls: how long from the tap (call / accept)
 * until audio actually flows. Logged once per call to the console as
 * `[CallSetup] {...}`; a non-personal Sentry diagnostic is sent only when the
 * setup was slow, so field reports carry real numbers (no names / ids).
 *
 * Marks are ms since the tap: gum (mic ready), offer / answer sent or
 * received, ice (ICE connected), out (first outbound audio packets), in (first
 * inbound audio packets), heard (remote audio energy > 0).
 */

const POLL_MS = 100;
const MAX_WATCH_MS = 20_000;
const SLOW_MS = 3_000;

export function createCallSetupTimeline({
  now = () => (typeof performance !== "undefined" ? performance.now() : Date.now()),
  report = () => {},
  log = (...a) => console.info(...a),
  context = () => ({}),
} = {}) {
  let tl = null;
  let timer = null;

  function stopPoll() {
    if (timer != null) clearInterval(timer);
    timer = null;
  }

  function start(direction, callType) {
    stopPoll();
    tl = { t0: now(), direction, callType: callType || "voice", marks: {}, done: false, pair: null };
  }

  function mark(name) {
    if (!tl || tl.done || tl.marks[name] != null) return;
    tl.marks[name] = Math.round(now() - tl.t0);
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
      direction: tl.direction,
      callType: tl.callType,
      result: reason,
      ...m,
      answerToAudioMs: answerAt != null && audioAt != null ? audioAt - answerAt : null,
      pair: tl.pair,
      ...context(),
    };
    try {
      log("[CallSetup]", JSON.stringify(summary));
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
      if (now() - startedAt > MAX_WATCH_MS) return finish("timeout");
      if (busy) return;
      busy = true;
      try {
        const stats = await pc.getStats();
        let pairId = null;
        stats.forEach((st) => {
          if (st.type === "transport" && st.selectedCandidatePairId) pairId = st.selectedCandidatePairId;
          if (st.type === "outbound-rtp" && st.kind === "audio" && st.packetsSent > 0) mark("out");
          if (st.type === "inbound-rtp" && st.kind === "audio") {
            if (st.packetsReceived > 0) mark("in");
            if (st.totalAudioEnergy > 0 || st.audioLevel > 0) mark("heard");
          }
        });
        if (pairId && !tl.pair) {
          const pair = stats.get?.(pairId);
          const loc = pair && stats.get?.(pair.localCandidateId);
          const rem = pair && stats.get?.(pair.remoteCandidateId);
          if (loc || rem) tl.pair = `${loc?.candidateType || "?"}/${rem?.candidateType || "?"}`;
        }
        if (tl.marks.out != null && tl.marks.heard != null) finish("done");
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

  return { start, mark, watch, finish, end, _state: () => tl };
}
