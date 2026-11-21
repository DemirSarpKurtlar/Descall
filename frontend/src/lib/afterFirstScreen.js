/**
 * Run non-critical boot work (preloads, SDKs) only once the first useful screen
 * is up: the HTML boot splash (#boot-splash) is gone, then the next idle period.
 *
 * Cold start on a mid-range Android WebView is CPU bound: every warm-up fetch,
 * WASM compile or SDK parse that runs while the App chunk evaluates and the
 * first screen renders pushes that screen back. Nothing here is needed for it.
 *
 * Dependency-free (main.jsx entry chunk and lib/sentry.js use it).
 */

const POLL_MS = 250;

function idle(win, run, timeout) {
  if (typeof win.requestIdleCallback === "function") win.requestIdleCallback(() => run(), { timeout });
  else win.setTimeout(run, 200);
}

function splashUp(doc) {
  try {
    return Boolean(doc.getElementById("boot-splash"));
  } catch {
    return false;
  }
}

/**
 * @param {() => void} run
 * @param {{ maxWaitMs?: number, idleTimeoutMs?: number, win?: Window, doc?: Document }} [opts]
 *   maxWaitMs: stop waiting for the splash after this long (a stuck splash must not
 *   starve the work for ever); idleTimeoutMs: requestIdleCallback timeout.
 */
export function afterFirstScreen(run, { maxWaitMs = 10000, idleTimeoutMs = 2000, win, doc } = {}) {
  const w = win || (typeof window !== "undefined" ? window : null);
  const d = doc || (typeof document !== "undefined" ? document : null);
  let done = false;
  const fire = () => {
    if (done) return;
    done = true;
    try {
      run();
    } catch {
      /* best effort */
    }
  };
  if (!w || !d) {
    fire();
    return;
  }
  const started = Date.now();
  const check = () => {
    if (!splashUp(d) || Date.now() - started >= maxWaitMs) idle(w, fire, idleTimeoutMs);
    else w.setTimeout(check, POLL_MS);
  };
  check();
}
