/**
 * Vitrin ve Setler › "Tüm ürünlerde satış" (owner request, 16 Nov 2026). In the user shop the
 * "Tüm ürünler" tab is browse only; the items allowed here can still be bought straight from
 * it. Everything else is sold through the storefront, sets and night market.
 *
 * Control-centre drawer: summary tiles (listed, on direct sale, storefront and sets only,
 * 7-day direct sales), search + category / rarity / state filters, a switch per item, bulk
 * allow / disallow with a reason and a confirm, a live "what the user sees" card (desktop and
 * phone), undo from the toast, and the change goes to every open shop at once
 * ("shop:catalog:changed"). Writes: PUT /api/admin/shop2/direct-sale through adminFetch
 * (2FA step-up), audited as shop2_direct_sale.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "../../../context/LocaleContext";
import { adminFetch } from "../../../api/adminHttp";
import { SHOP_CATEGORY_TABS } from "../../../lib/shopCategories.js";
import { AlertTriangle, ChevronRight, Coins, History, Monitor, Search, ShoppingBag, Smartphone, Store, X } from "./icons.js";
import { errKey } from "./adminShop2Api.js";
import { Coin, Dialog, Drawer, Pill, RarityPill, ReasonField, Seg, Skel, Switch, Thumb, useFmt } from "./ui.jsx";
import { reasonOk } from "./shop2Model.js";
import { DS_RARITIES, dsApply, dsFilter, dsRows, dsStats, dsWouldChange } from "./directSaleModel.js";
import "../../../styles/admin-shop2-direct-sale.css";

const PATH = "/shop2/direct-sale";
const CAT_LABEL = Object.fromEntries(SHOP_CATEGORY_TABS.map((c) => [c.id, c.label]));
const REASON_MIN = 3;

async function putDirectSale(body) {
  return adminFetch(PATH, { method: "PUT", body: JSON.stringify(body) });
}

export default function DirectSaleDrawer({ open, onClose, socket, notify, fail, onAudit }) {
  const { t, locale } = useLocale();
  const f = useFmt();
  const [data, setData] = useState(null);
  const [rows, setRows] = useState(null);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [rarity, setRarity] = useState("all");
  const [state, setState] = useState("all");
  const [selected, setSelected] = useState(() => new Set());
  const [focusId, setFocusId] = useState(null);
  const [device, setDevice] = useState("desktop");
  const [confirm, setConfirm] = useState(null); // { allowed, ids }
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyIds, setBusyIds] = useState(() => new Set());
  const reloadTimer = useRef(null);

  const load = useCallback(async () => {
    try {
      const d = await adminFetch(PATH);
      setData(d);
      setRows(dsRows(d?.items, locale));
    } catch (e) {
      setRows((r) => r || []);
      fail?.(e);
    }
  }, [fail, locale]);

  useEffect(() => {
    if (!open) return undefined;
    load();
    return () => clearTimeout(reloadTimer.current);
  }, [open, load]);

  // Another admin changed it, or the shop desk changed a price: refresh quietly.
  useEffect(() => {
    if (!open || !socket) return undefined;
    const soon = () => {
      clearTimeout(reloadTimer.current);
      reloadTimer.current = setTimeout(load, 500);
    };
    const onUpdate = (p) => {
      if (p?.type === "shop2_direct_sale" || p?.type === "shop_changed") soon();
    };
    socket.on("admin:update", onUpdate);
    socket.on("shop:catalog:changed", soon);
    return () => {
      socket.off("admin:update", onUpdate);
      socket.off("shop:catalog:changed", soon);
    };
  }, [open, socket, load]);

  const installed = data ? data.installed !== false : true;
  const stats = useMemo(() => dsStats(rows || []), [rows]);
  const list = useMemo(() => dsFilter(rows || [], { q, cat, rarity, state, locale }), [rows, q, cat, rarity, state, locale]);
  const byId = useMemo(() => new Map((rows || []).map((r) => [String(r.id), r])), [rows]);
  const focus = (focusId && byId.get(String(focusId))) || list[0] || null;
  const selIds = useMemo(() => [...selected].filter((id) => byId.has(id)), [selected, byId]);
  const allShown = list.length > 0 && list.every((r) => selected.has(String(r.id)));
  const catsPresent = useMemo(() => SHOP_CATEGORY_TABS.map((c) => c.id).filter((id) => stats.byCat[id]), [stats]);
  const nameOfRow = (r) => r?.label || r?.sku || "";

  const toggleSel = (id) =>
    setSelected((s) => {
      const n = new Set(s);
      const k = String(id);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  const toggleShown = () =>
    setSelected((s) => {
      const n = new Set(s);
      if (allShown) list.forEach((r) => n.delete(String(r.id)));
      else list.forEach((r) => n.add(String(r.id)));
      return n;
    });

  /** Write, update the list in place, offer "Geri al" for exactly the rows that changed. */
  const write = useCallback(
    async (ids, allowed, { why = null, label = null, undo = false } = {}) => {
      const res = await putDirectSale({ itemIds: ids, allowed, reason: why || undefined, undo: undo || undefined });
      const changed = Array.isArray(res?.changedIds) ? res.changedIds.map(String) : [];
      setRows((r) => dsApply(r, changed, allowed));
      if (undo) {
        notify?.(t("adminShop2.toast.undone"));
        return changed;
      }
      if (!changed.length) {
        notify?.(t("adminShop2.directSale.toast.none"), { tone: "warn" });
        return changed;
      }
      const text =
        changed.length === 1 && label
          ? t(allowed ? "adminShop2.directSale.toast.allowed" : "adminShop2.directSale.toast.blocked", { name: label })
          : t(allowed ? "adminShop2.directSale.toast.bulkAllowed" : "adminShop2.directSale.toast.bulkBlocked", { n: changed.length });
      notify?.(text, {
        tone: allowed ? "ok" : "warn",
        ms: 12000,
        undo: () => {
          write(changed, !allowed, { why: t("adminShop2.directSale.undoReason"), undo: true }).catch((e) => fail?.(e));
        },
      });
      return changed;
    },
    [fail, notify, t]
  );

  const toggleOne = async (row, allowed) => {
    const id = String(row.id);
    setBusyIds((s) => new Set(s).add(id));
    setRows((r) => dsApply(r, [id], allowed));
    try {
      await write([id], allowed, { label: nameOfRow(row) });
    } catch (e) {
      setRows((r) => dsApply(r, [id], !allowed));
      fail?.(e);
    } finally {
      setBusyIds((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
    }
  };

  const openConfirm = (allowed) => {
    setReason("");
    setConfirm({ allowed, ids: selIds });
  };
  const runBulk = async () => {
    if (!confirm || busy) return;
    setBusy(true);
    try {
      await write(confirm.ids, confirm.allowed, { why: reason.trim() });
      setConfirm(null);
      setSelected(new Set());
    } catch (e) {
      fail?.(e);
    } finally {
      setBusy(false);
    }
  };

  const willChange = confirm ? dsWouldChange(rows || [], confirm.ids, confirm.allowed) : [];
  const selChangeOn = dsWouldChange(rows || [], selIds, true).length;
  const selChangeOff = dsWouldChange(rows || [], selIds, false).length;

  const badge = (
    <span className="as2-ds-live" title={t("adminShop2.directSale.liveHint")}>
      <i className="as2-dot is-live" />
      {t("adminShop2.directSale.live")}
    </span>
  );

  return (
    <>
      <Drawer
        open={open}
        onClose={onClose}
        busy={busy}
        icon={ShoppingBag}
        tone="blue"
        width={1120}
        title={t("adminShop2.directSale.title")}
        subtitle={t("adminShop2.directSale.subtitle")}
        badge={badge}
        testId="as2-direct-sale"
        footer={
          <div className="as2-ds-ft">
            {selIds.length ? (
              <>
                <b className="tnum">{t("adminShop2.directSale.selected", { n: selIds.length })}</b>
                <button type="button" className="as2-btn is-p" disabled={!installed || !selChangeOn} onClick={() => openConfirm(true)} data-testid="as2-ds-bulk-allow">
                  <Store size={15} />
                  {t("adminShop2.directSale.bulkAllow")}
                  <span className="as2-ds-n tnum">{f.n(selChangeOn)}</span>
                </button>
                <button type="button" className="as2-btn is-amber" disabled={!installed || !selChangeOff} onClick={() => openConfirm(false)} data-testid="as2-ds-bulk-block">
                  <X size={15} />
                  {t("adminShop2.directSale.bulkBlock")}
                  <span className="as2-ds-n tnum">{f.n(selChangeOff)}</span>
                </button>
                <button type="button" className="as2-btn" onClick={() => setSelected(new Set())}>
                  {t("adminShop2.directSale.clear")}
                </button>
              </>
            ) : (
              <span className="as2-muted">{t("adminShop2.directSale.footHint")}</span>
            )}
            {onAudit ? (
              <button type="button" className="as2-btn as2-ml" onClick={onAudit}>
                <History size={15} />
                {t("adminShop2.directSale.audit")}
              </button>
            ) : null}
          </div>
        }
      >
        {!installed ? (
          <p className="as2-ds-warn" role="status">
            <AlertTriangle size={16} />
            <span>{t("adminShop2.directSale.notInstalled")}</span>
          </p>
        ) : null}

        <div className="as2-ds-tiles" data-testid="as2-ds-tiles">
          <DsTile label={t("adminShop2.directSale.tile.listed")} value={rows ? f.n(stats.all) : null} sub={t("adminShop2.directSale.tile.listedSub", { n: f.n(stats.s2) })} />
          <DsTile tone="green" label={t("adminShop2.directSale.tile.allowed")} value={rows ? f.n(stats.allowed) : null} sub={t("adminShop2.directSale.tile.allowedSub", { n: f.n(stats.s2Allowed) })} bar={stats.all ? stats.allowed / stats.all : 0} />
          <DsTile tone="blue" label={t("adminShop2.directSale.tile.blocked")} value={rows ? f.n(stats.blocked) : null} sub={t("adminShop2.directSale.tile.blockedSub")} bar={stats.all ? stats.blocked / stats.all : 0} />
          <DsTile tone="amber" label={t("adminShop2.directSale.tile.sales")} value={rows ? f.n(stats.sales7) : null} sub={t("adminShop2.directSale.tile.salesSub", { coins: f.n(stats.coins7) })} />
        </div>

        <div className="as2-ds-grid">
          <section className="as2-ds-main" aria-label={t("adminShop2.directSale.title")}>
            <div className="as2-ds-tools">
              <label className="as2-search is-wide">
                <Search size={15} />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("adminShop2.directSale.search")} aria-label={t("adminShop2.directSale.search")} data-testid="as2-ds-search" />
              </label>
              <Seg
                size="sm"
                value={state}
                onChange={setState}
                label={t("adminShop2.directSale.col.sale")}
                testId="as2-ds-state"
                options={[
                  { id: "all", label: t("adminShop2.directSale.state.all") },
                  { id: "on", label: t("adminShop2.directSale.state.on"), count: f.n(stats.allowed) },
                  { id: "off", label: t("adminShop2.directSale.state.off"), count: f.n(stats.blocked) },
                ]}
              />
              <label className="as2-ds-select">
                <span className="as2-muted">{t("adminShop2.directSale.col.rarity")}</span>
                <select value={rarity} onChange={(e) => setRarity(e.target.value)} data-testid="as2-ds-rarity">
                  <option value="all">{t("adminShop2.directSale.rarityAll")}</option>
                  {DS_RARITIES.map((r) => (
                    <option key={r} value={r}>
                      {t(`adminShop2.rarity.${r}`)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="as2-ds-chips" role="tablist" aria-label={t("adminShop2.directSale.col.category")}>
              <button type="button" role="tab" aria-selected={cat === "all"} className={cat === "all" ? "is-on" : ""} onClick={() => setCat("all")}>
                {t("adminShop2.directSale.allCats")}
                <span className="tnum">{f.n(stats.all)}</span>
              </button>
              {catsPresent.map((id) => (
                <button key={id} type="button" role="tab" aria-selected={cat === id} className={cat === id ? "is-on" : ""} onClick={() => setCat(id)} data-testid={`as2-ds-cat-${id}`}>
                  {t(CAT_LABEL[id] || id)}
                  <span className="tnum">
                    {f.n(stats.byCat[id].allowed)}/{f.n(stats.byCat[id].all)}
                  </span>
                </button>
              ))}
            </div>

            <div className="as2-ds-table" role="table" aria-label={t("adminShop2.directSale.title")}>
              <div className="as2-ds-tr is-head" role="row">
                <span role="columnheader">
                  <input type="checkbox" checked={allShown} onChange={toggleShown} aria-label={t("adminShop2.directSale.selectShown")} disabled={!list.length} />
                </span>
                <span role="columnheader">{t("adminShop2.directSale.col.item")}</span>
                <span role="columnheader" className="is-hide-s">{t("adminShop2.directSale.col.category")}</span>
                <span role="columnheader" className="is-hide-s">{t("adminShop2.directSale.col.rarity")}</span>
                <span role="columnheader" className="is-num">{t("adminShop2.directSale.col.price")}</span>
                <span role="columnheader" className="is-num is-hide-s">{t("adminShop2.directSale.col.sales")}</span>
                <span role="columnheader" className="is-end">{t("adminShop2.directSale.col.sale")}</span>
              </div>
              {rows == null
                ? Array.from({ length: 6 }, (_, i) => (
                    <div key={i} className="as2-ds-tr" role="row">
                      <Skel w="100%" h={36} r={10} />
                    </div>
                  ))
                : null}
              {rows && !list.length ? <p className="as2-empty">{t("adminShop2.directSale.empty")}</p> : null}
              {list.map((r) => {
                const id = String(r.id);
                const on = r.direct_sale;
                return (
                  <div
                    key={id}
                    role="row"
                    className={`as2-ds-tr${focus && String(focus.id) === id ? " is-focus" : ""}${on ? " is-on" : ""}`}
                    onClick={(e) => {
                      if (e.target.closest("button, input, a, label")) return;
                      setFocusId(id);
                    }}
                    data-testid={`as2-ds-row-${r.sku || id}`}
                  >
                    <span role="cell">
                      <input type="checkbox" checked={selected.has(id)} onChange={() => toggleSel(id)} aria-label={nameOfRow(r)} />
                    </span>
                    <span role="cell" className="as2-ds-item">
                      <Thumb item={r} size={34} />
                      <span className="as2-ds-name">
                        <b>{nameOfRow(r)}</b>
                        <small className="as2-muted">
                          {r.sku}
                          {r.set_key ? <em className="as2-ds-set">{t("adminShop2.directSale.set", { key: r.set_key })}</em> : null}
                        </small>
                      </span>
                    </span>
                    <span role="cell" className="is-hide-s as2-muted">{t(CAT_LABEL[r.category] || r.category)}</span>
                    <span role="cell" className="is-hide-s">
                      <RarityPill rarity={r.rarity} />
                    </span>
                    <span role="cell" className="is-num">
                      <Coin value={r.price} size="sm" />
                    </span>
                    <span role="cell" className="is-num is-hide-s tnum">{r.sales7 ? f.n(r.sales7) : <span className="as2-muted">–</span>}</span>
                    <span role="cell" className="is-end">
                      <Switch
                        checked={on}
                        disabled={!installed || busyIds.has(id)}
                        onChange={(v) => toggleOne(r, v)}
                        tone="green"
                        label={t("adminShop2.directSale.toggleLabel", { name: nameOfRow(r) })}
                        testId={`as2-ds-switch-${r.sku || id}`}
                      />
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

          <aside className="as2-ds-side" aria-label={t("adminShop2.directSale.preview.title")}>
            <div className="as2-ds-side-h">
              <span className="as2-cap">{t("adminShop2.directSale.preview.title")}</span>
              <Seg
                size="sm"
                value={device}
                onChange={setDevice}
                label={t("adminShop2.directSale.preview.title")}
                options={[
                  { id: "desktop", label: (<><Monitor size={13} />{t("adminShop2.directSale.preview.desktop")}</>) },
                  { id: "phone", label: (<><Smartphone size={13} />{t("adminShop2.directSale.preview.phone")}</>) },
                ]}
              />
            </div>
            {focus ? (
              <>
                <UserCard row={focus} device={device} />
                <div className={`as2-ds-paths${focus.direct_sale ? " is-on" : ""}`}>
                  <Pill tone={focus.direct_sale ? "green" : "blue"}>{focus.direct_sale ? t("adminShop2.directSale.state.on") : t("adminShop2.directSale.state.off")}</Pill>
                  <p>{t(focus.direct_sale ? "adminShop2.directSale.preview.pathsAllowed" : "adminShop2.directSale.preview.pathsBlocked")}</p>
                </div>
                <label className="as2-tg as2-ds-big">
                  <Switch checked={focus.direct_sale} disabled={!installed || busyIds.has(String(focus.id))} onChange={(v) => toggleOne(focus, v)} tone="green" label={t("adminShop2.directSale.toggleLabel", { name: nameOfRow(focus) })} testId="as2-ds-focus-switch" />
                  <span>{t("adminShop2.directSale.focusToggle")}</span>
                </label>
                <p className="as2-ds-sales">
                  <Coins size={14} />
                  {t("adminShop2.directSale.preview.sales", { n: focus.sales7, coins: f.n(focus.coins7) })}
                </p>
              </>
            ) : (
              <p className="as2-empty">{t("adminShop2.directSale.preview.pick")}</p>
            )}
          </aside>
        </div>
      </Drawer>

      <Dialog
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        busy={busy}
        icon={confirm?.allowed ? Store : X}
        tone={confirm?.allowed ? "blue" : "amber"}
        width={520}
        title={t(confirm?.allowed ? "adminShop2.directSale.confirmAllow" : "adminShop2.directSale.confirmBlock", { n: willChange.length })}
        subtitle={t("adminShop2.directSale.confirmNote")}
        testId="as2-ds-confirm"
        footer={
          <>
            <button type="button" className="as2-btn" onClick={() => setConfirm(null)} disabled={busy}>
              {t("adminShop2.cancel")}
            </button>
            <button type="button" className={`as2-btn ${confirm?.allowed ? "is-p" : "is-amber"}`} disabled={busy || !willChange.length || !reasonOk(reason, REASON_MIN)} onClick={runBulk} data-testid="as2-ds-confirm-go">
              {confirm?.allowed ? t("adminShop2.directSale.bulkAllow") : t("adminShop2.directSale.bulkBlock")}
            </button>
          </>
        }
      >
        <ul className="as2-ds-clist">
          {willChange.slice(0, 6).map((id) => {
            const r = byId.get(id);
            return r ? (
              <li key={id}>
                <Thumb item={r} size={24} />
                <span>{nameOfRow(r)}</span>
                <Coin value={r.price} size="sm" />
              </li>
            ) : null;
          })}
          {willChange.length > 6 ? <li className="as2-muted">{t("adminShop2.directSale.more", { n: f.n(willChange.length - 6) })}</li> : null}
        </ul>
        <ReasonField value={reason} onChange={setReason} min={REASON_MIN} autoFocus testId="as2-ds-reason" />
      </Dialog>
    </>
  );
}

function DsTile({ label, value, sub, tone, bar }) {
  return (
    <div className={`as2-tile as2-ds-tile${tone ? ` is-${tone}` : ""}`}>
      <span className="as2-tile-l">{label}</span>
      <span className="as2-tile-v">{value == null ? <Skel w={60} h={22} /> : <b className="tnum">{value}</b>}</span>
      <span className="as2-tile-s">{sub}</span>
      {bar != null ? <i className="as2-ds-bar" style={{ "--p": `${Math.round(Math.max(0, Math.min(1, bar)) * 100)}%` }} aria-hidden="true" /> : null}
    </div>
  );
}

/** The card exactly as "Tüm ürünler" shows it (state after the switch). */
function UserCard({ row, device }) {
  const { t } = useLocale();
  const f = useFmt();
  const phone = device === "phone";
  return (
    <div className={`as2-ds-device is-${device}`} data-testid="as2-ds-preview">
      <div className="as2-ds-ucard">
        <div className="as2-ds-uthumb">
          <Thumb item={row} size={phone ? 48 : 72} />
        </div>
        <div className="as2-ds-ubody">
          <b className="as2-ds-uname">{row.label}</b>
          {row.desc ? <p className="as2-ds-udesc">{row.desc}</p> : null}
          <div className="as2-ds-ufoot">
            <span className="as2-ds-uprice">
              <Coins size={12} />
              {f.n(row.price)}
            </span>
            {row.direct_sale ? (
              <span className="as2-ds-ubuy">{t("adminShop2.directSale.preview.buy")}</span>
            ) : (
              <span className="as2-ds-ubrowse">
                <span className="as2-ds-upill">
                  <Store size={11} />
                  {t("shop2.directSale.badge")}
                </span>
                {row.set_key ? (
                  <span className="as2-ds-ulink">
                    {t("shop2.directSale.seeSet")}
                    <ChevronRight size={11} />
                  </span>
                ) : null}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
