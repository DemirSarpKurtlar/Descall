"use strict";
// Market 2.0 catalog group C1: shared SVG helpers for avatar frames, banners and badges.
// Every helper returns a compact SVG string fragment. Art is deterministic (seeded random),
// so the asset hash (and the browser cache key) only changes when the art changes.
//
// Geometry contracts (match the real renderers):
// - Frame: viewBox 0 0 200 200, drawn by `.ui-avatar-frame-overlay` at 132% of the avatar, so
//   the avatar disc is r = 75.76 around (100,100). Main band sits on r 75..86, ornaments reach
//   r <= 99. Nothing but the band may cover the face (r < 74), except small crown / plate tips.
// - Banner: viewBox 0 0 600 200 (3:1), painted with background-size: cover into 3:1 .. 3.6:1
//   boxes; the avatar overlaps the bottom-left (x < 150, y > 110), so focal art lives right of
//   centre and the bottom-left stays calm.
// - Badge: viewBox 0 0 24 24, read at 16-20 px next to names: one bold silhouette, a dark
//   outline, at most one inner glyph, no hairlines.
// Motion: SVG-as-image animations cannot be paused by the app's idle CSS, so every animation
// is finite (repeatCount <= 3, about 6-24 s) and ends on its designed rest frame.

/** Round to one decimal (keeps data URIs small). */
const f = (n) => Math.round(n * 10) / 10;

/** Deterministic PRNG (Park-Miller). */
function rnd(seed) {
  let x = (Math.abs(Math.floor(seed)) % 2147483646) + 1;
  return () => {
    x = (x * 16807) % 2147483647;
    return (x - 1) / 2147483646;
  };
}

/** String -> numeric seed. */
function seedOf(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) || 7;
}

/** Collapse whitespace and percent-encode the few characters a data URI cannot carry. */
function dataUri(svg) {
  const min = svg
    .replace(/\s+/g, " ")
    .replace(/> </g, "><")
    .replace(/"/g, "'")
    .trim();
  return (
    "data:image/svg+xml;utf8," +
    min.replace(/%/g, "%25").replace(/#/g, "%23").replace(/</g, "%3C").replace(/>/g, "%3E").replace(/\n/g, "")
  );
}

function svgDoc(w, h, defs, body, extra = "") {
  return `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${w} ${h}' width='${w}' height='${h}'${extra}>${
    defs ? `<defs>${defs}</defs>` : ""
  }${body}</svg>`;
}

/** stops: array of colours (even spread) or [offset, colour, opacity?] triples. */
function stopsOf(stops) {
  return stops
    .map((s, i) => {
      if (Array.isArray(s)) {
        const [o, c, a] = s;
        return `<stop offset='${o}' stop-color='${c}'${a != null && a !== 1 ? ` stop-opacity='${a}'` : ""}/>`;
      }
      const o = stops.length === 1 ? 0 : f((i / (stops.length - 1)) * 100) / 100;
      return `<stop offset='${o}' stop-color='${s}'/>`;
    })
    .join("");
}

function lg(id, stops, x1 = 0, y1 = 0, x2 = 0, y2 = 1, extra = "") {
  return `<linearGradient id='${id}' x1='${x1}' y1='${y1}' x2='${x2}' y2='${y2}'${extra}>${stopsOf(stops)}</linearGradient>`;
}

function rg(id, stops, cx = 0.5, cy = 0.5, r = 0.5, extra = "") {
  return `<radialGradient id='${id}' cx='${cx}' cy='${cy}' r='${r}'${extra}>${stopsOf(stops)}</radialGradient>`;
}

/** Gradient in user space (for rings: light comes from top-left whatever the element). */
function lgU(id, stops, x1, y1, x2, y2) {
  return `<linearGradient id='${id}' gradientUnits='userSpaceOnUse' x1='${x1}' y1='${y1}' x2='${x2}' y2='${y2}'>${stopsOf(stops)}</linearGradient>`;
}
function rgU(id, stops, cx, cy, r, fx, fy) {
  return `<radialGradient id='${id}' gradientUnits='userSpaceOnUse' cx='${cx}' cy='${cy}' r='${r}'${
    fx != null ? ` fx='${fx}' fy='${fy}'` : ""
  }>${stopsOf(stops)}</radialGradient>`;
}

const blur = (id, sd) => `<filter id='${id}' x='-50%' y='-50%' width='200%' height='200%'><feGaussianBlur stdDeviation='${sd}'/></filter>`;

/** Metal palettes: [highlight, light, mid, dark, deep]. */
const METAL = {
  gold: ["#fff6cf", "#ffd76a", "#c8901f", "#7a4a0c", "#3a2104"],
  roseGold: ["#fff0ea", "#f6b8a2", "#c97a63", "#7a3f33", "#3a1a14"],
  silver: ["#ffffff", "#dfe6f2", "#9aa6bb", "#58627a", "#262c3a"],
  steel: ["#e8f1ff", "#9fb4d6", "#5b6f95", "#2c3a58", "#121a2c"],
  bronze: ["#ffe2c0", "#e2a066", "#a35f2a", "#5c3011", "#2a1406"],
  copper: ["#ffe3d0", "#f19a6a", "#b5562b", "#6b2a12", "#2e1006"],
  brass: ["#fff4c8", "#e8c86a", "#a8862e", "#5e4612", "#2a1e06"],
  obsidian: ["#9fa7c7", "#3b4160", "#181b2c", "#0b0d18", "#04050a"],
  platinum: ["#ffffff", "#eef1f6", "#bfc6d4", "#7d8699", "#3d4352"],
  jade: ["#e6fff1", "#7fe0a8", "#2f9e66", "#14583a", "#062a1b"],
  ivory: ["#ffffff", "#fbf3e2", "#e3d3b2", "#a8916a", "#5e4c30"],
};

/** Five-stop diagonal metal sheen (light - dark - light - dark) in frame user space. */
function metalGrad(id, m, angle = 0) {
  const c = typeof m === "string" ? METAL[m] : m;
  const a = ((angle - 45) * Math.PI) / 180;
  const x1 = f(100 - Math.cos(a) * 100), y1 = f(100 - Math.sin(a) * 100);
  const x2 = f(100 + Math.cos(a) * 100), y2 = f(100 + Math.sin(a) * 100);
  return lgU(id, [[0, c[0]], [0.22, c[1]], [0.45, c[3]], [0.62, c[1]], [0.8, c[2]], [1, c[4]]], x1, y1, x2, y2);
}

// ---------- frame geometry ----------
const C = 100;
const AV = 75.76;

/** Polar point: deg 0 = top, clockwise. */
function pol(r, deg) {
  const a = ((deg - 90) * Math.PI) / 180;
  return [f(C + r * Math.cos(a)), f(C + r * Math.sin(a))];
}

/** Arc path along radius r from deg a to deg b (clockwise). */
function arc(r, a, b) {
  const [x1, y1] = pol(r, a);
  const [x2, y2] = pol(r, b);
  const large = ((b - a + 360) % 360) > 180 ? 1 : 0;
  return `M${x1} ${y1}A${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
}

/** Annulus (donut) path between r1 < r2, for gradient-filled bands. */
function annulus(r1, r2) {
  return `M${C - r2} ${C}a${r2} ${r2} 0 1 0 ${2 * r2} 0a${r2} ${r2} 0 1 0 ${-2 * r2} 0ZM${C - r1} ${C}a${r1} ${r1} 0 1 1 ${2 * r1} 0a${r1} ${r1} 0 1 1 ${-2 * r1} 0Z`;
}

const circ = (r, stroke, w, extra = "") =>
  `<circle cx='100' cy='100' r='${f(r)}' fill='none' stroke='${stroke}' stroke-width='${w}'${extra}/>`;

/**
 * Bevelled band: gradient body, dark inner lip (shadow on the photo), bright outer lip and a
 * soft specular arc on the upper left. This is what keeps a ring from looking flat.
 */
function band(r, w, paint, opt = {}) {
  const inner = r - w / 2, outer = r + w / 2;
  let s = `<circle cx='100' cy='100' r='${f(r)}' fill='none' stroke='${paint}' stroke-width='${w}'/>`;
  if (opt.shadow !== false) s += circ(inner + 0.5, opt.shadowColor || "#000", 1.4, ` stroke-opacity='${opt.shadowOpacity ?? 0.45}'`);
  s += circ(outer - 0.4, opt.lip || "#fff", 0.9, ` stroke-opacity='${opt.lipOpacity ?? 0.35}'`);
  if (opt.spec !== false)
    s += `<path d='${arc(r + w * 0.18, 292, 352)}' fill='none' stroke='#fff' stroke-width='${f(Math.max(1, w * 0.28))}' stroke-linecap='round' stroke-opacity='${opt.specOpacity ?? 0.55}'/>`;
  return s;
}

/** Repeat a <use> of `ref` n times around the centre. */
function around(ref, n, start = 0, step = null, extra = "") {
  const st = step == null ? 360 / n : step;
  let s = "";
  for (let i = 0; i < n; i++) s += `<use href='#${ref}' transform='rotate(${f(start + i * st)} 100 100)'${extra}/>`;
  return s;
}

/** Place `inner` (drawn around 0,0, pointing up) at polar (r,deg), rotated outward. */
function at(r, deg, inner, scale = 1, upright = false) {
  const [x, y] = pol(r, deg);
  return `<g transform='translate(${x} ${y}) rotate(${upright ? 0 : f(deg)})${scale !== 1 ? ` scale(${f(scale * 100) / 100})` : ""}'>${inner}</g>`;
}

/** Faceted gem symbol (id) with body gradient (two colours). */
function gemDefs(id, light, mid, dark) {
  return (
    rg(`${id}g`, [[0, light], [0.55, mid], [1, dark]], 0.35, 0.3, 0.8) +
    `<g id='${id}'><path d='M0 -6.5L5.6 -2.2L3.6 5.4H-3.6L-5.6 -2.2Z' fill='url(#${id}g)' stroke='${dark}' stroke-width='.7'/><path d='M0 -6.5L2.4 -2.2H-2.4Z' fill='#fff' fill-opacity='.75'/><path d='M-5.6 -2.2H5.6M-2.4 -2.2L0 5.4L2.4 -2.2' fill='none' stroke='#fff' stroke-opacity='.35' stroke-width='.5'/></g>`
  );
}

/** Round cabochon gem. */
function cabDefs(id, light, mid, dark, r = 5) {
  return (
    rg(`${id}g`, [[0, "#fff"], [0.18, light], [0.6, mid], [1, dark]], 0.38, 0.32, 0.75) +
    `<g id='${id}'><circle r='${r + 1.3}' fill='${dark}'/><circle r='${r}' fill='url(#${id}g)'/><ellipse cx='${f(-r * 0.32)}' cy='${f(-r * 0.4)}' rx='${f(r * 0.35)}' ry='${f(r * 0.2)}' fill='#fff' fill-opacity='.8' transform='rotate(-30)'/></g>`
  );
}

/** Four-point sparkle path centred on 0,0. */
function sparkle(r, w = 0.22) {
  const k = f(r * w);
  return `M0 ${-r}Q${k} ${-k} ${r} 0Q${k} ${k} 0 ${r}Q${-k} ${k} ${-r} 0Q${-k} ${-k} 0 ${-r}Z`;
}

/** Five-point star path. */
function star5(R, r = R * 0.45) {
  let d = "";
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 ? r : R;
    const a = ((i * 36 - 90) * Math.PI) / 180;
    d += (i ? "L" : "M") + f(rr * Math.cos(a)) + " " + f(rr * Math.sin(a));
  }
  return d + "Z";
}

/** Regular polygon path around 0,0 (first vertex at top). */
function poly(n, r, rot = 0) {
  let d = "";
  for (let i = 0; i < n; i++) {
    const a = (((360 / n) * i + rot - 90) * Math.PI) / 180;
    d += (i ? "L" : "M") + f(r * Math.cos(a)) + " " + f(r * Math.sin(a));
  }
  return d + "Z";
}

/** Leaf (pointed ellipse) pointing up, length L, width W. */
const leaf = (L, W) => `M0 0C${f(W)} ${f(-L * 0.3)} ${f(W * 0.6)} ${f(-L * 0.8)} 0 ${-L}C${f(-W * 0.6)} ${f(-L * 0.8)} ${f(-W)} ${f(-L * 0.3)} 0 0Z`;

/** Petal (rounder leaf). */
const petal = (L, W) => `M0 0C${f(W * 1.1)} ${f(-L * 0.2)} ${f(W)} ${f(-L)} 0 ${-L}C${f(-W)} ${f(-L)} ${f(-W * 1.1)} ${f(-L * 0.2)} 0 0Z`;

/** Petal-shaped feather/blade from point a to point b (width w), as a path element. */
function blade(a, b, w, fill, extra = "") {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  const ang = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
  return `<path d='${petal(f(len), w)}' transform='translate(${f(a[0])} ${f(a[1])}) rotate(${f(ang)})' fill='${fill}'${extra}/>`;
}

/** Finite SMIL helpers. */
const spin = (dur, n = 2, dir = 1, cx = 100, cy = 100) =>
  `<animateTransform attributeName='transform' type='rotate' from='0 ${cx} ${cy}' to='${dir * 360} ${cx} ${cy}' dur='${dur}s' repeatCount='${n}'/>`;
const pulse = (attr, values, dur, n = 3, begin = 0) =>
  `<animate attributeName='${attr}' values='${values}' dur='${dur}s' repeatCount='${n}'${begin ? ` begin='${begin}s'` : ""}/>`;

// ---------- banner helpers (600 x 200) ----------
const BW = 600, BH = 200;

/** Ridge line path from x=0..600 with midpoint displacement; fills down to `bottom`. */
function ridge(seed, base, amp, rough = 0.55, bottom = 200, pts = 64, peaks = null) {
  const r = rnd(seed);
  const n = pts;
  const ys = new Array(n + 1).fill(0);
  let step = n, scale = amp;
  ys[0] = (r() - 0.5) * amp;
  ys[n] = (r() - 0.5) * amp;
  while (step > 1) {
    const half = step / 2;
    for (let i = half; i < n; i += step) ys[i] = (ys[i - half] + ys[i + half]) / 2 + (r() - 0.5) * scale;
    step = half;
    scale *= rough;
  }
  let d = `M0 ${bottom}`;
  for (let i = 0; i <= n; i++) {
    const x = (i / n) * BW;
    let y = base + ys[i];
    if (peaks) for (const [px, ph, pw] of peaks) y -= ph * Math.max(0, 1 - Math.abs(x - px) / pw);
    d += `L${f(x)} ${f(y)}`;
  }
  return d + `L${BW} ${bottom}Z`;
}

/** Smooth hill line using a few sines. */
function hills(base, waves, bottom = 200, step = 12) {
  let d = `M0 ${bottom}`;
  for (let x = 0; x <= BW; x += step) {
    let y = base;
    for (const [a, wl, ph] of waves) y += a * Math.sin((x / wl) * Math.PI * 2 + ph);
    d += `L${x} ${f(y)}`;
  }
  return d + `L${BW} ${bottom}Z`;
}

/** Wave line (stroke) or band. */
function waveLine(y, amp, wl, ph = 0, x0 = 0, x1 = BW, step = 6) {
  let d = "";
  for (let x = x0; x <= x1; x += step) d += (x === x0 ? "M" : "L") + x + " " + f(y + amp * Math.sin((x / wl) * Math.PI * 2 + ph));
  return d;
}

/** Star field: tiny circles + a few sparkles. */
function stars(seed, n, box = [0, 0, BW, 120], colors = ["#fff"], rmax = 1.3, sparkN = 0, sparkColor = "#fff") {
  const r = rnd(seed);
  let s = "";
  for (let i = 0; i < n; i++) {
    const x = box[0] + r() * box[2], y = box[1] + r() * box[3];
    s += `<circle cx='${f(x)}' cy='${f(y)}' r='${f(0.3 + r() * rmax)}' fill='${colors[Math.floor(r() * colors.length)]}' opacity='${f(0.35 + r() * 0.65)}'/>`;
  }
  for (let i = 0; i < sparkN; i++) {
    const x = box[0] + r() * box[2], y = box[1] + r() * box[3];
    s += `<path d='${sparkle(2.5 + r() * 3.5)}' transform='translate(${f(x)} ${f(y)})' fill='${sparkColor}' opacity='${f(0.6 + r() * 0.4)}'/>`;
  }
  return s;
}

/** Twinkle a few stars (finite). */
function twinkles(seed, n, box, color = "#fff", dur = 3, rep = 3) {
  const r = rnd(seed);
  let s = "";
  for (let i = 0; i < n; i++) {
    const x = box[0] + r() * box[2], y = box[1] + r() * box[3];
    s += `<path d='${sparkle(2 + r() * 3)}' transform='translate(${f(x)} ${f(y)})' fill='${color}' opacity='.9'>${pulse("opacity", ".9;.15;.9", f(dur + r() * 2), rep, f(r() * 2))}</path>`;
  }
  return s;
}

/** Pine tree silhouette path at x, ground y, height h. */
function pine(x, y, h, w = h * 0.38) {
  const t = [];
  const tiers = 4;
  for (let i = 0; i < tiers; i++) {
    const ty = y - h + (h * 0.78 * i) / tiers;
    const by = ty + h * 0.34;
    const hw = (w * (i + 1.4)) / (tiers + 0.4);
    t.push(`M${f(x)} ${f(ty)}L${f(x + hw)} ${f(by)}H${f(x - hw)}Z`);
  }
  return t.join("") + `M${f(x - w * 0.06)} ${f(y - h * 0.12)}h${f(w * 0.12)}V${f(y)}h${f(-w * 0.12)}Z`;
}

/** Row of pines along a baseline. */
function pineRow(seed, y, hmin, hmax, x0 = 0, x1 = BW, gap = 14) {
  const r = rnd(seed);
  let d = "";
  for (let x = x0; x < x1; x += gap * (0.6 + r() * 0.8)) d += pine(x, y + r() * 4, hmin + r() * (hmax - hmin));
  return d;
}

/** Skyline of rectangles with optional lit windows; returns {body, windows}. */
function skyline(seed, base, hmin, hmax, x0 = 0, x1 = BW, wmin = 14, wmax = 34, winColor = "#ffd27a", winP = 0.25) {
  const r = rnd(seed);
  let d = "";
  let w = "";
  let x = x0;
  while (x < x1) {
    const bw = wmin + r() * (wmax - wmin);
    const bh = hmin + r() * (hmax - hmin);
    const top = base - bh;
    d += `M${f(x)} ${base}V${f(top)}h${f(bw)}V${base}Z`;
    if (r() > 0.6) d += `M${f(x + bw / 2 - 1)} ${f(top)}v-${f(4 + r() * 10)}h2V${f(top)}Z`;
    for (let wy = top + 5; wy < base - 4; wy += 6)
      for (let wx = x + 3; wx < x + bw - 3; wx += 5)
        if (r() < winP) w += `M${f(wx)} ${f(wy)}h2v2.4h-2Z`;
    x += bw + r() * 2;
  }
  return { body: d, windows: w };
}

/** Puffy cloud group from overlapping circles, gradient fill id. */
function cloud(x, y, s, fill, op = 1) {
  return `<g transform='translate(${f(x)} ${f(y)}) scale(${f(s * 100) / 100})' fill='${fill}' opacity='${op}'><ellipse cx='0' cy='0' rx='30' ry='12'/><circle cx='-12' cy='-6' r='11'/><circle cx='6' cy='-11' r='14'/><circle cx='20' cy='-4' r='9'/></g>`;
}

/** Vignette + top light, shared finishing pass for banners. */
function bannerFinish(id = "vg", strength = 0.55) {
  return {
    defs: rg(id, [[0.55, "#000", 0], [1, "#000", strength]], 0.5, 0.45, 0.75),
    body: `<rect width='600' height='200' fill='url(#${id})'/>`,
  };
}

/** Banner document (slice-scaled). */
function bannerDoc(defs, body, finish = 0.5) {
  const fin = finish ? bannerFinish("vg", finish) : { defs: "", body: "" };
  return svgDoc(BW, BH, defs + fin.defs, body + fin.body, " preserveAspectRatio='xMidYMid slice'");
}

/** Frame document. */
const frameDoc = (defs, body) => svgDoc(200, 200, defs, body);

/** Badge document (24 grid). */
const badgeDoc = (defs, body) => svgDoc(24, 24, defs, body);

module.exports = {
  f, rnd, seedOf, dataUri, svgDoc, stopsOf, lg, rg, lgU, rgU, blur, METAL, metalGrad,
  C, AV, pol, arc, annulus, circ, band, around, at, gemDefs, cabDefs, sparkle, star5, poly, leaf, petal, blade,
  spin, pulse, BW, BH, ridge, hills, waveLine, stars, twinkles, pine, pineRow, skyline, cloud,
  bannerDoc, frameDoc, badgeDoc,
};
