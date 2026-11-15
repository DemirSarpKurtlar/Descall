import { useSyncExternalStore } from "react";
import { resolveFlag } from "./featureRollout.js";

export const DEFAULT_PUBLIC_FEATURES = {
  iosGlass: true,
  // Desktop/web Liquid Glass is opt-in until an admin turns it on.
  desktopGlass: false,
};

let current = normalizePublicFeatures(DEFAULT_PUBLIC_FEATURES);
const listeners = new Set();

/** Who is asking, for rollout rules (Sistem page): signed-in user id and platform. */
export function featureContext(win = typeof window !== "undefined" ? window : null) {
  let userId = null;
  let platform = "web";
  try {
    // Same key as lib/storage.js getUser().
    const raw = win?.localStorage?.getItem("descall_user");
    userId = raw ? JSON.parse(raw)?.id || null : null;
  } catch {
    userId = null;
  }
  try {
    if (win?.electronAPI || /Electron\//.test(win?.navigator?.userAgent || "")) platform = "electron";
    else if (win?.Capacitor?.isNativePlatform?.()) {
      const p = win.Capacitor.getPlatform?.();
      if (p === "ios" || p === "android") platform = p;
    }
  } catch {
    platform = "web";
  }
  return { userId, platform };
}

/**
 * A flag from a features payload for the glass appliers: the local rollout check when
 * the server sent a rule (flagRules), else the server boolean, else undefined (not sent).
 */
export function remoteFlag(input, key, ctx = featureContext()) {
  return resolveFlag(input, key, ctx);
}

export function normalizePublicFeatures(input, ctx) {
  const src = input && typeof input === "object" ? input : {};
  const hasRules = src.flagRules && typeof src.flagRules === "object";
  const c = hasRules ? ctx || featureContext() : ctx || {};
  const ios = resolveFlag(src, "iosGlass", c);
  const desktop = resolveFlag(src, "desktopGlass", c);
  return {
    // Remote kill switch for the iPhone Liquid Glass UI (lib/glassUi.js).
    iosGlass: ios !== false,
    // Desktop/web Liquid Glass (lib/glassDesktop.js). Missing stays off.
    desktopGlass: desktop === true,
  };
}

export function getPublicFeatures() {
  return current;
}

export function subscribePublicFeatures(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function applyPublicFeatures(input) {
  const next = normalizePublicFeatures(input);
  if (
    next.iosGlass === current.iosGlass &&
    next.desktopGlass === current.desktopGlass
  ) {
    return current;
  }
  current = next;
  listeners.forEach((listener) => listener());
  return current;
}

export function usePublicFeatures() {
  return useSyncExternalStore(subscribePublicFeatures, getPublicFeatures, getPublicFeatures);
}

/** Drop unknown destinations from the rendered list so they occupy no space. */
export function filterMainNavItems(items) {
  return (Array.isArray(items) ? items : []).filter((item) => Boolean(item?.id));
}
