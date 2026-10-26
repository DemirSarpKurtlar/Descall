import { useCallback, useEffect, useRef, useState } from "react";
import { Lock, Clock, Coins, ShoppingBag, AlertCircle } from "../ui/Icon.jsx";
import { useLocale } from "../../context/LocaleContext";
import { getPromoHistory } from "../../api/promo";
import { displayCode, historyWhen, fmtNum } from "../../lib/promoCode";
import { describePromoBadge } from "../../lib/promoBadges";
import { openPromoRedeem } from "../../lib/promoBus";
import { CodeInput, BadgeGlyph } from "./PromoUi.jsx";
import PromoMyCodes from "./PromoMyCodes.jsx";
import "../../styles/promo-mycodes.css";
import "../../styles/maintenance.css";
import "../../styles/promo.css";

function HistoryReward({ reward, t, locale }) {
  const r = reward || {};
  if (r.type === "descoin") return <><Coins size={14} className="pc-gold" /> <b className="tnum">{fmtNum(r.amount, locale)}</b> DesCoin</>;
  if (r.type === "shop_item") {
    if (r.alreadyOwned) return <><Coins size={14} className="pc-gold" /> <b className="tnum">{fmtNum(r.refund, locale)}</b> DesCoin</>;
    return <><ShoppingBag size={14} /> {r.name || t("promo.rewardItem")}</>;
  }
  return <><BadgeGlyph badgeId={r.badgeId} size={18} /> {t("promo.badgeName", { name: describePromoBadge(r.badgeId).name })}</>;
}

/**
 * Ayarlar → Promosyon Kodu, three segments: Kodlarım (codes you can use now, server-filtered),
 * Kod kullan (type a code; the sheet does the redeem) and Geçmiş (the codes you used).
 */
export default function PromoSettingsTab() {
  const { t, locale } = useLocale();
  const [code, setCode] = useState("");
  const [items, setItems] = useState(null);
  const [failed, setFailed] = useState(false);
  const [seg, setSeg] = useState("mine");
  const [mineCount, setMineCount] = useState(null);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    try {
      const data = await getPromoHistory();
      if (mounted.current) { setItems(Array.isArray(data?.items) ? data.items : []); setFailed(false); }
    } catch {
      if (mounted.current) setFailed(true);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    load();
    const onRedeemed = () => { setCode(""); load(); };
    window.addEventListener("descall:promo-redeemed", onRedeemed);
    return () => { mounted.current = false; window.removeEventListener("descall:promo-redeemed", onRedeemed); };
  }, [load]);

  const use = () => { if (code.length === 16) openPromoRedeem(code); };
  const desktop = typeof window !== "undefined" && window.matchMedia?.("(pointer: fine)").matches;

  const segs = [["mine", t("promo.segMine"), mineCount], ["enter", t("promo.segEnter")], ["history", t("promo.segHistory")]];
  const onSegKey = (e) => {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const ids = segs.map((x) => x[0]);
    const next = ids[(ids.indexOf(seg) + step + ids.length) % ids.length];
    setSeg(next);
    e.currentTarget.parentElement?.querySelector(`#pm-tab-${next}`)?.focus();
  };
  return (
    <div className="us-tab pm-tab">
      <div className="pm-seg" role="tablist" aria-label={t("settings.promo")}>
        {segs.map(([id, label, n]) => (
          <button key={id} type="button" role="tab" id={`pm-tab-${id}`} aria-controls={`pm-panel-${id}`} aria-selected={seg === id} tabIndex={seg === id ? 0 : -1} className={seg === id ? "on" : ""} onClick={() => setSeg(id)} onKeyDown={onSegKey}>
            {label}{n ? <span className="pm-seg-n tnum">{n}</span> : null}
          </button>
        ))}
      </div>
      {seg === "mine" ? (
        <section className="us-section pm-sec" role="tabpanel" id="pm-panel-mine" aria-labelledby="pm-tab-mine">
          <p className="us-lead pm-lead">{t("promo.mineLead")}</p>
          <PromoMyCodes onEnter={() => setSeg("enter")} onCount={setMineCount} />
        </section>
      ) : null}
      {seg === "enter" ? (
      <section className="us-section pm-sec" role="tabpanel" id="pm-panel-enter" aria-labelledby="pm-tab-enter">
        <p className="us-lead">{t("promo.settingsLead")}</p>
        <h4 className="us-section-label">{t("promo.enter")}</h4>
        <div className="ps-redeem">
          <CodeInput value={code} onChange={setCode} onSubmit={use} autoFocus={desktop} />
          <button type="button" className="mt-btn primary ps-use" disabled={code.length < 16} onClick={use}>{t("promo.use")}</button>
        </div>
        <p className="us-row-desc ps-hint"><Lock size={13} /> {t("promo.settingsHint")}</p>
      </section>
      ) : null}
      {seg === "history" ? (
      <section className="us-section pm-sec" role="tabpanel" id="pm-panel-history" aria-labelledby="pm-tab-history">
        <h4 className="us-section-label">{t("promo.usedCodes")}</h4>
        {failed ? (
          <p className="pc-field-msg is-err ps-err" role="alert"><AlertCircle size={14} /> {t("promo.loadFail")} <button type="button" className="mt-btn sm ghost" onClick={load}>{t("promo.retry")}</button></p>
        ) : items && items.length === 0 ? (
          <div className="ps-used"><div className="ps-empty">{t("promo.usedNone")}</div></div>
        ) : items ? (
          <ul className="ps-used">
            {items.map((u) => {
              const w = historyWhen(u.at, Date.now(), locale);
              return (
                <li key={u.id}>
                  <span className="pc-mono ps-code">{displayCode(u.code)}</span>
                  <span className="ps-reward"><HistoryReward reward={u.reward} t={t} locale={locale} /></span>
                  <time className="tnum" dateTime={u.at}><Clock size={13} /> {w.today ? t("promo.today", { time: w.today }) : w.date}</time>
                </li>
              );
            })}
          </ul>
        ) : null}
      </section>
      ) : null}
    </div>
  );
}
