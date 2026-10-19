import { useSyncExternalStore } from "react";

export const DEFAULT_PUBLIC_FEATURES = {
  iosGlass: true,
  // Desktop/web Liquid Glass is opt-in until an admin turns it on.
  desktopGlass: false,
};

let current = normalizePublicFeatures(DEFAULT_PUBLIC_FEATURES);
const listeners = new Set();

export function normalizePublicFeatures(input) {
  const src = input && typeof input === "object" ? input : {};
  return {
    // Remote kill switch for the iPhone Liquid Glass UI (lib/glassUi.js).
    iosGlass: src.iosGlass !== false,
    // Desktop/web Liquid Glass (lib/glassDesktop.js). Missing stays off.
    desktopGlass: src.desktopGlass === true,
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
