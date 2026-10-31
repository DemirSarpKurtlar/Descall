import { normalizeLocale, htmlLang, textDirection } from "./registry.js";

const SETTINGS_KEY = "descall_user_settings";
const LEGACY_SETTINGS_KEY = "descall_settings";
const LANG_KEY = "descall_language";

export function readStoredLanguage() {
  try {
    const direct = normalizeLocale(localStorage.getItem(LANG_KEY));
    if (direct) return direct;

    const raw =
      localStorage.getItem(SETTINGS_KEY) ||
      localStorage.getItem(LEGACY_SETTINGS_KEY) ||
      "{}";
    const settings = JSON.parse(raw);
    const fromSettings = normalizeLocale(settings?.language);
    if (fromSettings) return fromSettings;
  } catch {
    /* ignore */
  }
  return null;
}

export function writeStoredLanguage(language) {
  const normalized = normalizeLocale(language);
  if (!normalized) return;
  try {
    localStorage.setItem(LANG_KEY, normalized);

    const raw =
      localStorage.getItem(SETTINGS_KEY) ||
      localStorage.getItem(LEGACY_SETTINGS_KEY) ||
      "{}";
    const settings = JSON.parse(raw || "{}");
    settings.language = normalized;
    const json = JSON.stringify(settings);
    localStorage.setItem(SETTINGS_KEY, json);
    localStorage.setItem(LEGACY_SETTINGS_KEY, json);
  } catch {
    /* ignore */
  }
}

/** <html lang> and <html dir> follow the UI language (dir is ready for RTL locales). */
export function applyDocumentLang(language) {
  try {
    const root = document.documentElement;
    root.setAttribute("lang", htmlLang(language));
    root.setAttribute("dir", textDirection(language));
  } catch {
    /* ignore */
  }
}
