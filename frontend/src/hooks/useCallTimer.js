import { useCallback, useSyncExternalStore } from "react";
import { formatCallTimer, readCallClock, subscribeCallClock } from "../lib/callClock";

const noopSubscribe = () => () => {};

/**
 * Whole seconds a call has run. Only the component that calls this
 * re-renders on each second; a stopped call (stoppedAt set) does not tick.
 */
export function useElapsedSeconds(startedAt, stoppedAt = null) {
  const live = Boolean(startedAt) && !stoppedAt;
  const subscribe = useCallback(
    (listener) => subscribeCallClock(startedAt, listener),
    [startedAt],
  );
  const getSnapshot = () => readCallClock(startedAt, stoppedAt);
  return useSyncExternalStore(live ? subscribe : noopSubscribe, getSnapshot, getSnapshot);
}

/** The call timer as the call screens show it ("m:ss", "" before the first second). */
export function useCallTimer(startedAt, stoppedAt = null) {
  return formatCallTimer(useElapsedSeconds(startedAt, stoppedAt));
}

export default useCallTimer;
