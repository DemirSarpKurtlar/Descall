"use strict";

/**
 * Animated avatar / banner (GIF, animated WebP, APNG) is Descall+ (owner decision 27 Nov).
 *   - Only NEW uploads / changes are checked: a free account that already has an animated avatar
 *     keeps it until it changes it (grandfathered), nothing is ever removed.
 *   - The gate only applies where Descall+ is on sale for the request's platform (config), so it
 *     never blocks anyone who cannot buy the upgrade. Until then GIFs stay open to everyone.
 *   - A refusal is not an error page: the client already showed the live preview and the offer
 *     ("3 gün ücretsiz dene" / "Hediye iste" / "İlk kareyi sabit olarak kullan").
 */

const config = require("./config");

/** Number of frames in a GIF, counted up to `stopAt` (no decode). 0 = not a GIF / broken. */
function gifFrameCount(buf, stopAt = 2) {
  if (!Buffer.isBuffer(buf) || buf.length < 13) return 0;
  const sig = buf.toString("ascii", 0, 6);
  if (sig !== "GIF87a" && sig !== "GIF89a") return 0;
  let off = 13;
  const flags = buf[10];
  if (flags & 0x80) off += 3 * (1 << ((flags & 0x07) + 1));
  let frames = 0;
  const skipSubBlocks = () => {
    while (off < buf.length) {
      const size = buf[off];
      off += 1;
      if (size === 0) return true;
      off += size;
    }
    return false;
  };
  while (off < buf.length) {
    const b = buf[off];
    if (b === 0x3b) break; // trailer
    if (b === 0x21) { // extension: introducer, label, sub-blocks
      off += 2;
      if (!skipSubBlocks()) break;
    } else if (b === 0x2c) { // image descriptor
      if (off + 10 > buf.length) break;
      const lflags = buf[off + 9];
      off += 10;
      if (lflags & 0x80) off += 3 * (1 << ((lflags & 0x07) + 1));
      off += 1; // LZW minimum code size
      if (!skipSubBlocks()) { frames += 1; break; }
      frames += 1;
      if (frames >= stopAt) break;
    } else {
      break;
    }
  }
  return frames;
}

function isAnimatedWebp(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 30 || buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WEBP") return false;
  return buf.toString("ascii", 12, 16) === "VP8X" && (buf[20] & 0x02) !== 0;
}

function isApng(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 16 || buf.readUInt32BE(0) !== 0x89504e47) return false;
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

/** True for a moving picture (2+ GIF frames, animated WebP, APNG). A one-frame GIF is still. */
function isAnimatedImage(buf) {
  if (gifFrameCount(buf, 2) >= 2) return true;
  return isAnimatedWebp(buf) || isApng(buf);
}

/** URL path ends in .gif (the old banner flow saves a GIF URL through PUT /api/user/profile). */
function looksAnimatedUrl(url) {
  if (typeof url !== "string" || !url) return false;
  const path = url.split(/[?#]/)[0].toLowerCase();
  return path.endsWith(".gif");
}

/**
 * Decision for one change. plan: the person's active plan (null = free).
 * Returns { allowed: true } or { allowed: false, code: 'ANIMATED_PROFILE_PLUS', kind }.
 */
function decide({ cfg, platform = "web", userId = null, plan = null, animated, kind = "avatar" }) {
  if (!animated) return { allowed: true };
  if (plan === "plus" || plan === "ultra") return { allowed: true };
  if (!config.featureOn(cfg || config.DEFAULTS, "animatedGate", platform, userId)) return { allowed: true };
  return { allowed: false, code: "ANIMATED_PROFILE_PLUS", kind };
}

/** Platform of a request: X-Descall-Platform header (set by the app shells), else web. */
function platformOf(req) {
  const h = req?.get ? req.get("x-descall-platform") : req?.headers?.["x-descall-platform"];
  return config.normalizePlatform(h || req?.query?.platform || "web");
}

/**
 * Express-friendly check used by routes/media.js (avatar, banner-image) and the profile save.
 * Never throws: an internal error allows the change (the gate fails open to keep profiles working).
 */
async function check(req, { buffer = null, url = null, kind = "avatar" } = {}) {
  try {
    const animated = buffer ? isAnimatedImage(buffer) : looksAnimatedUrl(url);
    if (!animated) return { allowed: true };
    const cfg = await config.load();
    const platform = platformOf(req);
    const userId = req?.user?.id || null;
    if (!config.featureOn(cfg, "animatedGate", platform, userId)) return { allowed: true };
    const plan = await require("../premium/entitlements").planFor(userId, { fresh: true });
    const out = decide({ cfg, platform, userId, plan, animated, kind });
    if (!out.allowed) {
      require("./paywall").track(userId, { moment: "gif_upload", action: "suppressed", platform, meta: { kind, server: true } }).catch?.(() => {});
    }
    return out;
  } catch {
    return { allowed: true };
  }
}

/** The 403 body the client turns into the in-place offer. */
function refusal(kind) {
  return { error: "ANIMATED_PROFILE_PLUS", code: "ANIMATED_PROFILE_PLUS", errorKey: "plus2.gif.serverRefused", kind };
}

module.exports = { gifFrameCount, isAnimatedWebp, isApng, isAnimatedImage, looksAnimatedUrl, decide, platformOf, check, refusal };
