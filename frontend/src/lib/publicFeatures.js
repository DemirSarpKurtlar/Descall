import { useSyncExternalStore } from "react";

export const DEFAULT_PUBLIC_FEATURES = {
  valorantLfg: true,
  valorantCompanion: true,
  dimaai: true,
};

let current = { ...DEFAULT_PUBLIC_FEATURES };
const listeners = new Set();

export function normalizePublicFeatures(input) {
  const src = input && typeof input === "object" ? input : {};
  return {
    valorantLfg: src.valorantLfg !== false,
    valorantCompanion: src.valorantCompanion !== false,
    dimaai: src.dimaai !== false,
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
    next.dimaai === current.dimaai
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
    if (item.id === "dimaai") return flags.dimaai;
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
