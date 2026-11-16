/**
 * Seti geri çağır (Draft A frame A4): what was sold, who has it in the cart, gifts on the
 * way; three choices for buyers (keep it, DesCoin refund, swap the faulty piece), a
 * required reason (goes to the audit trail), notify buyers, pause gifts. One click undo
 * for 30 minutes afterwards (sets table row and the toast).
 */
import { useEffect, useMemo, useState } from "react";
import { useLocale } from "../../../context/LocaleContext";
import { RotateCcw, Undo2 } from "../../ui/Icon.jsx";
import { shop2Api } from "./adminShop2Api.js";
import { Dialog, ReasonField, SetMark, Skel, Thumb, useFmt, useItemName } from "./ui.jsx";
import { SET_SLOTS, UNDO_MINUTES, reasonOk } from "./shop2Model.js";

const MODES = ["keep", "refund", "swap"];

export default function RecallDialog({ set, onClose, onDone, fail }) {
  const { t, locale } = useLocale();
  const f = useFmt();
  const name = useItemName();
  const [impact, setImpact] = useState(null);
  const [mode, setMode] = useState("keep");
  const [reason, setReason] = useState("");
  const [swap, setSwap] = useState(null);
  const [swapTo, setSwapTo] = useState(null);
  const [swapList, setSwapList] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!set) return;
    setMode("keep");
    setReason("");
    setSwap(null);
    setSwapTo(null);
    setSwapList([]);
    setImpact(null);
    shop2Api
      .recallImpact(set.key)
      .then(setImpact)
      .catch(() => setImpact({}));
  }, [set]);

  // Replacements: catalog items of the same category as the faulty piece.
  useEffect(() => {
    const from = (set ? SET_SLOTS.map((k) => set.pieces?.[k]) : []).find((p) => p && p.id === swap);
    setSwapTo(null);
    if (!from) {
      setSwapList([]);
      return;
    }
    shop2Api
      .catalogByCategory(from.category)
      .then((list) => setSwapList(list.filter((it) => it.id !== from.id).slice(0, 24)))
      .catch(() => setSwapList([]));
  }, [swap, set]);

  const pieces = useMemo(() => SET_SLOTS.map((s) => set?.pieces?.[s]).filter(Boolean), [set]);
  const I = impact || {};
  // Live numbers for the chosen option (A4 motion 2).
  const notified = Number(I.notify ?? I.buyers ?? 0);
  const refundTotal = mode === "refund" ? Number(I.revenue ?? 0) : 0;
  const ok = reasonOk(reason) && (mode !== "swap" || (swap && swapTo));
  const setName = set ? (typeof set.name === "object" ? set.name[locale] || set.name.tr : set.name) : "";

  const go = async () => {
    setBusy(true);
    try {
      await shop2Api.recallSet(set.key, { mode, reason: reason.trim(), swapFrom: swap, swapTo });
      onDone(set);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={Boolean(set)}
      onClose={onClose}
      busy={busy}
      icon={RotateCcw}
      tone="red"
      title={t("adminShop2.recall.title", { name: setName })}
      subtitle={t("adminShop2.recall.sub")}
      width={680}
      testId="as2-recall-dialog"
      footer={
        <>
          <button type="button" className="as2-btn" onClick={onClose} disabled={busy}>
            {t("adminShop2.cancel")}
          </button>
          <button type="button" className="as2-btn is-danger" onClick={go} disabled={busy || !ok} data-testid="as2-recall-confirm">
            <RotateCcw size={15} />
            {busy ? t("adminShop2.saving") : t("adminShop2.recall.go")}
          </button>
        </>
      }
    >
      <div className="as2-rc-top">
        <span className="as2-rc-art">{set ? <SetMark set={set} size={124} /> : null}</span>
        <dl className="as2-rc-facts">
          {impact == null ? (
            <Skel h={90} r={10} />
          ) : (
            <>
              <dt>{t("adminShop2.recall.sold")}</dt>
              <dd className="tnum">{t("adminShop2.recall.soldV", { sets: f.n(I.purchases ?? 0), pieces: f.n(I.buyers ?? 0) })}</dd>
              <dt>{t("adminShop2.recall.collected")}</dt>
              <dd className="tnum">{f.c(I.revenue ?? 0)} D</dd>
              <dt>{t("adminShop2.recall.inCart")}</dt>
              <dd className="tnum">{t("adminShop2.recall.people", { n: f.n(I.inWishlists ?? 0) })}</dd>
              <dt>{t("adminShop2.recall.giftsOnWay")}</dt>
              <dd className="tnum">{t("adminShop2.recall.gifts", { n: f.n(I.giftsPending ?? 0) })}{I.giftsPendingAmount ? ` · ${f.c(I.giftsPendingAmount)} D` : ""}</dd>
            </>
          )}
        </dl>
      </div>
      <div className="as2-cap">{t("adminShop2.recall.forBuyers")}</div>
      <div className="as2-rc-modes" role="radiogroup" aria-label={t("adminShop2.recall.forBuyers")}>
        {MODES.map((m) => (
          <button key={m} type="button" role="radio" aria-checked={mode === m} className={`as2-rc-mode${mode === m ? " is-on" : ""}`} onClick={() => setMode(m)} data-testid={`as2-recall-mode-${m}`}>
            <b>{t(`adminShop2.recall.mode.${m}.t`)}</b>
            <small>{t(`adminShop2.recall.mode.${m}.d`, { total: f.c(I.revenue ?? 0) })}</small>
          </button>
        ))}
      </div>
      {mode === "swap" ? (
        <div className="as2-rc-swap">
          <small>{t("adminShop2.recall.swapPick")}</small>
          <div className="as2-rc-swap-list">
            {pieces.map((p) => (
              <button key={p.id} type="button" className={swap === p.id ? "is-on" : ""} onClick={() => setSwap(p.id)} aria-pressed={swap === p.id}>
                <Thumb item={p} size={26} />
                <span>{name(p)}</span>
              </button>
            ))}
          </div>
          {swap ? (
            <>
              <small>{t("adminShop2.recall.swapTo")}</small>
              <div className="as2-rc-swap-list">
                {swapList.map((p) => (
                  <button key={p.id} type="button" className={swapTo === p.id ? "is-on" : ""} onClick={() => setSwapTo(p.id)} aria-pressed={swapTo === p.id}>
                    <Thumb item={p} size={26} />
                    <span>{name(p)}</span>
                  </button>
                ))}
                {!swapList.length ? <span className="as2-muted">{t("adminShop2.rack.empty")}</span> : null}
              </div>
            </>
          ) : null}
        </div>
      ) : null}
      <ReasonField value={reason} onChange={setReason} label={t("adminShop2.recall.reasonLabel")} placeholder={t("adminShop2.recall.reasonPh")} autoFocus testId="as2-recall-reason" />
      <div className="as2-rc-live tnum" aria-live="polite">
        <span>{t("adminShop2.recall.liveNotified", { n: f.n(notified) })}</span>
        {mode === "refund" ? <span>{t("adminShop2.recall.liveRefund", { total: f.n(refundTotal) })}</span> : null}
        {I.giftsPending ? <span>{t("adminShop2.recall.livePaused", { n: f.n(I.giftsPending) })}</span> : null}
      </div>
      <p className="as2-info">
        <Undo2 size={15} />
        <span>{t("adminShop2.recall.undoNote", { n: I.undoMinutes || UNDO_MINUTES })}</span>
      </p>
    </Dialog>
  );
}
