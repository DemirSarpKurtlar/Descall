"use strict";

/**
 * Per-key in-process lock for "count → insert → re-count" cap checks
 * (owned servers, folders, roles, channels).
 *
 * Without it, parallel creates could all pass the pre-count, and the post-insert
 * re-count could keep a row that raced in with an earlier created_at than one
 * another request had already kept, ending at cap + 1 (audit round 5 #9 flake: 11 vs 10).
 * Holding the lock makes same-instance creates for one key strictly sequential, so the
 * pre-count is exact. insertedOverCap() stays as the cross-instance backstop.
 *
 * The lock auto-releases after `timeoutMs` so a stalled DB call can never wedge a key.
 */
const tails = new Map();

function acquireCapLock(key, { timeoutMs = 15_000 } = {}) {
  const prev = tails.get(key) || Promise.resolve();
  let unlock;
  const mine = new Promise((resolve) => { unlock = resolve; });
  const tail = prev.then(() => mine);
  tails.set(key, tail);
  return prev.then(() => {
    let done = false;
    const release = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      unlock();
      if (tails.get(key) === tail) tails.delete(key);
    };
    // Not unref()d: a forgotten release must still fire; a normal release clears it.
    const timer = setTimeout(release, timeoutMs);
    return release;
  });
}

function capLockSize() {
  return tails.size;
}

module.exports = { acquireCapLock, capLockSize };
