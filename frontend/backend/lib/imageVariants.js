"use strict";

/**
 * AVIF copies of uploaded still images (avatars, banners, group photos / server icons and
 * chat image attachments). The original is always kept and stays the canonical file; the
 * AVIF is a smaller sibling that only clients able to decode it ever receive.
 *
 * Naming contract (shared with the web client, src/lib/avifImage.js):
 *   <folder>/<ms timestamp>-<random>-av1.<jpg|png|webp>   original, "-av1" = has a sibling
 *   <folder>/<ms timestamp>-<random>-av1.avif             the AVIF sibling
 * Public images (avatars, banners) get the "-av1" name only after the sibling is stored, so
 * a client that sees the mark can request the .avif directly. Private chat images are
 * served through GET /api/media/f/... which negotiates on the Accept header and checks
 * that the sibling exists (it is encoded in the background after the upload answers).
 *
 * CPU safety on Render (the API runs on a small instance): one encode at a time (libvips
 * limited to one thread), a short wait queue, fast encoder effort (2 of 0-9), a downscale
 * cap per use, an input pixel limit, a per-image timeout, and no encode at all while the
 * event loop is already busy (> 60% utilisation over the last seconds). When sharp is not
 * installed, MEDIA_AVIF=off is set, the server is busy or the AVIF is not clearly smaller,
 * nothing changes: the upload stores the original exactly as before.
 * Measured on one core (sharp 0.35, effort 2): a 512 px avatar 35-115 ms, a 1280 px banner
 * 125-410 ms, a 2048 px chat image 0.3-1.1 s (a busy screenshot is the slow case).
 * Animated images (GIF, animated WebP, APNG) are never converted.
 */

const AVIF_MIME = "image/avif";
const SOURCE_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MARK = "-av1";
const MARKED_RE = /^((?:[A-Za-z0-9._-]+\/)*\d{10,}-[a-z0-9]{1,16}-av1)\.(?:jpe?g|png|webp)$/i;
const SIBLING_RE = /^((?:[A-Za-z0-9._-]+\/)*\d{10,}-[a-z0-9]{1,16}-av1)\.avif$/i;

const MAX_INPUT_BYTES = 16 * 1024 * 1024;
const LIMIT_INPUT_PIXELS = 40_000_000;
/** The AVIF must save at least this fraction of the original's bytes to be kept. */
const MIN_SAVING = 0.1;

/** Encode settings per use. maxEdge caps the longest side (the original keeps full size). */
// Avatars are drawn at most ~160 CSS px (x3 DPR), banners ~600 CSS px (x2), chat photos fill
// the lightbox; the original (full size) stays available for download and older clients.
const PROFILES = {
  avatar: { maxEdge: 512, quality: 55, effort: 2 },
  banner: { maxEdge: 1280, quality: 58, effort: 2 },
  image: { maxEdge: 2048, quality: 60, effort: 2 },
};

const BUSY_ELU = 0.6;

function enabled(env = process.env) {
  return String(env.MEDIA_AVIF || "").trim().toLowerCase() !== "off";
}

// ── Names ────────────────────────────────────────────────────────────────────

/** Storage file name for a new upload; `avif` adds the "-av1" mark. */
function uploadName(ext, { avif = false, now = Date.now(), rand = Math.random().toString(36).slice(2, 9) } = {}) {
  const safeRand = String(rand).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 16) || "x";
  return `${now}-${safeRand}${avif ? MARK : ""}.${ext}`;
}

function isMarkedPath(path) {
  return typeof path === "string" && !path.includes("..") && MARKED_RE.test(path.replace(/^quarantine\//, ""));
}

/** "<path>-av1.avif" for a marked original path, else null. */
function avifSiblingPath(path) {
  if (!isMarkedPath(path)) return null;
  return path.replace(/\.(?:jpe?g|png|webp)$/i, ".avif");
}

function isSiblingPath(path) {
  return typeof path === "string" && SIBLING_RE.test(path.replace(/^quarantine\//, ""));
}

/** `paths` plus the AVIF sibling of every marked one (for deletes). */
function withVariantPaths(paths) {
  const out = [];
  const seen = new Set();
  for (const p of Array.isArray(paths) ? paths : []) {
    for (const q of [p, avifSiblingPath(p)]) {
      if (q && !seen.has(q)) {
        seen.add(q);
        out.push(q);
      }
    }
  }
  return out;
}

// ── Accept negotiation ───────────────────────────────────────────────────────

/**
 * True when the request is an image load from a client that declares AVIF support.
 * Image requests send e.g. "image/avif,image/webp,image/apng,image/*,*\/*;q=0.8" (Chromium,
 * Firefox, Safari 16+). Page navigations (open in new tab, which "Save as" would keep) and
 * fetch() downloads (Accept "*\/*") get the original.
 */
function acceptsAvif(headers = {}) {
  const get = (name) => {
    let v = headers?.[name];
    if (v == null && headers && typeof headers === "object") {
      const key = Object.keys(headers).find((k) => k.toLowerCase() === name);
      v = key ? headers[key] : undefined;
    }
    return Array.isArray(v) ? v.join(",") : String(v || "");
  };
  const accept = get("accept").toLowerCase();
  if (!accept) return false;
  const dest = get("sec-fetch-dest").toLowerCase();
  if (dest && dest !== "image") return false;
  if (/(^|,)\s*text\/html\b/.test(accept)) return false;
  for (const part of accept.split(",")) {
    const [type, ...params] = part.trim().split(";").map((s) => s.trim());
    if (type !== AVIF_MIME) continue;
    const q = params.find((p) => p.startsWith("q="));
    if (q && !(Number(q.slice(2)) > 0)) return false;
    return true;
  }
  return false;
}

// ── Animation sniffing (no decode) ──────────────────────────────────────────

function isAnimatedWebp(buf) {
  if (buf.length < 30 || buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WEBP") return false;
  // Only the extended format (VP8X) can animate; its flags byte has the animation bit (0x02).
  return buf.toString("ascii", 12, 16) === "VP8X" && (buf[20] & 0x02) !== 0;
}

function isApng(buf) {
  if (buf.length < 16 || buf.readUInt32BE(0) !== 0x89504e47) return false;
  let off = 8;
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString("ascii", off + 4, off + 8);
    if (type === "acTL") return true;
    if (type === "IDAT" || type === "IEND") return false;
    off += 12 + len;
  }
  return false;
}

/** Real format from the first bytes ("image/jpeg" | "image/png" | "image/webp" | null). */
function sniffImageType(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.readUInt32BE(0) === 0x89504e47 && buf.readUInt32BE(4) === 0x0d0a1a0a) return "image/png";
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

/**
 * True for an image we may convert: a still JPEG / PNG / WebP (declared type and real bytes
 * agree) within the size limit. GIFs, animated WebP and APNG are never eligible.
 */
function isAvifEligible(file) {
  if (!file || !Buffer.isBuffer(file.buffer)) return false;
  const mime = String(file.mimetype || "").toLowerCase();
  if (!SOURCE_MIMES.has(mime)) return false;
  if (!file.buffer.length || file.buffer.length > MAX_INPUT_BYTES) return false;
  if (sniffImageType(file.buffer) !== mime) return false;
  if (mime === "image/webp" && isAnimatedWebp(file.buffer)) return false;
  if (mime === "image/png" && isApng(file.buffer)) return false;
  return true;
}

/** Extension a marked original is stored with (from the real type, not the file name). */
function extForMime(mime) {
  return { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[String(mime || "").toLowerCase()] || null;
}

// ── Encoder (one at a time) ─────────────────────────────────────────────────

let sharpLoaded = false;
let sharpLib = null;
function loadSharp() {
  if (sharpLoaded) return sharpLib;
  sharpLoaded = true;
  try {
    // eslint-disable-next-line global-require
    sharpLib = require("sharp");
    sharpLib.concurrency(1); // libvips threads per image: leave the other cores to the API
    sharpLib.cache(false);
  } catch {
    sharpLib = null;
    console.warn("[image-variants] sharp is not installed: AVIF copies are off");
  }
  return sharpLib;
}

// Event-loop utilisation sampled every 5 s once the encoder is in use (unref'd timer).
const { performance } = require("perf_hooks");
let eluTimer = null;
let eluPrev = null;
let eluRecent = 0;
function serverBusy() {
  if (!eluTimer) {
    eluPrev = performance.eventLoopUtilization();
    eluTimer = setInterval(() => {
      const now = performance.eventLoopUtilization();
      eluRecent = performance.eventLoopUtilization(now, eluPrev).utilization;
      eluPrev = now;
    }, 5000);
    if (typeof eluTimer.unref === "function") eluTimer.unref();
  }
  return eluRecent > BUSY_ELU;
}

const MAX_ACTIVE = 1;
const MAX_WAITING = 6;
let active = 0;
const waiters = [];
const stats = { encoded: 0, skipped: 0, busy: 0, failed: 0, bytesIn: 0, bytesOut: 0 };

function acquire(waitMs) {
  if (active < MAX_ACTIVE) {
    active += 1;
    return Promise.resolve(true);
  }
  if (waiters.length >= MAX_WAITING || waitMs <= 0) return Promise.resolve(false);
  return new Promise((resolve) => {
    const w = { resolve, timer: null };
    w.timer = setTimeout(() => {
      const i = waiters.indexOf(w);
      if (i >= 0) waiters.splice(i, 1);
      resolve(false);
    }, waitMs);
    if (typeof w.timer.unref === "function") w.timer.unref();
    waiters.push(w);
  });
}

function release() {
  const next = waiters.shift();
  if (next) {
    clearTimeout(next.timer);
    next.resolve(true); // the slot passes straight to the next waiter
  } else {
    active = Math.max(0, active - 1);
  }
}

/**
 * AVIF bytes for a still image, or null (disabled, no sharp, busy past waitMs, animated,
 * too large, failed or not at least MIN_SAVING smaller). Never throws.
 * opts: profile name or { maxEdge, quality, effort }, waitMs (queue wait), timeoutS.
 */
async function encodeAvif(buffer, { profile = "image", waitMs = 2500, timeoutS = 15, sharp: injected, isBusy = serverBusy } = {}) {
  if (!enabled() || !Buffer.isBuffer(buffer) || !buffer.length || buffer.length > MAX_INPUT_BYTES) return null;
  const lib = injected || loadSharp();
  if (!lib) return null;
  if (isBusy()) {
    stats.busy += 1;
    return null;
  }
  const p = typeof profile === "string" ? PROFILES[profile] || PROFILES.image : { ...PROFILES.image, ...profile };
  if (!(await acquire(waitMs))) {
    stats.busy += 1;
    return null;
  }
  try {
    const img = lib(buffer, { limitInputPixels: LIMIT_INPUT_PIXELS, failOn: "error", sequentialRead: true, animated: false });
    const meta = await img.metadata();
    if ((meta.pages || 1) > 1) {
      stats.skipped += 1;
      return null;
    }
    const { data, info } = await img
      .rotate()
      .resize({ width: p.maxEdge, height: p.maxEdge, fit: "inside", withoutEnlargement: true })
      .avif({ quality: p.quality, effort: p.effort, chromaSubsampling: "4:2:0" })
      .timeout({ seconds: timeoutS })
      .toBuffer({ resolveWithObject: true });
    if (!data || data.length > buffer.length * (1 - MIN_SAVING)) {
      stats.skipped += 1;
      return null;
    }
    stats.encoded += 1;
    stats.bytesIn += buffer.length;
    stats.bytesOut += data.length;
    return { buffer: data, width: info.width, height: info.height, mimeType: AVIF_MIME };
  } catch (err) {
    stats.failed += 1;
    console.warn("[image-variants] AVIF encode failed:", err?.message || err);
    return null;
  } finally {
    release();
  }
}

// ── Sibling existence (GET /api/media/f) ────────────────────────────────────

// A chat image's sibling is encoded in the background, so the first loads may come before
// it exists: remember a miss briefly, and for an hour once it has been missing twice (the
// encode was skipped: busy, not smaller, or the file came from an older client).
const MISSING_TTL_MS = 2 * 60 * 1000;
const MISSING_LONG_TTL_MS = 60 * 60 * 1000;
const missing = new Map(); // path -> { until, hits }

function noteMissing(path, now = Date.now()) {
  if (missing.size > 5000) missing.clear();
  const hits = (missing.get(path)?.hits || 0) + 1;
  missing.set(path, { until: now + (hits >= 2 ? MISSING_LONG_TTL_MS : MISSING_TTL_MS), hits });
}

function knownMissing(path, now = Date.now()) {
  const hit = missing.get(path);
  return Boolean(hit && hit.until > now);
}

function forgetMissing(path) {
  missing.delete(path);
}

module.exports = {
  AVIF_MIME,
  MARK,
  PROFILES,
  MIN_SAVING,
  MAX_INPUT_BYTES,
  enabled,
  uploadName,
  isMarkedPath,
  isSiblingPath,
  avifSiblingPath,
  withVariantPaths,
  acceptsAvif,
  isAnimatedWebp,
  isApng,
  isAvifEligible,
  sniffImageType,
  extForMime,
  encodeAvif,
  loadSharp,
  noteMissing,
  knownMissing,
  forgetMissing,
  stats,
  /** Use `lib` instead of require("sharp") (null = behave as if sharp were missing). */
  _setSharpForTests(lib) {
    sharpLoaded = true;
    sharpLib = lib;
  },
  _resetForTests() {
    if (eluTimer) clearInterval(eluTimer);
    eluTimer = null;
    eluRecent = 0;
    active = 0;
    waiters.splice(0).forEach((w) => clearTimeout(w.timer));
    missing.clear();
    sharpLoaded = false;
    sharpLib = null;
    for (const k of Object.keys(stats)) stats[k] = 0;
  },
};
