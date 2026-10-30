import { API_BASE_URL } from "../config/api";
import { deviceHeaders } from "../lib/deviceId";
import { isTransientHttpStatus, isTransportError, transientFailureError, withReadRetry } from "./transportRetry";

function httpLocaleMessage(tr, en) {
  const lang =
    (typeof document !== "undefined" && document.documentElement?.lang) ||
    (typeof navigator !== "undefined" && navigator.language) ||
    "en";
  return String(lang).toLowerCase().startsWith("tr") ? tr : en;
}

export async function httpRequest(path, options = {}) {
  // Empty string is valid: browser SPA same-origin via Vercel → Render rewrite.
  if (API_BASE_URL == null) {
    throw new Error(
      httpLocaleMessage(
        "API URL yapılandırılmamış. Lütfen yöneticinize başvurun.",
        "API URL is not configured. Please contact support.",
      ),
    );
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
        error: httpLocaleMessage("Sunucudan geçersiz yanıt alındı", "The server returned an invalid response"),
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
    throw new Error(
      networkError.message || httpLocaleMessage("Bağlantı hatası", "Connection error"),
    );
  }
}
