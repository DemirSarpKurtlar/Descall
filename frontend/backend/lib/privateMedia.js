"use strict";

/**
 * Private message media (2.11.2).
 *
 * DM / group / server-channel attachments live in the private `media-private` bucket. The
 * database stores a stable reference, `sb://media-private/<path>`. Whenever a payload leaves
 * the backend (HTTP JSON or Socket.IO, see installPrivateMediaHooks) every such reference is
 * replaced by a short-lived signed backend URL:
 *
 *   <API>/api/media/f/<path>?e=<unix expiry>&s=<HMAC>
 *
 * The URL is only ever put into payloads that the existing code already sends to members of
 * that conversation. GET /api/media/f/... checks the HMAC + expiry and 302s to a Supabase
 * signed URL (10 min). Expired links are refreshed through POST /api/media/refresh, which
 * re-checks that the caller can see a message carrying that file (or uploaded it).
 *
 * Public assets (avatars, banners, group photos, server icons, shop catalog) stay in the
 * public `media` bucket and are never rewritten.
 */

const crypto = require("crypto");

const PRIVATE_BUCKET = "media-private";
const PUBLIC_BUCKET = "media";
const REF_PREFIX = `sb://${PRIVATE_BUCKET}/`;
const URL_TTL_S = 2 * 60 * 60;
const URL_BUCKET_S = 60 * 60; // expiry rounded up to the hour so URLs stay cacheable
const PRIVATE_FOLDERS = /^(images|files)\//;
const SAFE_PATH = /^(images|files|quarantine\/(images|files))\/[A-Za-z0-9._-]{1,200}$/;

let keyCache = null;
function signingKey() {
  if (keyCache) return keyCache;
  const secret = String(process.env.MEDIA_URL_SECRET || process.env.JWT_SECRET || "");
  if (!secret) throw new Error("JWT_SECRET is required for private media URLs");
  keyCache = crypto.createHmac("sha256", secret).update("descall-private-media-v1").digest();
  return keyCache;
}

function apiBase() {
  return String(
    process.env.MEDIA_PUBLIC_BASE_URL || process.env.PUBLIC_API_URL || process.env.VITE_API_BASE_URL || process.env.RENDER_EXTERNAL_URL || "https://des-call.onrender.com"
  ).replace(/\/+$/, "");
}

function isSafePath(path) {
  return typeof path === "string" && SAFE_PATH.test(path) && !path.includes("..");
}

function sig(path, exp) {
  return crypto.createHmac("sha256", signingKey()).update(`${path}\n${exp}`).digest("base64url").slice(0, 32);
}

function expiryFor(now = Date.now()) {
  const minExp = Math.floor(now / 1000) + URL_TTL_S;
  return Math.ceil(minExp / URL_BUCKET_S) * URL_BUCKET_S;
}

/** Short-lived backend URL for a private object path. */
function signedUrlForPath(path, now = Date.now()) {
  if (!isSafePath(path)) return null;
  const exp = expiryFor(now);
  return `${apiBase()}/api/media/f/${path}?e=${exp}&s=${sig(path, exp)}`;
}

function verifySignature(path, exp, s, now = Date.now()) {
  if (!isSafePath(path)) return false;
  const e = Number(exp);
  if (!Number.isFinite(e) || e * 1000 < now) return false;
  if (e * 1000 > now + (URL_TTL_S + URL_BUCKET_S + 60) * 1000) return false;
  const expected = sig(path, e);
  const a = Buffer.from(String(s || ""));
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function refForPath(path) {
  return `${REF_PREFIX}${path}`;
}

function isRef(value) {
  return typeof value === "string" && value.startsWith(REF_PREFIX);
}

/**
 * Path of a private object from anything a client may hold: a stored ref, one of our signed
 * URLs (fresh or expired), or a legacy public Supabase URL in images/ or files/.
 * Returns { path, kind: "ref" | "signed" | "legacy" } or null.
 */
function parseMediaUrl(value) {
  if (typeof value !== "string" || !value) return null;
  if (isRef(value)) {
    const path = value.slice(REF_PREFIX.length);
    return isSafePath(path) ? { path, kind: "ref" } : null;
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const signed = url.pathname.match(/^\/api\/media\/f\/(.+)$/);
  if (signed) {
    const path = decodeURIComponent(signed[1]);
    return isSafePath(path) ? { path, kind: "signed" } : null;
  }
  const legacy = url.pathname.match(/\/storage\/v1\/object\/public\/media\/(.+)$/);
  if (legacy && /\.supabase\.(co|in)$/i.test(url.hostname)) {
    const path = decodeURIComponent(legacy[1]);
    return PRIVATE_FOLDERS.test(path) && isSafePath(path) ? { path, kind: "legacy" } : null;
  }
  return null;
}

/**
 * Copy-on-write deep rewrite of outgoing payloads: every `sb://media-private/...` string becomes
 * a signed URL. Unchanged sub-trees keep their identity (shared in-memory caches are never mutated).
 */
function rewriteOutgoing(value, now = Date.now(), depth = 0) {
  if (typeof value === "string") {
    if (!isRef(value)) return value;
    return signedUrlForPath(value.slice(REF_PREFIX.length), now) || value;
  }
  if (!value || typeof value !== "object" || depth > 8) return value;
  if (Array.isArray(value)) {
    let out = null;
    for (let i = 0; i < value.length; i++) {
      const next = rewriteOutgoing(value[i], now, depth + 1);
      if (next !== value[i]) {
        if (!out) out = value.slice();
        out[i] = next;
      }
    }
    return out || value;
  }
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return value; // Buffers, Dates, class instances
  let out = null;
  for (const key of Object.keys(value)) {
    const v = value[key];
    const next = rewriteOutgoing(v, now, depth + 1);
    if (next !== v) {
      if (!out) out = { ...value };
      out[key] = next;
    }
  }
  return out || value;
}

/** Cheap pre-check so payloads without refs are not walked twice. */
function mayContainRef(value, depth = 0) {
  if (typeof value === "string") return value.startsWith(REF_PREFIX);
  if (!value || typeof value !== "object" || depth > 8) return false;
  if (Array.isArray(value)) return value.some((v) => mayContainRef(v, depth + 1));
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return false;
  for (const key of Object.keys(value)) if (mayContainRef(value[key], depth + 1)) return true;
  return false;
}

function rewriteArgs(args) {
  let changed = false;
  const now = Date.now();
  const out = args.map((a) => {
    if (typeof a === "function" || !mayContainRef(a)) return a;
    changed = true;
    return rewriteOutgoing(a, now);
  });
  return changed ? out : args;
}

let hooksInstalled = false;
/** Rewrites refs in every Socket.IO emit / ack and every res.json. Idempotent. */
function installPrivateMediaHooks({ io, express } = {}) {
  if (hooksInstalled) return;
  hooksInstalled = true;
  const { Socket } = require("socket.io");
  const origSocketEmit = Socket.prototype.emit;
  Socket.prototype.emit = function emitWithSignedMedia(ev, ...args) {
    return origSocketEmit.call(this, ev, ...rewriteArgs(args));
  };
  if (typeof Socket.prototype.ack === "function") {
    const origAck = Socket.prototype.ack;
    Socket.prototype.ack = function ackWithSignedMedia(id) {
      const fn = origAck.call(this, id);
      return (...args) => fn(...rewriteArgs(args));
    };
  }
  if (io) {
    const BroadcastProto = Object.getPrototypeOf(io.to("__private_media_probe__"));
    const origBroadcastEmit = BroadcastProto.emit;
    BroadcastProto.emit = function broadcastWithSignedMedia(ev, ...args) {
      return origBroadcastEmit.call(this, ev, ...rewriteArgs(args));
    };
  }
  if (express) {
    const origJson = express.response.json;
    express.response.json = function jsonWithSignedMedia(body) {
      return origJson.call(this, mayContainRef(body) ? rewriteOutgoing(body) : body);
    };
  }
}

// ── Supabase signed URL cache for GET /api/media/f/* ────────────────────────
const SUPABASE_SIGN_S = 10 * 60;
const signCache = new Map();

async function supabaseSignedUrl(supabase, path, now = Date.now()) {
  const hit = signCache.get(path);
  if (hit && hit.until > now) return hit.url;
  const { data, error } = await supabase.storage.from(PRIVATE_BUCKET).createSignedUrl(path, SUPABASE_SIGN_S);
  if (error || !data?.signedUrl) throw error || new Error("sign failed");
  if (signCache.size > 5000) signCache.clear();
  signCache.set(path, { url: data.signedUrl, until: now + (SUPABASE_SIGN_S - 120) * 1000 });
  return data.signedUrl;
}

// ── Access checks (refresh + send) ──────────────────────────────────────────
async function userGroupIds(supabase, userId) {
  const { data } = await supabase.from("group_members").select("group_id").eq("user_id", userId);
  return new Set((data || []).map((r) => String(r.group_id)));
}

async function userServerIds(supabase, userId) {
  const { data } = await supabase.from("server_members").select("server_id").eq("user_id", userId);
  return new Set((data || []).map((r) => String(r.server_id)));
}

/** Rows of `table` whose media_url is this object (stored ref or legacy public URL). */
async function rowsReferencing(supabase, table, columns, path) {
  const ref = refForPath(path);
  const [a, b] = await Promise.all([
    supabase.from(table).select(columns).eq("media_url", ref).limit(50),
    supabase.from(table).select(columns).like("media_url", `%/object/public/media/${path}`).limit(50),
  ]);
  return [...(a?.data || []), ...(b?.data || [])];
}

/**
 * True when userId uploaded the object or can see a message (DM party, group member, server
 * member) whose media_url is this object.
 */
async function canAccessPath(supabase, userId, path) {
  if (!userId || !isSafePath(path)) return false;
  const uid = String(userId);
  const { data: up } = await supabase
    .from("media_uploads")
    .select("uploader_id")
    .eq("storage_path", path)
    .eq("uploader_id", uid)
    .limit(1);
  if (up && up.length) return true;
  const dm = await rowsReferencing(supabase, "dm_messages", "from_user_id, to_user_id", path);
  if (dm.some((r) => String(r.from_user_id) === uid || String(r.to_user_id) === uid)) return true;
  const gm = await rowsReferencing(supabase, "group_messages", "group_id", path);
  if (gm.length) {
    const mine = await userGroupIds(supabase, uid);
    if (gm.some((r) => mine.has(String(r.group_id)))) return true;
  }
  const sm = await rowsReferencing(supabase, "server_messages", "server_id", path);
  if (sm.length) {
    const mine = await userServerIds(supabase, uid);
    if (sm.some((r) => mine.has(String(r.server_id)))) return true;
  }
  return false;
}

/**
 * Normalises the mediaUrl a client sends with a new message:
 *  - our signed URL or a ref       → ref (sender must be allowed to use that file)
 *  - legacy public images/files URL uploaded by the sender (pre-2.11.2 clients) → copied into
 *    the private bucket, stored as a ref
 *  - anything else (GIF providers, avatars) → unchanged
 */
async function normalizeIncomingMediaUrl(supabase, senderId, mediaUrl) {
  const parsed = parseMediaUrl(mediaUrl);
  if (!parsed) return mediaUrl;
  if (parsed.path.startsWith("quarantine/")) return null;
  if (parsed.kind === "legacy") {
    const { data: up } = await supabase
      .from("media_uploads")
      .select("uploader_id")
      .eq("storage_path", parsed.path)
      .eq("uploader_id", senderId)
      .limit(1);
    if (!up || !up.length) return mediaUrl; // not the sender's upload (e.g. a public asset): leave as is
    const copied = await ensurePrivateCopy(supabase, parsed.path);
    return copied ? refForPath(parsed.path) : mediaUrl;
  }
  const ok = await canAccessPath(supabase, senderId, parsed.path);
  return ok ? refForPath(parsed.path) : null;
}

async function ensurePrivateCopy(supabase, path) {
  const exists = await supabase.storage.from(PRIVATE_BUCKET).list(path.split("/")[0], { search: path.split("/")[1], limit: 1 });
  if (exists?.data?.some((o) => o.name === path.split("/")[1])) return true;
  const { error } = await supabase.storage.from(PUBLIC_BUCKET).copy(path, path, { destinationBucket: PRIVATE_BUCKET });
  if (error) {
    console.warn("[private-media] copy to private failed:", error.message);
    return false;
  }
  return true;
}

module.exports = {
  PRIVATE_BUCKET,
  PUBLIC_BUCKET,
  REF_PREFIX,
  URL_TTL_S,
  isSafePath,
  isRef,
  refForPath,
  parseMediaUrl,
  signedUrlForPath,
  verifySignature,
  rewriteOutgoing,
  mayContainRef,
  installPrivateMediaHooks,
  supabaseSignedUrl,
  canAccessPath,
  normalizeIncomingMediaUrl,
  ensurePrivateCopy,
  _resetForTests() {
    keyCache = null;
    signCache.clear();
    hooksInstalled = false;
  },
};
