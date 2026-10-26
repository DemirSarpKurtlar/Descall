import { useCallback, useMemo } from "react";
import { useLocale } from "../../../context/LocaleContext";
import { SVH_TR, SVH_EN, fmt, caseHelpers } from "./strings.js";

export function useSvh() {
  const { locale } = useLocale();
  const s = locale === "tr" ? SVH_TR : SVH_EN;
  const f = useCallback((key, vars) => fmt(s[key] ?? SVH_EN[key] ?? key, vars), [s]);
  const cases = useMemo(() => caseHelpers(locale), [locale]);
  return { s, f, locale, ...cases };
}
