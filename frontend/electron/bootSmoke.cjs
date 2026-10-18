'use strict';

/**
 * Packaged boot smoke (2.11.11): `Descall.exe --descall-smoke-boot` (or DESCALL_SMOKE=boot)
 * opens the real main window from the packaged app.asar, waits for the app to paint and
 * exits 0 only when the boot splash is gone, index.html's inline boot scripts ran (their
 * CSP hashes matched) and no inline script was blocked. Release CI runs it on the Windows
 * build, so a CRLF / hash mismatch can never ship again.
 */

const BOOT_SMOKE_TIMEOUT_MS = 45000;
const BOOT_SMOKE_POLL_MS = 500;
const BOOT_SMOKE_SETTLE_MS = 3000;

/** In-page probe, run with webContents.executeJavaScript (not bound by the page CSP). */
const BOOT_SMOKE_PROBE = `(() => {
  const r = document.getElementById('root');
  const text = r ? (r.innerText || '').replace(/\\s+/g, ' ').trim() : '';
  return {
    splashes: document.querySelectorAll('#boot-splash').length,
    inlineRan: typeof window.__descallReportBoot === 'function' && typeof window.__descallDismissBootSplash === 'function',
    rootPainted: !!(r && r.firstElementChild && r.getBoundingClientRect().height >= 80 && text.length > 0),
    rootText: text.slice(0, 80),
    path: location.pathname,
  };
})()`;

function isInlineCspViolation(message) {
  return /Content Security Policy/i.test(String(message || '')) && /inline script/i.test(String(message || ''));
}

/**
 * sample: probe result (or null), cspInlineBlocked: count, elapsedMs.
 * Returns { done, ok, reason }.
 */
function evaluateBootSmoke({ sample, cspInlineBlocked = 0, appMounted = false, elapsedMs = 0, timeoutMs = BOOT_SMOKE_TIMEOUT_MS, settleMs = BOOT_SMOKE_SETTLE_MS }) {
  if (cspInlineBlocked > 0) return { done: true, ok: false, reason: `${cspInlineBlocked} inline script(s) blocked by CSP` };
  // React must have mounted (boot-state app-mounted) and the page must have had a moment
  // to report CSP violations before a pass counts.
  if (appMounted && elapsedMs >= settleMs && sample && sample.rootPainted && sample.splashes === 0) {
    if (!sample.inlineRan) return { done: true, ok: false, reason: 'index.html inline boot scripts did not run' };
    return { done: true, ok: true, reason: 'painted, splash removed' };
  }
  if (elapsedMs >= timeoutMs) {
    const why = !sample ? 'no renderer probe' : sample.splashes ? 'boot splash still on screen' : !appMounted ? 'React never reported app-mounted' : 'app never painted';
    return { done: true, ok: false, reason: `${why} after ${elapsedMs}ms` };
  }
  return { done: false, ok: false, reason: '' };
}

module.exports = { BOOT_SMOKE_TIMEOUT_MS, BOOT_SMOKE_POLL_MS, BOOT_SMOKE_SETTLE_MS, BOOT_SMOKE_PROBE, isInlineCspViolation, evaluateBootSmoke };
