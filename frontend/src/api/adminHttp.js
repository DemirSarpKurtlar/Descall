import { API_BASE_URL } from "../config/api";
import { getToken } from "../lib/storage";
import { isRetryableAdminError, sleep } from "./adminHttpRetry";

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

  let res;
  try {
    res = await fetch(url, { ...options, headers });
  } catch (err) {
    const msg = String(err?.message || "");
    if (/failed to fetch|networkerror|load failed/i.test(msg)) {
      const wrapped = new Error("Admin API unreachable. Check connection and try again.");
      wrapped.status = 0;
      throw wrapped;
    }
    throw err;
  }

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw makeHttpError(res.status, body);
  }
  return body;
}

export async function adminFetch(path, options = {}) {
  const method = String(options.method || "GET").toUpperCase();
  const retries = method === "GET" || method === "HEAD" ? 1 : 0;
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await adminFetchOnce(path, options);
    } catch (err) {
      lastErr = err;
      if (attempt >= retries || !isRetryableAdminError(err)) throw err;
      await sleep(800);
    }
  }
  throw lastErr;
}

export { isRetryableAdminError, isTransientAdminStatus } from "./adminHttpRetry";
