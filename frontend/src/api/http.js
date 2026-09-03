import { API_BASE_URL } from "../config/api";

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

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });

    let body = {};
    try {
      body = await response.json();
    } catch (parseError) {
      body = {
        error: httpLocaleMessage("Sunucudan geçersiz yanıt alındı", "The server returned an invalid response"),
      };
    }

    if (!response.ok) {
      const err = new Error(body.error || body.message || `HTTP ${response.status}`);
      err.status = response.status;
      err.code = body.code || null;
      err.ban = body.ban || null;
      err.body = body;
      throw err;
    }

    return body;
  } catch (networkError) {
    if (networkError?.code || networkError?.ban || networkError?.status) {
      throw networkError;
    }
    if (networkError.message?.includes("Failed to fetch") || networkError.message?.includes("NetworkError")) {
      throw new Error(
        httpLocaleMessage(
          "Sunucuya bağlanılamıyor. İnternet bağlantınızı kontrol edin.",
          "Could not reach the server. Check your internet connection.",
        ),
      );
    }
    throw new Error(
      networkError.message || httpLocaleMessage("Bağlantı hatası", "Connection error"),
    );
  }
}
