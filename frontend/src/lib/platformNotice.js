/**
 * Güvenlik Merkezi emergency lock info band (Nov 2026): what every open app shows while
 * an admin has a lock on with "Kullanıcılara bilgi bandı göster". The server sends it in
 * GET /api/features (`platformNotice`, only while one is on) and live as the
 * `platform:notice` socket event (null = gone). Tested in platformNotice.selftest.mjs.
 */
import { useSyncExternalStore } from "react";

const MODES = ["readOnly", "dm", "registration"];
let current = null;
const listeners = new Set();

/** Keep only a well-formed notice: { modes: string[], until: ISO|null } or null. */
export function normalizeNotice(input) {
  if (!input || typeof input !== "object" || !Array.isArray(input.modes)) return null;
  const modes = MODES.filter((m) => input.modes.includes(m));
  if (!modes.length) return null;
  const until = input.until && Number.isFinite(Date.parse(input.until)) ? new Date(input.until).toISOString() : null;
  return { modes, until };
}

export function noticeKey(notice) {
  return notice ? `${notice.modes.join("+")}|${notice.until || "open"}` : "";
}

/**
 * Which line a signed-in user sees: read-only beats the DM freeze; the registration
 * freeze alone does not concern someone already signed in (null).
 */
export function noticeModeFor(notice, { signedIn = true } = {}) {
  if (!notice) return null;
  if (notice.modes.includes("readOnly")) return "readOnly";
  if (notice.modes.includes("dm")) return "dm";
  if (!signedIn && notice.modes.includes("registration")) return "registration";
  return null;
}

/** An end time already passed reads as no notice (the server clears it within seconds). */
export function activeNotice(notice, now = Date.now()) {
  if (!notice) return null;
  if (notice.until && Date.parse(notice.until) <= now) return null;
  return notice;
}

export function applyPlatformNotice(input) {
  const next = normalizeNotice(input);
  if (noticeKey(next) === noticeKey(current)) return current;
  current = next;
  listeners.forEach((fn) => fn());
  return current;
}

export function getPlatformNotice() {
  return current;
}

export function subscribePlatformNotice(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function usePlatformNotice() {
  return useSyncExternalStore(subscribePlatformNotice, getPlatformNotice, getPlatformNotice);
}
