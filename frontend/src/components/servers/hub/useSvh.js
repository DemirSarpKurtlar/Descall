import { useMemo } from "react";
import { useLocale } from "../../../context/LocaleContext";
import { caseHelpers } from "./strings.js";

const NS = "svh.";

/**
 * Thin wrapper over t() for the server sheets (catalog namespace `svh`, i18n/locales/svh.*.js).
 *   s.key        plain text (s[key] is undefined for an unknown key)
 *   f(key, vars) text with variables / plurals
 * plus Turkish case helpers (dat / gen / acc / abl; the name as written in other languages).
 */
export function svhStrings(t) {
  const f = (key, vars) => t(NS + key, vars);
  const s = new Proxy(
    {},
    {
      get(_, key) {
        if (typeof key !== "string") return undefined;
        const v = t(NS + key);
        return v === NS + key ? undefined : v;
      },
    }
  );
  return { s, f };
}

export function useSvh() {
  const { t, locale } = useLocale();
  return useMemo(() => ({ ...svhStrings(t), locale, ...caseHelpers(locale) }), [t, locale]);
}
