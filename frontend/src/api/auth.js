import { API_ROUTES } from "../config/api";
import { httpRequest } from "./http";
import { bootPrefetchOr } from "../lib/bootPrefetch.js";
import { peekAttribution } from "../lib/attribution";
import { pendingSignupInvite } from "../lib/serverInviteRoute";
import { withSignupContext } from "../lib/signupContext";
import { getLocale } from "../i18n/runtime.js";
import { runWithHumanCheck } from "../lib/humanCheck/turnstileClient.js";

/**
 * The app's UI language for the server's emails (sign-in codes, reset codes,
 * security notices): the browser's own Accept-Language can differ from it.
 */
function langHeaders() {
  try {
    const loc = String(getLocale() || "").trim();
    return /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(loc) ? { "Accept-Language": loc } : {};
  } catch {
    return {};
  }
}

function withAttribution(payload = {}) {
  if (payload?.attribution) return payload;
  const attribution = peekAttribution();
  if (!attribution) return payload;
  return { ...payload, attribution };
}

/**
 * The invite landing the visitor signed up from (pending slot in local + session storage,
 * so it survives Google / Apple redirects). The backend only uses it for a new account.
 */
function withSignupInvite(payload = {}) {
  if (payload?.signupInvite) return payload;
  let signupInvite = null;
  try {
    signupInvite = pendingSignupInvite();
  } catch {
    signupInvite = null;
  }
  return signupInvite ? { ...payload, signupInvite } : payload;
}

/** Sign-up: Cloudflare Turnstile token first (lib/humanCheck/turnstileClient.js). */
export function register(payload) {
  const body = withSignupContext(withSignupInvite(withAttribution(payload || {})));
  return runWithHumanCheck("register", (hc) =>
    httpRequest(API_ROUTES.register, {
      method: "POST",
      headers: langHeaders(),
      body: JSON.stringify({ ...body, ...hc }),
    }),
  );
}

/** Sign-in: the human check only when the server asks (after wrong passwords). */
export function login(payload) {
  return runWithHumanCheck(
    "login",
    (hc) =>
      httpRequest(API_ROUTES.login, {
        method: "POST",
        headers: langHeaders(),
        body: JSON.stringify({ ...payload, ...hc }),
      }),
    { always: false },
  );
}

export function verify2faLogin(pendingToken, code) {
  return httpRequest("/auth/2fa/verify-login", {
    method: "POST",
    headers: langHeaders(),
    body: JSON.stringify({ pendingToken, code }),
  });
}

/**
 * Sign in with Apple / Google for an account that doesn't exist yet: the backend
 * created nothing and wants Terms + date of birth first (HTTP 428).
 */
export const SOCIAL_SIGNUP_REQUIRED_CODES = ["apple_signup_required", "apple_username_required", "google_signup_required"];
export function isSocialSignupRequired(error) {
  return SOCIAL_SIGNUP_REQUIRED_CODES.includes(error?.code);
}

export function loginWithGoogle(credential, extra = {}) {
  const payload = withSignupInvite(withAttribution({ credential }));
  if (extra?.invitedBy) payload.invitedBy = extra.invitedBy;
  if (extra?.termsAccepted) payload.termsAccepted = true;
  if (extra?.birthDate) payload.birthDate = extra.birthDate;
  if (extra?.attribution) payload.attribution = extra.attribution;
  const body = withSignupContext(payload);
  // A new account (Terms + date of birth sent) gets the human check; a sign-in does not.
  return runWithHumanCheck(
    "social_signup",
    (hc) =>
      httpRequest(API_ROUTES.google, {
        method: "POST",
        headers: langHeaders(),
        body: JSON.stringify({ ...body, ...hc }),
      }),
    { always: Boolean(extra?.termsAccepted) },
  );
}

/** Sign in with Apple (native iOS). `apple` is the AppleSignIn plugin result plus the raw nonce. */
export function loginWithApple(apple, extra = {}) {
  const payload = withSignupInvite(withAttribution({
    identityToken: apple?.identityToken,
    authorizationCode: apple?.authorizationCode || undefined,
    givenName: apple?.givenName || undefined,
    familyName: apple?.familyName || undefined,
    nonce: apple?.nonce || undefined,
  }));
  if (extra?.invitedBy) payload.invitedBy = extra.invitedBy;
  if (extra?.termsAccepted) payload.termsAccepted = true;
  if (extra?.birthDate) payload.birthDate = extra.birthDate;
  // 2.13.8: new Apple accounts pick their username (no random one).
  payload.usernameStep = true;
  if (extra?.username) payload.username = extra.username;
  const body = withSignupContext(payload);
  // The account is created only on the call that carries the username (2.13.8).
  return runWithHumanCheck(
    "social_signup",
    (hc) =>
      httpRequest(API_ROUTES.apple, {
        method: "POST",
        headers: langHeaders(),
        body: JSON.stringify({ ...body, ...hc }),
      }),
    { always: Boolean(extra?.termsAccepted && extra?.username) },
  );
}

export function getGoogleAuthConfig() {
  return httpRequest(API_ROUTES.googleConfig, {
    method: "GET",
  });
}

/** GET /auth/me on the wire (main.jsx starts one at boot, see lib/bootPrefetch.js). */
export function fetchMeNow(token, { signal } = {}) {
  return httpRequest(API_ROUTES.me, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
    ...(signal ? { signal } : {}),
  });
}

export function getMe(token, { signal } = {}) {
  return bootPrefetchOr("me", token, () => fetchMeNow(token, { signal }));
}

/** Public forgot-password: username or email → emailed 6-digit code. */
export function requestPasswordReset(usernameOrEmail) {
  return runWithHumanCheck("password_reset", (hc) =>
    httpRequest("/auth/password/forgot", {
      method: "POST",
      headers: langHeaders(),
      body: JSON.stringify({ usernameOrEmail, ...hc }),
    }),
  );
}

/** Public: verify code + set new password (human check only after wrong codes). */
export function confirmPasswordReset({ usernameOrEmail, code, newPassword }) {
  return runWithHumanCheck(
    "password_reset",
    (hc) =>
      httpRequest("/auth/password/reset", {
        method: "POST",
        headers: langHeaders(),
        body: JSON.stringify({ usernameOrEmail, code, newPassword, ...hc }),
      }),
    { always: false },
  );
}

/** End the current session server-side (best-effort). Client always clears local auth. */
export function logout(token) {
  return httpRequest(API_ROUTES.logout, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}


/** Live check while typing a new @username (signed-in user). */
export function checkUsernameAvailable(token, username, { signal } = {}) {
  return httpRequest(`/auth/username/available?username=${encodeURIComponent(username)}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
    signal,
  });
}

/** Change the signed-in user's @username; requires the current password. Returns { user, token, previousUsername }. */
export function changeUsername(token, { username, password }) {
  return httpRequest("/auth/username", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ username, password }),
  });
}

/** Sign-up username step: { available, error?, suggestions? } (public, no account yet). */
/** POST /auth/heard-about: the optional "How did you hear about us?" answer (or "skipped"). */
export function sendHeardAbout(token, answer) {
  return httpRequest("/auth/heard-about", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ answer }),
  });
}

export function checkSignupUsername(username) {
  return httpRequest(`/auth/username/check?username=${encodeURIComponent(username)}`, { method: "GET" });
}

/** New e-mail sign-in code for a pending two-factor sign-in (one per minute). */
export function resend2faCode(pendingToken) {
  return httpRequest("/auth/2fa/resend", {
    method: "POST",
    headers: langHeaders(),
    body: JSON.stringify({ pendingToken }),
  });
}
