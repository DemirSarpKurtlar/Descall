/**
 * Sunucu Ağı REST calls (all under /api/admin/nodes, owner only; contract in
 * backend/routes/adminNodes.js). Every change needs a fresh 2FA step-up: adminFetch asks
 * for the code through the shared AdminStepUpHost prompt and retries.
 */
import { adminFetch } from "../../../api/adminHttp";

const enc = encodeURIComponent;
const send = (path, method, body) => adminFetch(path, { method, body: JSON.stringify(body || {}) });

export const nodeApi = {
  overview: () => adminFetch("/nodes"),
  metrics: (minutes = 60) => adminFetch(`/nodes/metrics?minutes=${enc(minutes)}`),
  saveCfg: (body) => send("/nodes/pc-config", "PUT", body),
  drain: (id, reason) => send(`/nodes/${enc(id)}/drain`, "POST", { reason }),
  resume: (id) => send(`/nodes/${enc(id)}/resume`, "POST", {}),
  allToRender: (reason) => send("/nodes/all-to-render", "POST", { reason, confirm: true }),
  drill: () => send("/nodes/drill", "POST", {}),
  keys: () => adminFetch("/nodes/keys"),
  createKey: (name) => send("/nodes/keys", "POST", { name }),
  revokeKey: (id, body) => send(`/nodes/keys/${enc(id)}/revoke`, "POST", body),
  testAlert: () => send("/nodes/alerts/test", "POST", {}),
};
