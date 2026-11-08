/**
 * Public server directory API (item 8, backend/routes/directory.js).
 * The read endpoints and the join action need no login; listing settings do.
 */
import { API_BASE_URL } from "../config/api";
import { getToken } from "../lib/storage";

async function directoryRequest(path, { method = "GET", body, auth = false, signal } = {}) {
  const token = auth ? getToken() : null;
  const res = await fetch(`${API_BASE_URL}/api/directory${path}`, {
    method,
    signal,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.code = data?.code || null;
    err.body = data;
    throw err;
  }
  return data;
}

/** { servers, total, nextOffset, sort, available } */
export function listDirectoryServers({ category, language, q, sort, offset, limit } = {}, { signal } = {}) {
  const params = new URLSearchParams();
  if (category) params.set("category", category);
  if (language) params.set("language", language);
  if (q) params.set("q", q);
  if (sort) params.set("sort", sort);
  if (offset) params.set("offset", String(offset));
  if (limit) params.set("limit", String(limit));
  const qs = params.toString();
  return directoryRequest(`/servers${qs ? `?${qs}` : ""}`, { signal });
}

export function getDirectorySummary({ signal } = {}) {
  return directoryRequest("/summary", { signal });
}

/** Join action of a card: { code, path } of the server's public invite. */
export function getDirectoryInvite(serverId) {
  return directoryRequest(`/servers/${encodeURIComponent(serverId)}/invite`, { method: "POST", body: {} });
}

export function getDirectoryListing(serverId) {
  return directoryRequest(`/manage/${encodeURIComponent(serverId)}`, { auth: true });
}

export function saveDirectoryListing(serverId, listing) {
  return directoryRequest(`/manage/${encodeURIComponent(serverId)}`, { method: "PUT", body: listing, auth: true });
}
