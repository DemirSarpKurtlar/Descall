import { useLocale } from "../../../context/LocaleContext";
import { BarList } from "../growth/GrowthCharts.jsx";
import { premiumDashboard } from "./premiumApi.js";
import { MONTHLY_DESCOIN } from "./premiumModel.js";
import { useLoad } from "./useLoad.js";
import { ErrorLine, Kpi, PageHead, RefreshButton, num } from "./PremiumUi.jsx";

const PLUS = "#3987e5";
const ULTRA = "#b07cf0";

/** Premium Dashboard: GET /admin/premium/dashboard. */
export default function PremiumDashboard() {
  const { t, locale } = useLocale();
  const { data, error, busy, reload } = useLoad(() => premiumDashboard(), []);
  const d = data || {};
  const n = (v) => (data ? num(v, locale, t) : "–");
  const paid = data && d.payments_integrated === false;

  return (
    <section className="admin-section agr pa-page">
      <PageHead title={t("premiumAdmin.navDashboard")} sub={t("premiumAdmin.dash.sub")}>
        <RefreshButton onClick={reload} busy={busy} t={t} />
      </PageHead>
      <ErrorLine error={error} t={t} onRetry={reload} />
      <div className="agr-kpis pa-kpis">
        <Kpi label={t("premiumAdmin.dash.activeTotal")} value={n(d.active_total)} hint={t("premiumAdmin.dash.activeTotalHint")} tone="brand" />
        <Kpi label={t("premiumAdmin.dash.activePlus")} value={n(d.active_plus)} hint={t("premiumAdmin.plan.plus")} />
        <Kpi label={t("premiumAdmin.dash.activeUltra")} value={n(d.active_ultra)} hint={t("premiumAdmin.plan.ultra")} />
        <Kpi label={t("premiumAdmin.dash.expired")} value={n(d.expired)} hint={t("premiumAdmin.dash.expiredHint")} />
        <Kpi label={t("premiumAdmin.dash.expiring7")} value={n(d.expiring_7d)} hint={t("premiumAdmin.dash.expiring7Hint")} tone={d.expiring_7d > 0 ? "warn" : ""} />
        <Kpi label={t("premiumAdmin.dash.new7")} value={n(d.new_7d)} hint={t("premiumAdmin.dash.last7")} />
        <Kpi label={t("premiumAdmin.dash.new30")} value={n(d.new_30d)} hint={t("premiumAdmin.dash.last30")} />
        <Kpi label={t("premiumAdmin.dash.free")} value={n(d.free_count)} hint={t("premiumAdmin.dash.freeHint")} />
        <Kpi
          label={t("premiumAdmin.dash.paid")}
          value={paid || d.paid_count == null ? "–" : n(d.paid_count)}
          hint={t("premiumAdmin.dash.paidHint")}
          tone={paid ? "muted" : ""}
          note={paid ? t("premiumAdmin.paymentsNotIntegrated") : null}
        />
      </div>
      <div className="agr-grid2">
        <div className="agr-card">
          <h3>{t("premiumAdmin.dash.split")}</h3>
          {data && (d.active_plus != null || d.active_ultra != null) && (d.active_plus || d.active_ultra) ? (
            <div className="pa-split">
              <BarList locale={locale} color={PLUS} items={[{ key: "plus", label: t("premiumAdmin.plan.plus"), value: d.active_plus || 0 }]} />
              <BarList locale={locale} color={ULTRA} items={[{ key: "ultra", label: t("premiumAdmin.plan.ultra"), value: d.active_ultra || 0 }]} />
            </div>
          ) : (
            <p className="pa-empty">{data ? t("premiumAdmin.noData") : t("premiumAdmin.loading")}</p>
          )}
        </div>
        <div className="agr-card">
          <h3>{t("premiumAdmin.dash.coinTitle")}</h3>
          <ul className="pa-facts">
            <li><span>{t("premiumAdmin.plan.plus")}</span><b className="tnum">{t("premiumAdmin.coinPerMonth", { n: num(MONTHLY_DESCOIN.plus, locale, t) })}</b></li>
            <li><span>{t("premiumAdmin.plan.ultra")}</span><b className="tnum">{t("premiumAdmin.coinPerMonth", { n: num(MONTHLY_DESCOIN.ultra, locale, t) })}</b></li>
          </ul>
          <p className="muted agr-note pa-note">{t("premiumAdmin.dash.coinHint")}</p>
        </div>
      </div>
      <p className="muted agr-foot">{t("premiumAdmin.dash.foot")}</p>
    </section>
  );
}
