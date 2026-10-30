/**
 * Yönetici güvenliği on the client (3.2.0).
 * The server answers an admin change without a fresh code with
 * 403 STEP_UP_REQUIRED, and any admin call from an account without the
 * authenticator app with 403 ADMIN_2FA_REQUIRED. Every admin request path
 * (adminFetch, authedRequest on /api/admin, the few raw fetches) goes through
 * runWithStepUp / adminRawFetch: on STEP_UP_REQUIRED the mounted
 * <AdminStepUpHost/> asks for the code, stores the 15-minute token, and the
 * request is retried once; ADMIN_2FA_REQUIRED opens the setup gate.
 */

const HEADER = "X-Admin-Step-Up";
let token = null;
let expiresAt = 0;
let pending = null;

export const STEP_UP_EVENT = "descall:admin-step-up";
export const ADMIN_2FA_EVENT = "descall:admin-2fa-required";

export function setStepUpToken(value, expiresInSec = 900, now = Date.now()) {
  token = value || null;
  // Renew a minute early so a request never races the server-side expiry.
  expiresAt = value ? now + Math.max(0, expiresInSec - 60) * 1000 : 0;
}

export function clearStepUpToken() {
  token = null;
  expiresAt = 0;
}

export function stepUpHeaders(now = Date.now()) {
  return token && now < expiresAt ? { [HEADER]: token } : {};
}

/** Ask the mounted host for a code. Rejects at once when no host is listening. */
export function requestStepUp() {
  if (pending) return pending;
  pending = new Promise((resolve, reject) => {
    const detail = { resolve, reject, handled: false };
    if (typeof window === "undefined") return reject(new Error("no window"));
    window.dispatchEvent(new CustomEvent(STEP_UP_EVENT, { detail }));
    if (!detail.handled) reject(Object.assign(new Error("Doğrulama kodu gerekli."), { code: "STEP_UP_REQUIRED" }));
  }).finally(() => {
    pending = null;
  });
  return pending;
}

export function notifyAdmin2faRequired() {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(ADMIN_2FA_EVENT));
}

/** `send(extraHeaders)` must throw an Error carrying `.code` on a 403. */
export async function runWithStepUp(send) {
  try {
    return await send(stepUpHeaders());
  } catch (err) {
    if (err?.code === "STEP_UP_REQUIRED") {
      clearStepUpToken();
      await requestStepUp();
      return send(stepUpHeaders());
    }
    if (err?.code === "ADMIN_2FA_REQUIRED") notifyAdmin2faRequired();
    throw err;
  }
}

/** fetch() for the few raw admin calls; returns the Response like fetch does. */
export async function adminRawFetch(url, init = {}) {
  const go = () => fetch(url, { ...init, headers: { ...(init.headers || {}), ...stepUpHeaders() } });
  let res = await go();
  if (res.status !== 403) return res;
  const data = await res.clone().json().catch(() => ({}));
  if (data?.code === "STEP_UP_REQUIRED") {
    clearStepUpToken();
    await requestStepUp();
    res = await go();
  } else if (data?.code === "ADMIN_2FA_REQUIRED") {
    notifyAdmin2faRequired();
  }
  return res;
}

export function isAdminApiPath(path) {
  return /^\/(api\/)?admin(\/|$)/.test(String(path || ""));
}
