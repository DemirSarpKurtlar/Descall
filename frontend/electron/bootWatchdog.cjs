'use strict';

/**
 * Main-process boot watchdog (2.11.5). Pure decisions, wired up in main.cjs:
 *  - the splash window's own loadFile is raced against SPLASH_LOAD_TIMEOUT_MS,
 *    so the prelaunch update gate always runs;
 *  - the main window load is retried with backoff on did-fail-load (main frame
 *    only, ERR_ABORTED ignored), then a native "Tekrar dene / Çıkış" dialog;
 *  - a renderer crash during boot reloads (bounded);
 *  - if ready-to-show never fires the splash is closed and the window shown
 *    anyway, so the renderer's own error state ("Tekrar dene") is reachable.
 * Test: node electron/bootWatchdog.selftest.mjs
 */

const SPLASH_LOAD_TIMEOUT_MS = 5000;
const READY_FALLBACK_MS = 15000;
const LOAD_RETRY_DELAYS_MS = [1000, 3000, 8000];
const MAX_BOOT_CRASH_RELOADS = 2;
const ERR_ABORTED = -3;

function shouldRetryLoad({ errorCode, isMainFrame }) {
  if (isMainFrame === false) return false;
  if (errorCode === ERR_ABORTED) return false; // superseded navigation, not a failure
  return true;
}

/** Delay before the next load attempt, or null when it is time to ask the user. */
function nextLoadRetryDelay(failures) {
  const i = Math.max(0, Number(failures) || 0);
  return i < LOAD_RETRY_DELAYS_MS.length ? LOAD_RETRY_DELAYS_MS[i] : null;
}

function shouldReloadAfterCrash({ booted, crashReloads, reason }) {
  if (booted) return false; // later crashes keep the existing behavior
  if (reason === 'clean-exit' || reason === 'killed') return false;
  return (Number(crashReloads) || 0) < MAX_BOOT_CRASH_RELOADS;
}

/** Resolve with the original promise, or with { timedOut: true } after ms. */
function raceWithTimeout(promise, ms, setTimer = setTimeout, clearTimer = clearTimeout) {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimer(() => {
      if (settled) return;
      settled = true;
      resolve({ timedOut: true });
    }, ms);
    Promise.resolve(promise).then(
      (value) => { if (!settled) { settled = true; clearTimer(timer); resolve({ timedOut: false, value }); } },
      (error) => { if (!settled) { settled = true; clearTimer(timer); resolve({ timedOut: false, error }); } },
    );
  });
}

/** Storage a boot retry clears. Never localStorage / IndexedDB / cookies (the session lives there). */
const BOOT_RETRY_STORAGES = ['serviceworkers', 'cachestorage'];

module.exports = {
  SPLASH_LOAD_TIMEOUT_MS,
  READY_FALLBACK_MS,
  LOAD_RETRY_DELAYS_MS,
  MAX_BOOT_CRASH_RELOADS,
  BOOT_RETRY_STORAGES,
  shouldRetryLoad,
  nextLoadRetryDelay,
  shouldReloadAfterCrash,
  raceWithTimeout,
};
