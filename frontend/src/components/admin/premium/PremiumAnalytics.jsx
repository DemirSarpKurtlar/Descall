import { useMemo, useState } from "react";
import { Info } from "../../ui/Icon.jsx";
import { useLocale } from "../../../context/LocaleContext";
import { formatDate, formatNumber } from "../../../i18n/format.js";
import { BarList, ColumnChart, SERIES_A, SERIES_B } from "../growth/GrowthCharts.jsx";
import { premiumAnalytics } from "./premiumApi.js";
import { normalizeAnalytics, resolveRange } from "./premiumModel.js";
import { useLoad } from "./useLoad.js";
import { DateInput, ErrorLine, PageHead, RefreshButton, Seg, num } from "./PremiumUi.jsx";

const PRESETS = ["7d", "30d", "90d", "12m", "custom"];
const BUCKETS = ["day", "week", "month"];

function tickFor(bucket, locale) {
  return (label) => {
    // Buckets are UTC periods (date_trunc on the server), so they are labelled in UTC.
    const d = new Date(label.length <= 10 ? `${label}T00:00:00Z` : label);
    if (Number.isNaN(d.getTime())) return label;
    return bucket === "month"
      ? formatDate(d, locale, { month: "short", year: "2-digit", timeZone: "UTC" })
      : formatDate(d, locale, { day: "numeric", month: "numeric", timeZone: "UTC" });
  };
}

/** The server names the conversion denominator with a code; known codes have a translation. */
function convLabel(code, t) {
  const key = `premiumAdmin.an.convLabel.${code}`;
  const s = /^[a-z_]+$/.test(String(code)) ? t(key) : key;
  return s !== key ? s : String(code);
}

/** One metric card: title, the definition (always shown), chart or the empty word. */
function MetricCard({ title, def, children, has, empty, t }) {
  return (
    <div className="agr-card pa-metric">
      <h3>{title}</h3>
      <p className="pa-def"><Info size={12} aria-hidden="true" /> <span>{def}</span></p>
      {has ? children : <p className="pa-empty pa-nodata">{empty || t("premiumAdmin.noData")}</p>}
    </div>
  );
}

/** Analitik: GET /admin/premium/analytics?from&to&bucket. Real series only. */
export default function PremiumAnalytics() {
  const { t, locale } = useLocale();
  const [preset, setPreset] = useState("30d");
  const [custom, setCustom] = useState({ from: "", to: "" });
  const [bucketPick, setBucketPick] = useState(null);
  const range = useMemo(() => resolveRange(preset, custom), [preset, custom]);
  const bucket = bucketPick || (range.ok ? range.bucket : "day");
  const key = range.ok ? `${range.from.slice(0, 13)}|${range.to.slice(0, 13)}|${bucket}` : "";
  const { data, error, busy, reload } = useLoad(
    () => (range.ok ? premiumAnalytics({ from: range.from, to: range.to, bucket }) : Promise.resolve(null)),
    [key],
  );
  const a = useMemo(() => normalizeAnalytics(data), [data]);
  const tick = tickFor(bucket, locale);
  const plus = { label: t("premiumAdmin.plan.plus"), color: SERIES_A };
  const ultra = { label: t("premiumAdmin.plan.ultra"), color: SERIES_B };
  const loaded = Boolean(data);
  const conv = a.conversion;

  return (
    <section className="admin-section agr pa-page">
      <PageHead title={t("premiumAdmin.navAnalytics")} sub={t("premiumAdmin.an.sub")}>
        <RefreshButton onClick={reload} busy={busy} t={t} />
      </PageHead>
      <div className="agr-card pa-filters pa-range">
        <div className="agr-range" role="tablist" aria-label={t("premiumAdmin.an.range")}>
          {PRESETS.map((p) => (
            <button key={p} type="button" role="tab" aria-selected={preset === p} className={preset === p ? "is-on" : ""} onClick={() => { setPreset(p); setBucketPick(null); }}>
              {t(`premiumAdmin.an.preset.${p}`)}
            </button>
          ))}
        </div>
        {preset === "custom" ? (
          <div className="pa-custom">
            <DateInput label={t("premiumAdmin.from")} value={custom.from} onChange={(from) => setCustom((c) => ({ ...c, from }))} />
            <DateInput label={t("premiumAdmin.to")} value={custom.to} onChange={(to) => setCustom((c) => ({ ...c, to }))} />
          </div>
        ) : null}
        <Seg className="pa-bucket" label={t("premiumAdmin.an.bucket")} value={bucket} onChange={setBucketPick}
          options={BUCKETS.map((b) => [b, t(`premiumAdmin.an.bucketOpt.${b}`)])} />
      </div>
      {!range.ok ? <p className="pc-hint is-err" role="alert">{t("premiumAdmin.err.range")}</p> : null}
      <ErrorLine error={error} t={t} onRetry={reload} />
      {busy && !loaded ? <p className="pa-empty">{t("premiumAdmin.loading")}</p> : null}
      {loaded ? (
        <>
          <div className="agr-grid2">
            <MetricCard t={t} title={t("premiumAdmin.an.acq")} def={t("premiumAdmin.an.def.acq")} has={Boolean(a.acquisitions)}>
              <ColumnChart ariaLabel={t("premiumAdmin.an.acq")} locale={locale} stacked rows={a.acquisitions || []} series={[plus, ultra]} tick={tick} />
            </MetricCard>
            <MetricCard t={t} title={t("premiumAdmin.an.active")} def={t("premiumAdmin.an.def.active")} has={Boolean(a.active)}>
              <ColumnChart ariaLabel={t("premiumAdmin.an.active")} locale={locale} rows={a.active || []} series={[{ label: t("premiumAdmin.an.allPlans"), color: SERIES_A }]} tick={tick} />
            </MetricCard>
            <MetricCard t={t} title={t("premiumAdmin.an.split")} def={t("premiumAdmin.an.def.split")} has={Boolean(a.planSplit)}>
              <BarList locale={locale} items={[
                { key: "plus", label: t("premiumAdmin.plan.plus"), value: a.planSplit?.plus || 0 },
                { key: "ultra", label: t("premiumAdmin.plan.ultra"), value: a.planSplit?.ultra || 0 },
              ]} />
            </MetricCard>
            <MetricCard t={t} title={t("premiumAdmin.an.cancelRenew")} def={t("premiumAdmin.an.def.cancelRenew")} has={Boolean(a.cancelRenew)}>
              <ColumnChart ariaLabel={t("premiumAdmin.an.cancelRenew")} locale={locale} rows={a.cancelRenew || []} tick={tick}
                series={[{ label: t("premiumAdmin.an.cancellations"), color: SERIES_B }, { label: t("premiumAdmin.an.renewals"), color: SERIES_A }]} />
            </MetricCard>
            <MetricCard t={t} title={t("premiumAdmin.an.freePaid")} def={t("premiumAdmin.an.def.freePaid")} has={Boolean(a.freePaid)}>
              <BarList locale={locale} items={[{ key: "free", label: t("premiumAdmin.free"), value: a.freePaid?.free || 0 }]} />
              <p className="pa-paid-line"><span>{t("premiumAdmin.paid")}</span><b>{a.freePaid?.paid == null ? t("premiumAdmin.cannotCompute") : num(a.freePaid.paid, locale, t)}</b></p>
              {a.freePaid?.paid == null ? <p className="pc-hint">{t("premiumAdmin.paymentsNotIntegrated")}</p> : null}
            </MetricCard>
            <MetricCard t={t} title={t("premiumAdmin.an.upDown")} def={t("premiumAdmin.an.def.upDown")} has={Boolean(a.upDown)}>
              {Array.isArray(a.upDown) ? (
                <ColumnChart ariaLabel={t("premiumAdmin.an.upDown")} locale={locale} rows={a.upDown} tick={tick}
                  series={[{ label: t("premiumAdmin.an.upgrades"), color: SERIES_A }, { label: t("premiumAdmin.an.downgrades"), color: SERIES_B }]} />
              ) : (
                <BarList locale={locale} items={[
                  { key: "up", label: t("premiumAdmin.an.upgrades"), value: a.upDown?.upgrades || 0 },
                  { key: "down", label: t("premiumAdmin.an.downgrades"), value: a.upDown?.downgrades || 0 },
                ]} />
              )}
            </MetricCard>
            <MetricCard t={t} title={t("premiumAdmin.an.avgDuration")} def={t("premiumAdmin.an.def.avgDuration")} has={a.avgDuration?.all != null}>
              <div className="pa-bignum"><strong className="tnum">{num(a.avgDuration?.all, locale, t, { digits: 1 })}</strong><span>{t("premiumAdmin.dur.daysUnit")}</span></div>
              <ul className="pa-facts">
                <li><span>{t("premiumAdmin.plan.plus")}</span><b className="tnum">{num(a.avgDuration?.plus, locale, t, { digits: 1, na: true })}</b></li>
                <li><span>{t("premiumAdmin.plan.ultra")}</span><b className="tnum">{num(a.avgDuration?.ultra, locale, t, { digits: 1, na: true })}</b></li>
              </ul>
            </MetricCard>
            <MetricCard t={t} title={t("premiumAdmin.an.conversion")} def={t("premiumAdmin.an.def.conversion")} has={conv?.rate != null} empty={t("premiumAdmin.cannotCompute")}>
              <div className="pa-bignum"><strong className="tnum">{conv?.rate != null ? formatNumber(conv.rate, locale, { style: "percent", maximumFractionDigits: 1 }) : "–"}</strong></div>
              <p className="pc-hint">{t("premiumAdmin.an.convOf", { num: num(conv?.numerator, locale, t), den: num(conv?.denominator, locale, t) })}</p>
              {conv?.denominatorLabel ? <p className="pc-hint">{t("premiumAdmin.an.denominator")}: {convLabel(conv.denominatorLabel, t)}</p> : null}
            </MetricCard>
          </div>
          <MetricCard t={t} title={t("premiumAdmin.an.campaigns")} def={t("premiumAdmin.an.def.campaigns")} has={Boolean(a.campaigns)}>
            <div className="pa-table-wrap">
              <table className="agr-table pa-table">
                <thead><tr><th>{t("premiumAdmin.f.code")}</th><th className="r">{t("premiumAdmin.camp.redemptions")}</th><th className="r">{t("premiumAdmin.camp.uniqueUsers")}</th><th className="r">{t("premiumAdmin.camp.stillActive")}</th></tr></thead>
                <tbody>
                  {(a.campaigns || []).map((c) => (
                    <tr key={c.id}><td className="pa-mono">{c.code}</td><td className="r">{num(c.redemptions, locale, t)}</td><td className="r">{num(c.users, locale, t)}</td><td className="r">{num(c.stillActive, locale, t)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </MetricCard>
          <p className="muted agr-foot">{t("premiumAdmin.an.foot")}</p>
        </>
      ) : null}
    </section>
  );
}
