/** Draft B summary strip above the operation tabs. */
import { useLocale } from "../../../context/LocaleContext";
import { compact, num } from "./shopDeskModel.js";
import { Skel } from "./ui.jsx";

export default function OpsStrip({ kpis, mismatchCount, reconcileAt, onReconcile }) {
  const { t, locale } = useLocale();
  if (!kpis) {
    return (
      <div className="sdk-strip">
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i}>
            <Skel h={11} w={90} />
            <Skel h={20} w={60} />
          </div>
        ))}
      </div>
    );
  }
  const at = reconcileAt ? new Date(reconcileAt).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }) : "";
  return (
    <div className="sdk-strip" data-testid="sdk-strip">
      <div>
        <small>{t("shopDesk.strip.circulating")}</small>
        <b className="tnum">{kpis.circulating == null ? "-" : compact(kpis.circulating, locale)}</b>
      </div>
      <div>
        <small>{t("shopDesk.strip.spentToday")}</small>
        <b className="tnum">{num(kpis.spentToday, locale)}</b>
      </div>
      <div>
        <small>{t("shopDesk.strip.soldToday")}</small>
        <b className="tnum">{t("shopDesk.strip.nItems", { n: num(kpis.salesToday, locale) })}</b>
      </div>
      <div>
        <small>{t("shopDesk.strip.giftsToday")}</small>
        <b className="tnum">{kpis.giftsToday == null ? "-" : num(kpis.giftsToday, locale)}</b>
      </div>
      <div>
        <small>{t("shopDesk.strip.campaigns")}</small>
        <b className="tnum">{num(kpis.activeCampaigns, locale)}</b>
      </div>
      <div>
        <small>{t("shopDesk.strip.limited")}</small>
        <b className="tnum">{t("shopDesk.strip.nItems", { n: num(kpis.limited, locale) })}</b>
      </div>
      <button type="button" onClick={onReconcile} className={mismatchCount ? "is-amber" : "is-green"}>
        <small>{at ? t("shopDesk.strip.reconcileAt", { time: at }) : t("shopDesk.strip.reconcile")}</small>
        <b>{mismatchCount == null ? "-" : mismatchCount ? t("shopDesk.kpi.mismatches", { n: mismatchCount }) : t("shopDesk.kpi.clean")}</b>
      </button>
    </div>
  );
}
