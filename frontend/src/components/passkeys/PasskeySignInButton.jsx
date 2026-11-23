/**
 * "Passkey ile giriş yap" on the sign-in screens (AuthView: apps and desktop, MarketingAuthModal:
 * the web site). Hidden where passkeys cannot work (lib/passkeys isAvailable). The password form
 * stays next to it: a passkey is an extra, faster way in, never the only one.
 *
 * onSignedIn(body)  the POST /login-shaped body: { token, user } or { requires2fa, pendingToken, ... }
 * onError(err)      server refusals the parent already knows how to show (ban, access ban,
 *                   under-13, maintenance); passkey problems are shown here, under the button.
 *
 * Desktop (Electron, old Windows): the ceremony runs in the default browser; the button area
 * shows the 4-digit match code, "open the page again" and cancel while the app waits.
 *
 * Styles: styles/passkeys.css (.pk-signin*), easy to restyle once the owner picks a draft.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { KeyRound, X } from "../ui/Icon.jsx";
import { useT } from "../../context/LocaleContext";
import { isAvailable, signIn, normalizePasskeyError, isSilentPasskeyError, passkeyErrorKey } from "../../lib/passkeys/index.js";
import "../../styles/passkeys.css";

/** Server codes the passkey UI explains itself; anything else goes to the parent. */
const INLINE_SERVER_CODES = new Set([
  "UV_REQUIRED",
  "UNKNOWN_CREDENTIAL",
  "CLONED",
  "SUSPENDED",
  "PASSKEYS_UNAVAILABLE",
  "PASSKEYS_DISABLED",
  "CHALLENGE_EXPIRED",
  "CHALLENGE_MISMATCH",
  "VERIFY_FAILED",
  "BAD_RESPONSE",
  "BAD_ORIGIN",
  "REPLAY",
  "HANDOFF_EXPIRED",
  "HANDOFF_USED",
]);

export function passkeyErrorForParent(err) {
  const e = normalizePasskeyError(err);
  return e.code === "server" && e.status !== 429 && !INLINE_SERVER_CODES.has(String(e.serverCode || ""));
}

export function usePasskeyAvailability() {
  const [state, setState] = useState({ available: false, path: null, conditional: false, checked: false });
  useEffect(() => {
    let alive = true;
    isAvailable()
      .then((r) => alive && setState({ ...r, checked: true }))
      .catch(() => alive && setState({ available: false, path: null, conditional: false, checked: true }));
    return () => {
      alive = false;
    };
  }, []);
  return state;
}

export default function PasskeySignInButton({ onSignedIn, onError, disabled = false, className = "" }) {
  const t = useT();
  const avail = usePasskeyAvailability();
  const [busy, setBusy] = useState(false);
  const [handoff, setHandoff] = useState(null);
  const [error, setError] = useState("");
  const ctlRef = useRef(null);

  useEffect(() => () => ctlRef.current?.abort(), []);

  const start = useCallback(async () => {
    if (busy || disabled) return;
    const ctl = new AbortController();
    ctlRef.current = ctl;
    setBusy(true);
    setError("");
    setHandoff(null);
    try {
      const body = await signIn({ signal: ctl.signal, onHandoff: (h) => setHandoff(h) });
      await onSignedIn?.(body);
    } catch (err) {
      const e = normalizePasskeyError(err);
      if (ctl.signal.aborted || isSilentPasskeyError(e)) return;
      if (passkeyErrorForParent(e)) {
        onError?.(e.cause || e);
        return;
      }
      const key = passkeyErrorKey(e);
      if (key) setError(t(key));
    } finally {
      if (ctlRef.current === ctl) ctlRef.current = null;
      setBusy(false);
      setHandoff(null);
    }
  }, [busy, disabled, onSignedIn, onError, t]);

  const cancel = () => ctlRef.current?.abort();

  if (!avail.available) return null;

  return (
    <div className={`pk-signin ${className}`.trim()} data-path={avail.path}>
      <button type="button" className="pk-signin-btn" onClick={start} disabled={disabled || busy} aria-busy={busy || undefined}>
        <KeyRound size={18} weight="bold" aria-hidden="true" />
        <span>{busy && !handoff ? t("passkey.signIn.busy") : t("passkey.signIn.button")}</span>
      </button>
      {handoff ? (
        <div className="pk-handoff" role="status" aria-live="polite">
          <p className="pk-handoff-title">{t("passkey.signIn.handoffTitle")}</p>
          <p className="pk-handoff-lead">{t("passkey.signIn.handoffLead", { code: handoff.matchCode })}</p>
          <div className="pk-handoff-code tnum" aria-hidden="true">{handoff.matchCode}</div>
          <div className="pk-row">
            <button type="button" className="pk-link" onClick={() => handoff.reopen?.()}>
              {t("passkey.signIn.handoffReopen")}
            </button>
            <button type="button" className="pk-link" onClick={cancel}>
              <X size={14} aria-hidden="true" /> {t("passkey.signIn.cancel")}
            </button>
          </div>
        </div>
      ) : null}
      {error ? (
        <p className="pk-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
