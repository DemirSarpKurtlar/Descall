/**
 * Live values a panel knows but its preview cannot read from the feature settings
 * (open pop-outs, saved layouts, the dock spot of the mini card, the current voice
 * profile ...). A panel publishes, the preview of the same card subscribes. Values live
 * for the page session only; previews fall back to an illustration without them.
 */
import { useEffect, useSyncExternalStore } from "react";

const values = new Map();
const listeners = new Set();

export function publish(key, value) {
  if (values.get(key) === value) return;
  values.set(key, value);
  for (const fn of [...listeners]) fn();
}

function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useStoryValue(key, fallback) {
  const v = useSyncExternalStore(subscribe, () => values.get(key), () => undefined);
  return v === undefined ? fallback : v;
}

/** Publish `value` under `key` whenever it changes (call from a panel). */
export function usePublish(key, value) {
  useEffect(() => { publish(key, value); }, [key, value]);
}
