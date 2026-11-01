import { useCallback } from "react";
import { useLocation } from "react-router-dom";
import { useLocale } from "../context/localeContextInstance";
import { marketingHref } from "./marketingHref.js";

export { marketingHref };

export function useMarketingHref() {
  const { locale } = useLocale();
  const { pathname } = useLocation();
  return useCallback((to) => marketingHref(to, { locale, pathname }), [locale, pathname]);
}
