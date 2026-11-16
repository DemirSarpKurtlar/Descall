/**
 * Parça rafı (Draft B frame B2, left column): the sellable Market 2.0 catalog with search,
 * category chips, the palette match score on every item ("Palete uyanlar önce"), drag to
 * an empty slot (it snaps in), double click to place, and a tip for the best item for
 * the first empty slot. A2's "katalog çekmecesi" is this rack filtered to the slot the
 * admin clicked.
 */
import { useMemo } from "react";
import { useLocale } from "../../../context/LocaleContext";
import { Search, Sparkles } from "./icons.js";
import { RarityPill, Skel, Switch, Thumb, useFmt, useItemName } from "./ui.jsx";
import { SET_SLOTS, itemPaletteScore } from "./shop2Model.js";

export const RACK_CHIPS = ["all", "avatar_frame", "banner", "profile_color", "profile_badge", "avatar_effect", "chat_bubble", "voice_tile", "join_sound"];

export function rankRack(items, { chip, q, palette, setKey, byPalette, locale, nameOf }) {
  const fold = (s) => String(s || "").toLocaleLowerCase("tr-TR");
  const term = fold(q).trim();
  const list = (items || [])
    .filter((it) => SET_SLOTS.includes(it.category))
    .filter((it) => chip === "all" || it.category === chip)
    .filter((it) => !term || fold(nameOf(it, locale)).includes(term))
    .map((it) => ({ item: it, score: itemPaletteScore(it, palette, setKey) }));
  if (byPalette) list.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  return list;
}

export default function PieceRack({ items, total, loading, chip, onChip, q, onQ, byPalette, onByPalette, palette, setKey, pieces, onPlace, targetSlot, pulse }) {
  const { t, locale } = useLocale();
  const f = useFmt();
  const name = useItemName();
  const list = useMemo(() => rankRack(items, { chip, q, palette, setKey, byPalette, locale, nameOf: (it) => name(it) }), [items, chip, q, palette, setKey, byPalette, locale, name]);
  const used = new Set(Object.values(pieces || {}).map((p) => p?.id));
  // Tip: the best item for the first empty slot.
  const empty = SET_SLOTS.find((s) => !pieces?.[s]);
  const tip = useMemo(() => {
    if (!empty) return null;
    const best = (items || [])
      .filter((it) => it.category === empty && !used.has(it.id))
      .map((it) => ({ it, s: itemPaletteScore(it, palette, setKey) ?? 0 }))
      .sort((a, b) => b.s - a.s)[0];
    return best ? best.it : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empty, items, palette, setKey, pieces]);

  return (
    <div className={`as2-rack${pulse ? " is-pulse" : ""}`} key={pulse || 0} data-testid="as2-rack">
      <label className="as2-search is-wide">
        <Search size={15} />
        <input value={q} onChange={(e) => onQ(e.target.value)} placeholder={t("adminShop2.rack.search")} aria-label={t("adminShop2.rack.search")} />
      </label>
      <div className="as2-chips">
        {RACK_CHIPS.map((c) => (
          <button key={c} type="button" className={`as2-chipb${chip === c ? " is-on" : ""}${targetSlot === c ? " is-target" : ""}`} onClick={() => onChip(c)} aria-pressed={chip === c}>
            {t(c === "all" ? "adminShop2.rack.all" : `adminShop2.catShort.${c}`)}
          </button>
        ))}
      </div>
      <label className="as2-tg as2-rack-pal">
        <Switch checked={byPalette} onChange={onByPalette} label={t("adminShop2.rack.byPalette")} />
        <span>{t("adminShop2.rack.byPalette")}</span>
        <small className="as2-muted as2-ml">{t("adminShop2.rack.match")}</small>
      </label>
      <div className="as2-rack-grid">
        {loading ? Array.from({ length: 6 }, (_, i) => <Skel key={i} h={112} r={14} />) : null}
        {!loading && !list.length ? <p className="as2-empty">{t("adminShop2.rack.empty")}</p> : null}
        {list.slice(0, 120).map(({ item, score }) => (
          <button
            key={item.id}
            type="button"
            className={`as2-ri${used.has(item.id) ? " is-used" : ""}${targetSlot === item.category ? " is-fit" : ""}${tip?.id === item.id ? " is-tip" : ""}`}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData("text/x-as2-item", String(item.id));
              e.dataTransfer.effectAllowed = "copy";
            }}
            onDoubleClick={() => onPlace(item)}
            onClick={() => targetSlot === item.category && onPlace(item)}
            title={t("adminShop2.rack.dragHint")}
            data-testid={`as2-rack-item-${item.id}`}
          >
            {score != null ? <span className={`as2-ri-score tnum${score >= 80 ? " is-hi" : score >= 60 ? " is-mid" : " is-lo"}`}>{score}</span> : null}
            <Thumb item={item} size={44} />
            <b>{name(item)}</b>
            <span className="as2-ri-p">
              <RarityPill rarity={item.rarity} />
              <span className="tnum">{f.n(item.price_descoin)}</span>
            </span>
          </button>
        ))}
      </div>
      <div className="as2-rack-foot">
        <span className="as2-muted tnum">{t("adminShop2.rack.count", { n: f.n(total || items?.length || 0) })}</span>
      </div>
      {tip ? (
        <p className="as2-tip">
          <Sparkles size={14} />
          <span>{t("adminShop2.rack.tip", { name: name(tip), slot: t(`adminShop2.catShort.${empty}`).toLocaleLowerCase(locale) })}</span>
        </p>
      ) : null}
    </div>
  );
}


