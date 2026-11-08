/**
 * Extra fields every sign-up request carries (register, Google, Apple), read by
 * backend routes/auth.js:
 *   clientPlatform  web | electron | ios | ipad | android. A Capacitor WebView sends
 *                   a plain Safari / Chrome user agent, so without this hint the iOS
 *                   and Android apps were stored as web_mobile (users.signup_platform).
 *   inviteCode      the server / vanity / group invite that is waiting for this
 *                   sign-up (lib/serverInviteRoute.js pending slots), stored as
 *                   users.joined_via_invite_code. Friend invites keep using invitedBy.
 * Dependency-free apart from serverInviteRoute.js, so the marketing entry stays small.
 */
import { peekPendingLanding } from "./serverInviteRoute.js";

function currentWindow(win) {
  if (win !== undefined) return win;
  return typeof window !== "undefined" ? window : null;
}

export function signupClientPlatform(win) {
  const w = currentWindow(win);
  if (!w) return "web";
  try {
    if (w.electronAPI && w.electronAPI.isElectron) return "electron";
    const cap = w.Capacitor;
    const native = cap && typeof cap.isNativePlatform === "function" ? cap.isNativePlatform() : false;
    if (native && typeof cap.getPlatform === "function") {
      const p = cap.getPlatform();
      if (p === "android") return "android";
      if (p === "ios") {
        const nav = w.navigator || {};
        const ua = String(nav.userAgent || "");
        const ipad = /iPad/.test(ua) || (/Macintosh/.test(ua) && Number(nav.maxTouchPoints) > 1);
        return ipad ? "ipad" : "ios";
      }
    }
  } catch {
    /* no native bridge */
  }
  return "web";
}

/** "server:<code>" | "vanity:<slug>" | "group:<code>" | "" */
export function signupInviteCode(opts) {
  try {
    const server = peekPendingLanding("server", opts);
    if (server) return `server:${server}`;
    const vanity = peekPendingLanding("vanity", opts);
    if (vanity) return `vanity:${vanity}`;
    const group = peekPendingLanding("group", opts);
    if (group) return `group:${group}`;
  } catch {
    /* storage blocked */
  }
  return "";
}

/** payload + clientPlatform (+ inviteCode when one is pending). Never overrides given values. */
export function withSignupContext(payload = {}, { win, storage } = {}) {
  const out = { ...payload };
  if (!out.clientPlatform) out.clientPlatform = signupClientPlatform(win);
  if (!out.inviteCode) {
    const code = signupInviteCode(storage ? { storage } : undefined);
    if (code) out.inviteCode = code;
  }
  return out;
}
