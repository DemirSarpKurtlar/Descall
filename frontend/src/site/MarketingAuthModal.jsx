import { useEffect, useState, lazy, Suspense } from "react";
import { createPortal } from "react-dom";
import { useT } from "../context/localeContextInstance";
import { peekInviteRef } from "../lib/referral";
import { Funnel } from "./analytics";
import BirthDateInput from "../components/auth/BirthDateInput";
import { DEVICE_SIGNUP_BLOCK_MESSAGE, isEligibleBirthDate, noteUnder13BirthDate, under13SignupBlocked } from "../lib/age";
import { isSocialSignupRequired } from "../api/auth";
import SocialSignupStep from "../components/auth/SocialSignupStep";

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

function AuthModal({
  open,
  onClose,
  onLogin,
  onRegister,
  onGoogleLogin,
  onVerify2fa,
  authLoading,
  authError,
  initialMode = "login",
  authSource = "modal",
  inviteRef = "",
}) {
  const t = useT();
  const [isRegistering, setIsRegistering] = useState(initialMode === "register");
  const [forgotMode, setForgotMode] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [birthDate, setBirthDate] = useState("");
  const [deviceBlock, setDeviceBlock] = useState("");
  const signupBlocked = isRegistering && (!termsAccepted || !isEligibleBirthDate(birthDate) || under13SignupBlocked());
  const [legalModal, setLegalModal] = useState(null);

  const [twoFa, setTwoFa] = useState(null);
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [twoFaError, setTwoFaError] = useState("");
  // New Google account (also from "Sign in"): the backend created nothing and wants
  // Terms + date of birth first. { provider: "google", credential }.
  const [socialSignup, setSocialSignup] = useState(null);

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
        const result = await onLogin?.({ username, password });
        if (result?.requires2fa) {
          setTwoFa({ pendingToken: result.pendingToken, emailHint: result.emailHint });
          setCode("");
          setTwoFaError("");
        }
      }
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
      setTwoFaError(err?.message || t("Incorrect code."));
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
            <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
              <IconClose />
            </button>
            {twoFa ? (
              <>
                <h2>{t("Two-Factor Verification")}</h2>
                <p>{t("Enter the code we sent to {email}", { email: twoFa.emailHint || t("your email") })}</p>
                {(twoFaError || authError) && <div className="auth-error">{twoFaError || authError}</div>}
                <form onSubmit={submitCode}>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder={t("Verification code")}
                    maxLength={8}
                    autoFocus
                    required
                  />
                  <button type="submit" disabled={verifying || !code.trim()}>
                    {verifying ? t("Please wait...") : t("Verify")}
                  </button>
                </form>
                <button
                  type="button"
                  className="auth-switch"
                  onClick={() => {
                    setTwoFa(null);
                    setCode("");
                    setTwoFaError("");
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
              <>
                <h2>{isRegistering ? t("Create Account") : t("Welcome Back")}</h2>
                <p>
                  {isRegistering
                    ? inviteRef
                      ? t("Join {name} on Descall — free chat, voice, and calls.", { name: inviteRef })
                      : t("Join Descall today")
                    : t("Sign in to your account")}
                </p>
                {inviteRef && isRegistering && (
                  <div className="mkt-invite-banner" role="status">
                    {t("Invited by @{username}", { username: inviteRef })}
                  </div>
                )}
                {(authError || deviceBlock) && <div className="auth-error">{authError || deviceBlock}</div>}
                <Suspense fallback={null}>
                  <GoogleSignInButton
                  disabled={isSubmitting || authLoading || signupBlocked}
                  onCredential={async (credential) => {
                    if (signupBlocked) return;
                    setIsSubmitting(true);
                    try {
                      await onGoogleLogin?.(credential, withInvite({ termsAccepted: isRegistering, ...(isRegistering ? { birthDate } : {}) }));
                    } catch (err) {
                      if (isSocialSignupRequired(err)) setSocialSignup({ provider: "google", credential });
                      /* other errors: authError shows them */
                    } finally {
                      setIsSubmitting(false);
                    }
                  }}
                />
                </Suspense>
                {isRegistering && (
                  <p className="mkt-auth-field-hint mkt-auth-google-hint">
                    {t("Fastest path: continue with Google, then you’re in.")}
                  </p>
                )}
                <div className="mkt-auth-divider" aria-hidden>
                  <span>{t("or")}</span>
                </div>
                <form onSubmit={submit}>
                  <input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder={t("Username")}
                    autoComplete="username"
                    required
                  />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t("Password")}
                    autoComplete={isRegistering ? "new-password" : "current-password"}
                    required
                  />
                  {!isRegistering && (
                    <div className="mkt-forgot-row">
                      <button type="button" className="mkt-forgot-link" onClick={() => setForgotMode(true)}>
                        {t("Forgot your password?")}
                      </button>
                    </div>
                  )}
                  {isRegistering && (
                    <BirthDateInput idPrefix="mkt-birth" value={birthDate} onChange={setBirthDate} variant="marketing" />
                  )}
                  {isRegistering && (
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder={t("Email (optional)")}
                      autoComplete="email"
                      maxLength={254}
                    />
                  )}
                  {isRegistering && (
                    <p className="mkt-auth-field-hint">
                      {t(
                        "Adding an email unlocks account recovery, sign-in codes, and two-factor authentication. You can also add it later in Settings."
                      )}
                    </p>
                  )}
                  {isRegistering && (
                    <div className="legal-consent">
                      <input
                        id="mkt-auth-terms-checkbox"
                        type="checkbox"
                        checked={termsAccepted}
                        onChange={(e) => setTermsAccepted(e.target.checked)}
                      />
                      <label htmlFor="mkt-auth-terms-checkbox">
                        {t("I have read and agree to the")}{" "}
                        <button type="button" className="legal-consent-link" onClick={() => setLegalModal("terms")}>
                          {t("Terms of Service")}
                        </button>{" "}
                        {t("and")}{" "}
                        <button type="button" className="legal-consent-link" onClick={() => setLegalModal("privacy")}>
                          {t("Privacy Policy")}
                        </button>
                        .
                        <span className="legal-consent-note">
                          {t("Descall has zero tolerance for objectionable content and abusive users.")}
                        </span>
                      </label>
                    </div>
                  )}
                  <button
                    type="submit"
                    disabled={isSubmitting || authLoading || signupBlocked}
                  >
                    {isRegistering ? t("Create Account") : t("Sign In")}
                  </button>
                </form>
                <button
                  type="button"
                  className="auth-switch"
                  onClick={() => setIsRegistering((v) => !v)}
                >
                  {isRegistering ? t("Already have an account? Sign in") : t("Need an account? Register")}
                </button>
              </>
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
