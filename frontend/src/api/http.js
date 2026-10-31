import { API_BASE_URL } from "../config/api";
import { deviceHeaders } from "../lib/deviceId";
import { t } from "../i18n/runtime.js";
import { isTransientHttpStatus, isTransportError, transientFailureError, withReadRetry } from "./transportRetry";

export async function httpRequest(path, options = {}) {
  // Empty string is valid: browser SPA same-origin via Vercel → Render rewrite.
  if (API_BASE_URL == null) {
    throw new Error(t("core.http.apiNotConfigured"));
  }

  const url = `${API_BASE_URL}${path}`;
  const method = options.method || "GET";

  try {
    const response = await withReadRetry(
      () => fetch(url, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          ...deviceHeaders(),
          ...(options.headers || {}),
        },
      }),
      { method, signal: options.signal },
    );

    let body = {};
    try {
      body = await response.json();
    } catch (parseError) {
      body = {
        error: t("core.http.invalidResponse"),
      };
    }

    if (!response.ok) {
      if (isTransientHttpStatus(response.status)) throw transientFailureError(response.status);
      const err = new Error(body.error || body.message || `HTTP ${response.status}`);
      err.status = response.status;
      err.code = body.code || null;
      err.ban = body.ban || null;
      err.body = body;
      throw err;
    }

    return body;
  } catch (networkError) {
    if (networkError?.code === "transient") throw networkError;
    if (networkError?.ban) throw networkError;
    if (isTransportError(networkError)) throw transientFailureError(0);
    if (networkError?.status && !isTransientHttpStatus(networkError.status)) throw networkError;
    if (isTransientHttpStatus(networkError?.status)) throw transientFailureError(networkError.status);
    throw new Error(networkError.message || t("core.http.connectionError"));
  }
}
