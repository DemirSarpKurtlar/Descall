import { Landmark } from "../../ui/Icon.jsx";
import { useLocale } from "../../../context/LocaleContext";
import { premiumDashboard, premiumFinance } from "./premiumApi.js";
import { PLANS } from "./premiumModel.js";
import { useLoad } from "./useLoad.js";
import { ErrorLine, Kpi, PageHead, RefreshButton, num } from "./PremiumUi.jsx";

/**
 * The revenue fields the module will show once a payment provider writes
 * payment_transactions. Kept as structure (label + definition) so the page
 * does not need a rewrite; every value stays empty until payments_integrated.
 */
export const REVENUE_FIELDS = ["gross", "refunds", "taxes", "net", "arpu", "renewalExpected"];

/** Finansal Raporlar: GET /admin/premium/finance (+ dashboard for the free counts). */
export default function PremiumFinance() {
  const { t, locale } = useLocale();
  const fin = useLoad(() => premiumFinance(), []);
  const dash = useLoad(() => premiumDashboard(), []);
  const f = fin.data || {};
  const integrated = fin.data ? f.payments_integrated === true : false;
  const busy = fin.busy || dash.busy;
  const reload = () => { fin.reload(); dash.reload(); };
  const freeCount = f.free_count ?? f.free_memberships ?? dash.data?.free_count;
  const manual = f.manual_grants ?? f.admin_grants ?? null;
  const campaign = f.campaign_grants ?? null;
  const value = (v) => (integrated && v != null ? num(v, locale, t) : "–");

  return (
    <section className="admin-section agr pa-page">
      <PageHead title={t("premiumAdmin.navFinance")} sub={t("premiumAdmin.fin.sub")}>
        <RefreshButton onClick={reload} busy={busy} t={t} />
      </PageHead>
      <ErrorLine error={fin.error} t={t} onRetry={fin.reload} />
      {!integrated ? (
        <div className="pa-banner" role="status">
          <span className="pa-banner-ico"><Landmark size={20} aria-hidden="true" /></span>
          <div>
            <b>{t("premiumAdmin.paymentsNotIntegrated")}</b>
            <p>{t("premiumAdmin.fin.bannerBody")}</p>
          </div>
        </div>
      ) : null}

      <h3 className="pa-h3">{t("premiumAdmin.fin.grantsTitle")}</h3>
      <div className="agr-kpis pa-kpis n3">
        <Kpi label={t("premiumAdmin.fin.freeMemberships")} value={fin.data || dash.data ? num(freeCount, locale, t) : "–"} hint={t("premiumAdmin.fin.freeHint")} />
        <Kpi label={t("premiumAdmin.fin.manualGrants")} value={fin.data ? num(manual, locale, t) : "–"} hint={t("premiumAdmin.fin.manualHint")} />
        <Kpi label={t("premiumAdmin.fin.campaignGrants")} value={fin.data ? num(campaign, locale, t) : "–"} hint={t("premiumAdmin.fin.campaignHint")} />
      </div>
      <p className="muted agr-note pa-note">{t("premiumAdmin.fin.notRevenue")}</p>

      <h3 className="pa-h3">{t("premiumAdmin.fin.revenueTitle")}</h3>
      <div className={`pa-placeholder-grid${integrated ? "" : " is-off"}`} aria-disabled={!integrated}>
        {REVENUE_FIELDS.map((k) => (
          <div key={k} className="agr-kpi pa-kpi pa-ph">
            <span>{t(`premiumAdmin.fin.field.${k}`)}</span>
            <strong className="tnum">{value(f.revenue?.[k])}</strong>
            <em>{t(`premiumAdmin.fin.def.${k}`)}</em>
          </div>
        ))}
      </div>
      <div className="agr-card">
        <h3>{t("premiumAdmin.fin.byPlan")}</h3>
        <div className="pa-table-wrap">
          <table className="agr-table pa-table">
            <thead>
              <tr>
                <th>{t("premiumAdmin.f.plan")}</th>
                <th className="r">{t("premiumAdmin.fin.field.gross")}</th>
                <th className="r">{t("premiumAdmin.fin.field.refunds")}</th>
                <th className="r">{t("premiumAdmin.fin.field.net")}</th>
                <th className="r">{t("premiumAdmin.fin.field.renewalExpected")}</th>
              </tr>
            </thead>
            <tbody>
              {PLANS.map((p) => {
                const row = f.revenue?.by_plan?.[p] || {};
                return (
                  <tr key={p}>
                    <td>{t(`premiumAdmin.plan.${p}`)}</td>
                    <td className="r">{value(row.gross)}</td>
                    <td className="r">{value(row.refunds)}</td>
                    <td className="r">{value(row.net)}</td>
                    <td className="r">{value(row.renewal_expected)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!integrated ? <p className="pc-hint">{t("premiumAdmin.fin.waiting")}</p> : null}
      </div>
      <p className="muted agr-foot">{t("premiumAdmin.fin.foot")}</p>
    </section>
  );
}
