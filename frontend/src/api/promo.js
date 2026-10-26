import { API_BASE_URL } from "../config/api";
import { getToken } from "../lib/storage";
import { adminFetch } from "./adminHttp";
import { authedRequest } from "./authedHttp";

/**
 * Promosyon kodları. Redeem keeps every field of an error body (retryAfter,
 * days, availableAt) so the sheet can show the countdown / date; it is a POST
 * and is never retried by the transport layer.
 */
export async function redeemPromoCode(code) {
  const token = getToken();
  const res = await fetch(`${API_BASE_URL}/api/promo/redeem`, {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ code }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.code || data?.error || `HTTP ${res.status}`);
    Object.assign(err, data, { status: res.status, code: data?.code || "server_error" });
    if (res.status === 429 && !err.retryAfter) err.retryAfter = Number(res.headers.get("Retry-After")) || 600;
    throw err;
  }
  return data;
}

export const getPromoHistory = () => authedRequest("/api/promo/history");
export const getPromoPopup = () => authedRequest("/api/promo/popup");
export const markPromoPopup = (id, snooze = false) =>
  authedRequest(`/api/promo/popup/${encodeURIComponent(id)}/seen`, { method: "POST", body: { snooze } });

export const adminPromoOverview = () => adminFetch("/promo-codes");
export const adminPromoGenerate = () => adminFetch("/promo-codes/generate");
export const adminPromoShopItems = () => adminFetch("/promo-codes/shop-items");
/** People picker: closest match first; `exclude` = already picked ids (max 100). */
export const adminPromoUsers = (q, { exclude = [], signal } = {}) => {
  const qs = new URLSearchParams({ q: String(q ?? "") });
  const ids = exclude.filter(Boolean).slice(0, 100);
  if (ids.length) qs.set("exclude", ids.join(","));
  return adminFetch(`/promo-codes/users?${qs.toString()}`, { signal });
};
export const adminPromoCreate = (body) => adminFetch("/promo-codes", { method: "POST", body: JSON.stringify(body) });
export const adminPromoUpdate = (id, body) =>
  adminFetch(`/promo-codes/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(body) });
export const adminPromoRedemptions = (id, { q, limit = 50, offset = 0 } = {}) => {
  const p = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (q) p.set("q", q);
  return adminFetch(`/promo-codes/${encodeURIComponent(id)}/redemptions?${p}`);
};

/** Codes this account can use right now (the server filters eligibility; never lists anyone else's). */
export const getPromoAvailable = () => authedRequest("/api/promo/available");
/** Settings badge numbers only: { count, unseen } (no codes). */
export const getPromoAvailableSummary = () => authedRequest("/api/promo/available?summary=1");
export const markPromoAvailableSeen = (ids) =>
  authedRequest("/api/promo/available/seen", { method: "POST", body: { ids } });
