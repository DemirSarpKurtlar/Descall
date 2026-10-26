/**
 * 3.0.0 (C2): "connected" is not "talking". A DM call shows "Bağlanıyor…"
 * until audio really flows BOTH ways, verified from getStats(): the audio
 * outbound-rtp packetsSent and the audio inbound-rtp packetsReceived must both
 * rise above their first sample. ICE "connected" with a dead sender or a dead
 * receiver (the classic "ses karşıya gitmiyor") stays in "connecting".
 *
 *  - recoverAtMs (6 s) without both directions: one automatic recovery
 *    (onRecover: ICE restart + mic refresh) and a toast.
 *  - retryAtMs (15 s): state "retry", the UI offers "Yeniden dene".
 *  - onSending(bool): our own outbound audio flows (peer shows
 *    "Karşı tarafın mikrofonu bağlanıyor…" until it does).
 *
 * Pure: no React, no DOM; timers and the clock are injectable.
 */

export const MEDIA_FLOW_POLL_MS = 250;
export const MEDIA_FLOW_RECOVER_MS = 6_000;
export const MEDIA_FLOW_RETRY_MS = 15_000;

export function sumAudioCounters(report) {
  let sent = 0;
  let received = 0;
  let hasOut = false;
  let hasIn = false;
  report?.forEach?.((st) => {
    const kind = st?.kind || st?.mediaType;
    if (kind !== "audio") return;
    if (st.type === "outbound-rtp") {
      hasOut = true;
      sent += Number(st.packetsSent || 0);
    } else if (st.type === "inbound-rtp") {
      hasIn = true;
      received += Number(st.packetsReceived || 0);
    }
  });
  return { sent, received, hasOut, hasIn };
}

export function createMediaFlowGate({
  getPc,
  onState = () => {},
  onSending = () => {},
  onRecover = () => {},
  now = () => Date.now(),
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (id) => clearTimeout(id),
  pollMs = MEDIA_FLOW_POLL_MS,
  recoverAtMs = MEDIA_FLOW_RECOVER_MS,
  retryAtMs = MEDIA_FLOW_RETRY_MS,
} = {}) {
  let state = "idle"; // idle | connecting | verified | retry
  let timer = null;
  let startedAt = 0;
  let base = null;
  let sending = false;
  let recovered = false;
  let gen = 0;

  function setState(next) {
    if (state === next) return;
    state = next;
    onState(next);
  }

  function setSending(next) {
    if (sending === next) return;
    sending = next;
    onSending(next);
  }

  function stopTimer() {
    if (timer != null) clearTimer(timer);
    timer = null;
  }

  async function sampleOnce() {
    const pc = getPc?.();
    if (!pc || typeof pc.getStats !== "function" || pc.connectionState === "closed") return null;
    let report;
    try {
      report = await pc.getStats();
    } catch {
      return null;
    }
    const counters = sumAudioCounters(report);
    if (!base) {
      base = counters;
      return { out: false, in: false };
    }
    // A call without any outbound audio stream (no mic sender at all) can't
    // prove the outbound side; only the inbound side gates it then.
    const out = counters.hasOut ? counters.sent > base.sent : true;
    const inbound = counters.hasIn && counters.received > base.received;
    return { out, in: inbound };
  }

  function schedule(myGen) {
    timer = setTimer(async () => {
      timer = null;
      if (myGen !== gen || (state !== "connecting" && state !== "retry")) return;
      const res = await sampleOnce();
      if (myGen !== gen) return;
      if (res?.out) setSending(true);
      if (res?.out && res?.in) {
        setState("verified");
        return;
      }
      const elapsed = now() - startedAt;
      if (!recovered && elapsed >= recoverAtMs) {
        recovered = true;
        try {
          onRecover({ elapsedMs: elapsed, out: Boolean(res?.out), in: Boolean(res?.in) });
        } catch {
          /* recovery is best effort */
        }
      }
      if (state === "connecting" && elapsed >= retryAtMs) setState("retry");
      schedule(myGen);
    }, pollMs);
  }

  /** Start (or restart after a reconnect) the verification for the current pc. */
  function start({ resetRecovery = true } = {}) {
    gen += 1;
    stopTimer();
    startedAt = now();
    base = null;
    if (resetRecovery) recovered = false;
    setSending(false);
    setState("connecting");
    schedule(gen);
  }

  /** User tapped "Yeniden dene": run the recovery again and restart the clock. */
  function retry() {
    recovered = true;
    try {
      onRecover({ manual: true });
    } catch {
      /* best effort */
    }
    start({ resetRecovery: false });
  }

  function stop() {
    gen += 1;
    stopTimer();
    base = null;
    setSending(false);
    setState("idle");
  }

  return {
    start,
    retry,
    stop,
    sampleOnce,
    get state() {
      return state;
    },
    get sending() {
      return sending;
    },
    get recovered() {
      return recovered;
    },
  };
}
