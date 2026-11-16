// Market search (draft C "Ürün, set, renk veya arkadaş ara", Ctrl K): today's storefront,
// sets (by name or colour), wishlist, inventory and the whole live s2 catalog in one list.
// An item result opens where it is sold (requestShopFocus: storefront card, set, catalog).
import { useEffect, useMemo, useState } from "react";
import shop2Api from "../../lib/shop2Api.js";
import { normalizeItem } from "../../lib/shop2Logic.js";
import { requestShopFocus } from "../../lib/callCoinPrefs.js";
import { useLocale } from "../../context/LocaleContext";
import { useS2 } from "./Shop2Context.js";
import { Layer, Price } from "./Shop2Bits.jsx";
import Shop2Art from "./Shop2Art.jsx";
import { setGradient } from "./Shop2Vitrin.jsx";
import { Search } from "./shop2Icons.jsx";

const norm = (s) => String(s || "").toLocaleLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export default function Shop2Search({ onClose }) {
  const { t } = useLocale();
  const s2 = useS2();
  const [q, setQ] = useState("");
  const [catalog, setCatalog] = useState(null);
  useEffect(() => {
    let alive = true;
    shop2Api.catalog().then(
      (res) => alive && setCatalog((res?.items || []).map((x) => normalizeItem(x)).filter(Boolean)),
      () => alive && setCatalog([])
    );
    return () => {
      alive = false;
    };
  }, []);
  const results = useMemo(() => {
    const n = norm(q).trim();
    const out = [];
    const seen = new Set();
    const push = (r) => {
      if (seen.has(r.key)) return;
      seen.add(r.key);
      out.push(r);
    };
    const matchItem = (it) => !n || norm(s2.itemName(it)).includes(n) || norm(t(`shop2.cat.${it.category}`)).includes(n);
    for (const s of s2.data.storefront?.slots || []) if (matchItem(s.item)) push({ key: `i${s.item.id}`, kind: "today", item: s.item, price: s.price });
    for (const set of s2.data.sets.length ? s2.data.sets : s2.data.storefront?.featuredSets || []) {
      if (!n || norm(s2.setName(set)).includes(n) || (set.palette || []).some((c) => norm(c).includes(n)) || norm(set.key).includes(n)) push({ key: `s${set.key}`, kind: "set", set });
    }
    for (const it of s2.data.wishlist) if (matchItem(it)) push({ key: `i${it.id}`, kind: "wish", item: it, price: it.price_descoin });
    if (n) for (const row of s2.inventory) if (row.item && matchItem(row.item)) push({ key: `i${row.item.id}`, kind: "owned", item: row.item });
    if (n && catalog) for (const it of catalog) if (!s2.owned.has(it.id) && matchItem(it)) push({ key: `i${it.id}`, kind: "catalog", item: it, price: it.price_descoin });
    return out.slice(0, 14);
  }, [q, s2, t, catalog]);
  const go = (r) => {
    if (r.kind === "set") s2.openSet(r.set.key);
    else if (r.kind === "today" || r.kind === "catalog") requestShopFocus({ itemId: r.item.id });
    else if (r.kind === "wish") s2.setTab("wishlist");
    else s2.setTab("inventory");
    onClose();
  };
  return (
    <Layer kind={s2.layout === "phone" ? "sheet" : "dialog"} onClose={onClose} label={t("shop2.search.label")} className="s2-dialog is-search">
      <label className="s2-searchbox is-lg">
        <Search size={17} />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("shop2.search.placeholder")} aria-label={t("shop2.search.label")} />
      </label>
      <ul className="s2-results" role="listbox" aria-label={t("shop2.search.label")}>
        {results.length ? results.map((r) => (
          <li key={r.key}>
            <button type="button" role="option" aria-selected="false" onClick={() => go(r)}>
              {r.kind === "set" ? <span className="s2-set-thumb" style={{ background: setGradient(r.set.palette) }} /> : <Shop2Art item={r.item} size="chip" me={s2.me} />}
              <span className="s2-results-t">
                <b>{r.kind === "set" ? s2.setName(r.set) : s2.itemName(r.item)}</b>
                <small>{t(`shop2.search.kind.${r.kind}`)}{r.item ? ` · ${t(`shop2.cat.${r.item.category}`)}` : ""}</small>
              </span>
              {r.price != null ? <Price value={r.price} size="sm" /> : r.kind === "set" ? <Price value={r.set.yourPrice ?? r.set.setPrice} size="sm" /> : null}
            </button>
          </li>
        )) : <li className="s2-muted s2-results-empty">{t("shop2.search.none")}</li>}
      </ul>
    </Layer>
  );
}
