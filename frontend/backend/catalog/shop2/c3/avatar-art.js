"use strict";

/**
 * Avatar effect art (SVG). Each effect = up to three layers sharing the
 * effect box: `base` (still), `spin` (::before) and `extra` (::after), each
 * with its own animation (rotate / opacity only). See svg.js for the space.
 */
const { R_AV, R_GAP, R_OUT, R_MID, R_OBJ, f, pt, svg, annulus, arc, around, at, rg, lg, shape } = require("./svg");

const BAND = annulus(R_GAP, R_OUT);
/** Ring band with a fill, a lit outer edge and a dark inner edge. */
function band(fill, { light = "#ffffff", la = 0.5, dark = "#000000", da = 0.45, defs = "" } = {}) {
  return { defs, body: `<path d='${BAND}' fill='${fill}' fill-rule='evenodd'/><circle r='${R_OUT - 0.35}' fill='none' stroke='${light}' stroke-opacity='${la}' stroke-width='0.7'/><circle r='${R_GAP + 0.35}' fill='none' stroke='${dark}' stroke-opacity='${da}' stroke-width='0.7'/>` };
}
/** Metal / gem gradient across the box (top-left light). */
const metal = (id, a, b, c) => lg(id, [[0, c], [0.3, b], [0.5, a], [0.72, b], [1, c]], [0, 0, 1, 1]);
/** Specular highlight on the band (static). */
const glossDefs = lg("gl", [[0, "#ffffff", 0.75], [0.28, "#ffffff", 0.08], [0.5, "#ffffff", 0], [0.85, "#ffffff", 0], [1, "#ffffff", 0.25]], [0.15, 0, 0.85, 1]);
const GLOSS = `<path d='${BAND}' fill='url(%23gl)' fill-rule='evenodd'/>`.replace("%23", "#");
/** Narrow light wedge over the band (rotating glint / beam). */
function wedge(width, color, { r1 = R_GAP, r2 = R_OUT, peak = 0.95, id = "w" } = {}) {
  const [x0, y0] = pt(r2, -width);
  const [x1, y1] = pt(r2, width);
  const [i0, j0] = pt(r1, -width);
  const [i1, j1] = pt(r1, width);
  const defs = lg(id, [[0, color, 0], [0.5, color, peak], [1, color, 0]], [0, 0.5, 1, 0.5]);
  return { defs, body: `<path d='M${i0} ${j0}L${x0} ${y0}A${r2} ${r2} 0 0 1 ${x1} ${y1}L${i1} ${j1}A${r1} ${r1} 0 0 0 ${i0} ${j0}Z' fill='url(#${id})'/>` };
}
/** Tapered comet tail: stacked arcs, thinning and fading toward the end. */
function cometTail(r, len, color, head = "#ffffff", w = 3.2) {
  let out = "";
  const steps = 7;
  for (let i = 0; i < steps; i += 1) {
    const a0 = -len + (len / steps) * i;
    out += `<path d='${arc(r, a0, 0)}' fill='none' stroke='${color}' stroke-opacity='${f(0.12 + i * 0.1)}' stroke-width='${f(w * (0.35 + i * 0.1))}' stroke-linecap='round'/>`;
  }
  return `${out}<g transform='translate(0 ${-r})'>${shape.glowDot(w * 0.55, head, color)}</g>`;
}
const doc = (body, defs = "") => svg(body, { defs });
const spin = (s, extra = "") => `s2fx-spin ${s}s linear infinite${extra}`;
const rev = (s) => `s2fx-spin ${s}s linear infinite reverse`;

/* ── Shared motifs ─────────────────────────────────────────────── */
const lantern = (body, glowC) => `<circle cy='-0.2' r='5.4' fill='${glowC}' opacity='0.28'/><path d='M0 -6.4V-4.9' stroke='#3a1d0c' stroke-width='0.7'/><path d='M-2 -4.9H2L2.6 -3.6H-2.6Z' fill='#5a3010'/><rect x='-2.3' y='-3.6' width='4.6' height='6' rx='1.6' fill='${body}' stroke='#7a4214' stroke-width='0.6'/><path d='M0 -3.4V2.2' stroke='#7a4214' stroke-width='0.5'/><circle cy='-0.4' r='1.3' fill='#fff6d8'/><path d='M-2 2.4H2L1.5 3.4H-1.5Z' fill='#5a3010'/>`;
const orchid = (pink, lime) => `${[0, 72, 144, 216, 288].map((d) => `<g transform='rotate(${d})'>${shape.petal(1.9, 4.2, pink, "#ffd6ec")}</g>`).join("")}<circle r='1.2' fill='${lime}'/><circle r='0.5' fill='#ffffff'/>`;
const wheat = (c1, c2) => `<path d='M0 4.6L0 -4.6' stroke='${c2}' stroke-width='0.6'/>${[-3.2, -1.6, 0, 1.6].map((y) => `<ellipse cx='-0.9' cy='${y}' rx='0.8' ry='1.25' transform='rotate(-24 -0.9 ${y})' fill='${c1}'/><ellipse cx='0.9' cy='${y + 0.6}' rx='0.8' ry='1.25' transform='rotate(24 0.9 ${y + 0.6})' fill='${c1}'/>`).join("")}<ellipse cy='-4.6' rx='0.65' ry='1.1' fill='${c1}'/>`;
const coral = (c) => `<path d='M0 3.6V-0.4M0 -0.4L-2 -3.2M0 -0.4L2.2 -2.6M2.2 -2.6L2.4 -4.4M2.2 -2.6L3.6 -3.3M-2 -3.2L-2.9 -4.6M-2 -3.2L-0.9 -4.7' stroke='${c}' stroke-width='1.05' stroke-linecap='round' fill='none'/>`;
const cloudPuff = (c, s = 1) => `<g transform='scale(${s})'><circle cx='-2.4' cy='0.6' r='2' fill='${c}'/><circle cx='0' cy='-0.6' r='2.7' fill='${c}'/><circle cx='2.5' cy='0.5' r='2.1' fill='${c}'/></g>`;
const tower = `<path d='M-1.9 4.6L-1.2 -2.4H1.2L1.9 4.6Z' fill='#e8f6ff'/><path d='M-1.65 2.2H1.65L1.5 0.6H-1.5Z' fill='#d6336c'/><path d='M-1.35 -1.2H1.35L1.25 -2.4H-1.25Z' fill='#d6336c'/><rect x='-1.4' y='-4.3' width='2.8' height='1.9' rx='0.4' fill='#0b1b3a' stroke='#e8f6ff' stroke-width='0.4'/><circle cy='-3.35' r='0.75' fill='#fff9c8'/><path d='M-1.7 -4.3L0 -5.6L1.7 -4.3Z' fill='#e8f6ff'/>`;
const hourglass = (frame, sand) => `<path d='M-2.4 -4H2.4M-2.4 4H2.4' stroke='${frame}' stroke-width='0.9' stroke-linecap='round'/><path d='M-1.9 -3.6H1.9L0.25 0L1.9 3.6H-1.9L-0.25 0Z' fill='rgba(255,248,232,0.25)' stroke='${frame}' stroke-width='0.5'/><path d='M-1.1 -1.9H1.1L0.2 -0.2H-0.2Z M-1.6 3.4H1.6L0 1.6Z' fill='${sand}'/>`;
const crown = (gold, gem) => `<path d='M-6 3L-6.6 -3.4L-3.3 -0.6L0 -5L3.3 -0.6L6.6 -3.4L6 3Z' fill='${gold}' stroke='#fff3c4' stroke-width='0.4' stroke-linejoin='round'/><circle cx='0' cy='-5' r='1' fill='${gem}'/><circle cx='-6.6' cy='-3.4' r='0.8' fill='${gem}'/><circle cx='6.6' cy='-3.4' r='0.8' fill='${gem}'/><circle cx='0' cy='0.8' r='1.2' fill='${gem}'/><path d='M-6 3H6' stroke='#fff3c4' stroke-width='0.5'/>`;
const crescent = (c) => `<circle r='6.4' fill='#fff8dc' opacity='0.18'/><path d='M0 -5.4A5.4 5.4 0 1 0 0 5.4A4 4 0 1 1 0 -5.4Z' fill='${c}' stroke='#2a3040' stroke-width='0.7'/>`;
const wisp = (c) => `<path d='M0 4C-2 2 2 0 0 -2C-1.5 -3.5 0.8 -5 0.2 -6.5' stroke='${c}' stroke-width='1.3' stroke-linecap='round' fill='none'/><path d='M0 4C-2 2 2 0 0 -2' stroke='#e6fffb' stroke-width='0.5' stroke-linecap='round' fill='none'/>`;
const prism = (body) => `<path d='M0 -3.4L3 2.2H-3Z' fill='${body}' stroke='#ffffff' stroke-width='0.5' stroke-linejoin='round'/>${["#ff3b6b", "#ffb13b", "#f6ff5a", "#3bff9d", "#3bc8ff", "#8a5bff"].map((c, i) => `<path d='M0.6 -0.4L${f(5.4)} ${f(-3.6 + i * 1.1)}' stroke='${c}' stroke-width='0.55' stroke-linecap='round'/>`).join("")}`;
const drop = (fill, hi) => `<path d='M0 -3.4C1.6 -1.2 2.4 0.2 2.4 1.3A2.4 2.4 0 0 1 -2.4 1.3C-2.4 0.2 -1.6 -1.2 0 -3.4Z' fill='${fill}'/><ellipse cx='-0.8' cy='0.6' rx='0.55' ry='0.9' fill='${hi}' opacity='0.85'/>`;
const swirl = (c) => `<path d='M-3 2.6C-4.6 -1 -1.6 -4.2 1.2 -3C3.4 -2 2.6 1 0.6 0.6C-0.8 0.3 -0.6 -1.4 0.6 -1.3' stroke='${c}' stroke-width='0.9' stroke-linecap='round' fill='none'/>`;
const filigree = (c) => `<path d='M-4 0C-4 -2.4 -1.4 -2.6 -1.2 -0.9C-1.1 0.3 -2.4 0.4 -2.5 -0.4M4 0C4 2.4 1.4 2.6 1.2 0.9C1.1 -0.3 2.4 -0.4 2.5 0.4M-1.2 -0.9L1.2 0.9' stroke='${c}' stroke-width='0.75' stroke-linecap='round' fill='none'/>`;
const tendril = (c, s = 1) => `<path d='M0 ${4 * s}L${-1 * s} ${1.5 * s}L${1.2 * s} ${0.4 * s}L${-0.4 * s} ${-2 * s}L${1 * s} ${-3 * s}L0 ${-5 * s}M${1.2 * s} ${0.4 * s}L${3 * s} ${-1.4 * s}' stroke='${c}' stroke-width='0.75' stroke-linejoin='round' stroke-linecap='round' fill='none'/>`;
/** Jagged crack path around the band (deterministic). */
function cracks(seed) {
  let x = seed;
  const rnd = () => { x = (x * 9301 + 49297) % 233280; return x / 233280; };
  let d = "";
  for (let a = 0; a <= 360; a += 9) {
    const r = R_GAP + 1.2 + rnd() * (R_OUT - R_GAP - 2.4);
    const [px, py] = pt(r, a);
    d += `${a ? "L" : "M"}${px} ${py}`;
    if (rnd() > 0.72) {
      const [bx, by] = pt(rnd() > 0.5 ? R_OUT - 0.4 : R_GAP + 0.4, a + 3);
      d += `L${bx} ${by}M${px} ${py}`;
    }
  }
  return d;
}
/** Wavy (sinusoidal) ring path. */
function waveRing(r, amp, waves) {
  let d = "";
  for (let a = 0; a <= 360; a += 3) {
    const [x, y] = pt(r + amp * Math.sin((a * waves * Math.PI) / 180), a);
    d += `${a ? "L" : "M"}${x} ${y}`;
  }
  return `${d}Z`;
}
/** Heartbeat trace around the ring. */
function ecg(beats) {
  let d = "";
  const seg = 360 / beats;
  for (let b = 0; b < beats; b += 1) {
    const s = b * seg;
    const pts = [[0, 0], [0.42, 0], [0.47, -1.6], [0.52, 3.2], [0.57, -2.6], [0.62, 0], [0.75, 0], [0.8, 0.9], [0.86, 0], [1, 0]];
    for (const [t, o] of pts) {
      const [x, y] = pt(R_MID + o, s + t * seg);
      d += `${d ? "L" : "M"}${x} ${y}`;
    }
  }
  return d;
}

const ART = {
  /* ── Sets ────────────────────────────────────────────────────── */
  "gece-limani-fener": () => ({
    glow: ["#35d0e0", 0.35],
    base: doc(`${band("url(#m)").body}${around(20, R_OUT - 1.3, `<path d='M-2 0.8Q-1 -1 0 -0.2Q0.8 0.5 1.6 -0.6' stroke='#a8f2ff' stroke-width='0.6' fill='none' stroke-linecap='round'/>`)}${GLOSS}${at(180, R_OBJ - 1.2, `<g transform='scale(1.45)'>${tower}</g>`, 180)}`, metal("m", "#3a86c8", "#1e4b8f", "#0b1b3a") + glossDefs),
    spin: { doc: (() => { const w = wedge(20, "#e8f6ff", { r1: R_GAP - 2, peak: 0.95 }); const w2 = wedge(14, "#35d0e0", { r1: R_GAP, peak: 0.35, id: "v" }); return doc(`${w.body}<g transform='rotate(180)'>${w2.body}</g>`, w.defs + w2.defs); })(), anim: spin(6) },
    extra: { doc: doc([30, 100, 210, 290].map((a, i) => `<path d='${arc(R_MID + (i % 2 ? 1.2 : -0.8), a, a + 34)}' stroke='#d8f4ff' stroke-opacity='0.4' stroke-width='2.4' stroke-linecap='round' fill='none'/>`).join("")), anim: "s2fx-breathe 5s ease-in-out infinite" },
  }),
  "bakir-kervan-fenerler": () => ({
    glow: ["#f0a443", 0.36],
    base: doc(`${band("url(#m)").body}${around(16, R_MID, shape.dot(0.65, "#ffe2b0"))}${GLOSS}`, metal("m", "#f0a443", "#b5622b", "#5a2a10") + glossDefs),
    spin: { doc: doc(around(3, R_OBJ - 0.2, lantern("url(#lb)", "#f0a443")), lg("lb", [[0, "#ffe2b0"], [0.5, "#f0a443"], [1, "#b5622b"]])), anim: spin(16) },
    extra: { doc: doc(around(3, R_OBJ - 0.4, `<circle r='4.2' fill='url(#h)'/>`), rg("h", [[0, "#fff1c8", 0.9], [1, "#f0a443", 0]])), anim: `${spin(16)}, s2fx-flicker 1.7s linear infinite` },
  }),
  "orkide-sisi-isilti": () => ({
    glow: ["#ff6fb5", 0.36],
    base: doc(band("url(#m)", { light: "#ffd0ea", la: 0.4 }).body + GLOSS, lg("m", [[0, "#5b2590"], [0.5, "#8b3fd1"], [1, "#3a1660"]], [0, 0, 1, 1]) + glossDefs),
    spin: { doc: doc(around(5, R_OBJ - 0.3, orchid("url(#p)", "#c8ff6a")), rg("p", [[0, "#ffffff"], [0.45, "#ffb3d9"], [1, "#ff6fb5"]])), anim: spin(18) },
    extra: { doc: doc(around(10, R_MID, (i) => (i % 2 ? shape.star4(1.3, "#c8ff6a") : shape.dot(0.55, "#e8ffc0")), { start: 18 })), anim: "s2fx-spin 26s linear infinite reverse, s2fx-twinkle 2.6s ease-in-out infinite" },
  }),
  "kor-bahcesi-yapraklar": () => ({
    glow: ["#ff6a2b", 0.48],
    base: doc(band("url(#m)", { light: "#ffd27a", la: 0.5 }).body, lg("m", [[0, "#a3220f"], [0.5, "#5a1206"], [1, "#a3220f"]], [0, 0, 1, 1])),
    spin: { doc: doc(around(14, R_GAP + 1.4, (i) => shape.flame(2.1, i % 2 ? 5.2 : 3.8, "url(#fl)")), lg("fl", [[0, "#fff1b0"], [0.4, "#ffd27a"], [0.75, "#ff6a2b"], [1, "#a3220f"]])), anim: spin(9) },
    extra: { doc: doc(around(10, R_GAP + 1.8, shape.flame(1.4, 3.2, "url(#fl)"), { start: 18 }), lg("fl", [[0, "#ffffff"], [0.5, "#ffe08a"], [1, "#ff6a2b", 0.2]])), anim: "s2fx-spin 6s linear infinite reverse, s2fx-flicker 1.4s linear infinite" },
  }),
  "buzul-kristal": () => ({
    glow: ["#a6e7ff", 0.42],
    base: doc(around(16, R_GAP - 0.4, (i) => `<path d='M${-3.6} 0.6L${-1.6} ${f(-(R_OUT - R_GAP) - (i % 3 === 0 ? 0.6 : -0.4))}L${i % 2 ? 0.8 : -0.6} ${f(-(R_OUT - R_GAP) - 1)}L3.4 0.6Z' fill='${["#a6e7ff", "#3a8fb7", "#e8f9ff", "#5fb4d8"][i % 4]}' stroke='#e8f9ff' stroke-opacity='0.6' stroke-width='0.35'/>`) + GLOSS, glossDefs),
    spin: { doc: (() => { const w = wedge(9, "#ffffff"); return doc(w.body + at(0, R_MID, shape.star4(2.6, "#ffffff")), w.defs); })(), anim: "s2fx-spin 4.5s cubic-bezier(.6,0,.4,1) infinite" },
    extra: { doc: doc(around(6, R_AV + 2.4, shape.snowflake(1.8, "#e8f9ff", 0.55), { start: 30 })), anim: "s2fx-twinkle 3s ease-in-out infinite" },
  }),
  "neon-carsi-tabela": () => ({
    glow: ["#ff2e88", 0.5],
    base: doc(`<path d='${BAND}' fill='#14081e' fill-rule='evenodd'/><circle r='${R_GAP + 1.6}' fill='none' stroke='#2ef2ff' stroke-opacity='0.35' stroke-width='3'/><circle r='${R_GAP + 1.6}' fill='none' stroke='#b8fbff' stroke-width='1' stroke-dasharray='22 3'/>`),
    spin: { doc: doc(around(4, R_OBJ - 0.6, `<path d='M-1.6 -2L0.6 0L-1.6 2M0.6 -2L2.8 0L0.6 2' stroke='#fff04a' stroke-width='0.9' fill='none' stroke-linecap='round' stroke-linejoin='round'/>`, { rot: 90 })), anim: spin(12) },
    extra: { doc: doc(`<circle r='${R_OUT - 1.4}' fill='none' stroke='#ff2e88' stroke-opacity='0.4' stroke-width='3.2'/><circle r='${R_OUT - 1.4}' fill='none' stroke='#ffc2dd' stroke-width='1.1' stroke-dasharray='40 4 12 4'/>`), anim: "s2fx-flicker 3.4s linear infinite" },
  }),
  "altin-hasat-basak": () => ({
    glow: ["#f2c230", 0.36],
    base: doc(`<circle r='${R_MID}' fill='none' stroke='url(#m)' stroke-width='2.2'/>${GLOSS}`, metal("m", "#fff3c4", "#f2c230", "#8a6a12") + glossDefs),
    spin: { doc: doc(around(12, R_MID, wheat("url(#g)", "#8a6a12"), { rot: 90 }), lg("g", [[0, "#fff3c4"], [0.5, "#f2c230"], [1, "#b8860b"]])), anim: spin(48) },
    extra: { doc: (() => { const w = wedge(16, "#fff6d6", { peak: 0.75 }); return doc(w.body, w.defs); })(), anim: "s2fx-spin 6s ease-in-out infinite" },
  }),
  "mor-sis-pece": () => ({
    glow: ["#a77bff", 0.42],
    base: doc(band("url(#m)", { light: "#e6dcff", la: 0.35 }).body, lg("m", [[0, "#4b2a9c"], [0.5, "#2b1860"], [1, "#4b2a9c"]], [0, 0, 1, 1])),
    spin: { doc: doc(around(6, R_MID, (i) => `<ellipse rx='${i % 2 ? 6 : 4.6}' ry='2.6' fill='url(#c)'/>`, { start: 15 }), rg("c", [[0, "#e6dcff", 0.85], [0.6, "#a77bff", 0.45], [1, "#a77bff", 0]])), anim: spin(20) },
    extra: { doc: doc(around(9, R_MID - 0.4, (i) => shape.star4(i % 3 ? 1.1 : 1.9, "#ffffff"), { start: 40 })), anim: "s2fx-spin 32s linear infinite reverse, s2fx-twinkle 3s ease-in-out infinite" },
  }),
  "gece-mercani-resif": () => ({
    glow: ["#d6336c", 0.42],
    base: doc(band("url(#m)", { light: "#ff8fab", la: 0.45 }).body, lg("m", [[0, "#7c5cff"], [0.5, "#3a1650"], [1, "#d6336c"]], [0, 0, 1, 1])),
    spin: { doc: doc(around(8, R_GAP + 0.6, (i) => coral(i % 2 ? "#ff8fab" : "#ffb3c6"))), anim: spin(40) },
    extra: { doc: doc(around(16, R_OUT - 1.6, (i) => shape.glowDot(i % 3 ? 0.45 : 0.7, "#ffe3ec", "#ff8fab"), { start: 11 })), anim: "s2fx-spin 40s linear infinite, s2fx-twinkle 2.4s ease-in-out infinite" },
  }),
  "kuzey-isigi-perde": () => ({
    glow: ["#6effc7", 0.4],
    base: doc(`<path d='${BAND}' fill='#04121c' fill-rule='evenodd'/>`),
    spin: { doc: doc(around(48, R_GAP, (i) => `<path d='M0 0V${f(-(2.4 + ((i * 7) % 5) * 0.75))}' stroke='${["#6effc7", "#14a37f", "#8f7bff", "#b8ffe4"][i % 4]}' stroke-width='1.3' stroke-linecap='round' opacity='${f(0.55 + ((i * 3) % 4) * 0.12)}'/>`)), anim: spin(26) },
    extra: { doc: doc(around(30, R_GAP + 0.8, (i) => `<path d='M0 0V${f(-(1.6 + ((i * 5) % 4) * 0.9))}' stroke='${i % 2 ? "#e6fff5" : "#8f7bff"}' stroke-width='0.7' stroke-linecap='round'/>`, { start: 6 })), anim: "s2fx-spin 34s linear infinite reverse, s2fx-breathe 4s ease-in-out infinite" },
  }),
  "zumrut-orman-bocekler": () => ({
    glow: ["#49d17d", 0.32],
    base: doc(`<path d='${BAND}' fill='#0b2a18' fill-rule='evenodd'/>${around(22, R_MID, (i) => shape.leaf(1.9, 4.6, i % 2 ? "#1f7a46" : "#49d17d", "#0b2a18"), { rot: 70 })}`),
    spin: { doc: doc(around(5, R_OBJ - 1, shape.glowDot(0.85, "#f4ffd0", "#c8ff78"), { start: 20 })), anim: `${spin(22)}, s2fx-twinkle 1.7s ease-in-out infinite` },
    extra: { doc: doc(around(3, R_AV + 1.8, shape.glowDot(0.7, "#f4ffd0", "#c8ff78"), { start: 60 })), anim: "s2fx-spin 30s linear infinite reverse, s2fx-twinkle 2.3s ease-in-out -1s infinite" },
  }),
  "kum-saati-akis": () => ({
    glow: ["#e8cf9a", 0.3],
    base: doc(`${band("url(#m)").body}${around(24, R_OUT - 0.9, (i) => `<path d='M0 0V${i % 6 ? 1.2 : 2.4}' stroke='#3d2c17' stroke-width='0.5'/>`)}${GLOSS}${at(0, R_OBJ - 0.8, hourglass("#3d2c17", "#e8cf9a"))}`, metal("m", "#fff8e8", "#e8cf9a", "#9c7a4a") + glossDefs),
    spin: { doc: doc(around(40, R_GAP - 1.6, (i) => shape.dot(i % 4 ? 0.35 : 0.55, i % 3 ? "#e8cf9a" : "#fff8e8"))), anim: spin(14) },
    extra: { doc: doc(around(28, R_AV + 1.2, shape.dot(0.3, "#fff8e8"), { start: 6 })), anim: rev(20) },
  }),
  "firtina-simsek": () => ({
    glow: ["#7aa7ff", 0.42],
    base: doc(`${band("url(#m)").body}${around(11, R_OUT - 2.2, (i) => cloudPuff(i % 2 ? "#8a9cc4" : "#6a7ca4", 1))}${around(11, R_OUT - 1.6, (i) => cloudPuff("#c8d4f0", 0.45), { start: 16 })}`, metal("m", "#6a7fae", "#3b4a6b", "#1a2236")),
    spin: { doc: doc(around(7, R_OUT - 1.2, (i) => cloudPuff(i % 2 ? "#7d8db4" : "#46557c", 0.65), { start: 25 })), anim: spin(60) },
    extra: { doc: doc(`${at(40, R_OBJ, shape.bolt(5, "#f5f9ff", 1.1))}${at(160, R_OBJ, shape.bolt(4.4, "#cfe0ff", 1))}${at(275, R_OBJ, shape.bolt(5.4, "#f5f9ff", 1.1))}`), anim: "s2fx-flash 2.8s linear infinite, s2fx-spin 8.4s steps(3) infinite" },
  }),
  "lav-catlagi": () => ({
    glow: ["#ff3d00", 0.5],
    base: doc(`${band("url(#m)", { light: "#5a0e0e", la: 0.8 }).body}<path d='${cracks(5)}' stroke='#ff3d00' stroke-opacity='0.5' stroke-width='2' fill='none' stroke-linejoin='round'/>`, lg("m", [[0, "#2a0a08"], [0.5, "#451010"], [1, "#1e0606"]], [0, 0, 1, 1])),
    spin: { doc: doc(around(6, R_OUT - 0.6, (i) => shape.glowDot(0.5, "#ffb000", "#ff3d00"), { start: 20 })), anim: spin(50) },
    extra: { doc: doc(`<path d='${cracks(5)}' stroke='#ffb000' stroke-width='0.8' fill='none' stroke-linejoin='round'/>`), anim: "s2fx-breathe 2.4s ease-in-out infinite" },
  }),
  "inci-sedef": () => ({
    glow: ["#ffd8e4", 0.32],
    base: doc(`<circle r='${R_MID}' fill='none' stroke='#cfd8e0' stroke-opacity='0.6' stroke-width='0.5'/>`),
    spin: { doc: doc(around(20, R_MID, (i) => `<circle r='2.35' fill='url(#p${i % 3})'/>`), [["#ffd8e4"], ["#cfe3ef"], ["#f1e9e1"]].map(([c], i) => rg(`p${i}`, [[0, "#ffffff"], [0.35, "#ffffff", 0.95], [0.75, c], [1, "#6b8a9a"]], { fx: "35%", fy: "30%" })).join("")), anim: spin(36) },
    extra: { doc: doc(at(45, R_MID, shape.star4(2.8, "#ffffff"))), anim: "s2fx-twinkle 2.6s ease-in-out infinite" },
  }),
  "yildiz-tozu-hale": () => ({
    glow: ["#c6b7ff", 0.4],
    base: doc(band("url(#m)", { light: "#c6b7ff", la: 0.4 }).body, lg("m", [[0, "#2b1f6e"], [0.5, "#160f3a"], [1, "#3c2d8f"]], [0, 0, 1, 1])),
    spin: { doc: doc(around(26, R_MID, (i) => (i % 5 === 0 ? shape.star4(1.6, "#ffe9a8") : shape.dot(i % 2 ? 0.4 : 0.6, i % 3 ? "#c6b7ff" : "#ffffff")))), anim: spin(40) },
    extra: { doc: doc(cometTail(R_MID, 90, "#ffe9a8", "#fffbe9", 2.6)), anim: spin(5) },
  }),

  /* ── Singles ─────────────────────────────────────────────────── */
  "kuyruklu-yildiz": () => ({
    glow: ["#78dcff", 0.3],
    base: doc(`<circle r='${R_MID}' fill='none' stroke='#8cd2ff' stroke-opacity='0.25' stroke-width='1.2'/>`),
    spin: { doc: doc(`${cometTail(R_MID, 150, "#6fd6ff", "#ffffff", 3.4)}${around(6, R_MID, (i) => shape.dot(0.4, "#c8f0ff"), { start: -150 })}`), anim: "s2fx-spin 2.6s cubic-bezier(.45,.05,.55,.95) infinite" },
  }),
  "ikiz-yorunge": () => ({
    glow: ["#ff5ad1", 0.3],
    base: doc(`<circle r='${R_OUT - 1.6}' fill='none' stroke='#ff9ae4' stroke-opacity='0.4' stroke-width='0.6' stroke-dasharray='1.6 1.6'/><circle r='${R_GAP - 0.4}' fill='none' stroke='#8af4ff' stroke-opacity='0.4' stroke-width='0.6' stroke-dasharray='1.6 1.6'/>`),
    spin: { doc: doc(at(0, R_OUT - 1.6, `<circle r='3' fill='url(#a)'/><ellipse rx='4.6' ry='1' fill='none' stroke='#ffd1f3' stroke-width='0.5' transform='rotate(-20)'/>`), rg("a", [[0, "#ffffff"], [0.4, "#ff9ae4"], [1, "#a0186e"]], { fx: "35%", fy: "30%" })), anim: spin(5) },
    extra: { doc: doc(at(180, R_GAP - 0.4, `<circle r='2.3' fill='url(#b)'/>`), rg("b", [[0, "#ffffff"], [0.4, "#8af4ff"], [1, "#0a6e8a"]], { fx: "35%", fy: "30%" })), anim: rev(3.4) },
  }),
  "saat-mekanizmasi": () => ({
    glow: ["#ffc850", 0.24],
    base: doc(`${band("url(#m)").body}${around(12, R_MID, (i) => `<path d='M0 ${i % 3 ? 1 : 1.8}V${i % 3 ? -1 : -1.8}' stroke='#3a2a0a' stroke-width='${i % 3 ? 0.6 : 1}'/>`)}${GLOSS}`, metal("m", "#f3d37a", "#b88a2e", "#6f5219") + glossDefs),
    spin: { doc: doc(around(40, R_GAP - 0.2, `<path d='M-0.9 0.6L-0.6 -1.6H0.6L0.9 0.6Z' fill='#e9c46a'/>`) + `<circle r='${R_GAP - 0.2}' fill='none' stroke='#e9c46a' stroke-width='0.9'/>`), anim: "s2fx-spin 24s steps(40) infinite" },
    extra: { doc: doc(at(0, R_MID, `<path d='M0 3.4V-3.4' stroke='#fff6d6' stroke-width='0.8' stroke-linecap='round'/><circle cy='-3.4' r='0.8' fill='#ff6a2b'/>`)), anim: "s2fx-spin 12s steps(60) infinite" },
  }),
  "ruh-alevi": () => ({
    glow: ["#40f0dc", 0.42],
    base: doc(band("url(#m)", { light: "#3ff0d8", la: 0.4 }).body, lg("m", [[0, "#0b6f8a"], [0.5, "#053a46"], [1, "#0b6f8a"]], [0, 0, 1, 1])),
    spin: { doc: doc(around(7, R_GAP + 1, wisp("#3ff0d8"))), anim: spin(8) },
    extra: { doc: doc(around(7, R_GAP + 2, wisp("#8afff0"), { start: 25 })), anim: "s2fx-spin 11s linear infinite reverse, s2fx-flicker 2.2s linear infinite" },
  }),
  "prizma-kirilmasi": () => ({
    glow: ["#ffffff", 0.16],
    base: doc(band("rgba(255,255,255,0.12)", { la: 0.75 }).body + GLOSS, glossDefs),
    spin: { doc: doc(around(3, R_OBJ - 0.5, prism("rgba(220,235,255,0.55)"))), anim: spin(10) },
    extra: { doc: doc(["#ff3b6b", "#ffb13b", "#f6ff5a", "#3bff9d", "#3bc8ff", "#8a5bff"].map((c, i) => `<path d='${arc(R_MID, 300 + i * 6, 306 + i * 6)}' stroke='${c}' stroke-width='3.2' fill='none'/>`).join("")), anim: spin(3.4) },
  }),
  "kalp-atisi": () => ({
    glow: ["#ff3c64", 0.48],
    base: doc(`<path d='${BAND}' fill='#3a0814' fill-rule='evenodd'/><path d='${ecg(4)}' stroke='#a3132f' stroke-width='1.2' fill='none' stroke-linejoin='round'/>`),
    spin: { doc: doc(around(3, R_OBJ - 0.6, shape.heart(2, "#ff4d73"), { start: 30 })), anim: spin(12) },
    extra: { doc: doc(`<path d='${ecg(4)}' stroke='#ffd6df' stroke-width='1' fill='none' stroke-linejoin='round'/><path d='${ecg(4)}' stroke='#ff3d64' stroke-opacity='0.55' stroke-width='2.6' fill='none' stroke-linejoin='round'/>`), anim: "s2fx-beat 1.4s ease-out infinite" },
  }),
  "gunes-taci": () => ({
    glow: ["#ffbe3c", 0.52],
    base: doc(`<circle r='${R_GAP + 1}' fill='none' stroke='url(#m)' stroke-width='2'/>`, metal("m", "#fff0b8", "#ffd25a", "#c2410c")),
    spin: { doc: doc(around(16, R_GAP + 1.6, (i) => `<path d='M-1.5 0L0 ${i % 2 ? -4.2 : -7}L1.5 0Z' fill='url(#r)'/>`), lg("r", [[0, "#fff6d0"], [0.4, "#ffd25a"], [1, "#ff8a1c"]], [0, 1, 0, 0])), anim: spin(36) },
    extra: { doc: doc(`<path d='${BAND}' fill='url(#c)' fill-rule='evenodd'/>`, rg("c", [[0.85, "#fff0c8", 0], [0.93, "#fff0c8", 0.55], [1, "#ffb02e", 0]], { r: "50%" })), anim: "s2fx-breathe 3s ease-in-out infinite" },
  }),
  "gelgit": () => ({
    glow: ["#50c8ff", 0.3],
    base: doc(band("url(#m)", { light: "#bff0ff", la: 0.4 }).body, lg("m", [[0, "#0b5f86"], [0.6, "#053047"], [1, "#2fb4d9"]], [0, 0, 1, 1])),
    spin: { doc: doc(around(10, R_MID, `<path d='M-3.2 1.2C-2.4 -1.6 0.6 -2.4 1.8 -0.8C2.6 0.3 1.4 1.2 0.6 0.4C1.6 0.2 1 -0.9 0 -0.6C-1.3 -0.2 -1.8 0.8 -2 1.2Z' fill='#e8fbff'/><path d='M-3.6 1.4H3.4' stroke='#2fb4d9' stroke-width='0.6'/>`, { rot: 90 })), anim: "s2fx-sway 6s ease-in-out infinite alternate" },
    extra: { doc: doc(around(14, R_AV + 1.8, (i) => shape.dot(i % 2 ? 0.35 : 0.55, "#d9f6ff"), { start: 8 })), anim: "s2fx-twinkle 2.8s ease-in-out infinite" },
  }),
  "zehir-sarmali": () => ({
    glow: ["#a0ff3c", 0.36],
    base: doc(`<path d='${BAND}' fill='#0c1e05' fill-rule='evenodd'/>`),
    spin: { doc: doc(`<path d='${waveRing(R_MID, 1.8, 9)}' stroke='url(#s)' stroke-width='2.6' fill='none' stroke-linejoin='round'/><path d='${waveRing(R_MID, 1.8, 9)}' stroke='#1d3d0a' stroke-width='0.5' stroke-dasharray='0.8 1.4' fill='none'/>${at(0, R_MID + 1.8 * Math.sin(0), `<path d='M-2.2 1.2L0 -3L2.2 1.2Z' fill='#b6ff3b'/><circle cx='-0.7' cy='-0.6' r='0.4' fill='#0c1e05'/><circle cx='0.7' cy='-0.6' r='0.4' fill='#0c1e05'/>`, 90)}`, lg("s", [[0, "#2e7d0f"], [0.5, "#b6ff3b"], [1, "#2e7d0f"]], [0, 0, 1, 1])), anim: spin(10) },
    extra: { doc: doc(around(4, R_AV + 2.2, drop("#a0ff3c", "#eaffc0"), { start: 45, rot: 180 })), anim: "s2fx-twinkle 2s ease-in-out infinite" },
  }),
  "ametist-tac": () => ({
    glow: ["#be78ff", 0.4],
    base: doc(around(14, R_GAP - 0.2, (i) => `<path d='M-3.2 0L-1.4 ${f(-(R_OUT - R_GAP))}L1.4 ${f(-(R_OUT - R_GAP))}L3.2 0Z' fill='${["#6a2bb8", "#b07cff", "#3d1670", "#e2c6ff", "#8a46e0"][i % 5]}'/>`) + GLOSS, glossDefs),
    spin: { doc: doc(around(8, R_MID, shape.diamond(1.1, 1.6, "#f6e8ff"), { start: 22 })), anim: `${spin(30)}, s2fx-twinkle 2.2s ease-in-out infinite` },
    extra: { doc: doc(at(0, R_OBJ - 0.6, crown("url(#g)", "#be78ff")), lg("g", [[0, "#fff3c4"], [0.5, "#f2c230"], [1, "#8a6a12"]])) },
  }),
  "devre-izi": () => ({
    glow: ["#28e6ff", 0.34],
    base: doc(`<path d='${BAND}' fill='#041a20' fill-rule='evenodd'/>${around(12, 0, (i) => { const a = 0; const [x0, y0] = pt(R_MID, a); return ""; })}${(() => { let d = ""; for (let i = 0; i < 12; i += 1) { const a = i * 30; const r1 = i % 2 ? R_GAP + 1.2 : R_OUT - 1.4; const r2 = i % 2 ? R_OUT - 1.4 : R_GAP + 1.2; d += `<path d='${arc(r1, a, a + 18)}' stroke='#0e7a8a' stroke-width='0.9' fill='none'/><path d='M${pt(r1, a + 18).join(" ")}L${pt(r2, a + 22).join(" ")}' stroke='#0e7a8a' stroke-width='0.9'/><path d='${arc(r2, a + 22, a + 30)}' stroke='#0e7a8a' stroke-width='0.9' fill='none'/><circle cx='${pt(r1, a).join("' cy='")}' r='1' fill='#7ff6ff'/>`; } return d; })()}`),
    spin: { doc: doc(`${cometTail(R_MID, 60, "#29e6ff", "#e0fdff", 2)}<g transform='rotate(180)'>${cometTail(R_MID, 60, "#29e6ff", "#e0fdff", 2)}</g>`), anim: spin(2.4) },
  }),
  "gul-yapraklari": () => ({
    glow: ["#ff6e96", 0.3],
    base: doc(`<circle r='${R_MID}' fill='none' stroke='#2f6a2f' stroke-width='1.8'/>${around(18, R_MID, (i) => (i % 3 === 0 ? shape.leaf(1.9, 4.4, "#4caa4c", "#1f4a1f") : `<path d='M-1 0L0 -2.4L1 0Z' fill='#2f6a2f'/>`), { rot: 60 })}`),
    spin: { doc: doc(around(7, R_OBJ - 0.4, (i) => `<g transform='rotate(${i * 40})'>${shape.heart(3, "url(#p)")}</g>`), rg("p", [[0, "#ffe0ea"], [0.6, "#ff7aa0"], [1, "#c2335e"]], { fx: "40%", fy: "35%" })), anim: spin(14) },
  }),
  "yaldiz-bant": () => ({
    glow: ["#ffd26e", 0.3],
    base: doc(`${band("url(#m)").body}${around(14, R_MID, filigree("#5a3f08"), { rot: 90 })}${GLOSS}`, metal("m", "#fff1c2", "#e8c060", "#8a6416") + glossDefs),
    spin: { doc: (() => { const w = wedge(8, "#ffffff"); return doc(w.body + at(0, R_OUT - 1.2, shape.star4(2.4, "#ffffff")), w.defs); })(), anim: "s2fx-spin 3.8s cubic-bezier(.7,0,.3,1) infinite" },
  }),
  "gumus-hilal": () => ({
    glow: ["#dce6ff", 0.3],
    base: doc(`${band("url(#m)").body}${GLOSS}${at(315, R_OBJ - 0.2, crescent("url(#c)"), -45)}`, metal("m", "#eef3ff", "#9aa4b8", "#5c6679") + glossDefs + lg("c", [[0, "#fffdf0"], [1, "#ffe9a8"]])),
    extra: { doc: doc(`${at(345, R_OBJ, shape.star4(1.6, "#ffffff"))}${at(290, R_OBJ + 1, shape.star4(1.1, "#dce6ff"))}${at(30, R_OBJ - 1, shape.star4(1, "#ffffff"))}`), anim: "s2fx-twinkle 2.6s ease-in-out infinite" },
  }),
  "olay-ufku": () => ({
    glow: ["#ff8c28", 0.46],
    base: doc(`<path d='${BAND}' fill='#050308' fill-rule='evenodd'/><circle r='${R_GAP + 0.6}' fill='none' stroke='#fff0dc' stroke-width='0.8'/>`),
    spin: { doc: doc([0, 120, 240].map((a) => `<path d='${arc(R_MID, a, a + 80)}' stroke='url(#d)' stroke-width='3' fill='none' stroke-linecap='round'/>`).join("") + [60, 180, 300].map((a) => `<path d='${arc(R_OUT - 1, a, a + 40)}' stroke='#ffe2a8' stroke-width='0.8' fill='none' stroke-linecap='round'/>`).join(""), lg("d", [[0, "#3a1004"], [0.5, "#ff7a18"], [1, "#ffe2a8"]], [0, 0, 1, 1])), anim: spin(2.6) },
    extra: { doc: doc(`<path d='${arc(R_OUT - 0.6, 300, 60)}' stroke='#fff6e8' stroke-width='0.9' fill='none' stroke-linecap='round'/>`), anim: "s2fx-breathe 3s ease-in-out infinite" },
  }),
  "plazma-arki": () => ({
    glow: ["#ff3cdc", 0.42],
    base: doc(band("url(#m)", { light: "#ff9af0", la: 0.5 }).body, lg("m", [[0, "#5b2cff"], [0.5, "#1a0820"], [1, "#ff2fd6"]], [0, 0, 1, 1])),
    spin: { doc: doc(`<circle r='${R_MID}' fill='none' stroke='url(#p)' stroke-width='1.6'/>`, lg("p", [[0, "#ff2fd6"], [0.5, "#2fe1ff"], [1, "#ff2fd6"]], [0, 0, 1, 1])), anim: spin(3) },
    extra: { doc: doc(`${at(20, R_GAP + 0.6, tendril("#ffd1f8", 1))}${at(140, R_GAP + 0.6, tendril("#c8f8ff", 0.9))}${at(250, R_GAP + 0.6, tendril("#ffd1f8", 1.05))}`), anim: "s2fx-flicker 0.9s linear infinite, s2fx-spin 1.8s steps(5) infinite" },
  }),
  "kar-tanesi-yorunge": () => ({
    glow: ["#dcf0ff", 0.28],
    base: doc(band("rgba(220,240,255,0.22)", { la: 0.7 }).body + GLOSS, glossDefs),
    spin: { doc: doc(around(6, R_OBJ - 0.2, shape.snowflake(3.6, "#ffffff", 0.75))), anim: spin(20) },
    extra: { doc: doc(around(18, R_MID, (i) => shape.dot(i % 2 ? 0.35 : 0.5, "#ffffff"), { start: 10 })), anim: "s2fx-spin 30s linear infinite reverse, s2fx-twinkle 3s ease-in-out infinite" },
  }),
  "kod-akisi": () => ({
    glow: ["#3cff8c", 0.3],
    base: doc(`<path d='${BAND}' fill='#03100a' fill-rule='evenodd'/>`),
    spin: { doc: doc(around(36, R_MID, (i) => `<rect x='${i % 3 ? -0.8 : -1.6}' y='-1.2' width='${i % 3 ? 1.6 : 3.2}' height='2.4' rx='0.3' fill='${["#0a5c2a", "#1fbf5a", "#0a5c2a", "#3dff8a"][i % 4]}'/>`, { rot: 90 })), anim: "s2fx-spin 24s steps(36) infinite" },
    extra: { doc: doc(around(4, R_MID, `<rect x='-1.6' y='-1.2' width='3.2' height='2.4' rx='0.3' fill='#d8ffe6'/>`, { rot: 90, start: 5 })), anim: "s2fx-spin 6s steps(36) infinite" },
  }),
  "lav-lambasi": () => ({
    glow: ["#ff7850", 0.32],
    base: doc(band("url(#m)", { light: "#ffb3d9", la: 0.4 }).body, lg("m", [[0, "#7a2a8e"], [1, "#3a0f4a"]], [0, 0, 1, 1])),
    spin: { doc: doc(around(4, R_MID, (i) => `<ellipse rx='${[4.2, 3, 5, 3.6][i]}' ry='2.3' fill='url(#b)'/>`, { start: 10, rot: 90 }), rg("b", [[0, "#ffe0a0"], [0.5, "#ff8a3d"], [1, "#ff4fa3", 0.8]])), anim: spin(22) },
    extra: { doc: doc(around(3, R_MID, (i) => `<ellipse rx='${[3, 4, 2.6][i]}' ry='2' fill='url(#b)'/>`, { start: 70, rot: 90 }), rg("b", [[0, "#ffd0f0"], [0.6, "#c23bff"], [1, "#c23bff", 0.6]])), anim: rev(14) },
  }),
  "hologram": () => ({
    glow: ["#96dcff", 0.34],
    base: doc(around(22, R_MID, (i) => shape.hex(2.4, `url(#h${i % 3})`, "#ffffff", 0.3), { rot: 0 }), [["#ff7ce5", "#7cf3ff"], ["#7cf3ff", "#b3ff7c"], ["#fff27c", "#ff7ce5"]].map(([a, b], i) => lg(`h${i}`, [[0, a, 0.85], [1, b, 0.85]], [0, 0, 1, 1])).join("")),
    spin: { doc: (() => { const w = wedge(14, "#ffffff", { peak: 0.6 }); return doc(w.body, w.defs); })(), anim: spin(3) },
    extra: { doc: doc(around(60, R_MID, `<path d='M0 -2.8V2.8' stroke='#ffffff' stroke-opacity='0.35' stroke-width='0.35'/>`)), anim: "s2fx-flicker 3s linear infinite" },
  }),
  "firtina-ruzgari": () => ({
    glow: ["#c8e6ff", 0.24],
    base: doc(`<circle r='${R_MID}' fill='none' stroke='#9fc8e8' stroke-opacity='0.3' stroke-width='3'/>`),
    spin: { doc: doc(around(5, R_MID, `<g transform='scale(1.5)'>${swirl("#f0f8ff")}</g>`, { rot: 90 })), anim: spin(3) },
    extra: { doc: doc([20, 95, 170, 250, 320].map((a, i) => `<path d='${arc(i % 2 ? R_OUT - 1 : R_GAP + 1, a, a + 28)}' stroke='#e6f5ff' stroke-opacity='0.7' stroke-width='0.7' fill='none' stroke-linecap='round'/>`).join("")), anim: rev(1.6) },
  }),
  "kehribar-isiltisi": () => ({
    glow: ["#ffaa28", 0.4],
    base: doc(band("url(#m)").body + GLOSS, metal("m", "#ffc25a", "#d97a10", "#7a3f04") + glossDefs),
    spin: { doc: doc(around(6, R_GAP - 0.8, drop("url(#a)", "#fff6d8"), { start: 15, rot: 180 }), lg("a", [[0, "#ffe08a"], [1, "#c86a08"]])), anim: rev(26) },
    extra: { doc: doc(around(9, R_MID, shape.glowDot(0.45, "#fff1c9", "#ffc85a"), { start: 8 })), anim: "s2fx-spin 40s linear infinite, s2fx-twinkle 2.4s ease-in-out infinite" },
  }),
  "ekolayzer": () => ({
    glow: ["#587af5", 0.42],
    base: doc(`<circle r='${R_GAP + 0.3}' fill='none' stroke='#587af5' stroke-opacity='0.5' stroke-width='0.6'/>`),
    spin: { doc: doc(around(30, R_GAP + 0.6, (i) => `<rect x='-0.75' y='${f(-(1.4 + ((i * 7) % 5) * 0.9))}' width='1.5' height='${f(1.4 + ((i * 7) % 5) * 0.9)}' rx='0.6' fill='#587af5'/>`)), anim: "s2fx-breathe 0.9s ease-in-out infinite" },
    extra: { doc: doc(around(30, R_GAP + 0.6, (i) => `<rect x='-0.75' y='${f(-(1.4 + ((i * 3 + 2) % 5) * 0.9))}' width='1.5' height='${f(1.4 + ((i * 3 + 2) % 5) * 0.9)}' rx='0.6' fill='#c3d0ff'/>`, { start: 6 })), anim: "s2fx-breathe 0.9s ease-in-out -0.45s infinite" },
  }),
  "sarmal-galaksi": () => ({
    glow: ["#9678ff", 0.36],
    base: doc(`<path d='${BAND}' fill='#0d0a24' fill-rule='evenodd'/>`),
    spin: { doc: doc([0, 180].map((a) => `<path d='${arc(R_GAP + 1, a, a + 70)}' stroke='url(#g)' stroke-width='2' fill='none' stroke-linecap='round'/><path d='${arc(R_MID, a + 40, a + 130)}' stroke='url(#g)' stroke-width='2.6' fill='none' stroke-linecap='round'/><path d='${arc(R_OUT - 1, a + 100, a + 170)}' stroke='url(#g)' stroke-width='1.6' fill='none' stroke-linecap='round'/>`).join("") + around(14, R_MID, (i) => shape.dot(i % 3 ? 0.35 : 0.6, "#ffffff"), { start: 7 }), lg("g", [[0, "#3b2c8f", 0], [0.6, "#9a7bff"], [1, "#e9e1ff"]], [0, 0, 1, 1])), anim: spin(10) },
    extra: { doc: doc(around(6, R_OBJ - 0.4, (i) => shape.star4(i % 2 ? 1 : 1.6, "#e9e1ff"), { start: 30 })), anim: "s2fx-spin 30s linear infinite reverse, s2fx-twinkle 3s ease-in-out infinite" },
  }),
};

module.exports = { ART };
