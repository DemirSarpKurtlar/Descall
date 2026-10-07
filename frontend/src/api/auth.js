import { API_ROUTES } from "../config/api";
import { httpRequest } from "./http";
import { peekAttribution } from "../lib/attribution";

function withAttribution(payload = {}) {
  if (payload?.attribution) return payload;
  const attribution = peekAttribution();
  if (!attribution) return payload;
  return { ...payload, attribution };
}

export function register(payload) {
  return httpRequest(API_ROUTES.register, {
    method: "POST",
    body: JSON.stringify(withAttribution(payload || {})),
  });
}

export function login(payload) {
  return httpRequest(API_ROUTES.login, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function verify2faLogin(pendingToken, code) {
  return httpRequest("/auth/2fa/verify-login", {
    method: "POST",
    body: JSON.stringify({ pendingToken, code }),
  });
}

export function loginWithGoogle(credential, extra = {}) {
  const payload = withAttribution({ credential });
  if (extra?.invitedBy) payload.invitedBy = extra.invitedBy;
  if (extra?.termsAccepted) payload.termsAccepted = true;
  if (extra?.birthDate) payload.birthDate = extra.birthDate;
  if (extra?.attribution) payload.attribution = extra.attribution;
  return httpRequest(API_ROUTES.google, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** Sign in with Apple (native iOS). `apple` is the AppleSignIn plugin result plus the raw nonce. */
export function loginWithApple(apple, extra = {}) {
  const payload = withAttribution({
    identityToken: apple?.identityToken,
    authorizationCode: apple?.authorizationCode || undefined,
    givenName: apple?.givenName || undefined,
    familyName: apple?.familyName || undefined,
    nonce: apple?.nonce || undefined,
  });
  if (extra?.invitedBy) payload.invitedBy = extra.invitedBy;
  if (extra?.termsAccepted) payload.termsAccepted = true;
  if (extra?.birthDate) payload.birthDate = extra.birthDate;
  return httpRequest(API_ROUTES.apple, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getGoogleAuthConfig() {
  return httpRequest(API_ROUTES.googleConfig, {
    method: "GET",
  });
}

export function getMe(token) {
  return httpRequest(API_ROUTES.me, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
}

/** Public forgot-password: username or email → emailed 6-digit code. */
export function requestPasswordReset(usernameOrEmail) {
  return httpRequest("/auth/password/forgot", {
    method: "POST",
    body: JSON.stringify({ usernameOrEmail }),
  });
}

/** Public: verify code + set new password. */
export function confirmPasswordReset({ usernameOrEmail, code, newPassword }) {
  return httpRequest("/auth/password/reset", {
    method: "POST",
    body: JSON.stringify({ usernameOrEmail, code, newPassword }),
  });
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
