import { adminFetch } from "./adminHttp";

/** Admin "Şüpheli Davranışlar" tab: /api/admin/antibot (admins + moderators read; writes are admin only). */
const enc = encodeURIComponent;

export const antibotApi = {
  status: () => adminFetch("/antibot/status"),
  overview: () => adminFetch("/antibot/overview"),
  accounts: ({ status = "", q = "" } = {}) => {
    const p = new URLSearchParams();
    if (status) p.set("status", status);
    if (q) p.set("q", q);
    const qs = p.toString();
    return adminFetch(`/antibot/accounts${qs ? `?${qs}` : ""}`);
  },
  user: (id) => adminFetch(`/antibot/users/${enc(id)}`),
  extra: (id) => adminFetch(`/antibot/users/${enc(id)}/extra`),
  clusters: () => adminFetch("/antibot/clusters"),
  watchlist: () => adminFetch("/antibot/watchlist"),
  feed: () => adminFetch("/antibot/feed"),
  trust: (id, trusted, note = "") =>
    adminFetch(`/antibot/users/${enc(id)}/trust`, { method: "POST", body: JSON.stringify({ trusted, note }) }),
  release: (id, note = "") =>
    adminFetch(`/antibot/users/${enc(id)}/release`, { method: "POST", body: JSON.stringify({ all: true, note }) }),
  saveWatch: (id, { note = "", rules = [] } = {}) =>
    adminFetch(`/antibot/watch/${enc(id)}`, { method: "PUT", body: JSON.stringify({ note, rules }) }),
  removeWatch: (id) => adminFetch(`/antibot/watch/${enc(id)}`, { method: "DELETE" }),
};
