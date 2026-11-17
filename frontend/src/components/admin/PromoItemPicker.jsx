/**
 * Promosyon Kodları › "Mağaza eşyası": a searchable picker over the whole shop (Market 2.0
 * s2- catalog plus country flags, GET /admin/promo-codes/shop-items). Category chips with
 * counts, names in the UI language, rarity, set piece tag, price and the item art; arrow keys
 * and Enter pick, Escape closes. The chosen item shows as a preview card under the field.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Check, Search, ShoppingBag } from "../ui/Icon.jsx";
import { localText } from "../../lib/shop2Logic.js";
import { countryCode, countryName, flagEmoji, searchKey } from "../../lib/countryFlags.js";
import { fmtNum } from "../../lib/promoCode";

const RARITY_COLOR = { common: "#9aa3b8", rare: "#5ea2ff", epic: "#b98bff", legendary: "#ffb340", mythic: "#ff6fd8" };

/** Item name in the UI language (s2 i18n, Intl country names, then the stored name). */
export function promoItemName(item, locale) {
  if (!item) return "";
  if (item.category === "countries") {
    try {
      const n = countryName(item, locale);
      if (n) return n;
    } catch { /* stored name below */ }
  }
  return localText(item.i18n?.name, locale) || String(item.name || "");
}

function artOf(item) {
  const src = item?.preview_url || item?.asset_url || "";
  return /^(https?:|\/|data:image\/)/.test(src) ? src : "";
}

function ItemArt({ item, size = 32, wide = false }) {
  const flag = item?.category === "countries" ? flagEmoji(countryCode(item) || "") : "";
  const src = flag ? "" : artOf(item);
  const style = wide ? { width: size * 3, height: size } : { width: size, height: size };
  return (
    <span className={`pi-art${wide ? " is-wide" : ""}`} style={style} aria-hidden="true">
      {flag ? <span className="pi-flag" style={{ fontSize: Math.round(size * 0.62) }}>{flag}</span>
        : src ? <img src={src} alt="" loading="lazy" decoding="async" draggable={false} />
          : <ShoppingBag size={Math.round(size * 0.5)} />}
    </span>
  );
}

const isWide = (item) => item?.category === "banner" || item?.category === "profile_background";

export default function PromoItemPicker({ items, value, onChange, t, locale }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [active, setActive] = useState(0);
  const box = useRef(null);
  const listRef = useRef(null);

  const named = useMemo(() => (items || []).map((it) => {
    const name = promoItemName(it, locale);
    const en = localText(it.i18n?.name, "en") || String(it.name || "");
    return { it, name, key: `${searchKey(name)} ${searchKey(en)} ${name.toLocaleLowerCase(locale)} ${String(it.sku || "").toLowerCase()}` };
  }), [items, locale]);
  const cats = useMemo(() => {
    const m = new Map();
    for (const { it } of named) m.set(it.category, (m.get(it.category) || 0) + 1);
    return [...m.entries()];
  }, [named]);
  const list = useMemo(() => {
    const raw = q.trim();
    const needle = searchKey(raw);
    const plain = raw.toLocaleLowerCase(locale);
    return named.filter(({ it, key }) => (cat === "all" || it.category === cat)
      && (!raw || (needle && key.includes(needle)) || key.includes(plain)));
  }, [named, q, cat, locale]);
  const cur = (items || []).find((i) => String(i.id) === String(value)) || null;
  const catLabel = (c) => {
    const k = `shop2.cat.${c}`;
    const v = t(k);
    return v && v !== k ? v : c;
  };
  const rarityLabel = (r) => {
    const k = `shop2.rarity.${r}`;
    const v = t(k);
    return v && v !== k ? v : "";
  };

  useEffect(() => { setActive(0); }, [q, cat]);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("pointerdown", close, true);
    return () => document.removeEventListener("pointerdown", close, true);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector(`[data-idx="${active}"]`)?.scrollIntoView?.({ block: "nearest" });
  }, [active, open]);

  const pick = (it) => {
    onChange(String(it.id));
    setOpen(false);
  };
  const onKey = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      e.nativeEvent?.stopImmediatePropagation?.();
      setOpen(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(list.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter" && list[active]) {
      e.preventDefault();
      pick(list[active].it);
    }
  };

  const rarity = cur?.rarity && RARITY_COLOR[cur.rarity] ? cur.rarity : null;
  const desc = cur ? localText(cur.i18n?.description, locale) || String(cur.description || "") : "";
  return (
    <>
      <div className="pi-field" ref={box} onKeyDown={onKey}>
        <button type="button" className={`mt-in pi-trigger${open ? " is-open" : ""}`} aria-haspopup="listbox" aria-expanded={open}
          disabled={!items} onClick={() => setOpen((v) => !v)}>
          {cur ? <><ItemArt item={cur} size={22} /><b>{promoItemName(cur, locale)}</b>
            <span className="mt-muted pi-trigger-sub">{catLabel(cur.category)} · <span className="tnum">{fmtNum(cur.price_descoin)} DC</span></span></>
            : <span className="mt-muted pi-trigger-sub">{items ? t("promo.itemPick") : t("promo.itemLoading")}</span>}
          <ChevronDown size={14} />
        </button>
        {open ? (
          <div className="pi-pop">
            <label className="mt-in pi-search"><Search size={14} className="mt-i" />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("promo.itemSearch")} aria-label={t("promo.itemSearch")}
                role="combobox" aria-expanded="true" aria-controls="pi-listbox" aria-activedescendant={list[active] ? `pi-opt-${list[active].it.id}` : undefined} />
              <span className="mt-muted tnum pi-count">{t("promo.itemCount", { n: fmtNum(list.length) })}</span>
            </label>
            <div className="pi-cats" role="tablist" aria-label={t("promo.item")}>
              <button type="button" role="tab" aria-selected={cat === "all"} className={cat === "all" ? "on" : ""} onClick={() => setCat("all")}>
                {t("promo.itemAll")} <i className="tnum">{fmtNum(named.length)}</i></button>
              {cats.map(([c, n]) => (
                <button key={c} type="button" role="tab" aria-selected={cat === c} className={cat === c ? "on" : ""} onClick={() => setCat(c)}>
                  {catLabel(c)} <i className="tnum">{fmtNum(n)}</i></button>
              ))}
            </div>
            <div className="pi-list" role="listbox" id="pi-listbox" aria-label={t("promo.item")} ref={listRef}>
              {!list.length ? <div className="pi-empty">{t("promo.itemNone")}</div> : null}
              {list.map(({ it, name }, idx) => {
                const on = String(it.id) === String(value);
                const r = RARITY_COLOR[it.rarity] ? it.rarity : null;
                return (
                  <button key={it.id} id={`pi-opt-${it.id}`} data-idx={idx} type="button" role="option" aria-selected={on}
                    className={`pi-row${on ? " on" : ""}${idx === active ? " is-active" : ""}`}
                    onMouseEnter={() => setActive(idx)} onClick={() => pick(it)}>
                    <ItemArt item={it} size={30} />
                    <span className="pi-copy">
                      <b>{name}</b>
                      <span>
                        {cat === "all" ? `${catLabel(it.category)} · ` : ""}
                        {r ? <em style={{ color: RARITY_COLOR[r] }}>{rarityLabel(r)}</em> : null}
                        {it.set_key ? <span className="pi-set">{t("promo.itemSetPiece")}</span> : null}
                      </span>
                    </span>
                    <span className="tnum pi-price">{fmtNum(it.price_descoin)} DC</span>
                    {on ? <Check size={14} className="pi-check" /> : null}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
      {cur ? (
        <div className="pi-preview" style={rarity ? { "--pi-r": RARITY_COLOR[rarity] } : undefined}>
          <ItemArt item={cur} size={isWide(cur) ? 52 : 60} wide={isWide(cur)} />
          <div className="pi-preview-copy">
            <b>{promoItemName(cur, locale)}</b>
            <span className="pi-preview-tags">
              <span className="pi-tag">{catLabel(cur.category)}</span>
              {rarity ? <span className="pi-tag is-r">{rarityLabel(rarity)}</span> : null}
              {cur.set_key ? <span className="pi-tag">{t("promo.itemSetPiece")}</span> : null}
              <span className="pi-tag tnum">{fmtNum(cur.price_descoin)} DC</span>
            </span>
            {desc ? <span className="pi-preview-desc">{desc}</span> : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
