/**
 * Valorant party / queue helpers (Adım 3).
 * Thin GLZ proxy — never logs tokens or passwords.
 */

const { toHenrikRegion } = require("./riotLink");

const CLIENT_PLATFORM = Buffer.from(
  JSON.stringify({
    platformType: "PC",
    platformOS: "Windows",
    platformOSVersion: "10.0.19042.1.256.64bit",
    platformChipset: "Unknown",
  })
).toString("base64");

const REGION_TO_SHARD = {
  eu: "eu",
  na: "na",
  latam: "na",
  br: "na",
  ap: "ap",
  kr: "kr",
  pbe: "pbe",
};

/** CompetitiveTier → display name (PC). Index matches Riot tier id. */
const TIER_NAMES = [
  "Unranked",
  "Unranked",
  "Unranked",
  "Iron 1",
  "Iron 2",
  "Iron 3",
  "Bronze 1",
  "Bronze 2",
  "Bronze 3",
  "Silver 1",
  "Silver 2",
  "Silver 3",
  "Gold 1",
  "Gold 2",
  "Gold 3",
  "Platinum 1",
  "Platinum 2",
  "Platinum 3",
  "Diamond 1",
  "Diamond 2",
  "Diamond 3",
  "Ascendant 1",
  "Ascendant 2",
  "Ascendant 3",
  "Immortal 1",
  "Immortal 2",
  "Immortal 3",
  "Radiant",
];

const QUEUE_LABELS = {
  competitive: "Competitive",
  unrated: "Unrated",
  spikerush: "Spike Rush",
  deathmatch: "Deathmatch",
  ggteam: "Escalation",
  onefa: "Replication",
  snowball: "Snowball Fight",
  newmap: "New Map",
  swiftplay: "Swiftplay",
  hurm: "Team Deathmatch",
  premier: "Premier",
  "premier-s": "Premier",
  "premier-e": "Premier",
  "premier-c": "Premier",
  "premier-b": "Premier",
  "premier-a": "Premier",
};

let cachedClientVersion = { value: null, at: 0 };

function shardForRegion(region) {
  const r = toHenrikRegion(region || "eu");
  return REGION_TO_SHARD[r] || "eu";
}

function glzBase(region) {
  const affinity = toHenrikRegion(region || "eu");
  const shard = shardForRegion(affinity);
  return `https://glz-${affinity}-1.${shard}.a.pvp.net`;
}

function pdBase(region) {
  const shard = shardForRegion(region || "eu");
  return `https://pd.${shard}.a.pvp.net`;
}

function tierName(tier) {
  const n = Number(tier);
  if (!Number.isFinite(n) || n < 0) return null;
  return TIER_NAMES[n] || (n === 0 ? "Unranked" : `Tier ${n}`);
}

function queueLabel(queueId) {
  if (!queueId) return null;
  const key = String(queueId).toLowerCase();
  return QUEUE_LABELS[key] || String(queueId);
}

async function fetchClientVersion() {
  const now = Date.now();
  if (cachedClientVersion.value && now - cachedClientVersion.at < 6 * 60 * 60 * 1000) {
    return cachedClientVersion.value;
  }
  try {
    const res = await fetch("https://valorant-api.com/v1/version");
    const body = await res.json().catch(() => ({}));
    const ver =
      body?.data?.riotClientVersion ||
      body?.data?.riot_client_version ||
      body?.data?.version ||
      null;
    if (ver) {
      cachedClientVersion = { value: ver, at: now };
      return ver;
    }
  } catch {
    /* fall through */
  }
  // Last-known-style fallback so party calls can still be attempted
  return cachedClientVersion.value || "release-10.0.0.0-shipping";
}

async function fetchEntitlement(accessToken) {
  if (!accessToken) return null;
  const res = await fetch("https://entitlements.auth.riotgames.com/api/token/v1", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: "{}",
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return null;
  return body.entitlements_token || body.token || null;
}

function riotHeaders({ accessToken, entitlementToken, clientVersion }) {
  return {
    Authorization: `Bearer ${accessToken}`,
    "X-Riot-Entitlements-JWT": entitlementToken,
    "X-Riot-ClientPlatform": CLIENT_PLATFORM,
    "X-Riot-ClientVersion": clientVersion,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

async function glzRequest({
  method = "GET",
  path,
  region,
  accessToken,
  entitlementToken,
  body = undefined,
}) {
  const clientVersion = await fetchClientVersion();
  const url = `${glzBase(region)}${path}`;
  const res = await fetch(url, {
    method,
    headers: riotHeaders({ accessToken, entitlementToken, clientVersion }),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const err = new Error(
      json?.errorCode ||
        json?.message ||
        json?.httpStatus ||
        `Riot party request failed (${res.status})`
    );
    err.status = res.status === 401 || res.status === 403 ? 401 : res.status || 502;
    err.riot = json;
    throw err;
  }
  return json;
}

async function resolveNames({ accessToken, entitlementToken, region, puuids }) {
  const unique = [...new Set((puuids || []).filter(Boolean))];
  if (!unique.length) return {};
  try {
    const clientVersion = await fetchClientVersion();
    const res = await fetch(`${pdBase(region)}/name-service/v2/players`, {
      method: "PUT",
      headers: riotHeaders({ accessToken, entitlementToken, clientVersion }),
      body: JSON.stringify(unique),
    });
    const body = await res.json().catch(() => []);
    if (!res.ok || !Array.isArray(body)) return {};
    const map = {};
    for (const row of body) {
      const puuid = row.Subject || row.subject;
      if (!puuid) continue;
      map[puuid] = {
        gameName: row.GameName || row.gameName || null,
        tagLine: row.TagLine || row.tagLine || null,
      };
    }
    return map;
  } catch {
    return {};
  }
}

function isQueueing(party) {
  if (!party) return false;
  const state = String(party.State || "").toUpperCase();
  if (state.includes("MATCHMAKING") || state === "INQUEUE" || state === "IN_QUEUE") return true;
  const qet = party.QueueEntryTime;
  if (qet && qet !== "0001-01-01T00:00:00Z" && !String(qet).startsWith("0001-")) return true;
  return false;
}

async function shapeParty({
  party,
  player,
  accessToken,
  entitlementToken,
  region,
  selfPuuid,
}) {
  const membersRaw = Array.isArray(party?.Members) ? party.Members : [];
  const nameMap = await resolveNames({
    accessToken,
    entitlementToken,
    region,
    puuids: membersRaw.map((m) => m.Subject),
  });

  const members = membersRaw.map((m) => {
    const names = nameMap[m.Subject] || {};
    const identity = m.PlayerIdentity || {};
    return {
      puuid: m.Subject,
      gameName: names.gameName || null,
      tagLine: names.tagLine || null,
      riotId:
        names.gameName && names.tagLine ? `${names.gameName}#${names.tagLine}` : null,
      isOwner: Boolean(m.IsOwner),
      isReady: Boolean(m.IsReady),
      accountLevel: identity.AccountLevel ?? null,
      competitiveTier: m.CompetitiveTier ?? null,
      rankTier: tierName(m.CompetitiveTier),
      isSelf: selfPuuid ? m.Subject === selfPuuid : false,
    };
  });

  const queueId = party?.MatchmakingData?.QueueID || null;
  const requests = Array.isArray(party?.Requests)
    ? party.Requests
    : Array.isArray(player?.Requests)
      ? player.Requests
      : [];

  return {
    partyId: party?.ID || player?.CurrentPartyID || null,
    state: party?.State || null,
    previousState: party?.PreviousState || null,
    accessibility: party?.Accessibility || null,
    queueId,
    queueLabel: queueLabel(queueId),
    region: toHenrikRegion(region),
    shard: shardForRegion(region),
    partyCode: party?.InviteCode || null,
    queueing: isQueueing(party),
    queueEntryTime: party?.QueueEntryTime || null,
    eligibleQueues: Array.isArray(party?.EligibleQueues) ? party.EligibleQueues : [],
    members,
    memberCount: members.length,
    isOwner: members.some((m) => m.isSelf && m.isOwner),
    selfPuuid: selfPuuid || null,
    requests: requests.map((r) => ({
      id: r.ID,
      partyId: r.PartyID,
      requestedBy: r.RequestedBySubject,
      expiresIn: r.ExpiresIn,
      createdAt: r.CreatedAt,
    })),
    errorNotification: party?.ErrorNotification?.ErrorType || null,
  };
}

/**
 * Load current party for the authenticated Riot session.
 */
async function getCurrentParty({ accessToken, entitlementToken, region, puuid }) {
  if (!accessToken || !entitlementToken) {
    const err = new Error(
      "Live Riot entitlement + access tokens required for party. Use desktop Riot Client connect, or reconnect RSO with a session that can mint entitlements."
    );
    err.status = 401;
    err.code = "TOKENS_REQUIRED";
    throw err;
  }
  if (!puuid) {
    const err = new Error("Missing Riot puuid for party lookup");
    err.status = 400;
    err.code = "PUUID_REQUIRED";
    throw err;
  }

  const affinity = toHenrikRegion(region || "eu");
  const player = await glzRequest({
    method: "GET",
    path: `/parties/v1/players/${encodeURIComponent(puuid)}`,
    region: affinity,
    accessToken,
    entitlementToken,
  });

  const partyId = player?.CurrentPartyID;
  if (!partyId) {
    return {
      party: null,
      player,
      message: "No active Valorant party (is the game running / are you in client?)",
    };
  }

  const party = await glzRequest({
    method: "GET",
    path: `/parties/v1/parties/${encodeURIComponent(partyId)}`,
    region: affinity,
    accessToken,
    entitlementToken,
  });

  const shaped = await shapeParty({
    party,
    player,
    accessToken,
    entitlementToken,
    region: affinity,
    selfPuuid: puuid,
  });

  return { party: shaped, rawPartyId: partyId };
}

async function partyAction({
  accessToken,
  entitlementToken,
  region,
  partyId,
  method = "POST",
  pathSuffix,
  body,
}) {
  const affinity = toHenrikRegion(region || "eu");
  return glzRequest({
    method,
    path: `/parties/v1/parties/${encodeURIComponent(partyId)}${pathSuffix}`,
    region: affinity,
    accessToken,
    entitlementToken,
    body,
  });
}

async function startQueue(ctx) {
  return partyAction({ ...ctx, pathSuffix: "/matchmaking/join", body: {} });
}

async function stopQueue(ctx) {
  return partyAction({ ...ctx, pathSuffix: "/matchmaking/leave", body: {} });
}

async function setQueueId(ctx, queueId) {
  return partyAction({
    ...ctx,
    pathSuffix: "/queue",
    body: { queueId: String(queueId) },
  });
}

async function inviteByRiotId(ctx, gameName, tagLine) {
  const name = encodeURIComponent(gameName);
  const tag = encodeURIComponent(tagLine);
  return partyAction({
    ...ctx,
    pathSuffix: `/invites/name/${name}/tag/${tag}`,
    body: {},
  });
}

async function transferOwnership(ctx, targetPuuid) {
  return partyAction({
    ...ctx,
    pathSuffix: `/members/${encodeURIComponent(targetPuuid)}/owner`,
    body: {},
  });
}

async function setMemberReady(ctx, puuid, ready) {
  return partyAction({
    ...ctx,
    pathSuffix: `/members/${encodeURIComponent(puuid)}/setReady`,
    body: { ready: Boolean(ready) },
  });
}

async function generatePartyCode(ctx) {
  return partyAction({
    ...ctx,
    method: "POST",
    pathSuffix: "/invitecode",
    body: {},
  });
}

async function setAccessibility(ctx, accessibility) {
  const value = String(accessibility || "OPEN").toUpperCase() === "CLOSED" ? "CLOSED" : "OPEN";
  return partyAction({
    ...ctx,
    pathSuffix: "/accessibility",
    body: { accessibility: value },
  });
}

async function leaveParty({ accessToken, entitlementToken, region, puuid }) {
  const affinity = toHenrikRegion(region || "eu");
  return glzRequest({
    method: "DELETE",
    path: `/parties/v1/players/${encodeURIComponent(puuid)}`,
    region: affinity,
    accessToken,
    entitlementToken,
  });
}

module.exports = {
  fetchEntitlement,
  fetchClientVersion,
  getCurrentParty,
  startQueue,
  stopQueue,
  setQueueId,
  inviteByRiotId,
  transferOwnership,
  setMemberReady,
  generatePartyCode,
  setAccessibility,
  leaveParty,
  shapeParty,
  tierName,
  queueLabel,
  shardForRegion,
  glzBase,
  pdBase,
  riotHeaders,
};
