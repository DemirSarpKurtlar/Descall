import { useCallback } from "react";
import { useLocale } from "../../context/LocaleContext";
import { formatNumber } from "../../i18n/format";
import { ART_BY_ID, SpecialBadgeIcon } from "./specialBadgeArt.jsx";
import { bugStatsOf, catalogRow, equippedFor, useSpecialBadgeStore } from "../../lib/specialBadges";
import { tipLines } from "../../lib/bugHunterText.js";

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

/** Bug Hunter tooltip lines for a badge entry ({ id, level, bugs, since, severity }), or null. */
export function useBugHunterTip(entry) {
  const { t, locale, name } = useBadgeCopy();
  const stats = bugStatsOf(entry);
  if (!stats) return null;
  return { stats, ...tipLines(stats, { t, locale, name: name("bughunter") }) };
}

/** Badge icon with a spoken name ("Facebook rozeti, Nadir"). `entry` carries the Bug Hunter level. */
export function SpecialBadgeMark({ id, size = 17, className = "", decorative = false, entry = null }) {
  const { t, name, tierLabel } = useBadgeCopy();
  const tip = useBugHunterTip(entry && entry.id === id ? entry : null);
  if (!ART_BY_ID[id]) return null;
  const title = tip ? tip.title : name(id);
  const label = decorative ? "" : t("badges.badgeTierAria", { name: title, tier: tierLabel(id) });
  const icon = <SpecialBadgeIcon id={id} size={size} className={className} label={label} level={tip?.stats.level || 0} />;
  if (!tip || decorative) return icon;
  return <span className="sb-mark-tip" title={[tip.title, tip.line, tip.mix].filter(Boolean).join("\n")}>{icon}</span>;
}

/**
 * Icon + name pill (profile row, hover card, own panel). Bug Hunter shows its level
 * ("Bug Hunter II") and a tooltip: "12 gerçek bug buldu · Kasım 2026'dan beri" + severity mix.
 */
export function SpecialBadgeChip({ id, className = "", entry = null }) {
  const { name, tierLabel } = useBadgeCopy();
  const tip = useBugHunterTip(entry && entry.id === id ? entry : null);
  const tier = ART_BY_ID[id]?.tier;
  if (!tier) return null;
  const cls = `sb-chip sb-chip-${tier}${id === "facebook" ? " sb-chip-fb" : id === "kk22" ? " sb-chip-kk22" : ""}${tip ? " sb-chip-bh" : ""}${className ? ` ${className}` : ""}`;
  if (!tip) {
    return (
      <span className={cls} title={`${name(id)} · ${tierLabel(id)}`}>
        <SpecialBadgeIcon id={id} size={18} />
        <span>{name(id)}</span>
      </span>
    );
  }
  return (
    <span className={cls} tabIndex={0} aria-label={[tip.title, tip.line, tip.mix].filter(Boolean).join(". ")}>
      <SpecialBadgeIcon id={id} size={18} level={tip.stats.level} />
      <span>{tip.title}</span>
      <span className="sb-bh-tip" role="tooltip">
        <SpecialBadgeIcon id={id} size={34} level={tip.stats.level} />
        <span className="sb-bh-tip-t">
          <b>{tip.title}</b>
          {tip.line ? <span>{tip.line}</span> : null}
          {tip.mix ? <small>{tip.mix}</small> : null}
        </span>
      </span>
    </span>
  );
}

/** The one special badge a person wears, next to their country badge. */
export function EquippedSpecialBadge({ user, compact = false, className = "" }) {
  useSpecialBadgeStore();
  const eq = equippedFor(user);
  if (!eq) return null;
  if (compact) return <SpecialBadgeMark id={eq.id} size={17} entry={eq} className={`sb-compact${className ? ` ${className}` : ""}`} />;
  return <SpecialBadgeChip id={eq.id} entry={eq} className={className} />;
}
