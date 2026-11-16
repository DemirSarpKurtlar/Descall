/**
 * Yönetici Paneli › Vitrin ve Setler (Market 2.0). Owner pick: a mix of Draft A
 * "Kontrol merkezi" and Draft B "Yayın takvimi" (scratchpad shop2-drafts/admin), built
 * one to one:
 *   header      reset countdown, people in the shop now, search (Ctrl K), user storefront,
 *               new set; views Pano (A1) · Yayın takvimi (B1) · İşlem kaydı
 *   tiles       storefront views, storefront buys, set sales, revenue, night market, gifts
 *   Pano        live sales chart, storefront algorithm (weights, slot bands, toggles,
 *               versions, simulate, apply at 00:00), sets table (recall + 30 min undo),
 *               rules and limits
 *   Takvim      two weeks: rule versions, sets, night markets, events, daily revenue,
 *               clash warnings, bar menu + edge drag, pending queue, audit, algorithm
 *               donut, slot conversion, top sellers
 *   builder     A2 + B2 (SetBuilder.jsx)   drawers  user storefront (A3), night market (B3),
 *               gift / refresh limits     dialogs  recall (A4), simulate, revert, apply
 * Data: adminShop2Api.js (/api/admin/shop2). Writes go through adminFetch (step-up code),
 * the server keeps the audit trail. Live sales arrive on the socket (shop2:admin:sale).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "../../../context/LocaleContext";
import { Calendar, Eye, Gift, History, LayoutDashboard, Layers, Moon, Plus, Search, ShoppingBag, Store, Wallet } from "../../ui/Icon.jsx";
import { errKey, setApiLocale, shop2Api } from "./adminShop2Api.js";
import Dashboard from "./Dashboard.jsx";
import TimelineView from "./TimelineView.jsx";
import AuditView from "./AuditView.jsx";
import SetBuilder from "./SetBuilder.jsx";
import UserStorefrontDrawer from "./UserStorefrontDrawer.jsx";
import NightMarketDrawer from "./NightMarketDrawer.jsx";
import LimitsDrawer from "./LimitsDrawer.jsx";
import RecallDialog from "./RecallDialog.jsx";
import { Coin, Popover, Seg, Spark, Toast, UserAv, useFmt, useNow, SetMark, fdt } from "./ui.jsx";
import { clock, istDay, nextReset, nameOf } from "./shop2Model.js";
import "../../../styles/shop-merch.css";
import "../../../styles/admin-shop2.css";

const TOAST_MS = 4500;

export default function AdminShop2({ socket, onGoto, onOpenUser }) {
  const { t, locale } = useLocale();
  setApiLocale(locale);
  const f = useFmt();
  const now = useNow(1000);
  const [view, setView] = useState("pano");
  const [dash, setDash] = useState(null);
  const [range, setRange] = useState("today");
  const [sets, setSets] = useState(null);
  const [rules, setRules] = useState(null);
  const [limits, setLimits] = useState(null);
  const [night, setNight] = useState(null);
  const [loadErr, setLoadErr] = useState(null);
  const [toast, setToast] = useState(null);
  const [flash, setFlash] = useState({}); // tile / set key → stamp (A1 motion 1)
  const [builder, setBuilder] = useState(null); // { key } | { key: null } (new)
  const [userDrawer, setUserDrawer] = useState(null); // { userId } | { userId: null }
  const [nightOpen, setNightOpen] = useState(false);
  const [limitsTab, setLimitsTab] = useState(null);
  const [recall, setRecall] = useState(null); // set
  const [auditFilter, setAuditFilter] = useState(null);
  const [highlight, setHighlight] = useState(null); // timeline bar flash
  const toastTimer = useRef(null);
  const reloadTimer = useRef(null);
  const saleTimer = useRef(null);

  const notify = useCallback((text, { tone = "ok", undo = null, ms } = {}) => {
    const dur = ms || (undo ? 9000 : TOAST_MS);
    setToast({ text, tone, undo, id: Date.now(), ms: dur });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), dur);
  }, []);
  const fail = useCallback((e) => notify(t(errKey(e)), { tone: "err" }), [notify, t]);

  const loadDash = useCallback(
    (r = range) =>
      shop2Api
        .dashboard(r)
        .then((d) => {
          setDash(d);
          setLoadErr(null);
        })
        .catch((e) => setLoadErr(errKey(e))),
    [range]
  );
  const loadSets = useCallback(() => shop2Api.sets().then(setSets).catch(() => setSets((s) => s || [])), []);
  const loadRules = useCallback(() => shop2Api.rules().then(setRules).catch(() => setRules((r) => r || null)), []);
  const loadLimits = useCallback(() => shop2Api.limits().then(setLimits).catch(() => {}), []);
  const loadNight = useCallback(() => shop2Api.nightMarket().then(setNight).catch(() => {}), []);
  const loadAll = useCallback(() => {
    loadDash();
    loadSets();
    loadRules();
    loadLimits();
    loadNight();
  }, [loadDash, loadSets, loadRules, loadLimits, loadNight]);
  const reloadSoon = useCallback(() => {
    clearTimeout(reloadTimer.current);
    reloadTimer.current = setTimeout(loadAll, 400);
  }, [loadAll]);

  useEffect(() => {
    loadAll();
    return () => {
      clearTimeout(toastTimer.current);
      clearTimeout(reloadTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadDash(range);
  }, [range, loadDash]);

  // Poll the dashboard every 30 s while visible (the socket carries single sales in between).
  useEffect(() => {
    const id = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      loadDash();
    }, 30000);
    return () => clearInterval(id);
  }, [loadDash]);

  // Live sales and other admins' changes.
  useEffect(() => {
    if (!socket) return undefined;
    const onSale = (payload) => {
      const sale = payload?.sale;
      if (!sale) {
        if (payload?.flag) {
          notify(t("adminShop2.toast.ringFlag", { n: (payload.flag.users || []).length }), { tone: "warn" });
          reloadSoon();
        }
        return;
      }
      const p = { kind: sale.gift ? "gift" : ["set", "piece", "pieces"].includes(sale.kind) ? "set" : sale.kind === "refund" ? "refund" : "item", paid: Number(sale.amount) || 0, price: Number(sale.listAmount) || 0, setKey: sale.setKey || null, at: sale.at };
      setDash((d) => applySale(d, p));
      const keys = ["revenue", p.kind === "set" ? "setSales" : p.kind === "gift" ? "gifts" : "storefrontBuys"];
      if (p.setKey) keys.push(`set:${p.setKey}`);
      setFlash((fl) => ({ ...fl, ...Object.fromEntries(keys.map((k) => [k, Date.now()])) }));
      clearTimeout(saleTimer.current);
      saleTimer.current = setTimeout(() => loadDash(), 1200);
    };
    const onUpdate = (p) => {
      if (String(p?.type || "").startsWith("shop2")) reloadSoon();
    };
    socket.on("shop2:admin:sale", onSale);
    socket.on("admin:update", onUpdate);
    return () => {
      socket.off("shop2:admin:sale", onSale);
      socket.off("admin:update", onUpdate);
    };
  }, [socket, reloadSoon, loadDash, notify, t]);

  // Ctrl K focuses the search.
  const searchRef = useRef(null);
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k" && !builder) {
        const el = searchRef.current;
        if (!el || !el.offsetParent) return;
        e.preventDefault();
        e.stopPropagation();
        el.focus();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [builder]);

  /* ---------------- actions shared by the views ---------------- */

  const undoRecall = useCallback(
    async (set) => {
      try {
        await shop2Api.undoRecall(set.key);
        notify(t("adminShop2.toast.recallUndone", { name: set.name }));
        reloadSoon();
      } catch (e) {
        fail(e);
      }
    },
    [fail, notify, reloadSoon, t]
  );

  const afterRecall = useCallback(
    (set) => {
      setRecall(null);
      notify(t("adminShop2.toast.recalled", { name: set.name }), { tone: "warn", undo: () => undoRecall(set) });
      setSets((list) => (list || []).map((s) => (s.key === set.key ? { ...s, status: "recalled", recalledAt: new Date().toISOString(), undoUntil: new Date(Date.now() + 30 * 60000).toISOString() } : s)));
      reloadSoon();
    },
    [notify, reloadSoon, t, undoRecall]
  );

  const openSet = useCallback((key) => setBuilder({ key }), []);
  const openUser = useCallback((userId) => setUserDrawer({ userId: userId || null }), []);

  const live = dash?.liveInShop ?? dash?.live?.inShop ?? null;
  const resetAt = dash?.resetsAt ? Date.parse(dash.resetsAt) : nextReset(now);

  if (builder) {
    return (
      <div className="as2" data-testid="as2-page">
        <SetBuilder
          setKey={builder.key}
          sets={sets || []}
          now={now}
          onBack={() => {
            setBuilder(null);
            reloadSoon();
          }}
          onOpenSet={openSet}
          onSaved={() => reloadSoon()}
          notify={notify}
          fail={fail}
          onRecall={(s) => setRecall(s)}
        />
        <RecallDialog set={recall} onClose={() => setRecall(null)} onDone={afterRecall} fail={fail} />
        <Toast toast={toast} onUndo={() => { toast?.undo?.(); setToast(null); }} onClose={() => setToast(null)} />
      </div>
    );
  }

  return (
    <div className="as2" data-testid="as2-page">
      <header className="as2-hdr">
        <div className="as2-hdr-l">
          <h1>{t("adminShop2.title")}</h1>
          <div className="as2-crumb">{view === "takvim" ? t("adminShop2.crumbTimeline") : t("adminShop2.crumb")}</div>
        </div>
        <div className="as2-hdr-r">
          <span className="as2-reset" title={fdt(new Date(resetAt).toISOString(), locale, { hour: "2-digit", minute: "2-digit" })}>
            <i className="as2-dot is-live" />
            <span className="as2-reset-l">{t("adminShop2.resetAt")}</span>
            <b className="tnum">{clock(resetAt - now)}</b>
          </span>
          <GlobalSearch inputRef={searchRef} sets={sets || []} onUser={openUser} onSet={openSet} />
          <button type="button" className="as2-btn" onClick={() => openUser(null)} data-testid="as2-user-storefront">
            <Eye size={15} />
            {t("adminShop2.userStorefront")}
          </button>
          <button type="button" className="as2-btn is-p" onClick={() => setBuilder({ key: null })} data-testid="as2-new-set">
            <Plus size={15} />
            {t("adminShop2.newSet")}
          </button>
        </div>
      </header>

      <div className="as2-toolbar">
        <Seg
          value={view}
          onChange={setView}
          label={t("adminShop2.views")}
          testId="as2-views"
          options={[
            { id: "pano", label: (<><LayoutDashboard size={14} />{t("adminShop2.view.pano")}</>) },
            { id: "takvim", label: (<><Calendar size={14} />{t("adminShop2.view.takvim")}</>) },
            { id: "kayit", label: (<><History size={14} />{t("adminShop2.view.kayit")}</>) },
          ]}
        />
        {live != null ? (
            <span className="as2-live as2-ml" title={t("adminShop2.liveInShopHint")}>
              <Store size={14} />
              <b className="tnum">{f.n(live)}</b>
              <span>{t("adminShop2.liveInShop")}</span>
            </span>
          ) : null}
        {loadErr ? (
          <p className="as2-err" role="alert">
            {t(loadErr)}
            <button type="button" className="as2-link" onClick={loadAll}>
              {t("adminShop2.retry")}
            </button>
          </p>
        ) : null}
      </div>

      <Tiles dash={dash} night={night} flash={flash} now={now} onNight={() => setNightOpen(true)} onGifts={() => setLimitsTab("gift")} />

      {view === "pano" ? (
        <Dashboard
          dash={dash}
          range={range}
          onRange={setRange}
          sets={sets}
          rules={rules}
          limits={limits}
          night={night}
          now={now}
          flash={flash}
          onOpenSet={openSet}
          onRecall={setRecall}
          onUndoRecall={undoRecall}
          onRulesChanged={loadRules}
          onNight={() => setNightOpen(true)}
          onLimits={(tab) => setLimitsTab(tab || "gift")}
          notify={notify}
          fail={fail}
        />
      ) : view === "takvim" ? (
        <TimelineView
          dash={dash}
          sets={sets}
          rules={rules}
          now={now}
          highlight={highlight}
          onHighlight={setHighlight}
          onOpenSet={openSet}
          onRecall={setRecall}
          onOpenUser={openUser}
          onNight={() => setNightOpen(true)}
          onRules={() => setView("pano")}
          onAudit={() => setView("kayit")}
          onChanged={reloadSoon}
          notify={notify}
          fail={fail}
        />
      ) : (
        <AuditView now={now} filter={auditFilter} onFilter={setAuditFilter} notify={notify} fail={fail} onChanged={reloadSoon} onOpenSet={openSet} onOpenUser={openUser} />
      )}

      <UserStorefrontDrawer
        open={Boolean(userDrawer)}
        userId={userDrawer?.userId}
        onPick={(id) => setUserDrawer({ userId: id })}
        onClose={() => setUserDrawer(null)}
        now={now}
        notify={notify}
        fail={fail}
        onOpenUser={onOpenUser}
        onAudit={(u) => {
          setUserDrawer(null);
          setAuditFilter({ userId: u.id, label: `@${u.username}` });
          setView("kayit");
        }}
      />
      <NightMarketDrawer open={nightOpen} onClose={() => setNightOpen(false)} data={night} now={now} onSaved={() => { loadNight(); reloadSoon(); }} notify={notify} fail={fail} />
      <LimitsDrawer
        open={Boolean(limitsTab)}
        tab={limitsTab || "gift"}
        onTab={setLimitsTab}
        onClose={() => setLimitsTab(null)}
        data={limits}
        onSaved={(n) => {
          notify(t("adminShop2.toast.limitsSaved", { n }), {
            undo: () =>
              shop2Api
                .undoLimits()
                .then(() => {
                  notify(t("adminShop2.toast.undone"));
                  loadLimits();
                })
                .catch(fail),
            ms: 15000,
          });
          loadLimits();
          reloadSoon();
        }}
        notify={notify}
        fail={fail}
      />
      <RecallDialog set={recall} onClose={() => setRecall(null)} onDone={afterRecall} fail={fail} />
      <Toast toast={toast} onUndo={() => { toast?.undo?.(); setToast(null); }} onClose={() => setToast(null)} />
      {typeof onGoto === "function" ? null : null}
    </div>
  );
}

/** A live sale into the dashboard (tiles, chart's last bucket, the "Az önce" line). */
export function applySale(d, p) {
  if (!d || !p) return d;
  const tiles = { ...(d.tiles || {}) };
  const bump = (k, by = 1) => (tiles[k] = { ...(tiles[k] || {}), value: Number(tiles[k]?.value || 0) + by });
  const paid = Number(p.paid ?? p.price ?? 0);
  bump("revenue", paid);
  if (p.kind === "refund") return { ...d, tiles };
  if (p.kind === "set") {
    bump("setSales");
    tiles.setSales.pieces = Number(tiles.setSales.pieces || 0) + Number(p.pieces || 0);
  } else if (p.kind === "gift") bump("gifts");
  else bump("storefrontBuys");
  const sales = d.sales ? { ...d.sales } : null;
  if (sales && Array.isArray(sales.series)) {
    const key = p.kind === "set" ? "sets" : p.kind === "gift" ? "gifts" : "storefront";
    const s = sales.series.map((x) => ({ ...x, values: [...(x.values || [])] }));
    const row = s.find((x) => x.key === key) || s.find((x) => x.key === "total");
    if (row) {
      let i = row.values.length - 1;
      while (i > 0 && !Number.isFinite(row.values[i])) i -= 1;
      row.values[i] = Number(row.values[i] || 0) + paid;
    }
    sales.series = s;
    sales.thisHour = Number(sales.thisHour || 0) + 1;
  }
  return { ...d, tiles, sales };
}

/* ------------------------------------------------------------------ tiles */

function Tile({ icon: Icon, label, children, sub, spark, tone, flashAt, onClick, testId }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag type={onClick ? "button" : undefined} className={`as2-tile${tone ? ` is-${tone}` : ""}${flashAt && Date.now() - flashAt < 1600 ? " is-flash" : ""}`} onClick={onClick} data-testid={testId} key={flashAt || 0}>
      <span className="as2-tile-l">
        <Icon size={15} />
        {label}
      </span>
      <span className="as2-tile-v">
        {children}
        {spark ? <Spark values={spark} tone={tone === "violet" ? "violet" : "brand"} w={74} h={24} /> : null}
      </span>
      <span className="as2-tile-s">{sub}</span>
    </Tag>
  );
}

function Delta({ v }) {
  const f = useFmt();
  if (v == null) return null;
  const up = v >= 0;
  return <b className={up ? "as2-pos" : "as2-neg"}>{`${up ? "+" : "−"}${f.p(Math.abs(v), 0)}`}</b>;
}

function Tiles({ dash, night, flash, now, onNight, onGifts }) {
  const { t } = useLocale();
  const f = useFmt();
  const T = dash?.tiles || {};
  const sched = night?.schedule || {};
  const nm = { ...(T.nightMarket || {}), cards: T.nightMarket?.cards ?? sched.cards, discountMin: sched.discountMin, discountMax: sched.discountMax };
  const nmOpen = Boolean(nm.open && nm.closesAt && Date.parse(nm.closesAt) > now);
  if (!dash) {
    return (
      <div className="as2-tiles" aria-busy="true">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="as2-tile is-skel" />
        ))}
      </div>
    );
  }
  return (
    <div className="as2-tiles" data-testid="as2-tiles">
      <Tile icon={Eye} label={t("adminShop2.tile.views")} spark={T.views?.spark} flashAt={flash.views} sub={<><Delta v={T.views?.deltaPct} /> {t("adminShop2.tile.vsYesterday")}</>}>
        <b className="tnum">{f.n(T.views?.value)}</b>
      </Tile>
      <Tile icon={ShoppingBag} label={t("adminShop2.tile.buys")} spark={T.storefrontBuys?.spark} flashAt={flash.storefrontBuys} sub={t("adminShop2.tile.conversion", { pct: f.p(T.storefrontBuys?.conversionPct ?? 0) })}>
        <b className="tnum">{f.n(T.storefrontBuys?.value)}</b>
      </Tile>
      <Tile icon={Layers} label={t("adminShop2.tile.setSales")} spark={T.setSales?.spark} flashAt={flash.setSales} sub={t("adminShop2.tile.pieces", { n: f.n(T.setSales?.pieces) })}>
        <b className="tnum">{f.n(T.setSales?.value)}</b>
      </Tile>
      <Tile icon={Wallet} label={t("adminShop2.tile.revenue")} spark={T.revenue?.spark} flashAt={flash.revenue} sub={<><Delta v={T.revenue?.deltaPct} /> {t("adminShop2.tile.fromSets", { pct: f.p(T.revenue?.fromSetsPct ?? 0, 0) })}</>}>
        <Coin value={T.revenue?.value} compact size="lg" />
      </Tile>
      <Tile icon={Moon} tone="violet" label={t("adminShop2.tile.night")} onClick={onNight} testId="as2-tile-night" sub={t("adminShop2.tile.nightSub", { n: nm.cards ?? 6, a: nm.discountMin ?? 25, b: nm.discountMax ?? 60 })}>
        <b className="as2-tile-txt">
          {nmOpen
            ? t("adminShop2.tile.nightOpen", { c: clock(Date.parse(nm.closesAt) - now) })
            : nm.opensAt
            ? istDay(Date.parse(nm.opensAt)) === istDay(now)
              ? t("adminShop2.tile.nightAt", { time: fdt(nm.opensAt, f.locale, { hour: "2-digit", minute: "2-digit" }) })
              : t("adminShop2.tile.nightOn", { when: `${fdt(nm.opensAt, f.locale, { weekday: "short" })} ${fdt(nm.opensAt, f.locale, { hour: "2-digit", minute: "2-digit" })}` })
            : t("adminShop2.tile.nightOff")}
        </b>
      </Tile>
      <Tile icon={Gift} tone="amber" label={t("adminShop2.tile.gifts")} onClick={onGifts} flashAt={flash.gifts} testId="as2-tile-gifts" sub={<><b className="as2-amber">{t("adminShop2.tile.blocked", { n: f.n(T.gifts?.blocked) })}</b> · {T.gifts?.flags ? t("adminShop2.tile.flags", { n: f.n(T.gifts.flags) }) : t("adminShop2.tile.overLimit")}</>}>
        <b className="tnum">{f.n(T.gifts?.value)}</b>
      </Tile>
    </div>
  );
}

/* ------------------------------------------------------------------ search (Ctrl K) */

function GlobalSearch({ inputRef, sets, onUser, onSet }) {
  const { t } = useLocale();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState([]);
  const wrap = useRef(null);
  const { locale } = useLocale();
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setUsers([]);
      return undefined;
    }
    const id = setTimeout(() => {
      shop2Api
        .searchUsers(term.replace(/^@/, ""))
        .then((r) => setUsers((r?.users || []).slice(0, 5)))
        .catch(() => setUsers([]));
    }, 220);
    return () => clearTimeout(id);
  }, [q]);
  const fold = (s) => String(s || "").toLocaleLowerCase("tr-TR");
  const setHits = useMemo(() => (q.trim() ? sets.filter((s) => fold(s.name).includes(fold(q.trim()))).slice(0, 4) : []), [q, sets]);
  const any = users.length || setHits.length;
  return (
    <div className="as2-search" ref={wrap}>
      <Search size={15} />
      <input
        ref={inputRef}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={t("adminShop2.searchPh")}
        aria-label={t("adminShop2.searchPh")}
        data-testid="as2-search"
      />
      <kbd>Ctrl K</kbd>
      <Popover open={open && q.trim().length >= 2} onClose={() => setOpen(false)} anchorRef={wrap} align="start" width={320} label={t("adminShop2.searchPh")}>
        {!any ? <p className="as2-pop-empty">{t("adminShop2.searchEmpty")}</p> : null}
        {users.length ? <div className="as2-pop-cap">{t("adminShop2.searchUsers")}</div> : null}
        {users.map((u) => (
          <button
            key={u.id}
            type="button"
            className="as2-pop-it"
            onClick={() => {
              setOpen(false);
              setQ("");
              onUser(u.id);
            }}
          >
            <UserAv name={u.username} src={u.avatarUrl} size={22} />
            <span>{u.displayName || u.username}</span>
            <small>@{u.username}</small>
          </button>
        ))}
        {setHits.length ? <div className="as2-pop-cap">{t("adminShop2.searchSets")}</div> : null}
        {setHits.map((s) => (
          <button
            key={s.key}
            type="button"
            className="as2-pop-it"
            onClick={() => {
              setOpen(false);
              setQ("");
              onSet(s.key);
            }}
          >
            <SetMark set={s} size={22} />
            <span>{nameOf(s, locale)}</span>
          </button>
        ))}
      </Popover>
    </div>
  );
}
