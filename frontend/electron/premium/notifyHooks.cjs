'use strict';

/**
 * Notification hooks for Descall+ desktop modules (main process).
 * main.cjs showAppNotification() runs every toast payload through run();
 * a running module may decorate it (quick reply) or drop it (return null).
 * Modules register on start and unregister on stop, so with no module
 * running this is a pass-through. No electron import (selftested).
 */

const filters = new Map(); // owner -> fn(payload) => payload | null
let quickReplyShow = null;

function register(owner, fn) {
  if (typeof fn === 'function') filters.set(owner, fn);
  return () => { if (filters.get(owner) === fn) filters.delete(owner); };
}

function run(payload) {
  let current = payload;
  for (const fn of filters.values()) {
    try {
      const next = fn(current);
      if (next === null) return null;
      if (next && typeof next === 'object') current = next;
    } catch (_) { /* a failing hook never blocks notifications */ }
  }
  return current;
}

function setQuickReplyHandler(fn) {
  quickReplyShow = typeof fn === 'function' ? fn : null;
}

/** true when a native reply toast was shown; false = show the capsule instead. */
function showQuickReply(opts) {
  if (!quickReplyShow) return false;
  try { return Boolean(quickReplyShow(opts)); } catch (_) { return false; }
}

module.exports = { register, run, setQuickReplyHandler, showQuickReply, _filters: filters };
