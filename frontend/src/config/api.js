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

/**
 * Optional view for tests. Omitted fields are read from the live page.
 * @param {{ electron?: boolean, userAgent?: string, hostname?: string, apiOverride?: string, socketOverride?: string, meta?: object } | undefined} overrides
 */
function runtimeView(overrides) {
  if (overrides) {
    const userAgent = String(overrides.userAgent || "");
    return {
      electron: Boolean(overrides.electron) || /Electron/i.test(userAgent),
      hostname: String(overrides.hostname || "").toLowerCase(),
      apiOverride: String(overrides.apiOverride || "").trim(),
      socketOverride: String(overrides.socketOverride || "").trim(),
      meta: overrides.meta || {},
    };
  }
  const hostname = typeof window !== "undefined" ? String(window.location.hostname || "").toLowerCase() : "";
  return {
    electron: isElectronRuntime(),
    hostname,
    apiOverride: typeof window !== "undefined" && window.__DESCALL_API_URL__
      ? String(window.__DESCALL_API_URL__).trim()
      : "",
    socketOverride: typeof window !== "undefined" && window.__DESCALL_SOCKET_URL__
      ? String(window.__DESCALL_SOCKET_URL__).trim()
      : "",
    meta: typeof import.meta !== "undefined" && import.meta.env ? import.meta.env : {},
  };
}

function envApiUrl(meta) {
  const envUrl = meta?.VITE_API_BASE_URL;
  if (envUrl && String(envUrl).trim().length > 0) {
    const trimmed = String(envUrl).trim().replace(/\/$/, "");
    if (isUsableApiUrl(trimmed)) return trimmed;
  }
  return null;
}

function envRealtimeUrl(meta) {
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

function hostIsLocal(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

function hostIsSpa(hostname) {
  if (!hostname) return false;
  if (SPA_HOSTS.some((spa) => hostname === spa || hostname.endsWith(`.${spa}`))) return true;
  if (hostname.endsWith(".vercel.app")) return true;
  return false;
}

export function resolveApiUrl(overrides) {
  const view = runtimeView(overrides);
  // Desktop app always uses Render production — never Vercel /api.
  if (view.electron) {
    return PRODUCTION_URL;
  }

  // Local Vite/dev: keep talking to the local Express backend.
  if (hostIsLocal(view.hostname)) {
    return envApiUrl(view.meta) || "http://localhost:3000";
  }

  // 1. Vite environment variable (build-time) — Vercel should set
  //    VITE_API_BASE_URL=https://des-call.onrender.com
  const fromEnv = envApiUrl(view.meta);
  if (fromEnv) return fromEnv;

  // 2. Runtime override (useful for dynamic web config)
  if (view.apiOverride) {
    const override = view.apiOverride.replace(/\/$/, "");
    if (isUsableApiUrl(override)) return override;
  }

  // 3. Browser on SPA hosts (and everywhere else): Render production API.
  //    descall.com is the Vite host. Same-origin /api is static and answers
  //    POST with 405, so callers must not fall back to window.location.origin.
  if (hostIsSpa(view.hostname)) {
    return PRODUCTION_URL;
  }

  return PRODUCTION_URL;
}

/** Absolute URL for POST /api/errors. Never the marketing/SPA origin. */
export function clientErrorReportUrl(overrides) {
  return `${resolveApiUrl(overrides)}/api/errors`;
}

/**
 * Socket.IO origin. Production path is https://des-call.onrender.com/socket.io
 * (backend uses /socket.io when VERCEL is unset). Never same-origin Vercel.
 */
function resolveRealtimeUrl(overrides) {
  const view = runtimeView(overrides);
  if (view.electron) {
    return PRODUCTION_URL;
  }

  if (hostIsLocal(view.hostname)) {
    return envRealtimeUrl(view.meta) || envApiUrl(view.meta) || "http://localhost:3000";
  }

  const fromEnv = envRealtimeUrl(view.meta);
  if (fromEnv) return fromEnv;

  if (view.socketOverride) {
    const override = view.socketOverride.replace(/\/$/, "");
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
  apple: "/auth/apple",
  googleConfig: "/auth/google/config",
  me: "/auth/me",
  logout: "/auth/logout",
};
