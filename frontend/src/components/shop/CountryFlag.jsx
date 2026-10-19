import { useEffect } from "react";
import { useLocale, useT } from "../../context/LocaleContext";
import { countryCode, countryName, flagEmoji, installFlagFont, isCountryItem } from "../../lib/countryFlags";

/**
 * One flag glyph. Windows cannot draw flag emoji, so `installFlagFont` adds
 * `html.flag-font` there and the bundled Twemoji flag subset takes over
 * (public/fonts/TwemojiCountryFlags.woff2, CC-BY 4.0, see Settings → Licences).
 */
export function CountryFlag({ item, code, size = 20, className = "", decorative = false, title }) {
  const t = useT();
  const { locale } = useLocale();
  useEffect(() => {
    installFlagFont();
  }, []);
  const cc = code || countryCode(item);
  const emoji = flagEmoji(cc);
  if (!emoji) return null;
  const name = item ? countryName(item, locale) : cc;
  const label = t("{country} flag", { country: name });
  return (
    <span
      className={`country-flag ${className}`.trim()}
      style={{ fontSize: size }}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : label}
      aria-hidden={decorative ? "true" : undefined}
      title={title === false ? undefined : title || name}
      data-code={cc}
    >
      {emoji}
    </span>
  );
}

/**
 * The equipped country of `user`. Full: flag + name pill (profile card, hover
 * card, profile modal, shop preview). Compact: flag only, name in the tooltip
 * and accessible label (member list, message header).
 */
export function CountryBadge({ user, item: itemProp, compact = false, className = "" }) {
  const { locale } = useLocale();
  const item = itemProp || user?.equippedCountry;
  if (!isCountryItem(item)) return null;
  if (compact) {
    return <CountryFlag item={item} size={14} className={`cosmetic-country-flag ${className}`.trim()} />;
  }
  return (
    <span className={`cosmetic-country-badge ${className}`.trim()}>
      <CountryFlag item={item} size={15} decorative />
      <span className="cosmetic-country-name">{countryName(item, locale)}</span>
    </span>
  );
}

export default CountryFlag;
