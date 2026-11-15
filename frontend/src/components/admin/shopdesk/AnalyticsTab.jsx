/** "Satış analitiği": sales and DesCoin spent per day, top items, categories (7 / 30 / 90 days). */
import { useEffect, useState } from "react";
import { adminFetch } from "../../../api/adminHttp";
import { useLocale } from "../../../context/LocaleContext";
import { BarChart3, Layers, Star } from "../../ui/Icon.jsx";
import { compact, num } from "./shopDeskModel.js";
import { Bars, Empty, ItemThumb, Seg, Skel, errMsg } from "./ui.jsx";
import OpsStrip from "./OpsStrip.jsx";

export default function AnalyticsTab({ data, kpis, mismatchCount, goTab, openDrawer }) {
  const { t, locale } = useLocale();
  const [days, setDays] = useState(30);
  const [a, setA] = useState(null);
  const [err, setErr] = useState("");
  const [metric, setMetric] = useState("count");
  useEffect(() => {
    let stop = false;
    setA(null);
    adminFetch(`/shop/analytics?days=${days}`)
      .then((d) => !stop && setA(d))
      .catch((e) => !stop && setErr(errMsg(t, e, "shopDesk.loadError")));
    return () => {
      stop = true;
    };
  }, [days, t]);
  const series = a ? (metric === "count" ? a.count : a.revenue) : [];
  const step = days === 7 ? 1 : days === 30 ? 5 : 15;
  const labels = a ? a.days.map((d, i) => (i % step === step - 1 || i === a.days.length - 1 ? new Date(`${d}T12:00:00`).toLocaleDateString(locale, { day: "numeric", month: "short" }) : "")) : [];
  const maxCat = a ? Math.max(1, ...a.categories.map((c) => c.revenue)) : 1;
  return (
    <div className="sdk-ops">
      <OpsStrip kpis={kpis} mismatchCount={mismatchCount} reconcileAt={data?.reconcile?.started_at} onReconcile={() => goTab("reconcile")} />
      <section className="sdk-card">
        <div className="sdk-card-head">
          <h2 className="sdk-card-title">
            <BarChart3 size={20} />
            {t("shopDesk.analyticsTitle")}
          </h2>
          <div className="sdk-card-actions">
            <Seg small value={metric} onChange={setMetric} label={t("shopDesk.analyticsTitle")} items={[{ id: "count", label: t("shopDesk.metricCount") }, { id: "revenue", label: t("shopDesk.metricRevenue") }]} />
            <Seg small value={days} onChange={setDays} label={t("shopDesk.period")} items={[7, 30, 90].map((d) => ({ id: d, label: t("shopDesk.nDays", { n: d }) }))} />
          </div>
        </div>
        {err ? <p className="sdk-err">{err}</p> : null}
        {!a ? (
          <Skel h={220} />
        ) : (
          <>
            <div className="sdk-mini-stats">
              <div>
                <b className="tnum">{num(a.total, locale)}</b>
                <small>{t("shopDesk.statSales")}</small>
              </div>
              <div>
                <b className="tnum">{compact(a.totalRevenue, locale)} DC</b>
                <small>{t("shopDesk.statRevenue")}</small>
              </div>
              <div>
                <b className="tnum">{num(a.buyers, locale)}</b>
                <small>{t("shopDesk.statBuyers")}</small>
              </div>
              <div>
                <b className="tnum">{num(a.discounted, locale)}</b>
                <small>{t("shopDesk.statDiscounted")}</small>
              </div>
            </div>
            <Bars values={series} labels={labels} height={150} ariaLabel={t("shopDesk.analyticsTitle")} tops={series.map(() => "")} />
          </>
        )}
      </section>
      <div className="sdk-grid2">
        <section className="sdk-card">
          <div className="sdk-card-head">
            <h2 className="sdk-card-title">
              <Star size={20} />
              {t("shopDesk.topItems")}
            </h2>
          </div>
          {!a ? (
            <Skel h={200} />
          ) : !a.top.length ? (
            <Empty title={t("shopDesk.noSales")} />
          ) : (
            <ol className="sdk-toplist">
              {a.top.map((it, i) => (
                <li key={it.id}>
                  <span className="sdk-muted tnum">{i + 1}</span>
                  <button type="button" className="sdk-item" onClick={() => openDrawer(it.id, "sales")}>
                    <ItemThumb item={it} size={36} />
                    <span>
                      <b>{it.name}</b>
                      <small className="sdk-muted">{it.category ? t(`shopDesk.cat.${it.category}`) : ""}</small>
                    </span>
                  </button>
                  <b className="tnum">{t("shopDesk.nSales", { n: num(it.n, locale) })}</b>
                  <span className="sdk-muted tnum">{num(it.revenue, locale)} DC</span>
                </li>
              ))}
            </ol>
          )}
        </section>
        <section className="sdk-card">
          <div className="sdk-card-head">
            <h2 className="sdk-card-title">
              <Layers size={20} />
              {t("shopDesk.byCategory")}
            </h2>
          </div>
          {!a ? (
            <Skel h={200} />
          ) : !a.categories.length ? (
            <Empty title={t("shopDesk.noSales")} />
          ) : (
            <ul className="sdk-hbars">
              {a.categories.map((c) => (
                <li key={c.category}>
                  <span>{t(`shopDesk.cat.${c.category}`)}</span>
                  <span className="sdk-hbar">
                    <i style={{ width: `${Math.round((c.revenue / maxCat) * 100)}%` }} />
                  </span>
                  <b className="tnum">{num(c.revenue, locale)} DC</b>
                  <small className="sdk-muted tnum">{t("shopDesk.nSales", { n: num(c.n, locale) })}</small>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
