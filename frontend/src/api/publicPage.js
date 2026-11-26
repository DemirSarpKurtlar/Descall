/**
 * Public server page desk API (backend/routes/publicPages.js, owner / ADMINISTRATOR only).
 */
import { apiBase } from "../lib/nodeRouting";
import { getToken } from "../lib/storage";
import { httpError } from "./httpError";

async function request(path, { method = "GET", body, signal } = {}) {
  const token = getToken();
  let res;
  try {
    res = await fetch(`${apiBase()}/api/public-pages${path}`, {
      method,
      signal,
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    if (err?.name === "AbortError") throw err;
    const e = new Error("offline");
    e.status = 0;
    e.code = "OFFLINE";
    throw e;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = httpError(data, res.status);
    err.code = data?.code || null;
    err.body = data;
    throw err;
  }
  return data;
}

const q = (days) => (days && days !== 30 ? `?days=${days}` : "");

export function getPublicPageDesk(serverId, { days, signal } = {}) {
  return request(`/manage/${encodeURIComponent(serverId)}${q(days)}`, { signal });
}

export function savePublicPage(serverId, body, { days } = {}) {
  return request(`/manage/${encodeURIComponent(serverId)}${q(days)}`, { method: "PUT", body });
}

export function disablePublicPage(serverId, { reason, note }, { days } = {}) {
  return request(`/manage/${encodeURIComponent(serverId)}/disable${q(days)}`, { method: "POST", body: { reason, note: note || undefined } });
}

export function undoDisablePublicPage(serverId, { days } = {}) {
  return request(`/manage/${encodeURIComponent(serverId)}/undo${q(days)}`, { method: "POST", body: {} });
}
