import { useMemo } from "react";
import { useLocation } from "react-router-dom";
import { useLocale } from "../context/localeContextInstance";
import { formatDate } from "../i18n/format.js";
import { marketingHref } from "./marketingHref.js";
import { isPrefixedLocale } from "./siteLocales.js";

const same = (s) => s;

/** "2026-08-11" in the visitor's language ("11. August 2026"). UTC, so the day never shifts. */
export function formatPostDate(iso, locale) {
  return formatDate(`${iso}T00:00:00Z`, locale, { dateStyle: "long", timeZone: "UTC" }) || iso;
}

/**
 * Copy, links and dates that only change on the prefixed site languages (/de, /pt-br, ...).
 * English and Turkish get the values back untouched, so their pages render exactly as
 * before: `text` is t() for a prefixed locale and the identity otherwise, `href` points
 * at the /<prefix> twin when that locale serves it, `date` formats an ISO day with Intl,
 * `crumbs` / `faq` prepare JSON-LD input the same way.
 */
export function useMirrorCopy() {
  const { locale, t } = useLocale();
  const { pathname } = useLocation();
  return useMemo(() => {
    const prefixed = isPrefixedLocale(locale);
    const text = prefixed ? t : same;
    const href = prefixed ? (to) => marketingHref(to, { locale, pathname }) : same;
    return {
      locale,
      prefixed,
      text,
      href,
      date: prefixed ? (iso) => formatPostDate(iso, locale) : same,
      /** Breadcrumbs for JSON-LD: translated labels, localized links. */
      crumbs: (list) => (prefixed ? list.map((c) => ({ ...c, label: text(c.label), to: href(c.to) })) : list),
      /** FAQ items for JSON-LD in the page language. */
      faq: (items) => (prefixed ? items.map((f) => ({ q: text(f.q), a: text(f.a) })) : items),
    };
  }, [locale, t, pathname]);
}
