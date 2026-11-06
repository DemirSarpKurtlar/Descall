/**
 * Ayarlar > Descall+ (approved draft A, "Kontrol Merkezi":
 * docs/design/premium-settings/real/real-a1.png and real-a2.png).
 *
 * Home:
 *   - Membership card: plan, end date or "Süresiz", stats and a ring that counts
 *     the days to the next DesCoin gift.
 *   - Feature search with an all / on / off filter.
 *   - 8 category tiles (categories.js), each showing how many features are on.
 *   - Rows to the plan comparison and the coupon form.
 * Category view: one grouped list. Each feature has its own switch, and its settings
 * panel opens under the row while the feature is on.
 * Panels come from ./settings/*.jsx; each file exports { key, Panel } and optionally
 * defaultEnabled. Panel props: { settings, update(patch), enabled, desktop, has(key) }.
 * iOS (Capacitor) shows the membership card only: no upsell, no plan page (App Store 3.1.1).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "../context/LocaleContext";
import { formatDate, formatNumber } from "../i18n/format.js";
import { isNativeIOS } from "../lib/platform.js";
import {
  Lock, Check, Monitor, Keyboard, Bell, Mic, Gamepad2, Zap, LayoutDashboard, Wand2,
  Search, ChevronLeft, ChevronRight, Ticket, LayoutGrid,
} from "../components/ui/Icon.jsx";
import { FEATURES, FEATURE_KEYS, PLAN_COIN, tierAllows, featuresForPlan } from "./features.js";
import { PREMIUM_CATEGORIES, daysUntil } from "./categories.js";
import { usePremium, redeemPremiumCode } from "./usePremium.js";
import { useFeatureSettings, isDesktopApp, getFeatureSettings, onFeatureSettings } from "./featureSettings.js";
import PremiumBadge from "./PremiumBadge.jsx";
import "./premium.css";

const panelModules = import.meta.glob("./settings/*.jsx", { eager: true });
export const PANELS = Object.freeze(
  Object.fromEntries(
    Object.values(panelModules)
      .filter((m) => m && typeof m.key === "string" && typeof m.Panel === "function")
      .map((m) => [m.key, m])
  )
);

const ICONS = { Monitor, Keyboard, Bell, Mic, Gamepad2, Zap, LayoutDashboard, Wand2 };
const CAT_OF = Object.freeze(Object.fromEntries(PREMIUM_CATEGORIES.flatMap((c) => c.keys.map((k) => [k, c]))));

function isOn(key, settings) {
  const s = settings || {};
  return typeof s.enabled === "boolean" ? s.enabled : PANELS[key]?.defaultEnabled !== false;
}

/** enabled flag of every feature, kept live (desktop: main process; web: localStorage). */
function useAllFeatureSettings() {
  const [map, setMap] = useState({});
  useEffect(() => {
    let live = true;
    Promise.all(FEATURE_KEYS.map((k) => getFeatureSettings(k).then((v) => [k, v]).catch(() => [k, {}])))
      .then((entries) => { if (live) setMap((m) => ({ ...Object.fromEntries(entries), ...m })); });
    const off = onFeatureSettings((k, v) => { if (live) setMap((m) => ({ ...m, [k]: v || {} })); });
    return () => { live = false; off(); };
  }, []);
  return map;
}

/** Why a feature cannot be switched here, or null when it can. */
function blocker(key, premium, desktop) {
  if (!premium.has(key)) return FEATURES[key].tier === "ultra" ? "ultra" : "plus";
  if (FEATURES[key].desktop && !desktop) return "desktop";
  if (!PANELS[key]) return "soon";
  return null;
}

function Tile({ icon, color, size = 17 }) {
  const Glyph = ICONS[icon] || LayoutGrid;
  return <span className={`pp-ico c-${color}`} aria-hidden="true"><Glyph size={size} /></span>;
}

function GiftRing({ days }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const frac = Math.max(0, Math.min(1, (days ?? 0) / 30));
  return (
    <svg className="pp-ring-svg" viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <linearGradient id="pp-ring-grad" x1="0" x2="1">
          <stop offset="0" stopColor="#ffd27a" />
          <stop offset="1" stopColor="#ef8f5b" />
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,.1)" strokeWidth="9" />
      <circle cx="50" cy="50" r={r} fill="none" stroke="url(#pp-ring-grad)" strokeWidth="9" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - frac)} />
    </svg>
  );
}

function StatusHero({ premium, ios, onCount }) {
  const { t, locale } = useLocale();
  const plan = premium.plan;
  const stateKey = plan ? "active" : premium.status === "expired" || premium.status === "cancelled" ? premium.status : "none";
  const planName = plan === "ultra" ? t("premium.name.ultra") : plan === "plus" ? t("premium.name.plus") : t("premium.name.free");
  const coin = plan ? PLAN_COIN[plan] : 0;
  const days = plan ? daysUntil(premium.nextCoinAt) : null;
  let sub;
  if (premium.loading) sub = t("premium.status.loading");
  else if (!plan) sub = t(`premium.status.${stateKey}`);
  else if (premium.unlimited) sub = t("premium.hub.unlimitedMember");
  else sub = premium.endsAt ? t("premium.hub.until", { date: formatDate(premium.endsAt, locale) }) : t("premium.status.active");
  return (
    <section className={`us-card pp-hero2${plan ? ` is-${plan}` : ""}`} aria-labelledby="pp-status-title" data-testid="premium-status">
      <div className="pp-hero2-main">
        <h2 className="pp-hero2-title" id="pp-status-title">
          {planName}
          {plan ? <PremiumBadge plan={plan} variant="inline" /> : null}
        </h2>
        <div className="pp-hero2-sub" data-testid="premium-ends">
          {plan ? <span className="pp-state is-active">{t("premium.status.active")}</span> : null}
          <span>{sub}</span>
        </div>
        {plan ? (
          <div className="pp-stats">
            <div className="pp-stat"><b className="tnum">{premium.features.length}</b><span>{t("premium.hub.statAccess")}</span></div>
            {onCount != null ? <div className="pp-stat"><b className="tnum">{onCount}</b><span>{t("premium.hub.statOn")}</span></div> : null}
            <div className="pp-stat"><b className="tnum">{formatNumber(coin, locale)}</b><span>{t("premium.hub.statGift")}</span></div>
          </div>
        ) : null}
        {premium.error ? <p className="pp-warn">{t("premium.status.offline")}</p> : null}
        {ios ? null : <p className="pp-note">{t("premium.grantNote")}</p>}
      </div>
      {plan ? (
        <div className="pp-gift">
          <div className="pp-ring">
            <GiftRing days={days} />
            <div className="pp-ring-label">
              {days == null ? <b>30</b> : <b className="tnum">{days}</b>}
              <span>{t("premium.hub.days")}</span>
            </div>
          </div>
          <div className="pp-gift-text">
            <span className="pp-gift-k">{t("premium.hub.nextGift")}</span>
            <span className="pp-gift-amt"><span className="pp-coin" aria-hidden="true" /><b className="tnum">{formatNumber(coin, locale)}</b></span>
            <span className="pp-gift-k">
              {premium.nextCoinAt ? formatDate(premium.nextCoinAt, locale) : t("premium.status.monthlyGift", { amount: formatNumber(coin, locale) })}
            </span>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function FeatureRow({ fkey, premium, desktop }) {
  const { t } = useLocale();
  const def = FEATURES[fkey];
  const cat = CAT_OF[fkey];
  const mod = PANELS[fkey];
  const block = blocker(fkey, premium, desktop);
  const [settings, update] = useFeatureSettings(fkey, {});
  const enabled = isOn(fkey, settings);
  const Panel = mod?.Panel;
  const name = t(`premium.f.${fkey}.name`);
  return (
    <div className={`pp-row${block === "plus" || block === "ultra" ? " is-locked" : ""}`} data-feature={fkey}>
      <div className="us-row">
        <div className="us-row-text">
          {block === "plus" || block === "ultra"
            ? <span className="pp-ico c-gray" aria-hidden="true"><Lock size={15} /></span>
            : <Tile icon={cat?.icon} color={cat?.color || "gray"} size={16} />}
          <div className="us-row-copy">
            <span className="us-row-title">{name}</span>
            <span className="us-row-desc">{t(`premium.f.${fkey}.desc`)}</span>
          </div>
        </div>
        <div className="us-row-control">
          {block === "plus" || block === "ultra" ? (
            <span className={`pp-pill${block === "ultra" ? " is-ultra" : ""}`}>
              <Lock size={11} />
              {block === "ultra" ? t("premium.features.lockedUltra") : t("premium.features.lockedPlus")}
            </span>
          ) : block === "desktop" ? (
            <span className="pp-pill"><Monitor size={11} />{t("premium.features.desktop")}</span>
          ) : block === "soon" ? (
            <span className="pp-pill">{t("premium.features.soon")}</span>
          ) : (
            <>
              {def.tier === "ultra" && premium.plan === "ultra" ? <span className="pp-pill is-ultra">{t("premium.name.ultraShort")}</span> : null}
              <button
                type="button"
                role="switch"
                aria-checked={enabled}
                aria-label={name}
                className={`us-toggle${enabled ? " active" : ""}`}
                onClick={() => update({ enabled: !enabled })}
              >
                <span className="us-toggle-knob" />
              </button>
            </>
          )}
        </div>
      </div>
      {!block && enabled && Panel ? (
        <div className="pp-sub">
          <Panel settings={settings} update={update} enabled={enabled} desktop={desktop} has={premium.has} />
        </div>
      ) : null}
    </div>
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
    <section className="us-section" aria-labelledby="pp-redeem-title">
      <h4 className="us-section-label" id="pp-redeem-title">{t("premium.redeem.title")}</h4>
      <div className="us-card pp-card-pad">
        <form className="pp-redeem" onSubmit={submit}>
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
      </div>
    </section>
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
      <div className="pp-compare" data-testid="premium-compare" id="pp-compare-title">
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

function BackLink({ onBack }) {
  const { t } = useLocale();
  return (
    <button type="button" className="pp-back" onClick={onBack}>
      <ChevronLeft size={16} />
      {t("premium.hub.back")}
    </button>
  );
}

/** Counts per category: usable (switchable here) and on. */
function useCounts(premium, desktop, settingsMap) {
  return useMemo(() => {
    const out = {};
    let totalOn = 0;
    for (const c of PREMIUM_CATEGORIES) {
      const usable = c.keys.filter((k) => !blocker(k, premium, desktop));
      const on = usable.filter((k) => isOn(k, settingsMap[k])).length;
      totalOn += on;
      out[c.id] = { usable: usable.length, on, total: c.keys.length };
    }
    return { per: out, totalOn };
  }, [premium, desktop, settingsMap]);
}

function CategoryTile({ cat, count, premium, desktop, onOpen }) {
  const { t } = useLocale();
  const allUltra = cat.keys.every((k) => FEATURES[k].tier === "ultra");
  const allDesktop = cat.keys.every((k) => FEATURES[k].desktop);
  const locked = cat.keys.every((k) => !premium.has(k));
  let foot;
  if (locked) {
    foot = <span className="pp-tile-why"><Lock size={11} />{allUltra || premium.plan === "plus" ? t("premium.features.lockedUltra") : t("premium.features.lockedPlus")}</span>;
  } else if (count.usable === 0 && allDesktop && !desktop) {
    foot = <span className="pp-tile-why"><Monitor size={11} />{t("premium.hub.desktopOnly")}</span>;
  } else {
    const pct = count.usable ? Math.round((count.on / count.usable) * 100) : 0;
    foot = (
      <>
        <span className="tnum">{t("premium.hub.onCount", { on: count.on, total: count.usable })}</span>
        <span className="pp-prog" aria-hidden="true"><i style={{ width: `${pct}%` }} /></span>
      </>
    );
  }
  return (
    <button type="button" className={`us-card pp-tile${locked ? " is-locked" : ""}`} data-category={cat.id} onClick={onOpen}>
      <span className="pp-tile-top">
        <Tile icon={cat.icon} color={cat.color} />
        {allUltra ? <span className="pp-pill is-ultra">{t("premium.name.ultraShort")}</span>
          : allDesktop ? <span className="pp-pill"><Monitor size={11} />{t("premium.features.desktop")}</span> : null}
      </span>
      <span className="pp-tile-name">{t(`premium.hub.cat.${cat.id}.name`)}</span>
      <span className="pp-tile-desc">{t(`premium.hub.cat.${cat.id}.desc`)}</span>
      <span className="pp-tile-foot">{foot}</span>
    </button>
  );
}

function LinkRow({ icon: Glyph, title, desc, onClick, testId }) {
  return (
    <button type="button" className="us-card pp-linkrow" onClick={onClick} data-testid={testId}>
      <span className="pp-ico c-gray" aria-hidden="true"><Glyph size={16} /></span>
      <span className="us-row-copy">
        <span className="us-row-title">{title}</span>
        <span className="us-row-desc">{desc}</span>
      </span>
      <ChevronRight size={16} className="pp-chev" />
    </button>
  );
}

export default function PremiumSettingsTab() {
  const { t } = useLocale();
  const premium = usePremium();
  const ios = isNativeIOS();
  const desktop = isDesktopApp();
  const settingsMap = useAllFeatureSettings();
  const counts = useCounts(premium, desktop, settingsMap);
  const [view, setView] = useState({ type: "home" });
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const rootRef = useRef(null);

  const go = useCallback((next) => {
    setView(next);
    const scroller = rootRef.current?.closest(".us-main-scroll");
    if (scroller) scroller.scrollTop = 0;
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    if (!q && filter === "all") return null;
    return FEATURE_KEYS.filter((k) => {
      if (q) {
        const hay = `${t(`premium.f.${k}.name`)} ${t(`premium.f.${k}.desc`)}`.toLocaleLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filter === "all") return true;
      if (blocker(k, premium, desktop)) return false;
      const on = isOn(k, settingsMap[k]);
      return filter === "on" ? on : !on;
    });
  }, [query, filter, t, premium, desktop, settingsMap]);

  if (ios) {
    return (
      <div className="us-tab pp-tab" data-testid="premium-tab" data-feature-total={FEATURE_KEYS.length}>
        <StatusHero premium={premium} ios />
      </div>
    );
  }

  if (view.type === "cat") {
    const cat = PREMIUM_CATEGORIES.find((c) => c.id === view.id) || PREMIUM_CATEGORIES[0];
    const count = counts.per[cat.id];
    return (
      <div className="us-tab pp-tab" data-testid="premium-tab" data-feature-total={FEATURE_KEYS.length} ref={rootRef}>
        <BackLink onBack={() => go({ type: "home" })} />
        <div className="pp-cat-head">
          <Tile icon={cat.icon} color={cat.color} size={20} />
          <div>
            <h2>{t(`premium.hub.cat.${cat.id}.name`)}</h2>
            <p>{t(`premium.hub.cat.${cat.id}.desc`)}{count.usable ? ` · ${t("premium.hub.onCount", { on: count.on, total: count.usable })}` : ""}</p>
          </div>
        </div>
        <section className="us-section">
          <div className="us-card stack pp-list">
            {cat.keys.map((k) => <FeatureRow key={k} fkey={k} premium={premium} desktop={desktop} />)}
          </div>
        </section>
      </div>
    );
  }

  if (view.type === "plans") {
    return (
      <div className="us-tab pp-tab" data-testid="premium-tab" data-feature-total={FEATURE_KEYS.length} ref={rootRef}>
        <BackLink onBack={() => go({ type: "home" })} />
        <h4 className="us-section-label">{t("premium.compare.title")}</h4>
        <Compare plan={premium.plan} />
      </div>
    );
  }

  if (view.type === "redeem") {
    return (
      <div className="us-tab pp-tab" data-testid="premium-tab" data-feature-total={FEATURE_KEYS.length} ref={rootRef}>
        <BackLink onBack={() => go({ type: "home" })} />
        <RedeemCard />
      </div>
    );
  }

  return (
    <div className="us-tab pp-tab" data-testid="premium-tab" data-feature-total={FEATURE_KEYS.length} ref={rootRef}>
      <StatusHero premium={premium} onCount={premium.plan ? counts.totalOn : null} />

      <section className="us-section" aria-labelledby="pp-feat-title">
        <h4 className="us-section-label" id="pp-feat-title">{t("premium.features.title")}</h4>
        <div className="pp-bar">
          <label className="pp-search">
            <Search size={16} aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value.slice(0, 60))}
              placeholder={t("premium.hub.search")}
              aria-label={t("premium.hub.search")}
              data-testid="premium-search"
            />
          </label>
          <div className="us-btn-row" role="group" aria-label={t("premium.hub.filter")}>
            {[["all", "premium.hub.filterAll"], ["on", "premium.hub.filterOn"], ["off", "premium.hub.filterOff"]].map(([id, key]) => (
              <button key={id} type="button" className={`us-btn ${filter === id ? "primary" : "ghost"}`} aria-pressed={filter === id} onClick={() => setFilter(id)}>
                {t(key)}
              </button>
            ))}
          </div>
        </div>

        {results ? (
          results.length ? (
            <>
              <p className="pp-results">{t("premium.hub.results", { n: results.length })}</p>
              <div className="us-card stack pp-list">
                {results.map((k) => <FeatureRow key={k} fkey={k} premium={premium} desktop={desktop} />)}
              </div>
            </>
          ) : (
            <p className="pp-results">{t("premium.hub.noResults")}</p>
          )
        ) : (
          <div className="pp-tiles">
            {PREMIUM_CATEGORIES.map((c) => (
              <CategoryTile key={c.id} cat={c} count={counts.per[c.id]} premium={premium} desktop={desktop} onOpen={() => go({ type: "cat", id: c.id })} />
            ))}
          </div>
        )}
      </section>

      <section className="us-section pp-links">
        <LinkRow icon={LayoutGrid} title={t("premium.compare.title")} desc={t("premium.hub.plansDesc")} onClick={() => go({ type: "plans" })} testId="premium-open-plans" />
        <LinkRow icon={Ticket} title={t("premium.redeem.title")} desc={t("premium.hub.redeemDesc")} onClick={() => go({ type: "redeem" })} testId="premium-open-redeem" />
      </section>
    </div>
  );
}

export { tierAllows };
