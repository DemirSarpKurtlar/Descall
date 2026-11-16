"use strict";

/**
 * Tiny SVG toolkit for the C3 art (avatar effect rings, theme scenes, aura
 * corners). Everything returns strings; `uri()` turns a document into a CSS
 * url(data:...) that the browser rasterises once per size, so rotating it is
 * a compositor-only transform.
 *
 * Avatar effect space: viewBox -50 -50 100 100 fills the effect box, which is
 * the avatar plus --fx-gap + --fx-w (5% + 7% of the avatar). In these units
 * the avatar edge is r = 40.3, the gap is 40.3..44.4 and the ring band is
 * 44.4..50. Rings sit in the band; small orbiting objects may use the gap,
 * never the avatar.
 */

const R_AV = 40.3;
const R_GAP = 44.4;
const R_OUT = 49.6;
const R_MID = (R_GAP + R_OUT) / 2; // band centre line
const R_OBJ = (R_AV + R_OUT) / 2 + 0.6; // centre of the gap + band

const f = (n) => Number(Number(n).toFixed(2));
const rad = (d) => (d * Math.PI) / 180;
/** Point on a circle: 0deg = top, clockwise. */
const pt = (r, deg) => [f(Math.sin(rad(deg)) * r), f(-Math.cos(rad(deg)) * r)];

/** Wrap content in an SVG document. */
function svg(body, { vb = "-50 -50 100 100", defs = "", w, h, par } = {}) {
  const size = w ? ` width='${w}' height='${h}'` : "";
  const ar = par ? ` preserveAspectRatio='${par}'` : "";
  return `<svg xmlns='http://www.w3.org/2000/svg' viewBox='${vb}'${size}${ar}>${defs ? `<defs>${defs}</defs>` : ""}${body}</svg>`;
}

/** CSS url() for an SVG document (single quotes inside, escaped for a data URI). */
function uri(doc) {
  const s = doc
    .replace(/\s+/g, " ")
    .replace(/> </g, "><")
    .replace(/"/g, "'")
    .replace(/%/g, "%25")
    .replace(/#/g, "%23")
    .replace(/</g, "%3C")
    .replace(/>/g, "%3E");
  return `url("data:image/svg+xml,${s}")`;
}

/** Annulus path between r1 < r2 (fill-rule evenodd). */
function annulus(r1, r2) {
  return `M0 ${-r2}A${r2} ${r2} 0 1 1 0 ${r2}A${r2} ${r2} 0 1 1 0 ${-r2}ZM0 ${-r1}A${r1} ${r1} 0 1 0 0 ${r1}A${r1} ${r1} 0 1 0 0 ${-r1}Z`;
}
/** Arc stroke path from a0 to a1 degrees at radius r. */
function arc(r, a0, a1) {
  const [x0, y0] = pt(r, a0);
  const [x1, y1] = pt(r, a1);
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  return `M${x0} ${y0}A${r} ${r} 0 ${large} 1 ${x1} ${y1}`;
}
/** n copies of `shape` (drawn pointing up at the origin) placed at radius r. */
function around(n, r, shape, { start = 0, rot = 0, every = null } = {}) {
  let out = "";
  for (let i = 0; i < n; i += 1) {
    const d = start + (360 / n) * i;
    const s = typeof shape === "function" ? shape(i, d) : shape;
    if (!s) continue;
    out += `<g transform='rotate(${f(d)}) translate(0 ${-r}) rotate(${rot})'>${s}</g>`;
  }
  return out;
}
/** Place one shape at angle deg, radius r (shape points outward). */
const at = (deg, r, s, rot = 0) => `<g transform='rotate(${f(deg)}) translate(0 ${-r}) rotate(${rot})'>${s}</g>`;

/** Radial gradient def. stops = [[offset, colour, opacity]] */
function rg(id, stops, { cx = "50%", cy = "50%", r = "50%", fx, fy, units } = {}) {
  const u = units ? ` gradientUnits='${units}'` : "";
  const fo = fx ? ` fx='${fx}' fy='${fy}'` : "";
  return `<radialGradient id='${id}' cx='${cx}' cy='${cy}' r='${r}'${fo}${u}>${stops.map(([o, c, a = 1]) => `<stop offset='${o}' stop-color='${c}' stop-opacity='${a}'/>`).join("")}</radialGradient>`;
}
/** Linear gradient def (x1 y1 x2 y2 as fractions). */
function lg(id, stops, [x1, y1, x2, y2] = [0, 0, 0, 1], units) {
  const u = units ? ` gradientUnits='${units}'` : "";
  return `<linearGradient id='${id}' x1='${x1}' y1='${y1}' x2='${x2}' y2='${y2}'${u}>${stops.map(([o, c, a = 1]) => `<stop offset='${o}' stop-color='${c}' stop-opacity='${a}'/>`).join("")}</linearGradient>`;
}

/* Shapes (drawn at the origin, "up" = outward). */
const shape = {
  dot: (r, fill) => `<circle r='${r}' fill='${fill}'/>`,
  glowDot: (r, core, halo) => `<circle r='${f(r * 2.6)}' fill='${halo}' opacity='0.45'/><circle r='${f(r * 1.5)}' fill='${halo}' opacity='0.6'/><circle r='${r}' fill='${core}'/>`,
  star4: (s, fill) => `<path d='M0 ${-s}Q${f(s * 0.16)} ${f(-s * 0.16)} ${s} 0Q${f(s * 0.16)} ${f(s * 0.16)} 0 ${s}Q${f(-s * 0.16)} ${f(s * 0.16)} ${-s} 0Q${f(-s * 0.16)} ${f(-s * 0.16)} 0 ${-s}Z' fill='${fill}'/>`,
  star5: (s, fill) => {
    let d = "";
    for (let i = 0; i < 10; i += 1) {
      const [x, y] = pt(i % 2 ? s * 0.45 : s, i * 36);
      d += `${i ? "L" : "M"}${x} ${y}`;
    }
    return `<path d='${d}Z' fill='${fill}'/>`;
  },
  petal: (w, h, fill, stroke = "none") => `<path d='M0 ${f(h / 2)}C${f(w)} ${f(h / 4)} ${f(w * 0.7)} ${f(-h / 2)} 0 ${f(-h / 2)}C${f(-w * 0.7)} ${f(-h / 2)} ${f(-w)} ${f(h / 4)} 0 ${f(h / 2)}Z' fill='${fill}' stroke='${stroke}' stroke-width='0.4'/>`,
  flame: (w, h, fill) => `<path d='M0 ${f(-h)}C${f(w * 0.3)} ${f(-h * 0.55)} ${f(w)} ${f(-h * 0.35)} ${f(w * 0.75)} 0C${f(w * 0.55)} ${f(h * 0.3)} ${f(-w * 0.55)} ${f(h * 0.3)} ${f(-w * 0.75)} 0C${f(-w)} ${f(-h * 0.35)} ${f(-w * 0.3)} ${f(-h * 0.55)} 0 ${f(-h)}Z' fill='${fill}'/>`,
  leaf: (w, h, fill, vein) => `<path d='M0 ${f(h / 2)}Q${f(w)} 0 0 ${f(-h / 2)}Q${f(-w)} 0 0 ${f(h / 2)}Z' fill='${fill}'/>${vein ? `<path d='M0 ${f(h / 2)}L0 ${f(-h / 2.4)}' stroke='${vein}' stroke-width='0.35'/>` : ""}`,
  heart: (s, fill) => `<path d='M0 ${f(s * 0.9)}C${f(-s * 1.4)} ${f(-s * 0.1)} ${f(-s * 0.6)} ${f(-s * 1.1)} 0 ${f(-s * 0.35)}C${f(s * 0.6)} ${f(-s * 1.1)} ${f(s * 1.4)} ${f(-s * 0.1)} 0 ${f(s * 0.9)}Z' fill='${fill}'/>`,
  hex: (s, fill, stroke = "none", sw = 0.5) => {
    let d = "";
    for (let i = 0; i < 6; i += 1) {
      const [x, y] = pt(s, i * 60 + 30);
      d += `${i ? "L" : "M"}${x} ${y}`;
    }
    return `<path d='${d}Z' fill='${fill}' stroke='${stroke}' stroke-width='${sw}'/>`;
  },
  snowflake: (s, c, sw = 0.7) => {
    let p = "";
    for (let i = 0; i < 6; i += 1) {
      const a = i * 60;
      const [x, y] = pt(s, a);
      const [bx, by] = pt(s * 0.55, a);
      const [l1x, l1y] = pt(s * 0.82, a - 28);
      const [l2x, l2y] = pt(s * 0.82, a + 28);
      p += `M0 0L${x} ${y}M${bx} ${by}L${l1x} ${l1y}M${bx} ${by}L${l2x} ${l2y}`;
    }
    return `<path d='${p}' stroke='${c}' stroke-width='${sw}' stroke-linecap='round' fill='none'/>`;
  },
  bolt: (h, c, sw = 0.9) => `<path d='M0 ${f(-h)}L${f(h * 0.28)} ${f(-h * 0.45)}L${f(-h * 0.12)} ${f(-h * 0.3)}L${f(h * 0.2)} ${f(h * 0.25)}L${f(-h * 0.2)} ${f(h * 0.05)}L0 ${f(h * 0.55)}' stroke='${c}' stroke-width='${sw}' stroke-linejoin='round' stroke-linecap='round' fill='none'/>`,
  diamond: (w, h, fill) => `<path d='M0 ${f(-h)}L${w} 0L0 ${h}L${-w} 0Z' fill='${fill}'/>`,
};

module.exports = { R_AV, R_GAP, R_OUT, R_MID, R_OBJ, f, pt, svg, uri, annulus, arc, around, at, rg, lg, shape };
