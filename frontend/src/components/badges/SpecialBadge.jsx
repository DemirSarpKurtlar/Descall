import { useCallback } from "react";
import { useLocale } from "../../context/LocaleContext";
import { formatNumber } from "../../i18n/format";
import { ART_BY_ID, SpecialBadgeIcon } from "./specialBadgeArt.jsx";
import { catalogRow, equippedFor, useSpecialBadgeStore } from "../../lib/specialBadges";

/** Localised copy for a badge id: i18n first, then the server catalog, then the id. */
export function useBadgeCopy() {
  const { t, locale } = useLocale();
  const name = useCallback((id) => {
    const k = `badges.names.${id}`;
    const v = t(k);
    return v && v !== k ? v : catalogRow(id)?.name || String(id || "");
  }, [t]);
  const desc = useCallback((id) => {
    const k = `badges.desc.${id}`;
    const v = t(k);
    return v && v !== k ? v : catalogRow(id)?.description || "";
  }, [t]);
  const tierLabel = useCallback((tierOrId) => {
    const tier = ART_BY_ID[tierOrId]?.tier || tierOrId;
    return t(`badges.tier_${tier}`);
  }, [t]);
  const tierOf = (id) => ART_BY_ID[id]?.tier || "nadir";
  const num = useCallback((n) => formatNumber(n || 0, locale), [locale]);
  return { t, locale, name, desc, tierLabel, tierOf, num };
}

/** Badge icon with a spoken name ("Facebook rozeti, Nadir"). */
export function SpecialBadgeMark({ id, size = 17, className = "", decorative = false }) {
  const { t, name, tierLabel } = useBadgeCopy();
  if (!ART_BY_ID[id]) return null;
  const label = decorative ? "" : t("badges.badgeTierAria", { name: name(id), tier: tierLabel(id) });
  return <SpecialBadgeIcon id={id} size={size} className={className} label={label} />;
}

/** Icon + name pill (profile row, hover card, own panel). */
export function SpecialBadgeChip({ id, className = "" }) {
  const { name, tierLabel } = useBadgeCopy();
  const tier = ART_BY_ID[id]?.tier;
  if (!tier) return null;
  return (
    <span className={`sb-chip sb-chip-${tier}${id === "facebook" ? " sb-chip-fb" : ""}${className ? ` ${className}` : ""}`} title={`${name(id)} · ${tierLabel(id)}`}>
      <SpecialBadgeIcon id={id} size={18} />
      <span>{name(id)}</span>
    </span>
  );
}

/** The one special badge a person wears, next to their country badge. */
export function EquippedSpecialBadge({ user, compact = false, className = "" }) {
  useSpecialBadgeStore();
  const eq = equippedFor(user);
  if (!eq) return null;
  if (compact) return <SpecialBadgeMark id={eq.id} size={17} className={`sb-compact${className ? ` ${className}` : ""}`} />;
  return <SpecialBadgeChip id={eq.id} className={className} />;
}
