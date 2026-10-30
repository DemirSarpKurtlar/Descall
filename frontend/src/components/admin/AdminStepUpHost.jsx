/**
 * Yönetici güvenliği (3.2.0): the code prompt for admin changes and the
 * "set up the authenticator app first" gate. Mounted once inside AdminPanel
 * (in-app and the Electron window). lib/adminStepUp.js dispatches the events.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Shield } from "../ui/Icon.jsx";
import Modal from "../ui/Modal.jsx";
import { useT } from "../../context/LocaleContext";
import { adminStepUpRequest } from "../../api/adminHttp";
import { ADMIN_2FA_EVENT, STEP_UP_EVENT, setStepUpToken } from "../../lib/adminStepUp";
import TwoFactorCard from "../settings/TwoFactorCard.jsx";
import "../../styles/two-factor.css";

export function AdminStepUpHost() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const waiters = useRef([]);

  useEffect(() => {
    const onAsk = (e) => {
      e.detail.handled = true;
      waiters.current.push({ resolve: e.detail.resolve, reject: e.detail.reject });
      setCode("");
      setError("");
      setOpen(true);
    };
    window.addEventListener(STEP_UP_EVENT, onAsk);
    return () => window.removeEventListener(STEP_UP_EVENT, onAsk);
  }, []);

  const settle = useCallback((ok, value) => {
    const list = waiters.current.splice(0);
    for (const w of list) (ok ? w.resolve : w.reject)(value);
  }, []);

  const cancel = useCallback(() => {
    setOpen(false);
    settle(false, Object.assign(new Error(t("Cancel")), { code: "STEP_UP_CANCELLED" }));
  }, [settle, t]);

  const submit = async () => {
    const value = code.trim();
    if (!value || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await adminStepUpRequest(value);
      setStepUpToken(res.token, res.expiresInSec || 900);
      setOpen(false);
      settle(true, res.token);
    } catch (err) {
      setError(err?.message || t("tfa.wrongCode"));
      setCode("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={cancel} title={t("tfa.stepUpTitle")} className="tfa-sheet">
      <div className="tfa-body">
        <p className="tfa-lead">{t("tfa.stepUpLead")}</p>
        <input
          className="tfa-code"
          value={code}
          onChange={(e) => setCode(e.target.value.slice(0, 16))}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          placeholder="123456"
          aria-label={t("tfa.codeLabel")}
          spellCheck={false}
        />
        {error ? <p className="tfa-error" role="alert">{error}</p> : null}
        <div className="tfa-row between">
          <button type="button" className="us-link-btn" onClick={cancel}>{t("Cancel")}</button>
          <button type="button" className="us-btn primary" disabled={busy || !code.trim()} onClick={submit}>
            {busy ? t("Loading...") : t("tfa.stepUpConfirm")}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** Full-panel gate until the admin turns the authenticator app on. */
export function useAdmin2faGate() {
  const [required, setRequired] = useState(false);
  useEffect(() => {
    const on = () => setRequired(true);
    window.addEventListener(ADMIN_2FA_EVENT, on);
    return () => window.removeEventListener(ADMIN_2FA_EVENT, on);
  }, []);
  return [required, setRequired];
}

export function Admin2faGate({ onReady }) {
  const t = useT();
  return (
    <div className="tfa-gate">
      <span className="tfa-gate-icon" aria-hidden="true"><Shield size={26} /></span>
      <h2>{t("tfa.adminGateTitle")}</h2>
      <p>{t("tfa.adminGateLead")}</p>
      <div className="tfa-gate-card">
        <TwoFactorCard autoOpenSetup onChanged={onReady} />
      </div>
    </div>
  );
}
