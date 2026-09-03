import { useCallback } from "react";
import { useLocation } from "react-router-dom";
import { useLocale } from "../context/localeContextInstance";
import { isTrPath, stripLocalePrefix, withTrPrefix, TR_MIRROR_PATHS } from "./localePaths";

/** Prefix mirrored marketing URLs with /tr when the UI locale is Turkish. */
export function marketingHref(to, { locale, pathname } = {}) {
  if (!to || typeof to !== "string" || to.startsWith("http") || to.startsWith("mailto:")) return to;
  const tr = locale === "tr" || isTrPath(pathname);
  if (!tr) return to;
  const bare = stripLocalePrefix(to);
  if (TR_MIRROR_PATHS.includes(bare)) return withTrPrefix(bare);
  return to;
}

export function useMarketingHref() {
  const { locale } = useLocale();
  const { pathname } = useLocation();
  return useCallback((to) => marketingHref(to, { locale, pathname }), [locale, pathname]);
}
