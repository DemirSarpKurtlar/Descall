const RETRY_METHODS = new Set(["GET", "HEAD"]);
export const TRANSPORT_RETRY_DELAY_MS = 600;

/**
 * fetch() rejects with a TypeError only for transport failures ("Load failed",
 * "Failed to fetch", "NetworkError …") — a dropped or stale connection on a
 * phone, never an HTTP error status.
 */
export function isTransportError(err) {
  return err?.name === "TypeError";
}

/**
 * Run `send()` (a fetch) and retry it once after a transport failure — reads
 * only, so a purchase or claim is never submitted twice. iOS WKWebView reports
 * a reused dead connection as "Load failed (host)"; the retry opens a new one.
 */
export async function withReadRetry(send, { method = "GET", signal, delayMs = TRANSPORT_RETRY_DELAY_MS } = {}) {
  try {
    return await send();
  } catch (err) {
    if (!RETRY_METHODS.has(String(method).toUpperCase()) || signal?.aborted || !isTransportError(err)) throw err;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    if (signal?.aborted) throw err;
    return send();
  }
}
