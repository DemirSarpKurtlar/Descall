import { useCallback, useEffect, useMemo, useState } from "react";
import { LocaleContext } from "../context/localeContextInstance";
import { MARKETING_TR } from "./marketingPhrases.tr.js";
import { applyDocumentLang, readStoredLanguage, writeStoredLanguage } from "../i18n/storage.js";
import { normalizeLocale, detectDefaultLocale } from "../i18n/detect.js";
import { resolveMarketingLocale } from "./resolveMarketingLocale.js";

const LOCALES = [
  { id: "en", labelKey: "settings.english", nativeLabel: "English" },
  { id: "tr", labelKey: "settings.turkish", nativeLabel: "Türkçe" },
];

function interpolate(str, vars) {
  if (!vars || typeof str !== "string") return str;
  return str.replace(/\{\{(\w+)\}\}|\{(\w+)\}/g, (_, a, b) => {
    const key = a || b;
    return vars[key] != null ? String(vars[key]) : "";
  });
}

function resolveLocale() {
  try {
    const stored = readStoredLanguage();
    const fromRules = resolveMarketingLocale({
      pathname: typeof window !== "undefined" ? window.location.pathname : "",
      stored,
    });
    if (fromRules) return fromRules;
  } catch {
    /* ignore */
  }
  return detectDefaultLocale() || "en";
}

/**
 * Slim locale provider for public marketing pages — no 120KB+ phrase catalogs on first paint.
 * English source strings pass through; TR uses the curated marketing subset, then the full
 * catalog once it lazy-loads so SEO/FAQ bodies are not stuck in English.
 */
export default function MarketingLocaleProvider({ children }) {
  const [locale, setLocaleState] = useState(resolveLocale);
  const [extraTr, setExtraTr] = useState(null);

  const setLocale = useCallback((next) => {
    const normalized = normalizeLocale(next) || "en";
    setLocaleState(normalized);
    try {
      writeStoredLanguage(normalized);
      applyDocumentLang(normalized);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    applyDocumentLang(locale);
  }, [locale]);

  useEffect(() => {
    if (locale !== "tr") {
      setExtraTr(null);
      return undefined;
    }
    let cancelled = false;
    import("../i18n/locales/tr.js")
      .then((mod) => {
        if (!cancelled) setExtraTr(mod.phrases || mod.default?.phrases || {});
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [locale]);

  const t = useCallback(
    (key, vars) => {
      if (key == null) return "";
      const k = String(key);
      if (locale === "tr") {
        const translated = MARKETING_TR[k] || extraTr?.[k];
        if (translated) return interpolate(translated, vars);
      }
      return interpolate(k, vars);
    },
    [locale, extraTr]
  );

  const value = useMemo(
    () => ({ locale, setLocale, t, locales: LOCALES }),
    [locale, setLocale, t]
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}
