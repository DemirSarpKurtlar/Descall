/** Duyurular admin API (backend/routes/adminAnnouncements.js). Every write asks for a step-up code via adminFetch. */
import { adminFetch } from "../../../api/adminHttp";

const json = (method, body) => ({ method, body: JSON.stringify(body || {}) });
const enc = encodeURIComponent;

export const annApi = {
  overview: () => adminFetch("/announcements/overview"),
  detail: (id) => adminFetch(`/announcements/${enc(id)}`),
  versions: (id) => adminFetch(`/announcements/${enc(id)}/versions`),
  exportCsv: (id) => adminFetch(`/announcements/${enc(id)}/export`),
  templates: () => adminFetch("/announcements/templates"),
  fillTemplate: (key, values, sourceLang = "tr") => adminFetch("/announcements/templates/fill/preview", json("POST", { key, values, sourceLang })),
  audience: (audience, priority) => adminFetch("/announcements/audience/preview", json("POST", { audience, priority })),
  translate: (body) => adminFetch("/announcements/translate/preview", json("POST", body)),
  create: (body) => adminFetch("/announcements", json("POST", body)),
  update: (id, body) => adminFetch(`/announcements/${enc(id)}`, json("PUT", body)),
  publish: (id, body = {}) => adminFetch(`/announcements/${enc(id)}/publish`, json("POST", body)),
  submit: (id) => adminFetch(`/announcements/${enc(id)}/submit`, json("POST")),
  unschedule: (id) => adminFetch(`/announcements/${enc(id)}/unschedule`, json("POST")),
  approve: (id, note) => adminFetch(`/announcements/${enc(id)}/approve`, json("POST", { note })),
  reject: (id, note) => adminFetch(`/announcements/${enc(id)}/reject`, json("POST", { note })),
  end: (id, reason, note) => adminFetch(`/announcements/${enc(id)}/end`, json("POST", { reason, note })),
  reopen: (id) => adminFetch(`/announcements/${enc(id)}/reopen`, json("POST")),
  extend: (id, endsAt) => adminFetch(`/announcements/${enc(id)}/extend`, json("POST", { endsAt })),
  archive: (id, reason, note) => adminFetch(`/announcements/${enc(id)}/archive`, json("POST", reason ? { reason, note } : {})),
  unarchive: (id) => adminFetch(`/announcements/${enc(id)}/unarchive`, json("POST")),
  remove: (id, body) => adminFetch(`/announcements/${enc(id)}`, json("DELETE", body)),
  duplicate: (id) => adminFetch(`/announcements/${enc(id)}/duplicate`, json("POST")),
  restore: (id, version) => adminFetch(`/announcements/${enc(id)}/restore`, json("POST", { version })),
  pin: (id, pinned) => adminFetch(`/announcements/${enc(id)}`, json("PATCH", { pinned })),
  pins: (ids) => adminFetch("/announcements/pins", json("POST", { ids })),
  test: (body) => adminFetch("/announcements/test", json("POST", body)),
  cover: (file) => adminFetch("/announcements/cover", { method: "POST", body: file, headers: { "Content-Type": file.type } }),
  saveTemplate: (body) => adminFetch("/announcements/templates", json("POST", body)),
  saveAsTemplate: (id, body) => adminFetch(`/announcements/${enc(id)}/save-template`, json("POST", body)),
  deleteTemplate: (id) => adminFetch(`/announcements/templates/${enc(id)}`, { method: "DELETE" }),
};
