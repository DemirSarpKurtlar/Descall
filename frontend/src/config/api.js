// API URL configuration
// Priority: Electron → Render production; localhost → local backend;
// else env > window override > production Render fallback
//
// Hybrid hosting: the Vite SPA is served from Vercel (descall.com).
// Express + Socket.IO run on Render (https://des-call.onrender.com).
// Browser on descall.com / www.descall.com MUST use the Render origin
// (not same-origin /api on Vercel).
const PRODUCTION_URL = "https://des-call.onrender.com";
// Retired hosts that must never be used (old and suspended Render services)
const DEAD_API_HOSTS = ["descall-qzkg.onrender.com", "descall-nru2.onrender.com"];
// SPA / marketing hosts — the page origin is not the API origin.
const SPA_HOSTS = ["descall.com", "www.descall.com", "descall.vercel.app"];

function isDeadApiUrl(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return DEAD_API_HOSTS.some((dead) => host === dead || host.endsWith(`.${dead}`));
  } catch {
    return false;
  }
}

function isSpaHostUrl(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return SPA_HOSTS.some((spa) => host === spa || host.endsWith(`.${spa}`));
  } catch {
    return false;
  }
}

function isUsableApiUrl(url) {
  return Boolean(url) && !isDeadApiUrl(url) && !isSpaHostUrl(url);
}

function isElectronRuntime() {
  if (typeof window === "undefined") return false;
  if (window.electronAPI?.isElectron) return true;
  // Fallback before/without preload bridge
  if (typeof navigator !== "undefined" && /Electron/i.test(navigator.userAgent || "")) {
    return true;
  }
  return false;
}

/** True when the page is served from a Descall SPA / Vercel preview host. */
function isBrowserSpaHost() {
  if (typeof window === "undefined") return false;
  const host = String(window.location.hostname || "").toLowerCase();
  if (!host) return false;
  if (SPA_HOSTS.some((spa) => host === spa || host.endsWith(`.${spa}`))) return true;
  if (host.endsWith(".vercel.app")) return true;
  return false;
}

function isLocalDevHost() {
  if (typeof window === "undefined") return false;
  const host = String(window.location.hostname || "").toLowerCase();
  return host === "localhost" || host === "127.0.0.1";
}

function envApiUrl() {
  const envUrl = typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE_URL;
  if (envUrl && envUrl.trim().length > 0) {
    const trimmed = envUrl.trim().replace(/\/$/, "");
    if (isUsableApiUrl(trimmed)) return trimmed;
  }
  return null;
}

function envRealtimeUrl() {
  const meta = typeof import.meta !== "undefined" ? import.meta.env : undefined;
  for (const key of ["VITE_SOCKET_URL", "VITE_REALTIME_URL"]) {
    const raw = meta?.[key];
    if (raw && String(raw).trim().length > 0) {
      const trimmed = String(raw).trim().replace(/\/$/, "");
      if (isUsableApiUrl(trimmed)) return trimmed;
    }
  }
  const envApi = meta?.VITE_API_BASE_URL;
  if (envApi && String(envApi).trim().length > 0) {
    const trimmed = String(envApi).trim().replace(/\/$/, "");
    if (isUsableApiUrl(trimmed)) return trimmed;
  }
  return null;
}

function resolveApiUrl() {
  // Desktop app always uses Render production — never Vercel /api.
  if (isElectronRuntime()) {
    return PRODUCTION_URL;
  }

  // Local Vite/dev: keep talking to the local Express backend.
  if (isLocalDevHost()) {
    return envApiUrl() || "http://localhost:3000";
  }

  // 1. Vite environment variable (build-time) — Vercel should set
  //    VITE_API_BASE_URL=https://des-call.onrender.com
  const fromEnv = envApiUrl();
  if (fromEnv) return fromEnv;

  // 2. Runtime override (useful for dynamic web config)
  if (typeof window !== "undefined" && window.__DESCALL_API_URL__) {
    const override = String(window.__DESCALL_API_URL__).trim().replace(/\/$/, "");
    if (isUsableApiUrl(override)) return override;
  }

  // 3. Browser on SPA hosts (and everywhere else): Render production API
  if (isBrowserSpaHost()) {
    return PRODUCTION_URL;
  }

  return PRODUCTION_URL;
}

/**
 * Socket.IO origin. Production path is https://des-call.onrender.com/socket.io
 * (backend uses /socket.io when VERCEL is unset). Never same-origin Vercel.
 */
function resolveRealtimeUrl() {
  if (isElectronRuntime()) {
    return PRODUCTION_URL;
  }

  if (isLocalDevHost()) {
    return envRealtimeUrl() || envApiUrl() || "http://localhost:3000";
  }

  const fromEnv = envRealtimeUrl();
  if (fromEnv) return fromEnv;

  if (typeof window !== "undefined" && window.__DESCALL_SOCKET_URL__) {
    const override = String(window.__DESCALL_SOCKET_URL__).trim().replace(/\/$/, "");
    if (isUsableApiUrl(override)) return override;
  }

  return PRODUCTION_URL;
}

export const API_BASE_URL = resolveApiUrl();
/** Absolute origin for Socket.IO (never same-origin empty string). */
export const SOCKET_URL = resolveRealtimeUrl();
/** Alias of SOCKET_URL for callers that prefer REALTIME_URL naming. */
export const REALTIME_URL = SOCKET_URL;

export const API_ROUTES = {
  login: "/auth/login",
  register: "/auth/register",
  google: "/auth/google",
  googleConfig: "/auth/google/config",
  me: "/auth/me",
  logout: "/auth/logout",
};
