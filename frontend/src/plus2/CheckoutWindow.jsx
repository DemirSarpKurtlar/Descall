/**
 * Ödeme penceresi (draft 5B section 3, frames 2, 3, 5 + the success screen): one opaque window in the
 * middle with "Kendime / Hediye" tabs.
 *   Kendime: plan + monthly / yearly, the 3-day trial line when the account never had one.
 *   Hediye:  friend, 1 / 3 / 12 months, a note, now or a scheduled time, "Ortak hediye yap" (2-4 shares).
 * Card data never touches Descall: web frames iyzico's hosted page, desktop opens it (or Paddle's)
 * in the system browser, iOS uses StoreKit (a gift is a one-time product). The window then follows
 * the checkout live until it is paid, and shows the success screen / the gift tracker.
 */
import { useEffect, useRef, useState } from "react";
import { useLocale, useT } from "../context/LocaleContext";
import { Check, Gift, Loader2, ShieldCheck, Users, Sparkles, ExternalLink, Calendar } from "../components/ui/Icon.jsx";
import { formatDate } from "../i18n/format.js";
import GlassCheckbox from "../components/ui/GlassCheckbox.jsx";
import { PAvatar, PlusWindow, Switch, ErrorLine } from "./ui.jsx";
import { usePlus, refreshHub } from "./plusStore.js";
import { createCheckout, getCheckout } from "./plusApi.js";
import { errorKey, formatPrice, scheduleIso, shareOf, vatOf } from "./model.js";
import { plusPlatform } from "./platform.js";
import { storeKitAvailable, storePurchase } from "./storeKit.js";
import { openPlus } from "./openPlus.js";

const POLL_MS = 3000;
const POLL_MAX = 15 * 60 * 1000;

function openExternal(url) {
  try {
    if (window.electronAPI?.openExternal) return window.electronAPI.openExternal(url);
  } catch {
    /* fall through */
  }
  window.open(url, "_blank", "noopener,noreferrer");
  return null;
}

export default function CheckoutWindow({ initialTab = "self", initialPlan = "plus", recipientId = null, recipient = null, moment = null, serverId = null, groupId = null, onClose }) {
  const t = useT();
  const { locale } = useLocale() || {};
  const { hub, offer: storeOffer } = usePlus({ load: "hub" });
  const offer = hub?.offer || storeOffer;
  const platform = plusPlatform();
  const isIos = platform === "ios";
  const [tab, setTab] = useState(groupId ? "gift" : initialTab);
  const [plan, setPlan] = useState(initialPlan === "ultra" ? "ultra" : "plus");
  const [period, setPeriod] = useState("monthly");
  const [toId, setToId] = useState(recipientId || "");
  const [months, setMonths] = useState(3);
  const [note, setNote] = useState("");
  const [when, setWhen] = useState("now");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("09:00");
  const [group, setGroup] = useState(false);
  const [shares, setShares] = useState(4);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [session, setSession] = useState(null); // { checkout, provider }
  const [status, setStatus] = useState(null); // pending | paid | failed
  const [gift, setGift] = useState(null);
  const pollRef = useRef(null);

  const me = hub?.me || {};
  const friends = hub?.friends || [];
  const to = friends.find((f) => f.id === toId) || (recipient && recipient.id === toId ? recipient : null);
  const prices = offer?.prices || {};
  const trial = tab === "self" && offer?.features?.trial && !me.trialUsed && !me.active;
  const giftKey = `gift_${plan}_${group ? 12 : months}`;
  const fullPrice = tab === "self" ? prices[`${plan}_${period}`] : prices[giftKey];
  const amount = tab === "gift" && group ? shareOf(fullPrice, shares) : fullPrice;
  const needsAgreement = platform === "web" || platform === "desktop";
  const deliverAt = when === "now" ? "now" : scheduleIso(date, time);

  useEffect(() => () => clearTimeout(pollRef.current), []);

  const poll = (id, started = Date.now()) => {
    clearTimeout(pollRef.current);
    pollRef.current = setTimeout(async () => {
      try {
        const out = await getCheckout(id);
        if (out?.checkout?.status === "paid") {
          setStatus("paid");
          setGift(out.gift || null);
          refreshHub();
          return;
        }
        if (out?.checkout?.status === "failed" || out?.checkout?.status === "cancelled") {
          setStatus("failed");
          return;
        }
      } catch {
        /* keep polling */
      }
      if (Date.now() - started < POLL_MAX) poll(id, started);
    }, POLL_MS);
  };

  const canPay = Boolean(amount != null && offer?.salesOn && !busy && (!needsAgreement || agree)
    && (tab === "self" || (toId && (when === "now" || deliverAt))));

  const pay = async () => {
    if (!canPay) return;
    setBusy(true);
    setErr(null);
    try {
      const body = tab === "self"
        ? { kind: "self", plan, period, moment, serverId, fullName: fullName || undefined, source: moment || "hub" }
        : groupId
          ? { kind: "group_share", groupId }
          : { kind: group ? "group" : "gift", plan, months: group ? 12 : months, recipientId: toId, note: note.trim() || undefined, deliverAt, shares: group ? shares : undefined, fullName: fullName || undefined };
      const out = await createCheckout({ ...body, locale, email: email.trim() || undefined });
      setSession(out);
      setStatus("pending");
      const p = out.provider || {};
      if (p.provider === "apple") {
        const res = await storePurchase({ productId: p.productId, appAccountToken: p.appAccountToken });
        if (res.status === "purchased") setStatus("paid");
        else if (res.status === "pending") poll(out.checkout.id);
        else { setStatus(null); setSession(null); }
        if (res.status === "purchased") refreshHub();
      } else if (p.paymentPageUrl && p.openExternal) {
        openExternal(p.paymentPageUrl);
        poll(out.checkout.id);
      } else {
        poll(out.checkout.id);
      }
    } catch (e) {
      setErr(errorKey(e?.code));
      setStatus(null);
    } finally {
      setBusy(false);
    }
  };

  const title = t("plus2.ck.title");
  const head = (
    <div className="p2-row p2-grow">
      <h2 style={{ margin: 0 }}>{title}</h2>
      <span className="p2-grow" />
      {!session && !groupId ? (
        <div className="p2-seg" role="tablist" aria-label={title}>
          <button type="button" role="tab" aria-selected={tab === "self"} onClick={() => setTab("self")}>{t("plus2.ck.self")}</button>
          <button type="button" role="tab" aria-selected={tab === "gift"} onClick={() => setTab("gift")}>{t("plus2.ck.gift")}</button>
        </div>
      ) : null}
    </div>
  );

  if (status === "paid") {
    return (
      <PlusWindow title={title} onClose={onClose} size="narrow">
        <div className="p2-success">
          <div className="p2-glyph">{tab === "gift" ? <Gift /> : <Sparkles />}</div>
          <div className="p2-h" style={{ fontSize: 18 }}>{tab === "gift" ? t("plus2.ok.giftTitle", { name: to?.displayName || to?.username || "" }) : t(trial ? "plus2.ok.trialTitle" : "plus2.ok.title", { plan: t(`plus2.plan.${plan}`) })}</div>
          <div className="p2-small p2-muted" style={{ maxWidth: 380 }}>
            {tab === "gift"
              ? (deliverAt && deliverAt !== "now" ? t("plus2.ok.giftScheduled", { date: formatDate(deliverAt, locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) }) : t("plus2.ok.giftNow"))
              : t("plus2.ok.body", { n: offer?.tiers?.[plan]?.boosts ?? 2 })}
          </div>
          {tab === "gift" && gift ? (
            <button type="button" className="p2-btn is-cta" onClick={() => openPlus({ view: "gift", giftId: gift.id })}>{t("plus2.ok.track")}</button>
          ) : tab === "self" ? (
            <button type="button" className="p2-btn is-cta" onClick={() => { onClose?.(); openPlus({ view: serverId ? "server" : "hub", serverId }); }}>{t("plus2.ok.boostNow")}</button>
          ) : null}
          <button type="button" className="p2-btn is-ghost" onClick={onClose}>{t("plus2.close")}</button>
        </div>
      </PlusWindow>
    );
  }

  return (
    <PlusWindow title={title} onClose={onClose} size="mid" head={head} busy={busy}>
      <div className="p2-ck">
        {!offer?.salesOn ? <div className="p2-off" style={{ margin: 0 }}>{t("plus2.ck.off")}</div> : null}
        {tab === "self" ? (
          <>
            <div className="p2-durs" role="group" aria-label={t("plus2.ck.planLabel")}>
              {["plus", "ultra"].map((p) => (
                <button key={p} type="button" className="p2-dur" aria-pressed={plan === p} onClick={() => setPlan(p)}>
                  {t(`plus2.plan.${p}`)}<small className="tnum">{prices[`${p}_${period}`] != null ? formatPrice(prices[`${p}_${period}`], offer?.currency, locale) : "-"}</small>
                </button>
              ))}
              <div className="p2-seg" style={{ alignSelf: "center", justifySelf: "end" }}>
                <button type="button" aria-pressed={period === "monthly"} onClick={() => setPeriod("monthly")}>{t("plus2.ck.monthly")}</button>
                <button type="button" aria-pressed={period === "yearly"} onClick={() => setPeriod("yearly")}>{t("plus2.ck.yearly")}</button>
              </div>
            </div>
            {trial ? <div className="p2-pill is-ok" style={{ alignSelf: "flex-start" }}><Check />{t("plus2.ck.trialLine", { days: offer?.trial?.days || 3, price: formatPrice(fullPrice, offer?.currency, locale) })}</div> : null}
          </>
        ) : groupId ? (
          <div className="p2-mini"><div className="p2-row"><Users size={16} /><b>{t("plus2.group.joinTitle")}</b></div><div className="p2-small p2-muted">{t("plus2.group.joinSub")}</div></div>
        ) : (
          <>
            <div className="p2-row p2-card" style={{ padding: "10px 12px" }}>
              {to ? <PAvatar user={to} size={34} /> : <Gift size={18} />}
              <div className="p2-grow">
                <select className="p2-select" value={toId} onChange={(e) => setToId(e.target.value)} aria-label={t("plus2.ck.who")}>
                  <option value="">{t("plus2.ck.pickFriend")}</option>
                  {friends.filter((f) => !f.plan).map((f) => <option key={f.id} value={f.id}>{f.displayName || f.username}</option>)}
                  {recipient && !friends.some((f) => f.id === recipient.id) ? <option value={recipient.id}>{recipient.displayName || recipient.username}</option> : null}
                </select>
              </div>
            </div>
            {!group ? (
              <div>
                <div className="p2-eyebrow" style={{ marginBottom: 6 }}>{t("plus2.ck.duration")}</div>
                <div className="p2-durs">
                  {[1, 3, 12].map((m) => (
                    <button key={m} type="button" className="p2-dur" aria-pressed={months === m} onClick={() => setMonths(m)}>
                      {t("plus2.ck.months", { n: m })}<small className="tnum">{prices[`gift_${plan}_${m}`] != null ? formatPrice(prices[`gift_${plan}_${m}`], offer?.currency, locale) : "-"}</small>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <label className="p2-field"><span>{t("plus2.ck.note")}</span>
              <input className="p2-input" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("plus2.ck.notePh")} />
            </label>
            <div>
              <div className="p2-eyebrow" style={{ marginBottom: 6 }}>{t("plus2.ck.when")}</div>
              <div className="p2-row" style={{ flexWrap: "wrap" }}>
                <div className="p2-seg">
                  <button type="button" aria-pressed={when === "now"} onClick={() => setWhen("now")}>{t("plus2.ck.now")}</button>
                  <button type="button" aria-pressed={when === "later"} onClick={() => setWhen("later")}><Calendar size={13} /> {t("plus2.ck.later")}</button>
                </div>
                {when === "later" ? (
                  <>
                    <input type="date" className="p2-input" style={{ width: 160 }} value={date} onChange={(e) => setDate(e.target.value)} aria-label={t("plus2.ck.date")} />
                    <input type="time" className="p2-input" style={{ width: 110 }} value={time} onChange={(e) => setTime(e.target.value)} aria-label={t("plus2.ck.time")} />
                  </>
                ) : null}
              </div>
            </div>
            {offer?.features?.groupGifts && !isIos ? (
              <div className="p2-row p2-card" style={{ padding: "10px 12px" }}>
                <Users size={18} />
                <div className="p2-grow"><b style={{ fontSize: 13 }}>{t("plus2.ck.groupTitle")}</b><div className="p2-sub">{group ? t("plus2.ck.groupOn", { shares, share: formatPrice(shareOf(prices[`gift_${plan}_12`], shares), offer?.currency, locale) }) : t("plus2.ck.groupSub")}</div></div>
                {group ? (
                  <div className="p2-seg">{[2, 3, 4].map((n) => <button key={n} type="button" aria-pressed={shares === n} onClick={() => setShares(n)}>{n}</button>)}</div>
                ) : null}
                <Switch checked={group} onChange={setGroup} label={t("plus2.ck.groupTitle")} />
              </div>
            ) : null}
            {isIos ? <div className="p2-note">{t("plus2.ck.iosGiftNote")}</div> : null}
          </>
        )}

        {needsAgreement && !session ? (
          <div className="p2-grid2">
            <label className="p2-field"><span>{t("plus2.ck.name")}</span><input className="p2-input" autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder={t("plus2.ck.namePh")} /></label>
            <label className="p2-field"><span>{t("plus2.ck.email")}</span><input className="p2-input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("plus2.ck.emailPh")} /></label>
          </div>
        ) : null}

        {session?.provider?.paymentPageUrl && !session.provider.openExternal ? (
          <div className="p2-field"><span>{t("plus2.ck.card")}</span>
            <div className="p2-frame" style={{ padding: 0, overflow: "hidden" }}>
              <iframe title={t("plus2.ck.card")} src={session.provider.paymentPageUrl} sandbox="allow-scripts allow-forms allow-same-origin allow-top-navigation-by-user-activation allow-popups" referrerPolicy="no-referrer" />
            </div>
          </div>
        ) : session?.provider?.openExternal ? (
          <div className="p2-frame"><ExternalLink size={16} />{t("plus2.ck.external")}<span className="p2-grow" /><button type="button" className="p2-btn is-sm" onClick={() => openExternal(session.provider.paymentPageUrl)}>{t("plus2.ck.reopen")}</button></div>
        ) : !session ? (
          <div className={`p2-frame${offer?.salesOn ? "" : " is-off"}`}><ShieldCheck size={16} />{isIos ? t("plus2.ck.appleNote") : t("plus2.ck.cardNote", { provider: offer?.provider === "paddle" ? "Paddle" : "iyzico" })}</div>
        ) : null}

        {amount != null ? (
          <div className="p2-sum">
            <div className="p2-row"><span>{tab === "self" ? t("plus2.ck.lineSelf", { plan: t(`plus2.plan.${plan}`), period: t(period === "yearly" ? "plus2.ck.yearly" : "plus2.ck.monthly") }) : t("plus2.ck.lineGift", { n: group ? 12 : months })}</span><span className="tnum">{formatPrice(amount, offer?.currency, locale)}</span></div>
            <div className="p2-row p2-muted"><span>{t("plus2.ck.vat", { p: offer?.vatPercent ?? 20 })}</span><span className="tnum">{formatPrice(vatOf(amount, offer?.vatPercent ?? 20), offer?.currency, locale)}</span></div>
            {trial ? <div className="p2-row" style={{ color: "var(--p2-ok)" }}><span>{t("plus2.ck.todayTrial", { days: offer?.trial?.days || 3 })}</span><span className="tnum">{formatPrice(0, offer?.currency, locale)}</span></div> : null}
            <hr />
            <div className="p2-row is-total"><span>{t("plus2.ck.total")}</span><span className="tnum">{formatPrice(amount, offer?.currency, locale)}</span></div>
          </div>
        ) : null}

        {needsAgreement && !session ? (
          <label className="p2-check"><GlassCheckbox checked={agree} onChange={(e) => setAgree(e.target.checked)} /><span>{t("plus2.ck.agree")}</span></label>
        ) : null}

        <ErrorLine code={err} />
        {status === "failed" ? <ErrorLine code="plus2.err.paymentFailed" /> : null}

        {!session ? (
          <button type="button" className="p2-btn is-cta is-lg" disabled={!canPay} onClick={pay}>
            {busy ? <Loader2 className="p2-spin" /> : isIos ? null : <ShieldCheck />}
            {tab === "self"
              ? (trial ? t("plus2.ck.payTrial", { days: offer?.trial?.days || 3 }) : isIos ? t("plus2.ck.payApple") : t("plus2.ck.pay3d"))
              : t("plus2.ck.payAmount", { amount: amount != null ? formatPrice(amount, offer?.currency, locale) : "" })}
          </button>
        ) : (
          <div className="p2-row" style={{ justifyContent: "center", gap: 8 }}><Loader2 className="p2-spin" /><span className="p2-small p2-muted">{t("plus2.ck.waiting")}</span></div>
        )}
        <div className="p2-foot">{isIos ? t("plus2.ck.footApple") : t("plus2.ck.foot", { provider: offer?.provider === "paddle" ? "Paddle" : "iyzico" })}</div>
        {tab === "self" && !storeKitAvailable() && isIos ? <div className="p2-note">{t("plus2.ck.storeMissing")}</div> : null}
      </div>
    </PlusWindow>
  );
}
