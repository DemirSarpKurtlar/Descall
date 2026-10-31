/**
 * Shared LocaleContext instance, avoid importing full i18n catalogs via LocaleContext.jsx
 * from the marketing entry graph.
 */
import { createContext, useContext } from "react";
import { liveLocales } from "../i18n/registry.js";

export const LocaleContext = createContext({
  locale: "en",
  setLocale: () => {},
  t: (key) => String(key ?? ""),
  locales: liveLocales().map((l) => ({ id: l.id, nativeLabel: l.name, status: l.status })),
});

export function useLocale() {
  return useContext(LocaleContext);
}

export function useT() {
  return useContext(LocaleContext).t;
}
