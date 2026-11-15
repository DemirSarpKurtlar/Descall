/**
 * Yönetici Paneli › Mağaza (remake, Nov 2026). Owner picked Draft A AND Draft B:
 *   Katalog            = Draft A control desk (KPI tiles, catalog table with search / filters /
 *                        sort / bulk select, quick DesCoin + gift panel, reconciliation card,
 *                        product drawer with live preview, bulk price dialog)
 *   other tabs         = Draft B operation centre (storefront sections + campaign calendar,
 *                        DesCoin operations, gifts with undo, reconciliation with fix dialog,
 *                        sales analytics, categories)
 * Every write goes through adminFetch (step-up prompt, section check, audit on the server).
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { adminFetch } from "../../../api/adminHttp";
import { useLocale } from "../../../context/LocaleContext";
import { useAdminPerms } from "../dossier/adminPerms.js";
import { UserActionHost } from "../dossier/UserActionDialogs.jsx";
import {
  BarChart3, Coins, Gift, Layers, Plus, RefreshCw, Scale, Search, ShoppingBag, Star, TrendingUp, X,
} from "../../ui/Icon.jsx";
import { Tag } from "./shopDeskIcons.js";
import { TABS, searchLocal } from "./shopDeskModel.js";
import { Ava, ItemThumb, errMsg, useUserSearch } from "./ui.jsx";
import CatalogTab from "./CatalogTab.jsx";
import ItemDrawer from "./ItemDrawer.jsx";
import BulkPriceDialog from "./BulkPriceDialog.jsx";
import GiftDialog from "./GiftDialog.jsx";
import CampaignDialog from "./CampaignDialog.jsx";
import "../../../styles/admin-dossier.css";
import "../../../styles/admin-shop-desk.css";

const StorefrontTab = lazy(() => import("./StorefrontTab.jsx"));
const ReconcileTab = lazy(() => import("./ReconcileTab.jsx"));
const GiftsTab = lazy(() => import("./GiftsTab.jsx"));
const OpsTab = lazy(() => import("./OpsTab.jsx"));
const AnalyticsTab = lazy(() => import("./AnalyticsTab.jsx"));
const CategoriesTab = lazy(() => import("./CategoriesTab.jsx"));

const TAB_ICON = { catalog: ShoppingBag, storefront: Star, ops: Coins, gifts: Gift, reconcile: Scale, analytics: TrendingUp, categories: Layers };
const TAB_SECTION = { gifts: "casino", ops: "casino", reconcile: "casino" };

function useDesk() {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await adminFetch("/shop/desk");
      setState({ data, error: null, loading: false });
      return data;
    } catch (error) {
      setState((s) => ({ ...s, error, loading: false }));
      return null;
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  return [state, load];
}

function useRuns(enabled) {
  const [state, setState] = useState({ data: null, error: null, loading: false });
  const load = useCallback(async () => {
    if (!enabled) return null;
    setState((s) => ({ ...s, loading: true }));
    try {
      const data = await adminFetch("/descoin/reconciliation/runs");
      setState({ data, error: null, loading: false });
      return data;
    } catch (error) {
      setState((s) => ({ ...s, error, loading: false }));
      return null;
    }
  }, [enabled]);
  useEffect(() => {
    load();
  }, [load]);
  return [state, load];
}

export default function AdminShopDesk() {
  const { t } = useLocale();
  const perms = useAdminPerms();
  const canCasino = perms.can("casino");
  const [{ data, error, loading }, reload] = useDesk();
  const [runsState, reloadRuns] = useRuns(canCasino);
  const [tab, setTab] = useState("catalog");
  const [drawer, setDrawer] = useState(null); // { id, tab } | { create: true }
  const [bulk, setBulk] = useState(null); // { ids, mode }
  const [gift, setGift] = useState(null); // { itemId, users }
  const [campaign, setCampaign] = useState(null); // { id? }
  const [userAction, setUserAction] = useState(null); // { action, user, context }
  const [toast, setToast] = useState(null);
  const [focusQuick, setFocusQuick] = useState(0);
  const [catalogFilter, setCatalogFilter] = useState(null);
  const searchRef = useRef(null);
  const toastTimer = useRef(null);

  const showToast = useCallback((text, action = null, tone = "ok") => {
    clearTimeout(toastTimer.current);
    setToast({ text, action, tone, at: Date.now() });
    toastTimer.current = setTimeout(() => setToast(null), action ? 9000 : 4200);
  }, []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  // Keep the desk fresh while it is open (stock and sales move on their own).
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") reload({ silent: true });
    }, 60_000);
    return () => clearInterval(id);
  }, [reload]);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const items = useMemo(() => data?.items || [], [data]);
  const itemsById = useMemo(() => new Map(items.map((it) => [String(it.id), it])), [items]);
  const kpis = data?.kpis || null;
  const mismatchCount = runsState.data?.latest && !runsState.data.latest.error ? runsState.data.latest.mismatch_count : data?.reconcile?.mismatch_count ?? null;
  const visibleTabs = TABS.filter((id) => !TAB_SECTION[id] || perms.can(TAB_SECTION[id]));

  const counts = {
    catalog: kpis ? kpis.totalItems : null,
    gifts: kpis?.giftItems7 ?? null,
    reconcile: mismatchCount || null,
    categories: kpis ? new Set(items.filter((it) => !it.retired).map((it) => it.category)).size : null,
  };

  const afterWrite = useCallback(
    async (message, action) => {
      if (message) showToast(message, action);
      await reload({ silent: true });
    },
    [reload, showToast]
  );

  const openQuick = () => {
    if (!["catalog", "ops", "gifts"].includes(tab)) setTab(canCasino ? "ops" : "catalog");
    setFocusQuick((n) => n + 1);
  };

  const common = {
    data,
    items,
    itemsById,
    reload,
    afterWrite,
    showToast,
    openDrawer: (id, sub = "edit") => setDrawer({ id, tab: sub }),
    openCreate: () => setDrawer({ create: true }),
    openBulk: (ids, mode = "percent") => setBulk({ ids, mode }),
    openGift: (opts = {}) => setGift(opts),
    openCampaign: (id = null, preset = null) => setCampaign({ id, preset }),
    openUserAction: (action, user, context = {}) => setUserAction({ action, user, context }),
    openPerson: (id) => perms.navigate?.("people", { userId: id }),
    goTab: setTab,
    canCasino,
  };

  return (
    <div className="sdk dsr" data-testid="shop-desk">
      <header className="sdk-top">
        <div>
          <h1>{t("shopDesk.title")}</h1>
          <p>{t("shopDesk.subtitle")}</p>
        </div>
        <div className="sdk-top-actions">
          <GlobalSearch
            inputRef={searchRef}
            items={items}
            campaigns={data?.campaigns || []}
            sections={data?.sections || []}
            onItem={(id) => setDrawer({ id, tab: "edit" })}
            onCampaign={(c) => {
              setTab("storefront");
              if (c.type === "campaign") setCampaign({ id: c.id });
            }}
            onUser={(u) => perms.navigate?.("people", { userId: u.id })}
          />
          {canCasino ? (
            <button type="button" className="sdk-btn" onClick={openQuick} data-testid="sdk-coin-btn">
              <Coins size={17} />
              {t("shopDesk.coinGiveTake")}
            </button>
          ) : null}
          {canCasino ? (
            <button type="button" className="sdk-btn" onClick={() => setGift({})} data-testid="sdk-gift-btn">
              <Gift size={17} />
              {t("shopDesk.giftCta")}
            </button>
          ) : null}
          <button type="button" className="sdk-btn" onClick={() => { reload(); reloadRuns(); }} disabled={loading} aria-label={t("shopDesk.refresh")}>
            <RefreshCw size={17} className={loading ? "spin" : ""} />
            <span className="sdk-hide-sm">{t("shopDesk.refresh")}</span>
          </button>
          <button type="button" className="sdk-btn is-primary" onClick={() => setCampaign({ id: null })} data-testid="sdk-new-campaign">
            <Plus size={17} />
            {t("shopDesk.newCampaign")}
          </button>
        </div>
      </header>

      <nav className="sdk-tabs" role="tablist" aria-label={t("shopDesk.tabsLabel")}>
        {visibleTabs.map((id) => {
          const Icon = TAB_ICON[id] || Tag;
          const n = counts[id];
          return (
            <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? "is-on" : ""} onClick={() => setTab(id)} data-testid={`sdk-tab-${id}`}>
              <Icon size={18} />
              {t(`shopDesk.tab.${id}`)}
              {n ? <span className={`sdk-tab-n${id === "reconcile" ? " is-amber" : ""}`}>{n}</span> : null}
            </button>
          );
        })}
      </nav>

      {error && !data ? (
        <div className="sdk-error" role="alert">
          <span>{errMsg(t, error, "shopDesk.loadError")}</span>
          <button type="button" className="sdk-btn" onClick={() => reload()}>
            {t("shopDesk.retry")}
          </button>
        </div>
      ) : null}

      {tab === "catalog" ? (
        <CatalogTab
          {...common}
          loading={loading && !data}
          kpis={kpis}
          runs={runsState}
          reloadRuns={reloadRuns}
          focusQuick={focusQuick}
          presetFilter={catalogFilter}
          clearPreset={() => setCatalogFilter(null)}
        />
      ) : (
        <Suspense fallback={<div className="sdk-tab-loading" aria-busy="true" />}>
          {tab === "storefront" ? <StorefrontTab {...common} kpis={kpis} mismatchCount={mismatchCount} onShowLimited={() => { setCatalogFilter({ status: "limited" }); setTab("catalog"); }} /> : null}
          {tab === "ops" ? <OpsTab {...common} kpis={kpis} mismatchCount={mismatchCount} focusQuick={focusQuick} /> : null}
          {tab === "gifts" ? <GiftsTab {...common} kpis={kpis} mismatchCount={mismatchCount} focusQuick={focusQuick} /> : null}
          {tab === "reconcile" ? <ReconcileTab {...common} runs={runsState} reloadRuns={reloadRuns} kpis={kpis} /> : null}
          {tab === "analytics" ? <AnalyticsTab {...common} kpis={kpis} mismatchCount={mismatchCount} /> : null}
          {tab === "categories" ? (
            <CategoriesTab
              {...common}
              kpis={kpis}
              mismatchCount={mismatchCount}
              onShowCategory={(category) => {
                setCatalogFilter({ category });
                setTab("catalog");
              }}
            />
          ) : null}
        </Suspense>
      )}

      <ItemDrawer
        open={Boolean(drawer)}
        state={drawer}
        items={items}
        sections={data?.sections || []}
        onClose={() => setDrawer(null)}
        onSaved={(msg) => afterWrite(msg)}
        onTab={(sub) => setDrawer((d) => (d ? { ...d, tab: sub } : d))}
        onCreated={(id) => setDrawer({ id, tab: "edit" })}
        openPerson={common.openPerson}
        openGift={common.openGift}
      />
      <BulkPriceDialog
        open={Boolean(bulk)}
        mode={bulk?.mode}
        items={(bulk?.ids || []).map((id) => itemsById.get(String(id))).filter(Boolean)}
        onClose={() => setBulk(null)}
        onDone={(msg) => {
          setBulk(null);
          afterWrite(msg);
        }}
      />
      <GiftDialog
        open={Boolean(gift)}
        preset={gift}
        items={items}
        onClose={() => setGift(null)}
        onDone={(msg, undo) => {
          setGift(null);
          afterWrite(msg, undo);
        }}
      />
      <CampaignDialog
        open={Boolean(campaign)}
        campaignId={campaign?.id || null}
        preset={campaign?.preset || null}
        campaigns={data?.campaigns || []}
        sections={data?.sections || []}
        items={items}
        onClose={() => setCampaign(null)}
        onDone={(msg) => {
          setCampaign(null);
          afterWrite(msg);
        }}
      />
      {userAction ? (
        <UserActionHost
          action={userAction.action}
          user={userAction.user}
          context={userAction.context}
          can={perms.can}
          onClose={() => setUserAction(null)}
          onDone={(msg) => {
            setUserAction(null);
            showToast(msg);
            reloadRuns();
            reload({ silent: true });
          }}
        />
      ) : null}

      {toast ? (
        <div className={`sdk-toast is-${toast.tone}`} role="status" aria-live="polite" key={toast.at}>
          <span>{toast.text}</span>
          {toast.action ? (
            <button
              type="button"
              onClick={async () => {
                const act = toast.action;
                setToast(null);
                await act.run();
              }}
            >
              {toast.action.label}
            </button>
          ) : null}
          <button type="button" className="sdk-toast-x" onClick={() => setToast(null)} aria-label={t("shopDesk.close")}>
            <X size={14} />
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** Ctrl K: items and campaigns locally, users from the server. */
function GlobalSearch({ inputRef, items, campaigns, sections, onItem, onCampaign, onUser }) {
  const { t } = useLocale();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const local = useMemo(() => searchLocal({ items, campaigns, sections }, q), [items, campaigns, sections, q]);
  const { users } = useUserSearch(q.length >= 2 ? q : "");
  const rows = [
    ...local.items.map((it) => ({ key: `i-${it.id}`, kind: "item", it })),
    ...local.campaigns.map((c) => ({ key: `c-${c.id}`, kind: "campaign", c })),
    ...users.slice(0, 5).map((u) => ({ key: `u-${u.id}`, kind: "user", u })),
  ];
  const [hi, setHi] = useState(0);
  const choose = (r) => {
    setOpen(false);
    setQ("");
    if (r.kind === "item") onItem(r.it.id);
    else if (r.kind === "campaign") onCampaign(r.c);
    else onUser(r.u);
  };
  return (
    <div className="sdk-gsearch">
      <Search size={18} />
      <input
        ref={inputRef}
        value={q}
        placeholder={t("shopDesk.searchPh")}
        aria-label={t("shopDesk.searchPh")}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          setHi(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 160)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHi((i) => Math.min(rows.length - 1, i + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHi((i) => Math.max(0, i - 1));
          } else if (e.key === "Enter" && rows[hi]) {
            e.preventDefault();
            choose(rows[hi]);
          } else if (e.key === "Escape") {
            setOpen(false);
            e.currentTarget.blur();
          }
        }}
        role="combobox"
        aria-expanded={open && rows.length > 0}
        aria-autocomplete="list"
      />
      <kbd>{t("shopDesk.ctrlK")}</kbd>
      {open && q.trim() && rows.length ? (
        <ul className="sdk-hits sdk-gsearch-hits" role="listbox">
          {rows.map((r, i) => (
            <li key={r.key} role="option" aria-selected={i === hi}>
              <button type="button" className={i === hi ? "is-hi" : ""} onMouseDown={(e) => e.preventDefault()} onClick={() => choose(r)}>
                {r.kind === "item" ? <ItemThumb item={r.it} size={26} /> : r.kind === "user" ? <Ava user={r.u} size={26} /> : <span className="sdk-hit-ic"><BarChart3 size={15} /></span>}
                <span>
                  <b>{r.kind === "item" ? r.it.name : r.kind === "user" ? r.u.displayName : r.c.name}</b>
                  <small>
                    {r.kind === "item"
                      ? `${t(`shopDesk.cat.${r.it.category}`)} · ${r.it.sku}`
                      : r.kind === "user"
                        ? `@${r.u.username} · ${t("shopDesk.searchUser")}`
                        : r.c.type === "section"
                          ? t("shopDesk.searchSection")
                          : t("shopDesk.searchCampaign")}
                  </small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
