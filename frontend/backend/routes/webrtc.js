"use strict";

const { apiError } = require("../lib/apiError");
const express = require("express");
const { AccessToken, TrackSource, WebhookReceiver } = require("livekit-server-sdk");
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
const ve = require("../lib/serverVoiceEnforce");
const { getActiveServerTimeout, timedOutError } = require("../lib/serverTimeoutState");
const { needsRulesAcceptance } = require("../lib/serverRulesGate");

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

function seatOf(userId, channelId) {
  return ve.findSeat(channelId, userId)?.seat || null;
}

function isSeatedInVoiceChannel(userId, channelId) {
  return Boolean(seatOf(userId, channelId));
}

/**
 * Older clients ask for the token while their `server:voice:join` is still in flight
 * (3.0.0 "early token"). Hold such a request briefly for the seat instead of failing.
 */
const SEAT_WAIT_MS = Number(process.env.VOICE_TOKEN_SEAT_WAIT_MS) || 4000;
async function waitForSeat(userId, channelId, timeoutMs = SEAT_WAIT_MS) {
  const deadline = Date.now() + timeoutMs;
  let seat = seatOf(userId, channelId);
  while (!seat && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 100));
    seat = seatOf(userId, channelId);
  }
  return seat;
}

function httpError(message, code, status) {
  const err = new Error(message);
  err.code = code;
  err.status = status;
  return err;
}

/**
 * Same checks as the socket join (V1, V6): membership, no active timeout, rules
 * accepted, VIEW + CONNECT (a member a mover placed in a private channel is exempt
 * while that seat lasts). Room and seat lookups use the canonical `channel.id` (V11).
 */
async function resolveVoiceChannelAccess(userId, channelId) {
  const { data: channel, error } = await supabase
    .from("server_channels")
    .select("id, server_id, type, name")
    .eq("id", ve.normalizeId(channelId))
    .maybeSingle();
  if (error) throw error;
  if (!channel || !["voice", "stage"].includes(channel.type)) {
    throw httpError("Voice channel not found.", "NOT_VOICE_CHANNEL", channel ? 400 : 404);
  }
  const resolved = await resolveChannelPermissions(supabase, channel.server_id, userId, channel.id);
  if (!resolved.isMember) throw httpError("You are not a member of this server.", "NOT_MEMBER", 403);
  if (!resolved.isOwner) {
    const t = await getActiveServerTimeout(channel.server_id, userId);
    if (t) throw timedOutError(t);
  }
  if (await needsRulesAcceptance(supabase, channel.server_id, userId, { isOwner: resolved.isOwner })) {
    throw httpError("You must accept the server rules before joining voice.", "RULES_REQUIRED", 403);
  }
  return { channel, resolved };
}

function assertSeatAccess(seat, resolved) {
  const forceMoved = Boolean(seat?.forceMovedIn);
  if (
    !forceMoved &&
    (!hasPermission(resolved.bits, Permissions.VIEW_CHANNEL) || !hasPermission(resolved.bits, Permissions.CONNECT))
  ) {
    throw httpError("Missing voice channel permission.", "MISSING_PERMISSION", 403);
  }
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
    return res.status(429).json(apiError("Too many requests.", null, { iceServers: DEFAULT_STUN, authenticated: false }));
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
    return res.status(429).json(apiError("Too many requests.", null, { iceServers: DEFAULT_STUN, authenticated: true }));
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

/**
 * Voice token for a member who holds a seat in the channel (V2: no seat, no token; the
 * seat is created by `server:voice:join`, whose `server:voice:joined` payload already
 * carries a token for current clients). Grants follow the seat: canPublish only with
 * SPEAK and no server mute / AFK lock (stage: speakers), camera and screen sources only
 * with STREAM (V5), no subscribing while server-deafened, no data channel (V14).
 * Short-lived: LiveKit refreshes connected participants itself (SK-3).
 */
router.all("/livekit-token", requireAuth, async (req, res) => {
  res.set("Cache-Control", "private, no-store");
  const channelId = String(req.query?.channelId || req.body?.channelId || "").trim();
  if (!channelId) return res.status(400).json(apiError("channelId is required.", null, { enabled: true, code: "CHANNEL_REQUIRED" }));
  try {
    const userId = ve.normalizeId(req.user.id);
    const { channel, resolved } = await resolveVoiceChannelAccess(userId, channelId);
    const seat = await waitForSeat(userId, channel.id);
    if (!seat) {
      return res.status(409).json(apiError("Join the voice channel first.", null, { enabled: true, code: "NOT_IN_CHANNEL" }));
    }
    assertSeatAccess(seat, resolved);
    const found = ve.findSeat(channel.id, userId);
    await ve.refreshSeatPermissions(req.app?.get?.("io") || null, {
      serverId: channel.server_id,
      channelId: channel.id,
      call: found?.call,
      seat,
      resolved,
    });
    const data = await ve.mintVoiceToken({ userId, channelId: channel.id, seat, platform: require("../lib/plus/animatedProfile").platformOf(req) });
    if (!data) return res.json({ enabled: false });
    return res.json(data);
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error("[webrtc] livekit-token error:", err);
    return res.status(status).json({
      enabled: true,
      ...(err.i18n ? { errorKey: err.i18n.errorKey, errorVars: err.i18n.errorVars } : {}),
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
  if (!channelId) return res.status(400).json(apiError("channelId is required.", null, { enabled: true, code: "CHANNEL_REQUIRED" }));
  const userId = ve.normalizeId(req.user.id);
  const limit = recordFailure(`lk-screen:user:${userId}`, {
    windowMs: SCREEN_TOKEN_WINDOW_MS,
    max: SCREEN_TOKEN_PER_USER,
  });
  if (!limit.ok) {
    res.set("Retry-After", String(limit.retryAfterSec));
    return res.status(429).json(apiError("Too many requests.", null, { enabled: true, code: "RATE_LIMITED" }));
  }
  const identity = screenCompanionIdentity(userId);
  if (!identity) return res.status(400).json(apiError("Invalid user.", null, { enabled: true, code: "INVALID_USER" }));
  try {
    const { channel, resolved } = await resolveVoiceChannelAccess(userId, channelId);
    const seat = seatOf(userId, channel.id);
    if (!seat) {
      return res.status(409).json(apiError("User is not in a voice channel.", null, { enabled: true, code: "NOT_IN_CHANNEL", }));
    }
    assertSeatAccess(seat, resolved);
    // Current permissions, then the seat's locks (server mute / deafen, AFK, stage role).
    seat.canSpeakPermission = hasPermission(resolved.bits, Permissions.SPEAK);
    seat.canStream = hasPermission(resolved.bits, Permissions.STREAM);
    if (!seat.channelType) seat.channelType = channel.type;
    if (channel.type === "stage" && !seat.stageRole) seat.stageRole = "audience";
    if (!ve.canStreamSeat(seat)) {
      return res.status(403).json(apiError("Missing STREAM permission.", null, { enabled: true, code: "MISSING_PERMISSION", }));
    }
    const room = ve.liveKitRoomName(channel.id);
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
    markCompanionIssued(channel.id, userId);
    // Descall+ 2.0: the iOS broadcast caps its encode to this (null = no limit; iOS sales flag).
    const screenCeiling = await ve.screenCeilingOf(userId, channel.id, "ios");
    return res.json({
      screenCeiling,
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

/**
 * LiveKit webhook (configure `<api>/api/webrtc/livekit-webhook` in LiveKit). On
 * participant_joined in a server voice room, an identity without a seat (or a screen
 * companion whose owner may not stream) is removed and its token revoked at once
 * (V2, M2, SK-3). Signed with the LiveKit API key; anything else is refused.
 */
router.post(
  "/livekit-webhook",
  express.raw({ type: ["application/webhook+json", "application/json"], limit: "256kb" }),
  async (req, res) => {
    if (!isLiveKitConfigured()) return res.status(404).json(apiError("Not found.", null, { code: "NOT_FOUND" }));
    let event;
    try {
      const receiver = new WebhookReceiver(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET);
      const body = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : typeof req.body === "string" ? req.body : JSON.stringify(req.body || {});
      event = await receiver.receive(body, req.get("Authorization") || req.get("Authorize"));
    } catch {
      return res.status(401).json(apiError("Invalid webhook signature.", null, { code: "UNAUTHORIZED" }));
    }
    try {
      const roomName = event?.room?.name || "";
      const channelId = ve.channelIdFromRoom(roomName);
      const identity = event?.participant?.identity || "";
      if (event?.event === "participant_joined" && channelId && identity && !ve.identityAllowedInRoom(channelId, identity)) {
        await ve.removeLiveKitIdentity(channelId, identity);
      }
      // Descall+ 2.0: a screen track above the person's ceiling (a modified client) is logged and the
      // client told to re-apply its cap; it is muted only when the admin turned screenEnforce.mute on.
      if (event?.event === "track_published" && channelId && identity) {
        await require("../lib/plus/screenGuard").onTrackPublished({ channelId, identity, track: event.track, room: roomName });
      }
    } catch (err) {
      console.warn("[webrtc] livekit webhook failed:", err?.message || err);
    }
    return res.json({ ok: true });
  }
);

module.exports = router;
module.exports._test = { stunOnly, optionalUserId };
