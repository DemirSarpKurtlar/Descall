/**
 * Hediye takibi (draft 5B frame 4) and the DM gift card (moment 11).
 *   GiftTracker: the gift card, live steps (paid -> sent -> opened -> boosted a server), "Tarihi
 *   değiştir" and "Geri al" while allowed (before it opens; a delivered gift for 24 h); an unopened
 *   gift returns to the sender after 30 days. Updates live from "plus:event".
 *   GiftCard: the card in the DM ("Demir sana Descall+ hediye etti" + Aç) for the recipient, and the
 *   sender's live line ("Gönderildi · açılmadı · 24 sa içinde geri alınabilir").
 */
import { useState } from "react";
import { useLocale, useT } from "../context/LocaleContext";
import { Check, Gift, Loader2, Undo2, Calendar } from "../components/ui/Icon.jsx";
import { formatDate } from "../i18n/format.js";
import { PlusWindow, ErrorLine } from "./ui.jsx";
import { usePlus, refreshHub } from "./plusStore.js";
import { openGift, recallGift, rescheduleGift } from "./plusApi.js";
import { errorKey, formatPrice, giftSteps, scheduleIso } from "./model.js";

const SPARKS = [[18, 30], [62, 18], [80, 64], [40, 74], [90, 30], [12, 70]];

export function GiftCardVisual({ gift, viewer = "recipient", compact = false, action = null }) {
  const t = useT();
  const { locale } = useLocale() || {};
  const name = gift?.from?.displayName || gift?.from?.username || "";
  const toName = gift?.to?.displayName || gift?.to?.username || "";
  return (
    <div className="p2-giftcard">
      {SPARKS.map(([x, y], i) => <span key={i} className="p2-sparkle" style={{ left: `${x}%`, top: `${y}%`, opacity: 0.4 + (i % 3) * 0.2 }} />)}
      <div className="p2-row"><Gift size={20} /><span className="p2-grow" /><span className="p2-pill">{t("plus2.gift.monthsTag", { n: gift?.months || 1 })}</span></div>
      <h4>{viewer === "sender" ? t("plus2.gift.toTitle", { name: toName }) : t("plus2.gift.fromTitle", { name })}</h4>
      {gift?.note && !compact ? <p>"{gift.note}"</p> : null}
      {viewer === "sender" && gift?.status === "scheduled" ? <p>{t("plus2.gift.willSend", { date: formatDate(gift.deliverAt, locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) })}</p> : null}
      {action ? <div style={{ marginTop: 10 }}>{action}</div> : null}
    </div>
  );
}

/** The DM card. viewer: "recipient" | "sender". */
export function GiftCard({ gift, viewer = "recipient", onChanged }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  if (!gift) return null;
  const open = async () => {
    setBusy(true);
    setErr(null);
    try {
      await openGift(gift.id);
      onChanged?.();
      refreshHub();
    } catch (e) {
      setErr(errorKey(e?.code));
    } finally {
      setBusy(false);
    }
  };
  const statusKey = gift.status === "opened" ? "plus2.gift.lineOpened" : gift.status === "delivered" ? (gift.canRecall ? "plus2.gift.lineSentRecall" : "plus2.gift.lineSent") : gift.status === "scheduled" ? "plus2.gift.lineScheduled" : `plus2.giftStatus.${gift.status}`;
  return (
    <div className="p2" style={{ maxWidth: 340, display: "flex", flexDirection: "column", gap: 8 }}>
      <GiftCardVisual
        gift={gift}
        viewer={viewer}
        action={viewer === "recipient" && gift.canOpen ? (
          <button type="button" className="p2-btn is-sm" style={{ background: "#fff", color: "#3a3f9e" }} onClick={open} disabled={busy}>{busy ? <Loader2 className="p2-spin" /> : t("plus2.gift.open")}</button>
        ) : null}
      />
      {viewer === "sender" ? <div className="p2-row p2-small p2-muted"><span className="p2-gif-live" />{t(statusKey, { hours: 24 })}</div> : null}
      <ErrorLine code={err} />
    </div>
  );
}

export default function GiftTracker({ giftId, onClose }) {
  const t = useT();
  const { locale } = useLocale() || {};
  const { hub } = usePlus({ load: "hub" });
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);
  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("09:00");
  const gift = [...(hub?.gifts?.sent || []), ...(hub?.gifts?.received || [])].find((g) => g.id === giftId) || null;
  const steps = giftSteps(gift);
  const fmt = (v) => (v ? formatDate(v, locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");
  const run = async (key, fn) => {
    setBusy(key);
    setErr(null);
    try {
      await fn();
      await refreshHub();
    } catch (e) {
      setErr(errorKey(e?.code));
    } finally {
      setBusy(null);
    }
  };
  return (
    <PlusWindow title={t("plus2.track.title")} onClose={onClose} size="narrow">
      {!gift ? <div className="p2-empty">{hub ? t("plus2.track.missing") : <Loader2 className="p2-spin" />}</div> : (
        <div className="p2-ck">
          <GiftCardVisual gift={gift} viewer={gift.direction === "sent" ? "sender" : "recipient"} />
          <ul className="p2-steps">
            {steps.map((s) => (
              <li key={s.key} className={s.done ? "is-done" : ""}>
                <span className="p2-box">{s.done ? <Check size={13} /> : null}</span>
                {s.key === "paid" ? t("plus2.track.paid", { amount: gift.amountMinor != null ? formatPrice(gift.amountMinor, gift.currency || "TRY", locale) : "" }) : t(`plus2.track.${s.key}`, { name: gift.to?.displayName || gift.to?.username || "" })}
                <span className="p2-at">{s.at && (s.done || s.key === "delivered") ? fmt(s.at) : ""}</span>
              </li>
            ))}
          </ul>
          {gift.direction === "sent" && (gift.canRecall || gift.canReschedule) ? (
            <>
              <div className="p2-note">{t("plus2.track.rules", { days: hub?.offer?.gifts?.returnDays ?? 30 })}</div>
              {editing ? (
                <div className="p2-row">
                  <input type="date" className="p2-input" value={date} onChange={(e) => setDate(e.target.value)} aria-label={t("plus2.ck.date")} />
                  <input type="time" className="p2-input" style={{ width: 110 }} value={time} onChange={(e) => setTime(e.target.value)} aria-label={t("plus2.ck.time")} />
                  <button type="button" className="p2-btn is-cta is-sm" disabled={!scheduleIso(date, time) || Boolean(busy)} onClick={() => run("date", async () => { await rescheduleGift(gift.id, scheduleIso(date, time)); setEditing(false); })}>{t("plus2.track.save")}</button>
                </div>
              ) : (
                <div className="p2-grid2">
                  <button type="button" className="p2-btn" disabled={!gift.canReschedule || Boolean(busy)} onClick={() => setEditing(true)}><Calendar />{t("plus2.track.changeDate")}</button>
                  <button type="button" className="p2-btn is-danger-soft" disabled={!gift.canRecall || Boolean(busy)} onClick={() => run("recall", () => recallGift(gift.id))}>{busy === "recall" ? <Loader2 className="p2-spin" /> : <Undo2 />}{t("plus2.track.recall")}</button>
                </div>
              )}
            </>
          ) : null}
          {gift.direction === "received" && gift.canOpen ? <GiftCard gift={gift} viewer="recipient" /> : null}
          {gift.status === "returned" && gift.direction === "sent" ? (
            <button type="button" className="p2-btn is-cta" onClick={() => run("open", () => openGift(gift.id))}>{t("plus2.track.useReturned")}</button>
          ) : null}
          <ErrorLine code={err} />
        </div>
      )}
    </PlusWindow>
  );
}
