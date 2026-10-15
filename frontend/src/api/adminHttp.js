import { API_BASE_URL } from "../config/api";
import { getToken } from "../lib/storage";
import { isTransientHttpStatus, isTransportError, transientFailureError, withReadRetry } from "./transportRetry";

function makeHttpError(status, body) {
  const err = new Error(body?.error || body?.message || `HTTP ${status}`);
  err.status = status;
  return err;
}

async function adminFetchOnce(path, options = {}) {
  const token = getToken();
  const url = `${API_BASE_URL}/admin${path}`;

  const isFormData = options.body instanceof FormData;
  const headers = {
    Authorization: `Bearer ${token}`,
    ...(options.headers || {}),
  };
  if (!isFormData && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const method = String(options.method || "GET").toUpperCase();
  let res;
  try {
    res = await withReadRetry(
      () => fetch(url, { ...options, headers }),
      { method, signal: options.signal },
    );
  } catch (err) {
    if (isTransportError(err)) throw transientFailureError(0);
    throw err;
  }

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (isTransientHttpStatus(res.status)) throw transientFailureError(res.status);
    throw makeHttpError(res.status, body);
  }
  return body;
}

export async function adminFetch(path, options = {}) {
  return adminFetchOnce(path, options);
}

export { isRetryableAdminError, isTransientAdminStatus } from "./adminHttpRetry";
