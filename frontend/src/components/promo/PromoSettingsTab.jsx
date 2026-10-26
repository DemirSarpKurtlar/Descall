import { useCallback, useEffect, useRef, useState } from "react";
import { Lock, Clock, Coins, ShoppingBag, AlertCircle } from "../ui/Icon.jsx";
import { useLocale } from "../../context/LocaleContext";
import { getPromoHistory } from "../../api/promo";
import { displayCode, historyWhen, fmtNum } from "../../lib/promoCode";
import { describePromoBadge } from "../../lib/promoBadges";
import { openPromoRedeem } from "../../lib/promoBus";
import { CodeInput, BadgeGlyph } from "./PromoUi.jsx";
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

/** Ayarlar → Promosyon Kodu: enter a code (the sheet does the redeem) + the codes you used. */
export default function PromoSettingsTab() {
  const { t, locale } = useLocale();
  const [code, setCode] = useState("");
  const [items, setItems] = useState(null);
  const [failed, setFailed] = useState(false);
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

  return (
    <div className="us-tab">
      <p className="us-lead">{t("promo.settingsLead")}</p>
      <section className="us-section">
        <h4 className="us-section-label">{t("promo.enter")}</h4>
        <div className="ps-redeem">
          <CodeInput value={code} onChange={setCode} onSubmit={use} autoFocus={desktop} />
          <button type="button" className="mt-btn primary ps-use" disabled={code.length < 16} onClick={use}>{t("promo.use")}</button>
        </div>
        <p className="us-row-desc ps-hint"><Lock size={13} /> {t("promo.settingsHint")}</p>
      </section>
      <section className="us-section">
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
    </div>
  );
}
