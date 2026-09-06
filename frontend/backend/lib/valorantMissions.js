/**
 * Valorant missions / contracts / battle pass (Adım 5).
 * Thin PD proxy — never logs tokens or passwords.
 *
 * Live data: access + entitlement (Electron headers preferred).
 * Ops gate: RIOT_API_KEY must be set on Render before Companion enables
 * missions (same checklist Demir uses for account-v1). The key itself is
 * not sent to pd.*; player tokens drive /contracts/v1/*.
 */

const {
  fetchClientVersion,
  pdBase,
  riotHeaders,
  shardForRegion,
} = require("./valorantParty");
const { toHenrikRegion } = require("./riotLink");

function riotApiKeyConfigured() {
  return Boolean(String(process.env.RIOT_API_KEY || "").trim());
}

function notConfiguredPayload() {
  return {
    configured: false,
    envNeeded: ["RIOT_API_KEY"],
    implemented: true,
    adim: 5,
    missions: [],
    contracts: [],
    battlePass: null,
    ok: false,
    code: "RIOT_API_KEY_MISSING",
    note: "Set RIOT_API_KEY on Render, then redeploy. Live missions still need X-Riot-Access-Token + X-Riot-Entitlement (desktop Riot Client).",
  };
}

function missionsCapabilities() {
  const configured = riotApiKeyConfigured();
  return {
    implemented: true,
    adim: 5,
    configured,
    envNeeded: configured ? [] : ["RIOT_API_KEY"],
    features: {
      weeklyMissions: true,
      agentContracts: true,
      battlePass: true,
      activateContract: true,
    },
    uiOwner: "dima",
    clientHook: "useValorantMissions",
    endpoints: {
      status: "GET /api/valorant/missions/status",
      missions: "GET /api/valorant/missions",
      contracts: "GET /api/valorant/contracts",
      battlePass: "GET /api/valorant/battlepass",
      activate: "POST /api/valorant/contracts/activate",
    },
    note: configured
      ? "Missions/contracts/BP via PD /contracts/v1 — send live Riot tokens as headers (Electron safeStorage)."
      : "RIOT_API_KEY missing on Render — missions endpoints return configured:false (no crash).",
  };
}

let cachedDefs = { map: null, at: 0 };

async function loadContractDefinitions() {
  const now = Date.now();
  if (cachedDefs.map && now - cachedDefs.at < 6 * 60 * 60 * 1000) {
    return cachedDefs.map;
  }
  try {
    const res = await fetch("https://valorant-api.com/v1/contracts");
    const body = await res.json().catch(() => ({}));
    const list = Array.isArray(body?.data) ? body.data : [];
    const map = {};
    for (const row of list) {
      if (!row?.uuid) continue;
      const relationType = row.content?.relationType || null;
      map[row.uuid] = {
        uuid: row.uuid,
        displayName: row.displayName || null,
        displayIcon: row.displayIcon || null,
        relationType,
        relationUuid: row.content?.relationUuid || null,
        kind:
          relationType === "Season"
            ? "battlepass"
            : relationType === "Agent"
              ? "agent"
              : relationType === "Event"
                ? "event"
                : "other",
        chapters: Array.isArray(row.content?.chapters) ? row.content.chapters.length : 0,
      };
    }
    cachedDefs = { map, at: now };
    return map;
  } catch {
    return cachedDefs.map || {};
  }
}

async function pdRequest({
  method = "GET",
  path,
  region,
  accessToken,
  entitlementToken,
  body = undefined,
}) {
  const clientVersion = await fetchClientVersion();
  const url = `${pdBase(region)}${path}`;
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
        `Riot contracts request failed (${res.status})`
    );
    err.status = res.status === 401 || res.status === 403 ? 401 : res.status || 502;
    err.code = res.status === 401 || res.status === 403 ? "TOKENS_INVALID" : "RIOT_CONTRACTS_ERROR";
    err.riot = json;
    throw err;
  }
  return json;
}

function shapeMission(row) {
  if (!row) return null;
  const objectives = row.Objectives && typeof row.Objectives === "object" ? row.Objectives : {};
  const objectiveEntries = Object.entries(objectives).map(([id, progress]) => ({
    id,
    progress: Number(progress) || 0,
  }));
  return {
    id: row.ID || null,
    complete: Boolean(row.Complete),
    expirationTime: row.ExpirationTime || null,
    objectives: objectiveEntries,
    objectiveProgress: objectiveEntries.reduce((sum, o) => sum + o.progress, 0),
  };
}

function shapeContract(row, defs = {}) {
  if (!row) return null;
  const defId = row.ContractDefinitionID || null;
  const def = defId ? defs[defId] || null : null;
  const progression = row.ContractProgression || {};
  return {
    contractDefinitionId: defId,
    displayName: def?.displayName || null,
    displayIcon: def?.displayIcon || null,
    kind: def?.kind || "other",
    relationType: def?.relationType || null,
    relationUuid: def?.relationUuid || null,
    level: row.ProgressionLevelReached ?? 0,
    xpTowardsNext: row.ProgressionTowardsNextLevel ?? 0,
    totalXp: progression.TotalProgressionEarned ?? 0,
  };
}

function pickBattlePass(contracts, defs) {
  const shaped = (contracts || []).map((c) => shapeContract(c, defs)).filter(Boolean);
  const bp =
    shaped.find((c) => c.kind === "battlepass") ||
    shaped.find((c) => /pass|battle/i.test(String(c.displayName || ""))) ||
    null;
  return bp;
}

/**
 * Fetch + shape missions / contracts / BP for a live Riot session.
 */
async function getMissionsBundle({ accessToken, entitlementToken, region, puuid }) {
  if (!riotApiKeyConfigured()) {
    return notConfiguredPayload();
  }
  if (!accessToken || !entitlementToken) {
    const err = new Error(
      "Live Riot entitlement + access tokens required for missions. Use desktop Riot Client connect."
    );
    err.status = 401;
    err.code = "TOKENS_REQUIRED";
    throw err;
  }
  if (!puuid) {
    const err = new Error("Missing Riot puuid for contracts lookup");
    err.status = 400;
    err.code = "PUUID_REQUIRED";
    throw err;
  }

  const affinity = toHenrikRegion(region || "eu");
  const raw = await pdRequest({
    method: "GET",
    path: `/contracts/v1/contracts/${encodeURIComponent(puuid)}`,
    region: affinity,
    accessToken,
    entitlementToken,
  });

  const defs = await loadContractDefinitions();
  const missions = Array.isArray(raw?.Missions)
    ? raw.Missions.map(shapeMission).filter(Boolean)
    : [];
  const contractsRaw = Array.isArray(raw?.Contracts) ? raw.Contracts : [];
  const contracts = contractsRaw
    .map((c) => shapeContract(c, defs))
    .filter(Boolean)
    .filter((c) => c.kind === "agent" || c.kind === "event" || c.kind === "other");
  const battlePass = pickBattlePass(contractsRaw, defs);
  const activeSpecial = raw?.ActiveSpecialContract
    ? shapeContract(
        contractsRaw.find((c) => c.ContractDefinitionID === raw.ActiveSpecialContract) || {
          ContractDefinitionID: raw.ActiveSpecialContract,
          ProgressionLevelReached: 0,
          ProgressionTowardsNextLevel: 0,
          ContractProgression: {},
        },
        defs
      )
    : null;

  const meta = raw?.MissionMetadata || {};
  return {
    ok: true,
    configured: true,
    envNeeded: [],
    adim: 5,
    region: affinity,
    shard: shardForRegion(affinity),
    puuid,
    version: raw?.Version ?? null,
    missions,
    missionCounts: {
      total: missions.length,
      complete: missions.filter((m) => m.complete).length,
      open: missions.filter((m) => !m.complete).length,
    },
    missionMetadata: {
      npeCompleted: Boolean(meta.NPECompleted),
      weeklyCheckpoint: meta.WeeklyCheckpoint || null,
      weeklyRefillTime: meta.WeeklyRefillTime || null,
    },
    battlePass,
    contracts,
    activeSpecialContract: activeSpecial,
    processedMatchCount: Array.isArray(raw?.ProcessedMatches) ? raw.ProcessedMatches.length : 0,
  };
}

async function activateContract({
  accessToken,
  entitlementToken,
  region,
  puuid,
  contractId,
}) {
  if (!riotApiKeyConfigured()) {
    return notConfiguredPayload();
  }
  if (!accessToken || !entitlementToken) {
    const err = new Error("Live Riot tokens required to activate a contract");
    err.status = 401;
    err.code = "TOKENS_REQUIRED";
    throw err;
  }
  if (!puuid || !contractId) {
    const err = new Error("puuid and contractId required");
    err.status = 400;
    err.code = "CONTRACT_ID_REQUIRED";
    throw err;
  }
  const affinity = toHenrikRegion(region || "eu");
  await pdRequest({
    method: "POST",
    path: `/contracts/v1/contracts/${encodeURIComponent(puuid)}/special/${encodeURIComponent(contractId)}`,
    region: affinity,
    accessToken,
    entitlementToken,
    body: {},
  });
  return getMissionsBundle({ accessToken, entitlementToken, region: affinity, puuid });
}

module.exports = {
  riotApiKeyConfigured,
  notConfiguredPayload,
  missionsCapabilities,
  getMissionsBundle,
  activateContract,
  shapeMission,
  shapeContract,
  pickBattlePass,
  loadContractDefinitions,
};
