import { apiBase, failoverOnTransportError } from "../lib/nodeRouting";
import { deviceHeaders } from "../lib/deviceId";
import { t } from "../i18n/runtime.js";
import { serverMessage } from "../i18n/serverText.js";
import { isTransientHttpStatus, isTransportError, transientFailureError, withReadRetry } from "./transportRetry";

export async function httpRequest(path, options = {}) {
  // Empty string is valid: browser SPA same-origin via Vercel → Render rewrite.
  if (apiBase() == null) {
    throw new Error(t("core.http.apiNotConfigured"));
  }

  const method = options.method || "GET";

  try {
    // The base is read per try: a failed try on the PC node moves the next one to Render.
    const response = await withReadRetry(
      () => fetch(`${apiBase()}${path}`, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          ...deviceHeaders(),
          ...(options.headers || {}),
        },
      }).catch(failoverOnTransportError),
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
      const err = new Error(serverMessage(body, "error") || serverMessage(body, "message") || `HTTP ${response.status}`);
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
