/**
 * Premium Yönetimi API (docs/premium/CONTRACT.md, all under /api/admin/premium).
 * Every call goes through adminFetch: requireAuth + requireAdmin + section
 * "premium" on the server, and writes get the step-up code prompt
 * (runWithStepUp) automatically.
 */
import { adminFetch } from "../../../api/adminHttp";
import { qs } from "./premiumModel.js";

const P = "/premium";
const json = (method, body) => ({ method, body: JSON.stringify(body) });
const enc = encodeURIComponent;

export const premiumDashboard = () => adminFetch(`${P}/dashboard`);
export const premiumPlans = () => adminFetch(`${P}/plans`);
export const premiumPlanUpdate = (id, body) => adminFetch(`${P}/plans/${enc(id)}`, json("PATCH", body));

export const premiumUserSearch = (q, { signal } = {}) => adminFetch(`${P}/users/search${qs({ q })}`, { signal });
export const premiumUser = (id) => adminFetch(`${P}/users/${enc(id)}`);
export const premiumApply = (id, body) => adminFetch(`${P}/users/${enc(id)}/apply`, json("POST", body));

export const premiumBulk = (body) => adminFetch(`${P}/bulk`, json("POST", body));
export const premiumBulkBatch = (batchId) => adminFetch(`${P}/bulk/${enc(batchId)}`);

/** filters: { user, kind, plan, actor, from, to, cursor } */
export const premiumEvents = (filters = {}) => adminFetch(`${P}/events${qs(filters)}`);
/** { from, to, bucket: day|week|month } */
export const premiumAnalytics = (params) => adminFetch(`${P}/analytics${qs(params)}`);
export const premiumFinance = () => adminFetch(`${P}/finance`);
/** filters: { actor, q, from, to, cursor } */
export const premiumAudit = (filters = {}) => adminFetch(`${P}/audit${qs(filters)}`);

export const premiumCampaigns = () => adminFetch(`${P}/campaigns`);
export const premiumCampaignCreate = (body) => adminFetch(`${P}/campaigns`, json("POST", body));
export const premiumCampaignUpdate = (id, body) => adminFetch(`${P}/campaigns/${enc(id)}`, json("PATCH", body));
export const premiumCampaignStats = (id) => adminFetch(`${P}/campaigns/${enc(id)}/stats`);

/** People picker adapter: the premium search shaped like the promo picker hits. */
export async function premiumPickerSearch(q, { signal } = {}) {
  const data = await premiumUserSearch(q, { signal });
  return { users: Array.isArray(data?.users) ? data.users : [] };
}
