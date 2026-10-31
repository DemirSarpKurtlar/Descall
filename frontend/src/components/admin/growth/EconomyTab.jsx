import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "../../ui/Icon.jsx";
import { adminFetch } from "../../../api/adminHttp";
import { useLocale } from "../../../context/LocaleContext";
import { ColumnChart, BarList, SERIES_A, SERIES_B, fmtNum } from "./GrowthCharts.jsx";
import { RangePicker, shortDay } from "./RetentionTab.jsx";
import "../../../styles/admin-growth.css";

/**
 * DesCoin ekonomisi (3.7.5). GET /admin/growth/economy. Admin balances and
 * admin grants are kept out of supply and flow (shown as their own line).
 */
export const SOURCE_KEYS = ["activity", "daily", "promo", "referral", "refund", "shop", "other"];

function Kpi({ label, value, hint, tone }) {
  return (
    <div className={`agr-kpi${tone ? ` is-${tone}` : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {hint ? <em>{hint}</em> : null}
    </div>
  );
}

export default function EconomyTab() {
  const { t, locale } = useLocale();
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const load = useCallback(() => {
    setLoading(true);
    setErr("");
    adminFetch(`/growth/economy?days=${days}`)
      .then(setData)
      .catch((e) => setErr(e?.message || t("admin.loadError")))
      .finally(() => setLoading(false));
  }, [days, t]);
  useEffect(load, [load]);

  const k = data?.kpis || {};
  const n = (v) => fmtNum(v, locale);
  const label = (key) => t(`admin.ecoSrc_${SOURCE_KEYS.includes(key) ? key : "other"}`);

  return (
    <section className="admin-section agr">
      <header className="agr-head">
        <div>
          <h2>{t("admin.economy")}</h2>
          <p className="muted">{t("admin.ecoSub")}</p>
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
            <Kpi label={t("admin.ecoSupply")} value={n(k.supply)} hint={t("admin.ecoHolders", { n: k.holders })} />
            <Kpi label={t("admin.ecoMedian")} value={n(k.median)} hint={t("admin.ecoMedianHint")} />
            <Kpi label={t("admin.ecoTop10")} value={k.top10Share == null ? "–" : `%${n(k.top10Share)}`} hint={t("admin.ecoTop10Hint")} />
            <Kpi label={t("admin.ecoMinted")} value={n(k.minted)} hint={t("admin.grDays", { n: days })} />
            <Kpi label={t("admin.ecoSpent")} value={n(k.spent)} hint={t("admin.grDays", { n: days })} />
            <Kpi label={t("admin.ecoNet")} value={`${k.net > 0 ? "+" : ""}${n(k.net)}`} hint={k.net > 0 ? t("admin.ecoNetUp") : t("admin.ecoNetDown")} tone={k.net > 0 ? "warn" : null} />
            <Kpi label={t("admin.ecoSink")} value={k.sinkRatio == null ? "–" : `%${n(k.sinkRatio)}`} hint={t("admin.ecoSinkHint")} />
            <Kpi label={t("admin.ecoAdmin")} value={n(k.adminGranted)} hint={k.adminRevoked ? t("admin.ecoAdminBack", { n: n(k.adminRevoked) }) : t("admin.ecoAdminHint", { n: days })} />
          </div>

          <div className="agr-card">
            <h3>{t("admin.ecoDaily")}</h3>
            <ColumnChart
              ariaLabel={t("admin.ecoDaily")}
              locale={locale}
              rows={(data.daily || []).map((d) => ({ label: d.day, values: [d.minted, d.spent] }))}
              series={[{ label: t("admin.ecoMinted"), color: SERIES_A }, { label: t("admin.ecoSpent"), color: SERIES_B }]}
              tick={shortDay}
            />
          </div>

          <div className="agr-grid2">
            <div className="agr-card">
              <h3>{t("admin.ecoSources")}</h3>
              {data.sources.length ? <BarList locale={locale} color={SERIES_A} items={data.sources.map((s) => ({ key: s.key, label: label(s.key), value: s.amount }))} /> : <p className="muted">{t("admin.ecoNone")}</p>}
            </div>
            <div className="agr-card">
              <h3>{t("admin.ecoSinks")}</h3>
              {data.sinks.length ? <BarList locale={locale} color={SERIES_B} items={data.sinks.map((s) => ({ key: s.key, label: label(s.key), value: s.amount }))} /> : <p className="muted">{t("admin.ecoNone")}</p>}
            </div>
          </div>

          <div className="agr-grid2">
            <div className="agr-card">
              <h3>{t("admin.ecoHoldersTop")}</h3>
              <table className="agr-table">
                <thead><tr><th>#</th><th>{t("admin.ecoUser")}</th><th>{t("admin.ecoEarned")}</th><th>{t("admin.ecoShare")}</th></tr></thead>
                <tbody>
                  {data.topHolders.map((h, i) => (
                    <tr key={h.id}><td>{i + 1}</td><td>@{h.username || h.id.slice(0, 8)}</td><td>{n(h.earned)}</td><td>%{n(h.share)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="agr-card">
              <h3>{t("admin.ecoBest")}</h3>
              {data.bestSellers.length ? (
                <table className="agr-table">
                  <thead><tr><th>{t("admin.ecoItem")}</th><th>{t("admin.ecoSold")}</th><th>DesCoin</th></tr></thead>
                  <tbody>
                    {data.bestSellers.map((s) => (
                      <tr key={s.itemId}><td>{String(s.name).replace(/[\u{1F1E6}-\u{1F1FF}]/gu, "").trim()}</td><td>{n(s.count)}</td><td>{n(s.descoin)}</td></tr>
                    ))}
                  </tbody>
                </table>
              ) : <p className="muted">{t("admin.ecoNoSales")}</p>}
            </div>
          </div>
          {data.grantedTop?.length ? (
            <div className="agr-card">
              <h3>{t("admin.ecoGrantedTitle", { n: n(k.grantedHeld) })}</h3>
              <p className="muted agr-note">{t("admin.ecoGrantedNote")}</p>
              <table className="agr-table">
                <thead><tr><th>{t("admin.ecoUser")}</th><th>{t("admin.ecoGrantedCol")}</th><th>{t("admin.ecoBalance")}</th></tr></thead>
                <tbody>
                  {data.grantedTop.map((h) => (
                    <tr key={h.id}><td>@{h.username || h.id.slice(0, 8)}</td><td>{n(h.granted)}</td><td>{n(h.balance)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          <p className="muted agr-foot">{t("admin.ecoFoot")}</p>
        </>
      ) : null}
    </section>
  );
}
