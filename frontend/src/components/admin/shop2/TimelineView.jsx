/**
 * Yayın takvimi (Draft B frame B1): two weeks of storefront rule versions, sets, night
 * markets, price events and daily revenue on one chart; the now line moves every
 * minute; clash warnings; a bar opens an opaque menu (edit, +100 stock, extend, view as
 * a user, recall), its right edge drags to change the end. Right: pending changes with
 * live countdowns and cancel, audit with undo. Bottom: algorithm donut, slot conversion,
 * best sellers.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "../../../context/LocaleContext";
import { AlertTriangle, Calendar, ChevronLeft, ChevronRight, Clock, Eye, FlaskConical, Gift, History, Layers, Moon, Package, Pencil, Percent, RefreshCw, RotateCcw, SlidersHorizontal, Star, Store, Timer, Wallet, Filter } from "./icons.js";
import { shop2Api } from "./adminShop2Api.js";
import { auditTitle } from "./AuditView.jsx";
import { Dialog, Pill, Popover, ReasonField, Seg, SetMark, Skel, Switch, useFmt, fdt } from "./ui.jsx";
import {
  RARITIES,
  RARITY_COLOR,
  addDays,
  arcPath,
  dayPos,
  dayRange,
  donutArcs,
  findClashes,
  istDay,
  istMidnight,
  normalizeWeights,
  reasonOk,
  setBars,
  timelineStart,
  undoLeft,
  waitLabel,
} from "./shop2Model.js";

const SPANS = { day: 3, w2: 14, month: 28 };

export default function TimelineView({ dash, sets, rules, now, highlight, onHighlight, onOpenSet, onRecall, onOpenUser, onNight, onRules, onAudit, onChanged, notify, fail }) {
  const { t, locale } = useLocale();
  const [span, setSpan] = useState("w2");
  const days = SPANS[span];
  const [from, setFrom] = useState(() => (span === "day" ? addDays(istDay(now), -1) : timelineStart(now, 14)));
  const [tl, setTl] = useState(null);
  const [audit, setAudit] = useState(null);
  const [cancel, setCancel] = useState(null);

  useEffect(() => {
    setFrom(span === "day" ? addDays(istDay(Date.now()), -1) : span === "month" ? addDays(timelineStart(Date.now(), 7), 0) : timelineStart(Date.now(), 14));
  }, [span]);

  const load = useCallback(() => {
    shop2Api
      .timeline(from, days)
      .then(setTl)
      .catch(() => setTl({}));
    shop2Api
      .audit({ limit: 5 })
      .then((r) => setAudit(r?.entries || []))
      .catch(() => setAudit([]));
  }, [from, days]);
  useEffect(load, [load]);

  const allSets = tl?.sets?.length ? tl.sets : sets || [];
  const clashes = useMemo(() => (tl?.clashes?.length ? tl.clashes : findClashes(allSets, from, days)), [tl, allSets, from, days]);
  const queue = tl?.queue || [];
  const last = dayRange(from, days)[days - 1];
  const rangeLabel = `${fdt(new Date(istMidnight(from) + 3600000).toISOString(), locale, { day: "numeric" })}–${fdt(new Date(istMidnight(last) + 3600000).toISOString(), locale, { day: "numeric", month: "long" })}`;

  const undo = async (e) => {
    try {
      await shop2Api.undoAudit(e);
      notify(t("adminShop2.toast.undone"));
      load();
      onChanged?.();
    } catch (err) {
      fail(err);
    }
  };

  return (
    <div className="as2-grid-b">
      <section className="as2-card as2-tl" data-testid="as2-timeline">
        <header className="as2-ch">
          <h2>
            <Calendar size={17} />
            {t("adminShop2.tl.title")}
          </h2>
          <span className="as2-livechip">
            <i className="as2-dot is-live" />
            {t("adminShop2.live")}
          </span>
          <div className="as2-legend as2-ml">
            <span className="as2-lg is-brand">
              <i />
              {t("adminShop2.tl.now", { time: fdt(new Date(now).toISOString(), locale, { hour: "2-digit", minute: "2-digit" }) })}
            </span>
            <span className="as2-lg is-amber">
              <i />
              {t("adminShop2.tl.rule")}
            </span>
            <span className="as2-lg is-dashed">
              <i />
              {t("adminShop2.tl.planned")}
            </span>
            <span className="as2-lg is-red">
              <i />
              {t("adminShop2.tl.recalled")}
            </span>
          </div>
          {clashes.length ? (
            <span className="as2-clash-chip" data-testid="as2-clash-chip" title={clashes.map((c) => clashText(t, c, locale, allSets)).join("\n")}>
              <AlertTriangle size={14} />
              <b>{fdt(new Date(istMidnight(clashes[0].day) + 3600000).toISOString(), locale, { day: "numeric", month: "short" })}</b>
              {t(`adminShop2.tl.clash.${clashes[0].kind}`, { n: clashes[0].keys.length })}
              {clashes.length > 1 ? <em>+{clashes.length - 1}</em> : null}
            </span>
          ) : null}
        </header>
        <div className="as2-tl-tools">
          <Seg
            size="sm"
            value={span}
            onChange={setSpan}
            label={t("adminShop2.tl.span")}
            options={[
              { id: "day", label: t("adminShop2.tl.day") },
              { id: "w2", label: t("adminShop2.tl.w2") },
              { id: "month", label: t("adminShop2.tl.month") },
            ]}
          />
          <span className="as2-tl-nav">
            <button type="button" className="as2-ibtn" onClick={() => setFrom((d) => addDays(d, -Math.max(1, Math.round(days / 2))))} aria-label={t("adminShop2.tl.prev")}>
              <ChevronLeft size={15} />
            </button>
            <b className="tnum">{rangeLabel}</b>
            <button type="button" className="as2-ibtn" onClick={() => setFrom((d) => addDays(d, Math.max(1, Math.round(days / 2))))} aria-label={t("adminShop2.tl.next")}>
              <ChevronRight size={15} />
            </button>
          </span>
          <button type="button" className="as2-link as2-ml" onClick={() => setFrom(span === "day" ? addDays(istDay(now), -1) : timelineStart(now, 14))}>
            {t("adminShop2.tl.today")}
          </button>
        </div>
        {!tl ? <Skel h={330} r={12} /> : <Chart tl={tl} sets={allSets} from={from} days={days} now={now} clashes={clashes} highlight={highlight} onOpenSet={onOpenSet} onRecall={onRecall} onNight={onNight} onChanged={() => { load(); onChanged?.(); }} notify={notify} fail={fail} />}
      </section>

      <aside className="as2-card as2-queue" data-testid="as2-queue">
        <header className="as2-ch">
          <h2>
            <Clock size={17} />
            {t("adminShop2.q.title")}
          </h2>
          <span className="as2-count as2-ml tnum">{queue.length}</span>
        </header>
        <div className="as2-q-list">
          {!tl ? (
            <Skel h={240} r={12} />
          ) : !queue.length ? (
            <p className="as2-empty">{t("adminShop2.q.empty")}</p>
          ) : (
            queue.map((q) => {
              const ms = Date.parse(q.at) - now;
              const w = waitLabel(ms);
              const soon = ms > 0 && ms < 10 * 60000;
              const Icon = Q_ICON[q.kind] || Clock;
              return (
                <div key={q.id} className={`as2-q${soon ? " is-soon" : ""}`} onMouseEnter={() => onHighlight(q.ref || null)} onMouseLeave={() => onHighlight(null)}>
                  <b className="as2-q-t">
                    <Icon size={15} />
                    {q.title || t(`adminShop2.q.kind.${q.kind}`, q.vars || {})}
                  </b>
                  <span className="as2-q-when">{fdt(q.at, locale, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                  <span className="as2-q-left tnum">{t(w.key, w.vars)}</span>
                  <span className="as2-q-d">{q.detail || ""}</span>
                  {q.cancelable !== false ? (
                    <button type="button" className="as2-q-x" onClick={() => setCancel(q)}>
                      {t("adminShop2.q.cancel")}
                    </button>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
        <header className="as2-ch as2-mt12">
          <h2>
            <History size={17} />
            {t("adminShop2.audit.title")}
          </h2>
          <button type="button" className="as2-link as2-ml" onClick={onAudit}>
            {t("adminShop2.rules.all")}
          </button>
        </header>
        <div className="as2-mini-audit">
          {!audit ? (
            <Skel h={140} r={10} />
          ) : !audit.length ? (
            <p className="as2-empty">{t("adminShop2.audit.empty")}</p>
          ) : (
            audit.slice(0, 4).map((e) => (
              <div key={e.id} className="as2-ma" onMouseEnter={() => onHighlight(e.ref || null)} onMouseLeave={() => onHighlight(null)}>
                <span className="tnum as2-muted">{fdt(e.at, locale, { hour: "2-digit", minute: "2-digit" })}</span>
                <span className="as2-ma-t">
                  <b>{auditTitle(t, e)}</b>
                  <small>{e.actor || t("adminShop2.audit.system")}</small>
                </span>
                {e.undoable && !e.undone && undoLeft(e.undoUntil, now) > 0 ? (
                  <button type="button" className="as2-link" onClick={() => undo(e)}>
                    {t("adminShop2.undo")}
                  </button>
                ) : null}
              </div>
            ))
          )}
        </div>
      </aside>

      <AlgoSummary rules={rules} onRules={onRules} onPreview={onRules} />
      <SlotConversion dash={dash} tl={tl} />
      <TopSellers dash={dash} onOpenSet={onOpenSet} />

      <CancelQueued
        item={cancel}
        onClose={() => setCancel(null)}
        onDone={() => {
          setCancel(null);
          notify(t("adminShop2.toast.queueCanceled"));
          load();
          onChanged?.();
        }}
        fail={fail}
      />
    </div>
  );
}

const Q_ICON = { rules: SlidersHorizontal, night: Moon, set: Layers, recall: RotateCcw, refreshPrice: RefreshCw, limits: Filter, event: Percent };

function clashText(t, c, locale, sets) {
  const names = c.keys.map((k) => sets.find((s) => s.key === k)?.name || k).join(", ");
  return `${fdt(new Date(istMidnight(c.day) + 3600000).toISOString(), locale, { day: "numeric", month: "short" })}: ${t(`adminShop2.tl.clash.${c.kind}`, { n: c.keys.length })} (${names})`;
}

/* ------------------------------------------------------------------ chart */

function Chart({ tl, sets, from, days, now, clashes, highlight, onOpenSet, onRecall, onNight, onChanged, notify, fail }) {
  const { t, locale } = useLocale();
  const f = useFmt();
  const list = dayRange(from, days);
  const today = istDay(now);
  const nowX = dayPos(now, from);
  const [menu, setMenu] = useState(null); // { set, x, y }
  const [drag, setDrag] = useState(null); // { key, x1 }
  const trackRef = useRef(null);
  const bars = useMemo(() => setBars(sets, from, days, now), [sets, from, days, now]);
  const lanes = Math.max(1, ...bars.map((b) => b.lane + 1));
  const clashDays = new Set(clashes.map((c) => c.day));
  const clashKeys = new Set(clashes.flatMap((c) => c.keys));
  const ruleByDay = Object.fromEntries((tl.rules || []).map((r) => [r.day, r]));
  const rev = Object.fromEntries((tl.revenue || []).map((r) => [r.day, r]));
  const revMax = Math.max(1, ...(tl.revenue || []).map((r) => Number(r.value || 0)));
  const pct = (x) => `${(x / days) * 100}%`;
  const menuAnchor = useRef(null);

  const startDrag = (e, b) => {
    e.preventDefault();
    e.stopPropagation();
    const track = trackRef.current?.getBoundingClientRect();
    if (!track) return;
    const perDay = track.width / days;
    const startX = e.clientX;
    const base = b.x1;
    let cur = base;
    const move = (ev) => {
      cur = Math.max(b.x0 + 0.25, Math.round((base + (ev.clientX - startX) / perDay) * 4) / 4);
      setDrag({ key: b.set.key, x1: cur });
    };
    const up = async () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setDrag(null);
      if (Math.abs(cur - base) < 0.2) return;
      const endsAt = new Date(istMidnight(from) + cur * 86400000).toISOString();
      try {
        await shop2Api.patchSet(b.set.key, { endsAt }, "timeline");
        notify(t("adminShop2.toast.endMoved", { name: b.set.name, when: fdt(endsAt, locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) }));
        onChanged();
      } catch (err) {
        fail(err);
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const act = async (kind) => {
    const s = menu?.set;
    setMenu(null);
    if (!s) return;
    if (kind === "edit" || kind === "view") return onOpenSet(s.key);
    if (kind === "recall") return onRecall(s);
    try {
      if (kind === "stock") {
        await shop2Api.addStock(s, 100);
        notify(t("adminShop2.toast.stockAdded", { name: s.name, n: 100 }));
      } else if (kind === "extend") {
        await shop2Api.extendSet(s, 24);
        notify(t("adminShop2.toast.extended", { name: s.name }));
      }
      onChanged();
    } catch (err) {
      fail(err);
    }
  };

  // Drag preview: would the new end clash?
  const dragClash = drag
    ? findClashes(
        sets.map((s) => (s.key === drag.key ? { ...s, endsAt: new Date(istMidnight(from) + drag.x1 * 86400000).toISOString() } : s)),
        from,
        days
      ).some((c) => c.keys.includes(drag.key))
    : false;

  return (
    <div className="as2-tlc" style={{ "--days": days }}>
      <div className="as2-tl-row is-days">
        <span className="as2-tl-lab" />
        <div className="as2-tl-track">
          {list.map((d) => (
            <span key={d} className={`as2-tl-day${d === today ? " is-today" : ""}${clashDays.has(d) ? " is-clash" : ""}`}>
              <small>{fdt(new Date(istMidnight(d) + 3600000).toISOString(), locale, { weekday: "short" })}</small>
              <b className="tnum">{Number(d.slice(8))}</b>
              {clashDays.has(d) ? <AlertTriangle size={12} className="as2-tl-warn" /> : null}
            </span>
          ))}
        </div>
      </div>

      <div className="as2-tl-body" ref={trackRef}>
        {nowX != null && nowX >= 0 && nowX <= days ? (
          <i className="as2-tl-now" style={{ left: `calc(var(--tl-lab) + (100% - var(--tl-lab)) * ${nowX / days})` }} aria-hidden="true" />
        ) : null}

        <div className="as2-tl-row is-rules">
          <span className="as2-tl-lab">
            <Store size={15} />
            {t("adminShop2.tl.rowRules")}
          </span>
          <div className="as2-tl-track is-cells">
            {list.map((d, i) => {
              const r = ruleByDay[d];
              const prev = ruleByDay[list[i - 1]];
              const changed = prev && r && prev.version !== r.version;
              return (
                <span key={d} className={`as2-tl-cell${changed ? " is-change" : ""}`}>
                  {r ? <em className={`as2-vchip${r.scheduled ? " is-sched" : ""}`}>v{r.version}</em> : null}
                </span>
              );
            })}
          </div>
        </div>

        <div className="as2-tl-row is-sets" style={{ "--lanes": lanes }}>
          <span className="as2-tl-lab">
            <Layers size={15} />
            {t("adminShop2.tl.rowSets")}
          </span>
          <div className="as2-tl-track is-bars">
            {bars.map((b) => {
              const s = b.set;
              const x1 = drag?.key === s.key ? drag.x1 : b.x1;
              const recalled = s.status === "recalled";
              const planned = s.startsAt && Date.parse(s.startsAt) > now;
              const draft = s.status === "draft";
              const stock = s.stock || {};
              const soldPct = stock.total ? 1 - (stock.left ?? stock.total) / stock.total : 0;
              const hl = highlight && (highlight === s.key || highlight === `set:${s.key}`);
              return (
                <button
                  key={s.key}
                  type="button"
                  className={`as2-bar${recalled ? " is-recalled" : ""}${planned ? " is-planned" : ""}${draft ? " is-draft" : ""}${clashKeys.has(s.key) ? " is-clash" : ""}${hl ? " is-hl" : ""}${drag?.key === s.key && dragClash ? " is-dragclash" : ""}`}
                  style={{ left: pct(b.x0), width: pct(x1 - b.x0), top: `calc(${b.lane} * var(--lane-h) + 4px)`, "--p1": s.palette?.[1] || "#3a4a8f", "--p2": s.palette?.[2] || "#7a8fff", "--sold": `${Math.round(soldPct * 100)}%` }}
                  onClick={(e) => setMenu({ set: s, x: e.clientX, y: e.clientY })}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setMenu({ set: s, x: e.clientX, y: e.clientY });
                  }}
                  data-testid={`as2-bar-${s.key}`}
                >
                  <i className="as2-bar-fill" />
                  <SetMark set={s} size={16} />
                  <span className="as2-bar-t">
                    {s.name}
                    {recalled ? "" : stock.total != null ? ` · ${f.n(stock.left ?? stock.total)} / ${f.n(stock.total)}` : planned ? ` · ${fdt(s.startsAt, locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : ` · ${t("adminShop2.sets.unlimited").toLocaleLowerCase(locale)}`}
                    {draft ? ` · ${t("adminShop2.status.draft").toLocaleLowerCase(locale)}` : ""}
                  </span>
                  {recalled ? (
                    <span className="as2-bar-x" aria-hidden="true">
                      <RotateCcw size={10} />
                    </span>
                  ) : !draft ? (
                    <span className="as2-bar-h" onPointerDown={(e) => startDrag(e, { ...b, x1 })} role="separator" aria-label={t("adminShop2.tl.dragEnd")} title={t("adminShop2.tl.dragEnd")} />
                  ) : null}
                </button>
              );
            })}
            {drag && dragClash ? (
              <span className="as2-drag-warn" style={{ left: pct(drag.x1) }}>
                <AlertTriangle size={12} />
                {t("adminShop2.tl.dragClash")}
              </span>
            ) : null}
          </div>
        </div>

        <div className="as2-tl-row is-nights">
          <span className="as2-tl-lab">
            <Moon size={15} />
            {t("adminShop2.tl.rowNight")}
          </span>
          <div className="as2-tl-track is-cells">
            {list.map((d) => {
              const n = (tl.nights || []).find((x) => istDay(Date.parse(x.at)) === d);
              const upcoming = n && Date.parse(n.at) > now;
              const isNext = n && upcoming && (tl.nights || []).filter((x) => Date.parse(x.at) > now).sort((a, b) => Date.parse(a.at) - Date.parse(b.at))[0] === n;
              return (
                <span key={d} className="as2-tl-cell">
                  {n ? (
                    <button type="button" className={`as2-nchip${isNext ? " is-next" : ""}${n.skipped ? " is-skip" : ""}`} onClick={onNight}>
                      <Moon size={11} />
                      {fdt(n.at, locale, { hour: "2-digit", minute: "2-digit" })}
                    </button>
                  ) : null}
                </span>
              );
            })}
          </div>
        </div>

        <div className="as2-tl-row is-events">
          <span className="as2-tl-lab">
            <Percent size={15} />
            {t("adminShop2.tl.rowEvents")}
          </span>
          <div className="as2-tl-track is-bars">
            {(tl.events || []).map((ev) => {
              const a = Math.max(0, dayPos(ev.startsAt, from) ?? 0);
              const b = Math.min(days, dayPos(ev.endsAt, from) ?? days);
              if (b <= 0 || a >= days) return null;
              return (
                <span key={ev.id} className={`as2-ev is-${ev.kind || "event"}${Date.parse(ev.startsAt) > now ? " is-planned" : ""}`} style={{ left: pct(a), width: pct(Math.max(0.6, b - a)) }} title={ev.label}>
                  {ev.kind === "gift" ? <Gift size={11} /> : ev.kind === "refreshPrice" ? <RefreshCw size={11} /> : <Percent size={11} />}
                  {ev.label}
                </span>
              );
            })}
          </div>
        </div>

        <div className="as2-tl-row is-rev">
          <span className="as2-tl-lab">
            <Wallet size={15} />
            {t("adminShop2.tl.rowRevenue")}
          </span>
          <div className="as2-tl-track is-cells">
            {list.map((d) => {
              const r = rev[d];
              const future = d > today;
              return (
                <span key={d} className="as2-tl-cell is-rev" title={r ? `${f.n(r.value)} D` : ""}>
                  <i className={`as2-revbar${future || r?.forecast ? " is-fc" : ""}${d === today ? " is-today" : ""}`} style={{ height: `${Math.max(future ? 46 : 6, ((r?.value || 0) / revMax) * 100)}%` }} />
                </span>
              );
            })}
          </div>
          <small className="as2-tl-fc">{t("adminShop2.tl.forecastNote")}</small>
        </div>
      </div>

      <Popover open={Boolean(menu)} onClose={() => setMenu(null)} anchorRef={menuAnchor} pos={menu ? { x: menu.x + 4, y: menu.y + 4 } : null} width={236} label={t("adminShop2.tl.menu")} testId="as2-bar-menu">
        <button type="button" className="as2-pop-it" onClick={() => act("edit")} data-autofocus="">
          <Pencil size={15} />
          {t("adminShop2.tl.m.edit")}
        </button>
        {menu?.set?.status !== "recalled" ? (
          <>
            <button type="button" className="as2-pop-it" onClick={() => act("stock")} disabled={menu?.set?.stock?.total == null}>
              <Package size={15} />
              {t("adminShop2.tl.m.stock")}
            </button>
            <button type="button" className="as2-pop-it" onClick={() => act("extend")}>
              <Timer size={15} />
              {t("adminShop2.tl.m.extend")}
            </button>
          </>
        ) : null}
        <button type="button" className="as2-pop-it" onClick={() => act("view")}>
          <Eye size={15} />
          {t("adminShop2.tl.m.view")}
        </button>
        {menu?.set && menu.set.status !== "recalled" && menu.set.status !== "draft" ? (
          <>
            <i className="as2-pop-sep" />
            <button type="button" className="as2-pop-it is-danger" onClick={() => act("recall")}>
              <RotateCcw size={15} />
              {t("adminShop2.tl.m.recall")}
            </button>
          </>
        ) : null}
      </Popover>
    </div>
  );
}

/* ------------------------------------------------------------------ bottom cards */

function AlgoSummary({ rules, onRules, onPreview }) {
  const { t } = useLocale();
  const f = useFmt();
  const live = rules?.live;
  const w = normalizeWeights(live?.weights || {});
  const arcs = donutArcs(w);
  const tg = live?.toggles || {};
  const toggles = [
    ["hideOwned", t("adminShop2.algo.short.hideOwned")],
    ["noRepeat", t("adminShop2.algo.short.noRepeat", { n: tg.noRepeatDays ?? 7 })],
    ["minEpic", t("adminShop2.algo.short.minEpic")],
    ["newAccount", t("adminShop2.algo.short.newAccount", { cap: f.n(live?.newAccount?.slotCap ?? 1500) })],
  ];
  return (
    <section className="as2-card as2-algosum" data-testid="as2-algosum">
      <header className="as2-ch">
        <h2>
          <SlidersHorizontal size={17} />
          {t("adminShop2.algo.title")}
        </h2>
        {live ? <Pill tone="blue">{t(rules?.scheduled ? "adminShop2.algo.tonight" : "adminShop2.algo.liveBadge", { v: rules?.scheduled?.version || live.version })}</Pill> : null}
      </header>
      {!live ? (
        <Skel h={150} r={12} />
      ) : (
        <>
          <div className="as2-donut-row">
            <svg viewBox="0 0 100 100" className="as2-donut" aria-hidden="true">
              <circle cx="50" cy="50" r="38" className="as2-donut-bg" />
              {arcs.map((a) => (
                <path key={a.rarity} d={arcPath(50, 50, 38, a.from, a.to)} stroke={RARITY_COLOR[a.rarity]} className="as2-donut-arc" />
              ))}
              <text x="50" y="50" className="as2-donut-n">
                {f.n(rules?.pool?.total ?? live.pool ?? 0)}
              </text>
              <text x="50" y="63" className="as2-donut-s">
                {t("adminShop2.algo.poolShort")}
              </text>
            </svg>
            <ul className="as2-donut-lg">
              {RARITIES.map((r) => (
                <li key={r} style={{ "--rc": RARITY_COLOR[r] }}>
                  <i />
                  {t(`adminShop2.rarity.${r}`)}
                  <b className="tnum">{f.p(w[r], 0)}</b>
                </li>
              ))}
            </ul>
          </div>
          <div className="as2-sum-tg">
            {toggles.map(([k, label]) => (
              <span key={k} className="as2-tg is-ro">
                <Switch checked={k === "newAccount" ? true : Boolean(tg[k] ?? true)} onChange={() => onRules()} label={label} />
                <span>{label}</span>
              </span>
            ))}
          </div>
          <footer className="as2-sum-ft">
            <button type="button" className="as2-btn is-sm" onClick={onRules}>
              <SlidersHorizontal size={14} />
              {t("adminShop2.algo.openRules")}
            </button>
            <button type="button" className="as2-btn is-sm" onClick={onPreview}>
              <FlaskConical size={14} />
              {t("adminShop2.algo.previewTomorrow")}
            </button>
          </footer>
        </>
      )}
    </section>
  );
}

function SlotConversion({ dash, tl }) {
  const { t } = useLocale();
  const f = useFmt();
  const sc = tl?.slotConversion || [];
  const max = Math.max(1, ...sc.map((s) => Number(s.pct || 0)));
  const toSet = tl?.toSet || dash?.toSet || {};
  return (
    <section className="as2-card as2-slotconv" data-testid="as2-slotconv">
      <header className="as2-ch">
        <h2>
          <Filter size={17} />
          {t("adminShop2.slots.title")}
        </h2>
        <span className="as2-muted as2-ml">{t("adminShop2.slots.window")}</span>
      </header>
      {!tl ? (
        <Skel h={150} r={12} />
      ) : (
        <>
          <div className="as2-sc-list">
            {sc.map((s, i) => (
              <div key={i} className="as2-sc">
                <span>
                  <b>{t("adminShop2.algo.slot", { n: i + 1 })}</b>
                  <small className="tnum">{s.band ? (s.band[1] == null ? t("adminShop2.algo.bandFrom", { a: f.n(s.band[0]) }) : `${f.n(s.band[0])}–${f.n(s.band[1])}`) : ""}</small>
                  <em className="tnum">{f.p(s.pct ?? 0)}</em>
                </span>
                <i>
                  <b style={{ width: `${(Number(s.pct || 0) / max) * 100}%` }} />
                </i>
              </div>
            ))}
          </div>
          <div className="as2-sc-foot">
            <span>
              <RefreshCw size={14} />
              {t("adminShop2.slots.afterRefresh")}
              <b className="tnum">{f.n(dash?.refreshes?.today ?? 0)}</b>
              <em className="tnum as2-muted">{f.c(dash?.refreshes?.revenue ?? 0)} D</em>
            </span>
            <span>
              <Layers size={14} />
              {t("adminShop2.slots.toSet")}
              <b className="tnum">{f.p(toSet.pct ?? 0)}</b>
              <em className="tnum as2-muted" />
            </span>
          </div>
        </>
      )}
    </section>
  );
}

function signed(f, v) {
  const n = Number(v || 0);
  return `${n >= 0 ? "+" : "−"}${f.n(Math.abs(n), { maximumFractionDigits: 1 })}`;
}

function TopSellers({ dash, onOpenSet }) {
  const { t, locale } = useLocale();
  const f = useFmt();
  const [range, setRange] = useState("7d");
  const rows = dash?.topSellers?.[range] || [];
  const max = Math.max(1, ...rows.map((r) => Number(r.revenue || 0)));
  return (
    <section className="as2-card as2-top" data-testid="as2-top">
      <header className="as2-ch">
        <h2>
          <Star size={17} />
          {t("adminShop2.top.title")}
        </h2>
        <Seg size="sm" value={range} onChange={setRange} label={t("adminShop2.top.title")} options={["7d", "30d"].filter((k) => dash?.topSellers?.[k]).map((k) => ({ id: k, label: t(k === "7d" ? "adminShop2.top.d7" : "adminShop2.top.d30") }))} />
      </header>
      {!dash ? (
        <Skel h={150} r={12} />
      ) : !rows.length ? (
        <p className="as2-empty">{t("adminShop2.sets.noSales")}</p>
      ) : (
        <ol className="as2-top-list">
          {rows.slice(0, 5).map((r, i) => (
            <li key={r.key || i}>
              <span className="as2-top-n tnum">{i + 1}</span>
              <button type="button" className="as2-top-b" onClick={() => r.key && onOpenSet(r.key)}>
                <SetMark set={r} size={26} />
                <span className="as2-top-name">{typeof r.name === "object" ? r.name[locale] || r.name.tr : r.name}</span>
                <b className="tnum">{f.c(r.revenue)}</b>
                <i className="as2-top-bar" style={{ width: `${(Number(r.revenue || 0) / max) * 100}%`, "--p2": r.palette?.[2] || "#7a8fff" }} />
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ cancel queued */

function CancelQueued({ item, onClose, onDone, fail }) {
  const { t, locale } = useLocale();
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try {
      await shop2Api.cancelQueued(item.id);
      onDone();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={Boolean(item)}
      onClose={onClose}
      busy={busy}
      icon={AlertTriangle}
      tone="amber"
      title={t("adminShop2.q.cancelTitle")}
      subtitle={item ? `${item.title || t(`adminShop2.q.kind.${item.kind}`, item.vars || {})} · ${fdt(item.at, locale, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}
      width={520}
      footer={
        <>
          <button type="button" className="as2-btn" onClick={onClose} disabled={busy}>
            {t("adminShop2.cancel")}
          </button>
          <button type="button" className="as2-btn is-danger" onClick={go} disabled={busy} data-testid="as2-queue-cancel-confirm">
            {t("adminShop2.q.cancelGo")}
          </button>
        </>
      }
    >
      <p className="as2-hint">{t("adminShop2.q.cancelNote")}</p>
    </Dialog>
  );
}

