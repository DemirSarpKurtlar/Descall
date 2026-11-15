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
import { Dialog, ReasonField, SetMark, Skel, Switch, Thumb, useFmt, useItemName } from "./ui.jsx";
import { SET_SLOTS, UNDO_MINUTES, reasonOk } from "./shop2Model.js";

const MODES = ["keep", "refund", "swap"];

export default function RecallDialog({ set, onClose, onDone, fail }) {
  const { t, locale } = useLocale();
  const f = useFmt();
  const name = useItemName();
  const [impact, setImpact] = useState(null);
  const [mode, setMode] = useState("keep");
  const [reason, setReason] = useState("");
  const [notifyBuyers, setNotifyBuyers] = useState(true);
  const [pauseGifts, setPauseGifts] = useState(true);
  const [swap, setSwap] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!set) return;
    setMode("keep");
    setReason("");
    setNotifyBuyers(true);
    setPauseGifts(true);
    setSwap(null);
    setImpact(null);
    shop2Api
      .recallImpact(set.key)
      .then(setImpact)
      .catch(() => setImpact({}));
  }, [set]);

  const pieces = useMemo(() => SET_SLOTS.map((s) => set?.pieces?.[s]).filter(Boolean), [set]);
  const I = impact || {};
  // Live numbers for the chosen option (A4 motion 2).
  const notified = notifyBuyers ? Number(I.buyers ?? I.soldSets ?? 0) + (mode === "keep" ? 0 : Number(I.inCart ?? 0)) : 0;
  const refundTotal = mode === "refund" ? Number(I.revenue ?? 0) : 0;
  const ok = reasonOk(reason) && (mode !== "swap" || swap);
  const setName = set ? (typeof set.name === "object" ? set.name[locale] || set.name.tr : set.name) : "";

  const go = async () => {
    setBusy(true);
    try {
      await shop2Api.recallSet(set.key, { mode, reason: reason.trim(), notify: notifyBuyers, pauseGifts, swapItemId: swap });
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
              <dd className="tnum">{t("adminShop2.recall.soldV", { sets: f.n(I.soldSets ?? set?.sold ?? 0), pieces: f.n(I.soldPieces ?? set?.soldPieces ?? 0) })}</dd>
              <dt>{t("adminShop2.recall.collected")}</dt>
              <dd className="tnum">{f.c(I.revenue ?? 0)} D</dd>
              <dt>{t("adminShop2.recall.inCart")}</dt>
              <dd className="tnum">{t("adminShop2.recall.people", { n: f.n(I.inCart ?? 0) })}</dd>
              <dt>{t("adminShop2.recall.giftsOnWay")}</dt>
              <dd className="tnum">{t("adminShop2.recall.gifts", { n: f.n(I.giftsPending ?? 0) })}</dd>
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
        </div>
      ) : null}
      <ReasonField value={reason} onChange={setReason} label={t("adminShop2.recall.reasonLabel")} placeholder={t("adminShop2.recall.reasonPh")} autoFocus testId="as2-recall-reason" />
      <div className="as2-rc-tg">
        <label className="as2-tg">
          <Switch checked={notifyBuyers} onChange={setNotifyBuyers} label={t("adminShop2.recall.notify")} />
          <span>{t("adminShop2.recall.notify")}</span>
        </label>
        <label className="as2-tg">
          <Switch checked={pauseGifts} onChange={setPauseGifts} label={t("adminShop2.recall.pauseGifts")} />
          <span>{t("adminShop2.recall.pauseGifts")}</span>
        </label>
      </div>
      <div className="as2-rc-live tnum" aria-live="polite">
        <span>{t("adminShop2.recall.liveNotified", { n: f.n(notified) })}</span>
        {mode === "refund" ? <span>{t("adminShop2.recall.liveRefund", { total: f.n(refundTotal) })}</span> : null}
        {pauseGifts ? <span>{t("adminShop2.recall.livePaused", { n: f.n(I.giftsPending ?? 0) })}</span> : null}
      </div>
      <p className="as2-info">
        <Undo2 size={15} />
        <span>{t("adminShop2.recall.undoNote", { n: UNDO_MINUTES })}</span>
      </p>
    </Dialog>
  );
}
