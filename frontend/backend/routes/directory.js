"use strict";

/**
 * Public server directory (item 8). Mounted at /api/directory.
 *
 * Public, read-only, no auth, rate limited per IP and cached (browser + CDN):
 *   GET  /servers?category=&language=&sort=members|online|newest&q=&offset=&limit=
 *   GET  /servers/:id            one public card
 *   GET  /summary                visible servers per category (and per language)
 *   GET  /snapshot               every visible card + summary (build-time prerender)
 *   POST /servers/:id/invite     join action: reuse or create the server's public invite
 *
 * Owner / ADMINISTRATOR only (signed in):
 *   GET  /manage/:serverId       listing settings, eligibility
 *   PUT  /manage/:serverId       save listing settings
 *
 * What is public and the visibility rules live in lib/serverDirectory.js.
 */

const crypto = require("crypto");
const express = require("express");
const supabase = require("../db/supabase");
const { requireAuth } = require("../middleware/auth");
const { Permissions, hasPermission, resolveMemberPermissions } = require("../lib/serverPermissions");
const { apiError, templatedError, errorFields } = require("../lib/apiError");
const { recordFailure, rejectIfLimited } = require("../lib/rateLimit");
const { publicCache } = require("../lib/edgeConfig");
const { presence: livePresence } = require("../runtime/sharedState");
const dir = require("../lib/serverDirectory");

const READ_LIMIT = { windowMs: 60 * 1000, max: 120 };
const INVITE_LIMIT = { windowMs: 10 * 60 * 1000, max: 30 };
const INVITE_CODE_LENGTH = 8;
const INVITE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

let ioRef = null;
const service = dir.createDirectoryService({ supabase, presence: livePresence, getIo: () => ioRef });

const router = express.Router();

router.use((req, _res, next) => {
  if (!ioRef) ioRef = req.app?.get?.("io") || null;
  next();
});

function limited(req, res, kind, limit) {
  return rejectIfLimited(res, [recordFailure(`directory-${kind}:ip:${req.ip || ""}`, limit)]);
}

function cachePublic(res) {
  publicCache(res, { maxAge: 60, sMaxAge: 120, swr: 300 });
}

function sendFailure(res, err, fallback) {
  const status = err?.status || 500;
  if (status >= 500) console.error("[directory]", err?.message || err);
  if (status >= 500) return res.status(status).json(apiError(fallback));
  return res.status(status).json({ ...errorFields(err), error: err.message, code: err.code || null });
}

router.get("/servers", async (req, res) => {
  try {
    if (limited(req, res, "read", READ_LIMIT)) return;
    const snap = await service.snapshot();
    const page = dir.queryCards(snap.cards, {
      category: req.query.category ? String(req.query.category) : null,
      language: req.query.language ? String(req.query.language) : null,
      q: req.query.q,
      sort: req.query.sort,
      offset: req.query.offset,
      limit: req.query.limit,
    });
    cachePublic(res);
    return res.json({ ...page, available: snap.available, minMembers: dir.MIN_PUBLIC_MEMBERS });
  } catch (err) {
    return sendFailure(res, err, "Could not load the directory.");
  }
});

router.get("/summary", async (req, res) => {
  try {
    if (limited(req, res, "read", READ_LIMIT)) return;
    const snap = await service.snapshot();
    cachePublic(res);
    return res.json({
      available: snap.available,
      minMembers: dir.MIN_PUBLIC_MEMBERS,
      total: snap.cards.length,
      categories: dir.summarize(snap.cards),
    });
  } catch (err) {
    return sendFailure(res, err, "Could not load the directory.");
  }
});

router.get("/snapshot", async (req, res) => {
  try {
    if (limited(req, res, "read", READ_LIMIT)) return;
    const snap = await service.snapshot();
    cachePublic(res);
    return res.json({
      available: snap.available,
      builtAt: new Date(snap.builtAt).toISOString(),
      minMembers: dir.MIN_PUBLIC_MEMBERS,
      categories: dir.summarize(snap.cards),
      servers: snap.cards,
    });
  } catch (err) {
    return sendFailure(res, err, "Could not load the directory.");
  }
});

async function visibleCard(serverId) {
  const snap = await service.snapshot();
  return snap.cards.find((c) => String(c.id) === String(serverId)) || null;
}

router.get("/servers/:id", async (req, res) => {
  try {
    if (limited(req, res, "read", READ_LIMIT)) return;
    const card = await visibleCard(req.params.id);
    if (!card) return res.status(404).json(apiError("This server is not listed in the directory.", null, { code: "NOT_LISTED" }));
    cachePublic(res);
    return res.json({ server: card });
  } catch (err) {
    return sendFailure(res, err, "Could not load the directory.");
  }
});

function newInviteCode() {
  let code = "";
  for (let i = 0; i < INVITE_CODE_LENGTH; i += 1) code += INVITE_CHARS.charAt(crypto.randomInt(INVITE_CHARS.length));
  return code;
}

function inviteUsable(invite, serverId) {
  if (!invite || String(invite.server_id) !== String(serverId)) return false;
  if (invite.expires_at && new Date(invite.expires_at) < new Date()) return false;
  if (invite.max_uses != null && (invite.uses || 0) >= invite.max_uses) return false;
  return true;
}

function inviteResponse(code) {
  return { code, path: `/servers/join/${code}` };
}

/**
 * The join action of a card: the server's directory invite (no expiry, no use limit,
 * created in the owner's name), reused while it is valid and created again otherwise.
 * Joining still goes through the normal invite flow (bans, verification, rules).
 */
router.post("/servers/:id/invite", async (req, res) => {
  try {
    if (limited(req, res, "invite", INVITE_LIMIT)) return;
    const serverId = String(req.params.id || "");
    const card = await visibleCard(serverId);
    if (!card) return res.status(404).json(apiError("This server is not listed in the directory.", null, { code: "NOT_LISTED" }));
    const { data: server, error } = await supabase
      .from("servers")
      .select("id, owner_id, directory_invite_code")
      .eq("id", serverId)
      .maybeSingle();
    if (error) throw error;
    if (!server) return res.status(404).json(apiError("This server is not listed in the directory.", null, { code: "NOT_LISTED" }));
    res.set("Cache-Control", "no-store");
    if (server.directory_invite_code) {
      const { data: existing } = await supabase
        .from("server_invites")
        .select("code, server_id, expires_at, max_uses, uses")
        .eq("code", server.directory_invite_code)
        .maybeSingle();
      if (inviteUsable(existing, serverId)) return res.json(inviteResponse(existing.code));
    }
    let code = newInviteCode();
    for (let i = 0; i < 6; i += 1) {
      const { data: taken } = await supabase.from("server_invites").select("code").eq("code", code).maybeSingle();
      if (!taken) break;
      code = newInviteCode();
    }
    const { error: insErr } = await supabase.from("server_invites").insert({
      code,
      server_id: serverId,
      creator_id: server.owner_id,
      channel_id: null,
      max_uses: null,
      uses: 0,
      max_age_seconds: null,
      temporary: false,
      expires_at: null,
    });
    if (insErr) throw insErr;
    const { error: upErr } = await supabase.from("servers").update({ directory_invite_code: code }).eq("id", serverId);
    if (upErr) console.warn("[directory] could not store the directory invite:", upErr.message);
    return res.json(inviteResponse(code));
  } catch (err) {
    return sendFailure(res, err, "Could not create an invite for this server.");
  }
});

// ---------------------------------------------------------------------------
// Owner / administrator settings

async function requireListingManager(serverId, userId) {
  const { data: server, error } = await supabase.from("servers").select("*").eq("id", serverId).maybeSingle();
  if (error) throw error;
  if (!server) throw templatedError("Server not found.", null, { status: 404, code: "NOT_FOUND" });
  if (String(server.owner_id) === String(userId)) return server;
  const resolved = await resolveMemberPermissions(supabase, serverId, userId, { server });
  if (!resolved.isMember || !hasPermission(resolved.bits, Permissions.ADMINISTRATOR)) {
    throw templatedError("Only the owner or an administrator can change this setting.", null, { status: 403, code: "ADMIN_REQUIRED" });
  }
  return server;
}

async function listingState(server) {
  const available = Object.prototype.hasOwnProperty.call(server, "listed_in_directory");
  const { count } = await supabase
    .from("server_members")
    .select("user_id", { count: "exact", head: true })
    .eq("server_id", server.id);
  let owner = null;
  try {
    const { data } = await supabase.from("users").select("id, is_banned, deleted_at").eq("id", server.owner_id).maybeSingle();
    owner = data || null;
  } catch {
    owner = null;
  }
  if (!owner) {
    const { data } = await supabase.from("users").select("id").eq("id", server.owner_id).maybeSingle();
    owner = data || null;
  }
  const memberCount = count || 0;
  const reason = available ? dir.hiddenReason(server, { memberCount, owner }) : "unavailable";
  return {
    available,
    listing: {
      listed: Boolean(server.listed_in_directory),
      category: server.directory_category || null,
      language: server.directory_language || null,
      description: server.directory_description || "",
      tags: Array.isArray(server.directory_tags) ? server.directory_tags : [],
      listedAt: server.directory_listed_at || null,
    },
    hidden: Boolean(server.directory_hidden_at),
    memberCount,
    minMembers: dir.MIN_PUBLIC_MEMBERS,
    visible: reason === null,
    reason,
    limits: { descriptionMax: dir.DESCRIPTION_MAX, tagsMax: dir.TAGS_MAX, tagLenMax: dir.TAG_LEN_MAX },
  };
}

router.get("/manage/:serverId", requireAuth, async (req, res) => {
  try {
    const server = await requireListingManager(req.params.serverId, req.user.id);
    res.set("Cache-Control", "no-store");
    return res.json(await listingState(server));
  } catch (err) {
    return sendFailure(res, err, "Could not load the directory.");
  }
});

router.put("/manage/:serverId", requireAuth, async (req, res) => {
  try {
    const server = await requireListingManager(req.params.serverId, req.user.id);
    res.set("Cache-Control", "no-store");
    if (!Object.prototype.hasOwnProperty.call(server, "listed_in_directory")) {
      return res.status(503).json(apiError("The directory is not available yet.", null, { code: "DIRECTORY_UNAVAILABLE" }));
    }
    const { patch, error: invalid } = dir.normalizeListingInput(req.body || {}, server);
    if (invalid) return res.status(400).json(apiError(invalid.template, invalid.vars, { code: invalid.code }));
    const { data: updated, error } = await supabase.from("servers").update(patch).eq("id", server.id).select("*").single();
    if (error) {
      if (dir.isMissingSchemaError(error)) {
        return res.status(503).json(apiError("The directory is not available yet.", null, { code: "DIRECTORY_UNAVAILABLE" }));
      }
      throw error;
    }
    const { error: auditErr } = await supabase.from("server_audit_logs").insert({
      server_id: server.id,
      actor_id: req.user.id,
      action: "DIRECTORY_UPDATE",
      target_type: "server",
      target_id: String(server.id),
      changes: patch,
      reason: null,
    });
    if (auditErr) console.warn("[directory] audit log insert failed:", auditErr.message);
    service.invalidate();
    return res.json(await listingState(updated || { ...server, ...patch }));
  } catch (err) {
    return sendFailure(res, err, "Could not save the directory listing.");
  }
});

/** Tests: forget the cached snapshot. */
router.__resetDirectoryCache = () => service.invalidate();
router.__service = service;

module.exports = router;
