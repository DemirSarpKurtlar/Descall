import { API_BASE_URL } from "../config/api";
import { getToken } from "../lib/storage";
import { isTransientHttpStatus, isTransportError, transientFailureError, withReadRetry } from "./transportRetry";
import { runWithStepUp } from "../lib/adminStepUp";

function makeHttpError(status, body) {
  const err = new Error(body?.error || body?.message || `HTTP ${status}`);
  err.status = status;
  if (body?.code) err.code = body.code;
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

/** Every admin call: a fresh-code prompt on STEP_UP_REQUIRED, then one retry (3.2.0). */
export async function adminFetch(path, options = {}) {
  return runWithStepUp((extra) => adminFetchOnce(path, { ...options, headers: { ...(options.headers || {}), ...extra } }));
}

/** POST /admin/step-up itself (never wrapped, or it would prompt for itself). */
export function adminStepUpRequest(code) {
  return adminFetchOnce("/step-up", { method: "POST", body: JSON.stringify({ code }) });
}

export { isRetryableAdminError, isTransientAdminStatus } from "./adminHttpRetry";
