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

function riotTokenHeaders({ accessToken, entitlementToken } = {}) {
  const extra = {};
  if (accessToken) extra["X-Riot-Access-Token"] = accessToken;
  if (entitlementToken) extra["X-Riot-Entitlement"] = entitlementToken;
  return extra;
}

async function parse(res) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.error || "Valorant request failed");
    err.status = res.status;
    err.code = body.code || null;
    err.body = body;
    throw err;
  }
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
  const extra = riotTokenHeaders({ accessToken, entitlementToken });
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

/** Adım 3 — party / queue (needs live Riot tokens in headers when available). */
async function partyFetch(path, { method = "GET", body, accessToken, entitlementToken, region, puuid } = {}) {
  const extra = riotTokenHeaders({ accessToken, entitlementToken });
  const q = new URLSearchParams();
  if (region) q.set("region", region);
  if (puuid) q.set("puuid", puuid);
  const qs = q.toString() ? `?${q}` : "";
  const res = await fetch(`${BASE}${path}${qs}`, {
    method,
    headers: getHeaders(extra),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return parse(res);
}

export function getValorantParty(tokens = {}) {
  return partyFetch("/party", { method: "GET", ...tokens });
}

export function startValorantQueue(tokens = {}) {
  return partyFetch("/party/queue/start", { method: "POST", body: {}, ...tokens });
}

export function stopValorantQueue(tokens = {}) {
  return partyFetch("/party/queue/stop", { method: "POST", body: {}, ...tokens });
}

export function setValorantQueue(queueId, tokens = {}) {
  return partyFetch("/party/queue", {
    method: "POST",
    body: { queueId, region: tokens.region, puuid: tokens.puuid },
    ...tokens,
  });
}

export function inviteValorantParty(riotIdOrParts, tokens = {}) {
  const body =
    typeof riotIdOrParts === "string"
      ? { riotId: riotIdOrParts }
      : {
          gameName: riotIdOrParts?.gameName,
          tagLine: riotIdOrParts?.tagLine,
          riotId: riotIdOrParts?.riotId,
        };
  return partyFetch("/party/invite", {
    method: "POST",
    body: { ...body, region: tokens.region, puuid: tokens.puuid },
    ...tokens,
  });
}

export function transferValorantParty(puuid, tokens = {}) {
  return partyFetch("/party/transfer", {
    method: "POST",
    body: { puuid, region: tokens.region },
    ...tokens,
  });
}

export function setValorantPartyReady(ready, tokens = {}) {
  return partyFetch("/party/ready", {
    method: "POST",
    body: { ready: Boolean(ready), region: tokens.region, puuid: tokens.puuid },
    ...tokens,
  });
}

export function generateValorantPartyCode(tokens = {}) {
  return partyFetch("/party/code", {
    method: "POST",
    body: { region: tokens.region, puuid: tokens.puuid },
    ...tokens,
  });
}

export function setValorantPartyAccessibility(accessibility, tokens = {}) {
  return partyFetch("/party/accessibility", {
    method: "POST",
    body: { accessibility, region: tokens.region, puuid: tokens.puuid },
    ...tokens,
  });
}

/* ─── Adım 6 — wallet / inventory / loadout / daily store ─── */

export async function getValorantStoreStatus() {
  const res = await fetch(`${BASE}/store/status`, { headers: getHeaders() });
  return parse(res);
}

/** GET /api/valorant/wallet — VP / Radianite / Kingdom */
export function getValorantWallet(tokens = {}) {
  return partyFetch("/wallet", { method: "GET", ...tokens });
}

/** GET /api/valorant/inventory/skins */
export function getValorantOwnedSkins(tokens = {}) {
  return partyFetch("/inventory/skins", { method: "GET", ...tokens });
}

/** GET /api/valorant/skins/:uuid — catalog media (levels/chromas + streamedVideo); no Riot tokens required */
export async function getValorantSkinDetail(uuid) {
  const res = await fetch(`${BASE}/skins/${encodeURIComponent(uuid)}`, {
    headers: getHeaders(),
  });
  return parse(res);
}

/** GET /api/valorant/loadout */
export function getValorantLoadout(tokens = {}) {
  return partyFetch("/loadout", { method: "GET", ...tokens });
}

/**
 * PUT /api/valorant/loadout — equip guns/sprays/identity (reflects in-game).
 * @param {object} patch { guns?, sprays?, identity?, incognito?, raw? }
 */
export function putValorantLoadout(patch, tokens = {}) {
  return partyFetch("/loadout", {
    method: "PUT",
    body: {
      ...(patch || {}),
      region: tokens.region,
      puuid: tokens.puuid,
    },
    ...tokens,
  });
}

/** PATCH alias for equip */
export function patchValorantLoadout(patch, tokens = {}) {
  return partyFetch("/loadout", {
    method: "PATCH",
    body: {
      ...(patch || {}),
      region: tokens.region,
      puuid: tokens.puuid,
    },
    ...tokens,
  });
}

/** GET /api/valorant/store/offers — daily skins + featured bundles */
export function getValorantStoreOffers(tokens = {}) {
  return partyFetch("/store/offers", { method: "GET", ...tokens });
}

export function getValorantStorefront(tokens = {}) {
  return partyFetch("/store/storefront", { method: "GET", ...tokens });
}

/* ─── Adım 4 — friends / presence (API + Electron hooks for Dima's panel) ─── */

export async function getValorantFriendsStatus() {
  const res = await fetch(`${BASE}/friends/status`, { headers: getHeaders() });
  return parse(res);
}

/** Shape raw lockfile friends/presences via Render (optional; Electron already shapes locally). */
export async function shapeValorantFriends(body) {
  const res = await fetch(`${BASE}/friends/shape`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(body || {}),
  });
  return parse(res);
}

/**
 * Invite a Riot friend into the current party (GLZ).
 * Same tokens as Adım 3 party invite.
 */
export function inviteValorantFriendToParty(riotIdOrParts, tokens = {}) {
  const body =
    typeof riotIdOrParts === "string"
      ? { riotId: riotIdOrParts }
      : {
          gameName: riotIdOrParts?.gameName,
          tagLine: riotIdOrParts?.tagLine,
          riotId: riotIdOrParts?.riotId,
        };
  return partyFetch("/friends/party-invite", {
    method: "POST",
    body: { ...body, region: tokens.region, puuid: tokens.puuid },
    ...tokens,
  });
}

/* ─── Adım 5 — missions / contracts / battle pass ─── */

export async function getValorantMissionsStatus() {
  const res = await fetch(`${BASE}/missions/status`, { headers: getHeaders() });
  return parse(res);
}

/**
 * GET /api/valorant/missions
 * Needs live Riot tokens in headers when RIOT_API_KEY is configured on Render.
 */
export function getValorantMissions(tokens = {}) {
  return partyFetch("/missions", { method: "GET", ...tokens });
}

export function getValorantContracts(tokens = {}) {
  return partyFetch("/contracts", { method: "GET", ...tokens });
}

export function getValorantBattlePass(tokens = {}) {
  return partyFetch("/battlepass", { method: "GET", ...tokens });
}

/** POST /api/valorant/contracts/activate — body: { contractId } */
export function activateValorantContract(contractId, tokens = {}) {
  return partyFetch("/contracts/activate", {
    method: "POST",
    body: {
      contractId,
      region: tokens.region,
      puuid: tokens.puuid,
    },
    ...tokens,
  });
}
