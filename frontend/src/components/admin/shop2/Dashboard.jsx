/**
 * Pano (Draft A frame A1): live sales chart, storefront algorithm, sets table with recall
 * and the 30-minute undo, rules and limits.
 */
import { useMemo, useRef, useState } from "react";
import { useLocale } from "../../../context/LocaleContext";
import { Gift, Layers, Moon, Pencil, RefreshCw, RotateCcw, TrendingUp, Undo2, UserRound, Activity } from "../../ui/Icon.jsx";
import AlgorithmPanel from "./AlgorithmPanel.jsx";
import { Pill, PieceDots, Seg, SetMark, Spark, Skel, UserAv, useFmt, useItemName, fdt } from "./ui.jsx";
import { STATUS_TONE, SET_SLOTS, areaPath, filterSets, lastIndex, lifecycle, linePath, mmss, niceMax, setCounts, trend, undoLeft } from "./shop2Model.js";

export default function Dashboard({ dash, range, onRange, sets, rules, limits, night, now, flash, onOpenSet, onRecall, onUndoRecall, onRulesChanged, onNight, onLimits, notify, fail }) {
  const [algoFocus, setAlgoFocus] = useState(null);
  return (
    <div className="as2-grid-a">
      <div className="as2-col">
        <LiveSales dash={dash} range={range} onRange={onRange} now={now} />
        <SetsTable sets={sets} now={now} flash={flash} onOpenSet={onOpenSet} onRecall={onRecall} onUndoRecall={onUndoRecall} />
      </div>
      <div className="as2-col">
        <AlgorithmPanel rules={rules} now={now} onChanged={onRulesChanged} notify={notify} fail={fail} focus={algoFocus} />
        <RulesCard limits={limits} night={night} rules={rules} now={now} onNight={onNight} onLimits={onLimits} onNewAccount={() => setAlgoFocus({ tab: "newAccount", at: Date.now() })} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ live sales */

const SERIES = [
  { key: "total", tone: "brand", fill: true },
  { key: "storefront", tone: "brand", fill: true },
  { key: "sets", tone: "amber", fill: true },
  { key: "gifts", tone: "violet", fill: false },
  { key: "yesterday", tone: "gray", fill: false, dashed: true },
];

export function LiveSales({ dash, range, onRange, now }) {
  const { t, locale } = useLocale();
  const f = useFmt();
  const name = useItemName();
  const [hidden, setHidden] = useState({});
  const [hover, setHover] = useState(null);
  const svgRef = useRef(null);
  const sales = dash?.sales;
  const series = sales?.series || [];
  const labels = sales?.labels || [];
  const slots = sales?.slots || labels.length || 24;
  const visible = series.filter((s) => !hidden[s.key]);
  const max = niceMax(visible.flatMap((s) => (s.values || []).filter(Number.isFinite)));
  const W = 640;
  const H = 150;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((p) => max * p);
  const last = dash?.lastSale;
  const pointer = (e) => {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r) return;
    const i = Math.round(((e.clientX - r.left) / r.width) * (slots - 1));
    setHover(Math.max(0, Math.min(slots - 1, i)));
  };
  return (
    <section className="as2-card as2-sales" data-testid="as2-sales">
      <header className="as2-ch">
        <h2>
          <TrendingUp size={17} />
          {t("adminShop2.sales.title")}
        </h2>
        <span className="as2-livechip">
          <i className="as2-dot is-live" />
          {t("adminShop2.live")}
        </span>
        <div className="as2-legend as2-ml">
          {SERIES.filter((s) => series.some((x) => x.key === s.key)).map((s) => (
            <button key={s.key} type="button" className={`as2-lg is-${s.tone}${hidden[s.key] ? " is-off" : ""}`} aria-pressed={!hidden[s.key]} onClick={() => setHidden((h) => ({ ...h, [s.key]: !h[s.key] }))}>
              <i />
              {t(`adminShop2.sales.${s.key}`)}
            </button>
          ))}
        </div>
        <Seg
          size="sm"
          value={range}
          onChange={onRange}
          label={t("adminShop2.sales.range")}
          options={[
            { id: "today", label: t("adminShop2.sales.today") },
            { id: "7d", label: t("adminShop2.sales.d7") },
            { id: "30d", label: t("adminShop2.sales.d30") },
          ]}
        />
      </header>
      <div className="as2-chart">
        <div className="as2-chart-y" aria-hidden="true">
          {[...ticks].reverse().map((v, i) => (
            <span key={i} className="tnum">
              {f.c(v)}
            </span>
          ))}
        </div>
        <div className="as2-chart-plot">
          {!sales ? (
            <Skel h={H} r={10} />
          ) : (
            <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="as2-chart-svg" onMouseMove={pointer} onMouseLeave={() => setHover(null)} role="img" aria-label={t("adminShop2.sales.title")}>
              {ticks.map((_, i) => (
                <line key={i} x1="0" x2={W} y1={(H * i) / 4} y2={(H * i) / 4} className="as2-grid-line" />
              ))}
              <defs>
                <linearGradient id="as2-g-brand" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0" stopColor="#6f8dff" stopOpacity="0.45" />
                  <stop offset="1" stopColor="#6f8dff" stopOpacity="0.02" />
                </linearGradient>
                <linearGradient id="as2-g-amber" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0" stopColor="#f2b84b" stopOpacity="0.38" />
                  <stop offset="1" stopColor="#f2b84b" stopOpacity="0.02" />
                </linearGradient>
              </defs>
              {SERIES.map((meta) => {
                const s = series.find((x) => x.key === meta.key);
                if (!s || hidden[meta.key]) return null;
                const vals = s.values || [];
                const li = lastIndex(vals);
                return (
                  <g key={meta.key} className={`as2-ser is-${meta.tone}`}>
                    {meta.fill ? <path d={areaPath(vals, W, H, max, slots)} fill={`url(#as2-g-${meta.tone})`} /> : null}
                    <path d={linePath(vals, W, H, max, slots)} className={`as2-ser-line${meta.dashed ? " is-dashed" : ""}`} vectorEffect="non-scaling-stroke" />
                    {!meta.dashed && li >= 0 && range === "today" ? (
                      <circle cx={(li / Math.max(1, slots - 1)) * W} cy={H - (Math.max(0, vals[li]) / max) * H} r="4" className="as2-ser-dot" />
                    ) : null}
                  </g>
                );
              })}
              {hover != null ? <line x1={(hover / Math.max(1, slots - 1)) * W} x2={(hover / Math.max(1, slots - 1)) * W} y1="0" y2={H} className="as2-hover-line" /> : null}
            </svg>
          )}
          {hover != null && sales ? (
            <div className="as2-chart-tip" style={{ left: `${(hover / Math.max(1, slots - 1)) * 100}%` }}>
              <b>{labels[hover] ?? hover}</b>
              {series
                .filter((s) => !hidden[s.key])
                .map((s) => (
                  <span key={s.key} className={`is-${SERIES.find((m) => m.key === s.key)?.tone || "gray"}`}>
                    <i />
                    {t(`adminShop2.sales.${s.key}`)}
                    <b className="tnum">{Number.isFinite(s.values?.[hover]) ? f.n(s.values[hover]) : "–"}</b>
                  </span>
                ))}
            </div>
          ) : null}
          <div className="as2-chart-x" aria-hidden="true">
            {labels.map((l, i) =>
              i % Math.max(1, Math.round(slots / 8)) === 0 ? (
                <span key={i} style={{ left: `${(i / Math.max(1, slots - 1)) * 100}%` }}>
                  {l}
                </span>
              ) : null
            )}
          </div>
        </div>
      </div>
      <footer className="as2-ticker">
        {last ? (
          <div className="as2-ticker-in" key={last.at}>
            <Pill tone="green">{agoLabel(t, last.at, now)}</Pill>
            <UserAv name={last.username || "?"} size={18} />
            <span className="as2-ticker-t">
              {t(last.kind === "set" ? "adminShop2.sales.lastSet" : last.kind === "gift" ? "adminShop2.sales.lastGift" : "adminShop2.sales.lastItem", {
                user: last.username ? `@${last.username}` : t("adminShop2.sales.someone"),
                name: last.setName || name(last.item) || "",
              })}
            </span>
            <span className="as2-muted">
              {" · "}
              {last.kind === "set" && last.ownedPieces
                ? t("adminShop2.sales.lastPaid", { price: f.n(last.price), n: last.ownedPieces, paid: f.n(last.paid) })
                : t("adminShop2.sales.lastPrice", { price: f.n(last.paid ?? last.price) })}
            </span>
          </div>
        ) : (
          <span className="as2-muted">{t("adminShop2.sales.none")}</span>
        )}
        <span className="as2-muted as2-ml tnum">{t("adminShop2.sales.thisHour", { n: f.n(sales?.thisHour || 0) })}</span>
      </footer>
    </section>
  );
}

export function agoLabel(t, at, now) {
  const s = Math.max(0, Math.floor((now - Date.parse(at)) / 1000));
  if (s < 45) return t("adminShop2.ago.now");
  if (s < 3600) return t("adminShop2.ago.m", { n: Math.max(1, Math.round(s / 60)) });
  if (s < 86400) return t("adminShop2.ago.h", { n: Math.round(s / 3600) });
  return t("adminShop2.ago.d", { n: Math.round(s / 86400) });
}

/* ------------------------------------------------------------------ sets table */

export function SetsTable({ sets, now, flash, onOpenSet, onRecall, onUndoRecall }) {
  const { t, locale } = useLocale();
  const f = useFmt();
  const [filter, setFilter] = useState("all");
  const counts = useMemo(() => setCounts(sets || [], now), [sets, now]);
  const rows = useMemo(() => filterSets(sets || [], filter, now), [sets, filter, now]);
  return (
    <section className="as2-card as2-sets" data-testid="as2-sets">
      <header className="as2-ch">
        <h2>
          <Layers size={17} />
          {t("adminShop2.sets.title")}
        </h2>
        <Pill tone="green">{t("adminShop2.sets.liveN", { n: counts.live })}</Pill>
        <Pill tone="blue">{t("adminShop2.sets.scheduledN", { n: counts.scheduled })}</Pill>
        <Seg
          size="sm"
          value={filter}
          onChange={setFilter}
          label={t("adminShop2.sets.filter")}
          options={[
            { id: "all", label: t("adminShop2.sets.all"), count: (sets || []).length },
            { id: "live", label: t("adminShop2.sets.live") },
            { id: "scheduled", label: t("adminShop2.sets.scheduled") },
            { id: "archive", label: t("adminShop2.sets.archive") },
          ]}
        />
      </header>
      <div className="as2-tbl" role="table" aria-label={t("adminShop2.sets.title")}>
        <div className="as2-tr is-head" role="row">
          <span role="columnheader">{t("adminShop2.sets.colSet")}</span>
          <span role="columnheader">{t("adminShop2.sets.colStock")}</span>
          <span role="columnheader" className="is-r">{t("adminShop2.sets.colRevenue")}</span>
          <span role="columnheader" className="is-r">{t("adminShop2.sets.colConv")}</span>
          <span role="columnheader">{t("adminShop2.sets.colSpeed")}</span>
          <span role="columnheader" className="is-r">{t("adminShop2.sets.colAction")}</span>
        </div>
        {!sets ? (
          Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="as2-tr" role="row">
              <Skel w="80%" h={30} />
            </div>
          ))
        ) : !rows.length ? (
          <p className="as2-empty">{t("adminShop2.sets.empty")}</p>
        ) : (
          rows.map((s) => {
            const st = lifecycle(s, now);
            const left = undoLeft(s.undoUntil, now);
            const stock = s.stock || {};
            const sold = stock.total ? 1 - (stock.left ?? stock.total) / stock.total : 0;
            const fl = flash?.[`set:${s.key}`];
            return (
              <div
                key={s.key}
                role="row"
                className={`as2-tr is-click${st === "recalled" ? " is-recalled" : ""}${fl && Date.now() - fl < 1600 ? " is-flash" : ""}`}
                onClick={() => onOpenSet(s.key)}
                data-testid={`as2-set-row-${s.key}`}
              >
                <span role="cell" className="as2-set-cell">
                  <SetMark set={s} size={38} />
                  <span className="as2-set-txt">
                    <span className="as2-set-name">
                      <b>{typeof s.name === "object" ? s.name[locale] || s.name.tr : s.name}</b>
                      <Pill tone={STATUS_TONE[st] || "gray"}>{statusText(t, s, st, locale, now)}</Pill>
                    </span>
                    <PieceDots set={s} slots={SET_SLOTS} size={14} />
                  </span>
                </span>
                <span role="cell" className="as2-stock">
                  {stock.total == null ? (
                    <span className="as2-muted">{t("adminShop2.sets.unlimited")}</span>
                  ) : (
                    <>
                      <span className="tnum">{t("adminShop2.sets.left", { left: f.n(stock.left ?? stock.total), total: f.n(stock.total) })}</span>
                      <i className={`as2-stockbar${sold >= 1 ? " is-done" : ""}`}>
                        <b style={{ width: `${Math.round(sold * 100)}%` }} />
                      </i>
                    </>
                  )}
                </span>
                <span role="cell" className="is-r tnum">{s.revenue7d ? f.c(s.revenue7d) : "–"}</span>
                <span role="cell" className="is-r tnum">{s.conversionPct != null ? f.p(s.conversionPct) : s.sold7d ? f.n(s.sold7d) : "–"}</span>
                <span role="cell">{s.velocity?.length > 1 ? <Spark values={s.velocity} tone={trend(s.velocity) === "down" ? "red" : "brand"} w={64} h={20} fill={false} /> : <span className="as2-muted">{t("adminShop2.sets.noSales")}</span>}</span>
                <span role="cell" className="is-r as2-row-acts" onClick={(e) => e.stopPropagation()}>
                  {st === "recalled" ? (
                    left > 0 ? (
                      <button type="button" className="as2-btn is-sm" onClick={() => onUndoRecall(s)} data-testid={`as2-undo-${s.key}`}>
                        <Undo2 size={14} />
                        {t("adminShop2.sets.undo")}
                        <span className="tnum as2-muted">{mmss(left)}</span>
                      </button>
                    ) : (
                      <span className="as2-muted">{t("adminShop2.sets.undoClosed")}</span>
                    )
                  ) : st === "live" || st === "last24" ? (
                    <>
                      <button type="button" className="as2-btn is-sm is-danger-soft" onClick={() => onRecall(s)} data-testid={`as2-recall-${s.key}`}>
                        <RotateCcw size={14} />
                        {t("adminShop2.sets.recall")}
                      </button>
                    </>
                  ) : (
                    <button type="button" className="as2-btn is-sm" onClick={() => onOpenSet(s.key)}>
                      <Pencil size={14} />
                      {t("adminShop2.sets.edit")}
                    </button>
                  )}
                </span>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

export function statusText(t, s, st, locale, now) {
  if (st === "upcoming") return fdt(s.startsAt, locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  if (st === "last24") return t("adminShop2.status.last24");
  if (st === "soldout") return t("adminShop2.status.soldout");
  return t(`adminShop2.status.${st}`);
}

/* ------------------------------------------------------------------ rules and limits */

function RulesCard({ limits, night, rules, now, onNight, onLimits, onNewAccount }) {
  const { t, locale } = useLocale();
  const f = useFmt();
  const S = limits?.stats || {};
  const sched = night?.schedule || {};
  const next = night?.open ? null : night?.next?.at || null;
  const nextLabel = night?.open ? t("adminShop2.rules.nightOpenNow") : next ? fdt(next, locale, { weekday: "long" }) : null;
  const gift = limits?.gift || {};
  const refresh = limits?.refresh || {};
  const na = rules?.live?.newAccount || {};
  const rows = [
    {
      key: "night",
      icon: Moon,
      title: t("adminShop2.rules.night"),
      sub: t("adminShop2.rules.nightSub", { n: (sched.weekdays || []).length, from: sched.openFrom || "22:00", to: sched.openTo || "02:00", cards: sched.cards || 6 }),
      pill: nextLabel ? <Pill tone="violet">{night?.open ? nextLabel : t("adminShop2.rules.nightNext", { day: nextLabel })}</Pill> : null,
      onClick: onNight,
    },
    {
      key: "refresh",
      icon: RefreshCw,
      title: t("adminShop2.rules.refresh"),
      sub: t(refresh.premiumFree === false ? "adminShop2.rules.refreshSubPaid" : "adminShop2.rules.refreshSub", { n: refresh.perDay ?? 1, price: f.n(refresh.price ?? 150) }),
      pill: <Pill tone="gray">{t("adminShop2.rules.today", { n: f.n(S.refreshToday ?? 0) })}</Pill>,
      onClick: () => onLimits("refresh"),
    },
    {
      key: "gift",
      icon: Gift,
      title: t("adminShop2.rules.gift"),
      sub: gift.frozen ? t("adminShop2.rules.giftFrozen") : t("adminShop2.rules.giftSub", { send: gift.perDay ?? 3, recv: gift.receivePerDay ?? 5, days: gift.minAccountDaysSend ?? 7 }),
      pill: S.giftBlockedToday || S.openFlags ? <Pill tone={S.openFlags ? "red" : "amber"}>{S.openFlags ? t("adminShop2.tile.flags", { n: f.n(S.openFlags) }) : t("adminShop2.rules.blocks", { n: f.n(S.giftBlockedToday) })}</Pill> : null,
      onClick: () => onLimits(S.openFlags ? "flags" : "gift"),
    },
    {
      key: "newAccount",
      icon: UserRound,
      title: t("adminShop2.rules.newAccount"),
      sub: t("adminShop2.rules.newAccountSub", { days: na.days ?? 3, cap: f.n(na.slotCap ?? 600) }),
      pill: null,
      onClick: onNewAccount,
    },
  ];
  return (
    <section className="as2-card as2-rules" data-testid="as2-rules">
      <header className="as2-ch">
        <h2>
          <Activity size={17} />
          {t("adminShop2.rules.title")}
        </h2>
        <button type="button" className="as2-link as2-ml" onClick={() => onLimits("gift")}>
          {t("adminShop2.rules.all")}
        </button>
      </header>
      <div className="as2-rule-list">
        {rows.map(({ key, icon: Icon, title, sub, pill, onClick }) => (
          <button key={key} type="button" className="as2-rule" onClick={onClick} data-testid={`as2-rule-${key}`}>
            <span className="as2-rule-ic">
              <Icon size={16} />
            </span>
            <span className="as2-rule-t">
              <b>{title}</b>
              <small>{sub}</small>
            </span>
            {pill}
          </button>
        ))}
      </div>
    </section>
  );
}

