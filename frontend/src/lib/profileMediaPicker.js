/**
 * Profile photo + banner picker (owner-approved mockups
 * /workspace/design/avatar-picker-mockups): pure helpers shared by
 * components/profile/ProfileMediaPicker.jsx and its selftest.
 * Flow: source (upload / phone / camera, GIF tab) -> crop editor -> final preview -> save.
 */

import { gifRatio } from "./gifMasonry.js";

export const PICKER_TARGETS = Object.freeze({
  // Avatar: circular crop, still images exported at most 1024 px (same as the old crop modal).
  avatar: Object.freeze({ id: "avatar", aspect: 1, shape: "round", maxOutput: 1024, fileName: "avatar" }),
  // Banner: the same 3:1 frame the profile card has always used.
  banner: Object.freeze({ id: "banner", aspect: 3, shape: "rect", maxOutput: 1500, fileName: "banner" }),
});

export const MAX_PICK_BYTES = 8 * 1024 * 1024;
export const ALLOWED_PICK_TYPES = Object.freeze(["image/jpeg", "image/png", "image/webp", "image/gif"]);
export const ZOOM_MIN = 1;
export const ZOOM_MAX = 3;

export function pickerTarget(id) {
  return PICKER_TARGETS[id] || PICKER_TARGETS.avatar;
}

/** Error i18n key for a picked file, or null when it can be used. */
export function validatePickedFile(file) {
  if (!file) return "amp.errNoFile";
  if (!ALLOWED_PICK_TYPES.includes(String(file.type || "").toLowerCase())) return "amp.errType";
  if (Number(file.size) > MAX_PICK_BYTES) return "amp.errSize";
  return null;
}

export function isGifFile(file) {
  return String(file?.type || "").toLowerCase() === "image/gif";
}

/** Clockwise degrees in [0, 360), quarter turns only. */
export function normalizeRotation(deg) {
  const q = Math.round(Number(deg || 0) / 90) * 90;
  return ((q % 360) + 360) % 360;
}

/** "Döndür" turns the picture a quarter to the left, like Photos. */
export function rotateLeft(deg) {
  return normalizeRotation(Number(deg || 0) - 90);
}

/** `min` is the per-image contain zoom (zoomBounds), ZOOM_MIN when unknown. */
export function clampZoom(z, min = ZOOM_MIN, max = ZOOM_MAX) {
  const n = Number(z);
  const lo = Number.isFinite(Number(min)) && Number(min) > 0 ? Number(min) : ZOOM_MIN;
  if (!Number.isFinite(n)) return lo;
  return Math.min(Math.max(max, lo), Math.max(lo, n));
}

/** Slider fill (0..100) for the brand-coloured part of the zoom track. */
export function zoomFillPercent(z, min = ZOOM_MIN, max = ZOOM_MAX) {
  const lo = Number(min) > 0 ? Number(min) : ZOOM_MIN;
  if (!(max > lo)) return 0;
  return Math.round(((clampZoom(z, lo, max) - lo) / (max - lo)) * 100);
}

/**
 * Zoom range for one picture in the crop editor. react-easy-crop reports `mediaSize` (the
 * picture at zoom 1, fitted to the editor box) and we know the crop frame. `contain` is the
 * zoom where the WHOLE picture fits inside the frame and touches its edges (the owner's
 * "tam kenarlara kadar uzaklaştır"); `cover` is where it just fills the frame.
 * The old fixed minimum of 1 stopped short of both for most pictures.
 */
export function zoomBounds(mediaSize, cropSize) {
  const mw = Number(mediaSize?.width);
  const mh = Number(mediaSize?.height);
  const cw = Number(cropSize?.width);
  const ch = Number(cropSize?.height);
  if (!(mw > 0 && mh > 0 && cw > 0 && ch > 0)) return { min: ZOOM_MIN, cover: ZOOM_MIN, max: ZOOM_MAX };
  const contain = Math.min(cw / mw, ch / mh);
  const cover = Math.max(cw / mw, ch / mh);
  const round = (v) => Math.floor(v * 1000) / 1000;
  return { min: round(contain), cover: Math.ceil(cover * 1000) / 1000, max: Math.max(ZOOM_MAX, cover * ZOOM_MAX) };
}

/**
 * Keep the picture usable at any zoom (react-easy-crop's own restrictPosition only knows
 * "cover"): larger than the frame on an axis -> no empty edge on that axis; smaller ->
 * the picture stays inside the frame. Offsets are react-easy-crop `crop` px.
 */
export function clampCropPosition(pos, mediaSize, cropSize, zoom) {
  const x = Number(pos?.x) || 0;
  const y = Number(pos?.y) || 0;
  const mw = Number(mediaSize?.width) * Number(zoom);
  const mh = Number(mediaSize?.height) * Number(zoom);
  const cw = Number(cropSize?.width);
  const ch = Number(cropSize?.height);
  if (!(mw > 0 && mh > 0 && cw > 0 && ch > 0)) return { x, y };
  const lx = Math.abs(mw - cw) / 2;
  const ly = Math.abs(mh - ch) / 2;
  return { x: Math.min(lx, Math.max(-lx, x)), y: Math.min(ly, Math.max(-ly, y)) };
}

/** Crop rectangle reaches outside the picture (zoomed out past cover): needs a transparent margin. */
export function cropExceedsMedia(pixels, natural) {
  if (!pixels || !natural) return false;
  const e = 0.5;
  return pixels.x < -e || pixels.y < -e
    || pixels.x + pixels.width > Number(natural.width) + e
    || pixels.y + pixels.height > Number(natural.height) + e;
}

/** Crop payload the server accepts for GIFs (backend/lib/gifCrop.js parseCrop). */
export function serverCropPayload(pixels, rotation) {
  if (!pixels) return null;
  return {
    // Negative / past-the-edge rectangles are valid: the server pads them (contain zoom-out).
    x: Math.round(pixels.x),
    y: Math.round(pixels.y),
    width: Math.max(1, Math.round(pixels.width)),
    height: Math.max(1, Math.round(pixels.height)),
    rotation: normalizeRotation(rotation),
  };
}

/**
 * Live preview: place the picked media inside a frame so it shows exactly the crop.
 * `area` is react-easy-crop's croppedArea in percent of the ROTATED media, `natural` the
 * unrotated media size. Returns inline styles for the wrapper and the media element.
 */
export function previewLayout(area, rotation, natural) {
  const r = normalizeRotation(rotation);
  if (!area || !(area.width > 0) || !(area.height > 0)) {
    return { wrap: { position: "absolute", inset: 0 }, media: { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" } };
  }
  const wrap = {
    position: "absolute",
    width: `${(100 * 100) / area.width}%`,
    height: `${(100 * 100) / area.height}%`,
    left: `${(-area.x * 100) / area.width}%`,
    top: `${(-area.y * 100) / area.height}%`,
  };
  const quarter = r === 90 || r === 270;
  const w = Number(natural?.width) || 1;
  const h = Number(natural?.height) || 1;
  const media = {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: quarter ? `${(w / h) * 100}%` : "100%",
    height: quarter ? `${(h / w) * 100}%` : "100%",
    transform: `translate(-50%, -50%) rotate(${r}deg)`,
    maxWidth: "none",
  };
  return { wrap, media };
}

/** GIPHY rows -> picker tiles. Uses the same public key/endpoint as the chat GIF picker. */
export function giphyTiles(json) {
  const rows = Array.isArray(json?.data) ? json.data : [];
  const out = [];
  for (const g of rows) {
    const im = g?.images || {};
    const prev = im.fixed_width || im.fixed_width_downsampled || im.downsized;
    const full = im.downsized_medium || im.downsized || im.original;
    if (!prev?.url || !full?.url) continue;
    const width = Number(prev.width) || 200;
    const height = Number(prev.height) || 200;
    out.push({
      id: String(g.id || prev.url),
      title: String(g.title || "").slice(0, 120),
      preview: prev.webp || prev.url,
      full: full.url,
      width,
      height,
      // Real shape (masonry packs by it); only corrupt metadata is clamped.
      ratio: gifRatio({ width, height }),
    });
  }
  return out;
}

/** Category chips on the GIF tab. `q` is what GIPHY gets; label is an i18n key. */
export const GIF_CHIPS = Object.freeze([
  { id: "trending", label: "amp.chipTrending", q: "" },
  { id: "reaction", label: "amp.chipReaction", q: "reaction" },
  { id: "anime", label: "amp.chipAnime", q: "anime" },
  { id: "gaming", label: "amp.chipGaming", q: "gaming" },
  { id: "funny", label: "amp.chipFunny", q: "funny" },
  { id: "music", label: "amp.chipMusic", q: "music" },
  { id: "nature", label: "amp.chipNature", q: "nature" },
]);

/** Universal link the desktop QR opens: the same picker on the phone (AASA /settings/*). */
export function handoffUrl(target) {
  return `https://descall.com/settings/profile?picker=${target === "banner" ? "banner" : "avatar"}`;
}

/** `?picker=avatar|banner` on /settings/profile opens the picker (phone side of the QR). */
export function readPickerQuery(search) {
  try {
    const v = new URLSearchParams(String(search || "")).get("picker");
    return v === "avatar" || v === "banner" ? v : null;
  } catch {
    return null;
  }
}

const RECENT_KEY = (t) => `descall:amp-recent:${t === "banner" ? "banner" : "avatar"}`;
const RECENT_MAX = 7;

/** Recently picked GIFs ("Son kullandıkların"), newest first, https only. */
export function readRecent(target, storage = globalThis.localStorage) {
  try {
    const raw = JSON.parse(storage?.getItem(RECENT_KEY(target)) || "[]");
    return Array.isArray(raw)
      ? raw.filter((r) => r && /^https:\/\//.test(r.preview) && /^https:\/\//.test(r.full)).slice(0, RECENT_MAX)
      : [];
  } catch {
    return [];
  }
}

export function pushRecent(target, tile, storage = globalThis.localStorage) {
  if (!tile?.full || !tile?.preview) return readRecent(target, storage);
  const next = [
    { id: tile.id, preview: tile.preview, full: tile.full, width: tile.width, height: tile.height },
    ...readRecent(target, storage).filter((r) => r.full !== tile.full),
  ].slice(0, RECENT_MAX);
  try { storage?.setItem(RECENT_KEY(target), JSON.stringify(next)); } catch { /* quota */ }
  return next;
}

/** Steps in order; Back walks this list. */
export const STEPS = Object.freeze(["source", "edit", "final"]);
export function prevStep(step) {
  const i = STEPS.indexOf(step);
  return i > 0 ? STEPS[i - 1] : null;
}
