import { useEffect, useState } from "react";
import { useT } from "../../context/localeContextInstance";
import { resend2faCode } from "../../api/auth";
import { serverMessage } from "../../i18n/serverText.js";

const COOLDOWN_SEC = 60;

/**
 * "Resend code" for an e-mail sign-in code (two-factor step of AuthView and the web
 * sign-in modal). Counts down from a minute, because the code was just sent.
 */
export default function TwoFaResendButton({ pendingToken, className = "", onSent, onError }) {
  const t = useT();
  const [left, setLeft] = useState(COOLDOWN_SEC);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (left <= 0) return undefined;
    const id = window.setTimeout(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearTimeout(id);
  }, [left]);

  const resend = async () => {
    if (busy || left > 0 || !pendingToken) return;
    setBusy(true);
    try {
      await resend2faCode(pendingToken);
      setLeft(COOLDOWN_SEC);
      onSent?.(t("authx.login.codeResent"));
    } catch (err) {
      if (err?.body?.code === "cooldown") setLeft(COOLDOWN_SEC);
      onError?.(serverMessage(err?.body, "error", t) || (err?.message ? t(err.message) : t("Could not send reset code.")));
    } finally {
      setBusy(false);
    }
  };

  return (
    <button type="button" className={className} onClick={resend} disabled={busy || left > 0} aria-live="polite">
      {left > 0 ? t("authx.login.resendIn", { seconds: left }) : t("Resend code")}
    </button>
  );
}
