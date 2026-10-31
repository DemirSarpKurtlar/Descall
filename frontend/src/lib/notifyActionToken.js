import { Capacitor, registerPlugin } from "@capacitor/core";
import { API_BASE_URL } from "../config/api.js";

/**
 * 3.0.0 (A4): scoped token for quick reply / reactions / "okundu" straight
 * from an iOS notification (POST /api/messages/quick-*). The app mints it with
 * the session (POST /api/messages/notify-token) and hands it to native code,
 * which keeps it in the Keychain shared with the notification extensions.
 * It only works on the quick-action routes and dies with the session.
 * The token is never logged.
 */

const IS_IOS = typeof window !== "undefined" && Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
const REFRESH_AFTER_MS = 12 * 60 * 60 * 1000;

let plugin = null;
let lastIssuedAt = 0;
let lastUser = "";
let inFlight = null;

function nativePlugin() {
  if (!IS_IOS) return null;
  if (!plugin) plugin = registerPlugin("DescallNotify");
  return plugin;
}

/**
 * iOS: UI language for native text (notification actions, CallKit hints, Apple Watch),
 * kept in the App Group defaults by DescallNotify.setUiLocale. Older builds lack the method.
 */
export function shareUiLocaleWithNative(locale) {
  const native = nativePlugin();
  if (!native || !locale) return;
  try {
    Promise.resolve(native.setUiLocale({ locale: String(locale) })).catch(() => {});
  } catch {
    /* ignore */
  }
}

/** Pure: should the token be minted again? (unit-tested) */
export function needsRefresh({ now, issuedAt, userId, lastUserId, force = false }) {
  if (force) return true;
  if (!userId) return false;
  if (userId !== lastUserId) return true;
  return !issuedAt || now - issuedAt > REFRESH_AFTER_MS;
}

/** Pure: arguments for DescallNotify.setActionToken from the server reply. */
export function nativeTokenArgs(body, apiBase) {
  const token = typeof body?.token === "string" ? body.token : "";
  const userId = body?.userId ? String(body.userId) : "";
  const expiresMs = Date.parse(body?.expiresAt || "");
  if (!token || !userId || !Number.isFinite(expiresMs)) return null;
  const base = String(apiBase || "").replace(/\/+$/, "");
  if (!/^https:\/\//i.test(base)) return null;
  return { token, userId, apiBase: base, expiresAt: Math.floor(expiresMs / 1000) };
}

/**
 * Mint and store the scoped token (iOS only). Safe to call often: it refreshes
 * at most every 12 hours per account unless `force`.
 */
export function refreshNotifyActionToken(authToken, { userId = "", force = false } = {}) {
  const native = nativePlugin();
  if (!native || !authToken) return Promise.resolve(false);
  if (!needsRefresh({ now: Date.now(), issuedAt: lastIssuedAt, userId: userId || lastUser || "?", lastUserId: lastUser, force })) {
    return Promise.resolve(true);
  }
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/messages/notify-token`, {
        method: "POST",
        headers: { Authorization: `Bearer ${authToken}`, "Content-Type": "application/json" },
        body: "{}",
      });
      if (!response.ok) return false;
      const args = nativeTokenArgs(await response.json(), API_BASE_URL);
      if (!args) return false;
      await native.setActionToken(args);
      lastIssuedAt = Date.now();
      lastUser = args.userId;
      return true;
    } catch {
      return false;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

/** Logout: the notification extensions can no longer act for this account. */
export async function clearNotifyActionToken() {
  lastIssuedAt = 0;
  lastUser = "";
  const native = nativePlugin();
  if (!native) return;
  try {
    await native.clearActionToken();
  } catch {
    /* ignore */
  }
}
