"use strict";
// Market 2.0 C1: single (non-set) profile badges. 24 x 24 grid, read at 16-20 px next to names:
// one bold silhouette with a dark outline (reads on dark and light), a soft top-left light, an
// inner rim, and one chunky glyph with a small drop shadow. No hairlines below 1.4 units.
const { f, rg, lg, poly, star5, badgeDoc } = require("./c1-lib");
const { N } = require("./c1-frames");

const BADGES = [];

// ---------------------------------------------------------------- shapes (centred on 12,12)
const SHAPES = {
  circle: "M12 1.6a10.4 10.4 0 1 0 0.01 0Z",
  shield: "M12 1.4L20.8 4.6V11.2C20.8 16.6 17 20.6 12 22.6C7 20.6 3.2 16.6 3.2 11.2V4.6Z",
  hex: `M12 1.2L21.4 6.6V17.4L12 22.8L2.6 17.4V6.6Z`,
  diamond: "M12 1L23 12L12 23L1 12Z",
  square: "M7 2H17A5 5 0 0 1 22 7V17A5 5 0 0 1 17 22H7A5 5 0 0 1 2 17V7A5 5 0 0 1 7 2Z",
  octagon: "M8 1.6H16L22.4 8V16L16 22.4H8L1.6 16V8Z",
  drop: "M12 1.4C12 1.4 20.6 9.6 20.6 14.6A8.6 8.6 0 0 1 3.4 14.6C3.4 9.6 12 1.4 12 1.4Z",
  pentagon: "M12 1.4L22.4 9L18.4 21.6H5.6L1.6 9Z",
  star: (() => { let d = ""; for (let i = 0; i < 10; i++) { const r = i % 2 ? 5.6 : 11.2, a = ((i * 36 - 90) * Math.PI) / 180; d += (i ? "L" : "M") + f(12 + r * Math.cos(a)) + " " + f(12.8 + r * Math.sin(a)); } return d + "Z"; })(),
  burst: (() => { let d = ""; for (let i = 0; i < 24; i++) { const r = i % 2 ? 9.2 : 11.2, a = ((i * 15 - 90) * Math.PI) / 180; d += (i ? "L" : "M") + f(12 + r * Math.cos(a)) + " " + f(12 + r * Math.sin(a)); } return d + "Z"; })(),
  crest: "M12 1.4C15 3.4 18.6 3.6 21 3V11C21 17 16.6 20.8 12 22.6C7.4 20.8 3 17 3 11V3C5.4 3.6 9 3.4 12 1.4Z",
  cloud: "M6.6 19.6A5 5 0 0 1 5.6 9.8A6.8 6.8 0 0 1 18.4 8.6A5.6 5.6 0 0 1 17.4 19.6Z",
};

// ---------------------------------------------------------------- glyphs (light fill)
const G = {
  bolt: "M13.8 4.4L7.8 13.2H11.4L10.2 19.6L16.2 10.8H12.6Z",
  leaf: "M17.6 5.6C10 5.4 6.2 9.6 6.6 15.6L5.2 18.4L6.6 18.8L7.8 16.6C13.6 17.6 18 13.2 17.6 5.6ZM8.6 15.2C10.2 12.4 12.2 10.4 15 8.8C12.8 11 11 12.8 8.6 15.2Z",
  drop: "M12 5C12 5 16.8 10.4 16.8 13.8A4.8 4.8 0 0 1 7.2 13.8C7.2 10.4 12 5 12 5ZM10.2 12.6A1.2 1.8 -20 0 0 10 15.8L10.8 15.6A2 2 0 0 1 10.2 12.6Z",
  star: star5(6.6, 3).replace(/(-?[\d.]+) (-?[\d.]+)/g, (m, x, y) => `${f(+x + 12)} ${f(+y + 12.6)}`),
  heart: "M12 18.6C5.8 14.6 6 9 9.2 8.2C10.8 7.8 11.6 8.8 12 9.8C12.4 8.8 13.2 7.8 14.8 8.2C18 9 18.2 14.6 12 18.6Z",
  moon: "M14.2 5.6A6.8 6.8 0 1 0 18.6 15.6A5.4 5.4 0 1 1 14.2 5.6Z",
  sun: (() => { let d = "M12 8.4a3.6 3.6 0 1 0 .01 0Z"; for (let i = 0; i < 8; i++) { const a = (i * 45 * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a); const p = (r, o) => `${f(12 + r * c - o * s)} ${f(12 + r * s + o * c)}`; d += `M${p(5, -1)}L${p(7.6, 0)}L${p(5, 1)}Z`; } return d; })(),
  cloud: "M8.4 17A3.4 3.4 0 0 1 7.8 10.3A4.6 4.6 0 0 1 16.4 9.5A3.8 3.8 0 0 1 16 17Z",
  note: "M10 6.4L17.4 4.8V14.6A2.4 2 0 1 1 15.6 12.7V8.2L11.8 9V16.4A2.4 2 0 1 1 10 14.5Z",
  wave: "M4.8 11.4C6.6 9.2 8.4 9.2 10.2 11.4C12 13.6 13.8 13.6 15.6 11.4C17 9.8 18.4 9.6 19.4 10.4V12.8C18.4 12 17.4 12.2 16.4 13.4C14.4 15.8 11.6 15.8 9.6 13.4C8.2 11.8 7 11.8 5.6 13.4L4.8 12.6ZM4.8 15.8C6.6 13.6 8.4 13.6 10.2 15.8C12 18 13.8 18 15.6 15.8C17 14.2 18.4 14 19.4 14.8V17.2C18.4 16.4 17.4 16.6 16.4 17.8C14.4 20.2 11.6 20.2 9.6 17.8C8.2 16.2 7 16.2 5.6 17.8L4.8 17Z",
  cup: "M6 8.6H15.6V13.6A4 4 0 0 1 11.6 17.6H10A4 4 0 0 1 6 13.6ZM15.6 9.6H16.8A2.4 2.4 0 0 1 16.8 14.4H15.4V12.8H16.6A.8.8 0 0 0 16.6 11.2H15.6ZM5.4 18.6H16.2V20H5.4ZM9 4.4C8.4 5.4 9.8 6 9 7.2M12 4.4C11.4 5.4 12.8 6 12 7.2",
  crown: "M5.4 16.4L4.6 8.2L8.6 11.2L12 5.6L15.4 11.2L19.4 8.2L18.6 16.4ZM5.6 17.6H18.4V19.4H5.6Z",
  anchor: "M11 6.6A1.9 1.9 0 1 1 13 6.6V8.4H15.6V10.2H13V17.6C15 17.4 16.6 16.2 17.2 14.4L15.8 14.2L18.6 11.4L19.4 15.4L18.6 14.8C17.6 17.8 15 19.6 12 19.6C9 19.6 6.4 17.8 5.4 14.8L4.6 15.4L5.4 11.4L8.2 14.2L6.8 14.4C7.4 16.2 9 17.4 11 17.6V10.2H8.4V8.4H11Z",
  feather: "M18.6 4.6C12 5 7.6 9.6 7.4 15.2L5 19.4L6.4 20L8.6 16.4C14 16.4 18.2 11.2 18.6 4.6ZM9.4 15C10.8 11.8 13 9.2 16 7.4C13.6 9.6 11.6 12.2 10.6 15.2Z",
  key: "M8.6 5.4A4.2 4.2 0 1 1 7.4 13.6L7.4 19.6H10V17.8H11.8V15.8H10V13.4A4.2 4.2 0 0 1 8.6 5.4ZM8.6 7.6A1.6 1.6 0 1 0 8.61 7.6Z",
  rocket: "M12 3.6C15.4 6 16.4 9.8 15.6 14H8.4C7.6 9.8 8.6 6 12 3.6ZM12 7.6A1.6 1.6 0 1 0 12.01 7.6ZM8.4 12L5.6 15.6V17.4L8.8 15.6ZM15.6 12L18.4 15.6V17.4L15.2 15.6ZM10 15.2H14L13.2 19.6L12 18L10.8 19.6Z",
  headphones: "M12 4.6A7.4 7.4 0 0 0 4.6 12V17.2A2 2 0 0 0 6.6 19.2H8.6V13H6.6V12A5.4 5.4 0 0 1 17.4 12V13H15.4V19.2H17.4A2 2 0 0 0 19.4 17.2V12A7.4 7.4 0 0 0 12 4.6Z",
  gamepad: "M7.6 8H16.4C18.8 8 20 11 20.2 14.4C20.4 17.2 18.4 18 17 16.4L15.4 14.6H8.6L7 16.4C5.6 18 3.6 17.2 3.8 14.4C4 11 5.2 8 7.6 8ZM7.4 10.2V11.2H6.4V12.6H7.4V13.6H8.8V12.6H9.8V11.2H8.8V10.2ZM15.6 10.4A.9.9 0 1 0 15.61 10.4ZM17.4 12.2A.9.9 0 1 0 17.41 12.2Z",
  flame: "M12 3.4C13 7 17.6 8.8 17.6 13.8A5.6 5.6 0 0 1 6.4 13.8C6.4 11.2 7.8 9.6 9 8.4C9 10.4 9.8 11.6 11 12C10.4 9 11 5.8 12 3.4ZM12 13.4C12.6 15 14.2 15.6 14.2 17A2.2 2.2 0 0 1 9.8 17C9.8 15.6 11 14.8 12 13.4Z",
  snowflake: (() => { let d = ""; for (let i = 0; i < 6; i++) { const a = (i * 60 * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a); const p = (x, y) => `${f(12 + x * c - y * s)} ${f(12 + x * s + y * c)}`; d += `M${p(-0.9, 0)}L${p(-0.9, -7.4)}L${p(0.9, -7.4)}L${p(0.9, 0)}ZM${p(0, -4.2)}L${p(-2.6, -6.4)}L${p(-1.8, -7.2)}L${p(0, -5.6)}ZM${p(0, -4.2)}L${p(2.6, -6.4)}L${p(1.8, -7.2)}L${p(0, -5.6)}Z`; } return d; })(),
  clover: "M12 11.4C9.4 11.6 7.2 10.4 7.4 8.2C7.6 6.4 9.6 5.8 11 7C10.6 5.4 11.4 4.4 12 4.4C12.6 4.4 13.4 5.4 13 7C14.4 5.8 16.4 6.4 16.6 8.2C16.8 10.4 14.6 11.6 12 11.4ZM12 12.6C14.6 12.4 16.8 13.6 16.6 15.8C16.4 17.6 14.4 18.2 13 17L13.2 20H10.8L11 17C9.6 18.2 7.6 17.6 7.4 15.8C7.2 13.6 9.4 12.4 12 12.6Z",
  mountain: "M3.6 18.4L9.4 8.4L12.4 13.4L14.6 10L20.4 18.4ZM9.4 8.4L11.2 11.4L9.4 10.6L7.8 11.2Z",
  paw: "M12 12.4C14.8 12.4 17 15 16.4 17.4C16 19 14 18.6 12 18.6C10 18.6 8 19 7.6 17.4C7 15 9.2 12.4 12 12.4ZM7.2 9A1.8 2.2 0 1 0 7.21 9ZM10.2 6.2A1.8 2.4 0 1 0 10.21 6.2ZM13.8 6.2A1.8 2.4 0 1 0 13.81 6.2ZM16.8 9A1.8 2.2 0 1 0 16.81 9Z",
  tulip: "M12 13.6C8.6 13.6 6.8 11 7.2 6.2L9.4 8L12 4.6L14.6 8L16.8 6.2C17.2 11 15.4 13.6 12 13.6ZM11.2 13.4H12.8V19.8H11.2ZM12 18.4C10.4 16.6 8.6 15.8 6.6 16C7.8 18 9.8 19 12 18.4ZM12 18.4C13.6 16.6 15.4 15.8 17.4 16C16.2 18 14.2 19 12 18.4Z",
  phoenix: "M12 6.4C13 6.4 13.6 7.2 13.6 8.2L15 8.8L13.6 9.2C13.6 10 13.2 10.6 12.8 11C16 9 18.6 6.6 20.4 4.2C20.2 9 17.4 12.6 13.4 13.6L15 19.6L12 17L9 19.6L10.6 13.6C6.6 12.6 3.8 9 3.6 4.2C5.4 6.6 8 9 11.2 11C10.6 10.4 10.4 9.6 10.4 8.2C10.4 7.2 11 6.4 12 6.4Z",
  trophy: "M7.4 4.6H16.6V9.2A4.6 4.6 0 0 1 12.8 13.8V16H15V18H9V16H11.2V13.8A4.6 4.6 0 0 1 7.4 9.2ZM16.6 6H19A3.6 3.6 0 0 1 16.4 11.6L16.6 10.2A2.2 2.2 0 0 0 17.6 7.4H16.6ZM7.4 6H5A3.6 3.6 0 0 0 7.6 11.6L7.4 10.2A2.2 2.2 0 0 1 6.4 7.4H7.4ZM8 18.8H16V20H8Z",
  gem: "M8 5.2H16L19.6 9.4L12 19.4L4.4 9.4ZM8.8 6.6L7.2 9H10.2ZM15.2 6.6L13.8 9H16.8ZM12 6.6L10.8 9H13.2ZM7 10.4L11 15.8L9.6 10.4ZM17 10.4H14.4L13 15.8Z",
  eye: "M12 6.6C16.4 6.6 19.4 10 20.4 12C19.4 14 16.4 17.4 12 17.4C7.6 17.4 4.6 14 3.6 12C4.6 10 7.6 6.6 12 6.6ZM12 8.6A3.4 3.4 0 1 0 12.01 8.6ZM12 10.4A1.6 1.6 0 1 0 12.01 10.4Z",
  comet: "M15 6.6A3.6 3.6 0 1 1 14.99 6.6ZM12.2 12.4L4.6 19.6L5.6 16.4L4.4 16.8L10.6 10.8ZM10.6 9L5.4 11.6L8.8 8.2ZM14.8 13.6L12.2 18.8L15.6 15.4Z",
  atom: "M12 10.4A1.6 1.6 0 1 0 12.01 10.4Z",
  infinity: "M7.6 8.4C9.6 8.4 10.8 10.2 12 11.6C13.2 10.2 14.4 8.4 16.4 8.4A3.6 3.6 0 0 1 16.4 15.6C14.4 15.6 13.2 13.8 12 12.4C10.8 13.8 9.6 15.6 7.6 15.6A3.6 3.6 0 0 1 7.6 8.4ZM7.6 10.2A1.8 1.8 0 0 0 7.6 13.8C8.8 13.8 9.8 12.6 10.8 12C9.8 11.4 8.8 10.2 7.6 10.2ZM16.4 10.2C15.2 10.2 14.2 11.4 13.2 12C14.2 12.6 15.2 13.8 16.4 13.8A1.8 1.8 0 0 0 16.4 10.2Z",
  swords: "M5 4.2L7.4 4.6L15.6 12.8L14.4 14L6.2 5.8ZM19 4.2L18.6 6.6L10.4 14.8L9.2 13.6L16.6 5.4ZM13.6 15.8L17.6 19.8L19.4 18L15.4 14ZM10.4 15.8L6.4 19.8L4.6 18L8.6 14ZM14 13.6L17.4 13L18.6 14.2L14.2 18.6L13 17.4L13.6 14ZM10 13.6L6.6 13L5.4 14.2L9.8 18.6L11 17.4L10.4 14Z",
  owl: "M6.4 5.6L9 8.2H15L17.6 5.6V13.4C17.6 17 15.2 19.6 12 19.6C8.8 19.6 6.4 17 6.4 13.4ZM9.4 9.4A2.4 2.4 0 1 0 9.41 9.4ZM14.6 9.4A2.4 2.4 0 1 0 14.61 9.4ZM12 13.2L11 14.8H13Z",
  wings: "M12 9.6C10.4 7.6 7 6 3.4 6.2C4.4 7 4.8 7.6 5 8.4C3.8 8.4 3 8.8 2.6 9.4C4 9.6 4.8 10 5.4 10.8C4.4 11 3.8 11.6 3.6 12.2C5.4 12.2 6.6 12.8 7.4 13.8C6.8 14.2 6.6 14.8 6.6 15.4C8.8 15 10.8 14.6 12 16.6C13.2 14.6 15.2 15 17.4 15.4C17.4 14.8 17.2 14.2 16.6 13.8C17.4 12.8 18.6 12.2 20.4 12.2C20.2 11.6 19.6 11 18.6 10.8C19.2 10 20 9.6 21.4 9.4C21 8.8 20.2 8.4 19 8.4C19.2 7.6 19.6 7 20.6 6.2C17 6 13.6 7.6 12 9.6Z",
  spiral: "M12 11.2A.9.9 0 1 1 12.9 12.6C14.4 12.2 14.8 10.2 13.6 9.2C12.2 8 9.8 8.6 9.2 10.6C8.4 13.2 10.6 15.6 13.2 15.4C16.6 15.2 18.2 11.4 16.8 8.6C15.2 5.6 11.2 4.8 8.4 6.6C5.6 8.4 5 12.4 6.8 15.2L5.6 16C3.4 12.6 4.2 7.8 7.6 5.6C11 3.4 15.8 4.4 17.8 8C19.6 11.4 17.6 16.4 13.2 16.8C9.8 17 7 14 7.8 10.4C8.6 7.6 11.8 6.6 13.8 8C15.4 9.2 15.4 12 13.6 13.2C12.4 14 11 13 12 11.2Z",
};

/** Atom glyph needs strokes (orbits). */
const ATOM_ORBITS = (c) => [0, 60, 120].map((a) => `<ellipse cx='12' cy='12' rx='7.6' ry='3' fill='none' stroke='${c}' stroke-width='1.5' transform='rotate(${a} 12 12)'/>`).join("");

/**
 * Badge art. pal = [light, mid, dark]; glyphFill = glyph colour; opt.ring = metal edge colour,
 * opt.extra = extra markup on top, opt.glyphSvg = raw glyph markup instead of a path.
 */
function badge(shape, pal, glyph, glyphFill = "#fff", opt = {}) {
  const sp = SHAPES[shape];
  const [light, mid, dark] = pal;
  const defs = rg("b", [[0, light], [0.55, mid], [1, dark]], 0.32, 0.25, 0.85) + lg("hl", [[0, "#fff", 0.55], [0.5, "#fff", 0]], 0, 0, 0, 1) + (opt.defs || "");
  const outline = opt.outline || "#0b0d17";
  let body = `<path d='${sp}' fill='url(#b)' stroke='${outline}' stroke-width='1.3' stroke-linejoin='round'/>`;
  if (opt.ring) body += `<path d='${sp}' fill='none' stroke='${opt.ring}' stroke-width='1.1' stroke-linejoin='round' transform='translate(12 12) scale(.86) translate(-12 -12)'/>`;
  else body += `<path d='${sp}' fill='none' stroke='#fff' stroke-opacity='.4' stroke-width='.8' transform='translate(12 12) scale(.84) translate(-12 -12)'/>`;
  body += `<path d='${sp}' fill='url(#hl)' transform='translate(12 9) scale(.78 .6) translate(-12 -12)'/>`;
  const g = opt.glyphSvg ? opt.glyphSvg : `<path d='${G[glyph]}' fill='${glyphFill}'${opt.glyphStroke ? ` stroke='${opt.glyphStroke}' stroke-width='.6' stroke-linejoin='round'` : ""}/>`;
  const shadow = opt.glyphSvg ? "" : `<path d='${G[glyph]}' fill='${dark}' opacity='.55' transform='translate(0 .9)'/>`;
  body += shadow + g + (opt.extra || "");
  return badgeDoc(defs, body);
}

const add = (slug, rarity, price, name, desc, art) => BADGES.push({ slug, rarity, price, anim: false, name, desc, art, tags: [] });

// ---------------------------------------------------------------- common (12)
add("spark", "common", 160, N("Kıvılcım", "Spark", "Funke", "Chispa", "Étincelle", "Faísca", "Искра"),
  N("Sarı bir yuvarlakta enerjik bir şimşek.", "An energetic lightning bolt on a yellow disc.", "Ein energiegeladener Blitz auf gelber Scheibe.", "Un rayo lleno de energía sobre un disco amarillo.", "Un éclair plein d'énergie sur un disque jaune.", "Um raio cheio de energia em um disco amarelo.", "Энергичная молния на жёлтом круге."),
  () => badge("circle", ["#fff6a8", "#ffc21a", "#b86a00"], "bolt", "#fff", { glyphStroke: "#8a4a00" }));
add("sprout", "common", 150, N("Filiz", "Sprout", "Spross", "Brote", "Pousse", "Broto", "Росток"),
  N("Yeşil bir damla rozette taze bir yaprak.", "A fresh leaf on a green drop-shaped badge.", "Ein frisches Blatt auf einem grünen Tropfenabzeichen.", "Una hoja fresca sobre una insignia verde en forma de gota.", "Une feuille fraîche sur un badge vert en goutte.", "Uma folha fresca em um emblema verde em forma de gota.", "Свежий листок на зелёном значке-капле."),
  () => badge("drop", ["#c8ffb0", "#4cc35a", "#1a6a2a"], "leaf", "#f4ffe8"));
add("dewdrop", "common", 170, N("Çiy Damlası", "Dewdrop", "Tautropfen", "Gota de rocío", "Goutte de rosée", "Gota de orvalho", "Капля росы"),
  N("Mavi altıgende parlayan tek bir damla.", "A single shining drop on a blue hexagon.", "Ein einzelner glänzender Tropfen auf blauem Sechseck.", "Una sola gota brillante sobre un hexágono azul.", "Une seule goutte brillante sur un hexagone bleu.", "Uma única gota brilhante em um hexágono azul.", "Одна сияющая капля на синем шестиугольнике."),
  () => badge("hex", ["#b8ecff", "#2f9bff", "#0a3a8a"], "drop", "#f0fbff"));
add("north-star", "common", 180, N("Kutup Yıldızı", "North Star", "Polarstern", "Estrella polar", "Étoile polaire", "Estrela polar", "Полярная звезда"),
  N("Gece mavisi bir karede altın bir yıldız.", "A golden star on a midnight blue tile.", "Ein goldener Stern auf einer nachtblauen Kachel.", "Una estrella dorada sobre una pieza azul noche.", "Une étoile dorée sur un carreau bleu nuit.", "Uma estrela dourada em um ladrilho azul-noite.", "Золотая звезда на полуночно-синей плитке."),
  () => badge("square", ["#7a8aff", "#2a3aa8", "#0c1240"], "star", "#ffd84a", { glyphStroke: "#8a5a00" }));
add("heartbeat", "common", 160, N("Kalp Atışı", "Heartbeat", "Herzschlag", "Latido", "Battement", "Batimento", "Сердцебиение"),
  N("Pembe bir yuvarlakta sıcacık bir kalp.", "A warm heart on a pink disc.", "Ein warmes Herz auf rosa Scheibe.", "Un corazón cálido sobre un disco rosa.", "Un cœur chaleureux sur un disque rose.", "Um coração caloroso em um disco rosa.", "Тёплое сердце на розовом круге."),
  () => badge("circle", ["#ffc8dc", "#ff4a8a", "#8a0a3a"], "heart", "#fff"));
add("crescent", "common", 190, N("Hilal", "Crescent", "Mondsichel", "Media luna", "Croissant de lune", "Lua crescente", "Полумесяц"),
  N("Mor bir kalkanda gümüş bir ay.", "A silver moon on a violet shield.", "Ein silberner Mond auf violettem Schild.", "Una luna plateada sobre un escudo violeta.", "Une lune argentée sur un écu violet.", "Uma lua prateada em um escudo violeta.", "Серебряная луна на фиолетовом щите."),
  () => badge("shield", ["#d8c8ff", "#7a4ad8", "#2a0e6a"], "moon", "#f4f0ff"));
add("sunny", "common", 170, N("Güneşli", "Sunny", "Sonnig", "Soleado", "Ensoleillé", "Ensolarado", "Солнечный"),
  N("Turuncu bir sekizgende ışın saçan güneş.", "A radiant sun on an orange octagon.", "Eine strahlende Sonne auf orangem Achteck.", "Un sol radiante sobre un octógono naranja.", "Un soleil rayonnant sur un octogone orange.", "Um sol radiante em um octógono laranja.", "Сияющее солнце на оранжевом восьмиугольнике."),
  () => badge("octagon", ["#ffe0a8", "#ff8a1a", "#9a3a00"], "sun", "#fff6d0"));
add("daydream", "common", 150, N("Hayal", "Daydream", "Tagtraum", "Ensueño", "Rêverie", "Devaneio", "Мечта"),
  N("Gök mavisi bir bulut rozeti.", "A sky blue cloud-shaped badge.", "Ein himmelblaues Abzeichen in Wolkenform.", "Una insignia celeste con forma de nube.", "Un badge bleu ciel en forme de nuage.", "Um emblema azul-celeste em forma de nuvem.", "Небесно-голубой значок в форме облака."),
  () => badge("cloud", ["#e8f6ff", "#7ac8ff", "#2a6aa8"], "star", "#fff", { glyphSvg: `<path d='M12 10.2l.9 1.9l2 .3l-1.5 1.4l.4 2l-1.8-1l-1.8 1l.4-2l-1.5-1.4l2-.3Z' fill='#fff' stroke='#2a6aa8' stroke-width='.6'/>` }));
add("melody", "common", 200, N("Melodi", "Melody", "Melodie", "Melodía", "Mélodie", "Melodia", "Мелодия"),
  N("Turkuaz bir elmasta iki notalı bir melodi.", "A two-note melody on a turquoise diamond.", "Eine Melodie aus zwei Noten auf türkisfarbener Raute.", "Una melodía de dos notas sobre un rombo turquesa.", "Une mélodie de deux notes sur un losange turquoise.", "Uma melodia de duas notas em um losango turquesa.", "Мелодия из двух нот на бирюзовом ромбе."),
  () => badge("diamond", ["#b8fff0", "#18c8b0", "#06584e"], "note", "#fff"));
add("tide", "common", 160, N("Gelgit", "Tide", "Gezeiten", "Marea", "Marée", "Maré", "Прилив"),
  N("Lacivert bir yuvarlakta iki sıra dalga.", "Two rows of waves on a navy disc.", "Zwei Wellenreihen auf marineblauer Scheibe.", "Dos filas de olas sobre un disco azul marino.", "Deux rangs de vagues sur un disque marine.", "Duas fileiras de ondas em um disco azul-marinho.", "Два ряда волн на тёмно-синем круге."),
  () => badge("circle", ["#8ad8ff", "#1a6ad0", "#06205a"], "wave", "#e8faff"));
add("pebble", "common", 150, N("Çakıl", "Pebble", "Kiesel", "Guijarro", "Galet", "Seixo", "Галька"),
  N("Sıcak gri taşta oyulmuş küçük bir dağ.", "A small mountain carved into warm grey stone.", "Ein kleiner Berg, in warmen grauen Stein gemeißelt.", "Una pequeña montaña tallada en piedra gris cálida.", "Une petite montagne gravée dans une pierre gris chaud.", "Uma pequena montanha esculpida em pedra cinza quente.", "Маленькая гора, вырезанная в тёплом сером камне."),
  () => badge("hex", ["#eae4dc", "#9a9088", "#4a423c"], "mountain", "#fff"));
add("coffee-break", "common", 180, N("Kahve Molası", "Coffee Break", "Kaffeepause", "Pausa para café", "Pause café", "Pausa para o café", "Кофе-брейк"),
  N("Kahverengi bir karede tüten bir fincan.", "A steaming cup on a brown tile.", "Eine dampfende Tasse auf brauner Kachel.", "Una taza humeante sobre una pieza marrón.", "Une tasse fumante sur un carreau brun.", "Uma xícara fumegante em um ladrilho marrom.", "Дымящаяся чашка на коричневой плитке."),
  () => badge("square", ["#f0c8a0", "#a8642a", "#4a2408"], "cup", "#fff6e8", { glyphStroke: "#fff6e8" }));

// ---------------------------------------------------------------- rare (14)
const rare = [
  ["crowned", 420, "shield", ["#fff0b0", "#e0a020", "#6a3a00"], "crown", "#fff8d8", N("Taçlı", "Crowned", "Gekrönt", "Coronado", "Couronné", "Coroado", "Коронованный"), N("Altın kalkanda parlak bir taç.", "A bright crown on a golden shield.", "Eine strahlende Krone auf goldenem Schild.", "Una corona brillante sobre un escudo dorado.", "Une couronne éclatante sur un écu doré.", "Uma coroa brilhante em um escudo dourado.", "Яркая корона на золотом щите.")],
  ["anchor", 340, "circle", ["#c8e0ff", "#3a6ac8", "#0c2050"], "anchor", "#fff", N("Çapa", "Anchor", "Anker", "Ancla", "Ancre", "Âncora", "Якорь"), N("Denizci mavisi yuvarlakta sağlam bir çapa.", "A sturdy anchor on a sailor blue disc.", "Ein fester Anker auf matrosenblauer Scheibe.", "Un ancla firme sobre un disco azul marinero.", "Une ancre solide sur un disque bleu marin.", "Uma âncora firme em um disco azul-marinheiro.", "Надёжный якорь на морском синем круге.")],
  ["quill", 360, "drop", ["#ffe0f0", "#d0508a", "#5a0a30"], "feather", "#fff", N("Tüy Kalem", "Quill", "Federkiel", "Pluma", "Plume d'écrivain", "Pena de escrever", "Перо"), N("Gül kurusu damlada zarif bir tüy.", "An elegant feather on a dusty rose drop.", "Eine elegante Feder auf altrosa Tropfen.", "Una pluma elegante sobre una gota rosa empolvado.", "Une plume élégante sur une goutte vieux rose.", "Uma pena elegante em uma gota rosa antigo.", "Изящное перо на капле пыльно-розового цвета.")],
  ["skeleton-key", 380, "octagon", ["#f2e0c0", "#a8803a", "#3a2408"], "key", "#fff3d8", N("Maymuncuk", "Skeleton Key", "Dietrich", "Llave maestra", "Passe-partout", "Chave-mestra", "Отмычка"), N("Eskimiş pirinç sekizgende eski bir anahtar.", "An old key on a worn brass octagon.", "Ein alter Schlüssel auf abgenutztem Messingachteck.", "Una llave antigua sobre un octógono de latón gastado.", "Une vieille clé sur un octogone de laiton patiné.", "Uma chave antiga em um octógono de latão gasto.", "Старинный ключ на потёртом латунном восьмиугольнике.")],
  ["liftoff", 450, "pentagon", ["#ffd0c0", "#ff5a3a", "#7a1406"], "rocket", "#fff", N("Kalkış", "Liftoff", "Abheben", "Despegue", "Décollage", "Decolagem", "Старт"), N("Kızıl beşgende yükselen bir roket.", "A rocket lifting off on a red pentagon.", "Eine startende Rakete auf rotem Fünfeck.", "Un cohete despegando sobre un pentágono rojo.", "Une fusée qui décolle sur un pentagone rouge.", "Um foguete decolando em um pentágono vermelho.", "Взлетающая ракета на красном пятиугольнике.")],
  ["on-air", 400, "square", ["#e0d8ff", "#6a4aff", "#1e0a6a"], "headphones", "#fff", N("Yayında", "On Air", "Auf Sendung", "Al aire", "À l'antenne", "No ar", "В эфире"), N("Mor karede bir kulaklık; sesin hep açık.", "Headphones on a violet tile, always tuned in.", "Kopfhörer auf violetter Kachel, immer auf Empfang.", "Auriculares sobre una pieza violeta, siempre a la escucha.", "Un casque sur un carreau violet, toujours à l'écoute.", "Fones em um ladrilho violeta, sempre ligado.", "Наушники на фиолетовой плитке, всегда на связи.")],
  ["player-one", 420, "hex", ["#c8ffd8", "#2ac86a", "#064a22"], "gamepad", "#fff", N("Birinci Oyuncu", "Player One", "Spieler eins", "Jugador uno", "Joueur un", "Jogador um", "Первый игрок"), N("Yeşil altıgende bir oyun kumandası.", "A game controller on a green hexagon.", "Ein Controller auf grünem Sechseck.", "Un mando sobre un hexágono verde.", "Une manette sur un hexagone vert.", "Um controle em um hexágono verde.", "Геймпад на зелёном шестиугольнике.")],
  ["wildfire", 380, "drop", ["#fff0a0", "#ff7a1a", "#8a1a00"], "flame", "#fffbe0", N("Orman Yangını", "Wildfire", "Lauffeuer", "Fuego salvaje", "Feu de forêt", "Fogo selvagem", "Лесной пожар"), N("Turuncu damlada dans eden bir alev.", "A dancing flame on an orange drop.", "Eine tanzende Flamme auf orangem Tropfen.", "Una llama que baila sobre una gota naranja.", "Une flamme qui danse sur une goutte orange.", "Uma chama dançante em uma gota laranja.", "Пляшущее пламя на оранжевой капле.")],
  ["first-snow", 340, "hex", ["#ffffff", "#a8dcff", "#2a6aa8"], "snowflake", "#fff", N("İlk Kar", "First Snow", "Erster Schnee", "Primera nevada", "Première neige", "Primeira neve", "Первый снег"), N("Buz mavisi altıgende bir kar tanesi.", "A snowflake on an ice blue hexagon.", "Eine Schneeflocke auf eisblauem Sechseck.", "Un copo de nieve sobre un hexágono azul hielo.", "Un flocon sur un hexagone bleu glace.", "Um floco de neve em um hexágono azul-gelo.", "Снежинка на ледяном голубом шестиугольнике.")],
  ["lucky-clover", 360, "circle", ["#d8ffc8", "#3aa83a", "#0e4a10"], "clover", "#f4ffe8", N("Şans Yoncası", "Lucky Clover", "Glücksklee", "Trébol de la suerte", "Trèfle porte-bonheur", "Trevo da sorte", "Счастливый клевер"), N("Yeşil yuvarlakta dört yapraklı yonca.", "A four-leaf clover on a green disc.", "Ein vierblättriges Kleeblatt auf grüner Scheibe.", "Un trébol de cuatro hojas sobre un disco verde.", "Un trèfle à quatre feuilles sur un disque vert.", "Um trevo de quatro folhas em um disco verde.", "Четырёхлистный клевер на зелёном круге.")],
  ["summit", 400, "pentagon", ["#e0f0ff", "#5a8ac8", "#1a2a4a"], "mountain", "#fff", N("Zirve", "Summit", "Gipfel", "Cumbre", "Sommet", "Cume", "Вершина"), N("Karlı tepeli bir dağ, mavi beşgen üstünde.", "A snow-capped mountain on a blue pentagon.", "Ein schneebedeckter Berg auf blauem Fünfeck.", "Una montaña nevada sobre un pentágono azul.", "Une montagne enneigée sur un pentagone bleu.", "Uma montanha nevada em um pentágono azul.", "Заснеженная гора на синем пятиугольнике.")],
  ["paw-print", 320, "circle", ["#ffe8d0", "#e09a5a", "#6a3a14"], "paw", "#fff8ee", N("Pati İzi", "Paw Print", "Pfotenabdruck", "Huella de pata", "Empreinte de patte", "Pegada de pata", "Отпечаток лапы"), N("Karamel yuvarlakta sevimli bir pati izi.", "A cute paw print on a caramel disc.", "Ein süßer Pfotenabdruck auf karamellfarbener Scheibe.", "Una huella de pata adorable sobre un disco caramelo.", "Une jolie empreinte de patte sur un disque caramel.", "Uma pegada fofa em um disco caramelo.", "Милый отпечаток лапы на карамельном круге.")],
  ["tulip", 440, "crest", ["#ffd0e0", "#e0306a", "#6a0a2a"], "tulip", "#fff", N("Lale", "Tulip", "Tulpe", "Tulipán", "Tulipe", "Tulipa", "Тюльпан"), N("Kırmızı armada zarif bir lale.", "An elegant tulip on a red crest.", "Eine elegante Tulpe auf rotem Wappen.", "Un tulipán elegante sobre un blasón rojo.", "Une tulipe élégante sur un blason rouge.", "Uma tulipa elegante em um brasão vermelho.", "Изящный тюльпан на красном гербе.")],
  ["guardian", 480, "shield", ["#d8e4f0", "#7a8aa0", "#1e2836"], "swords", "#fff", N("Muhafız", "Guardian", "Wächter", "Guardián", "Gardien", "Guardião", "Страж"), N("Çelik kalkanda çapraz iki kılıç.", "Two crossed swords on a steel shield.", "Zwei gekreuzte Schwerter auf Stahlschild.", "Dos espadas cruzadas sobre un escudo de acero.", "Deux épées croisées sur un écu d'acier.", "Duas espadas cruzadas em um escudo de aço.", "Два скрещённых меча на стальном щите.")],
];
for (const [slug, price, shape, pal, glyph, gf, name, desc] of rare) add(slug, "rare", price, name, desc, () => badge(shape, pal, glyph, gf));

// ---------------------------------------------------------------- epic (9)
const GOLD_RING = "#ffd76a";
const epic = [
  ["phoenix", 780, "burst", ["#fff0a0", "#ff6a1a", "#7a1000"], "phoenix", "#fff6d0", N("Anka", "Phoenix", "Phönix", "Fénix", "Phénix", "Fênix", "Феникс"), N("Alev rengi yıldız patlamasında kanat açan bir anka.", "A phoenix spreading its wings on a flame-coloured starburst.", "Ein Phönix breitet die Flügel auf flammenfarbenem Sternenkranz aus.", "Un fénix que abre las alas sobre un estallido color fuego.", "Un phénix qui déploie ses ailes sur une étoile couleur flamme.", "Uma fênix abrindo as asas em uma explosão cor de fogo.", "Феникс расправляет крылья на огненной звезде.")],
  ["champion", 820, "shield", ["#fff6c8", "#f2b630", "#6a4000"], "trophy", "#fffbe8", N("Şampiyon", "Champion", "Champion", "Campeón", "Champion", "Campeão", "Чемпион"), N("Altın kenarlı kalkanda bir kupa.", "A trophy on a gold-rimmed shield.", "Ein Pokal auf goldgerahmtem Schild.", "Un trofeo sobre un escudo con borde dorado.", "Un trophée sur un écu bordé d'or.", "Um troféu em um escudo de borda dourada.", "Кубок на щите с золотой каймой.")],
  ["brilliant", 700, "diamond", ["#e0f8ff", "#3ab8f0", "#0a3a6a"], "gem", "#fff", N("Pırlanta", "Brilliant", "Brillant", "Brillante", "Brillant", "Brilhante", "Бриллиант"), N("Buz mavisi eşkenar dörtgende yontulmuş bir mücevher.", "A cut gem on an ice blue diamond.", "Ein geschliffener Edelstein auf eisblauer Raute.", "Una gema tallada sobre un rombo azul hielo.", "Une gemme taillée sur un losange bleu glace.", "Uma gema lapidada em um losango azul-gelo.", "Огранённый самоцвет на ледяном голубом ромбе.")],
  ["third-eye", 640, "octagon", ["#e8d0ff", "#8a3ad8", "#2a0a4a"], "eye", "#fff", N("Üçüncü Göz", "Third Eye", "Drittes Auge", "Tercer ojo", "Troisième œil", "Terceiro olho", "Третий глаз"), N("Mor sekizgende her şeyi gören bir göz.", "An all-seeing eye on a violet octagon.", "Ein allsehendes Auge auf violettem Achteck.", "Un ojo que todo lo ve sobre un octógono violeta.", "Un œil qui voit tout sur un octogone violet.", "Um olho que tudo vê em um octógono violeta.", "Всевидящее око на фиолетовом восьмиугольнике.")],
  ["comet", 680, "circle", ["#c8d8ff", "#3a4ad0", "#0a0e40"], "comet", "#fff", N("Kuyrukluyıldız", "Comet", "Komet", "Cometa", "Comète", "Cometa", "Комета"), N("Gece mavisi yuvarlakta süzülen bir kuyrukluyıldız.", "A comet streaking across a midnight disc.", "Ein Komet, der über eine Mitternachtsscheibe zieht.", "Un cometa que cruza un disco azul medianoche.", "Une comète filant sur un disque de minuit.", "Um cometa cruzando um disco azul-meia-noite.", "Комета, проносящаяся по полуночному кругу.")],
  ["atom", 600, "hex", ["#c8fff8", "#18b8c8", "#04404a"], "atom", "#fff", N("Atom", "Atom", "Atom", "Átomo", "Atome", "Átomo", "Атом"), N("Camgöbeği altıgende dönen yörüngeler.", "Spinning orbits on a cyan hexagon.", "Kreisende Bahnen auf cyanfarbenem Sechseck.", "Órbitas giratorias sobre un hexágono cian.", "Des orbites tournoyantes sur un hexagone cyan.", "Órbitas girando em um hexágono ciano.", "Вращающиеся орбиты на голубом шестиугольнике.")],
  ["infinite", 620, "square", ["#ffd8f0", "#d03aa8", "#4a0a3a"], "infinity", "#fff", N("Sonsuz", "Infinite", "Unendlich", "Infinito", "Infini", "Infinito", "Бесконечность"), N("Fuşya karede sonsuzluk işareti.", "The infinity sign on a fuchsia tile.", "Das Unendlichkeitszeichen auf pinker Kachel.", "El signo de infinito sobre una pieza fucsia.", "Le signe infini sur un carreau fuchsia.", "O símbolo do infinito em um ladrilho fúcsia.", "Знак бесконечности на фуксиевой плитке.")],
  ["night-owl", 660, "crest", ["#d0c8f0", "#4a3a8a", "#140a30"], "owl", "#f2d860", N("Gece Kuşu", "Night Owl", "Nachteule", "Búho nocturno", "Oiseau de nuit", "Coruja noturna", "Ночная сова"), N("Gece moru armada altın gözlü bir baykuş.", "A golden-eyed owl on a night purple crest.", "Eine Eule mit goldenen Augen auf nachtviolettem Wappen.", "Un búho de ojos dorados sobre un blasón morado nocturno.", "Une chouette aux yeux d'or sur un blason violet nuit.", "Uma coruja de olhos dourados em um brasão roxo-noite.", "Сова с золотыми глазами на ночном фиолетовом гербе.")],
  ["galaxy", 720, "circle", ["#f0c8ff", "#6a2ad0", "#0a0430"], "spiral", "#fff", N("Galaksi", "Galaxy", "Galaxie", "Galaxia", "Galaxie", "Galáxia", "Галактика"), N("Derin mor yuvarlakta sarmal bir galaksi.", "A spiral galaxy on a deep purple disc.", "Eine Spiralgalaxie auf tiefvioletter Scheibe.", "Una galaxia espiral sobre un disco morado intenso.", "Une galaxie spirale sur un disque violet profond.", "Uma galáxia espiral em um disco roxo profundo.", "Спиральная галактика на глубоком фиолетовом круге.")],
];
for (const [slug, price, shape, pal, glyph, gf, name, desc] of epic)
  add(slug, "epic", price, name, desc, () => badge(shape, pal, glyph, gf, { ring: GOLD_RING, ...(glyph === "atom" ? { glyphSvg: ATOM_ORBITS(gf) + `<path d='${G.atom}' fill='${gf}'/>` } : {}) }));

// ---------------------------------------------------------------- legendary (5)
const SPARK = (x, y, s = 1) => `<path d='M${x} ${f(y - 2.6 * s)}Q${f(x + 0.4 * s)} ${f(y - 0.4 * s)} ${f(x + 2.6 * s)} ${y}Q${f(x + 0.4 * s)} ${f(y + 0.4 * s)} ${x} ${f(y + 2.6 * s)}Q${f(x - 0.4 * s)} ${f(y + 0.4 * s)} ${f(x - 2.6 * s)} ${y}Q${f(x - 0.4 * s)} ${f(y - 0.4 * s)} ${x} ${f(y - 2.6 * s)}Z' fill='#fff'/>`;
const legendary = [
  ["laurel-medal", 1100, "burst", ["#fff6c8", "#f2b630", "#6a3a00"], "crown", N("Defne Madalyası", "Laurel Medal", "Lorbeermedaille", "Medalla de laurel", "Médaille de laurier", "Medalha de louros", "Лавровая медаль"), N("Altın ışınlı madalyada taç ve parıltı.", "A crown and a glint on a gold-rayed medal.", "Eine Krone mit Glanz auf goldstrahliger Medaille.", "Una corona con destello sobre una medalla de rayos dorados.", "Une couronne et un éclat sur une médaille à rayons d'or.", "Uma coroa com brilho em uma medalha de raios dourados.", "Корона и блик на медали с золотыми лучами."), "#5a0a1a", ["#ff8a9a", "#d0142c", "#5a0410"]],
  ["sun-crest", 1200, "crest", ["#fff3c0", "#ff9a1a", "#7a2a00"], "sun", N("Güneş Arması", "Sun Crest", "Sonnenwappen", "Blasón solar", "Blason solaire", "Brasão solar", "Солнечный герб"), N("Kehribar armada altın bir güneş.", "A golden sun on an amber crest.", "Eine goldene Sonne auf bernsteinfarbenem Wappen.", "Un sol dorado sobre un blasón ámbar.", "Un soleil doré sur un blason ambré.", "Um sol dourado em um brasão âmbar.", "Золотое солнце на янтарном гербе."), null, null],
  ["royal-gem", 1350, "octagon", ["#ffd0d8", "#c8102c", "#40040c"], "gem", N("Kraliyet Taşı", "Royal Gem", "Königsjuwel", "Gema real", "Joyau royal", "Joia real", "Королевский самоцвет"), N("Altın çerçeveli yakut sekizgende yontulmuş bir taş.", "A cut stone on a gold-framed ruby octagon.", "Ein geschliffener Stein auf goldgerahmtem Rubinachteck.", "Una piedra tallada sobre un octógono de rubí enmarcado en oro.", "Une pierre taillée sur un octogone de rubis serti d'or.", "Uma pedra lapidada em um octógono de rubi com moldura dourada.", "Огранённый камень на рубиновом восьмиугольнике в золотой оправе."), null, null],
  ["seraph-wings", 1400, "circle", ["#ffffff", "#c8d8ff", "#3a4a8a"], "wings", N("Melek Kanatları", "Seraph Wings", "Seraphenflügel", "Alas seráficas", "Ailes de séraphin", "Asas seráficas", "Крылья серафима"), N("Altın halkalı inci yuvarlakta açılmış kanatlar.", "Open wings on a pearl disc ringed with gold.", "Ausgebreitete Flügel auf perlmuttfarbener Scheibe mit Goldring.", "Alas abiertas sobre un disco perlado con aro dorado.", "Des ailes déployées sur un disque nacré cerclé d'or.", "Asas abertas em um disco perolado com aro dourado.", "Раскрытые крылья на жемчужном круге с золотым ободком."), null, null],
  ["cosmos", 1500, "star", ["#f0d8ff", "#7a3aff", "#140440"], "spiral", N("Kozmos", "Cosmos", "Kosmos", "Cosmos", "Cosmos", "Cosmos", "Космос"), N("Altın kenarlı yıldızda dönen bir galaksi.", "A swirling galaxy on a gold-edged star.", "Eine wirbelnde Galaxie auf goldgerandetem Stern.", "Una galaxia en remolino sobre una estrella con borde dorado.", "Une galaxie tourbillonnante sur une étoile bordée d'or.", "Uma galáxia em redemoinho em uma estrela de borda dourada.", "Закрученная галактика на звезде с золотой каймой."), null, null],
];
for (const [slug, price, shape, pal, glyph, name, desc] of legendary)
  add(slug, "legendary", price, name, desc, () => badge(shape, pal, glyph, "#fffbe8", {
    ring: GOLD_RING, outline: "#3a2400",
    glyphStroke: "#6a3a00",
    extra: SPARK(18.6, 5.6, 0.9),
  }));

module.exports = { BADGES, SHAPES, G, badge };
