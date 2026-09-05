/**
 * Electron-local friends/presence shaping (Adım 4).
 * Self-contained copy for asar — do NOT require ../backend (not packaged).
 * Keep in sync with frontend/backend/lib/valorantFriends.js shape exports.
 * Never logs tokens or passwords.
 */

const TIER_NAMES = [
  "Unranked","Unranked","Unranked",
  "Iron 1","Iron 2","Iron 3",
  "Bronze 1","Bronze 2","Bronze 3",
  "Silver 1","Silver 2","Silver 3",
  "Gold 1","Gold 2","Gold 3",
  "Platinum 1","Platinum 2","Platinum 3",
  "Diamond 1","Diamond 2","Diamond 3",
  "Ascendant 1","Ascendant 2","Ascendant 3",
  "Immortal 1","Immortal 2","Immortal 3",
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

function decodePrivatePresence(privateField) {
  if (!privateField || typeof privateField !== "string") return null;
  try {
    const json = Buffer.from(privateField, "base64").toString("utf8");
    const raw = JSON.parse(json);
    if (!raw || typeof raw !== "object") return null;

    const match = raw.matchPresenceData || {};
    const party = raw.partyPresenceData || {};
    const player = raw.playerPresenceData || {};

    const sessionLoopState =
      match.sessionLoopState ||
      raw.sessionLoopState ||
      party.partyOwnerSessionLoopState ||
      raw.partyOwnerSessionLoopState ||
      null;

    const queueId = party.queueId || raw.queueId || null;
    const partySize = party.partySize ?? raw.partySize ?? null;
    const maxPartySize = party.maxPartySize ?? raw.maxPartySize ?? null;
    const partyAccessibility =
      party.partyAccessibility || raw.partyAccessibility || null;
    const isPartyOwner = Boolean(party.isPartyOwner ?? raw.isPartyOwner);
    const competitiveTier =
      player.competitiveTier ?? raw.competitiveTier ?? null;
    const accountLevel = player.accountLevel ?? raw.accountLevel ?? null;
    const isIdle = Boolean(player.isIdle ?? raw.isIdle);
    const matchMap = match.matchMap || raw.matchMap || party.partyOwnerMatchMap || null;
    const allyScore =
      match.partyOwnerMatchScoreAllyTeam ??
      raw.partyOwnerMatchScoreAllyTeam ??
      null;
    const enemyScore =
      match.partyOwnerMatchScoreEnemyTeam ??
      raw.partyOwnerMatchScoreEnemyTeam ??
      null;

    return {
      isValid: raw.isValid !== false,
      sessionLoopState: sessionLoopState ? String(sessionLoopState).toUpperCase() : null,
      queueId,
      queueLabel: queueLabel(queueId),
      partyId: party.partyId || raw.partyId || null,
      partySize,
      maxPartySize,
      partyAccessibility,
      partyState: party.partyState || raw.partyState || null,
      isPartyOwner,
      competitiveTier,
      rankTier: tierName(competitiveTier),
      accountLevel,
      isIdle,
      matchMap,
      score:
        allyScore != null && enemyScore != null
          ? { ally: Number(allyScore), enemy: Number(enemyScore) }
          : null,
      provisioningFlow:
        match.provisioningFlow ||
        raw.provisioningFlow ||
        party.partyOwnerProvisioningFlow ||
        null,
    };
  } catch {
    return null;
  }
}

/**
 * Map Riot chat state + private presence → companion presence label.
 * online | away | dnd | menus | queue | pregame | ingame | offline
 */
function presenceStatus(presenceRow, privateDecoded) {
  if (!presenceRow) return "offline";
  const product = String(presenceRow.product || "").toLowerCase();
  const state = String(presenceRow.state || "").toLowerCase();
  const loop = privateDecoded?.sessionLoopState || null;

  // Valorant session loop wins over chat away/dnd (still "in game").
  if (product === "valorant" && loop) {
    if (loop === "INGAME") return "ingame";
    if (loop === "PREGAME") return "pregame";
    if (loop === "MENUS") {
      const ps = String(privateDecoded?.partyState || "").toUpperCase();
      if (ps.includes("MATCHMAKING") || ps.includes("QUEUE")) return "queue";
      if (privateDecoded?.isIdle || state === "away") return "away";
      if (state === "dnd") return "dnd";
      return "menus";
    }
  }

  if (privateDecoded?.isIdle || state === "away") return "away";
  if (state === "dnd") return "dnd";
  if (state === "chat" || state === "mobile") return "online";
  return state || "online";
}

function shapePresence(row) {
  if (!row) return null;
  const privateDecoded = decodePrivatePresence(row.private);
  const status = presenceStatus(row, privateDecoded);
  const gameName = row.game_name || row.gameName || null;
  const tagLine = row.game_tag || row.tagLine || null;
  return {
    puuid: row.puuid || null,
    gameName,
    tagLine,
    riotId: gameName && tagLine ? `${gameName}#${tagLine}` : null,
    product: row.product || null,
    chatState: row.state || null,
    region: row.region || null,
    status,
    private: privateDecoded,
    time: row.time || null,
  };
}

function shapeFriend(row, presenceByPuuid = {}) {
  const puuid = row?.puuid || null;
  const gameName = row?.game_name || row?.gameName || null;
  const tagLine = row?.game_tag || row?.tagLine || null;
  const presence = puuid ? presenceByPuuid[puuid] || null : null;
  const status = presence?.status || "offline";
  return {
    puuid,
    gameName,
    tagLine,
    riotId: gameName && tagLine ? `${gameName}#${tagLine}` : null,
    note: row?.note || "",
    group: row?.group || row?.displayGroup || null,
    region: row?.region || presence?.region || null,
    lastOnlineTs: row?.last_online_ts ?? row?.lastOnlineTs ?? null,
    activePlatform: row?.activePlatform || null,
    status,
    presence,
    online: status !== "offline",
    inGame: status === "ingame" || status === "pregame" || status === "queue",
  };
}

function shapeFriendRequest(row) {
  const gameName = row?.game_name || row?.gameName || null;
  const tagLine = row?.game_tag || row?.tagLine || null;
  const sub = String(row?.subscription || "").toLowerCase();
  return {
    puuid: row?.puuid || null,
    gameName,
    tagLine,
    riotId: gameName && tagLine ? `${gameName}#${tagLine}` : null,
    note: row?.note || "",
    region: row?.region || null,
    subscription: sub === "pending_in" || sub === "pending_out" ? sub : sub || null,
    inbound: sub === "pending_in",
    outbound: sub === "pending_out",
  };
}

function mergeFriendsAndPresences({ friends = [], presences = [], selfPuuid = null } = {}) {
  const presenceByPuuid = {};
  for (const raw of presences || []) {
    const shaped = shapePresence(raw);
    if (!shaped?.puuid) continue;
    if (selfPuuid && shaped.puuid === selfPuuid) continue;
    presenceByPuuid[shaped.puuid] = shaped;
  }

  const list = (friends || [])
    .map((f) => shapeFriend(f, presenceByPuuid))
    .filter((f) => f.puuid && (!selfPuuid || f.puuid !== selfPuuid));

  const statusRank = {
    ingame: 0,
    pregame: 1,
    queue: 2,
    menus: 3,
    online: 4,
    dnd: 5,
    away: 6,
    offline: 7,
  };
  list.sort((a, b) => {
    const ra = statusRank[a.status] ?? 9;
    const rb = statusRank[b.status] ?? 9;
    if (ra !== rb) return ra - rb;
    return String(a.riotId || "").localeCompare(String(b.riotId || ""));
  });

  const onlineCount = list.filter((f) => f.online).length;
  const inGameCount = list.filter((f) => f.inGame).length;

  return {
    friends: list,
    counts: {
      total: list.length,
      online: onlineCount,
      inGame: inGameCount,
      offline: list.length - onlineCount,
    },
  };
}

function shapeFriendRequests(requests = []) {
  const shaped = (requests || []).map(shapeFriendRequest).filter((r) => r.puuid);
  return {
    requests: shaped,
    inbound: shaped.filter((r) => r.inbound),
    outbound: shaped.filter((r) => r.outbound),
  };
}

module.exports = {
  decodePrivatePresence,
  presenceStatus,
  shapePresence,
  shapeFriend,
  shapeFriendRequest,
  mergeFriendsAndPresences,
  shapeFriendRequests,
};
