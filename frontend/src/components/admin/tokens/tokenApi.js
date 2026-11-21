/**
 * Admin Token REST calls (all under /api/admin/tokens, owner only; contract in the
 * section header). Changes need a fresh 2FA step-up: the forms that carry their own
 * 6-digit field exchange it first (verifyCode), the rest fall back to the shared
 * AdminStepUpHost prompt through adminFetch.
 */
import { adminFetch, adminStepUpRequest } from "../../../api/adminHttp";
import { setStepUpToken } from "../../../lib/adminStepUp";
import { getSessions } from "../../../api/security";

const enc = encodeURIComponent;
const send = (path, method, body) => adminFetch(path, { method, body: JSON.stringify(body || {}) });

export const tokenApi = {
  list: () => adminFetch("/tokens"),
  detail: (id) => adminFetch(`/tokens/${enc(id)}`),
  calls: (id, after) => adminFetch(`/tokens/${enc(id)}/calls${after ? `?after=${enc(after)}` : ""}`),
  create: (body) => send("/tokens", "POST", body),
  patch: (id, body) => send(`/tokens/${enc(id)}`, "PATCH", body),
  rotate: (id, graceMinutes) => send(`/tokens/${enc(id)}/rotate`, "POST", { graceMinutes }),
  revoke: (id, body) => send(`/tokens/${enc(id)}/revoke`, "POST", body),
  restore: (id) => send(`/tokens/${enc(id)}/restore`, "POST", {}),
  revokeAll: (body) => send("/tokens/revoke-all", "POST", body),
  alert: (alertId, action) => send(`/tokens/alerts/${enc(alertId)}`, "POST", { action }),
  autoPause: (body) => send("/tokens/auto-pause", "PUT", body),
  openapi: () => adminFetch("/openapi.json"),

  /** The form's own 6-digit code -> a 15-minute step-up token for the next calls. */
  async verifyCode(code) {
    let res;
    try {
      res = await adminStepUpRequest(code);
    } catch (err) {
      throw Object.assign(new Error(err?.message || "bad code"), { code: "BAD_CODE", cause: err });
    }
    if (res?.token) setStepUpToken(res.token, res.expiresInSec || 900);
    return res;
  },

  /** The address of this session ("Mevcut IP'mi ekle"), or null. */
  async currentIp() {
    try {
      const d = await getSessions();
      const cur = (d?.sessions || []).find((s) => s?.current);
      const ip = String(cur?.ip || "").trim();
      return ip && ip !== "unknown" ? ip : null;
    } catch {
      return null;
    }
  },
};
