"use strict";

const ageGate = require("./ageGate");

/**
 * New accounts from Sign in with Apple / Google always go through the
 * Terms + date-of-birth step, also when the user tapped the button on the
 * Login tab. Nothing is created until the client re-sends the same provider
 * token together with termsAccepted + birthDate.
 *
 * Returns { ok: true, birthDate } or { ok: false, status, body } to send as-is.
 * The 428 message is phrased for older clients that don't know the
 * `<provider>_signup_required` code and simply show `error`.
 */
const SIGNUP_REQUIRED_MESSAGES = {
  apple: "Accept the Terms of Service and enter your date of birth to create your account.",
  google:
    "No Descall account is linked to this Google account yet. Open the Register tab, enter your date of birth and accept the Terms, then continue with Google.",
};

function socialSignupGate(body, provider) {
  const termsAccepted = Boolean(body?.termsAccepted);
  const rawBirthDate = body?.birthDate;
  if (!termsAccepted || !rawBirthDate) {
    return {
      ok: false,
      status: 428,
      body: {
        error: SIGNUP_REQUIRED_MESSAGES[provider] || SIGNUP_REQUIRED_MESSAGES.apple,
        code: `${provider}_signup_required`,
        requiresSignup: true,
      },
    };
  }
  const birth = ageGate.validateBirthDate(rawBirthDate);
  if (!birth.ok) return { ok: false, status: birth.status, body: { error: birth.error, code: birth.code } };
  return { ok: true, birthDate: birth.birthDate };
}

module.exports = { socialSignupGate, SIGNUP_REQUIRED_MESSAGES };
