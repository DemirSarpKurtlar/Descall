/**
 * Signup-time client hints (kept out of attribution.js so the marketing
 * first-paint bundle stays inside its perf budget).
 */

/** web | electron | ios | ipad | android | watch */
export function detectClientPlatform(env = typeof window !== "undefined" ? window : null) {
  try {
    if (!env) return "web";
    if (env.electronAPI || /Electron\//.test(env.navigator?.userAgent || "")) return "electron";
    const cap = env.Capacitor;
    if (cap && (typeof cap.isNativePlatform === "function" ? cap.isNativePlatform() : false)) {
      const p = typeof cap.getPlatform === "function" ? cap.getPlatform() : "";
      if (p === "android") return "android";
      if (/iPad/.test(env.navigator?.userAgent || "") || (env.navigator?.maxTouchPoints > 1 && /Macintosh/.test(env.navigator?.userAgent || ""))) return "ipad";
      return "ios";
    }
  } catch {
    /* ignore */
  }
  return "web";
}

/** Invite context implied by the landing URL (server/group invite, friend ref, code). */
export function inviteKindFromLocation(pathname = "/", search = "") {
  const p = String(pathname || "/");
  const q = String(search || "");
  if (/^\/(servers\/join|invite\/s)\/[A-Za-z0-9_-]+/i.test(p) || /[?&]si=[A-Za-z0-9_-]+/.test(q)) return "server_invite";
  if (/^\/(invite|i)\/[A-Za-z0-9_-]+/i.test(p) || /[?&](invite|i)=[A-Za-z0-9_-]+/.test(q)) return "group_invite";
  if (/[?&](ref|inviteBy)=[A-Za-z0-9_.-]{2,24}/.test(q)) return "friend_invite";
  if (/[?&](referral|promo)=[A-Za-z0-9_-]{3,}/i.test(q)) return "referral_code";
  return "";
}

