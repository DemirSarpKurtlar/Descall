import { API_BASE_URL } from "../config/api";
import { getToken } from "../lib/storage";

/** Authenticated JSON request helper — shared by the security/blocking/shop API modules. */
export async function authedRequest(path, { method = "GET", body, signal } = {}) {
  const token = getToken();
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    cache: "no-store",
    signal,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.error || data?.message || `Request failed (${res.status})`);
    err.status = res.status;
    if (data?.code) err.code = data.code;
    if (data?.action) err.action = data.action;
    throw err;
  }
  return data;
}
