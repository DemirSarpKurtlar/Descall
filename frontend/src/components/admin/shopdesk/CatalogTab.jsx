/**
 * Katalog = Draft A "Kontrol masası": KPI tiles, the catalog table (category chips, search,
 * status / rarity / on-sale filters, sort, bulk select with grouped actions), and the right
 * rail (Hızlı işlem + DesCoin mutabakatı).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { adminFetch } from "../../../api/adminHttp";
import { useLocale } from "../../../context/LocaleContext";
import { copyText } from "../../../lib/copyText.js";
import DossierMenu from "../dossier/DossierMenu.jsx";
import {
  BarChart3, CheckCircle2, ChevronDown, CircleSlash, Clock, Coins, Download, Edit3, Filter, Gift, Layers, MoreHorizontal,
  Package, Plus, Scale, Search, ShoppingBag, SortAsc, Star, TrendingUp, Users, Copy,
} from "../../ui/Icon.jsx";
import { Percent, Power, Tag } from "./shopDeskIcons.js";
import {
  PAGE_SIZE, RARITIES, SORTS, STATUS_FILTERS, catalogCsv, categoryCounts, compact, filterItems, itemStatus,
  num, pageList, pageSlice, pctChange, sortItems, splitChips, stockInfo, timeLeft, windowPct,
} from "./shopDeskModel.js";
import { Check2, Dropdown, ItemThumb, NewTag, RarityPill, Skel, Spark, Toggle, downloadText, Empty, errMsg } from "./ui.jsx";
import QuickPanel from "./QuickPanel.jsx";
import ReconcileMini from "./ReconcileMini.jsx";

export default function CatalogTab(props) {
  const { kpis, loading, data, runs, reloadRuns, canCasino, focusQuick } = props;
  return (
    <div className="sdk-catalog-tab">
      <KpiTiles kpis={kpis} loading={loading} reconcile={runs?.data?.latest || data?.reconcile || null} goTab={props.goTab} />
      <div className="sdk-desk">
        <CatalogCard {...props} />
        <aside className="sdk-rail">
          {canCasino ? <QuickPanel items={props.items} focusSignal={focusQuick} onDone={props.afterWrite} showToast={props.showToast} /> : null}
          {canCasino ? <ReconcileMini runs={runs} reloadRuns={reloadRuns} goTab={props.goTab} /> : null}
        </aside>
      </div>
    </div>
  );
}

function Tile({ icon: Icon, label, value, sub, tone, onClick, testId }) {
  const Tag2 = onClick ? "button" : "div";
  return (
    <Tag2 type={onClick ? "button" : undefined} className={`sdk-kpi${tone ? ` is-${tone}` : ""}`} onClick={onClick} data-testid={testId}>
      <span className="sdk-kpi-lab">
        <Icon size={17} />
        {label}
      </span>
      <b className="sdk-kpi-n">{value}</b>
      <span className="sdk-kpi-sub">{sub}</span>
    </Tag2>
  );
}

function KpiTiles({ kpis, loading, reconcile, goTab }) {
  const { t, locale } = useLocale();
  if (loading || !kpis) {
    return (
      <div className="sdk-kpis">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="sdk-kpi">
            <Skel h={12} w="60%" />
            <Skel h={26} w="45%" />
            <Skel h={11} w="70%" />
          </div>
        ))}
      </div>
    );
  }
  const salesPct = pctChange(kpis.sales7, kpis.salesPrev7);
  const mism = reconcile ? (reconcile.error ? null : Number(reconcile.mismatch_count) || 0) : null;
  const runAt = reconcile?.started_at ? new Date(reconcile.started_at) : null;
  const time = runAt ? runAt.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }) : "";
  return (
    <div className="sdk-kpis">
      <Tile
        icon={ShoppingBag}
        label={t("shopDesk.kpi.active")}
        value={
          <>
            {num(kpis.activeItems, locale)} <small>/ {num(kpis.totalItems, locale)}</small>
          </>
        }
        sub={t("shopDesk.kpi.activeSub", { inactive: num(kpis.inactiveItems, locale), retired: num(kpis.retiredItems, locale) })}
      />
      <Tile
        icon={TrendingUp}
        label={t("shopDesk.kpi.sales7")}
        value={num(kpis.sales7, locale)}
        sub={
          salesPct == null ? (
            t("shopDesk.kpi.noPrev")
          ) : (
            <>
              <em className={salesPct >= 0 ? "is-up" : "is-down"}>{salesPct >= 0 ? `+${salesPct}%` : `${salesPct}%`}</em> {t("shopDesk.kpi.vsPrev")}
            </>
          )
        }
      />
      <Tile
        icon={Coins}
        label={t("shopDesk.kpi.spent7")}
        value={compact(kpis.spent7, locale)}
        sub={t("shopDesk.kpi.avg", { n: num(kpis.avg7, locale) })}
      />
      <Tile
        icon={Gift}
        label={t("shopDesk.kpi.gifts7")}
        value={kpis.gifts7 == null ? "-" : num(kpis.gifts7, locale)}
        sub={t("shopDesk.kpi.giftsSub", { items: num(kpis.giftItems7 || 0, locale), coins: num(kpis.giftCoins7 || 0, locale) })}
        onClick={() => goTab("gifts")}
      />
      <Tile
        icon={Percent}
        label={t("shopDesk.kpi.campaigns")}
        value={num(kpis.activeCampaigns, locale)}
        sub={
          kpis.nearestCampaign
            ? t("shopDesk.kpi.campaignEnds", { name: kpis.nearestCampaign.name, date: new Date(kpis.nearestCampaign.endsAt).toLocaleDateString(locale, { day: "numeric", month: "short" }) })
            : t("shopDesk.kpi.noCampaign")
        }
        onClick={() => goTab("storefront")}
      />
      <Tile
        icon={Scale}
        tone={mism ? "amber" : reconcile?.error ? "red" : "green"}
        label={t("shopDesk.kpi.reconcile")}
        value={reconcile == null ? "-" : reconcile.error ? t("shopDesk.kpi.reconcileError") : mism ? t("shopDesk.kpi.mismatches", { n: mism }) : t("shopDesk.kpi.clean")}
        sub={reconcile ? t("shopDesk.kpi.reconcileSub", { time, drift: num(reconcile.abs_drift || 0, locale) }) : t("shopDesk.kpi.noRun")}
        onClick={() => goTab("reconcile")}
        testId="sdk-kpi-reconcile"
      />
    </div>
  );
}

function CatalogCard({ items, data, loading, openDrawer, openCreate, openBulk, openGift, afterWrite, showToast, goTab, presetFilter, clearPreset }) {
  const { t, locale } = useLocale();
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [rarity, setRarity] = useState("all");
  const [sale, setSale] = useState(false);
  const [sort, setSort] = useState("best7");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(() => new Set());
  const [busy, setBusy] = useState(() => new Set());
  const [overrides, setOverrides] = useState(() => new Map());
  const moreRef = useRef(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const shelfRef = useRef(null);
  const [shelfOpen, setShelfOpen] = useState(false);

  useEffect(() => {
    if (!presetFilter) return;
    if (presetFilter.status) setStatus(presetFilter.status);
    if (presetFilter.category) setCategory(presetFilter.category);
    setPage(1);
    clearPreset?.();
  }, [presetFilter, clearPreset]);

  const merged = useMemo(() => items.map((it) => (overrides.has(it.id) ? { ...it, ...overrides.get(it.id) } : it)), [items, overrides]);
  useEffect(() => setOverrides(new Map()), [items]);
  const counts = useMemo(() => categoryCounts(merged), [merged]);
  const chips = useMemo(() => splitChips(counts), [counts]);
  const filtered = useMemo(() => sortItems(filterItems(merged, { q, category, status, rarity, sale }), sort), [merged, q, category, status, rarity, sale, sort]);
  const { rows, page: cur, pages, from, to } = pageSlice(filtered, page, PAGE_SIZE);
  useEffect(() => setPage(1), [q, category, status, rarity, sale, sort]);

  const visible = merged.filter((it) => !it.retired);
  const activeCount = visible.filter((it) => it.active).length;
  const selIds = [...selected].filter((id) => merged.some((it) => it.id === id));
  const allOnPage = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const manualSections = (data?.sections || []).filter((s) => s.kind === "manual");

  const toggleSel = (id, on) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const setActive = async (item, active) => {
    setBusy((b) => new Set(b).add(item.id));
    setOverrides((m) => new Map(m).set(item.id, { active }));
    try {
      await adminFetch(`/shop/desk/items/${item.id}`, { method: "PATCH", body: JSON.stringify({ active }) });
      afterWrite(active ? t("shopDesk.toastActivated", { name: item.name }) : t("shopDesk.toastDeactivated", { name: item.name }));
    } catch (e) {
      setOverrides((m) => {
        const n = new Map(m);
        n.delete(item.id);
        return n;
      });
      showToast(errMsg(t, e), null, "bad");
    } finally {
      setBusy((b) => {
        const n = new Set(b);
        n.delete(item.id);
        return n;
      });
    }
  };

  const runBulk = async (action, extra = {}) => {
    try {
      const r = await adminFetch("/shop/desk/bulk", { method: "POST", body: JSON.stringify({ action, itemIds: selIds, ...extra }) });
      setSelected(new Set());
      afterWrite(t("shopDesk.toastBulk", { n: r.changed }));
    } catch (e) {
      showToast(errMsg(t, e), null, "bad");
    }
  };

  const statusOptions = STATUS_FILTERS.map((id) => ({ id, label: t(`shopDesk.status.${id}`) }));
  const rarityOptions = [{ id: "all", label: t("shopDesk.all") }, ...RARITIES.map((r) => ({ id: r, label: t(`shopDesk.rarity.${r}`) }))];
  const sortOptions = SORTS.map((id) => ({ id, label: t(`shopDesk.sort.${id}`) }));

  return (
    <section className="sdk-card sdk-catalog" aria-labelledby="sdk-cat-h">
      <div className="sdk-card-head">
        <h2 id="sdk-cat-h">
          <ShoppingBag size={20} />
          {t("shopDesk.catalog")}
          <span className="sdk-muted">{t("shopDesk.catalogCount", { active: num(activeCount, locale), total: num(visible.length, locale) })}</span>
        </h2>
        <div className="sdk-card-actions">
          <button type="button" className="sdk-btn" onClick={() => goTab("categories")}>
            <Layers size={17} />
            {t("shopDesk.categories")}
            <NewTag />
          </button>
          <button type="button" className="sdk-btn" onClick={() => downloadText(`descall-shop-${new Date().toISOString().slice(0, 10)}.csv`, catalogCsv(filtered))}>
            <Download size={17} />
            {t("shopDesk.csv")}
          </button>
          <button type="button" className="sdk-btn is-primary" onClick={openCreate} data-testid="sdk-new-item">
            <Plus size={17} />
            {t("shopDesk.newItem")}
          </button>
        </div>
      </div>

      <div className="sdk-chiprow" role="tablist" aria-label={t("shopDesk.categoryFilter")}>
        <button type="button" role="tab" aria-selected={category === "all"} className={`sdk-cchip${category === "all" ? " is-on" : ""}`} onClick={() => setCategory("all")}>
          {t("shopDesk.all")} <span>{num(visible.length, locale)}</span>
        </button>
        {chips.inline.map((c) => (
          <button key={c} type="button" role="tab" aria-selected={category === c} className={`sdk-cchip${category === c ? " is-on" : ""}`} onClick={() => setCategory(c)}>
            {t(`shopDesk.cat.${c}`)} <span>{num(counts.get(c), locale)}</span>
          </button>
        ))}
        {chips.more.length ? (
          <>
            <button
              ref={moreRef}
              type="button"
              className={`sdk-cchip${chips.more.includes(category) ? " is-on" : ""}`}
              aria-haspopup="menu"
              aria-expanded={moreOpen}
              onClick={() => setMoreOpen((v) => !v)}
            >
              {chips.more.includes(category) ? t(`shopDesk.cat.${category}`) : t("shopDesk.moreCategories", { n: chips.more.length })}
              <ChevronDown size={15} />
            </button>
            <DossierMenu
              open={moreOpen}
              anchorRef={moreRef}
              onClose={() => setMoreOpen(false)}
              label={t("shopDesk.categoryFilter")}
              width={250}
              items={chips.more.map((c) => ({ id: c, label: t(`shopDesk.cat.${c}`), sub: t("shopDesk.nItems", { n: num(counts.get(c), locale) }), icon: Tag, onSelect: () => setCategory(c) }))}
            />
          </>
        ) : null}
      </div>

      <div className="sdk-filters">
        <label className="sdk-search-in sdk-filter-q">
          <Search size={17} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("shopDesk.catalogSearchPh")} aria-label={t("shopDesk.catalogSearchPh")} />
          <NewTag />
        </label>
        <Dropdown icon={Filter} label={t("shopDesk.statusLabel")} prefix={t("shopDesk.statusLabel")} value={status} options={statusOptions} onChange={setStatus} />
        <Dropdown label={t("shopDesk.rarityLabel")} prefix={t("shopDesk.rarityLabel")} value={rarity} options={rarityOptions} onChange={setRarity} />
        <button type="button" className={`sdk-dd${sale ? " is-on" : ""}`} aria-pressed={sale} onClick={() => setSale((v) => !v)}>
          <Percent size={16} />
          <span>{t("shopDesk.onSale")}</span>
        </button>
        <span className="sdk-grow" />
        <Dropdown icon={SortAsc} label={t("shopDesk.sortLabel")} value={sort} options={sortOptions} onChange={setSort} />
      </div>

      {selIds.length ? (
        <div className="sdk-bulkbar" role="toolbar" aria-label={t("shopDesk.bulkLabel")} data-testid="sdk-bulkbar">
          <Check2 checked indeterminate={false} onChange={() => setSelected(new Set())} label={t("shopDesk.clearSelection")} />
          <b>{t("shopDesk.selectedN", { n: selIds.length })}</b>
          <span className="sdk-bulk-tag">{t("shopDesk.bulkTag")}</span>
          <span className="sdk-grow" />
          <button type="button" className="sdk-bulk-btn is-green" onClick={() => runBulk("activate")}>
            <Power size={18} />
            {t("shopDesk.bulkActivate")}
          </button>
          <button type="button" className="sdk-bulk-btn is-red" onClick={() => runBulk("deactivate")}>
            <Power size={18} />
            {t("shopDesk.bulkDeactivate")}
          </button>
          <button type="button" className="sdk-bulk-btn" onClick={() => openBulk(selIds, "percent")} data-testid="sdk-bulk-price">
            <Coins size={18} />
            {t("shopDesk.bulkPrice")}
          </button>
          <button type="button" className="sdk-bulk-btn is-amber" onClick={() => openBulk(selIds, "sale")}>
            <Percent size={18} />
            {t("shopDesk.bulkSale")}
          </button>
          <button ref={shelfRef} type="button" className="sdk-bulk-btn is-blue" aria-haspopup="menu" aria-expanded={shelfOpen} onClick={() => setShelfOpen((v) => !v)}>
            <Star size={18} />
            {t("shopDesk.bulkShelf")}
          </button>
          <DossierMenu
            open={shelfOpen}
            anchorRef={shelfRef}
            onClose={() => setShelfOpen(false)}
            label={t("shopDesk.bulkShelf")}
            width={280}
            items={
              manualSections.length
                ? manualSections.map((s) => ({ id: s.id, label: s.title, sub: t("shopDesk.nItems", { n: (s.item_ids || []).length }), icon: Star, onSelect: () => runBulk("section_add", { sectionId: s.id }) }))
                : [{ id: "none", label: t("shopDesk.noManualSection"), sub: t("shopDesk.noManualSectionSub"), icon: Plus, onSelect: () => goTab("storefront") }]
            }
          />
        </div>
      ) : null}

      <div className="sdk-table-wrap">
        <table className="sdk-table" data-testid="sdk-catalog-table">
          <thead>
            <tr>
              <th className="sdk-col-check">
                <Check2
                  checked={allOnPage}
                  indeterminate={rows.some((r) => selected.has(r.id))}
                  onChange={(on) => setSelected((prev) => {
                    const next = new Set(prev);
                    rows.forEach((r) => (on ? next.add(r.id) : next.delete(r.id)));
                    return next;
                  })}
                  label={t("shopDesk.selectPage")}
                />
              </th>
              <th>{t("shopDesk.col.item")}</th>
              <th>{t("shopDesk.col.category")}</th>
              <th>{t("shopDesk.col.price")}</th>
              <th>{t("shopDesk.col.rarity")}</th>
              <th>
                {t("shopDesk.col.sales7")} <NewTag />
              </th>
              <th>
                {t("shopDesk.col.stock")} <NewTag />
              </th>
              <th>{t("shopDesk.col.status")}</th>
              <th aria-label={t("shopDesk.col.actions")} />
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 8 }, (_, i) => (
                  <tr key={i} className="sdk-row">
                    <td colSpan={9}>
                      <Skel h={36} />
                    </td>
                  </tr>
                ))
              : rows.map((it) => (
                  <CatalogRow
                    key={it.id}
                    item={it}
                    selected={selected.has(it.id)}
                    onSelect={(on) => toggleSel(it.id, on)}
                    onOpen={(sub) => openDrawer(it.id, sub)}
                    onActive={(on) => setActive(it, on)}
                    busy={busy.has(it.id)}
                    onGift={() => openGift({ itemId: it.id })}
                    showToast={showToast}
                  />
                ))}
          </tbody>
        </table>
        {!loading && !rows.length ? (
          <Empty icon={Package} title={t("shopDesk.emptyTitle")} body={t("shopDesk.emptyBody")} />
        ) : null}
      </div>

      <footer className="sdk-pager">
        <span className="sdk-muted">{t("shopDesk.showing", { from: num(from, locale), to: num(to, locale), total: num(filtered.length, locale) })}</span>
        <nav aria-label={t("shopDesk.pages")}>
          {pageList(pages, cur).map((p, i) =>
            p === "…" ? (
              <span key={`e${i}`} className="sdk-page is-gap">
                …
              </span>
            ) : (
              <button key={p} type="button" className={`sdk-page${p === cur ? " is-on" : ""}`} aria-current={p === cur ? "page" : undefined} onClick={() => setPage(p)}>
                {p}
              </button>
            )
          )}
        </nav>
      </footer>
    </section>
  );
}

function CatalogRow({ item, selected, onSelect, onOpen, onActive, busy, onGift, showToast }) {
  const { t, locale } = useLocale();
  const menuRef = useRef(null);
  const [menu, setMenu] = useState(false);
  const status = itemStatus(item);
  const pricing = item.pricing || { price: item.price_descoin, list: item.price_descoin, pct: 0 };
  const stock = stockInfo(item);
  const left = timeLeft(item.availability?.endsAt);
  const sold = Number(item.sales?.n7) || 0;
  return (
    <tr className={`sdk-row${selected ? " is-sel" : ""}${status === "retired" || status === "inactive" ? " is-dim" : ""}`} onClick={() => onOpen("edit")} data-testid="sdk-row">
      <td className="sdk-col-check">
        <Check2 checked={selected} onChange={onSelect} label={t("shopDesk.selectItem", { name: item.name })} />
      </td>
      <td>
        <div className="sdk-item">
          <ItemThumb item={item} size={44} />
          <div>
            <b>{item.name}</b>
            <code>{item.sku}</code>
          </div>
        </div>
      </td>
      <td className="sdk-muted">{t(`shopDesk.cat.${item.category}`)}</td>
      <td className="sdk-price tnum">
        {pricing.pct ? (
          <>
            <s>{num(pricing.list, locale)}</s> <b className="is-sale">{num(pricing.price, locale)}</b>
          </>
        ) : (
          <b>{num(pricing.price, locale)}</b>
        )}
      </td>
      <td>
        <RarityPill rarity={item.rarity} />
      </td>
      <td>
        {status === "inactive" || status === "retired" ? (
          <span className="sdk-muted">{t("shopDesk.notOnSale")}</span>
        ) : (
          <span className="sdk-sales">
            <Spark values={item.sales?.series || []} tone={sold ? "brand" : "flat"} />
            <b className="tnum">{num(sold, locale)}</b>
          </span>
        )}
      </td>
      <td>
        <StockCell item={item} stock={stock} left={left} status={status} />
      </td>
      <td onClick={(e) => e.stopPropagation()}>
        <Toggle checked={item.active} disabled={status === "retired"} busy={busy} onChange={onActive} label={t("shopDesk.activeToggle", { name: item.name })} />
      </td>
      <td onClick={(e) => e.stopPropagation()}>
        <button ref={menuRef} type="button" className="sdk-icon-btn" aria-haspopup="menu" aria-expanded={menu} aria-label={t("shopDesk.rowMenu", { name: item.name })} onClick={() => setMenu((v) => !v)}>
          <MoreHorizontal size={18} />
        </button>
        <DossierMenu
          open={menu}
          anchorRef={menuRef}
          onClose={() => setMenu(false)}
          label={t("shopDesk.rowMenu", { name: item.name })}
          width={250}
          items={[
            { id: "edit", label: t("shopDesk.menu.edit"), icon: Edit3, onSelect: () => onOpen("edit") },
            { id: "sales", label: t("shopDesk.menu.sales"), icon: BarChart3, onSelect: () => onOpen("sales") },
            { id: "owners", label: t("shopDesk.menu.owners"), icon: Users, onSelect: () => onOpen("owners") },
            { id: "gift", label: t("shopDesk.menu.gift"), icon: Gift, onSelect: onGift },
            {
              id: "sku",
              label: t("shopDesk.menu.copySku"),
              icon: Copy,
              onSelect: async () => {
                if (await copyText(item.sku)) showToast(t("shopDesk.toastCopied", { sku: item.sku }));
                else showToast(t("Could not copy to clipboard"), null, "bad");
              },
            },
            "sep",
            item.active
              ? { id: "off", label: t("shopDesk.menu.deactivate"), icon: CircleSlash, danger: true, onSelect: () => onActive(false) }
              : { id: "on", label: t("shopDesk.menu.activate"), icon: CheckCircle2, onSelect: () => onActive(true) },
          ].filter((x) => x === "sep" || status !== "retired" || x.id !== "on")}
        />
      </td>
    </tr>
  );
}

function StockCell({ item, stock, left, status }) {
  const { t, locale } = useLocale();
  if (status === "retired") return <span className="sdk-muted">{t("shopDesk.retiredCategory")}</span>;
  if (status === "scheduled") {
    const at = item.availability?.startsAt ? new Date(item.availability.startsAt) : null;
    return (
      <span className="sdk-stock is-text">
        <Clock size={14} />
        {at ? t("shopDesk.startsOn", { date: at.toLocaleDateString(locale, { day: "numeric", month: "short" }) }) : t("shopDesk.status.scheduled")}
      </span>
    );
  }
  if (status === "expired") return <span className="sdk-muted">{t("shopDesk.status.expired")}</span>;
  if (stock) {
    const low = stock.left <= Math.max(10, stock.limit * 0.2);
    return (
      <span className="sdk-stock">
        <small className="tnum">
          {num(stock.sold, locale)} / {num(stock.limit, locale)}
          {status === "soldout" ? ` · ${t("shopDesk.soldOut")}` : ""}
        </small>
        <span className={`sdk-meter${low ? " is-amber" : " is-violet"}`}>
          <i style={{ width: `${stock.pct}%` }} />
        </span>
        {left ? <small className="sdk-left">{t("shopDesk.timeLeft", { d: left.d, h: left.h })}</small> : null}
      </span>
    );
  }
  if (left) {
    return (
      <span className="sdk-stock">
        <small className="sdk-amber">{left.d ? t("shopDesk.timeLeft", { d: left.d, h: left.h }) : t("shopDesk.timeLeftH", { h: left.h, m: left.m })}</small>
        <span className="sdk-meter is-amber">
          <i style={{ width: `${windowPct(item.available_from || item.created_at, item.availability?.endsAt)}%` }} />
        </span>
      </span>
    );
  }
  return <span className="sdk-muted">{t("shopDesk.unlimited")}</span>;
}

export { KpiTiles };
