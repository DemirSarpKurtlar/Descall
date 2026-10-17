import { useCallback } from "react";
import { useLocation } from "react-router-dom";
import { useLocale } from "../context/localeContextInstance";
import { isTrPath, hreflangPair } from "./localePaths";

/** Prefix mirrored marketing URLs with /tr when the UI locale is Turkish. */
export function marketingHref(to, { locale, pathname } = {}) {
  if (!to || typeof to !== "string" || to.startsWith("http") || to.startsWith("mailto:")) return to;
  const tr = locale === "tr" || isTrPath(pathname);
  if (!tr) return to;
  if (to === "/tr" || to.startsWith("/tr/")) return to;
  const pair = hreflangPair(to);
  return pair ? pair.tr : to;
}

export function useMarketingHref() {
  const { locale } = useLocale();
  const { pathname } = useLocation();
  return useCallback((to) => marketingHref(to, { locale, pathname }), [locale, pathname]);
}
