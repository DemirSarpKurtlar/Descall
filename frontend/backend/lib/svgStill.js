"use strict";

/**
 * Still variant of catalog SVG art (`GET /api/shop/assets/:id?still=1`, `/api/shop2/assets/:id?still=1`).
 * Market 2.0 frames and banners animate with SMIL, which CSS cannot pause and which ignores
 * prefers-reduced-motion; clients with reduced motion or the lite material ask for this copy
 * (src/lib/stillArt.js). Catalog animations never use fill="freeze", so removing the animation
 * elements leaves the resting pose.
 */
const SMIL_RE = /<(animate|animateTransform|animateMotion|set)\b[^>]*?(?:\/>|>[\s\S]*?<\/\1\s*>)/gi;

function stripSmil(svg) {
  return String(svg == null ? "" : svg).replace(SMIL_RE, "");
}

/** `{ contentType, body, version }` -> the still copy when asked for an SVG; else unchanged. */
function stillImage(image, wantStill) {
  if (!wantStill || !image || !/svg/i.test(String(image.contentType || ""))) return image;
  const body = Buffer.from(stripSmil(Buffer.isBuffer(image.body) ? image.body.toString("utf8") : image.body), "utf8");
  return { ...image, body }; // same version: `?v=` stays immutable; the URL differs by still=1
}

module.exports = { stripSmil, stillImage };
