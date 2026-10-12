/**
 * Run dynamic imports after first paint. `onReady` fires once every loader
 * has settled (failures included) so callers can mount the chunk.
 */
export function preloadWhenIdle(loaders, onReady) {
  let cancelled = false;
  const run = () => {
    Promise.all((loaders || []).map((load) => Promise.resolve().then(load).catch(() => null))).then(() => {
      if (!cancelled) onReady?.();
    });
  };
  if (typeof window === "undefined") {
    run();
    return () => {
      cancelled = true;
    };
  }
  let cancelTimer = () => {};
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(run, { timeout: 2500 });
    cancelTimer = () => window.cancelIdleCallback(id);
  } else {
    const id = window.setTimeout(run, 1200);
    cancelTimer = () => window.clearTimeout(id);
  }
  return () => {
    cancelled = true;
    cancelTimer();
  };
}
