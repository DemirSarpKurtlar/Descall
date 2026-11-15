/**
 * Güvenlik Merkezi API (routes/adminSecurity.js). Every change goes through adminFetch,
 * which asks for the step-up code when the server answers STEP_UP_REQUIRED. The lock
 * dialog collects the code itself ("Doğrulama kodu") and trades it for the step-up
 * token first, so the lock request never prompts a second time.
 */
import { adminFetch, adminStepUpRequest } from "../../../api/adminHttp";
import { setStepUpToken } from "../../../lib/adminStepUp";

const q = (params) => {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) if (v != null && v !== "" && v !== "all") s.set(k, String(v));
  const str = s.toString();
  return str ? `?${str}` : "";
};

const json = (method, body) => ({ method, body: JSON.stringify(body || {}) });

export const securityApi = {
  overview: () => adminFetch("/security/overview"),
  events: ({ filter, before, limit = 40, sourceRef, userId } = {}) => adminFetch(`/security/events${q({ filter, before, limit, sourceRef, userId })}`),
  event: (id) => adminFetch(`/security/events/${encodeURIComponent(id)}`),
  impact: () => adminFetch("/security/impact"),
  patchSettings: (patch, { reason, recommended } = {}) => adminFetch("/security/settings", json("PATCH", { patch, reason: reason || undefined, recommended: Boolean(recommended) })),
  startLocks: ({ modes, duration, reason, banner }) => adminFetch("/security/locks", json("POST", { modes, duration, reason, banner })),
  liftLocks: (modes, reason) => adminFetch("/security/locks/lift", json("POST", { modes, reason })),
  extendLock: (mode, minutes) => adminFetch("/security/locks/extend", json("POST", { mode, minutes })),
  history: ({ category, before } = {}) => adminFetch(`/security/history${q({ category, before })}`),
  revert: (id, reason) => adminFetch(`/security/history/${encodeURIComponent(id)}/revert`, json("POST", { reason })),
  remind2fa: () => adminFetch("/security/remind-2fa", json("POST", {})),
  banSource: ({ sourceRef, kind, duration, reason }) => adminFetch("/access-bans", json("POST", { mode: "source", sourceRef, kind, duration, reason })),
  /** Trade a 6-digit code for the 15-minute step-up token (the lock dialog's own field). */
  async verifyCode(code) {
    const res = await adminStepUpRequest(code);
    if (res?.token) setStepUpToken(res.token, res.expiresInSec || 900);
    return res;
  },
};
