import { useSyncExternalStore } from "react";

export const DEFAULT_PUBLIC_FEATURES = {
  valorantLfg: true,
  valorantCompanion: true,
  iosGlass: true,
};

let current = normalizePublicFeatures(DEFAULT_PUBLIC_FEATURES);
const listeners = new Set();

/**
 * Native iOS app (Capacitor): the Valorant Companion (third-party Riot client login)
 * is not offered there (App Review). Checked via window.Capacitor so this module stays
 * importable from Node selftests.
 */
function isNativeIosShell() {
  try {
    const cap = typeof window !== "undefined" ? window.Capacitor : null;
    return Boolean(cap?.isNativePlatform?.() && cap.getPlatform?.() === "ios");
  } catch {
    return false;
  }
}

export function normalizePublicFeatures(input) {
  const src = input && typeof input === "object" ? input : {};
  return {
    valorantLfg: src.valorantLfg !== false,
    valorantCompanion: src.valorantCompanion !== false && !isNativeIosShell(),
    // Remote kill switch for the iPhone Liquid Glass UI (lib/glassUi.js).
    iosGlass: src.iosGlass !== false,
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
    next.valorantLfg === current.valorantLfg &&
    next.valorantCompanion === current.valorantCompanion &&
    next.iosGlass === current.iosGlass
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

export function valorantPlayVisible(features) {
  const flags = normalizePublicFeatures(features);
  return flags.valorantLfg || flags.valorantCompanion;
}

/** Drop disabled destinations from the rendered list so they occupy no space. */
export function filterMainNavItems(items, features) {
  const flags = normalizePublicFeatures(features);
  const play = flags.valorantLfg || flags.valorantCompanion;
  return (Array.isArray(items) ? items : []).filter((item) => {
    if (!item?.id) return false;
    if (item.id === "play") return play;
    return true;
  });
}

/**
 * Pick a Valorant hub tab that is actually enabled.
 * Returns null when both LFG and Companion are off.
 * Default when both are on remains Companion.
 */
export function resolveValorantTab(stored, features) {
  const flags = normalizePublicFeatures(features);
  if (!flags.valorantLfg && !flags.valorantCompanion) return null;
  if (flags.valorantCompanion && !flags.valorantLfg) return "companion";
  if (flags.valorantLfg && !flags.valorantCompanion) return "lfg";
  if (stored === "lfg" || stored === "companion") return stored;
  return "companion";
}

export function readStoredValorantTab() {
  try {
    const wanted = sessionStorage.getItem("descall.valorant.tab");
    if (wanted === "companion" || wanted === "lfg") {
      sessionStorage.removeItem("descall.valorant.tab");
      return wanted;
    }
  } catch {
    /* sessionStorage can be unavailable */
  }
  return null;
}
