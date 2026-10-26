import { authedRequest } from "./authedHttp";
import { adminFetch } from "./adminHttp";

/** Special badges (2026-10-26). Never sold: users only read and wear; admins grant and take back. */
export const getSpecialBadgeCatalog = () => authedRequest("/api/special-badges/catalog");
export const getUserSpecialBadges = (userId) =>
  authedRequest(`/api/special-badges/users/${encodeURIComponent(userId || "me")}`);
export const setEquippedSpecialBadge = (badgeId) =>
  authedRequest("/api/special-badges/me/equipped", { method: "PUT", body: { badgeId: badgeId || null } });

export const adminSpecialBadgesOverview = () => adminFetch("/special-badges");
export const adminSpecialBadgeHolders = (badgeId) => adminFetch(`/special-badges/${encodeURIComponent(badgeId)}/holders`);
export const adminSpecialBadgeAudit = ({ limit = 30, badgeId } = {}) =>
  adminFetch(`/special-badges/audit?limit=${limit}${badgeId ? `&badgeId=${encodeURIComponent(badgeId)}` : ""}`);
export const adminGrantSpecialBadge = (badgeId, { userId, note } = {}) =>
  adminFetch(`/special-badges/${encodeURIComponent(badgeId)}/grant`, { method: "POST", body: JSON.stringify({ userId, note: note || "" }) });
export const adminRevokeSpecialBadge = (badgeId, { userId, reason } = {}) =>
  adminFetch(`/special-badges/${encodeURIComponent(badgeId)}/revoke`, { method: "POST", body: JSON.stringify({ userId, reason: reason || "" }) });
export const adminSearchPeople = (q) => adminFetch(`/people/search?q=${encodeURIComponent(q)}`);
