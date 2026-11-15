/**
 * Draft B upper half: saved views row, KPI tiles, "Yönetici etkinliği · son 24
 * saat" stacked bar chart, "Kim ne kadar yaptı" leaderboard with 7-day
 * sparklines, and the red "Olağan dışı" banner.
 */
import { useRef, useState } from "react";
import { AlertTriangle, BarChart3, Bookmark, Bot, Check, Coins, Eye, List, Plus, User, Users, X } from "../../ui/Icon.jsx";
import { formatNumber } from "../../../i18n/format.js";
import { AuditMenu, Av } from "./AuditUi.jsx";
import { OTHER_COLOR, SERIES_COLORS, chartScale, clock, handle, hourLabel } from "./auditModel.js";
import { Trash2 } from "../../ui/Icon.jsx";

const VIEW_ICON = { all: List, critical: AlertTriangle, agent: Bot, economy: Coins, mine: User };

export function ViewsRow({ builtins, saved, counts, activeId, onPick, onSave, onDelete, viewsReady, t, locale, me }) {
  const [menu, setMenu] = useState(null);
  const anchor = useRef(null);
  const chip = (id, label, Icon, extra = {}) => (
    <button
      key={id}
      type="button"
      className={`alg-vw${activeId === id ? " is-on" : ""}`}
      aria-pressed={activeId === id}
      onClick={() => onPick(id)}
      onContextMenu={
        extra.saved
          ? (e) => {
              e.preventDefault();
              anchor.current = e.currentTarget;
              setMenu(extra.view);
            }
          : undefined
      }
      title={extra.title}
      data-testid={`audit-view-${id}`}
    >
      <Icon size={18} />
      <span>{label}</span>
      {counts?.[id] != null ? <em className="tnum">{formatNumber(counts[id], locale)}</em> : null}
    </button>
  );
  const all = builtins.find((b) => b.id === "all");
  const rest = builtins.filter((b) => b.id !== "all");
  return (
    <div className="alg-views" role="toolbar" aria-label={t("auditLog.views.label")}>
      {all ? chip("all", t("auditLog.views.all"), List) : null}
      {saved.map((v) =>
        chip(v.id, v.name, Bookmark, { saved: true, view: v, title: v.ownerId !== me ? t("auditLog.views.shared", { user: handle(v.ownerUsername || "?") }) : undefined })
      )}
      {rest.map((b) => chip(b.id, t(`auditLog.views.${b.id}`), VIEW_ICON[b.id] || List))}
      <button type="button" className="alg-vw is-add" onClick={onSave} disabled={!viewsReady} title={viewsReady ? undefined : t("auditLog.views.notReady")} data-testid="audit-view-save">
        <Plus size={18} />
        <span>{t("auditLog.views.save")}</span>
      </button>
      <AuditMenu
        open={Boolean(menu)}
        onClose={() => setMenu(null)}
        anchorRef={anchor}
        align="left"
        width={220}
        label={t("auditLog.views.menu")}
        items={
          menu
            ? [
                {
                  id: "delete",
                  label: t("auditLog.views.delete"),
                  icon: Trash2,
                  danger: true,
                  disabled: menu.ownerId !== me,
                  onSelect: () => onDelete(menu),
                },
              ]
            : []
        }
      />
    </div>
  );
}

export function KpiRow({ kpis, loading, t, locale, onDrill }) {
  if (loading || !kpis) {
    return (
      <div className="alg-kpis" aria-busy="true">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="alg-kpi is-skel">
            <span className="alg-skel" style={{ width: 90, height: 12 }} />
            <span className="alg-skel" style={{ width: 54, height: 26, marginTop: 10 }} />
          </div>
        ))}
      </div>
    );
  }
  const n = (v) => formatNumber(v || 0, locale);
  const pct = kpis.total.deltaPct;
  const tiles = [
    { id: "total", label: t("auditLog.kpi.total"), value: n(kpis.total.value), chip: pct == null ? null : t("auditLog.kpi.pct", { n: `${pct > 0 ? "+" : ""}${pct}` }), tone: pct > 0 ? "pos" : pct < 0 ? "neg-soft" : "muted" },
    { id: "critical", label: t("auditLog.kpi.critical"), value: n(kpis.critical.value), chip: kpis.critical.delta ? t("auditLog.kpi.delta", { n: `${kpis.critical.delta > 0 ? "+" : ""}${kpis.critical.delta}` }) : null, tone: kpis.critical.delta > 0 ? "neg" : "muted" },
    { id: "agent", label: t("auditLog.kpi.agent"), value: n(kpis.agent.value), chip: t("auditLog.kpi.agentRuns", { n: kpis.agent.runs || 0 }), tone: "muted" },
    { id: "denied", label: t("auditLog.kpi.denied"), value: n(kpis.denied.value), chip: kpis.denied.top ? handle(kpis.denied.top) : null, tone: "neg" },
    { id: "undone", label: t("auditLog.kpi.undone"), value: n(kpis.undone.value), chip: t("auditLog.kpi.people", { n: kpis.undone.people || 0 }), tone: "muted" },
  ];
  return (
    <div className="alg-kpis">
      {tiles.map((k) => (
        <button key={k.id} type="button" className="alg-kpi" onClick={() => onDrill(k.id)} aria-label={`${k.label}: ${k.value}. ${t("auditLog.kpi.filter", { label: k.label })}`} data-testid={`audit-kpi-${k.id}`}>
          <span className="alg-kpi-l">{k.label}</span>
          {k.chip ? <small className={`alg-kpi-c is-${k.tone}`}>{k.chip}</small> : null}
          <b className="tnum">{k.value}</b>
        </button>
      ))}
    </div>
  );
}

function seriesLabel(key, users, t) {
  if (key === "agent") return t("auditLog.agent");
  return handle(key);
}

export function ActivityChart({ chart, loading, users, t, locale, onPickHour }) {
  const buckets = chart?.buckets || [];
  const series = chart?.series || [];
  const max = chartScale(buckets);
  const hotIdx = buckets.findIndex((b) => b.hot);
  // Draft axis: 00, 04, 08, 12, 16, 20, 23; the anomaly hour reads "20:00 · olağan dışı".
  // The hot label is anchored on the side with room (right edge late in the day).
  const hotRight = hotIdx >= 17;
  const labels = [0, 4, 8, 12, 16, 20, 23].filter((i) => {
    if (hotIdx < 0 || i === hotIdx) return true;
    return hotRight ? !(i > hotIdx - 4 && i <= hotIdx) && !(i > hotIdx && i < 23) && !(i === 23 && hotIdx >= 22) : !(i >= hotIdx && i < hotIdx + 4);
  });
  if (hotIdx >= 0 && !labels.includes(hotIdx)) labels.push(hotIdx);
  const axisStyle = (i) => {
    if (i === hotIdx) return hotRight ? { right: `${((23 - i) / 24) * 100}%` } : { left: `${(i / 24) * 100}%` };
    if (i === 0) return { left: 0 };
    if (i === 23) return { right: 0 };
    return { left: `${((i + 0.5) / 24) * 100}%`, transform: "translateX(-50%)" };
  };
  const empty = !loading && buckets.every((b) => (b.counts || []).every((x) => !x) && !b.other);
  return (
    <section className="alg-card alg-chart-card" aria-labelledby="alg-chart-h">
      <h3 id="alg-chart-h">
        <BarChart3 size={20} />
        <span>{t("auditLog.chart.title")}</span>
        <span className="alg-legend">
          {series.map((s, i) => (
            <span key={s}>
              <i style={{ background: SERIES_COLORS[i] }} />
              {seriesLabel(s, users, t)}
            </span>
          ))}
        </span>
      </h3>
      {loading ? (
        <div className="alg-chart is-skel">
          {Array.from({ length: 24 }, (_, i) => (
            <span key={i} className="alg-skel" style={{ height: `${20 + ((i * 37) % 60)}%` }} />
          ))}
        </div>
      ) : empty ? (
        <p className="alg-empty-s">{t("auditLog.chart.empty")}</p>
      ) : (
        <div className="alg-chart" role="group" aria-label={t("auditLog.chart.title")}>
          {buckets.map((b, i) => {
            const total = (b.counts || []).reduce((s, x) => s + x, 0) + (b.other || 0);
            const time = hourLabel(b.at, locale);
            return (
              <button
                key={b.at}
                type="button"
                className={`alg-col${b.hot ? " is-hot" : ""}`}
                aria-label={t("auditLog.chart.bar", { time, n: total })}
                title={t("auditLog.chart.bar", { time, n: total })}
                onClick={() => total && onPickHour(b.at)}
              >
                {(b.counts || []).map((v, j) => (v ? <i key={j} style={{ height: `${(v / max) * 100}%`, background: SERIES_COLORS[j] }} /> : null))}
                {b.other ? <i style={{ height: `${(b.other / max) * 100}%`, background: OTHER_COLOR }} /> : null}
              </button>
            );
          })}
        </div>
      )}
      <div className="alg-axis" aria-hidden="true">
        {buckets.length
          ? labels.map((i) => (
              <span key={i} className={i === hotIdx ? "is-hot" : ""} style={axisStyle(i)}>
                {i === hotIdx ? `${hourLabel(buckets[i].at, locale)} · ${t("auditLog.chart.anomaly")}` : hourLabel(buckets[i].at, locale)}
              </span>
            ))
          : null}
      </div>
    </section>
  );
}

export function Leaderboard({ rows, loading, users, t, locale, onPick }) {
  return (
    <section className="alg-card alg-board" aria-labelledby="alg-board-h">
      <h3 id="alg-board-h">
        <Users size={20} />
        <span>{t("auditLog.board.title")}</span>
        <span className="alg-x">{t("auditLog.board.days")}</span>
      </h3>
      {loading ? (
        <div className="alg-lb">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="alg-lb-r">
              <span className="alg-skel" style={{ width: 26, height: 26, borderRadius: 8 }} />
              <span className="alg-skel" style={{ width: 90, height: 12 }} />
              <span />
              <span />
            </div>
          ))}
        </div>
      ) : !rows?.length ? (
        <p className="alg-empty-s">{t("auditLog.board.empty")}</p>
      ) : (
        <div className="alg-lb">
          {rows.slice(0, 5).map((r) => {
            const agent = r.key === "agent";
            const name = agent ? t("auditLog.agent") : handle(r.username || r.key);
            const peak = Math.max(1, ...r.days);
            return (
              <button key={r.key} type="button" className="alg-lb-r" onClick={() => onPick(agent ? "agent" : r.username || r.key)} aria-label={t("auditLog.board.row", { name, n: r.count })} data-testid={`audit-board-${r.key}`}>
                <Av agent={agent} user={r.actorId ? users?.[r.actorId] : null} name={r.username || r.key} />
                <span className="alg-lb-n">{name}</span>
                <span className="alg-spark" aria-hidden="true">
                  {r.days.map((v, j) => (
                    <i key={j} className={j === r.hotDay ? "is-hot" : v ? "" : "is-zero"} style={{ height: `${v ? Math.max(12, (v / peak) * 100) : 6}%` }} />
                  ))}
                </span>
                <b className="tnum">{formatNumber(r.count, locale)}</b>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

export function AnomalyBanner({ anomaly, more, t, locale, onReview, onHide, onNext }) {
  if (!anomaly) return null;
  const actor = handle(anomaly.actorUsername || "?");
  const text = t(`auditLog.anomaly.${anomaly.rule}`, { actor, from: clock(anomaly.from, locale).slice(0, 5), to: clock(anomaly.to, locale).slice(0, 5), n: anomaly.count });
  const usual = anomaly.usualPerHour > 0 ? t("auditLog.anomaly.usual", { rate: formatNumber(anomaly.usualPerHour, locale) }) : t("auditLog.anomaly.usualNone");
  return (
    <div className="alg-anom" role="alert" data-testid="audit-anomaly">
      <span className="alg-anom-ic" aria-hidden="true">
        <AlertTriangle size={20} />
      </span>
      <p>
        <b>{t("auditLog.anomaly.lead")}</b> {text} {usual}
        {more > 0 ? (
          <button type="button" className="alg-link" onClick={onNext}>
            {t("auditLog.anomaly.more", { n: more })}
          </button>
        ) : null}
      </p>
      <button type="button" className="alg-btn is-red" onClick={onReview} data-testid="audit-anomaly-review">
        <Eye size={18} />
        {t("auditLog.anomaly.review")}
      </button>
      <button type="button" className="alg-btn is-ghost" onClick={onHide}>
        {t("auditLog.anomaly.hide")}
      </button>
    </div>
  );
}

export function PendingBanner({ items, owner, t, onDecide, busyId }) {
  if (!items?.length) return null;
  return (
    <div className="alg-pending">
      {items.map((p) => (
        <div key={p.id} className="alg-pending-r">
          <span className="alg-anom-ic is-amber" aria-hidden="true">
            <AlertTriangle size={18} />
          </span>
          <p>
            <b>{t("auditLog.anomaly.pending", { actor: handle(p.actor_username || "?"), section: t(`auditLog.sec.${p.section}`) })}</b>
            <small>{t("auditLog.anomaly.pendingBy", { user: handle(p.reviewed_by_username || "?"), reason: p.reason || "" })}</small>
          </p>
          {owner ? (
            <>
              <button type="button" className="alg-btn is-red" disabled={busyId === p.id} onClick={() => onDecide(p, true)}>
                <Check size={18} />
                {t("auditLog.anomaly.approve")}
              </button>
              <button type="button" className="alg-btn is-ghost" disabled={busyId === p.id} onClick={() => onDecide(p, false)}>
                <X size={18} />
                {t("auditLog.anomaly.decline")}
              </button>
            </>
          ) : null}
        </div>
      ))}
    </div>
  );
}
