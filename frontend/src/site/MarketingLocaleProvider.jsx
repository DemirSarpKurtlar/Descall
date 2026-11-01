import { useCallback, useEffect, useMemo, useState } from "react";
import { LocaleContext } from "../context/localeContextInstance";
import { MARKETING_TR } from "./marketingPhrases.tr.js";
import { applyDocumentLang, readStoredLanguage, writeStoredLanguage } from "../i18n/storage.js";
import { normalizeLocale, detectDefaultLocale } from "../i18n/detect.js";
import { initialMarketingLocale } from "./resolveMarketingLocale.js";
import { forcedLocaleForPath } from "./localePaths.js";
import { SITE_LOCALES, isPrefixedLocale, isSiteLocale, localeNativeName } from "./siteLocales.js";
import { hasSiteCatalog, siteLookup } from "./siteText.js";
import { loadSiteCatalog, onSiteAppCatalog } from "./loadSiteCatalog.js";

const LOCALES = SITE_LOCALES.map((id) => ({ id, nativeLabel: localeNativeName(id) }));

function interpolate(str, vars) {
  if (!vars || typeof str !== "string") return str;
  return str.replace(/\{\{(\w+)\}\}|\{(\w+)\}/g, (_, a, b) => {
    const key = a || b;
    return vars[key] != null ? String(vars[key]) : "";
  });
}

/** Starting site language: URL, stored choice, device language, English. */
export function resolveBootMarketingLocale() {
  try {
    return initialMarketingLocale({
      pathname: typeof window !== "undefined" ? window.location.pathname : "",
      stored: readStoredLanguage(),
      detected: detectDefaultLocale(),
    });
  } catch {
    return "en";
  }
}

/**
 * Slim locale provider for public marketing pages, no 120KB+ phrase catalogs on first paint.
 * English source strings pass through; TR uses the curated marketing subset, then the full
 * catalog once it lazy-loads so SEO/FAQ bodies are not stuck in English. Prefixed site
 * languages (de, es, ...) read siteText.js; hydrateMarketing.jsx waits for their catalogs
 * before the first render, a later switch loads them here.
 */
export default function MarketingLocaleProvider({ children }) {
  const [locale, setLocaleState] = useState(resolveBootMarketingLocale);
  const [extraTr, setExtraTr] = useState(null);
  const [catalogTick, setCatalogTick] = useState(0);

  const setLocale = useCallback((next) => {
    const normalized = normalizeLocale(next);
    const id = normalized && isSiteLocale(normalized) ? normalized : "en";
    setLocaleState(id);
    try {
      writeStoredLanguage(id);
      applyDocumentLang(id);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    applyDocumentLang(locale);
  }, [locale]);

  // A localized URL is an explicit locale choice. Remember it so English-canonical
  // pages (privacy, terms, copyright, login) stay in that language on the next full load.
  useEffect(() => {
    try {
      const forced = forcedLocaleForPath(window.location.pathname);
      if (forced) writeStoredLanguage(forced);
    } catch {
      /* ignore */
    }
  }, []);

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

  // The app catalog arrives later, only when a string is missing from the site catalog.
  useEffect(() => onSiteAppCatalog((id) => {
    if (id === locale) setCatalogTick((n) => n + 1);
  }), [locale]);

  useEffect(() => {
    if (!isPrefixedLocale(locale) || hasSiteCatalog(locale)) return undefined;
    let cancelled = false;
    loadSiteCatalog(locale).then(() => {
      if (!cancelled) setCatalogTick((n) => n + 1);
    });
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
      } else if (locale !== "en") {
        const translated = siteLookup(k, locale);
        if (translated) return interpolate(translated, vars);
      }
      return interpolate(k, vars);
    },
    // catalogTick re-creates t once a prefixed catalog arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [locale, extraTr, catalogTick]
  );

  const value = useMemo(
    () => ({ locale, setLocale, t, locales: LOCALES }),
    [locale, setLocale, t]
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}
