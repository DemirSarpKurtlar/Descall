/**
 * 3.7.17 (owner rule): a new password account needs an email (backend routes/auth.js
 * /register answers 400 EMAIL_REQUIRED / EMAIL_INVALID with the same rule). Existing
 * accounts without one are unchanged. Used by AuthView, MarketingAuthModal and DownloadPage.
 */
export const SIGNUP_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const SIGNUP_EMAIL_HINT =
  "We'll send a code to this email to verify it. It keeps your account safe: recovery, sign-in codes and two-factor authentication.";

/** null when the email can be sent, else the (English) message key to translate. */
export function signupEmailError(raw) {
  const email = String(raw ?? "").trim();
  if (!email) return "Email is required.";
  if (email.length > 254 || !SIGNUP_EMAIL_RE.test(email)) return "Enter a valid email address.";
  return null;
}
