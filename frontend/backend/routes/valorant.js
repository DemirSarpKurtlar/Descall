/**
 * Valorant Companion API (Adım 2–6; wallet / loadout / store).
 * Mounted at /valorant and /api/valorant.
 *
 * Security:
 * - Never accepts Riot passwords.
 * - Optional access/entitlement tokens are request-scoped only (headers),
 *   never logged, never upserted into user_riot_accounts.
 * - Public Name#Tag card may be synced without tokens.
 */

const express = require("express");
const supabase = require("../db/supabase");
const { requireAuth } = require("../middleware/auth");
const { publicRiotCard, rsoEnabled, henrikConfigured, parseRiotId } = require("../lib/riotLink");
const { buildMePayload } = require("../lib/valorantSession");

const router = express.Router();

const VALID_REGIONS = new Set(["eu", "na", "ap", "kr", "latam", "br"]);

async function getLink(userId) {
  const { data } = await supabase
    .from("user_riot_accounts")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  return data || null;
}

async function upsertPublicLink(userId, fields) {
  const row = {
    user_id: userId,
    puuid: fields.puuid || null,
    game_name: fields.gameName,
    tag_line: fields.tagLine,
    region: fields.region || "eu",
    rank_tier: fields.rankTier || null,
    rank_rr: fields.rankRr ?? null,
    rank_verified: Boolean(fields.verified),
    link_method: fields.linkMethod || "local_client",
    card_public: fields.cardPublic !== false,
    // Intentionally do NOT write access_token / refresh_token here.
    access_token: null,
    refresh_token: null,
    token_expires_at: null,
    rank_updated_at: fields.rankTier ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("user_riot_accounts")
    .upsert(row, { onConflict: "user_id" })
    .select("*")
    .single();

  if (error) {
    const err = new Error(error.message || "Failed to save Valorant link");
    err.status = 500;
    throw err;
  }
  return data;
}

function readTokenHeaders(req) {
  const accessToken =
    req.get("x-riot-access-token") ||
    (typeof req.body?.accessToken === "string" ? req.body.accessToken : null) ||
    null;
  const entitlementToken =
    req.get("x-riot-entitlement") ||
    req.get("x-riot-entitlements-jwt") ||
    (typeof req.body?.entitlementToken === "string" ? req.body.entitlementToken : null) ||
    null;
  // Hard reject anything that looks like a password field
  if (req.body?.password || req.body?.riotPassword || req.query?.password) {
    const err = new Error("Riot passwords are not accepted by Descall");
    err.status = 400;
    throw err;
  }
  return { accessToken, entitlementToken };
}

// GET /api/valorant/status — capabilities for Companion UI
router.get("/status", requireAuth, async (req, res) => {
  try {
    const link = await getLink(req.user.id);
    return res.json({
      rsoEnabled: rsoEnabled(),
      henrikConfigured: henrikConfigured(),
      linked: Boolean(link),
      valorant: publicRiotCard(link),
      authOptions: {
        localLockfile: true, // Electron only; UI gates on window.electronAPI
        rso: rsoEnabled(),
        nameTagPublic: true,
      },
      envNeededIfRsoMissing: rsoEnabled()
        ? []
        : [
            "RIOT_CLIENT_ID",
            "RIOT_CLIENT_SECRET",
            "RIOT_REDIRECT_URI",
            "Optional: RIOT_API_KEY",
          ],
      corsDecision:
        "Thin Render proxy at /api/valorant/* — browser does not call Riot pd/glz hosts directly (CORS + secret safety).",
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to load Valorant status" });
  }
});

/**
 * GET /api/valorant/me
 * Auth: Descall JWT required.
 * Optional headers (never stored):
 *   X-Riot-Access-Token
 *   X-Riot-Entitlement  (or X-Riot-Entitlements-JWT)
 */
router.get("/me", requireAuth, async (req, res) => {
  try {
    const { accessToken, entitlementToken } = readTokenHeaders(req);
    const link = await getLink(req.user.id);
    const regionHint = req.query.region || link?.region || null;
    const payload = await buildMePayload({
      linkRow: link,
      accessToken,
      entitlementToken,
      regionHint,
      puuidHint: link?.puuid || null,
    });
    if (!payload.ok && !payload.me) {
      return res.status(404).json({
        error: "No Valorant identity yet. Connect Riot Client (desktop) or link Name#TAG / RSO.",
        ...payload,
      });
    }
    return res.json(payload);
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || "Failed to load /valorant/me" });
  }
});

/**
 * POST /api/valorant/session/link
 * Persist public identity only (Name#Tag, region, puuid, method).
 * Body must NOT include tokens or passwords.
 */
router.post("/session/link", requireAuth, async (req, res) => {
  try {
    readTokenHeaders(req); // throws if password present
    if (req.body?.accessToken || req.body?.entitlementToken || req.body?.refreshToken) {
      return res.status(400).json({
        error:
          "Do not send Riot tokens to /session/link. Keep tokens in Electron safeStorage; send public identity only.",
      });
    }

    const gameName = String(req.body?.gameName || "").trim();
    const tagLine = String(req.body?.tagLine || "").trim();
    const regionRaw = String(req.body?.region || "eu").toLowerCase();
    const region = VALID_REGIONS.has(regionRaw) ? regionRaw : "eu";
    const linkMethod = String(req.body?.linkMethod || "local_client").slice(0, 32);
    const puuid = req.body?.puuid ? String(req.body.puuid).slice(0, 80) : null;

    if (!gameName || !tagLine) {
      // Allow Name#TAG combined field
      const parsed = parseRiotId(req.body?.riotId);
      if (!parsed) {
        return res.status(400).json({ error: "gameName and tagLine (or riotId Name#TAG) required" });
      }
      return await finishLink(req, res, {
        gameName: parsed.gameName,
        tagLine: parsed.tagLine,
        region,
        linkMethod,
        puuid,
      });
    }

    return await finishLink(req, res, { gameName, tagLine, region, linkMethod, puuid });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message || "Link failed" });
  }
});

async function finishLink(req, res, fields) {
  let gameName = fields.gameName;
  let tagLine = fields.tagLine;
  let region = fields.region;
  let linkMethod = fields.linkMethod;
  let puuid = fields.puuid;

  const { data: taken } = await supabase
    .from("user_riot_accounts")
    .select("user_id")
    .ilike("game_name", gameName)
    .ilike("tag_line", tagLine)
    .maybeSingle();
  if (taken && taken.user_id !== req.user.id) {
    return res.status(409).json({ error: "This Riot ID is already linked to another Descall account" });
  }

  // Optional rank enrich (Henrik) — public profile only
  let rankTier = null;
  let rankRr = null;
  let verified = Boolean(puuid);
  try {
    const { resolveValorantLink } = require("../lib/riotLink");
    const resolved = await resolveValorantLink({ gameName, tagLine, region });
    rankTier = resolved.rankTier;
    rankRr = resolved.rankRr;
    puuid = puuid || resolved.puuid;
    verified = Boolean(resolved.verified || puuid);
    region = resolved.region || region;
    gameName = resolved.gameName || gameName;
    tagLine = resolved.tagLine || tagLine;
  } catch {
    /* public link still OK without rank */
  }

  const saved = await upsertPublicLink(req.user.id, {
    gameName,
    tagLine,
    region,
    puuid,
    rankTier,
    rankRr,
    verified,
    linkMethod,
    cardPublic: true,
  });

  return res.json({ success: true, valorant: publicRiotCard(saved) });
}

/** DELETE /api/valorant/session — clear Descall public link (tokens never stored here). */
router.delete("/session", requireAuth, async (req, res) => {
  try {
    await supabase.from("user_riot_accounts").delete().eq("user_id", req.user.id);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: "Failed to disconnect" });
  }
});


/* ─── Adım 3: Party + queue (GLZ thin proxy) ─── */

const partyApi = require("../lib/valorantParty");

async function resolveLiveSession(req) {
  readTokenHeaders(req); // password guard
  let { accessToken, entitlementToken } = readTokenHeaders(req);
  const link = await getLink(req.user.id);
  const region =
    (typeof req.query.region === "string" && req.query.region) ||
    (typeof req.body?.region === "string" && req.body.region) ||
    link?.region ||
    "eu";

  if (!accessToken && link?.access_token) {
    accessToken = link.access_token;
  }

  if (accessToken && !entitlementToken) {
    entitlementToken = await partyApi.fetchEntitlement(accessToken);
  }

  let puuid =
    (typeof req.query.puuid === "string" && req.query.puuid) ||
    (typeof req.body?.puuid === "string" && req.body.puuid) ||
    link?.puuid ||
    null;

  if (!puuid && accessToken) {
    try {
      const { resolveMeFromAccessToken } = require("../lib/valorantSession");
      const me = await resolveMeFromAccessToken(accessToken);
      puuid = me?.puuid || null;
    } catch {
      /* ignore */
    }
  }

  return {
    accessToken,
    entitlementToken,
    region,
    puuid,
    link,
    hasLiveTokens: Boolean(accessToken && entitlementToken),
  };
}

async function reloadParty(session) {
  const result = await partyApi.getCurrentParty({
    accessToken: session.accessToken,
    entitlementToken: session.entitlementToken,
    region: session.region,
    puuid: session.puuid,
  });
  return result;
}

function partyCtx(session, partyId) {
  return {
    accessToken: session.accessToken,
    entitlementToken: session.entitlementToken,
    region: session.region,
    partyId,
  };
}

// GET /api/valorant/party
router.get("/party", requireAuth, async (req, res) => {
  try {
    const session = await resolveLiveSession(req);
    if (!session.hasLiveTokens) {
      return res.status(401).json({
        error:
          "Party needs a live Riot Client session (access + entitlement). Connect via desktop Riot Client, or send X-Riot-Access-Token + X-Riot-Entitlement headers.",
        code: "TOKENS_REQUIRED",
        party: null,
        hint: "Electron: Companion → Optional Riot Client on this PC while Valorant is open.",
      });
    }
    if (!session.puuid) {
      return res.status(400).json({
        error: "Missing Riot puuid — reconnect Riot session",
        code: "PUUID_REQUIRED",
        party: null,
      });
    }
    const result = await reloadParty(session);
    return res.json({
      ok: true,
      party: result.party,
      message: result.message || null,
    });
  } catch (err) {
    return res.status(err.status || 500).json({
      error: err.message || "Failed to load party",
      code: err.code || null,
      party: null,
    });
  }
});

async function withPartyMutation(req, res, mutator) {
  try {
    const session = await resolveLiveSession(req);
    if (!session.hasLiveTokens || !session.puuid) {
      return res.status(401).json({
        error: "Live Riot tokens required for party actions",
        code: "TOKENS_REQUIRED",
      });
    }
    const current = await reloadParty(session);
    const partyId = current.rawPartyId || current.party?.partyId;
    if (!partyId) {
      return res.status(404).json({
        error: current.message || "No active party",
        party: null,
      });
    }
    await mutator(partyCtx(session, partyId), session, current);
    const refreshed = await reloadParty(session);
    return res.json({ ok: true, party: refreshed.party });
  } catch (err) {
    return res.status(err.status || 500).json({
      error: err.message || "Party action failed",
      code: err.code || null,
    });
  }
}

// POST /api/valorant/party/queue/start
router.post("/party/queue/start", requireAuth, async (req, res) => {
  return withPartyMutation(req, res, async (ctx) => {
    await partyApi.startQueue(ctx);
  });
});

// POST /api/valorant/party/queue/stop
router.post("/party/queue/stop", requireAuth, async (req, res) => {
  return withPartyMutation(req, res, async (ctx) => {
    await partyApi.stopQueue(ctx);
  });
});

// POST /api/valorant/party/queue — body: { queueId }
router.post("/party/queue", requireAuth, async (req, res) => {
  const queueId = String(req.body?.queueId || "").trim();
  if (!queueId) {
    return res.status(400).json({ error: "queueId required" });
  }
  return withPartyMutation(req, res, async (ctx) => {
    await partyApi.setQueueId(ctx, queueId);
  });
});

// POST /api/valorant/party/invite — body: { riotId } or { gameName, tagLine }
router.post("/party/invite", requireAuth, async (req, res) => {
  let gameName = String(req.body?.gameName || "").trim();
  let tagLine = String(req.body?.tagLine || "").trim();
  if (!gameName || !tagLine) {
    const parsed = parseRiotId(req.body?.riotId);
    if (!parsed) {
      return res.status(400).json({ error: "riotId (Name#TAG) or gameName+tagLine required" });
    }
    gameName = parsed.gameName;
    tagLine = parsed.tagLine;
  }
  return withPartyMutation(req, res, async (ctx) => {
    await partyApi.inviteByRiotId(ctx, gameName, tagLine);
  });
});

// POST /api/valorant/party/transfer — body: { puuid }
router.post("/party/transfer", requireAuth, async (req, res) => {
  const target = String(req.body?.puuid || "").trim();
  if (!target) {
    return res.status(400).json({ error: "puuid required" });
  }
  return withPartyMutation(req, res, async (ctx) => {
    await partyApi.transferOwnership(ctx, target);
  });
});

// POST /api/valorant/party/ready — body: { ready: boolean }
router.post("/party/ready", requireAuth, async (req, res) => {
  const ready = req.body?.ready !== false;
  return withPartyMutation(req, res, async (ctx, session) => {
    await partyApi.setMemberReady(ctx, session.puuid, ready);
  });
});

// POST /api/valorant/party/code — generate / refresh invite code
router.post("/party/code", requireAuth, async (req, res) => {
  return withPartyMutation(req, res, async (ctx) => {
    await partyApi.generatePartyCode(ctx);
  });
});

// POST /api/valorant/party/accessibility — body: { accessibility: OPEN|CLOSED }
router.post("/party/accessibility", requireAuth, async (req, res) => {
  return withPartyMutation(req, res, async (ctx) => {
    await partyApi.setAccessibility(ctx, req.body?.accessibility);
  });
});


/* ─── Adım 4 note ───
 * Friends / presence / friend-requests are served from Electron local chat
 * (lockfile → /chat/v4/*). Render cannot reach 127.0.0.1 on the user's PC.
 * Party invite from a friend still uses POST /party/invite (Adım 3 GLZ).
 * Adım 6 wallet/loadout/store routes are registered after missions below.
 */


// GET /api/valorant/friends/status — capabilities for Dima's Companion friends panel
router.get("/friends/status", requireAuth, async (_req, res) => {
  return res.json({
    implemented: true,
    adim: 4,
    source: "electron_local_chat",
    uiOwner: "dima",
    clientHook: "useValorantFriends",
    endpoints: {
      status: "GET /api/valorant/friends/status",
      partyInvite: "POST /api/valorant/friends/party-invite",
      partyInviteAlias: "POST /api/valorant/party/invite",
      list: "IPC valorant:local-friends (desktop)",
      sendRequest: "IPC valorant:local-friend-request-send",
      removeRequest: "IPC valorant:local-friend-request-remove",
      acceptRequest: "IPC valorant:local-friend-request-accept",
      missionsStatus: "GET /api/valorant/missions/status (Adım 5)",
      missions: "GET /api/valorant/missions (Adım 5)",
      storeStatus: "GET /api/valorant/store/status (Adım 6)",
      wallet: "GET /api/valorant/wallet (Adım 6)",
      loadout: "GET|PUT /api/valorant/loadout (Adım 6)",
    },
    note: "Friends + presence require Descall desktop + Riot Client on the same PC. Web RSO alone cannot list Riot friends. Party invite uses live GLZ tokens (Adım 3).",
  });
});

/**
 * POST /api/valorant/friends/party-invite
 * Convenience alias for Dima's friends panel → same GLZ invite as /party/invite.
 * Body: { riotId } or { gameName, tagLine }
 * Headers: X-Riot-Access-Token + X-Riot-Entitlement when available.
 */
router.post("/friends/party-invite", requireAuth, async (req, res) => {
  let gameName = String(req.body?.gameName || "").trim();
  let tagLine = String(req.body?.tagLine || "").trim();
  if (!gameName || !tagLine) {
    const parsed = parseRiotId(req.body?.riotId);
    if (!parsed) {
      return res.status(400).json({ error: "riotId (Name#TAG) or gameName+tagLine required" });
    }
    gameName = parsed.gameName;
    tagLine = parsed.tagLine;
  }
  return withPartyMutation(req, res, async (ctx) => {
    await partyApi.inviteByRiotId(ctx, gameName, tagLine);
  });
});

/**
 * POST /api/valorant/friends/shape
 * Optional helper for the desktop panel: shape raw lockfile friends + presences
 * (never accepts passwords/tokens in body for storage — tokens ignored if present).
 * Body: { friends, presences, selfPuuid? }
 */
router.post("/friends/shape", requireAuth, async (req, res) => {
  try {
    if (req.body?.password || req.body?.riotPassword) {
      return res.status(400).json({ error: "Riot passwords are not accepted by Descall" });
    }
    const { mergeFriendsAndPresences, shapeFriendRequests } = require("../lib/valorantFriends");
    const friends = Array.isArray(req.body?.friends) ? req.body.friends : [];
    const presences = Array.isArray(req.body?.presences) ? req.body.presences : [];
    const requests = Array.isArray(req.body?.requests) ? req.body.requests : [];
    const selfPuuid = req.body?.selfPuuid ? String(req.body.selfPuuid) : null;
    const merged = mergeFriendsAndPresences({ friends, presences, selfPuuid });
    const shapedRequests = shapeFriendRequests(requests);
    return res.json({
      ok: true,
      ...merged,
      requests: shapedRequests.requests,
      inbound: shapedRequests.inbound,
      outbound: shapedRequests.outbound,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to shape friends" });
  }
});


/* ─── Adım 5: Missions / contracts / battle pass (PD thin proxy) ─── */

const missionsApi = require("../lib/valorantMissions");

// GET /api/valorant/missions/status — capabilities (+ RIOT_API_KEY gate)
router.get("/missions/status", requireAuth, async (_req, res) => {
  return res.json(missionsApi.missionsCapabilities());
});

async function withMissionsSession(req, res, handler) {
  try {
    if (!missionsApi.riotApiKeyConfigured()) {
      return res.json(missionsApi.notConfiguredPayload());
    }
    const session = await resolveLiveSession(req);
    if (!session.hasLiveTokens) {
      return res.status(401).json({
        error:
          "Missions need a live Riot Client session (access + entitlement). Connect via desktop Riot Client, or send X-Riot-Access-Token + X-Riot-Entitlement headers.",
        code: "TOKENS_REQUIRED",
        configured: true,
        envNeeded: [],
        missions: [],
        contracts: [],
        battlePass: null,
        hint: "Electron: Companion → Optional Riot Client on this PC while Valorant is open.",
      });
    }
    if (!session.puuid) {
      return res.status(400).json({
        error: "Missing Riot puuid — reconnect Riot session",
        code: "PUUID_REQUIRED",
        configured: true,
        missions: [],
        contracts: [],
        battlePass: null,
      });
    }
    const payload = await handler(session);
    return res.json(payload);
  } catch (err) {
    return res.status(err.status || 500).json({
      error: err.message || "Missions request failed",
      code: err.code || null,
      configured: missionsApi.riotApiKeyConfigured(),
      missions: [],
      contracts: [],
      battlePass: null,
    });
  }
}

// GET /api/valorant/missions — weekly missions + BP + contracts bundle
router.get("/missions", requireAuth, async (req, res) => {
  return withMissionsSession(req, res, async (session) => {
    return missionsApi.getMissionsBundle({
      accessToken: session.accessToken,
      entitlementToken: session.entitlementToken,
      region: session.region,
      puuid: session.puuid,
    });
  });
});

// GET /api/valorant/contracts — same bundle (contracts-first alias for Dima)
router.get("/contracts", requireAuth, async (req, res) => {
  return withMissionsSession(req, res, async (session) => {
    const bundle = await missionsApi.getMissionsBundle({
      accessToken: session.accessToken,
      entitlementToken: session.entitlementToken,
      region: session.region,
      puuid: session.puuid,
    });
    return bundle;
  });
});

// GET /api/valorant/battlepass — BP slice of the contracts response
router.get("/battlepass", requireAuth, async (req, res) => {
  return withMissionsSession(req, res, async (session) => {
    const bundle = await missionsApi.getMissionsBundle({
      accessToken: session.accessToken,
      entitlementToken: session.entitlementToken,
      region: session.region,
      puuid: session.puuid,
    });
    if (bundle.configured === false) return bundle;
    return {
      ok: bundle.ok,
      configured: true,
      envNeeded: [],
      adim: 5,
      battlePass: bundle.battlePass,
      activeSpecialContract: bundle.activeSpecialContract,
      region: bundle.region,
      shard: bundle.shard,
    };
  });
});

/**
 * POST /api/valorant/contracts/activate
 * Body: { contractId }
 * Headers: X-Riot-Access-Token + X-Riot-Entitlement
 */
router.post("/contracts/activate", requireAuth, async (req, res) => {
  try {
    if (!missionsApi.riotApiKeyConfigured()) {
      return res.json(missionsApi.notConfiguredPayload());
    }
    const contractId = String(req.body?.contractId || req.body?.contractDefinitionId || "").trim();
    if (!contractId) {
      return res.status(400).json({ error: "contractId required", code: "CONTRACT_ID_REQUIRED" });
    }
    const session = await resolveLiveSession(req);
    if (!session.hasLiveTokens || !session.puuid) {
      return res.status(401).json({
        error: "Live Riot tokens required to activate a contract",
        code: "TOKENS_REQUIRED",
      });
    }
    const bundle = await missionsApi.activateContract({
      accessToken: session.accessToken,
      entitlementToken: session.entitlementToken,
      region: session.region,
      puuid: session.puuid,
      contractId,
    });
    return res.json(bundle);
  } catch (err) {
    return res.status(err.status || 500).json({
      error: err.message || "Activate contract failed",
      code: err.code || null,
    });
  }
});


/* ─── Adım 6: Wallet / inventory / loadout / daily store (PD thin proxy) ─── */

const storeApi = require("../lib/valorantStore");

// GET /api/valorant/store/status — capabilities (+ RIOT_API_KEY gate)
router.get("/store/status", requireAuth, async (_req, res) => {
  return res.json(storeApi.storeCapabilities());
});

async function withStoreSession(req, res, emptyShape, handler) {
  try {
    if (!storeApi.riotApiKeyConfigured()) {
      return res.json(storeApi.notConfiguredPayload(emptyShape));
    }
    const session = await resolveLiveSession(req);
    if (!session.hasLiveTokens) {
      return res.status(401).json({
        error:
          "Store/loadout need a live Riot Client session (access + entitlement). Connect via desktop Riot Client, or send X-Riot-Access-Token + X-Riot-Entitlement headers.",
        code: "TOKENS_REQUIRED",
        configured: true,
        envNeeded: [],
        ...emptyShape,
        hint: "Electron: Companion → Optional Riot Client on this PC while Valorant is open.",
      });
    }
    if (!session.puuid) {
      return res.status(400).json({
        error: "Missing Riot puuid — reconnect Riot session",
        code: "PUUID_REQUIRED",
        configured: true,
        ...emptyShape,
      });
    }
    const payload = await handler(session);
    return res.json(payload);
  } catch (err) {
    return res.status(err.status || 500).json({
      error: err.message || "Store request failed",
      code: err.code || null,
      configured: storeApi.riotApiKeyConfigured(),
      ...emptyShape,
    });
  }
}

// GET /api/valorant/wallet — VP / Radianite / Kingdom
router.get("/wallet", requireAuth, async (req, res) => {
  return withStoreSession(req, res, { wallet: null }, async (session) => {
    return storeApi.getWallet({
      accessToken: session.accessToken,
      entitlementToken: session.entitlementToken,
      region: session.region,
      puuid: session.puuid,
    });
  });
});

// Alias used by some Companion drafts
router.get("/store/wallet", requireAuth, async (req, res) => {
  return withStoreSession(req, res, { wallet: null }, async (session) => {
    return storeApi.getWallet({
      accessToken: session.accessToken,
      entitlementToken: session.entitlementToken,
      region: session.region,
      puuid: session.puuid,
    });
  });
});

// GET /api/valorant/inventory/skins — owned skin entitlements
router.get("/inventory/skins", requireAuth, async (req, res) => {
  return withStoreSession(req, res, { skins: [], count: 0 }, async (session) => {
    return storeApi.getOwnedSkins({
      accessToken: session.accessToken,
      entitlementToken: session.entitlementToken,
      region: session.region,
      puuid: session.puuid,
    });
  });
});

// GET /api/valorant/loadout
router.get("/loadout", requireAuth, async (req, res) => {
  return withStoreSession(req, res, { loadout: null }, async (session) => {
    return storeApi.getLoadout({
      accessToken: session.accessToken,
      entitlementToken: session.entitlementToken,
      region: session.region,
      puuid: session.puuid,
    });
  });
});

/**
 * PUT /api/valorant/loadout — equip skin/buddy/card/title/spray (reflects in-game)
 * Body: { guns?, sprays?, identity?, incognito?, raw? }
 * Also accepts PATCH via same handler.
 */
async function equipLoadoutHandler(req, res) {
  try {
    if (!storeApi.riotApiKeyConfigured()) {
      return res.json(storeApi.notConfiguredPayload({ loadout: null }));
    }
    const session = await resolveLiveSession(req);
    if (!session.hasLiveTokens || !session.puuid) {
      return res.status(401).json({
        error: "Live Riot tokens required to change loadout",
        code: "TOKENS_REQUIRED",
      });
    }
    const patch = {
      guns: req.body?.guns,
      sprays: req.body?.sprays,
      identity: req.body?.identity,
      incognito: req.body?.incognito,
      raw: req.body?.raw,
    };
    const hasPatch =
      (Array.isArray(patch.guns) && patch.guns.length) ||
      (Array.isArray(patch.sprays) && patch.sprays.length) ||
      (patch.identity && typeof patch.identity === "object") ||
      typeof patch.incognito === "boolean" ||
      (patch.raw && typeof patch.raw === "object");
    if (!hasPatch) {
      return res.status(400).json({
        error: "Provide guns[], sprays[], identity{}, incognito, and/or raw loadout body",
        code: "LOADOUT_PATCH_REQUIRED",
      });
    }
    const payload = await storeApi.putLoadout({
      accessToken: session.accessToken,
      entitlementToken: session.entitlementToken,
      region: session.region,
      puuid: session.puuid,
      patch,
    });
    return res.json(payload);
  } catch (err) {
    return res.status(err.status || 500).json({
      error: err.message || "Equip loadout failed",
      code: err.code || null,
      loadout: null,
    });
  }
}

router.put("/loadout", requireAuth, equipLoadoutHandler);
router.patch("/loadout", requireAuth, equipLoadoutHandler);

// GET /api/valorant/store/offers — daily market + featured bundles
router.get("/store/offers", requireAuth, async (req, res) => {
  return withStoreSession(
    req,
    res,
    { offers: [], bundles: [], accessoryOffers: [] },
    async (session) => {
      return storeApi.getStorefront({
        accessToken: session.accessToken,
        entitlementToken: session.entitlementToken,
        region: session.region,
        puuid: session.puuid,
      });
    }
  );
});

// Alias for full storefront payload
router.get("/store/storefront", requireAuth, async (req, res) => {
  return withStoreSession(
    req,
    res,
    { offers: [], bundles: [], accessoryOffers: [] },
    async (session) => {
      return storeApi.getStorefront({
        accessToken: session.accessToken,
        entitlementToken: session.entitlementToken,
        region: session.region,
        puuid: session.puuid,
      });
    }
  );
});

module.exports = router;

