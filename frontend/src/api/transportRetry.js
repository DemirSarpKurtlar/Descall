const RETRY_METHODS = new Set(["GET", "HEAD"]);
const TRANSIENT_STATUS = new Set([408, 502, 503, 504]);
/** Six tries, about fifteen seconds of backoff, then the caller may speak. */
const BACKOFF_MS = [400, 800, 1600, 3200, 6400];
const MAX_ATTEMPTS = BACKOFF_MS.length + 1;

export const TRANSPORT_RETRY_DELAY_MS = 600;
export const TRANSPORT_RETRY_BUDGET_MS = 15000;

/**
 * fetch() rejects with a TypeError only for transport failures ("Load failed",
 * "Failed to fetch", "NetworkError …"), a dropped or stale connection on a
 * phone, never an HTTP error status.
 */
export function isTransportError(err) {
  return err?.name === "TypeError" || /load failed|failed to fetch|networkerror/i.test(String(err?.message || ""));
}

export function isTransientHttpStatus(status) {
  return TRANSIENT_STATUS.has(Number(status));
}

function uiLang() {
  const lang =
    (typeof document !== "undefined" && document.documentElement?.lang) ||
    (typeof navigator !== "undefined" && navigator.language) ||
    "en";
  return String(lang).toLowerCase().startsWith("tr") ? "tr" : "en";
}

/** Calm copy for a blip. Callers should keep cached data and stay quiet until the budget is spent. */
export function transientFailureError(status = 0) {
  const tr = uiLang() === "tr";
  const err = new Error(
    tr
      ? "Bağlantı gecikti. Kayıtlı veriler duruyor, yeniden deniyoruz."
      : "The connection is slow. Saved data is still here. Retrying.",
  );
  err.code = "transient";
  err.status = status || 0;
  return err;
}

function delayFor(attempt, delayMs) {
  if (delayMs != null) return delayMs;
  return BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)];
}

/**
 * Retry a read while the network or a gateway (408/502/503/504) is down.
 * Writes are never repeated. The loop stays silent for about 15 seconds.
 */
export async function withReadRetry(send, { method = "GET", signal, delayMs, budgetMs = TRANSPORT_RETRY_BUDGET_MS } = {}) {
  const retryable = RETRY_METHODS.has(String(method || "GET").toUpperCase());
  const started = Date.now();
  let attempt = 0;
  while (true) {
    let result;
    try {
      result = await send();
    } catch (err) {
      if (!retryable || signal?.aborted || !isTransportError(err)) throw err;
      if (attempt >= MAX_ATTEMPTS - 1 || Date.now() - started >= budgetMs) throw err;
      await new Promise((resolve) => setTimeout(resolve, delayFor(attempt, delayMs)));
      if (signal?.aborted) throw err;
      attempt += 1;
      continue;
    }
    if (retryable && result && isTransientHttpStatus(result.status) && !signal?.aborted) {
      if (attempt >= MAX_ATTEMPTS - 1 || Date.now() - started >= budgetMs) return result;
      await new Promise((resolve) => setTimeout(resolve, delayFor(attempt, delayMs)));
      if (signal?.aborted) return result;
      attempt += 1;
      continue;
    }
    return result;
  }
}
