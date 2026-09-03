/**
 * Personal friend-invite attribution (viral loop).
 * URL: /register?ref=USERNAME  or  /?ref=USERNAME&auth=register
 */

const STORAGE_KEY = "descall:inviteRef";
const USERNAME_RE = /^[a-zA-Z0-9_.-]{2,24}$/;

export function normalizeInviteRef(raw) {
  if (raw == null) return "";
  const value = String(raw).trim().replace(/^@/, "");
  if (!USERNAME_RE.test(value)) return "";
  return value;
}

export function readInviteRefFromLocation(search = typeof window !== "undefined" ? window.location.search : "") {
  try {
    const params = new URLSearchParams(search.startsWith("?") ? search : `?${search}`);
    return normalizeInviteRef(params.get("ref") || params.get("inviteBy") || "");
  } catch {
    return "";
  }
}

export function persistInviteRef(username) {
  const clean = normalizeInviteRef(username);
  if (!clean || typeof sessionStorage === "undefined") return "";
  try {
    sessionStorage.setItem(STORAGE_KEY, clean);
  } catch {
    /* ignore quota / private mode */
  }
  return clean;
}

export function consumeInviteRef() {
  if (typeof sessionStorage === "undefined") return "";
  try {
    const value = normalizeInviteRef(sessionStorage.getItem(STORAGE_KEY) || "");
    if (value) sessionStorage.removeItem(STORAGE_KEY);
    return value;
  } catch {
    return "";
  }
}

export function peekInviteRef() {
  if (typeof sessionStorage === "undefined") return "";
  try {
    return normalizeInviteRef(sessionStorage.getItem(STORAGE_KEY) || "");
  } catch {
    return "";
  }
}

export const PUBLIC_SITE_ORIGIN = "https://descall.com";

/** Origin for copy/share links. Electron loads from file:// which is not shareable. */
function isElectronRuntime() {
  if (typeof window === "undefined") return false;
  if (window.electronAPI?.isElectron) return true;
  try {
    if (typeof navigator !== "undefined" && /Electron/i.test(navigator.userAgent || "")) {
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

export function publicAppOrigin(origin) {
  if (origin == null && isElectronRuntime()) return PUBLIC_SITE_ORIGIN;
  const raw = origin == null
    ? (typeof window !== "undefined" ? window.location.origin : PUBLIC_SITE_ORIGIN)
    : String(origin);
  const trimmed = String(raw || "").replace(/\/$/, "");
  if (!trimmed || trimmed === "null" || trimmed === "undefined") return PUBLIC_SITE_ORIGIN;
  // file://, electron, custom schemes — never copy those. Real http(s) web origins stay.
  if (!/^https?:\/\//i.test(trimmed)) return PUBLIC_SITE_ORIGIN;
  return trimmed;
}

/** Rewrite file:// (and file://host) share URLs to https://descall.com. */
export function toPublicShareUrl(url) {
  const s = String(url || "");
  if (!s || s === "—") return s;
  if (/^https?:\/\//i.test(s)) return s;
  try {
    const u = new URL(s);
    const path = u.pathname && u.pathname !== "/" ? u.pathname : `/${u.hostname || ""}`;
    const cleaned = path.replace(/\/{2,}/g, "/");
    return `${PUBLIC_SITE_ORIGIN}${cleaned.startsWith("/") ? cleaned : `/${cleaned}`}${u.search}${u.hash}`;
  } catch {
    const rest = s.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "").replace(/^\/+/, "");
    return `${PUBLIC_SITE_ORIGIN}/${rest}`;
  }
}

/** Public share URL for a user's personal invite. */
export function buildFriendInviteUrl(username, origin) {
  const clean = normalizeInviteRef(username);
  const base = publicAppOrigin(origin);
  if (!clean) return `${base}/register`;
  return `${base}/register?ref=${encodeURIComponent(clean)}`;
}
