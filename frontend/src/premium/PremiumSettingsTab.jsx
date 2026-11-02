/**
 * Ayarlar > Descall+ (phase 1).
 *
 * - Status card: plan, state, end date or "Sınırsız", next DesCoin gift.
 * - Coupon field (POST /api/premium/redeem). No purchase in phase 1: memberships are
 *   given by the Descall team, the page says so.
 * - Feature list with per-feature switches and settings. Panels are collected from
 *   ./settings/*.jsx; each file exports { key, Panel } and optionally defaultEnabled.
 *   Panel props: { settings, update(patch), enabled, desktop, has(key) }.
 *   A key without a panel file is listed as "coming soon" (another agent adds it).
 * - Plan comparison Free / Descall+ / Ultra.
 * iOS (Capacitor) shows the status card only: no upsell, no plan page (App Store 3.1.1).
 */
import { useMemo, useState } from "react";
import { useLocale } from "../context/LocaleContext";
import { formatDate, formatNumber } from "../i18n/format.js";
import { isNativeIOS } from "../lib/platform.js";
import { Lock, Check, Monitor } from "../components/ui/Icon.jsx";
import { S3Toggle } from "../components/settings/SettingsV3.jsx";
import { FEATURES, FEATURE_KEYS, PLAN_COIN, tierAllows, featuresForPlan } from "./features.js";
import { usePremium, redeemPremiumCode } from "./usePremium.js";
import { useFeatureSettings, isDesktopApp } from "./featureSettings.js";
import PremiumBadge, { PremiumGlyph } from "./PremiumBadge.jsx";
import "./premium.css";

const panelModules = import.meta.glob("./settings/*.jsx", { eager: true });
export const PANELS = Object.freeze(
  Object.fromEntries(
    Object.values(panelModules)
      .filter((m) => m && typeof m.key === "string" && typeof m.Panel === "function")
      .map((m) => [m.key, m])
  )
);

/** Keys this client builds as desktop windows (shown first). */
const WINDOW_KEYS = [
  "mini_mode", "always_on_top", "pip_call", "multi_window", "window_opacity", "session_restore",
  "advanced_window_mgmt", "window_layouts", "desktop_sidebar", "screen_edge_actions",
  "tray_controls_plus", "taskbar_plus",
];

function StatusCard({ premium, ios }) {
  const { t, locale } = useLocale();
  const plan = premium.plan;
  const stateKey = plan ? "active" : premium.status === "expired" || premium.status === "cancelled" ? premium.status : "none";
  const planName = plan === "ultra" ? t("premium.name.ultra") : plan === "plus" ? t("premium.name.plus") : t("premium.name.free");
  const ends = premium.unlimited ? t("premium.status.unlimited") : premium.endsAt ? formatDate(premium.endsAt, locale) : "–";
  const coin = plan ? PLAN_COIN[plan] : 0;
  return (
    <section className={`pp-hero${plan ? ` is-${plan}` : ""}`} aria-labelledby="pp-status-title" data-testid="premium-status">
      <div>
        <h2 className="pp-hero-title" id="pp-status-title">
          {planName}
          {plan ? <PremiumBadge plan={plan} variant="chip" /> : null}
        </h2>
        <div className="pp-hero-sub">{premium.loading ? t("premium.status.loading") : t("premium.status.title")}</div>
      </div>
      <dl className="pp-facts">
        <div className="pp-fact">
          <dt>{t("premium.status.state")}</dt>
          <dd><span className={`pp-state is-${stateKey}`}>{t(`premium.status.${stateKey}`)}</span></dd>
        </div>
        {plan ? (
          <div className="pp-fact">
            <dt>{t("premium.status.ends")}</dt>
            <dd data-testid="premium-ends">{ends}</dd>
          </div>
        ) : null}
        {plan ? (
          <div className="pp-fact">
            <dt>{t("premium.status.nextCoin")}</dt>
            <dd>
              {premium.nextCoinAt
                ? t("premium.status.nextCoinValue", { amount: formatNumber(coin, locale), date: formatDate(premium.nextCoinAt, locale) })
                : t("premium.status.monthlyGift", { amount: formatNumber(coin, locale) })}
            </dd>
          </div>
        ) : null}
      </dl>
      {premium.error ? <p className="pp-warn" style={{ gridColumn: "1 / -1" }}>{t("premium.status.offline")}</p> : null}
      {ios ? null : <p className="pp-note" style={{ gridColumn: "1 / -1" }}>{t("premium.grantNote")}</p>}
    </section>
  );
}

function RedeemCard() {
  const { t } = useLocale();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const submit = async (e) => {
    e.preventDefault();
    const c = code.trim();
    if (!c || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      await redeemPremiumCode(c);
      setCode("");
      setMsg({ ok: true, text: t("premium.redeem.ok") });
    } catch (err) {
      const status = Number(err?.status) || 0;
      setMsg({ ok: false, text: status === 404 || status === 405 ? t("premium.redeem.unavailable") : err?.message || t("premium.redeem.fail") });
    } finally {
      setBusy(false);
    }
  };
  return (
    <section aria-labelledby="pp-redeem-title">
      <h3 className="pp-h" id="pp-redeem-title">{t("premium.redeem.title")}</h3>
      <form className="pp-redeem" onSubmit={submit} style={{ marginTop: 8 }}>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.slice(0, 64))}
          placeholder={t("premium.redeem.placeholder")}
          aria-label={t("premium.redeem.placeholder")}
          autoComplete="off"
          spellCheck={false}
          data-testid="premium-redeem-input"
        />
        <button type="submit" className="us-btn primary" disabled={busy || !code.trim()}>
          {busy ? t("premium.redeem.busy") : t("premium.redeem.submit")}
        </button>
      </form>
      {msg ? <p className={`pp-msg ${msg.ok ? "ok" : "err"}`} role="status">{msg.text}</p> : null}
    </section>
  );
}

function FeatureRow({ fkey, premium, desktop }) {
  const { t } = useLocale();
  const def = FEATURES[fkey];
  const mod = PANELS[fkey];
  const unlocked = premium.has(fkey);
  const runnable = !def.desktop || desktop;
  const [settings, update] = useFeatureSettings(fkey, {});
  const enabled = typeof settings.enabled === "boolean" ? settings.enabled : mod?.defaultEnabled !== false;
  const Panel = mod?.Panel;
  const name = t(`premium.f.${fkey}.name`);
  return (
    <div className={`pp-feat is-${def.tier}${unlocked ? "" : " is-locked"}`} data-feature={fkey}>
      <div className="pp-feat-row">
        <span className="pp-feat-ico" aria-hidden="true">
          {unlocked ? <PremiumGlyph plan={def.tier} size={13} /> : <Lock size={14} />}
        </span>
        <div className="pp-feat-text">
          <div className="pp-feat-name">
            {name}
            {def.desktop ? <span className="pp-tag" title={t("premium.features.desktopOnly")}><Monitor size={11} /> {t("premium.features.desktop")}</span> : null}
          </div>
          <div className="pp-feat-desc">{t(`premium.f.${fkey}.desc`)}</div>
        </div>
        {!unlocked ? (
          <span className="pp-lock">
            <Lock size={12} />
            {def.tier === "ultra" ? t("premium.features.lockedUltra") : t("premium.features.lockedPlus")}
          </span>
        ) : !mod ? (
          <span className="pp-tag">{t("premium.features.soon")}</span>
        ) : !runnable ? (
          <span className="pp-lock">{t("premium.features.desktopOnly")}</span>
        ) : (
          <S3Toggle checked={enabled} onChange={(v) => update({ enabled: v })} label={name} />
        )}
      </div>
      {unlocked && runnable && enabled && Panel ? (
        <div className="pp-feat-panel">
          <Panel settings={settings} update={update} enabled={enabled} desktop={desktop} has={premium.has} />
        </div>
      ) : null}
    </div>
  );
}

function Compare({ plan }) {
  const { t, locale } = useLocale();
  const [all, setAll] = useState(false);
  const plus = featuresForPlan("plus");
  const ultraOnly = FEATURE_KEYS.filter((k) => FEATURES[k].tier === "ultra");
  const list = (keys) => (all ? keys : keys.slice(0, 6));
  const Item = ({ k }) => (
    <li><Check size={13} /><span>{t(`premium.f.${k}.name`)}</span></li>
  );
  return (
    <section aria-labelledby="pp-compare-title">
      <h3 className="pp-h" id="pp-compare-title">{t("premium.compare.title")}</h3>
      <div className="pp-compare" style={{ marginTop: 8 }} data-testid="premium-compare">
        <div className={`pp-plan${!plan ? " is-current" : ""}`}>
          <div className="pp-plan-name">{t("premium.name.free")}</div>
          {!plan ? <div className="pp-current">{t("premium.compare.current")}</div> : null}
          <div className="pp-plan-meta">{t("premium.compare.baseline")}</div>
        </div>
        <div className={`pp-plan${plan === "plus" ? " is-current" : ""}`}>
          <div className="pp-plan-name"><PremiumBadge plan="plus" variant="inline" className="pp-nomargin" />{t("premium.name.plus")}</div>
          {plan === "plus" ? <div className="pp-current">{t("premium.compare.current")}</div> : null}
          <div className="pp-plan-meta">{t("premium.compare.featureCount", { n: plus.length })} · {t("premium.status.monthlyGift", { amount: formatNumber(PLAN_COIN.plus, locale) })}</div>
          <ul>{list(plus).map((k) => <Item key={k} k={k} />)}</ul>
        </div>
        <div className={`pp-plan${plan === "ultra" ? " is-current" : ""}`}>
          <div className="pp-plan-name"><PremiumBadge plan="ultra" variant="inline" />{t("premium.name.ultra")}</div>
          {plan === "ultra" ? <div className="pp-current">{t("premium.compare.current")}</div> : null}
          <div className="pp-plan-meta">{t("premium.compare.featureCount", { n: FEATURE_KEYS.length })} · {t("premium.status.monthlyGift", { amount: formatNumber(PLAN_COIN.ultra, locale) })}</div>
          <ul>
            <li><Check size={13} /><span>{t("premium.compare.everythingPlus")}</span></li>
            {list(ultraOnly).map((k) => <Item key={k} k={k} />)}
          </ul>
        </div>
      </div>
      <button type="button" className="pp-more" onClick={() => setAll((v) => !v)} aria-expanded={all} style={{ marginTop: 8 }}>
        {all ? t("premium.compare.showLess") : t("premium.compare.showAll")}
      </button>
    </section>
  );
}

export default function PremiumSettingsTab() {
  const { t } = useLocale();
  const premium = usePremium();
  const ios = isNativeIOS();
  const desktop = isDesktopApp();
  const groups = useMemo(() => {
    const windows = WINDOW_KEYS.filter((k) => FEATURES[k]);
    const rest = FEATURE_KEYS.filter((k) => !windows.includes(k));
    return [["premium.features.groupDesktop", windows], ["premium.features.groupOther", rest]];
  }, []);

  if (ios) {
    return (
      <div className="us-tab pp-tab" data-testid="premium-tab">
        <StatusCard premium={premium} ios />
      </div>
    );
  }
  return (
    <div className="us-tab pp-tab" data-testid="premium-tab">
      <StatusCard premium={premium} />
      <RedeemCard />
      <section aria-labelledby="pp-feat-title">
        <h3 className="pp-h" id="pp-feat-title">{t("premium.features.title")}</h3>
        <p className="pp-lead" style={{ margin: "6px 2px 10px" }}>{t("premium.features.lead")}</p>
        {groups.map(([labelKey, keys]) => (
          <div key={labelKey} style={{ marginBottom: 14 }}>
            <div className="pp-hint" style={{ margin: "0 2px 6px" }}>{t(labelKey)}</div>
            <div className="pp-feats">
              {keys.map((k) => <FeatureRow key={k} fkey={k} premium={premium} desktop={desktop} />)}
            </div>
          </div>
        ))}
      </section>
      <Compare plan={premium.plan} />
    </div>
  );
}

export { tierAllows };
