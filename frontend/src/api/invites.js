/**
 * Davet Merkezi API (backend/routes/invites.js). Public calls (landing, open) work logged
 * out; the rest send the session token.
 */
import { apiBase } from "../lib/nodeRouting";
import { authedRequest } from "./authedHttp";
import { httpError } from "./httpError";

async function publicRequest(path, { method = "GET", body, signal } = {}) {
  let res;
  try {
    res = await fetch(`${apiBase()}/api/invites${path}`, {
      method,
      signal,
      cache: "no-store",
      headers: body !== undefined ? { "Content-Type": "application/json" } : {},
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
    if (data?.code) err.code = data.code;
    throw err;
  }
  return data;
}

export const getInviteLanding = (username, opts) => publicRequest(`/landing/${encodeURIComponent(username)}`, opts);
export const recordInviteOpen = (body) => publicRequest("/open", { method: "POST", body });
export const getInviteDashboard = (opts) => authedRequest("/api/invites/me", opts);
export const attachInviteOpen = (body) => authedRequest("/api/invites/attach", { method: "POST", body });
export const nudgeInvitee = (referralId, body = {}) => authedRequest(`/api/invites/nudge/${encodeURIComponent(referralId)}`, { method: "POST", body });
export const getInviteWelcome = (opts) => authedRequest("/api/invites/welcome", opts);
export const readInviteNotices = (ids) => authedRequest("/api/invites/notices/read", { method: "POST", body: { ids: ids || null } });
