"use strict";

/**
 * Share one in-flight promise per key. A second caller that arrives while the
 * first is still talking to Supabase waits on that same work instead of
 * opening another round of queries.
 */
function createSingleflight() {
  const inflight = new Map();

  function run(key, loader) {
    const existing = inflight.get(key);
    if (existing) return existing;
    const pending = Promise.resolve()
      .then(loader)
      .finally(() => {
        if (inflight.get(key) === pending) inflight.delete(key);
      });
    inflight.set(key, pending);
    return pending;
  }

  return { run, size: () => inflight.size };
}

module.exports = { createSingleflight };
