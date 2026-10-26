// Ayarlar → Promosyon Kodu → "Kodlarım".
// Codes this account can use right now. The server decides eligibility (GET /api/promo/available);
// the client only renders what it gets, copies, and redeems through the normal POST /api/promo/redeem.
// Badge codes hand the result to the redeem sheet's badge celebration ("Hemen tak").
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Copy, Check, Clock, Coins, ShoppingBag, Users, Sparkles, Ticket, Loader2, AlertCircle, CheckCircle2 } from "../ui/Icon.jsx";
import { useLocale } from "../../context/LocaleContext";
import { getPromoAvailable, markPromoAvailableSeen, redeemPromoCode } from "../../api/promo";
import { displayCode, fmtNum } from "../../lib/promoCode";
import { describePromoBadge } from "../../lib/promoBadges";
import { framerSpring, REDUCED_MOTION_FADE, SPRINGS } from "../../lib/fluid/springs";
import { hapticError, hapticSuccess } from "../../lib/fluid/haptics";
import { copyText } from "../../lib/copyText";
import { openPromoCelebration } from "../../lib/promoBus";
import { announceAvailable, clockSkew, expiryInfo, GONE_AFTER, needsFastTick, PROMO_NUDGE_EVENT, PROMO_REDEEMED_EVENT, unseenIds } from "../../lib/promoAvailable";
import { PressButton, BadgeGlyph } from "./PromoUi.jsx";

/** Server-aligned clock; ticks every second only while a card is under a day from expiry. */
function useNow(skew, fast) {
  const [now, setNow] = useState(() => Date.now() + skew);
  useEffect(() => {
    setNow(Date.now() + skew);
    const id = setInterval(() => setNow(Date.now() + skew), fast ? 1000 : 30000);
    return () => clearInterval(id);
  }, [skew, fast]);
  return now;
}

function expiryLine(expiresAt, now, t) {
  const e = expiryInfo(expiresAt, now);
  if (e.kind === "none") return { text: t("promo.noExpiryShort"), soon: false };
  if (e.kind === "days") return { text: t("promo.leftDays", { d: e.d, h: e.h }), soon: false };
  return { text: t("promo.leftLive", { t: e.clock }), soon: true, over: e.kind === "over" };
}

function Medal({ reward }) {
  if (reward?.type === "special_badge") return <span className="pm-medal is-badge"><BadgeGlyph badgeId={reward.badgeId} size={40} /></span>;
  if (reward?.type === "shop_item") return <span className="pm-medal is-item"><ShoppingBag size={20} /></span>;
  return <span className="pm-medal is-coin"><Coins size={20} /></span>;
}

function rewardTitle(reward, t, locale) {
  if (reward?.type === "special_badge") return t("promo.badgeName", { name: describePromoBadge(reward.badgeId).name });
  if (reward?.type === "shop_item") return reward.name || t("promo.rewardItem");
  return <><span className="tnum">{fmtNum(reward?.amount, locale)}</span> DesCoin</>;
}

function successCopy(out, item, t, locale) {
  const r = out?.reward || item.reward || {};
  if (r.type === "special_badge") return { title: t("promo.usedBadge", { name: describePromoBadge(r.badgeId).name }), sub: t("promo.usedBadgeSub") };
  if (r.type === "shop_item" && !r.alreadyOwned) return { title: t("promo.usedItem", { name: r.name || "" }), sub: t("promo.usedItemSub") };
  const n = r.type === "shop_item" ? r.refund : r.amount;
  return { title: t("promo.usedPlus", { n: fmtNum(n, locale) }), sub: out?.balance != null ? t("promo.usedBalance", { n: fmtNum(out.balance, locale) }) : "" };
}

function CodeCard({ item, now, onGone }) {
  const { t, locale } = useLocale();
  const reduce = useReducedMotion();
  const [copied, setCopied] = useState(false);
  const [state, setState] = useState("idle"); // idle | busy | done | error
  const [out, setOut] = useState(null);
  const [err, setErr] = useState(null);
  const exp = expiryLine(item.expiresAt, now, t);
  const left = item.remaining;

  useEffect(() => {
    if (!copied) return undefined;
    const id = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(id);
  }, [copied]);
  // Ran out while on screen: leave quietly.
  useEffect(() => {
    if (!exp.over || state !== "idle") return undefined;
    const id = setTimeout(() => onGone(item.id), 1200);
    return () => clearTimeout(id);
  }, [exp.over, state, onGone, item.id]);

  const copy = async () => {
    const text = displayCode(item.code, "-");
    try { await copyText(text); } catch { /* clipboard blocked: still show the code */ }
    setCopied(true);
  };

  const use = async () => {
    if (state === "busy" || state === "done") return;
    setState("busy");
    setErr(null);
    try {
      const res = await redeemPromoCode(item.code);
      hapticSuccess();
      setOut(res);
      setState("done");
      if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(PROMO_REDEEMED_EVENT, { detail: { codeId: res?.codeId, balance: res?.balance, fromList: true } }));
      // Badges get the full celebration sheet (with "Hemen tak"); the card still morphs and leaves.
      if (res?.reward?.type === "special_badge") openPromoCelebration(res);
      setTimeout(() => onGone(item.id), 1700);
    } catch (e) {
      hapticError();
      setErr(e);
      setState("error");
      if (GONE_AFTER.has(e?.code)) setTimeout(() => onGone(item.id), 2400);
    }
  };

  const errText = err ? (err.code === "limit" ? t("promo.justFilled")
    : err.code === "age" || err.code === "rate_limited" ? t("promo.e_unavailable")
    : (() => { const k = `promo.e_${err.code}`; const s = t(k); return s && s !== k ? s : t("promo.e_server_error"); })()) : "";
  const done = state === "done";
  const sc = done ? successCopy(out, item, t, locale) : null;
  const fade = reduce ? REDUCED_MOTION_FADE : framerSpring(SPRINGS.default);

  return (
    <motion.li
      layout={!reduce}
      className={`pm-card${done ? " is-done" : ""}${item.scope === "personal" ? " is-personal" : ""}`}
      initial={false}
      exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, height: 0, marginTop: 0, paddingTop: 0, paddingBottom: 0, transition: { ...framerSpring({ dampingRatio: 1, response: 0.42 }), opacity: { duration: 0.18 } } }}
      transition={fade}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        {done ? (
          <motion.div key="ok" className="pm-ok" role="status" initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, filter: "blur(4px)" }} animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }} transition={{ ...framerSpring({ dampingRatio: 1, response: 0.32 }) }}>
            <motion.span className="pm-ok-ico" initial={reduce ? false : { scale: 0.25, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ ...framerSpring({ dampingRatio: 0.8, response: 0.35 }), delay: 0.05 }}><Check size={22} /></motion.span>
            <span className="pm-ok-copy">
              <b className="tnum">{sc.title}</b>
              {sc.sub ? <span className="tnum">{sc.sub}</span> : null}
            </span>
            <Medal reward={out?.reward || item.reward} />
          </motion.div>
        ) : (
          <motion.div key="body" className="pm-body" exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.98, filter: "blur(4px)", transition: { duration: 0.16 } }}>
            <div className="pm-head">
              <Medal reward={item.reward} />
              <div className="pm-title">
                <div className="pm-reward">{rewardTitle(item.reward, t, locale)}</div>
                {item.message ? <p className="pm-msg">{item.message}</p> : null}
              </div>
              {item.scope === "personal" ? <span className="pm-tag is-you"><Sparkles size={12} /> {t("promo.forYou")}</span>
                : item.scope === "group" ? <span className="pm-tag"><Users size={12} /> {t("promo.forGroup")}</span> : null}
            </div>
            <button type="button" className={`pm-code${copied ? " is-copied" : ""}`} onClick={copy} aria-label={t("promo.copyAria", { code: displayCode(item.code, "-") })}>
              <span className="pm-code-txt">{displayCode(item.code)}</span>
              <span className="pm-copy" aria-live="polite">
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.span key={copied ? "y" : "n"} className="pm-copy-in" initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.25, filter: "blur(4px)" }} animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }} exit={{ opacity: 0, scale: 0.25, filter: "blur(4px)" }} transition={framerSpring(SPRINGS.press)}>
                    {copied ? <><Check size={14} /> {t("promo.copied")}</> : <><Copy size={14} /> {t("promo.copy")}</>}
                  </motion.span>
                </AnimatePresence>
              </span>
            </button>
            <div className="pm-foot">
              <span className={`pm-meta${exp.soon ? " is-soon" : ""}`}><Clock size={13} /> <span className="tnum">{exp.text}</span></span>
              {left != null ? <span className={`pm-meta${left <= 10 ? " is-soon" : ""}`}><Users size={13} /> <span className="tnum">{left <= 10 ? t("promo.usesLast", { n: left }) : t("promo.usesLeft", { n: fmtNum(left, locale) })}</span></span> : null}
              <PressButton className="pm-use" onClick={use} disabled={state === "busy"} aria-busy={state === "busy" || undefined}>
                {state === "busy" ? <><Loader2 size={15} className="pm-spin" /> {t("promo.using")}</> : t("promo.use")}
              </PressButton>
            </div>
            {state === "error" ? <p className="pc-field-msg is-err pm-err" role="alert"><AlertCircle size={14} /> {errText}</p> : null}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  );
}

function Skeleton() {
  return (
    <ul className="pm-list" aria-busy="true" aria-label="…">
      {[0, 1, 2].map((i) => (
        <li key={i} className="pm-card pm-skel">
          <div className="pm-head"><span className="pm-medal sk" /><div className="pm-title"><span className="sk sk-l" /><span className="sk sk-s" /></div></div>
          <span className="sk sk-code" />
          <div className="pm-foot"><span className="sk sk-m" /><span className="sk sk-m" /><span className="sk sk-btn" /></div>
        </li>
      ))}
    </ul>
  );
}

export function MyCodesEmpty({ onEnter }) {
  const { t } = useLocale();
  return (
    <div className="pm-empty">
      <span className="pm-empty-ico" aria-hidden="true"><Ticket size={26} /></span>
      <h3>{t("promo.mineEmptyTitle")}</h3>
      <p>{t("promo.mineEmptyBody")}</p>
      <button type="button" className="mt-btn ghost pm-empty-btn" onClick={onEnter}>{t("promo.segEnter")}</button>
    </div>
  );
}

/** List of usable codes. onEnter switches to the "Kod kullan" segment; onCount gets the list length. */
export default function PromoMyCodes({ onEnter, onCount }) {
  const { t } = useLocale();
  const [items, setItems] = useState(null);
  const [failed, setFailed] = useState(false);
  const [skew, setSkew] = useState(0);
  const mounted = useRef(true);
  const fast = useMemo(() => needsFastTick(items, Date.now() + skew), [items, skew]);
  const now = useNow(skew, fast);

  const load = useCallback(async () => {
    try {
      const d = await getPromoAvailable();
      if (!mounted.current) return;
      const list = Array.isArray(d?.items) ? d.items : [];
      setSkew(clockSkew(d?.serverNow));
      setItems(list);
      setFailed(false);
      const ids = unseenIds(list);
      // Seeing the list clears the settings badge; the cards keep their place.
      if (ids.length) markPromoAvailableSeen(ids).catch(() => {});
    } catch {
      if (mounted.current) setFailed(true);
    }
  }, []);
  useEffect(() => { mounted.current = true; load(); return () => { mounted.current = false; }; }, [load]);
  // On screen = seen: the settings badge clears, the "N kod seni bekliyor" hint follows the list.
  useEffect(() => {
    if (!items) return;
    onCount?.(items.length);
    announceAvailable({ count: items.length, unseen: 0 });
  }, [items, onCount]);
  // A new code for this account (server nudge) or a redeem elsewhere (sheet, popup) → refresh.
  useEffect(() => {
    const onRedeemed = (e) => { if (!e?.detail?.fromList) load(); };
    window.addEventListener(PROMO_REDEEMED_EVENT, onRedeemed);
    window.addEventListener(PROMO_NUDGE_EVENT, load);
    return () => {
      window.removeEventListener(PROMO_REDEEMED_EVENT, onRedeemed);
      window.removeEventListener(PROMO_NUDGE_EVENT, load);
    };
  }, [load]);

  const gone = useCallback((id) => setItems((cur) => (cur || []).filter((x) => x.id !== id)), []);

  if (failed) return <p className="pc-field-msg is-err ps-err" role="alert"><AlertCircle size={14} /> {t("promo.loadFail")} <button type="button" className="mt-btn sm ghost" onClick={load}>{t("promo.retry")}</button></p>;
  if (!items) return <Skeleton />;
  if (items.length === 0) return <MyCodesEmpty onEnter={onEnter} />;
  return (
    <>
      <p className="pm-count"><CheckCircle2 size={14} /> <span className="tnum">{items.length === 1 ? t("promo.mineOne") : t("promo.mineCount", { n: items.length })}</span></p>
      <motion.ul className="pm-list" layout>
        <AnimatePresence initial={false}>
          {items.map((it) => <CodeCard key={it.id} item={it} now={now} onGone={gone} />)}
        </AnimatePresence>
      </motion.ul>
    </>
  );
}
