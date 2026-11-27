import { useEffect, useRef, useState, lazy, Suspense } from "react";
import { signupEmailError, SIGNUP_EMAIL_HINT } from "../lib/signupEmail";
import { createPortal } from "react-dom";
import { useT } from "../context/localeContextInstance";
import { peekInviteRef } from "../lib/referral";
import { Funnel } from "./analytics";
import BirthDateInput from "../components/auth/BirthDateInput";
import { DEVICE_SIGNUP_BLOCK_MESSAGE, isEligibleBirthDate, noteUnder13BirthDate, under13SignupBlocked } from "../lib/age";
import { isSocialSignupRequired } from "../api/auth";
import { prewarmHumanCheck } from "../lib/humanCheck/turnstileClient.js";
import { serverMessage } from "../i18n/serverText.js";
import { isGoogleSignInOffered } from "../lib/googleSignInOffer";
import SocialSignupStep from "../components/auth/SocialSignupStep";
import TwoFaResendButton from "../components/auth/TwoFaResendButton";
import GlassCheckbox from "../components/ui/GlassCheckbox";
import useSignupFieldChecks from "../components/auth/useSignupFieldChecks";
import SignupFieldMessage from "../components/auth/SignupFieldMessage";
import PasskeySignInButton, { passkeyErrorForParent } from "../components/passkeys/PasskeySignInButton.jsx";
import usePasskeyAutofill, { PASSKEY_AUTOCOMPLETE } from "../hooks/usePasskeyAutofill";
import { normalizePasskeyError, passkeyErrorKey } from "../lib/passkeys/index.js";

import AdaptiveAuthCard from "../components/auth/adaptive/AdaptiveAuthCard.jsx";
import useLiveSnippets from "../components/auth/adaptive/useLiveSnippets.js";
import { HerePill } from "../components/auth/adaptive/LiveSnippets.jsx";
import "../styles/adaptive-auth.css";

/** "N people are here right now" over the card (live platform count; hidden without data). */
function ModalHerePill() {
  const live = useLiveSnippets();
  return <HerePill data={live} />;
}

function useNarrowModal() {
  const [narrow, setNarrow] = useState(() => {
    try {
      return window.matchMedia("(max-width: 560px)").matches;
    } catch {
      return false;
    }
  });
  useEffect(() => {
    let mq = null;
    try {
      mq = window.matchMedia("(max-width: 560px)");
    } catch {
      return undefined;
    }
    const on = () => setNarrow(mq.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return narrow;
}

const GoogleSignInButton = lazy(() => import("../components/auth/GoogleSignInButton"));
const ForgotPasswordFlow = lazy(() => import("../components/auth/ForgotPasswordFlow"));
const LegalContentModal = lazy(() => import("../components/legal/LegalContentModal"));

function IconClose() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function IconBack() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ verticalAlign: "-2px", marginRight: 4 }}>
      <path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconEye({ off = false }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
      {off ? <path d="M4 4l16 16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /> : null}
    </svg>
  );
}

function AuthModal({
  open,
  onClose,
  onLogin,
  onRegister,
  onGoogleLogin,
  onVerify2fa,
  onPasskeyLogin,
  onPasskeyError,
  authLoading,
  authError: authErrorProp,
  initialMode = "login",
  authSource = "modal",
  inviteRef = "",
}) {
  const t = useT();
  const narrowModal = useNarrowModal();
  const [isRegistering, setIsRegistering] = useState(initialMode === "register");
  const [forgotMode, setForgotMode] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const typingStartRef = useRef(0);
  useEffect(() => {
    if ((username || password) && !typingStartRef.current) typingStartRef.current = Date.now();
    if (!username && !password) typingStartRef.current = 0;
  }, [username, password]);
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [birthDate, setBirthDate] = useState("");
  const [deviceBlock, setDeviceBlock] = useState("");
  const signupBlocked = isRegistering && (!termsAccepted || !isEligibleBirthDate(birthDate) || under13SignupBlocked());
  // Turnstile solves in the background once sign-up typing starts (no wait on submit).
  const signupStarted = Boolean(open && isRegistering && !forgotMode && (username || email || password));
  useEffect(() => {
    if (signupStarted) prewarmHumanCheck("register");
  }, [signupStarted]);
  const [legalModal, setLegalModal] = useState(null);

  // The shell's error stays set after "Back to login" / a mode switch: hide it there
  // until the next attempt sets a new one.
  const [errorDismissed, setErrorDismissed] = useState(false);
  useEffect(() => setErrorDismissed(false), [authErrorProp]);
  const authError = errorDismissed ? "" : authErrorProp;
  const [twoFaInfo, setTwoFaInfo] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [twoFa, setTwoFa] = useState(null);
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [twoFaError, setTwoFaError] = useState("");
  const [useRecovery, setUseRecovery] = useState(false);
  // Password and Google sign-in land here when the account has 2FA (3.2.0).
  const openTwoFa = (result) => {
    if (!result?.requires2fa) return false;
    setTwoFa({ pendingToken: result.pendingToken, emailHint: result.emailHint, method: result.method || "email" });
    setCode("");
    setTwoFaError("");
    setUseRecovery(false);
    return true;
  };
  // New Google account (also from "Sign in"): the backend created nothing and wants
  // Terms + date of birth first. { provider: "google", credential }.
  const [socialSignup, setSocialSignup] = useState(null);
  const [googleUnavailable, setGoogleUnavailable] = useState(false);
  // Passkeys: button + browser autofill on the username field (login only).
  const [pkError, setPkError] = useState("");
  const handlePasskeyBody = async (body) => {
    if (openTwoFa(body)) return;
    setPkError("");
    await onPasskeyLogin?.(body);
  };
  const handlePasskeyError = (err) => {
    if (passkeyErrorForParent(err)) {
      onPasskeyError?.(normalizePasskeyError(err).cause || err);
      return;
    }
    const key = passkeyErrorKey(err);
    if (key) setPkError(t(key));
  };
  usePasskeyAutofill({
    enabled: Boolean(open && !isRegistering && !twoFa && !forgotMode && !socialSignup && onPasskeyLogin),
    onSignedIn: handlePasskeyBody,
    onError: handlePasskeyError,
  });
  // As-you-type checks with the server's rules (lib/signupRules.js), register only.
  const checks = useSignupFieldChecks({ username, password, email, enabled: Boolean(open && isRegistering && !twoFa && !forgotMode) });
  const fieldInvalid = (name) => Boolean(checks.fields[name]?.visible && checks.fields[name]?.message);

  useEffect(() => {
    if (!isRegistering && !socialSignup) return;
    if (noteUnder13BirthDate(birthDate)) setDeviceBlock(t(DEVICE_SIGNUP_BLOCK_MESSAGE));
  }, [birthDate, isRegistering, socialSignup, t]);

  useEffect(() => {
    if (!open) {
      setSocialSignup(null);
      setUsername("");
      setPassword("");
      setEmail("");
      setIsSubmitting(false);
      setTermsAccepted(false);
      setTwoFa(null);
      setCode("");
      setTwoFaError("");
      setForgotMode(false);
      return;
    }
    setIsRegistering(initialMode === "register");
    setForgotMode(false);
    Funnel.registerStart({
      mode: initialMode === "register" ? "register" : "login",
      source: authSource,
      has_invite: Boolean(inviteRef),
      invited_by: inviteRef || undefined,
    });
  }, [open, initialMode, authSource, inviteRef]);

  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // UI audit #127: a real modal. The page behind is inert (no Tab, no
  // screen-reader reading), focus starts on the first field and Tab cycles
  // inside the card.
  const overlayRef = useRef(null);
  useEffect(() => {
    if (!open || typeof document === "undefined") return undefined;
    const overlay = overlayRef.current;
    if (!overlay) return undefined;
    const prevFocus = document.activeElement;
    const madeInert = [];
    for (const el of Array.from(document.body.children)) {
      if (el === overlay || el.contains(overlay) || el.hasAttribute("inert")) continue;
      // The desktop title bar (TitleBar.jsx host) keeps its window buttons over every modal.
      if (el.id === "descall-titlebar-host") continue;
      if (el.tagName === "SCRIPT" || el.tagName === "STYLE") continue;
      el.setAttribute("inert", "");
      madeInert.push(el);
    }
    const focusables = () => Array.from(
      overlay.querySelectorAll('input:not([type="hidden"]):not([disabled]), button:not([disabled]), select, textarea, a[href], [tabindex]:not([tabindex="-1"])'),
    ).filter((el) => el.offsetParent !== null || el === document.activeElement);
    const raf = requestAnimationFrame(() => {
      if (overlay.contains(document.activeElement)) return;
      const first = overlay.querySelector('.login-modal input:not([type="hidden"]):not([disabled])');
      (first || focusables()[0])?.focus?.();
    });
    const onKey = (e) => {
      if (e.key !== "Tab") return;
      const list = focusables();
      if (!list.length) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && (document.activeElement === first || !overlay.contains(document.activeElement))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !overlay.contains(document.activeElement))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKey, true);
      for (const el of madeInert) el.removeAttribute("inert");
      if (prevFocus && typeof prevFocus.focus === "function" && document.contains(prevFocus)) prevFocus.focus();
    };
  }, [open]);

  const withInvite = (payload = {}) => {
    const ref = inviteRef || peekInviteRef();
    if (ref) return { ...payload, invitedBy: ref };
    return payload;
  };

  const submit = async (e) => {
    e.preventDefault();
    if (isSubmitting || authLoading) return;
    if (signupBlocked) return;
    if (isRegistering && (under13SignupBlocked() || noteUnder13BirthDate(birthDate))) {
      setDeviceBlock(t(DEVICE_SIGNUP_BLOCK_MESSAGE));
      return;
    }
    if (isRegistering) {
      checks.touchAll();
      if (checks.hasErrors) {
        const first = ["username", "password", "email"].find((name) => checks.fields[name]?.code);
        if (first) document.getElementById(`mkt-auth-${first}`)?.focus?.();
        return;
      }
      const emailError = signupEmailError(email);
      if (emailError) {
        setDeviceBlock(t(emailError));
        return;
      }
      setDeviceBlock("");
    }
    setIsSubmitting(true);
    try {
      if (isRegistering) {
        const trimmedEmail = email.trim();
        await onRegister?.(
          withInvite({
            username,
            password,
            termsAccepted: true,
            birthDate,
            ...(trimmedEmail ? { email: trimmedEmail } : {}),
          })
        );
      } else {
        const signInMs = typingStartRef.current ? Date.now() - typingStartRef.current : undefined;
        const result = await onLogin?.({ username, password, signInMs });
        openTwoFa(result);
      }
    } catch (err) {
      // authError shows the message; on register the field it is about is marked too.
      if (isRegistering) checks.noteServerError(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitCode = async (e) => {
    e.preventDefault();
    if (!code.trim() || verifying) return;
    setVerifying(true);
    setTwoFaError("");
    try {
      await onVerify2fa?.(twoFa.pendingToken, code.trim());
    } catch (err) {
      setTwoFaError(serverMessage(err?.body, "error", t) || (err?.message ? t(err.message) : t("Incorrect code.")));
    } finally {
      setVerifying(false);
    }
  };

  const submitSocialSignup = async () => {
    if (!socialSignup || isSubmitting || !termsAccepted || !isEligibleBirthDate(birthDate)) return;
    if (under13SignupBlocked() || noteUnder13BirthDate(birthDate)) {
      setDeviceBlock(t(DEVICE_SIGNUP_BLOCK_MESSAGE));
      return;
    }
    setIsSubmitting(true);
    try {
      await onGoogleLogin?.(socialSignup.credential, withInvite({ termsAccepted: true, birthDate }));
    } catch {
      /* authError shows the message; the user can go back and retry Google */
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!open) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
        <div
          ref={overlayRef}
          className="login-modal-overlay"
          onClick={onClose}
          role="presentation"
        >
          <div
            className="login-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={isRegistering ? t("Create account") : t("Sign in")}
          >
            <button type="button" className="modal-close" onClick={onClose} aria-label={t("Close")}>
              <IconClose />
            </button>
            {twoFa ? (
              <>
                <h2>{t("Two-Factor Verification")}</h2>
                <p>
                  {twoFa.method === "totp"
                    ? (useRecovery ? t("Enter one of the recovery codes you saved during setup (e.g. abcde-fghij).") : t("Enter the 6-digit code from your authenticator app."))
                    : t("Enter the code we sent to {email}", { email: twoFa.emailHint || t("your email") })}
                </p>
                {(twoFaError || authError) && (
                  <div id="mkt-auth-2fa-error" className="auth-error" role="alert">
                    {twoFaError || authError}
                  </div>
                )}
                <form onSubmit={submitCode}>
                  <div className="auth-otp">
                    <input
                      id="mkt-auth-2fa"
                      className="auth-otp-input"
                      type="text"
                      inputMode={useRecovery ? "text" : "numeric"}
                      autoComplete="one-time-code"
                      autoCapitalize="off"
                      spellCheck={false}
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      placeholder={useRecovery ? "abcde-fghij" : t("Verification code")}
                      maxLength={useRecovery ? 16 : 8}
                      autoFocus
                      required
                      aria-invalid={twoFaError || authError ? "true" : undefined}
                      aria-describedby={twoFaError || authError ? "mkt-auth-2fa-error" : undefined}
                    />
                    {useRecovery ? null : <div className="auth-otp-cells" aria-hidden="true">
                      {Array.from({ length: 6 }, (_, i) => (
                        <span key={i} className={code.length === i ? "is-on" : ""}>{code[i] || ""}</span>
                      ))}
                    </div>}
                  </div>
                  <button type="submit" disabled={verifying || !code.trim()} aria-busy={verifying}>
                    {verifying ? t("Please wait...") : t("Verify")}
                  </button>
                </form>
                {twoFa.method === "totp" ? (
                  <button type="button" className="auth-switch" onClick={() => { setUseRecovery((v) => !v); setCode(""); setTwoFaError(""); }}>
                    {useRecovery ? t("Use the app code") : t("Use a recovery code")}
                  </button>
                ) : (
                  <>
                    {twoFaInfo ? <p className="auth-field-hint" role="status">{twoFaInfo}</p> : null}
                    <TwoFaResendButton
                      pendingToken={twoFa.pendingToken}
                      className="auth-switch"
                      onSent={(msg) => { setTwoFaError(""); setTwoFaInfo(msg); }}
                      onError={(msg) => { setTwoFaInfo(""); setTwoFaError(msg); }}
                    />
                  </>
                )}
                <button
                  type="button"
                  className="auth-switch"
                  onClick={() => {
                    setTwoFa(null);
                    setCode("");
                    setTwoFaError("");
                    setTwoFaInfo("");
                    setErrorDismissed(true);
                  }}
                >
                  <IconBack />
                  {t("Back to login")}
                </button>
              </>
            ) : socialSignup ? (
              <>
                <h2>{t("Create Account")}</h2>
                <p>{t("Finish creating your account")}</p>
                <SocialSignupStep
                  provider={socialSignup.provider}
                  variant="marketing"
                  birthDate={birthDate}
                  onBirthDateChange={setBirthDate}
                  termsAccepted={termsAccepted}
                  onTermsChange={setTermsAccepted}
                  onOpenLegal={setLegalModal}
                  error={authError}
                  busy={isSubmitting || authLoading}
                  onSubmit={submitSocialSignup}
                  onBack={() => setSocialSignup(null)}
                />
              </>
            ) : forgotMode ? (
              <>
                <h2>{t("Forgot your password?")}</h2>
                <p>{t("Reset your password with a secure email code")}</p>
                <Suspense fallback={null}>
                  <ForgotPasswordFlow variant="modal" onBack={() => setForgotMode(false)} />
                </Suspense>
              </>
            ) : (
              // Uyarlanan kart (growth 1B): one adaptive card for sign-in and sign-up.
              <div className="asu-root asu-modal">
                <header className="asu-head">
                  <span className="asu-head-logo">
                    <img src={`${import.meta.env.BASE_URL}brand/descall-appicon-rounded.svg`} alt="" width={52} height={52} />
                  </span>
                  <h1>{t("Welcome to Descall")}</h1>
                  <ModalHerePill />
                </header>
                <AdaptiveAuthCard
                  intent={isRegistering ? "register" : "login"}
                  surface="modal"
                  compact={narrowModal}
                  onLogin={(payload) => onLogin?.(payload)}
                  onRegister={(payload) => onRegister?.(withInvite(payload))}
                  onGoogle={
                    onGoogleLogin
                      ? async (credential) => {
                          try {
                            openTwoFa(await onGoogleLogin(credential, withInvite({})));
                          } catch (err) {
                            if (isSocialSignupRequired(err)) setSocialSignup({ provider: "google", credential });
                          }
                        }
                      : null
                  }
                  onPasskeyLogin={onPasskeyLogin ? (body) => handlePasskeyBody(body) : null}
                  onPasskeyError={(err) => (passkeyErrorForParent(err) ? onPasskeyError?.(normalizePasskeyError(err).cause || err) : handlePasskeyError(err))}
                  onTwoFa={openTwoFa}
                  loading={authLoading}
                  error={authError || deviceBlock || pkError}
                  onDismissError={() => {
                    setErrorDismissed(true);
                    setDeviceBlock("");
                    setPkError("");
                  }}
                  inviteRef={inviteRef}
                  onOpenLegal={setLegalModal}
                  onRegisterIntent={() =>
                    Funnel.registerStart({ mode: "register", source: authSource, has_invite: Boolean(inviteRef), invited_by: inviteRef || undefined })
                  }
                />
              </div>
            )}
          </div>
          <Suspense fallback={null}>
            <LegalContentModal open={legalModal === "terms"} type="terms" onClose={() => setLegalModal(null)} />
            <LegalContentModal open={legalModal === "privacy"} type="privacy" onClose={() => setLegalModal(null)} />
          </Suspense>
        </div>,
    document.body
  );
}

export default AuthModal;
