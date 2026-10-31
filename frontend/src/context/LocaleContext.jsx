import { useCallback, useEffect, useMemo, useState } from "react";
import {
  persistLocale,
  resolveInitialLocale,
  translate,
  SUPPORTED_LOCALES,
  normalizeLocale,
  loadI18nCatalogs,
  ensureLocaleLoaded,
} from "../i18n/index.js";
import { setRuntimeLocale } from "../i18n/runtime.js";
import { FALLBACK_LOCALE } from "../i18n/registry.js";
import { API_BASE_URL } from "../config/api";
import { getToken } from "../lib/storage";
import { LocaleContext, useLocale, useT } from "./localeContextInstance";

export function LocaleProvider({ children, meLanguage = null }) {
  const [locale, setLocaleState] = useState(() => resolveInitialLocale({ meLanguage }));
  const [ready, setReady] = useState(false);
  // Bumped whenever a catalog finishes loading so t() re-renders with it.
  const [catalogVersion, setCatalogVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    loadI18nCatalogs().then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setRuntimeLocale(locale);
    ensureLocaleLoaded(locale).then(() => {
      if (!cancelled) setCatalogVersion((v) => v + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [locale]);

  useEffect(() => {
    const fromMe = normalizeLocale(meLanguage);
    if (!fromMe) return;
    try {
      const hasExplicit = !!localStorage.getItem("descall_language");
      if (!hasExplicit) {
        setLocaleState(fromMe);
        persistLocale(fromMe);
      }
    } catch {
      /* ignore */
    }
  }, [meLanguage]);

  useEffect(() => {
    persistLocale(locale);
  }, [locale]);

  const setLocale = useCallback((next) => {
    const normalized = normalizeLocale(next) || FALLBACK_LOCALE;
    setLocaleState(normalized);
    persistLocale(normalized);

    try {
      const token = getToken();
      if (token) {
        fetch(`${API_BASE_URL}/api/user/regional`, {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ language: normalized }),
        }).catch(() => {});
      }
    } catch {
      /* ignore */
    }

    try {
      window.dispatchEvent(new CustomEvent("descall:locale", { detail: { locale: normalized } }));
    } catch {
      /* ignore */
    }
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const t = useCallback((key, vars) => translate(locale, key, vars), [locale, ready, catalogVersion]);

  const value = useMemo(
    () => ({ locale, setLocale, t, locales: SUPPORTED_LOCALES }),
    [locale, setLocale, t]
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export { LocaleContext, useLocale, useT };
export default LocaleContext;
