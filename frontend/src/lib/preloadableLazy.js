import { createElement, lazy } from "react";

/**
 * React.lazy that stops suspending once its chunk is in.
 *
 * A plain lazy() calls its own import() on its first render, even when the
 * same chunk was preloaded long before, and a native promise never resolves
 * synchronously. So that first render always suspends: the Suspense fallback
 * is committed and painted, and the real panel only lands after a retry
 * render. For a panel that replaces another one (the Activity list in the
 * sidebar column) that meant the frosted panel went missing and the dark
 * window background showed through, a dark flash on the first open.
 *
 * Here the loaded module is kept; once it is in, the component renders it
 * directly (no lazy, no suspension). `preload()` loads it ahead of time and
 * is safe to call any number of times.
 */
export function preloadableLazy(load) {
  let mod = null;
  let pending = null;
  const preload = () => {
    if (mod) return Promise.resolve(mod);
    if (!pending) {
      pending = Promise.resolve()
        .then(load)
        .then(
          (m) => {
            mod = m;
            return m;
          },
          (err) => {
            // Let a later render or preload try again (offline, chunk 404).
            pending = null;
            throw err;
          }
        );
    }
    return pending;
  };
  const Lazy = lazy(preload);
  function PreloadableLazy(props) {
    return createElement(mod ? mod.default : Lazy, props);
  }
  PreloadableLazy.preload = preload;
  PreloadableLazy.isLoaded = () => Boolean(mod);
  return PreloadableLazy;
}
