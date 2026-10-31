import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "../../ui/Icon.jsx";
import { adminFetch } from "../../../api/adminHttp";
import { useLocale } from "../../../context/LocaleContext";
import { ColumnChart, BarList, SERIES_A, SERIES_B, fmtNum, fmtPct, heatColor } from "./GrowthCharts.jsx";
import "../../../styles/admin-growth.css";

/**
 * Elde tutma (3.7.5): who comes back. GET /admin/growth/retention.
 * Admin accounts are not counted (lib/growthInsights.js).
 */
export const RANGES = [7, 30, 90];

export function shortDay(day) {
  const [, m, d] = String(day).split("-");
  return `${Number(d)}.${Number(m)}`;
}

function Kpi({ label, value, hint }) {
  return (
    <div className="agr-kpi">
      <span>{label}</span>
      <strong>{value}</strong>
      {hint ? <em>{hint}</em> : null}
    </div>
  );
}

export function RangePicker({ days, setDays, t }) {
  return (
    <div className="agr-range" role="tablist" aria-label={t("admin.grRange")}>
      {RANGES.map((n) => (
        <button key={n} type="button" role="tab" aria-selected={days === n} className={days === n ? "is-on" : ""} onClick={() => setDays(n)}>
          {t("admin.grDays", { n })}
        </button>
      ))}
    </div>
  );
}

export default function RetentionTab() {
  const { t, locale } = useLocale();
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const load = useCallback(() => {
    setLoading(true);
    setErr("");
    adminFetch(`/growth/retention?days=${days}`)
      .then(setData)
      .catch((e) => setErr(e?.message || t("admin.loadError")))
      .finally(() => setLoading(false));
  }, [days, t]);
  useEffect(load, [load]);

  const k = data?.kpis || {};
  const r = data?.returns || {};
  const ret = (x) => fmtPct(x?.pct, locale);
  const retHint = (x) => (x?.eligible ? t("admin.grOf", { kept: x.kept, n: x.eligible }) : t("admin.grTooNew"));
  const f = data?.funnel || {};
  const maxWeeks = Math.max(1, ...(data?.cohorts || []).map((c) => c.cells.length));

  return (
    <section className="admin-section agr">
      <header className="agr-head">
        <div>
          <h2>{t("admin.retention")}</h2>
          <p className="muted">{t("admin.grRetSub")}</p>
        </div>
        <div className="agr-actions">
          <RangePicker days={days} setDays={setDays} t={t} />
          <button type="button" className="agr-icon" onClick={load} disabled={loading} aria-label={t("Refresh")}><RefreshCw size={16} className={loading ? "spin" : ""} /></button>
        </div>
      </header>
      {err ? <p className="admin-inline-error">{err}</p> : null}
      {!data && loading ? <p className="muted">{t("Loading...")}</p> : null}
      {data ? (
        <>
          <div className="agr-kpis">
            <Kpi label={t("admin.grDau")} value={fmtNum(k.dau, locale)} hint={t("admin.grToday")} />
            <Kpi label={t("admin.grWau")} value={fmtNum(k.wau, locale)} hint={t("admin.grLast7")} />
            <Kpi label={t("admin.grMau")} value={fmtNum(k.mau, locale)} hint={t("admin.grLast30")} />
            <Kpi label={t("admin.grSticky")} value={fmtPct(k.stickiness, locale)} hint={t("admin.grStickyHint")} />
            <Kpi label={t("admin.grD1")} value={ret(r.d1)} hint={retHint(r.d1)} />
            <Kpi label={t("admin.grW2")} value={ret(r.w2)} hint={retHint(r.w2)} />
            <Kpi label={t("admin.grM2")} value={ret(r.m2)} hint={retHint(r.m2)} />
            <Kpi label={t("admin.grNew")} value={fmtNum(k.newInRange, locale)} hint={t("admin.grDays", { n: days })} />
          </div>

          <div className="agr-card">
            <h3>{t("admin.grDaily")}</h3>
            <ColumnChart
              ariaLabel={t("admin.grDaily")}
              locale={locale}
              stacked
              rows={(data.series || []).map((s) => ({ label: s.day, values: [s.returning, s.new] }))}
              series={[{ label: t("admin.grReturning"), color: SERIES_A }, { label: t("admin.grNewUsers"), color: SERIES_B }]}
              tick={shortDay}
            />
          </div>

          <div className="agr-card">
            <h3>{t("admin.grCohorts")}</h3>
            <p className="muted agr-note">{t("admin.grCohortsHint")}</p>
            <div className="agr-cohort-wrap">
              <table className="agr-cohort">
                <thead>
                  <tr>
                    <th>{t("admin.grCohortWeek")}</th>
                    <th>{t("admin.grCohortSize")}</th>
                    {Array.from({ length: maxWeeks }, (_, i) => <th key={i}>{t("admin.grWeekN", { n: i })}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {data.cohorts.map((c) => (
                    <tr key={c.weekStart}>
                      <th scope="row">{shortDay(c.weekStart)}</th>
                      <td className="agr-size">{c.size}</td>
                      {Array.from({ length: maxWeeks }, (_, i) => {
                        const cell = c.cells[i];
                        if (!cell || !c.size) return <td key={i} className="agr-empty" />;
                        return (
                          <td
                            key={i}
                            style={{ background: heatColor(cell.pct), color: cell.pct >= 60 ? "#0b1a33" : cell.pct > 0 ? "#eef2ff" : "rgba(238, 242, 255, 0.4)" }}
                            title={t("admin.grCellTip", { n: cell.active, size: c.size, pct: fmtNum(cell.pct, locale) })}
                            className={cell.partial ? "is-partial" : ""}
                          >
                            {fmtPct(cell.pct, locale)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="agr-card">
            <h3>{t("admin.grFunnel")}</h3>
            <BarList
              locale={locale}
              items={[
                { key: "s", label: t("admin.grFunnelStart"), value: f.signup_started || 0 },
                { key: "c", label: t("admin.grFunnelDone"), value: f.signup_completed || 0 },
                { key: "o", label: t("admin.grFunnelOpen"), value: f.first_session || 0 },
                { key: "m", label: t("admin.grFunnelMsg"), value: f.first_message || 0 },
              ]}
            />
          </div>
          <p className="muted agr-foot">{t("admin.grFoot")}</p>
        </>
      ) : null}
    </section>
  );
}
