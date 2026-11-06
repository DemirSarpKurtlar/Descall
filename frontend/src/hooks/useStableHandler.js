import { useCallback, useInsertionEffect, useRef } from "react";

/**
 * A function with a fixed identity that always calls the latest `fn`. For handlers
 * passed to memoized children (the message list): they skip re-rendering when the
 * parent re-renders, and a call never sees a stale closure (the ref is updated on
 * every commit, before layout effects and event handlers run).
 */
export function useStableHandler(fn) {
  const ref = useRef(fn);
  useInsertionEffect(() => {
    ref.current = fn;
  });
  return useCallback((...args) => ref.current?.(...args), []);
}
