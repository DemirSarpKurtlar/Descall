import { useState, useEffect, useRef } from "react";
import { Lock, Mail, User, ShieldCheck, ArrowLeft, Eye, EyeOff } from "./ui/Icon.jsx";
import GoogleSignInButton from "./auth/GoogleSignInButton";
import { isGoogleSignInOffered } from "../lib/googleSignInOffer";
import { isNativeIOS } from "../lib/platform";
import AppleSignInButton from "./auth/AppleSignInButton";
import ForgotPasswordFlow from "./auth/ForgotPasswordFlow";
import { useT } from "../context/LocaleContext";
import DescallBrand from "./brand/DescallBrand";
import LegalContentModal from "./legal/LegalContentModal";
import BirthDateInput from "./auth/BirthDateInput";
import TermsConsent from "./auth/TermsConsent";
import SocialSignupStep from "./auth/SocialSignupStep";
import PasswordStrength from "./auth/PasswordStrength";
import { isSocialSignupRequired } from "../api/auth";
import { DEVICE_SIGNUP_BLOCK_MESSAGE, isEligibleBirthDate, noteUnder13BirthDate, under13SignupBlocked } from "../lib/age";
import { peekInviteRef, persistInviteRef, readInviteRefFromLocation } from "../lib/referral";
import { captureVisit } from "../lib/attribution";
import { Funnel } from "../site/analytics";
import { initialAuthMode, isCapacitorNativeShell } from "../lib/entryShell";
import { useGlassUi } from "../hooks/useGlassUi";
import { usePressFeedbackScope } from "../hooks/usePressFeedback";
import { hapticError } from "../lib/fluid/haptics";
import { useMaterialize } from "../hooks/useMaterialize";
import { createValueAnimator } from "../lib/fluid/animator";
import { SPRINGS } from "../lib/fluid/springs";

export default function AuthView({ onLogin, onRegister, onGoogleLogin, onAppleLogin, onVerify2fa, loading, error }) {
  const t = useT();
  const [mode, setMode] = useState(() =>
    typeof window !== "undefined"
      ? initialAuthMode(window.location?.pathname, window.location?.search)
      : "login"
  ); // login | register | forgot
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [birthDate, setBirthDate] = useState("");
  const [legalModal, setLegalModal] = useState(null); // "terms" | "privacy" | null
  const [inviteRef, setInviteRef] = useState(() => peekInviteRef());
  const isElectron = typeof window !== "undefined" && Boolean(window.electronAPI?.isElectron);
  // Native iOS/Android app: this is the standalone entry screen (no web landing),
  // so it scrolls within the safe areas and keeps the legal docs one tap away.
  const isNativeApp = !isElectron && isCapacitorNativeShell();
  // Liquid Glass (iPhone app only, 2.9.151): same features and handlers, the
  // approved mockup layout (logo + tagline above a heavy glass card, legal below).
  const glass = useGlassUi();
  const glassRootRef = useRef(null);
  usePressFeedbackScope(glassRootRef, { enabled: true });
  const card = useMaterialize(true, { appear: true });

  useEffect(() => {
    try {
      captureVisit();
    } catch {
      /* ignore */
    }
    const fromUrl = readInviteRefFromLocation();
    if (fromUrl) {
      persistInviteRef(fromUrl);
      setInviteRef(fromUrl);
      setMode("register");
      Funnel.inviteLanding({ invited_by: fromUrl, path: "native_auth" });
    }
  }, []);

  useEffect(() => {
    if (mode !== "register") return;
    Funnel.registerStart({
      mode: "register",
      source: "native_auth",
      has_invite: Boolean(inviteRef),
    });
  }, [mode, inviteRef]);

  const [twoFa, setTwoFa] = useState(null);
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [twoFaError, setTwoFaError] = useState("");
  useEffect(() => {
    if (error || twoFaError) hapticError();
  }, [error, twoFaError]);
  // Sign in with Apple / Google for an account that doesn't exist yet: the backend
  // answers <provider>_signup_required and the user finishes Terms + date of birth
  // here first. { provider: "apple" | "google", credential }.
  const [socialSignup, setSocialSignup] = useState(null);
  const [socialSigningUp, setSocialSigningUp] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    if (mode !== "register" && !socialSignup) return;
    if (noteUnder13BirthDate(birthDate)) setFormError(t(DEVICE_SIGNUP_BLOCK_MESSAGE));
  }, [birthDate, mode, socialSignup, t]);

  const needsTerms = mode === "register" && (!termsAccepted || !isEligibleBirthDate(birthDate));
  const productTagline = t("Connect with friends through voice, video, and messaging");

  const submit = async (event) => {
    event.preventDefault();
    if (!username.trim() || !password) return;
    if (mode === "login") {
      const result = await onLogin({ username: username.trim(), password });
      if (result?.requires2fa) {
        setTwoFa({ pendingToken: result.pendingToken, emailHint: result.emailHint });
        setCode("");
        setTwoFaError("");
      }
      return;
    }
    if (!termsAccepted || !isEligibleBirthDate(birthDate)) return;
    if (under13SignupBlocked() || noteUnder13BirthDate(birthDate)) {
      setFormError(t(DEVICE_SIGNUP_BLOCK_MESSAGE));
      return;
    }
    const trimmedEmail = email.trim();
    const invitedBy = inviteRef || peekInviteRef();
    await onRegister({
      username: username.trim(),
      password,
      termsAccepted: true,
      birthDate,
      ...(trimmedEmail ? { email: trimmedEmail } : {}),
      ...(invitedBy ? { invitedBy } : {}),
    });
  };

  const submitSocialSignup = async () => {
    if (!socialSignup || socialSigningUp || !termsAccepted || !isEligibleBirthDate(birthDate)) return;
    if (under13SignupBlocked() || noteUnder13BirthDate(birthDate)) {
      setFormError(t(DEVICE_SIGNUP_BLOCK_MESSAGE));
      return;
    }
    setSocialSigningUp(true);
    try {
      const invitedBy = inviteRef || peekInviteRef();
      const finish = socialSignup.provider === "apple" ? onAppleLogin : onGoogleLogin;
      await finish?.(socialSignup.credential, {
        termsAccepted: true,
        birthDate,
        ...(invitedBy ? { invitedBy } : {}),
      });
    } catch {
      /* error prop shows the message; user can go back and retry */
    } finally {
      setSocialSigningUp(false);
    }
  };

  const submitCode = async (event) => {
    event.preventDefault();
    if (!code.trim() || verifying) return;
    setVerifying(true);
    setTwoFaError("");
    try {
      await onVerify2fa(twoFa.pendingToken, code.trim());
    } catch (err) {
      setTwoFaError(err?.message || t("Incorrect code."));
    } finally {
      setVerifying(false);
    }
  };

  const subtitle = twoFa
    ? t("Enter the code we sent to {email}", { email: twoFa.emailHint || t("your email") })
    : socialSignup
      ? t("Finish creating your account")
      : mode === "forgot"
      ? t("Reset your password with a secure email code")
      : productTagline;

  const isLoginOrRegister = !twoFa && !socialSignup && mode !== "forgot";
  const legalFooter = (
    <>
      <p className="auth-footer">
        {t("By continuing, you agree to our Terms of Service")}
      </p>
      {isNativeApp && (
        <nav className="auth-legal-links" aria-label={t("Legal")}>
          <button type="button" className="legal-consent-link" onClick={() => setLegalModal("terms")}>
            {t("Terms of Service")}
          </button>
          <span aria-hidden="true">·</span>
          <button type="button" className="legal-consent-link" onClick={() => setLegalModal("privacy")}>
            {t("Privacy Policy")}
          </button>
        </nav>
      )}
    </>
  );

  const cardBody = (
    <>
      {twoFa ? (
        <form onSubmit={submitCode} className="auth-form">
          <div className="input-wrapper">
            <ShieldCheck className="input-icon" size={20} />
            <input
              id="auth-2fa-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder={t("Verification code")}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              maxLength={8}
              autoFocus
              required
              aria-invalid={twoFaError || error || formError ? "true" : undefined}
              aria-describedby={twoFaError || error || formError ? "auth-2fa-error" : undefined}
            />
          </div>

          {(twoFaError || error || formError) && (
            <p id="auth-2fa-error" className="error-message" role="alert">
              {twoFaError || error || formError}
            </p>
          )}

          <button type="submit" className="auth-submit" disabled={verifying || !code.trim()} aria-busy={verifying}>
            {verifying ? <span>{t("Please wait...")}</span> : <span>{t("Verify")}</span>}
          </button>

          <button
            type="button"
            className="auth-tab auth-back-btn"
            onClick={() => {
              setTwoFa(null);
              setCode("");
              setTwoFaError("");
            }}
          >
            <ArrowLeft size={16} />
            <span>{t("Back to login")}</span>
          </button>
        </form>
      ) : socialSignup ? (
        <SocialSignupStep
          provider={socialSignup.provider}
          birthDate={birthDate}
          onBirthDateChange={setBirthDate}
          termsAccepted={termsAccepted}
          onTermsChange={setTermsAccepted}
          onOpenLegal={setLegalModal}
          error={error}
          busy={loading || socialSigningUp}
          onSubmit={submitSocialSignup}
          onBack={() => setSocialSignup(null)}
        />
      ) : mode === "forgot" ? (
        <ForgotPasswordFlow onBack={() => setMode("login")} />
      ) : (
      <>
      <div
        className={`auth-tabs${glass ? " g-chip g-seg" : " gd-seg"}`}
        role="tablist"
      >
        <SegLens index={mode === "register" ? 1 : 0} />
        <button
          className={`auth-tab ${mode === "login" ? "active" : ""}`}
          onClick={() => setMode("login")}
          type="button"
          role="tab"
          aria-selected={mode === "login"}
        >
          <span>{t("Login")}</span>
        </button>
        <button
          className={`auth-tab ${mode === "register" ? "active" : ""}`}
          onClick={() => setMode("register")}
          type="button"
          role="tab"
          aria-selected={mode === "register"}
        >
          <span>{t("Register")}</span>
        </button>
      </div>

      <AppleSignInButton
        disabled={loading || needsTerms}
        onApple={async (apple) => {
          if (needsTerms) return;
          const invitedBy = inviteRef || peekInviteRef();
          try {
            await onAppleLogin?.(apple, {
              termsAccepted: mode === "register",
              ...(mode === "register" ? { birthDate } : {}),
              ...(invitedBy ? { invitedBy } : {}),
            });
          } catch (err) {
            if (isSocialSignupRequired(err)) {
              setSocialSignup({ provider: "apple", credential: apple });
              return;
            }
            throw err;
          }
        }}
      />
      <GoogleSignInButton
        appearance="glass"
        disabled={loading || needsTerms}
        onCredential={async (credential) => {
          if (needsTerms) return;
          const invitedBy = inviteRef || peekInviteRef();
          try {
            await onGoogleLogin?.(credential, {
              termsAccepted: mode === "register",
              ...(mode === "register" ? { birthDate } : {}),
              ...(invitedBy ? { invitedBy } : {}),
            });
          } catch (err) {
            // New Google account (also from the Login tab): Terms + date of birth first.
            if (isSocialSignupRequired(err)) {
              setSocialSignup({ provider: "google", credential });
              return;
            }
            /* other errors: App shows them via the error prop */
          }
        }}
      />
      {inviteRef && mode === "register" && (
        <p className="auth-field-hint" role="status">
          {t("Invited by @{username}", { username: inviteRef })}
        </p>
      )}

      {(isNativeIOS() || isGoogleSignInOffered()) && (
        <div className="auth-divider" aria-hidden="true">
          <span>{t("or")}</span>
        </div>
      )}

      <form onSubmit={submit} className="auth-form">
        <div className="input-wrapper">
          <User className="input-icon" size={20} />
          <input
            id="auth-username"
            type="text"
            placeholder={t("Username")}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            maxLength={24}
            autoComplete="username"
            required
            aria-invalid={error || formError ? "true" : undefined}
            aria-describedby={error || formError ? "auth-form-error" : undefined}
          />
        </div>

        <div className="input-wrapper has-toggle">
          <Lock className="input-icon" size={20} />
          <input
            id="auth-password"
            type={showPassword ? "text" : "password"}
            placeholder={t("Password")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            maxLength={72}
            autoComplete={mode === "register" ? "new-password" : "current-password"}
            required
            aria-invalid={error || formError ? "true" : undefined}
            aria-describedby={error || formError ? "auth-form-error" : undefined}
          />
          <button
            type="button"
            className="auth-password-toggle"
            onClick={() => setShowPassword((open) => !open)}
            aria-label={showPassword ? t("Hide password") : t("Show password")}
            aria-pressed={showPassword}
            title={showPassword ? t("Hide password") : t("Show password")}
          >
            {showPassword ? <EyeOff size={18} strokeWidth={2} /> : <Eye size={18} strokeWidth={2} />}
          </button>
        </div>
        {mode === "register" ? <PasswordStrength password={password} /> : null}

        {mode === "login" && (
          <div className="auth-forgot-row">
            <button type="button" className="auth-forgot-link" onClick={() => setMode("forgot")}>
              {t("Forgot your password?")}
            </button>
          </div>
        )}

        {mode === "register" && (
          <BirthDateInput idPrefix="auth-birth" value={birthDate} onChange={setBirthDate} />
        )}

        {mode === "register" && (
          <div className="input-wrapper">
            <Mail className="input-icon" size={20} />
            <input
              type="email"
              placeholder={t("Email (optional)")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              maxLength={254}
              autoComplete="email"
            />
          </div>
        )}
        {mode === "register" && (
          <p className="auth-field-hint">
            {t("Adding an email unlocks account recovery, sign-in codes, and two-factor authentication. You can also add it later in Settings.")}
          </p>
        )}

        {mode === "register" && (
          <TermsConsent
            id="auth-terms-checkbox"
            checked={termsAccepted}
            onChange={setTermsAccepted}
            onOpenLegal={setLegalModal}
          />
        )}

        {(error || formError) && (
          <p id="auth-form-error" className="error-message" role="alert">
            {error || formError}
          </p>
        )}

        <button
          type="submit"
          className="auth-submit"
          disabled={loading || !username.trim() || !password || needsTerms}
          aria-busy={loading}
        >
          {loading ? (
            <span>{t("Please wait...")}</span>
          ) : mode === "login" ? (
            <span>{t("Login")}</span>
          ) : (
            <span>{t("Create Account")}</span>
          )}
        </button>
      </form>
      </>
      )}
    </>
  );

  if (glass) {
    return (
      <main ref={glassRootRef} className="g-auth" data-gid="screen">
        <div className="g-ambient" aria-hidden="true" />
        <div className="g-auth-glow" aria-hidden="true" />
        <div className="g-auth-scroll">
          <header className="g-auth-head">
            <DescallBrand compact className="g-auth-mark" />
            <h1 className="g-auth-title" data-gid="title">{t("Descall")}</h1>
            <p className="g-auth-tagline" data-gid="tagline">{subtitle}</p>
          </header>
          <section
            ref={card.ref}
            className="g-glass g-heavy g-materialize g-auth-card"
            data-gid="card"
          >
            {cardBody}
          </section>
          {isLoginOrRegister && <div className="g-auth-legal">{legalFooter}</div>}
        </div>
        <LegalContentModal open={legalModal === "terms"} type="terms" onClose={() => setLegalModal(null)} />
        <LegalContentModal open={legalModal === "privacy"} type="privacy" onClose={() => setLegalModal(null)} />
      </main>
    );
  }

  return (
    <main ref={glassRootRef} className={`gd-auth${isElectron ? " is-electron" : ""}${isNativeApp ? " is-native" : ""}`}>
      <div className="gd-auth-glow" aria-hidden="true" />
      <div className="gd-auth-scroll">
        <header className="gd-auth-head">
          <DescallBrand compact className="gd-auth-mark" />
          <h1 className="gd-auth-title">{t("Descall")}</h1>
          <p className="gd-auth-tagline">{subtitle}</p>
        </header>
        <section className="gd-glass gd-heavy gd-auth-card">
          {cardBody}
        </section>
        {isLoginOrRegister && (
          <footer className="gd-auth-legal">
            <p>{t("By continuing, you agree to our Terms of Service")}</p>
            <p className="gd-auth-links">
              <button type="button" onClick={() => setLegalModal("terms")}>{t("Terms of Service")}</button>
              <span className="gd-dot" aria-hidden="true"> · </span>
              <button type="button" onClick={() => setLegalModal("privacy")}>{t("Privacy Policy")}</button>
              <span className="gd-dot" aria-hidden="true"> · </span>
              <span className="gd-auth-copy">© {new Date().getFullYear()} Demir Sarp Kurtlar</span>
            </p>
          </footer>
        )}
      </div>
      <LegalContentModal open={legalModal === "terms"} type="terms" onClose={() => setLegalModal(null)} />
      <LegalContentModal open={legalModal === "privacy"} type="privacy" onClose={() => setLegalModal(null)} />
    </main>
  );
}

/**
 * Glass segmented-control lens (Giriş / Kayıt ol). Slides on a critically
 * damped spring from wherever it is (interruptible); reduced motion jumps.
 */
function SegLens({ index }) {
  const ref = useRef(null);
  const animRef = useRef(null);
  if (!animRef.current) {
    animRef.current = createValueAnimator(
      index,
      (v) => ref.current?.style.setProperty("--g-seg-x", v.toFixed(4)),
      { scale: 0.001 }
    );
  }
  useEffect(() => {
    const anim = animRef.current;
    let reduced = false;
    try {
      reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      /* ignore */
    }
    if (reduced) anim.set(index);
    else anim.to(index, { preset: SPRINGS.move });
  }, [index]);
  useEffect(() => () => animRef.current?.stop(), []);
  return <span ref={ref} className="g-lens g-seg-lens" aria-hidden="true" style={{ "--g-seg-x": index }} />;
}
