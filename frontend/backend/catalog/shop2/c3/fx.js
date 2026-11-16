"use strict";

/**
 * Market 2.0 catalog C3 (motion): small CSS-string helpers shared by the
 * render specs in this folder. Everything here returns plain CSS text; the
 * builder (build-css.mjs) turns the specs into src/styles/shop2-c3.css.
 *
 * Avatar effect geometry follows src/lib/avatarEffectGeometry.js: the effect
 * box extends --fx-gap + --fx-w past the avatar and every layer paints only
 * inside the outer --fx-w band (mask band below).
 */

const W = "var(--fx-w)";
/** Radius of the centre line of the avatar effect band. */
const BAND_R = "var(--s2r)";

const n4 = (v) => Number(v.toFixed(4));

/** "x y" position of a point on the band centre line; 0deg = top, clockwise. */
function bandPos(deg, rr = BAND_R) {
  const r = (deg * Math.PI) / 180;
  const s = n4(Math.sin(r));
  const c = n4(Math.cos(r));
  return `calc(50% + ${s} * ${rr}) calc(50% - ${c} * ${rr})`;
}

/** rgba() from "#rrggbb" + alpha. */
function rgba(hex, a = 1) {
  const h = String(hex).replace("#", "");
  const v = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return `rgba(${v[0]},${v[1]},${v[2]},${a})`;
}

/** Mix two hex colours (t = 0 → a, 1 → b). */
function mix(a, b, t) {
  const pa = String(a).replace("#", "");
  const pb = String(b).replace("#", "");
  const out = [0, 2, 4].map((i) => {
    const x = parseInt(pa.slice(i, i + 2), 16);
    const y = parseInt(pb.slice(i, i + 2), 16);
    return Math.round(x + (y - x) * t).toString(16).padStart(2, "0");
  });
  return `#${out.join("")}`;
}

/** Solid round particle (with optional soft halo) sitting on the band. */
function dot(deg, color, k = 0.55, halo = null) {
  const p = bandPos(deg);
  const core = `radial-gradient(circle at ${p}, ${color} 0 calc(${W} * ${k}), transparent calc(${W} * ${k} + 1px))`;
  if (!halo) return core;
  return `${core}, radial-gradient(circle at ${p}, ${halo} 0, transparent calc(${W} * ${n4(k * 2.6)}))`;
}

/** Four point sparkle on the band (two thin ellipses + a hot core). */
function sparkle(deg, color = "#ffffff", k = 1) {
  const p = bandPos(deg);
  return [
    `radial-gradient(circle at ${p}, #fff 0 calc(${W} * ${n4(0.22 * k)}), transparent calc(${W} * ${n4(0.22 * k)} + 0.8px))`,
    `radial-gradient(ellipse calc(${W} * ${n4(1.5 * k)}) calc(${W} * ${n4(0.2 * k)}) at ${p}, ${color}, transparent)`,
    `radial-gradient(ellipse calc(${W} * ${n4(0.2 * k)}) calc(${W} * ${n4(1.5 * k)}) at ${p}, ${color}, transparent)`,
  ].join(", ");
}

/** n evenly spaced items produced by fn(deg, i). */
function ring(n, start, fn) {
  const out = [];
  for (let i = 0; i < n; i += 1) out.push(fn(start + (360 / n) * i, i));
  return out.join(", ");
}

/** Masks for the avatar band. */
const MASK_CSS = {
  band: `radial-gradient(farthest-side, transparent calc(100% - ${W} - 0.5px), #000 calc(100% - ${W}))`,
  // Soft inner edge, crisp outer edge (antialiased).
  soft: `radial-gradient(farthest-side, transparent calc(100% - ${W} - 0.5px), #000 calc(100% - ${W} * 0.45), #000 calc(100% - 0.6px), transparent 100%)`,
  // Thin inner line of the band only (for double rings).
  inner: `radial-gradient(farthest-side, transparent calc(100% - ${W} - 0.5px), #000 calc(100% - ${W}), #000 calc(100% - ${W} * 0.62), transparent calc(100% - ${W} * 0.5))`,
  outer: `radial-gradient(farthest-side, transparent calc(100% - ${W} * 0.4 - 0.5px), #000 calc(100% - ${W} * 0.4), #000 calc(100% - 0.6px), transparent 100%)`,
};

/** Masks are custom properties declared once on the effect element. */
const MASK = Object.fromEntries(Object.keys(MASK_CSS).map((k) => [k, `var(--s2m-${k})`]));

/** Rounded-tube shading for a ring (dark edges, lit centre line). */
const TUBE_CSS = `radial-gradient(farthest-side, rgba(0,0,0,0.5) calc(100% - ${W}), rgba(0,0,0,0) calc(100% - ${W} * 0.55), rgba(0,0,0,0) calc(100% - ${W} * 0.4), rgba(0,0,0,0.42) 100%)`;
/** Specular light from the top left (static layer over a moving ring). */
const GLOSS_CSS = "linear-gradient(155deg, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0.18) 22%, rgba(255,255,255,0) 40%, rgba(255,255,255,0) 66%, rgba(255,255,255,0.28) 100%)";

const TUBE = "var(--s2-tube)";
const GLOSS = "var(--s2-gloss)";
const GLOSS_SOFT = "var(--s2-gloss-soft)";
const TUBE_LIGHT = "var(--s2-tube-light)";

/** Comet: bright head at `deg` with a tail of `len` degrees behind it. */
function comet(deg, color, len = 120, head = "#ffffff") {
  const a0 = deg - len;
  return `conic-gradient(from ${n4(a0)}deg, transparent 0deg, ${rgba(color, 0)} 2deg, ${rgba(color, 0.35)} ${n4(len * 0.55)}deg, ${color} ${n4(len * 0.9)}deg, ${head} ${n4(len - 1)}deg, transparent ${n4(len + 0.5)}deg)`;
}

module.exports = { W, BAND_R, bandPos, rgba, mix, dot, sparkle, ring, MASK, MASK_CSS, TUBE, TUBE_CSS, GLOSS, GLOSS_CSS, GLOSS_SOFT, TUBE_LIGHT, comet, n4 };
