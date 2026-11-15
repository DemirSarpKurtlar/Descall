"use strict";

const express = require("express");
const { AccessToken, TrackSource } = require("livekit-server-sdk");
const { requireAuth } = require("../middleware/auth");
const supabase = require("../db/supabase");
const { activeServerVoiceCalls } = require("../runtime/sharedState");
const {
  Permissions,
  hasPermission,
  resolveChannelPermissions,
} = require("../lib/serverPermissions");
const { expandTurnUrls, liveKitEndpoints } = require("../lib/turnUrls");
const { turnIceServersForUser, turnMode, userTtlSeconds } = require("../lib/turnCredentials");
const { verifyToken } = require("../config/jwt");
const { sessionAllowed } = require("../lib/sessionGuard");
const { bannedUserIds } = require("../runtime/sharedState");
const { recordFailure } = require("../lib/rateLimit");
const {
  SCREEN_COMPANION_TTL,
  screenCompanionIdentity,
  markCompanionIssued,
} = require("../lib/screenCompanion");

const router = express.Router();

const DEFAULT_STUN = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

function expandIceServers(servers) {
  return servers.map((server) => {
    if (!server || server.urls == null) return server;
    return { ...server, urls: expandTurnUrls(server.urls) };
  });
}

/**
 * STUN for everyone; TURN only for a signed-in user (2.11.2), with per-user short-lived
 * credentials from lib/turnCredentials.js. ICE_SERVERS_JSON (full override) still wins for
 * signed-in users; anonymous callers only get its STUN entries.
 */
function stunOnly(list) {
  return (list || []).filter((server) => {
    const urls = Array.isArray(server?.urls) ? server.urls : [server?.urls];
    return urls.length && urls.every((u) => /^stuns?:/i.test(String(u || "")));
  });
}

function iceServersJsonOverride() {
  const raw = process.env.ICE_SERVERS_JSON;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) return expandIceServers(parsed);
  } catch (e) {
    console.warn("[webrtc] Invalid ICE_SERVERS_JSON:", e.message);
  }
  return null;
}

async function buildIceServersForUser(userId) {
  const override = iceServersJsonOverride();
  if (override) return { iceServers: override, ttlSeconds: userTtlSeconds(process.env), expiresAt: null };
  const turn = await turnIceServersForUser(userId, process.env);
  return { iceServers: [...DEFAULT_STUN, ...turn.servers], ttlSeconds: turn.ttlSeconds, expiresAt: turn.expiresAt };
}

/** Resolves the caller from an optional Bearer token. Returns the user id or null (never throws). */
async function optionalUserId(req) {
  const header = String(req.headers.authorization || "");
  if (!header.startsWith("Bearer ")) return null;
  try {
    const decoded = verifyToken(header.slice(7));
    if (!decoded || decoded.pending2fa || !decoded.sub) return null;
    const session = await sessionAllowed(decoded);
    if (!session.ok) return null;
    if (bannedUserIds.has(decoded.sub)) return null;
    return decoded.sub;
  } catch {
    return null;
  }
}

const ICE_RATE_WINDOW_MS = 10 * 60 * 1000;
const ICE_RATE_PER_USER = 30;
const ICE_RATE_PER_IP = 120;

function isLiveKitConfigured() {
  return Boolean(
    process.env.LIVEKIT_URL &&
      process.env.LIVEKIT_API_KEY &&
      process.env.LIVEKIT_API_SECRET
  );
}

function isTurnConfigured() {
  if (process.env.ICE_SERVERS_JSON && /turns?:/i.test(process.env.ICE_SERVERS_JSON)) return true;
  return turnMode(process.env) !== "none";
}

function isSeatedInVoiceChannel(userId, channelId) {
  const call = activeServerVoiceCalls.get(String(channelId));
  if (!call?.participants || userId == null) return false;
  const uid = String(userId);
  if (call.participants.has(userId) || call.participants.has(uid)) return true;
  for (const [key, member] of call.participants.entries()) {
    if (String(key) === uid || String(member?.id) === uid) return true;
  }
  return false;
}

async function resolveVoiceChannelAccess(userId, channelId) {
  const { data: channel, error } = await supabase
    .from("server_channels")
    .select("id, server_id, type, name")
    .eq("id", channelId)
    .maybeSingle();
  if (error) throw error;
  if (!channel || !["voice", "stage"].includes(channel.type)) {
    const err = new Error("Voice channel not found.");
    err.code = "NOT_VOICE_CHANNEL";
    err.status = channel ? 400 : 404;
    throw err;
  }
  const resolved = await resolveChannelPermissions(supabase, channel.server_id, userId, channelId);
  if (!resolved.isMember) {
    const err = new Error("You are not a member of this server.");
    err.code = "NOT_MEMBER";
    err.status = 403;
    throw err;
  }
  // Discord parity: members force-moved into a private voice channel may mint
  // LiveKit tokens while seated; after leave, VIEW+CONNECT are required again.
  const seated = isSeatedInVoiceChannel(userId, channelId);
  if (
    !seated &&
    (!hasPermission(resolved.bits, Permissions.VIEW_CHANNEL) ||
      !hasPermission(resolved.bits, Permissions.CONNECT))
  ) {
    const err = new Error("Missing voice channel permission.");
    err.code = "MISSING_PERMISSION";
    err.status = 403;
    throw err;
  }
  return { channel, resolved };
}

function stageRoleFor(channelId, userId) {
  const call = activeServerVoiceCalls.get(channelId);
  if (!call?.participants) return "audience";
  const uid = String(userId);
  let participant = call.participants.get(userId) || call.participants.get(uid);
  if (!participant) {
    for (const [key, member] of call.participants.entries()) {
      if (String(key) === uid || String(member?.id) === uid) {
        participant = member;
        break;
      }
    }
  }
  return participant?.stageRole === "speaker" ? "speaker" : "audience";
}

/**
 * STUN is public (call setup can start before sign-in finishes). TURN needs a valid session:
 * signed-in users get their own short-lived credentials (ttlSeconds / expiresAt tell the
 * client when to refresh). Rate-limited per IP and per user.
 */
router.get("/ice-config", async (req, res) => {
  res.set("Cache-Control", "private, no-store");
  res.set("Vary", "Authorization");
  const ipCheck = recordFailure(`ice:ip:${req.ip || "unknown"}`, { windowMs: ICE_RATE_WINDOW_MS, max: ICE_RATE_PER_IP });
  if (!ipCheck.ok) {
    res.set("Retry-After", String(ipCheck.retryAfterSec));
    return res.status(429).json({ error: "Too many requests.", iceServers: DEFAULT_STUN, authenticated: false });
  }
  const userId = await optionalUserId(req);
  if (!userId) {
    const override = iceServersJsonOverride();
    return res.json({
      iceServers: override ? (stunOnly(override).length ? stunOnly(override) : DEFAULT_STUN) : DEFAULT_STUN,
      turnConfigured: isTurnConfigured(),
      turnMode: turnMode(process.env),
      authenticated: false,
      turnRequiresAuth: true,
    });
  }
  const userCheck = recordFailure(`ice:user:${userId}`, { windowMs: ICE_RATE_WINDOW_MS, max: ICE_RATE_PER_USER });
  if (!userCheck.ok) {
    res.set("Retry-After", String(userCheck.retryAfterSec));
    return res.status(429).json({ error: "Too many requests.", iceServers: DEFAULT_STUN, authenticated: true });
  }
  try {
    const built = await buildIceServersForUser(userId);
    res.json({
      iceServers: built.iceServers,
      turnConfigured: isTurnConfigured(),
      turnMode: turnMode(process.env),
      authenticated: true,
      ttlSeconds: built.ttlSeconds,
      expiresAt: built.expiresAt,
    });
  } catch (err) {
    console.warn("[webrtc] ice-config failed:", err?.message || err);
    res.json({ iceServers: DEFAULT_STUN, turnConfigured: false, turnMode: "none", authenticated: true });
  }
});

router.get("/media-config", (_req, res) => {
  const sfu = isLiveKitConfigured();
  // Prefer SFU whenever LiveKit is configured. Mesh remains emergency fallback
  // unless LIVEKIT_FORCE=1 (ops: refuse mesh when SFU is expected in prod).
  const forceSfu = String(process.env.LIVEKIT_FORCE || "").trim() === "1";
  res.set("Cache-Control", "public, max-age=60");
  res.json({
    sfu,
    preferSfu: sfu,
    forceSfu: sfu && forceSfu,
    livekitUrl: sfu ? process.env.LIVEKIT_URL : null,
    turnConfigured: isTurnConfigured(),
    mode: sfu ? "sfu" : "mesh",
  });
});

router.all("/livekit-token", (req, res, next) => {
  if (!isLiveKitConfigured()) return res.json({ enabled: false });
  return next();
});

router.all("/livekit-token", requireAuth, async (req, res) => {
  const channelId = String(req.query?.channelId || req.body?.channelId || "").trim();
  if (!channelId) return res.status(400).json({ enabled: true, error: "channelId is required." });
  try {
    const userId = req.user.id;
    const { channel, resolved } = await resolveVoiceChannelAccess(userId, channelId);
    const canSpeak = hasPermission(resolved.bits, Permissions.SPEAK);
    const canPublish =
      channel.type === "stage" ? stageRoleFor(channelId, userId) === "speaker" && canSpeak : canSpeak;
    const room = `server-voice-${channelId}`;
    const token = new AccessToken(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET, {
      identity: userId,
      ttl: "1h",
    });
    token.addGrant({
      room,
      roomJoin: true,
      canSubscribe: true,
      canPublish,
      canPublishData: true,
    });
    return res.json({
      enabled: true,
      livekitUrl: process.env.LIVEKIT_URL,
      livekitUrls: liveKitEndpoints(),
      room,
      token: await token.toJwt(),
      canPublish,
      canSubscribe: true,
      channelType: channel.type,
      stageRole: channel.type === "stage" ? stageRoleFor(channelId, userId) : "speaker",
      canRequestToSpeak: hasPermission(resolved.bits, Permissions.REQUEST_TO_SPEAK),
      canStream: hasPermission(resolved.bits, Permissions.STREAM),
    });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error("[webrtc] livekit-token error:", err);
    return res.status(status).json({
      enabled: true,
      error: err.message || "Failed to mint LiveKit token.",
      code: err.code || null,
    });
  }
});

const SCREEN_TOKEN_WINDOW_MS = 10 * 60 * 1000;
const SCREEN_TOKEN_PER_USER = 20;

/**
 * iOS whole-screen sharing (docs/ios-screen-share.md): a token for the user's
 * screen companion (`<userId>:screen`) that the app's native LiveKit room uses
 * to publish the ReplayKit broadcast. Same access check as the voice token,
 * plus: the user must be seated in the channel and allowed to share video
 * there (SPEAK + STREAM, stage speakers only). The companion may publish
 * screen share only, cannot subscribe or send data, and the token is
 * short-lived (it is only needed to connect).
 */
router.all("/livekit-screen-token", (req, res, next) => {
  if (!isLiveKitConfigured()) return res.json({ enabled: false });
  return next();
});

router.all("/livekit-screen-token", requireAuth, async (req, res) => {
  res.set("Cache-Control", "private, no-store");
  const channelId = String(req.query?.channelId || req.body?.channelId || "").trim();
  if (!channelId) return res.status(400).json({ enabled: true, error: "channelId is required.", code: "CHANNEL_REQUIRED" });
  const userId = req.user.id;
  const limit = recordFailure(`lk-screen:user:${userId}`, {
    windowMs: SCREEN_TOKEN_WINDOW_MS,
    max: SCREEN_TOKEN_PER_USER,
  });
  if (!limit.ok) {
    res.set("Retry-After", String(limit.retryAfterSec));
    return res.status(429).json({ enabled: true, error: "Too many requests.", code: "RATE_LIMITED" });
  }
  const identity = screenCompanionIdentity(userId);
  if (!identity) return res.status(400).json({ enabled: true, error: "Invalid user.", code: "INVALID_USER" });
  try {
    const { channel, resolved } = await resolveVoiceChannelAccess(userId, channelId);
    if (!isSeatedInVoiceChannel(userId, channelId)) {
      return res.status(409).json({
        enabled: true,
        error: "User is not in a voice channel.",
        code: "NOT_IN_CHANNEL",
      });
    }
    const canSpeak = hasPermission(resolved.bits, Permissions.SPEAK);
    const canPublish =
      channel.type === "stage" ? stageRoleFor(channelId, userId) === "speaker" && canSpeak : canSpeak;
    if (!canPublish || !hasPermission(resolved.bits, Permissions.STREAM)) {
      return res.status(403).json({
        enabled: true,
        error: "Missing STREAM permission.",
        code: "MISSING_PERMISSION",
      });
    }
    const room = `server-voice-${channelId}`;
    const token = new AccessToken(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET, {
      identity,
      ttl: SCREEN_COMPANION_TTL,
      metadata: JSON.stringify({ companionOf: String(userId), kind: "screen" }),
    });
    token.addGrant({
      room,
      roomJoin: true,
      canSubscribe: false,
      canPublish: true,
      canPublishData: false,
      canUpdateOwnMetadata: false,
      canPublishSources: [TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO],
    });
    markCompanionIssued(channelId, userId);
    return res.json({
      enabled: true,
      livekitUrl: process.env.LIVEKIT_URL,
      livekitUrls: liveKitEndpoints(),
      room,
      identity,
      token: await token.toJwt(),
      ttlSeconds: 600,
    });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error("[webrtc] livekit-screen-token error:", err);
    return res.status(status).json({
      enabled: true,
      error: err.message || "Failed to mint the screen share token.",
      code: err.code || null,
    });
  }
});

module.exports = router;
module.exports._test = { stunOnly, optionalUserId };
