/**
 * Erişim yasakları (3.5.0): a random id for this app install, sent as
 * X-Descall-Device on API calls and as `device` in the socket handshake. The
 * server only keeps a keyed hash of it (backend/lib/accessBans.js), so an
 * admin can block a device that keeps making new accounts. It carries no
 * personal data and is not readable by other sites.
 */
const KEY = "descall:device-id";
const RE = /^[A-Za-z0-9_-]{16,80}$/;
let memo = null;

function randomId() {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return `d_${crypto.randomUUID().replace(/-/g, "")}`;
    if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
      const b = new Uint8Array(16);
      crypto.getRandomValues(b);
      return `d_${[...b].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
    }
  } catch {
    /* fall through */
  }
  return `d_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 14)}`;
}

/** Stable per install; a fresh one when storage is unavailable (private mode). */
export function getDeviceId() {
  if (memo) return memo;
  try {
    const stored = typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null;
    if (stored && RE.test(stored)) return (memo = stored);
    const id = randomId();
    try {
      localStorage.setItem(KEY, id);
    } catch {
      /* private mode: keep it for this run */
    }
    return (memo = id);
  } catch {
    return (memo = randomId());
  }
}

export function deviceHeaders() {
  return { "X-Descall-Device": getDeviceId() };
}
