"use strict";

/**
 * Settings › Görünüm stored on the account (3.0). Mirrors
 * frontend/src/lib/appearancePrefs.js sanitizeAppearancePatch: only these
 * keys and values are ever written.
 */
const THEME_MODES = ["dark", "light", "auto"];
const ACCENTS = ["#587AF6", "#8E6CF6", "#30B05A", "#14B8A6", "#EC4899", "#F5A524", "#EF4444"];
const FONT_STEPS = 4;
/** End-of-call DesCoin summary (Nov 2026): on / off and the minimum DesCoin earned to show it. */
const CALL_COIN_THRESHOLDS = [1, 5, 10, 25, 50];

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
  if (typeof src.callCoinSummary === "boolean") out.callCoinSummary = src.callCoinSummary;
  if (Number.isInteger(src.callCoinThreshold) && CALL_COIN_THRESHOLDS.includes(src.callCoinThreshold)) {
    out.callCoinThreshold = src.callCoinThreshold;
  }
  return out;
}

module.exports = { sanitizeAppearance, THEME_MODES, ACCENTS, FONT_STEPS, CALL_COIN_THRESHOLDS };
