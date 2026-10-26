"use strict";

/**
 * Settings › Görünüm stored on the account (3.0). Mirrors
 * frontend/src/lib/appearancePrefs.js sanitizeAppearancePatch: only these
 * keys and values are ever written.
 */
const THEME_MODES = ["dark", "light", "auto"];
const ACCENTS = ["#587AF6", "#8E6CF6", "#30B05A", "#14B8A6", "#EC4899", "#F5A524", "#EF4444"];
const FONT_STEPS = 4;

function sanitizeAppearance(raw) {
  const src = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const out = {};
  if (THEME_MODES.includes(src.themeMode)) out.themeMode = src.themeMode;
  if (typeof src.accentColor === "string") {
    const hex = src.accentColor.trim().toUpperCase();
    if (ACCENTS.includes(hex)) out.accentColor = hex;
  }
  if (Number.isInteger(src.fontStep) && src.fontStep >= 0 && src.fontStep < FONT_STEPS) out.fontStep = src.fontStep;
  if (typeof src.reduceTransparency === "boolean") out.reduceTransparency = src.reduceTransparency;
  if (typeof src.reduceMotion === "boolean") out.reduceMotion = src.reduceMotion;
  return out;
}

module.exports = { sanitizeAppearance, THEME_MODES, ACCENTS, FONT_STEPS };
