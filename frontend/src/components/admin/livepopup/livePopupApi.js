/** Canlı popup admin API (backend/routes/adminLivePopup.js). Every write asks for a step-up code via adminFetch. */
import { adminFetch } from "../../../api/adminHttp";

const json = (method, body) => ({ method, body: JSON.stringify(body || {}) });
const enc = encodeURIComponent;

export const livePopupApi = {
  overview: () => adminFetch("/popup/overview"),
  history: (limit = 100) => adminFetch(`/popup/campaigns?limit=${limit}`),
  detail: (id) => adminFetch(`/popup/campaigns/${enc(id)}`),
  receipts: (id, { filter = "all", q = "", platform = "", offset = 0, limit = 50 } = {}) =>
    adminFetch(`/popup/campaigns/${enc(id)}/receipts?filter=${enc(filter)}&q=${enc(q)}&platform=${enc(platform)}&offset=${offset}&limit=${limit}`),
  exportCsv: (id) => adminFetch(`/popup/campaigns/${enc(id)}/export`),
  audience: (body) => adminFetch("/popup/audience/preview", json("POST", body)),
  searchUsers: (q) => adminFetch(`/popup/audience/users?q=${enc(q)}`),
  searchServers: (q) => adminFetch(`/popup/audience/servers?q=${enc(q)}`),
  send: (body) => adminFetch("/popup/campaigns", json("POST", body)),
  updateScheduled: (id, body) => adminFetch(`/popup/campaigns/${enc(id)}`, json("PUT", body)),
  sendNow: (id) => adminFetch(`/popup/campaigns/${enc(id)}/send-now`, json("POST")),
  cancel: (id, reason) => adminFetch(`/popup/campaigns/${enc(id)}/cancel`, json("POST", { reason })),
  recall: (id, body) => adminFetch(`/popup/campaigns/${enc(id)}/recall`, json("POST", body)),
  resend: (id, userIds) => adminFetch(`/popup/campaigns/${enc(id)}/resend`, json("POST", userIds ? { userIds } : {})),
  resolve: (id, body) => adminFetch(`/popup/campaigns/${enc(id)}/resolve`, json("POST", body)),
  end: (id) => adminFetch(`/popup/campaigns/${enc(id)}/end`, json("POST")),
  test: (content) => adminFetch("/popup/test", json("POST", { content })),
  templates: () => adminFetch("/popup/templates"),
  saveTemplate: (body) => adminFetch("/popup/templates", json("POST", body)),
  updateTemplate: (id, body) => adminFetch(`/popup/templates/${enc(id)}`, json("PUT", body)),
  deleteTemplate: (id) => adminFetch(`/popup/templates/${enc(id)}`, { method: "DELETE" }),
  userHistory: (userId) => adminFetch(`/popup/users/${enc(userId)}/history`),
  exempt: (userId, exempt) => adminFetch(`/popup/users/${enc(userId)}/exempt`, json("POST", { exempt })),
};
