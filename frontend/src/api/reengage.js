/**
 * Growth 3B "Önce insanlar" API (backend routes/notifyCenter.js, streaks.js, winback.js,
 * reengage.js tracking, adminReengage.js). Thin wrappers; errors keep the server code.
 */
import { authedRequest } from "./authedHttp";
import { adminFetch } from "./adminHttp";

const enc = encodeURIComponent;

export const notifyCenter = {
  state: () => authedRequest("/api/notify-center"),
  saveSettings: (patch) => authedRequest("/api/notify-center/settings", { method: "PUT", body: patch }),
  savePerson: (peerId, patch) => authedRequest(`/api/notify-center/people/${enc(peerId)}`, { method: "PUT", body: patch }),
  next: (peerId) => authedRequest(`/api/notify-center/people/${enc(peerId)}/next`),
  serverLevel: (serverId, level) => authedRequest(`/api/servers/${enc(serverId)}/me/settings`, { method: "PATCH", body: { notificationLevel: level } }),
};

export const streaksApi = {
  state: () => authedRequest("/api/streaks"),
  start: (peerId) => authedRequest(`/api/streaks/${enc(peerId)}`, { method: "POST" }),
  end: (peerId) => authedRequest(`/api/streaks/${enc(peerId)}`, { method: "DELETE" }),
  nudge: (peerId) => authedRequest(`/api/streaks/${enc(peerId)}/nudge`, { method: "POST" }),
  claimDaily: () => authedRequest("/api/shop/daily/claim", { method: "POST" }),
};

export const winbackApi = {
  suggestion: () => authedRequest("/api/winback/suggestion"),
  call: (id, message) => authedRequest(`/api/winback/${enc(id)}/call`, { method: "POST", body: { message } }),
  dismiss: (id) => authedRequest(`/api/winback/${enc(id)}/dismiss`, { method: "POST" }),
};

/** The app tapped a re-engagement push (kind from the push data). Best effort. */
export function reportOpened(kind) {
  if (!kind || typeof kind !== "string" || kind.length > 64) return Promise.resolve(false);
  return authedRequest("/api/reengage/t/open", { method: "POST", body: { kind } }).then(
    (r) => Boolean(r?.ok),
    () => false
  );
}

const json = (body) => ({ body: JSON.stringify(body) });

export const reengageAdmin = {
  overview: () => adminFetch("/growth/reengage"),
  settings: (patch) => adminFetch("/growth/reengage/settings", { method: "PUT", ...json(patch) }),
  workspace: (id) => adminFetch(`/growth/reengage/campaigns/${enc(id)}`),
  preview: (id, { lang, userId } = {}) =>
    adminFetch(`/growth/reengage/campaigns/${enc(id)}/preview?${new URLSearchParams({ ...(lang ? { lang } : {}), ...(userId ? { userId } : {}) })}`),
  save: (id, patch) => adminFetch(`/growth/reengage/campaigns/${enc(id)}`, { method: "PATCH", ...json(patch) }),
  sendNow: (id, reason) => adminFetch(`/growth/reengage/campaigns/${enc(id)}/send`, { method: "POST", ...json({ reason }) }),
  test: (id) => adminFetch(`/growth/reengage/campaigns/${enc(id)}/test`, { method: "POST", ...json({}) }),
  wave: (id) => adminFetch(`/growth/reengage/waves/${enc(id)}`),
  undo: (id) => adminFetch(`/growth/reengage/waves/${enc(id)}/undo`, { method: "POST", ...json({}) }),
  recall: (id, reason, note) => adminFetch(`/growth/reengage/waves/${enc(id)}/recall`, { method: "POST", ...json({ reason, note }) }),
  friendCall: () => adminFetch("/growth/reengage/friend-call"),
  outcomes: () => adminFetch("/growth/reengage/outcomes"),
};
