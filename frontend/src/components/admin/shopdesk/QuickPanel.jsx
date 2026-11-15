/**
 * Draft A "Hızlı işlem": DesCoin ver / DesCoin al / Hediye, inline in the right rail.
 * The give/take rules are the shared Kullanıcı dosyası ones (dossierModel: parseAmount,
 * walletPreview, canSubmitWallet, buildWalletGrant) and post to the same /descoin/grant.
 * Gifts go to one or more users at once and can be undone from the toast.
 */
import { useEffect, useRef, useState } from "react";
import { adminFetch } from "../../../api/adminHttp";
import { useLocale } from "../../../context/LocaleContext";
import { Coins, Gift, Minus, Plus, Zap } from "../../ui/Icon.jsx";
import { REASON_MAX, buildWalletGrant, canSubmitWallet, parseAmount, walletPreview } from "../dossier/dossierModel.js";
import { AMOUNT_PRESETS, num } from "./shopDeskModel.js";
import { ItemPicker, NewTag, UserPicker, errMsg } from "./ui.jsx";

export async function undoGifts(granted) {
  for (const g of granted || []) {
    await adminFetch(`/shop/gifts/${g.inventoryId}`, { method: "DELETE", body: JSON.stringify({ reason: "undo" }) });
  }
}

export default function QuickPanel({ items, focusSignal = 0, onDone, showToast, initialMode = "give", title }) {
  const { t, locale } = useLocale();
  const [mode, setMode] = useState(initialMode);
  const [user, setUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [amount, setAmount] = useState("500");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [itemId, setItemId] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const userInputRef = useRef(null);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!focusSignal) return;
    rootRef.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
    setTimeout(() => userInputRef.current?.focus(), 120);
  }, [focusSignal]);

  const balance = user?.balance ?? 0;
  const amt = parseAmount(amount);
  const after = walletPreview(balance, mode, amt);
  const walletOk = mode !== "gift" && user && canSubmitWallet({ mode, amount, reason, balance });
  const giftOk = mode === "gift" && users.length > 0 && itemId;

  const submit = async () => {
    if (busy) return;
    setErr("");
    setBusy(true);
    try {
      if (mode === "gift") {
        const r = await adminFetch("/shop/gifts", { method: "POST", body: JSON.stringify({ itemId, userIds: users.map((u) => u.id), message: message.trim() || null }) });
        const item = items.find((it) => it.id === itemId);
        const msg = r.skipped?.length
          ? t("shopDesk.giftSentSkipped", { n: r.granted.length, item: item?.name || "", skipped: r.skipped.length })
          : t("shopDesk.giftSent", { n: r.granted.length, item: item?.name || "" });
        setUsers([]);
        setMessage("");
        onDone?.(msg, r.granted.length ? { label: t("shopDesk.undo"), run: async () => { await undoGifts(r.granted); onDone?.(t("shopDesk.giftUndone")); } } : null);
      } else {
        const res = await adminFetch("/descoin/grant", { method: "POST", body: JSON.stringify({ userId: user.id, ...buildWalletGrant({ mode, amount, reason, message }) }) });
        setUser((u) => (u ? { ...u, balance: res.balance ?? u.balance } : u));
        setReason("");
        setMessage("");
        onDone?.(mode === "give" ? t("shopDesk.coinGiven", { n: num(amt, locale), user: user.username }) : t("shopDesk.coinTaken", { n: num(amt, locale), user: user.username }));
      }
    } catch (e) {
      setErr(errMsg(t, e));
      showToast?.(errMsg(t, e), null, "bad");
    } finally {
      setBusy(false);
    }
  };

  const modes = [
    { id: "give", label: t("shopDesk.qGive"), icon: Plus },
    { id: "take", label: t("shopDesk.qTake"), icon: Minus },
    { id: "gift", label: t("shopDesk.qGift"), icon: Gift },
  ];

  return (
    <section className="sdk-card sdk-quick" ref={rootRef} aria-labelledby="sdk-quick-h" data-testid="sdk-quick">
      <h2 id="sdk-quick-h" className="sdk-card-title">
        <Zap size={20} />
        {title || t("shopDesk.quickTitle")}
      </h2>
      <div className={`sdk-qmodes is-${mode}`} role="tablist" aria-label={t("shopDesk.quickTitle")}>
        {modes.map((m) => (
          <button key={m.id} type="button" role="tab" aria-selected={mode === m.id} className={mode === m.id ? "is-on" : ""} onClick={() => setMode(m.id)}>
            <m.icon size={16} />
            {m.label}
          </button>
        ))}
      </div>

      <div className="sdk-lab">{mode === "gift" ? t("shopDesk.recipients") : t("shopDesk.user")}</div>
      {mode === "gift" ? (
        <UserPicker multi value={users} onChange={setUsers} inputRef={userInputRef} placeholder={t("shopDesk.recipientsPh")} />
      ) : (
        <UserPicker value={user} onChange={setUser} inputRef={userInputRef} />
      )}

      {mode === "gift" ? (
        <>
          <div className="sdk-lab">{t("shopDesk.item")}</div>
          <ItemPicker items={items.filter((it) => it.active || it.availability)} value={itemId} onChange={setItemId} />
          <div className="sdk-lab">{t("shopDesk.giftMessage")}</div>
          <input className="sdk-input" value={message} maxLength={280} onChange={(e) => setMessage(e.target.value)} placeholder={t("shopDesk.giftMessagePh")} />
        </>
      ) : (
        <>
          <div className="sdk-lab">{t("shopDesk.amount")}</div>
          <label className="sdk-amount">
            <input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))} aria-label={t("shopDesk.amount")} className="tnum" />
            <span>DesCoin</span>
          </label>
          <div className="sdk-presets" role="group" aria-label={t("shopDesk.amountPresets")}>
            {AMOUNT_PRESETS.map((p) => (
              <button key={p} type="button" className={amt === p ? "is-on" : ""} aria-pressed={amt === p} aria-label={`${num(p, locale)} DesCoin`} onClick={() => setAmount(String(p))}>
                {num(p, locale)}
              </button>
            ))}
          </div>
          <div className="sdk-lab">{t("shopDesk.internalReason")}</div>
          <input className="sdk-input" value={reason} maxLength={REASON_MAX} onChange={(e) => setReason(e.target.value)} placeholder={t("shopDesk.internalReasonPh")} />
          {mode === "give" ? (
            <>
              <div className="sdk-lab">{t("shopDesk.recipientMessage")}</div>
              <input className="sdk-input" value={message} maxLength={280} onChange={(e) => setMessage(e.target.value)} placeholder={t("shopDesk.recipientMessagePh")} />
            </>
          ) : null}
          {user ? (
            <div className={`sdk-newbal${after == null ? " is-bad" : ""}`}>
              <span>
                {t("shopDesk.newBalance")} <NewTag />
              </span>
              <b className="tnum">{after == null ? t("shopDesk.notEnough") : `${num(balance, locale)} → ${num(after, locale)} DC`}</b>
            </div>
          ) : null}
        </>
      )}

      {err ? (
        <p className="sdk-err" role="alert">
          {err}
        </p>
      ) : null}
      <button
        type="button"
        className={`sdk-qsubmit is-${mode}`}
        disabled={busy || !(mode === "gift" ? giftOk : walletOk)}
        onClick={submit}
        data-testid="sdk-quick-submit"
      >
        {mode === "gift" ? <Gift size={18} /> : <Coins size={18} />}
        {busy
          ? t("shopDesk.working")
          : mode === "gift"
            ? users.length > 1
              ? t("shopDesk.giftToN", { n: users.length })
              : t("shopDesk.giftSend")
            : mode === "give"
              ? t("shopDesk.giveN", { n: amt ? num(amt, locale) : "" })
              : t("shopDesk.takeN", { n: amt ? num(amt, locale) : "" })}
      </button>
    </section>
  );
}
