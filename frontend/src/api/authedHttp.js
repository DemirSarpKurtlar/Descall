import { API_BASE_URL } from "../config/api";
import { getToken } from "../lib/storage";
import { isTransientHttpStatus, transientFailureError, withReadRetry } from "./transportRetry";
import { isAdminApiPath, runWithStepUp } from "../lib/adminStepUp";

/** Authenticated JSON request helper, shared by the security/blocking/shop API modules. */
export async function authedRequest(path, opts = {}) {
  // Admin API (shop gifts, DesCoin grants...): fresh-code step-up like adminFetch (3.2.0).
  if (isAdminApiPath(path)) return runWithStepUp((extra) => authedRequestOnce(path, opts, extra));
  return authedRequestOnce(path, opts, {});
}

async function authedRequestOnce(path, { method = "GET", body, signal } = {}, extraHeaders = {}) {
  const token = getToken();
  const send = () =>
    fetch(`${API_BASE_URL}${path}`, {
      method,
      cache: "no-store",
      signal,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...extraHeaders,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  const res = await withReadRetry(send, { method, signal });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (isTransientHttpStatus(res.status)) throw transientFailureError(res.status);
    const err = new Error(data?.error || data?.message || `Request failed (${res.status})`);
    err.status = res.status;
    if (data?.code) err.code = data.code;
    if (data?.action) err.action = data.action;
    if (data && typeof data.balance === "number") err.balance = data.balance;
    throw err;
  }
  return data;
}
