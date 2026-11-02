import { useEffect, useState } from "react";
import { Coins, Eye, Lock, Save } from "../../ui/Icon.jsx";
import { useLocale } from "../../../context/LocaleContext";
import { premiumPlanUpdate, premiumPlans } from "./premiumApi.js";
import { MONTHLY_DESCOIN, PLANS, buildPlanPatch } from "./premiumModel.js";
import { useLoad } from "./useLoad.js";
import { ErrorLine, Field, PageHead, RefreshButton, Seg, ToggleRow, errorText, num } from "./PremiumUi.jsx";

function toForm(p) {
  return {
    name: p.name || "",
    description: p.description || "",
    features: Array.isArray(p.features) ? p.features.join("\n") : "",
    visible: p.visible !== false,
    status: p.status || "active",
  };
}

function PlanCard({ plan, onSaved, locale, t }) {
  const [f, setF] = useState(() => toForm(plan));
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => { setF(toForm(plan)); }, [plan]);
  const set = (patch) => { setF((p) => ({ ...p, ...patch })); setErr(null); setSaved(false); };
  const coin = plan.monthly_descoin ?? MONTHLY_DESCOIN[plan.id];
  const count = f.features.split(/[\n,]/).map((x) => x.trim()).filter(Boolean).length;

  const save = async () => {
    const out = buildPlanPatch(f);
    if (!out.ok) return setErr(out.error);
    setBusy(true);
    try {
      await premiumPlanUpdate(plan.id, out.body);
      setSaved(true);
      onSaved();
    } catch (e) {
      setErr(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`agr-card pa-plan is-${plan.id}`}>
      <h3><span className={`pa-chip is-${plan.id}`}>{t(`premiumAdmin.plan.${plan.id}`)}</span><span className="pa-mono pa-count">{plan.id}</span></h3>
      <Field label={t("premiumAdmin.plans.name")}>
        <div className="mt-in"><input type="text" maxLength={60} value={f.name} onChange={(e) => set({ name: e.target.value })} /></div>
      </Field>
      <Field label={t("premiumAdmin.plans.description")}>
        <div className="mt-in ta"><textarea rows={2} maxLength={400} value={f.description} onChange={(e) => set({ description: e.target.value })} /></div>
      </Field>
      <Field label={t("premiumAdmin.plans.features", { n: count })} hint={t("premiumAdmin.plans.featuresHint")}>
        <div className="mt-in ta"><textarea className="pa-mono" rows={6} value={f.features} onChange={(e) => set({ features: e.target.value })} /></div>
      </Field>
      <div className="mt-two">
        <div className="mt-f pa-f">
          <span>{t("premiumAdmin.plans.status")}</span>
          <Seg label={t("premiumAdmin.plans.status")} value={f.status} onChange={(status) => set({ status })}
            options={[["active", t("premiumAdmin.plans.statusActive")], ["archived", t("premiumAdmin.plans.statusArchived")]]} />
        </div>
        <div className="mt-f pa-f">
          <span>{t("premiumAdmin.plans.monthlyCoin")}</span>
          <div className="mt-in is-ro"><Coins size={14} className="mt-i" /><span className="tnum">{num(coin, locale, t)}</span><span className="mt-muted">DesCoin</span></div>
        </div>
      </div>
      <ToggleRow icon={Eye} label={t("premiumAdmin.plans.visible")} hint={t("premiumAdmin.plans.visibleHint")} on={f.visible} onChange={(visible) => set({ visible })} />
      <div className="mt-f pa-f">
        <span>{t("premiumAdmin.plans.price")}</span>
        <div className="mt-in is-ro" aria-disabled="true"><Lock size={14} className="mt-i" /><input type="text" disabled value="" placeholder={t("premiumAdmin.plans.priceLater")} aria-label={t("premiumAdmin.plans.price")} /></div>
        <span className="pc-hint">{t("premiumAdmin.plans.priceHint")}</span>
      </div>
      {err ? <p className="pc-hint is-err" role="alert">{errorText(err, t)}</p> : null}
      {saved ? <p className="pc-hint is-ok" role="status">{t("premiumAdmin.plans.saved")}</p> : null}
      <div className="mt-form-foot">
        <button type="button" className="mt-btn primary" disabled={busy} onClick={save}><Save size={14} /> {busy ? t("premiumAdmin.applying") : t("premiumAdmin.save")}</button>
      </div>
    </div>
  );
}

/** Plan Yönetimi: GET /admin/premium/plans, PATCH /plans/:id (name, description, features, visible, status). */
export default function PremiumPlans() {
  const { t, locale } = useLocale();
  const { data, error, busy, reload } = useLoad(() => premiumPlans(), []);
  const plans = (data?.plans || []).filter((p) => PLANS.includes(p.id) || p.id);
  return (
    <section className="admin-section agr pa-page">
      <PageHead title={t("premiumAdmin.navPlans")} sub={t("premiumAdmin.plans.sub")}>
        <RefreshButton onClick={reload} busy={busy} t={t} />
      </PageHead>
      <ErrorLine error={error} t={t} onRetry={reload} />
      {busy && !data ? <p className="pa-empty">{t("premiumAdmin.loading")}</p> : null}
      {data && !plans.length ? <p className="pa-empty">{t("premiumAdmin.noData")}</p> : null}
      <div className="pa-two">
        {plans.map((p) => <PlanCard key={p.id} plan={p} onSaved={reload} locale={locale} t={t} />)}
      </div>
      <p className="muted agr-foot">{t("premiumAdmin.plans.foot")}</p>
    </section>
  );
}
