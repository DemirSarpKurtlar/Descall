/* Settings › Görünüm (3.0.0). One small set of options that all really work:
   theme (dark / light / auto + shop themes), accent, text size, reduce
   transparency and reduce motion. Stored in localStorage
   (descall_user_settings, the boot cache read by index.html / main.jsx) and
   synced to the account by lib/appearanceSync.js. */
import { applyDocumentTheme, glassAccentTokens, GLASS_ACCENT_PROPS } from "./themeDocument.js";

export { glassAccentTokens, GLASS_ACCENT_PROPS };

export const SETTINGS_KEY = "descall_user_settings";
export const LEGACY_SETTINGS_KEY = "descall_settings";
/** iPhone: user forced "Şeffaflığı azalt" (html.a11y-solid). Read by glassUi / glassDisplay. */
export const SOLID_KEY = "descall:reduce-transparency";
export const APPEARANCE_EVENT = "descall:appearance";

/* Names: shell.appearance.accents.<id> / shell.appearance.fontSteps.<id> in the catalogs. */
export const ACCENTS = Object.freeze([
  { id: "blue", hex: "#587AF6" },
  { id: "purple", hex: "#8E6CF6" },
  { id: "green", hex: "#30B05A" },
  { id: "teal", hex: "#14B8A6" },
  { id: "pink", hex: "#EC4899" },
  { id: "orange", hex: "#F5A524" },
  { id: "red", hex: "#EF4444" },
]);
export const DEFAULT_ACCENT = ACCENTS[0].hex;

/* The 2.x swatches, same order, map onto the new palette. */
const LEGACY_ACCENTS = ["#5865F2", "#4752C4", "#23A55A", "#1ABC9C", "#EB459E", "#F0B232", "#ED4245"];

export const FONT_STEPS = Object.freeze([
  { id: "small", scale: 0.9 },
  { id: "default", scale: 1 },
  { id: "large", scale: 1.13 },
  { id: "xlarge", scale: 1.26 },
]);
export const DEFAULT_FONT_STEP = 1;
export const THEME_MODES = Object.freeze(["dark", "light", "auto"]);

/** Only these keys go to the account. */
export const SYNC_KEYS = Object.freeze(["themeMode", "accentColor", "fontStep", "reduceTransparency", "reduceMotion"]);

export function normalizeAccent(value) {
  const hex = String(value || "").trim().toUpperCase();
  const hit = ACCENTS.find((a) => a.hex.toUpperCase() === hex);
  if (hit) return hit.hex;
  const legacy = LEGACY_ACCENTS.findIndex((h) => h.toUpperCase() === hex);
  if (legacy >= 0) return ACCENTS[legacy].hex;
  return DEFAULT_ACCENT;
}

export function fontStepFromLegacyPx(px) {
  const n = Number(px);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_FONT_STEP;
  if (n <= 13) return 0;
  if (n <= 15) return 1;
  if (n <= 17) return 2;
  return 3;
}

function clampStep(v) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return DEFAULT_FONT_STEP;
  return Math.min(FONT_STEPS.length - 1, Math.max(0, n));
}

/** Any stored shape (2.x or 3.0) → the 3.0 appearance object. */
export function normalizeAppearance(raw = {}) {
  const src = raw && typeof raw === "object" ? raw : {};
  const themeMode = THEME_MODES.includes(src.themeMode) ? src.themeMode : src.darkMode === false ? "light" : "dark";
  const fontStep = src.fontStep !== undefined && src.fontStep !== null ? clampStep(src.fontStep) : fontStepFromLegacyPx(src.chatFontSize);
  return {
    themeMode,
    accentColor: normalizeAccent(src.accentColor),
    fontStep,
    reduceTransparency: src.reduceTransparency === true,
    reduceMotion: src.reduceMotion === true,
  };
}

/** Only well-formed keys survive (server and client share this rule). */
export function sanitizeAppearancePatch(raw = {}) {
  const src = raw && typeof raw === "object" ? raw : {};
  const out = {};
  if (THEME_MODES.includes(src.themeMode)) out.themeMode = src.themeMode;
  if (typeof src.accentColor === "string" && ACCENTS.some((a) => a.hex.toUpperCase() === src.accentColor.toUpperCase())) {
    out.accentColor = normalizeAccent(src.accentColor);
  }
  if (Number.isInteger(src.fontStep) && src.fontStep >= 0 && src.fontStep < FONT_STEPS.length) out.fontStep = src.fontStep;
  if (typeof src.reduceTransparency === "boolean") out.reduceTransparency = src.reduceTransparency;
  if (typeof src.reduceMotion === "boolean") out.reduceMotion = src.reduceMotion;
  return out;
}

export function fontScale(step) {
  return FONT_STEPS[clampStep(step)].scale;
}

export function prefersLight(w = typeof window !== "undefined" ? window : null) {
  try {
    return Boolean(w?.matchMedia?.("(prefers-color-scheme: light)")?.matches);
  } catch {
    return false;
  }
}

export function resolveBaseTheme(themeMode, w) {
  if (themeMode === "light") return "light";
  if (themeMode === "auto") return prefersLight(w) ? "light" : "dark";
  return "dark";
}

export function readStoredSettings(storage = typeof localStorage !== "undefined" ? localStorage : null) {
  try {
    const primary = JSON.parse(storage?.getItem(SETTINGS_KEY) || "{}");
    if (primary && Object.keys(primary).length) return primary;
    return JSON.parse(storage?.getItem(LEGACY_SETTINGS_KEY) || "{}") || {};
  } catch {
    return {};
  }
}

export function readAppearance(storage) {
  const stored = readStoredSettings(storage);
  if (typeof stored.reduceTransparency !== "boolean") {
    // 2.x "Düşük performans modu" (forced desktop lite) carries over.
    try {
      const store = storage || (typeof localStorage !== "undefined" ? localStorage : null);
      if (store?.getItem("descall:glass-desktop-lite") === "1" || store?.getItem(SOLID_KEY) === "1") {
        return normalizeAppearance({ ...stored, reduceTransparency: true });
      }
    } catch {
      /* ignore */
    }
  }
  return normalizeAppearance(stored);
}

/** Merges the appearance into the shared settings blob. darkMode / chatFontSize stay for 2.x readers and the boot script. */
export function writeAppearance(prefs, { updatedAt, storage } = {}) {
  const store = storage || (typeof localStorage !== "undefined" ? localStorage : null);
  if (!store) return;
  const cur = readStoredSettings(store);
  const next = normalizeAppearance({ ...cur, ...prefs });
  const blob = {
    ...cur,
    ...next,
    darkMode: resolveBaseTheme(next.themeMode) !== "light",
    chatFontSize: Math.round(14 * fontScale(next.fontStep)),
    appearanceUpdatedAt: updatedAt || cur.appearanceUpdatedAt || null,
  };
  delete blob.uiDensity;
  delete blob.bubbleStyle;
  const json = JSON.stringify(blob);
  try {
    store.setItem(SETTINGS_KEY, json);
    store.setItem(LEGACY_SETTINGS_KEY, json);
  } catch {
    /* quota / private mode */
  }
}

/**
 * Applies the appearance to <html>. premiumThemeKey (an equipped shop theme)
 * owns the palette and the accent, like before.
 */
export function applyAppearance(prefs, { premiumThemeKey = null, root, win } = {}) {
  const doc = root || (typeof document !== "undefined" ? document.documentElement : null);
  if (!doc) return null;
  const p = normalizeAppearance(prefs);
  const theme = premiumThemeKey || resolveBaseTheme(p.themeMode, win);
  applyDocumentTheme(doc, theme, { accentColor: premiumThemeKey ? null : p.accentColor });
  const scale = fontScale(p.fontStep);
  doc.style?.setProperty("--ui-font-scale", String(scale));
  doc.style?.setProperty("--chat-font-size", `${Math.round(14 * scale * 10) / 10}px`);
  doc.setAttribute?.("data-font-step", FONT_STEPS[p.fontStep].id);
  doc.removeAttribute?.("data-density");
  doc.removeAttribute?.("data-bubble");
  doc.classList?.toggle("reduce-motion", p.reduceMotion);
  doc.classList?.toggle("user-solid", p.reduceTransparency);
  return { ...p, theme };
}

/** iPad (native or Safari) gets the tablet sizes of the 3.0 settings / admin
 *  layouts; Electron and mouse-driven browsers get the desktop ones. */
export function isTabletLayout(win = typeof window !== "undefined" ? window : undefined) {
  if (!win) return false;
  try {
    if (win.electronAPI || /Electron\//.test(win.navigator?.userAgent || "")) return false;
    if (win.Capacitor?.getPlatform?.() === "ios") return true;
    const ua = win.navigator?.userAgent || "";
    if (/iPad/.test(ua)) return true;
    return /Macintosh/.test(ua) && (win.navigator?.maxTouchPoints || 0) > 1;
  } catch {
    return false;
  }
}
