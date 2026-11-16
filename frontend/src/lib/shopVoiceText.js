// Text for the C4 voice cosmetics UI ("shopVoice.*"). Reads the registered i18n namespace;
// until the coordinator registers shopVoice.<locale>.js it falls back to the bundled
// Turkish / English tables, so no key ever leaks onto the screen.
import { useCallback } from "react";
import { useLocale } from "../context/localeContextInstance.js";
import { SHOP_VOICE_EN } from "../i18n/locales/shopVoice.en.js";
import { SHOP_VOICE_TR } from "../i18n/locales/shopVoice.tr.js";

function fill(text, vars) {
  if (!vars) return text;
  return String(text).replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined && vars[k] !== null ? String(vars[k]) : m));
}

export function voiceText(t, locale, key, vars) {
  const full = `shopVoice.${key}`;
  const v = typeof t === "function" ? t(full, vars) : null;
  if (v && v !== full) return v;
  const table = String(locale || "").toLowerCase().startsWith("tr") ? SHOP_VOICE_TR : SHOP_VOICE_EN;
  return fill(table[key] ?? SHOP_VOICE_EN[key] ?? key, vars);
}

/** `(key, vars) => text` for the current locale. */
export function useVoiceText() {
  const { t, locale } = useLocale();
  return useCallback((key, vars) => voiceText(t, locale, key, vars), [t, locale]);
}
