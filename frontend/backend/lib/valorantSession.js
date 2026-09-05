/**
 * Thin Valorant session helpers for Companion Adım 2.
 * Never accepts or stores Riot passwords. Optional short-lived access /
 * entitlement tokens may be passed per-request for /api/valorant/me and
 * are never written to logs or the database.
 */

const { publicRiotCard, toHenrikRegion, resolveValorantLink } = require("./riotLink");

const REGION_SHARDS = {
  eu: "eu",
  na: "na",
  ap: "ap",
  kr: "kr",
  latam: "latam",
  br: "br",
};

function shardForRegion(region) {
  const r = toHenrikRegion(region || "eu");
  return REGION_SHARDS[r] || "eu";
}

async function fetchJson(url, headers = {}) {
  const res = await fetch(url, { headers });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

/**
 * Resolve Name#Tag (+ puuid) using Riot access token (RSO / local client).
 * Does not log the token.
 */
async function resolveMeFromAccessToken(accessToken) {
  if (!accessToken) return null;
  const clusters = ["europe", "americas", "asia"];
  for (const cluster of clusters) {
    const { ok, body } = await fetchJson(
      `https://${cluster}.api.riotgames.com/riot/account/v1/accounts/me`,
      { Authorization: `Bearer ${accessToken}` }
    );
    if (ok && body?.puuid) {
      return {
        puuid: body.puuid,
        gameName: body.gameName,
        tagLine: body.tagLine,
        source: "riot_account_me",
      };
    }
  }

  // Fallback: auth.riotgames.com/userinfo (RSO)
  const { ok, body } = await fetchJson("https://auth.riotgames.com/userinfo", {
    Authorization: `Bearer ${accessToken}`,
  });
  if (ok && (body?.sub || body?.acct)) {
    return {
      puuid: body.sub || null,
      gameName: body?.acct?.game_name || body?.game_name || null,
      tagLine: body?.acct?.tag_line || body?.tag_line || null,
      source: "userinfo",
    };
  }
  return null;
}

/**
 * Optional pd shared name-service using entitlement + access (client-session style).
 * Used when account/me is unavailable but local tokens exist.
 */
async function resolveMeFromEntitlements({ accessToken, entitlementToken, region = "eu", puuid }) {
  if (!accessToken || !entitlementToken || !puuid) return null;
  const shard = shardForRegion(region);
  const url = `https://pd.${shard}.a.pvp.net/name-service/v2/players`;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "X-Riot-Entitlements-JWT": entitlementToken,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify([puuid]),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !Array.isArray(body) || !body[0]) return null;
  const row = body[0];
  return {
    puuid: row.Subject || row.subject || puuid,
    gameName: row.GameName || row.gameName || null,
    tagLine: row.TagLine || row.tagLine || null,
    source: "pd_name_service",
  };
}

async function buildMePayload({
  linkRow = null,
  accessToken = null,
  entitlementToken = null,
  regionHint = null,
  puuidHint = null,
}) {
  let live = null;
  if (accessToken) {
    live = await resolveMeFromAccessToken(accessToken);
    if ((!live?.gameName || !live?.tagLine) && entitlementToken) {
      const fromPd = await resolveMeFromEntitlements({
        accessToken,
        entitlementToken,
        region: regionHint || linkRow?.region || "eu",
        puuid: live?.puuid || puuidHint || linkRow?.puuid,
      });
      if (fromPd) live = { ...live, ...fromPd };
    }
  }

  const region = toHenrikRegion(regionHint || linkRow?.region || "eu");
  const gameName = live?.gameName || linkRow?.game_name || null;
  const tagLine = live?.tagLine || linkRow?.tag_line || null;
  const puuid = live?.puuid || linkRow?.puuid || puuidHint || null;

  let rank = null;
  if (gameName && tagLine) {
    try {
      rank = await resolveValorantLink({ gameName, tagLine, region });
    } catch {
      rank = null;
    }
  }

  const card = publicRiotCard(
    linkRow ||
      (gameName && tagLine
        ? {
            game_name: gameName,
            tag_line: tagLine,
            region,
            puuid,
            rank_tier: rank?.rankTier || null,
            rank_rr: rank?.rankRr ?? null,
            rank_verified: Boolean(puuid),
            link_method: accessToken ? "local_client" : "riot_id",
          }
        : null)
  );

  return {
    ok: Boolean(gameName && tagLine),
    me: card
      ? {
          ...card,
          puuid: puuid || null,
          region: rank?.region || region,
          rankTier: rank?.rankTier || card.rankTier || null,
          rankRr: rank?.rankRr ?? card.rankRr ?? null,
          sessionLive: Boolean(accessToken),
          identitySource: live?.source || (linkRow ? "descall_link" : null),
        }
      : null,
    corsDecision:
      "Riot pd.*/glz.* are not browser-CORS friendly. Descall uses a thin Render proxy (/api/valorant/*) so the SPA never talks to Riot platform hosts directly. Electron may read the local Riot Client lockfile and keep tokens in safeStorage; only public identity is persisted on Descall.",
  };
}

module.exports = {
  buildMePayload,
  resolveMeFromAccessToken,
  resolveMeFromEntitlements,
  shardForRegion,
};
