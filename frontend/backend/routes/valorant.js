/**
 * Valorant Companion API (Adım 2+).
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

module.exports = router;
