/**
 * Ayarlar › Güvenlik › İki adımlı doğrulama (3.2.0).
 * Authenticator app (recommended) with a three-step setup sheet: scan the QR
 * (or type the key) → enter the first code → save the 10 recovery codes.
 * The older e-mail code stays as the second option while the app is off.
 * Admins see that the app is required for Yönetici Paneli and cannot turn it off.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle, Copy, Download, KeyRound, Shield, Smartphone, RefreshCw } from "../ui/Icon.jsx";
import Modal from "../ui/Modal.jsx";
import GlassCheckbox from "../ui/GlassCheckbox.jsx";
import { useT } from "../../context/LocaleContext";
import {
  getTwoFactorStatus,
  startTotpSetup,
  enableTotp,
  disableTotp,
  regenerateRecoveryCodes,
} from "../../api/security";
import { copyText } from "../../lib/copyText";
import "../../styles/two-factor.css";

const onlyDigits = (v) => String(v || "").replace(/\D/g, "").slice(0, 6);

function CodeInput({ value, onChange, autoFocus, allowRecovery = false, label, onSubmit }) {
  return (
    <input
      className="tfa-code"
      value={value}
      onChange={(e) => onChange(allowRecovery ? e.target.value.slice(0, 16) : onlyDigits(e.target.value))}
      onKeyDown={(e) => { if (e.key === "Enter") onSubmit?.(); }}
      inputMode={allowRecovery ? "text" : "numeric"}
      autoComplete="one-time-code"
      autoFocus={autoFocus}
      placeholder={allowRecovery ? "123456 / abcde-fghij" : "123456"}
      aria-label={label}
      spellCheck={false}
    />
  );
}

function RecoveryList({ codes, t }) {
  const [copied, setCopied] = useState(false);
  const text = codes.join("\n");
  const download = () => {
    const blob = new Blob([`Descall ${t("tfa.recoveryTitle")}\n\n${text}\n`], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "descall-yedek-kodlar.txt";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };
  return (
    <div className="tfa-recovery">
      <ol className="tfa-recovery-grid">
        {codes.map((c) => <li key={c} className="tnum">{c}</li>)}
      </ol>
      <div className="tfa-row">
        <button type="button" className="us-btn" onClick={async () => { await copyText(text); setCopied(true); setTimeout(() => setCopied(false), 1800); }}>
          <Copy size={15} /> {copied ? t("tfa.copied") : t("tfa.copyAll")}
        </button>
        <button type="button" className="us-btn" onClick={download}>
          <Download size={15} /> {t("tfa.download")}
        </button>
      </div>
    </div>
  );
}

function SetupSheet({ open, onClose, onDone, t }) {
  const [step, setStep] = useState(0); // 0 scan, 1 code, 2 recovery
  const [setup, setSetup] = useState(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [codes, setCodes] = useState([]);
  const [saved, setSaved] = useState(false);
  const [keyCopied, setKeyCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStep(0); setCode(""); setError(""); setCodes([]); setSaved(false); setSetup(null);
    let alive = true;
    setBusy(true);
    startTotpSetup()
      .then((res) => { if (alive) setSetup(res); })
      .catch((err) => { if (alive) setError(err.message || t("tfa.setupFailed")); })
      .finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; };
  }, [open, t]);

  const confirm = async () => {
    if (code.length !== 6 || busy) return;
    setBusy(true); setError("");
    try {
      const res = await enableTotp(code);
      setCodes(res.recoveryCodes || []);
      setStep(2);
    } catch (err) {
      setError(err.message || t("tfa.wrongCode"));
      setCode("");
    } finally {
      setBusy(false);
    }
  };

  const finish = () => { onDone?.(); onClose?.(); };
  const steps = [t("tfa.stepScan"), t("tfa.stepCode"), t("tfa.stepSave")];

  return (
    <Modal open={open} onClose={step === 2 && !saved ? undefined : onClose} title={t("tfa.setupTitle")} className="tfa-sheet">
      <ol className="tfa-steps" aria-label={t("tfa.setupTitle")}>
        {steps.map((label, i) => (
          <li key={label} className={i === step ? "is-on" : i < step ? "is-done" : ""}>
            <span className="tnum">{i < step ? <CheckCircle size={14} /> : i + 1}</span>{label}
          </li>
        ))}
      </ol>

      {step === 0 ? (
        <div className="tfa-body">
          <p className="tfa-lead">{t("tfa.scanLead")}</p>
          <div className="tfa-qr" aria-label={t("tfa.qrAlt")} role="img">
            {setup?.qrSvg ? <span dangerouslySetInnerHTML={{ __html: setup.qrSvg }} /> : <span className="tfa-qr-wait">{busy ? t("Loading...") : ""}</span>}
          </div>
          {setup?.secret ? (
            <div className="tfa-key">
              <span>{t("tfa.manualKey")}</span>
              <code className="tnum">{setup.secret}</code>
              <button type="button" className="us-link-btn" onClick={async () => { await copyText(setup.secret.replace(/\s/g, "")); setKeyCopied(true); setTimeout(() => setKeyCopied(false), 1600); }}>
                <Copy size={14} /> {keyCopied ? t("tfa.copied") : t("tfa.copy")}
              </button>
            </div>
          ) : null}
          <p className="tfa-hint">{t("tfa.apps")}</p>
          {error ? <p className="tfa-error" role="alert">{error}</p> : null}
          <div className="tfa-row end">
            <button type="button" className="us-btn primary" disabled={!setup} onClick={() => setStep(1)}>{t("tfa.next")}</button>
          </div>
        </div>
      ) : null}

      {step === 1 ? (
        <div className="tfa-body">
          <p className="tfa-lead">{t("tfa.codeLead")}</p>
          <CodeInput value={code} onChange={setCode} autoFocus label={t("tfa.codeLabel")} onSubmit={confirm} />
          {error ? <p className="tfa-error" role="alert">{error}</p> : null}
          <div className="tfa-row between">
            <button type="button" className="us-link-btn" onClick={() => setStep(0)}>{t("tfa.back")}</button>
            <button type="button" className="us-btn primary" disabled={code.length !== 6 || busy} onClick={confirm}>
              {busy ? t("Loading...") : t("tfa.turnOn")}
            </button>
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="tfa-body">
          <p className="tfa-lead">{t("tfa.recoveryLead")}</p>
          <RecoveryList codes={codes} t={t} />
          <label className="tfa-check">
            <GlassCheckbox checked={saved} onChange={(e) => setSaved(e.target.checked)} />
            <span>{t("tfa.savedConfirm")}</span>
          </label>
          <div className="tfa-row end">
            <button type="button" className="us-btn primary" disabled={!saved} onClick={finish}>{t("tfa.done")}</button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}

function CodeSheet({ open, mode, status, onClose, onDone, t }) {
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [codes, setCodes] = useState(null);
  useEffect(() => { if (open) { setCode(""); setPassword(""); setError(""); setCodes(null); } }, [open]);
  const disable = mode === "disable";
  const submit = async () => {
    if (busy || !code.trim()) return;
    setBusy(true); setError("");
    try {
      if (disable) {
        await disableTotp({ code: code.trim(), password: status?.hasPassword ? password : undefined });
        onDone?.(); onClose?.();
      } else {
        const res = await regenerateRecoveryCodes(code.trim());
        setCodes(res.recoveryCodes || []);
        onDone?.();
      }
    } catch (err) {
      setError(err.message || t("tfa.wrongCode"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title={disable ? t("tfa.disableTitle") : t("tfa.regenTitle")} className="tfa-sheet">
      {codes ? (
        <div className="tfa-body">
          <p className="tfa-lead">{t("tfa.regenDone")}</p>
          <RecoveryList codes={codes} t={t} />
          <div className="tfa-row end"><button type="button" className="us-btn primary" onClick={onClose}>{t("tfa.done")}</button></div>
        </div>
      ) : (
        <div className="tfa-body">
          <p className="tfa-lead">{disable ? t("tfa.disableLead") : t("tfa.regenLead")}</p>
          {disable && status?.hasPassword ? (
            <input type="password" className="us-inline-input tfa-pass" placeholder={t("Password")} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          ) : null}
          <CodeInput value={code} onChange={setCode} autoFocus allowRecovery={disable} label={t("tfa.codeLabel")} onSubmit={submit} />
          {error ? <p className="tfa-error" role="alert">{error}</p> : null}
          <div className="tfa-row between">
            <button type="button" className="us-link-btn" onClick={onClose}>{t("Cancel")}</button>
            <button type="button" className={`us-btn ${disable ? "ghost-danger" : "primary"}`} disabled={busy || !code.trim() || (disable && status?.hasPassword && !password)} onClick={submit}>
              {busy ? t("Loading...") : disable ? t("tfa.turnOff") : t("tfa.regenerate")}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/**
 * @param {{ emailRow?: React.ReactNode, onChanged?: () => void, autoOpenSetup?: boolean }} props
 *   emailRow: the existing e-mail-code toggle, shown only while the app is off.
 */
export default function TwoFactorCard({ emailRow = null, onChanged, autoOpenSetup = false }) {
  const t = useT();
  const [status, setStatus] = useState(null);
  const [sheet, setSheet] = useState(autoOpenSetup ? "setup" : null);

  const load = useCallback(() => {
    getTwoFactorStatus().then(setStatus).catch(() => setStatus((s) => s || { totpAvailable: false }));
  }, []);
  useEffect(() => { load(); }, [load]);

  const changed = useCallback(() => { load(); onChanged?.(); }, [load, onChanged]);
  const on = Boolean(status?.totpEnabled);
  const since = useMemo(() => (status?.enabledAt ? new Date(status.enabledAt).toLocaleDateString() : ""), [status?.enabledAt]);
  const low = on && status?.recoveryLeft <= 3;

  return (
    <div className="tfa-card">
      <div className={`tfa-app${on ? " is-on" : ""}`}>
        <span className="tfa-app-icon" aria-hidden="true"><Smartphone size={20} /></span>
        <div className="tfa-app-copy">
          <b>
            {t("tfa.appTitle")}
            {on ? <em className="tfa-pill ok">{t("tfa.on")}</em> : <em className="tfa-pill">{t("tfa.recommended")}</em>}
          </b>
          <span>
            {on
              ? t("tfa.onSub", { date: since, n: status?.recoveryLeft ?? 0 })
              : t("tfa.offSub")}
          </span>
          {low ? <span className="tfa-warn">{t("tfa.lowRecovery", { n: status.recoveryLeft })}</span> : null}
          {status?.adminRequired ? <span className="tfa-admin"><Shield size={13} /> {t("tfa.adminRequired")}</span> : null}
        </div>
        <div className="tfa-app-actions">
          {on ? (
            <>
              <button type="button" className="us-btn" onClick={() => setSheet("regen")}><RefreshCw size={15} /> {t("tfa.newCodes")}</button>
              {status?.adminRequired ? null : (
                <button type="button" className="us-btn ghost-danger" onClick={() => setSheet("disable")}>{t("tfa.turnOff")}</button>
              )}
            </>
          ) : (
            <button type="button" className="us-btn primary" disabled={status && status.totpAvailable === false} onClick={() => setSheet("setup")}>
              <KeyRound size={15} /> {t("tfa.setUp")}
            </button>
          )}
        </div>
      </div>
      {!on && emailRow ? <div className="tfa-email">{emailRow}</div> : null}
      {status && status.totpAvailable === false ? <p className="tfa-hint">{t("tfa.unavailable")}</p> : null}

      <SetupSheet open={sheet === "setup"} onClose={() => setSheet(null)} onDone={changed} t={t} />
      <CodeSheet open={sheet === "disable" || sheet === "regen"} mode={sheet} status={status} onClose={() => setSheet(null)} onDone={changed} t={t} />
    </div>
  );
}
