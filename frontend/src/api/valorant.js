import { API_BASE_URL } from "../config/api";
import { getToken } from "../lib/storage";

const BASE = `${API_BASE_URL}/valorant`;

function getHeaders(extra = {}) {
  const token = getToken();
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}

async function parse(res) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "Valorant request failed");
  return body;
}

export async function getValorantStatus() {
  const res = await fetch(`${BASE}/status`, { headers: getHeaders() });
  return parse(res);
}

/**
 * GET /api/valorant/me
 * Optional Riot tokens are sent as headers only (never persisted by server).
 */
export async function getValorantMe({ accessToken, entitlementToken, region } = {}) {
  const extra = {};
  if (accessToken) extra["X-Riot-Access-Token"] = accessToken;
  if (entitlementToken) extra["X-Riot-Entitlement"] = entitlementToken;
  const q = region ? `?region=${encodeURIComponent(region)}` : "";
  const res = await fetch(`${BASE}/me${q}`, { headers: getHeaders(extra) });
  return parse(res);
}

/** Persist public identity only — no tokens. */
export async function linkValorantSession(body) {
  const res = await fetch(`${BASE}/session/link`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(body),
  });
  return parse(res);
}

export async function disconnectValorantSession() {
  const res = await fetch(`${BASE}/session`, {
    method: "DELETE",
    headers: getHeaders(),
  });
  return parse(res);
}
