import { ArrowLeft } from "lucide-react";
import { useT } from "../../context/localeContextInstance";
import { isEligibleBirthDate } from "../../lib/age";
import BirthDateInput from "./BirthDateInput";
import TermsConsent from "./TermsConsent";

const HINTS = {
  apple: "No Descall account is linked to this Apple ID yet. Enter your date of birth and accept the Terms to create one.",
  google: "No Descall account is linked to this Google account yet. Enter your date of birth and accept the Terms to create one.",
};

/**
 * Sign in with Apple / Google for an account that doesn't exist yet: the backend
 * answered `<provider>_signup_required` and created nothing. The user enters a date
 * of birth (under-13 is blocked) and accepts the Terms here; `onSubmit` then re-sends
 * the same provider credential with termsAccepted + birthDate.
 *
 * variant "app" = AuthView card (Electron / native / app shell), "marketing" = site modal.
 */
export default function SocialSignupStep({
  provider,
  birthDate,
  onBirthDateChange,
  termsAccepted,
  onTermsChange,
  onOpenLegal,
  error,
  busy = false,
  onSubmit,
  onBack,
  variant = "app",
}) {
  const t = useT();
  const ready = termsAccepted && isEligibleBirthDate(birthDate);
  const isApp = variant === "app";
  const idPrefix = `${isApp ? "auth" : "mkt"}-${provider}-signup`;

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!ready || busy) return;
    onSubmit?.();
  };

  return (
    <form
      onSubmit={handleSubmit}
      className={isApp ? `auth-form auth-social-signup auth-${provider}-signup` : `mkt-social-signup mkt-${provider}-signup`}
      data-provider={provider}
    >
      <p className={isApp ? "auth-field-hint" : "mkt-auth-field-hint"}>{t(HINTS[provider] || HINTS.google)}</p>
      <BirthDateInput
        idPrefix={`${idPrefix}-birth`}
        value={birthDate}
        onChange={onBirthDateChange}
        variant={isApp ? "app" : "marketing"}
      />
      <TermsConsent
        id={`${idPrefix}-terms-checkbox`}
        checked={termsAccepted}
        onChange={onTermsChange}
        onOpenLegal={onOpenLegal}
      />

      {error && (isApp ? <p className="error-message">{error}</p> : <div className="auth-error">{error}</div>)}

      <button type="submit" className={isApp ? "auth-submit" : undefined} disabled={busy || !ready}>
        {busy ? <span>{t("Please wait...")}</span> : <span>{t("Create Account")}</span>}
      </button>

      <button type="button" className={isApp ? "auth-tab auth-back-btn" : "auth-switch"} onClick={onBack}>
        <ArrowLeft size={isApp ? 16 : 14} />
        <span>{t("Back to login")}</span>
      </button>
    </form>
  );
}
