/**
 * Passkey endpoints (backend routes/passkeys.js, mounted at /api/auth/passkeys).
 * Public calls go through httpRequest (device headers, transport retry, { status, code, body }
 * errors); signed-in calls through authedRequest (Bearer token).
 */
import { httpRequest } from "../../api/http.js";
import { authedRequest } from "../../api/authedHttp.js";
import { getLocale } from "../../i18n/runtime.js";

export const PASSKEY_API = "/api/auth/passkeys";

function langHeaders() {
  try {
    const loc = String(getLocale() || "").trim();
    return /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(loc) ? { "Accept-Language": loc } : {};
  } catch {
    return {};
  }
}

const post = (path, body, opts = {}) =>
  httpRequest(`${PASSKEY_API}${path}`, { method: "POST", headers: langHeaders(), body: JSON.stringify(body || {}), signal: opts.signal });
const authed = (path, { method = "POST", body, signal } = {}) => authedRequest(`${PASSKEY_API}${path}`, { method, body, signal });

export const passkeyApi = {
  config: () => httpRequest(`${PASSKEY_API}/config`, { method: "GET" }),
  // Sign-in (no session yet).
  authOptions: (platform, opts) => post("/auth/options", { platform }, opts),
  authVerify: (response, platform, opts) => post("/auth/verify", { response, platform, ...(opts?.durationMs ? { durationMs: opts.durationMs } : {}) }, opts),
  // Signed in.
  list: () => authed("", { method: "GET" }),
  reauth: ({ password, code }) => authed("/reauth", { body: { ...(password ? { password } : {}), ...(code ? { code } : {}) } }),
  reauthOptions: (platform) => authed("/reauth/options", { body: { platform } }),
  reauthVerify: (response, platform) => authed("/reauth/verify", { body: { response, platform } }),
  registerOptions: (reauthToken, platform, prefer) => authed("/register/options", { body: { ...(reauthToken ? { reauthToken } : {}), platform, ...(prefer ? { prefer } : {}) } }),
  registerVerify: (reauthToken, response, name, platform) => authed("/register/verify", { body: { ...(reauthToken ? { reauthToken } : {}), response, name, platform } }),
  rename: (id, name) => authed(`/${encodeURIComponent(id)}`, { method: "PATCH", body: { name } }),
  remove: (id, { reason, endSessions } = {}) =>
    authed(`/${encodeURIComponent(id)}`, { method: "DELETE", body: { ...(reason ? { reason } : {}), ...(endSessions ? { endSessions: true } : {}) } }),
  // Control center (Settings > Security > Passkeys).
  center: () => authed("/center", { method: "GET" }),
  resolveAlert: (id, action) => authed(`/alerts/${encodeURIComponent(id)}/resolve`, { body: { action } }),
  // The "Ben degildim" page of the security e-mails (no session).
  reportInfo: (token) => post("/report/info", { token }),
  reportResolve: (token, action) => post("/report/resolve", { token, action }),
  // Desktop browser handoff.
  handoffSignIn: (platform) => post("/handoff", { platform }),
  handoffRegister: (reauthToken, platform) => authed("/handoff/register", { body: { ...(reauthToken ? { reauthToken } : {}), platform } }),
  handoffPoll: (pollSecret, opts) => post("/handoff/poll", { pollSecret }, opts),
  // The browser page (https://descall.com/passkey/desktop).
  handoffInfo: (code) => post("/handoff/info", { code }),
  handoffAuthOptions: (code) => post("/handoff/auth/options", { code }),
  handoffAuthVerify: (code, response) => post("/handoff/auth/verify", { code, response }),
  handoffRegisterOptions: (code) => post("/handoff/register/options", { code }),
  handoffRegisterVerify: (code, response, name) => post("/handoff/register/verify", { code, response, name }),
};
