/**
 * Draft B "Bakiye düzeltme penceresi". Three ways to close a gap:
 *   balance_to_ledger  the balance becomes the ledger sum (the ledger is right)
 *   ledger_to_balance  one reconcile_adjust ledger row, the balance stays
 *   note               nothing changes, the decision is logged
 * Right side: the latest ledger rows with the row where the chain breaks highlighted, the
 * off-ledger change, and the account card (user file, wallet freeze via the shared dialog).
 */
import { useEffect, useState } from "react";
import { adminFetch } from "../../../api/adminHttp";
import { useLocale } from "../../../context/LocaleContext";
import GlassCheckbox from "../../ui/GlassCheckbox";
import { AlertTriangle, ExternalLink, Scale, Snowflake, User } from "../../ui/Icon.jsx";
import DossierDialog, { DialogActions, DialogError } from "../dossier/DossierDialog.jsx";
import { FIX_MODES, accountDays, fixPlan, num, signed } from "./shopDeskModel.js";
import { NewTag, Skel, errMsg } from "./ui.jsx";

export default function ReconcileFixDialog({ open, mismatch, run, onClose, onDone, openPerson, openUserAction }) {
  const { t, locale } = useLocale();
  const [info, setInfo] = useState(null);
  const [loadErr, setLoadErr] = useState("");
  const [mode, setMode] = useState("balance_to_ledger");
  const [reason, setReason] = useState("");
  const [recheck, setRecheck] = useState(true);
  const [notify, setNotify] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const userId = mismatch?.user_id;

  useEffect(() => {
    if (!open || !userId) return undefined;
    let stop = false;
    setInfo(null);
    setLoadErr("");
    setMode("balance_to_ledger");
    setReason("");
    setErr("");
    setNotify(false);
    adminFetch(`/descoin/users/${userId}/reconcile`)
      .then((d) => !stop && setInfo(d))
      .catch((e) => !stop && setLoadErr(errMsg(t, e, "shopDesk.loadError")));
    return () => {
      stop = true;
    };
  }, [open, userId, t]);

  const balance = info ? info.balance : mismatch?.balance;
  const ledgerSum = info ? info.ledgerSum : mismatch?.ledger_sum;
  const plan = fixPlan(mode, { balance, ledgerSum });
  const ok = Boolean(info) && plan.ok && reason.trim().length >= 3;
  const user = info?.user || mismatch?.user || { id: userId, username: "" };

  const submit = async () => {
    if (!ok || busy) return;
    setBusy(true);
    setErr("");
    try {
      const r = await adminFetch("/descoin/reconciliation/fix", {
        method: "POST",
        body: JSON.stringify({ userId, mode, reason: reason.trim(), expectedDrift: plan.drift, runId: run?.id || null, notify: notify && mode === "balance_to_ledger" }),
      });
      if (recheck) setInfo(r);
      const msg =
        mode === "note"
          ? t("shopDesk.fixNoted", { user: user.username })
          : r.drift === 0
            ? t("shopDesk.fixClosed", { user: user.username })
            : t("shopDesk.fixStill", { user: user.username, drift: signed(r.drift, locale) });
      onDone?.(msg);
    } catch (e) {
      if (e.status === 409) {
        setErr(t("shopDesk.driftChanged"));
        adminFetch(`/descoin/users/${userId}/reconcile`).then(setInfo).catch(() => {});
      } else setErr(errMsg(t, e));
    } finally {
      setBusy(false);
    }
  };

  const runWhen = run?.started_at ? new Date(run.started_at).toLocaleString(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
  const gap = info?.gap;
  const gapIdx = gap && info?.recent ? info.recent.findIndex((r) => r.at === (gap.kind === "after_last" ? gap.at : gap.to)) : -1;
  const days = accountDays(info?.user?.createdAt);
  const prior = (info?.actions || []).length;
  const submitLabel =
    mode === "balance_to_ledger"
      ? t("shopDesk.fixToLedger", { n: num(plan.balanceAfter, locale) })
      : mode === "ledger_to_balance"
        ? t("shopDesk.fixAddRow", { n: signed(plan.ledgerAmount, locale) })
        : t("shopDesk.fixNoteBtn");

  const fmt = (iso) => new Date(iso).toLocaleString(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  const aside = (
    <div className="sdk-fix-aside">
      <div className="sdk-fix-led-h">
        <span className="dsr-lab">{t("shopDesk.recentLedger")}</span>
        {user.id ? (
          <button type="button" className="sdk-link" onClick={() => openPerson?.(user.id)}>
            {t("shopDesk.all")}
          </button>
        ) : null}
      </div>
      {!info ? (
        <Skel h={260} />
      ) : (
        <div className="sdk-led" role="table" aria-label={t("shopDesk.recentLedger")}>
          <div className="sdk-led-h" role="row">
            <span role="columnheader">{t("shopDesk.col.time")}</span>
            <span role="columnheader">{t("shopDesk.col.reason")}</span>
            <span role="columnheader">{t("shopDesk.col.amount")}</span>
            <span role="columnheader">{t("shopDesk.col.after")}</span>
          </div>
          {info.recent.slice(0, 8).map((r, i) => (
            <div key={r.id} role="row" className={`sdk-led-r${i === gapIdx ? " is-gap" : ""}`}>
              <span role="cell">{fmt(r.at)}</span>
              <code role="cell">{r.reason}</code>
              <b role="cell" className={`tnum ${r.amount >= 0 ? "sdk-green" : "sdk-red"}`}>
                {signed(r.amount, locale)}
              </b>
              <b role="cell" className="tnum">
                {num(r.balanceAfter, locale)}
              </b>
            </div>
          ))}
          {!info.recent.length ? <p className="sdk-muted">{t("shopDesk.noLedger")}</p> : null}
        </div>
      )}
      {gap ? (
        <div className="sdk-alert is-amber is-block">
          <AlertTriangle size={20} />
          <span>
            {gap.kind === "after_last"
              ? t("shopDesk.gapAfter", { at: fmt(gap.at), delta: num(Math.abs(gap.delta), locale), dir: gap.delta < 0 ? t("shopDesk.decreased") : t("shopDesk.increased") })
              : t("shopDesk.gapBetween", { from: fmt(gap.from), to: fmt(gap.to), delta: num(Math.abs(gap.delta), locale), dir: gap.delta < 0 ? t("shopDesk.decreased") : t("shopDesk.increased") })}
          </span>
        </div>
      ) : null}
      <div className="sdk-acct">
        <b>
          <User size={18} />
          {user.displayName || user.username}
        </b>
        <dl>
          <dt>{t("shopDesk.account")}</dt>
          <dd>{days == null ? "-" : `${t("shopDesk.nDays", { n: num(days, locale) })} · ${info?.user?.emailVerified ? t("shopDesk.emailVerified") : t("shopDesk.emailNotVerified")}`}</dd>
          <dt>{t("shopDesk.wallet")}</dt>
          <dd>{info?.user?.frozen ? t("shopDesk.walletFrozen") : t("shopDesk.walletOpen")}</dd>
          <dt>{t("shopDesk.priorDrift")}</dt>
          <dd>{prior ? t("shopDesk.priorN", { n: prior }) : t("shopDesk.none")}</dd>
        </dl>
        <div className="sdk-row2">
          <button type="button" className="sdk-btn" onClick={() => openPerson?.(user.id)}>
            <ExternalLink size={16} />
            {t("shopDesk.userFile")}
          </button>
          <button type="button" className="sdk-btn" onClick={() => openUserAction?.("freeze", { id: user.id, username: user.username, displayName: user.displayName })}>
            <Snowflake size={16} />
            {info?.user?.frozen ? t("shopDesk.unfreezeWallet") : t("shopDesk.freezeWallet")}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <DossierDialog
      open={open}
      onClose={onClose}
      busy={busy}
      icon={Scale}
      tone="amber"
      title={t("shopDesk.fixTitle", { user: user.username ? `@${user.username}` : "" })}
      subtitle={
        <>
          {t("shopDesk.fixSub", { when: runWhen, drift: signed(mismatch?.drift ?? 0, locale) })} <NewTag />
        </>
      }
      aside={aside}
      width={860}
      testId="sdk-fix-dialog"
    >
      {loadErr ? <p className="dsr-err">{loadErr}</p> : null}
      <div className="sdk-fix-tiles">
        <div>
          <b className="tnum">{num(balance, locale)}</b>
          <small>{t("shopDesk.col.balance")}</small>
        </div>
        <div>
          <b className="tnum">{num(ledgerSum, locale)}</b>
          <small>{t("shopDesk.ledgerTotal")}</small>
        </div>
        <div>
          <b className={`tnum ${plan.drift < 0 ? "sdk-red" : plan.drift > 0 ? "sdk-amber" : "sdk-green"}`}>{signed(plan.drift, locale)}</b>
          <small>{t("shopDesk.col.drift")}</small>
        </div>
      </div>
      <div className="dsr-field">
        <div className="dsr-lab">{t("shopDesk.howFix")}</div>
        <div className="sdk-radios" role="radiogroup" aria-label={t("shopDesk.howFix")}>
          {FIX_MODES.map((m) => (
            <label key={m} className={`sdk-radio${mode === m ? " is-on" : ""}`}>
              <input type="radio" name="sdk-fix-mode" value={m} checked={mode === m} onChange={() => setMode(m)} />
              <span className="sdk-radio-dot" aria-hidden="true" />
              <span>
                <b>{t(`shopDesk.fm.${m}`)}</b>
                <small>
                  {m === "balance_to_ledger"
                    ? t("shopDesk.fmd.balance_to_ledger", { from: num(balance, locale), to: num(ledgerSum, locale) })
                    : m === "ledger_to_balance"
                      ? t("shopDesk.fmd.ledger_to_balance", { from: num(balance, locale), n: signed(plan.drift, locale) })
                      : t("shopDesk.fmd.note")}
                </small>
              </span>
            </label>
          ))}
        </div>
      </div>
      <label className="dsr-field">
        <span className="dsr-lab">{t("shopDesk.reasonRequired")}</span>
        <textarea className="sdk-input sdk-textarea" rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("shopDesk.fixReasonPh")} data-autofocus />
      </label>
      <label className="sdk-checkline">
        <GlassCheckbox checked={recheck} onChange={(e) => setRecheck(e.target.checked)} />
        {t("shopDesk.recheckAfter")}
      </label>
      <label className={`sdk-checkline${mode !== "balance_to_ledger" ? " is-off" : ""}`}>
        <GlassCheckbox checked={notify && mode === "balance_to_ledger"} disabled={mode !== "balance_to_ledger"} onChange={(e) => setNotify(e.target.checked)} />
        {t("shopDesk.notifyUser")}
      </label>
      <DialogError text={err} />
      <DialogActions onCancel={onClose} cancelLabel={t("shopDesk.cancel")} busy={busy} disabled={!ok} onSubmit={submit} submitLabel={busy ? t("shopDesk.working") : submitLabel} icon={Scale} tone={mode === "note" ? "primary" : "amber"} />
    </DossierDialog>
  );
}
