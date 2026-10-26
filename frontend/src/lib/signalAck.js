/**
 * 3.0.0 (C3): call signaling (offer / answer / end) with a delivery ack.
 * The backend acks call:offer, call:answer, call:end, call:cancel and
 * call:decline; without an ack within `retryMs` (3 s) the same payload is
 * sent again (up to `maxTries`), so a message lost to a socket drop or a
 * backend restart still arrives. Re-sends are idempotent on both ends: a
 * repeated offer refreshes the ring, a repeated answer is ignored once the
 * caller's signaling is stable, a repeated end finds no call.
 */
export const SIGNAL_RETRY_MS = 3_000;
export const SIGNAL_MAX_TRIES = 3;

export function emitWithAck(getSocket, event, payload, {
  retryMs = SIGNAL_RETRY_MS,
  maxTries = SIGNAL_MAX_TRIES,
  shouldRetry = () => true,
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (id) => clearTimeout(id),
  onAck = () => {},
  onGiveUp = () => {},
} = {}) {
  let tries = 0;
  let acked = false;
  let cancelled = false;
  let timer = null;

  const attempt = () => {
    timer = null;
    if (acked || cancelled) return;
    if (tries > 0 && !shouldRetry()) {
      cancelled = true;
      return;
    }
    if (tries >= maxTries) {
      onGiveUp({ tries });
      return;
    }
    const sock = getSocket?.();
    if (sock?.connected) {
      tries += 1;
      try {
        sock.emit(event, payload, (res) => {
          if (acked || cancelled) return;
          if (res && res.ok === false) return; // rejected: let the retry decide
          acked = true;
          if (timer != null) clearTimer(timer);
          timer = null;
          onAck({ tries });
        });
      } catch {
        /* the next attempt retries */
      }
    }
    if (!acked && !cancelled) timer = setTimer(attempt, retryMs);
  };

  attempt();
  return {
    cancel() {
      cancelled = true;
      if (timer != null) clearTimer(timer);
      timer = null;
    },
    get acked() {
      return acked;
    },
    get tries() {
      return tries;
    },
  };
}
