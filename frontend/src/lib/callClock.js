/**
 * Call duration clock.
 *
 * useCall / useGroupCall keep only a stable `durationStartedAt` (and, for a
 * DM call that is ending, `durationStoppedAt`). Nothing in their state
 * changes once a second, so App and the chat below it do not re-render while
 * a call runs. The few components that show a duration subscribe here
 * (hooks/useCallTimer.js) and re-render on their own.
 *
 * One ticker per start time, shared by every subscriber of that call, fires
 * on the call's own second boundaries (startedAt + k * 1000 ms), the same
 * moments the old per-hook setInterval counted at. It stops when the last
 * subscriber leaves.
 */

/** Whole seconds between startedAt and stoppedAt (or now). 0 without a start. */
export function elapsedSeconds(startedAt, stoppedAt = null, now = Date.now()) {
  if (!startedAt) return 0;
  const end = stoppedAt || now;
  return Math.max(0, Math.floor((end - startedAt) / 1000));
}

/** "m:ss" as the call screens show it; "" for 0 (the timer is hidden then). */
export function formatCallTimer(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  if (!s) return "";
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
}

const tickers = new Map();

function scheduleTick(startedAt, ticker) {
  const now = Date.now();
  const intoSecond = (now - startedAt) % 1000;
  const delay = intoSecond < 0 ? 1000 : 1000 - intoSecond;
  ticker.timer = setTimeout(() => {
    ticker.timer = null;
    if (tickers.get(startedAt) !== ticker) return;
    const next = elapsedSeconds(startedAt);
    const changed = next !== ticker.seconds;
    ticker.seconds = next;
    scheduleTick(startedAt, ticker);
    if (changed) ticker.listeners.forEach((fn) => fn());
  }, delay);
}

/** Subscribe to a call's second ticks. Returns the unsubscribe function. */
export function subscribeCallClock(startedAt, listener) {
  if (!startedAt || typeof listener !== "function") return () => {};
  let ticker = tickers.get(startedAt);
  if (!ticker) {
    ticker = { listeners: new Set(), seconds: elapsedSeconds(startedAt), timer: null };
    tickers.set(startedAt, ticker);
    scheduleTick(startedAt, ticker);
  }
  ticker.listeners.add(listener);
  return () => {
    ticker.listeners.delete(listener);
    if (ticker.listeners.size || tickers.get(startedAt) !== ticker) return;
    if (ticker.timer) clearTimeout(ticker.timer);
    ticker.timer = null;
    tickers.delete(startedAt);
  };
}

/** Current whole seconds of a running call, as its shared ticker last saw them. */
export function readCallClock(startedAt, stoppedAt = null) {
  if (!startedAt) return 0;
  if (stoppedAt) return elapsedSeconds(startedAt, stoppedAt);
  const ticker = tickers.get(startedAt);
  return ticker ? ticker.seconds : elapsedSeconds(startedAt);
}

/** Test hook: number of live tickers. */
export function activeCallClockCount() {
  return tickers.size;
}
