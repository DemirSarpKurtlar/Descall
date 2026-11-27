/**
 * The second button under "Giris" on the sign-in screens (AuthView: apps and desktop,
 * MarketingAuthModal: the web site), draft A. Its words follow the device: "Face ID ile giris
 * yap" on iPhone, "Parmak iziyle giris yap" on Android, "Windows Hello ile giris yap" in the
 * Windows apps, "Passkey ile giris yap" in a browser. Hidden where passkeys cannot work
 * (lib/passkeys isAvailable). The password form stays next to it.
 *
 * While the ceremony runs, one state card (PasskeyStateCard) sits over the screen: the system
 * window is open, success, cancelled, error, "no passkey on this device" (a phone over QR, a
 * security key, the password). On Electron and old Windows the ceremony runs in the browser
 * and the card shows the 4-digit match code (handoff).
 *
 * onSignedIn(body)  the POST /login-shaped body: { token, user } or { requires2fa, pendingToken, ... }
 * onError(err)      server refusals the parent already knows how to show (ban, access ban,
 *                   under-13, maintenance); passkey problems are shown on the card.
 * onUsePassword()   "Sifreyle gir": the parent focuses its password field.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Fingerprint, KeyRound, ScanFace, WindowsLogo } from "../ui/Icon.jsx";
import { useT } from "../../context/LocaleContext";
import { isAvailable, signIn, prepareSignIn, normalizePasskeyError, isSilentPasskeyError, passkeyErrorKey } from "../../lib/passkeys/index.js";
import { signInStyle, statePlatform, stateForError } from "../../lib/passkeys/visual.js";
import PasskeyStateCard from "./PasskeyStateCard.jsx";
import "../../styles/passkeys.css";
import "../../styles/passkey-center.css";

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

/** How long the success card stays before the app opens. */
const OK_HOLD_MS = 450;

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

const STYLE_ICON = { face: ScanFace, finger: Fingerprint, hello: WindowsLogo, passkey: Fingerprint };

export default function PasskeySignInButton({ onSignedIn, onError, onUsePassword, disabled = false, className = "", showNote = true, label = "" }) {
  const t = useT();
  const avail = usePasskeyAvailability();
  const [busy, setBusy] = useState(false);
  const [card, setCard] = useState(null); // { state, handoff?, detail?, name? }
  const ctlRef = useRef(null);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      ctlRef.current?.abort();
    };
  }, []);

  // Web: options ready before the click (Safari needs a fresh click for the passkey sheet);
  // renewed before the 5 minute challenge expires.
  useEffect(() => {
    if (!avail.available || avail.path !== "web") return undefined;
    let timer = null;
    const prepare = () => {
      prepareSignIn();
      timer = setTimeout(prepare, 4 * 60 * 1000 - 5000);
    };
    prepare();
    return () => clearTimeout(timer);
  }, [avail.available, avail.path]);

  const platform = statePlatform(avail.path);
  const style = signInStyle(avail.path);

  const start = useCallback(
    async (hint) => {
      if (busy || disabled) return;
      const ctl = new AbortController();
      ctlRef.current = ctl;
      setBusy(true);
      setCard({ state: "wait" });
      try {
        const body = await signIn({
          signal: ctl.signal,
          hint: typeof hint === "string" ? hint : undefined,
          onHandoff: (h) => aliveRef.current && setCard({ state: "handoff", handoff: h }),
        });
        if (body?.token) {
          const u = body.user || {};
          setCard({ state: "ok", name: u.displayName || u.display_name || u.username || "" });
          await new Promise((r) => setTimeout(r, OK_HOLD_MS));
        } else {
          setCard(null);
        }
        await onSignedIn?.(body);
        if (aliveRef.current) setCard(null);
      } catch (err) {
        const e = normalizePasskeyError(err);
        if (!aliveRef.current) return;
        if (ctl.signal.aborted || e.code === "aborted") {
          setCard(null);
          return;
        }
        if (passkeyErrorForParent(e)) {
          setCard(null);
          onError?.(e.cause || e);
          return;
        }
        const st = stateForError(e);
        if (!st) {
          setCard(null);
          return;
        }
        const key = isSilentPasskeyError(e) ? null : passkeyErrorKey(e);
        setCard({ state: st, detail: key ? t(key) : "" });
      } finally {
        if (ctlRef.current === ctl) ctlRef.current = null;
        if (aliveRef.current) setBusy(false);
        if (avail.path === "web") prepareSignIn();
      }
    },
    [busy, disabled, onSignedIn, onError, t, avail.path]
  );

  const close = useCallback(() => {
    ctlRef.current?.abort();
    setCard(null);
  }, []);

  useEffect(() => {
    if (!card || card.state === "ok") return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [card, close]);

  if (!avail.available) return null;
  const Icon = STYLE_ICON[style] || KeyRound;
  const usePassword = () => {
    close();
    onUsePassword?.();
  };

  return (
    <div className={`pk-signin ${className}`.trim()} data-path={avail.path} data-style={style}>
      <button type="button" className="pk-signin-btn" onClick={() => start()} disabled={disabled || busy} aria-busy={busy || undefined}>
        <Icon size={18} aria-hidden="true" />
        <span>{label || t(`passkey.login.button.${style}`)}</span>
      </button>
      {showNote && avail.path === "web" ? <p className="pk-signin-note">{t("passkey.login.note")}</p> : null}
      {card && typeof document !== "undefined"
        ? createPortal(
            <div
              className="pkst-layer"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget && card.state !== "ok") close();
              }}
            >
              <PasskeyStateCard
                state={card.state}
                platform={platform}
                name={card.name}
                detail={card.detail}
                handoff={card.handoff}
                compact={avail.path === "ios" || avail.path === "android"}
                onCancel={close}
                onReopen={() => card.handoff?.reopen?.()}
                onRetry={() => {
                  setCard(null);
                  setTimeout(() => start(), 0);
                }}
                onPassword={usePassword}
                onPhone={() => {
                  setCard(null);
                  setTimeout(() => start("hybrid"), 0);
                }}
                onKey={() => {
                  setCard(null);
                  setTimeout(() => start("security-key"), 0);
                }}
              />
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
