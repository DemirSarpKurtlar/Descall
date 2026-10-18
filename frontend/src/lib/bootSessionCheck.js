/**
 * Boot session check (2.11.5). The cold-start GET /auth/me used to run with no
 * timeout. A request that never answers (Render cold start, a stalled socket,
 * the API waiting on the EU database) kept the app on the boot skeleton forever
 * with no way out. Every attempt is now capped, retried with backoff, and the
 * caller gets one of three outcomes:
 *   ok      -> user
 *   auth    -> the token is rejected (401/403), sign out
 *   network -> nothing answered in time; show the boot error with "Tekrar dene"
 * Pure: fetchMe, sleep and the timer are injected (test: bootSessionCheck.selftest.mjs).
 */

export const BOOT_ME_TIMEOUT_MS = 8_000;
export const BOOT_ME_BACKOFF_MS = [700, 2_000];

export function isBootAuthFailure(err) {
  const status = err?.status || err?.causeStatus || err?.response?.status;
  if (status === 401 || status === 403) return true;
  if (status) return false;
  return /unauthorized|invalid token|jwt/i.test(String(err?.message || ""));
}

function timeoutError(ms) {
  const err = new Error(`boot-session-timeout after ${ms}ms`);
  err.code = "boot-timeout";
  return err;
}

/** Run one call with an AbortSignal and a hard deadline, even if the call ignores abort. */
export function withDeadline(run, ms, { setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  return new Promise((resolve, reject) => {
    let done = false;
    const timer = setTimer(() => {
      if (done) return;
      done = true;
      try { controller?.abort(); } catch { /* ignore */ }
      reject(timeoutError(ms));
    }, ms);
    Promise.resolve()
      .then(() => run(controller?.signal))
      .then(
        (value) => {
          if (done) return;
          done = true;
          clearTimer(timer);
          resolve(value);
        },
        (err) => {
          if (done) return;
          done = true;
          clearTimer(timer);
          reject(err);
        },
      );
  });
}

export async function checkBootSession({
  token,
  fetchMe,
  timeoutMs = BOOT_ME_TIMEOUT_MS,
  backoffMs = BOOT_ME_BACKOFF_MS,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  setTimer,
  clearTimer,
  isCancelled = () => false,
  onAttempt,
} = {}) {
  if (!token) return { status: "auth", reason: "no-token" };
  const attempts = backoffMs.length + 1;
  let lastError = null;
  for (let i = 0; i < attempts; i += 1) {
    if (isCancelled()) return { status: "cancelled" };
    onAttempt?.(i + 1, attempts);
    try {
      const body = await withDeadline((signal) => fetchMe(token, { signal }), timeoutMs, { setTimer, clearTimer });
      if (body?.user) return { status: "ok", user: body.user, attempts: i + 1 };
      lastError = new Error("boot-session-empty");
    } catch (err) {
      if (isBootAuthFailure(err)) return { status: "auth", error: err, attempts: i + 1 };
      lastError = err;
    }
    if (i < attempts - 1) await sleep(backoffMs[i]);
  }
  return { status: "network", error: lastError, attempts };
}
