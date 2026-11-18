"use strict";

/**
 * Corner ornaments of the 16 set auras (./aura-set.js). Same contract as
 * ./aura-art.js: viewBox 0 0 100 100, drawn for the `native` corner (default
 * tl), copied into the `at` corners by build-css.mjs (mirrored copies), used
 * as both the paint and the mask of the rim layer. Static art; the motion is
 * the aura's ::after layer.
 */
const { rg, lg, f } = require("./svg");
const { d, star4, dot, leaf } = require("./aura-art");

const rad = (a) => (a * Math.PI) / 180;
/** One decimal is plenty at ornament size and keeps the data URIs small. */
const r1 = (n) => Math.round(n * 10) / 10;
const P = (x, y, len, a) => [r1(x + len * Math.cos(rad(a))), r1(y + len * Math.sin(rad(a)))];
/** Lens (grain / leaflet) from (x1, y1) to (x2, y2), half width w, as a path segment. */
function lens(x1, y1, x2, y2, w) {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const L = Math.hypot(x2 - x1, y2 - y1) || 1;
  const nx = (-(y2 - y1) / L) * w * 2;
  const ny = ((x2 - x1) / L) * w * 2;
  return `M${r1(x1)} ${r1(y1)}Q${r1(mx + nx)} ${r1(my + ny)} ${r1(x2)} ${r1(y2)}Q${r1(mx - nx)} ${r1(my - ny)} ${r1(x1)} ${r1(y1)}Z`;
}

/** Wheat stalks from the ground (x0, 100): [x0, height, lean, grain pairs]; one path per layer. */
function wheatField(list, col) {
  let stems = "";
  let grains = "";
  let awns = "";
  for (const [x0, h, lean, n] of list) {
    const tx = x0 + lean;
    const ty = 100 - h;
    const a = (Math.atan2(ty - 100, tx - x0) * 180) / Math.PI;
    stems += `M${x0} 100Q${r1(x0 + lean * 0.2)} ${r1(100 - h * 0.55)} ${r1(tx)} ${r1(ty)}`;
    const [hx, hy] = P(tx, ty, 5, a);
    grains += lens(tx, ty, hx, hy, 1.8);
    for (let i = 0; i < n; i += 1) {
      const [cx, cy] = P(tx, ty, 2 + i * 4.2, a + 180);
      for (const side of [-1, 1]) {
        const [gx, gy] = P(cx, cy, 6.5, a + side * 30);
        grains += lens(cx, cy, gx, gy, 1.9);
        const [ax, ay] = P(gx, gy, 7, a + side * 22);
        awns += `M${gx} ${gy}L${ax} ${ay}`;
      }
    }
  }
  return `<path d='${stems}' stroke='${col.stem}' stroke-width='1.6' fill='none' stroke-linecap='round'/><path d='${grains}' fill='url(#gr)'/><path d='${awns}' stroke='${col.awn}' stroke-width='.6' opacity='.75'/>`;
}

/** Fern frond along a quadratic curve p0 -> p2 (control p1); leaflets as two lens paths. */
function fern(p0, p1, p2, n, colA, colB) {
  const q = (t) => {
    const u = 1 - t;
    return [u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]];
  };
  const side = { "-1": "", 1: "" };
  for (let i = 1; i <= n; i += 1) {
    const t = i / (n + 1);
    const [x, y] = q(t);
    const [x2, y2] = q(Math.min(1, t + 0.01));
    const a = (Math.atan2(y2 - y, x2 - x) * 180) / Math.PI;
    const len = 15 * (1 - t * 0.72);
    for (const sd of [-1, 1]) {
      const [ex, ey] = P(x, y, len, a + sd * 62);
      side[sd] += lens(x, y, ex, ey, len * 0.2);
    }
  }
  return `<path d='M${p0[0]} ${p0[1]}Q${p1[0]} ${p1[1]} ${p2[0]} ${p2[1]}' stroke='${colB}' stroke-width='1.8' fill='none' stroke-linecap='round'/><path d='${side[-1]}' fill='${colA}'/><path d='${side[1]}' fill='${colB}'/>`;
}

/** Frost dendrites from the corner: [angle, length]; main branches, ticks and barbs as three paths. */
function frost(list, w) {
  let main = "";
  let ticks = "";
  let barbs = "";
  for (const [a, len] of list) {
    const [ex, ey] = P(2, 2, len, a);
    main += `M2 2L${ex} ${ey}`;
    for (let s = 8; s < len - 4; s += 8) {
      const [bx, by] = P(2, 2, s, a);
      const tick = Math.max(3, (len - s) * 0.4);
      for (const sd of [-1, 1]) {
        const [tx, ty] = P(bx, by, tick, a + sd * 52);
        ticks += `M${bx} ${by}L${tx} ${ty}`;
        if (tick > 9) {
          const [mx, my] = P(bx, by, tick * 0.55, a + sd * 52);
          const [ux, uy] = P(mx, my, tick * 0.35, a + sd * 98);
          barbs += `M${mx} ${my}L${ux} ${uy}`;
        }
      }
    }
  }
  return `<path d='${main}' stroke='#e8f9ff' stroke-width='${w}' stroke-linecap='round'/><path d='${ticks}' stroke='#a6e7ff' stroke-width='${r1(w * 0.6)}' stroke-linecap='round'/><path d='${barbs}' stroke='#ffffff' stroke-width='${r1(w * 0.45)}' stroke-linecap='round' opacity='.8'/>`;
}

const camel = (x, y, s) => `<g transform='translate(${x} ${y}) scale(${s})'><path d='M-14 0C-14 -6 -10 -10 -6 -10C-4 -16 2 -16 4 -10C6 -12 8 -12 9 -10L12 -18L16 -18L15 -14L12 -8C12 -4 10 0 10 0Z' fill='#2a1206'/><path d='M-12 0V9M-8 0V9M6 0V9M9 0V9' stroke='#2a1206' stroke-width='1.8'/><path d='M-2 -12V-19' stroke='#2a1206' stroke-width='1.2'/><circle cx='-2' cy='-20' r='2.2' fill='#ffcf7a'/><circle cx='-2' cy='-20' r='6' fill='url(#lg)'/></g>`;

/** Orchid with five petals, lip and lime centre at (cx, cy), petal length r. */
const orchid = (cx, cy, r, rot = 0) =>
  `<g transform='rotate(${rot} ${cx} ${cy})'>${[0, 72, 144, 216, 288].map((a) => `<ellipse cx='${cx}' cy='${f(cy - r * 0.55)}' rx='${f(r * 0.34)}' ry='${f(r * 0.58)}' transform='rotate(${a} ${cx} ${cy})' fill='url(#op)' stroke='#5a1a8a' stroke-width='.8'/>`).join("")}<path d='M${f(cx - r * 0.24)} ${f(cy + r * 0.08)}C${f(cx - r * 0.24)} ${f(cy + r * 0.42)} ${f(cx + r * 0.24)} ${f(cy + r * 0.42)} ${f(cx + r * 0.24)} ${f(cy + r * 0.08)}Z' fill='#ff6fb5'/><circle cx='${cx}' cy='${cy}' r='${f(r * 0.17)}' fill='#c8ff6a'/></g>`;

/** Flame-shaped leaf pointing along +y before rotation. */
const flameLeaf = (x, y, a, s) => `<path d='M0 0C-${f(s * 0.5)} -${f(s * 0.3)} -${f(s * 0.45)} -${f(s * 0.8)} 0 -${s}C${f(s * 0.16)} -${f(s * 0.62)} ${f(s * 0.55)} -${f(s * 0.46)} 0 0Z' transform='translate(${x} ${y}) rotate(${a})' fill='url(#fl)'/>`;

const SET_ORN = {
  "gece-limani-isiklar": {
    native: "tr",
    at: "tr",
    doc: () =>
      d(
        `<path d='M74 22L0 0V44Z' fill='url(#bm)'/><circle cx='74' cy='22' r='18' fill='url(#gl)'/>` +
          `<path d='M68.6 66L71.4 28H76.6L79.4 66Z' fill='#0b1b3a' stroke='#35d0e0' stroke-width='1.2'/><path d='M70.6 40H77.4M70 53H78' stroke='#e8f6ff' stroke-width='3.2'/>` +
          `<rect x='70' y='18' width='8' height='9' rx='1.4' fill='#0b1b3a' stroke='#35d0e0' stroke-width='1.2'/><path d='M69 18L74 12L79 18Z' fill='#1e4b8f' stroke='#35d0e0' stroke-width='1'/><circle cx='74' cy='22.4' r='3' fill='#ffffff'/>` +
          `<path d='M34 74Q42 69 50 74T66 74T82 74T98 74' stroke='#35d0e0' stroke-width='2.4' fill='none' stroke-linecap='round'/><path d='M46 82Q54 77 62 82T78 82T94 82' stroke='#e8f6ff' stroke-width='1.4' fill='none' stroke-linecap='round' opacity='.6'/>`,
        lg("bm", [[0, "#e8f6ff", 0], [1, "#e8f6ff", 0.5]], [0, 0, 1, 0]) + rg("gl", [[0, "#bff6ff", 0.9], [1, "#35d0e0", 0]]),
      ),
  },
  "bakir-kervan-ufuk": {
    native: "br",
    at: "br",
    doc: () =>
      d(
        `<circle cx='80' cy='64' r='24' fill='url(#sh)'/><circle cx='80' cy='64' r='10' fill='url(#sn)'/>` +
          `<path d='M14 100C34 86 58 80 100 76V100Z' fill='#7a2e12'/><path d='M14 100C34 86 58 80 100 76' stroke='#f0a443' stroke-width='1.6' fill='none'/><path d='M46 100C62 92 80 89 100 89V100Z' fill='#3a1407'/>` +
          camel(50, 82.4, 0.42) + camel(64, 79.4, 0.4) + camel(78, 77.6, 0.44),
        rg("sh", [[0, "#ffd98a", 0.55], [1, "#f0a443", 0]]) + rg("sn", [[0, "#fff3c4"], [0.7, "#ffcf7a"], [1, "#f0a443"]]) + rg("lg", [[0, "#ffcf7a", 0.7], [1, "#ffcf7a", 0]]),
      ),
  },
  "orkide-sisi-polen": {
    at: "tl br",
    doc: () =>
      d(
        `<circle cx='26' cy='26' r='24' fill='url(#gw)'/>` +
          `<path d='M4 66C10 50 18 44 26 40' stroke='#3f8a2e' stroke-width='1.6' fill='none'/>${leaf(6, 68, -64, 20, "#4caa3a")}${leaf(12, 54, -30, 14, "#6fcf4a")}` +
          orchid(26, 26, 22, 14) + orchid(54, 12, 11, -20) +
          [[60, 34, 1.8], [40, 52, 1.5], [12, 46, 1.2], [70, 20, 1.2]].map(([x, y, r]) => dot(x, y, r, "#c8ff6a")).join(""),
        lg("op", [[0, "#ffe0f6"], [0.55, "#ff8ad0"], [1, "#8b3fd1"]]) + rg("gw", [[0, "#ff6fb5", 0.45], [1, "#8b3fd1", 0]]),
      ),
  },
  "kor-bahcesi-sarmasik": {
    native: "bl",
    at: "bl tr",
    doc: () =>
      d(
        `<path d='M0 98C16 92 26 80 32 66S44 46 58 40' stroke='#5a1408' stroke-width='3.4' fill='none' stroke-linecap='round'/><path d='M0 98C16 92 26 80 32 66S44 46 58 40' stroke='#ff6a2b' stroke-width='1' fill='none' stroke-linecap='round' opacity='.8'/>` +
          [[8, 95, 30, 11], [18, 88, -60, 13], [26, 78, 40, 12], [31, 66, -50, 13], [38, 54, 50, 11], [46, 46, -36, 10]].map(([x, y, a, s]) => flameLeaf(x, y, a, s)).join("") +
          `<circle cx='58' cy='40' r='11' fill='url(#bg)'/><circle cx='58' cy='40' r='4.6' fill='url(#bd)'/>` +
          [[44, 30], [66, 30], [70, 46], [24, 60]].map(([x, y]) => dot(x, y, 1.3, "#ffd27a")).join(""),
        lg("fl", [[0, "#fff1b0"], [0.45, "#ff8a3d"], [1, "#a3220f"]]) + rg("bg", [[0, "#ffd27a", 0.7], [1, "#ff6a2b", 0]]) + rg("bd", [[0, "#ffffff"], [0.5, "#ffd27a"], [1, "#ff6a2b"]]),
      ),
  },
  "buzul-cicegi": {
    at: "tl tr",
    doc: () =>
      d(
        `<circle cx='4' cy='4' r='40' fill='url(#fz)'/>` + frost([[14, 66], [45, 74], [76, 64]], 2) +
          `<g transform='translate(58 58)'>${[0, 60, 120].map((a) => `<path d='M-6 0H6' transform='rotate(${a})' stroke='#ffffff' stroke-width='1.4' stroke-linecap='round'/>`).join("")}</g>` + star4(30, 12, 3, "#ffffff"),
        rg("fz", [[0, "#e8f9ff", 0.5], [1, "#a6e7ff", 0]]),
      ),
  },
  "neon-carsi-yansima": {
    at: "tl br",
    doc: () =>
      d(
        `<path d='M16 0V9M44 0V9' stroke='#2ef2ff' stroke-width='1.4'/><rect x='6' y='9' width='48' height='26' rx='7' fill='rgba(10,6,24,0.6)' stroke='#ff2e88' stroke-width='3.2'/>` +
          `<path d='M15 22H40M33 15.4L40.4 22L33 28.6' stroke='#fff04a' stroke-width='3.2' fill='none' stroke-linecap='round' stroke-linejoin='round'/>` +
          `<path d='M8 46H52' stroke='#2ef2ff' stroke-width='2.4' stroke-linecap='round'/>${[12, 22, 32, 42].map((x) => dot(x + 2, 52, 1.8, "#ff8ac0")).join("")}` +
          `<path d='M60 14L64 8M62 22L68 20' stroke='#fff04a' stroke-width='1.4' stroke-linecap='round' opacity='.8'/>`,
      ),
  },
  "altin-hasat-ruzgar": {
    native: "bl",
    at: "bl br",
    doc: () =>
      d(
        `<circle cx='14' cy='100' r='44' fill='url(#gh)'/>` +
          wheatField([[10, 70, 12, 5], [24, 58, 18, 4], [36, 44, 22, 4]], { stem: "#c9a227", awn: "#fff3c4" }),
        rg("gh", [[0, "#f2c230", 0.42], [1, "#f2c230", 0]]) + lg("gr", [[0, "#fff3c4"], [0.5, "#f2c230"], [1, "#8a6a12"]], [0, 0, 1, 1]),
      ),
  },
  "mor-sis-yildizli": {
    native: "tr",
    at: "tr",
    doc: () =>
      d(
        `<circle cx='72' cy='28' r='30' fill='url(#nh)'/><path d='M74 8A20 20 0 1 0 92 38A15 15 0 1 1 74 8Z' fill='url(#cr)'/>` +
          star4(44, 14, 5, "#ffffff") + star4(54, 40, 3.4, "#e6dcff", 0.9) + star4(90, 60, 3, "#e6dcff", 0.85) + dot(34, 30, 1.3, "#e6dcff") + dot(62, 58, 1.2, "#ffffff"),
        rg("nh", [[0, "#a77bff", 0.5], [1, "#4b2a9c", 0]]) + lg("cr", [[0, "#ffffff"], [1, "#c9b4ff"]], [0, 0, 1, 1]),
      ),
  },
  "gece-mercani-denizanasi": {
    native: "tr",
    at: "tr",
    doc: () =>
      d(
        `<circle cx='76' cy='24' r='28' fill='url(#jh)'/>` +
          [62, 70, 78, 86, 94].map((x, i) => `<path d='M${x} 30C${x - 4} 40 ${x + 4} 48 ${x - 2} 58${i % 2 ? `S${x + 2} 70 ${x - 3} 76` : ""}' stroke='${i % 2 ? "#ff8fab" : "#c8a8ff"}' stroke-width='1.3' fill='none' stroke-linecap='round' opacity='.85'/>`).join("") +
          `<path d='M58 30C58 15 68 7 78 7C88 7 98 15 98 30C93 28 89 32 85 30C81 33 77 30 73 32C69 29 63 32 58 30Z' fill='url(#jb)' stroke='#ffd0de' stroke-width='.8'/><path d='M66 18C68 13 72 11 76 11' stroke='#ffffff' stroke-width='1.6' fill='none' stroke-linecap='round' opacity='.8'/>` +
          [[44, 30, 2.6], [50, 44, 1.8], [40, 52, 1.3]].map(([x, y, r]) => `<circle cx='${x}' cy='${y}' r='${r}' fill='none' stroke='#ffc2d4' stroke-width='.9' opacity='.8'/>`).join(""),
        rg("jh", [[0, "#ff8fab", 0.5], [1, "#7c5cff", 0]]) + lg("jb", [[0, "#ffd0de", 0.95], [0.6, "#ff8fab", 0.85], [1, "#7c5cff", 0.75]]),
      ),
  },
  "kuzey-isigi-tac": {
    at: "tl tr",
    doc: () =>
      d(
        [[4, 44], [10, 30], [16, 52], [22, 36], [28, 46], [34, 26], [40, 38], [46, 22], [52, 30]].map(([x, h], i) => `<rect x='${x}' y='0' width='4.4' height='${h}' rx='2.2' fill='url(#${i % 3 === 1 ? "av" : "ag"})'/>`).join("") +
          star4(66, 16, 4.6, "#ffffff") + star4(18, 64, 3, "#d8fff0", 0.85) + dot(60, 38, 1.4, "#c9c0ff") + dot(76, 30, 1.1, "#d8fff0"),
        lg("ag", [[0, "#6effc7", 0.95], [0.6, "#14a37f", 0.45], [1, "#14a37f", 0]]) + lg("av", [[0, "#b7abff", 0.95], [0.6, "#8f7bff", 0.4], [1, "#8f7bff", 0]]),
      ),
  },
  "zumrut-orman-egrelti": {
    native: "bl",
    at: "bl tr",
    doc: () =>
      d(
        fern([0, 100], [8, 58], [52, 40], 9, "#49d17d", "#1f9a56") + fern([0, 100], [30, 84], [62, 78], 7, "#8af5b8", "#2fbf6e") +
          [[60, 30], [70, 60], [36, 54]].map(([x, y]) => `${dot(x, y, 5, "url(#ff)")}${dot(x, y, 1.6, "#f4ffb8")}`).join(""),
        rg("ff", [[0, "#e8ff8a", 0.8], [1, "#c8ff6a", 0]]),
      ),
  },
  "kum-saati-zaman-tozu": {
    native: "tr",
    at: "tr",
    doc: () =>
      d(
        `<circle cx='72' cy='32' r='28' fill='url(#kh)'/>` +
          `<path d='M62 12C62 24 70 28 72 32C70 36 62 40 62 52H82C82 40 74 36 72 32C74 28 82 24 82 12Z' fill='rgba(255,248,232,0.3)' stroke='#fff8e8' stroke-width='1.1'/>` +
          `<path d='M65 16H79C78 22 74 26 72 29C70 26 66 22 65 16Z' fill='#e8cf9a'/><path d='M72 30V45' stroke='#e8cf9a' stroke-width='.9'/><path d='M64 52C66 46 70 44 72 44C74 44 78 46 80 52Z' fill='#e8cf9a'/>` +
          `<rect x='57' y='7' width='30' height='5' rx='1.6' fill='url(#br)'/><rect x='57' y='52' width='30' height='5' rx='1.6' fill='url(#br)'/><path d='M59.5 12V52M84.5 12V52' stroke='#9c7a4a' stroke-width='2'/>` +
          `<path d='M8 16Q20 10 32 16T56 16' stroke='#e8cf9a' stroke-width='1.6' fill='none' opacity='.6' stroke-linecap='round'/><path d='M22 26Q32 21 42 26T60 26' stroke='#fff8e8' stroke-width='1' fill='none' opacity='.45' stroke-linecap='round'/>` +
          [[44, 40], [50, 48], [40, 58]].map(([x, y]) => dot(x, y, 1, "#fff8e8")).join(""),
        rg("kh", [[0, "#fff8e8", 0.32], [1, "#e8cf9a", 0]]) + lg("br", [[0, "#f5dfa8"], [0.5, "#c9a467"], [1, "#7a5a30"]]),
      ),
  },
  "firtina-simsek-agi": {
    at: "tl br",
    doc: () =>
      d(
        `${dot(6, 6, 16, "#3b4a6b")}${dot(24, 4, 12, "#4a5b82")}${dot(4, 24, 11, "#4a5b82")}` +
          `<path d='M10 10L26 22L20 26L36 40L30 44L52 64' stroke='#7aa7ff' stroke-width='6' fill='none' stroke-linejoin='round' stroke-linecap='round' opacity='.4'/>` +
          `<path d='M10 10L26 22L20 26L36 40L30 44L52 64' stroke='#f5f9ff' stroke-width='2.4' fill='none' stroke-linejoin='round' stroke-linecap='round'/>` +
          `<path d='M26 22L40 18L46 22M36 40L48 36M20 26L12 38L14 46M30 44L28 56' stroke='#cfe0ff' stroke-width='1.2' fill='none' stroke-linejoin='round' stroke-linecap='round'/>` +
          `${dot(52, 64, 3, "#ffffff")}${dot(52, 64, 9, "url(#zh)")}`,
        rg("zh", [[0, "#f5f9ff", 0.7], [1, "#7aa7ff", 0]]),
      ),
  },
  "lav-akisi-volkan-nefesi": {
    native: "bl",
    at: "bl br",
    doc: () => {
      const plates = ["M0 58L16 54L24 68L12 80L0 78Z", "M16 54L36 58L40 74L24 68Z", "M24 68L40 74L36 90L20 92L12 80Z", "M36 58L58 62L60 80L40 74Z", "M40 74L60 80L64 100H34L36 90Z", "M0 78L12 80L20 92L18 100H0Z", "M58 62L76 70L80 100H64L60 80Z"];
      const seams = "M0 58L16 54L36 58L58 62L76 70M16 54L24 68L40 74L60 80L64 100M24 68L12 80L0 78M12 80L20 92L18 100M40 74L36 90L34 100M36 58L40 74M58 62L60 80M20 92L36 90";
      return d(
        `<circle cx='20' cy='96' r='40' fill='url(#lh)'/>${plates.map((p) => `<path d='${p}' fill='url(#rk)'/>`).join("")}` +
          `<path d='${seams}' stroke='#ff3d00' stroke-width='3' fill='none' stroke-linejoin='round'/><path d='${seams}' stroke='#ffb000' stroke-width='1' fill='none' stroke-linejoin='round'/>` +
          [[30, 46, 1.6], [46, 50, 1.2], [14, 44, 1.1], [62, 54, 1]].map(([x, y, r]) => dot(x, y, r, "#ffb000")).join(""),
        rg("lh", [[0, "#ff3d00", 0.5], [1, "#ff3d00", 0]]) + lg("rk", [[0, "#3a1010"], [1, "#120404"]], [0, 0, 1, 1]),
      );
    },
  },
  "inci-kiyisi-kopuk": {
    native: "br",
    at: "br",
    doc: () => {
      const cx = 80;
      const cy = 98;
      const R = 26;
      const angs = [200, 220, 240, 260, 280, 300, 320, 340];
      const pts = angs.map((a) => P(cx, cy, R, a));
      let edge = `M${cx} ${cy}L${pts[0][0]} ${pts[0][1]}`;
      for (let i = 1; i < pts.length; i += 1) edge += `A5.6 5.6 0 0 1 ${pts[i][0]} ${pts[i][1]}`;
      edge += "Z";
      const ribs = angs.slice(1, -1).map((a) => { const [x, y] = P(cx, cy, R - 2, a); return `M${cx} ${cy}L${x} ${y}`; }).join("");
      return d(
        `<circle cx='60' cy='84' r='30' fill='url(#ph)'/><path d='${edge}' fill='url(#sh)' stroke='#ffffff' stroke-width='1' stroke-opacity='.7'/><path d='${ribs}' stroke='#9ab8d0' stroke-width='1' opacity='.7'/>` +
          `<circle cx='54' cy='86' r='7' fill='url(#pl)'/><circle cx='51.6' cy='83.4' r='1.8' fill='#ffffff'/>` +
          [[36, 92, 2.4], [42, 98, 1.6], [30, 98, 1.3], [46, 74, 1.2]].map(([x, y, r]) => `<circle cx='${x}' cy='${y}' r='${r}' fill='#ffffff' opacity='.75'/>`).join(""),
        rg("ph", [[0, "#ffd8e4", 0.45], [1, "#cfe3ef", 0]]) + lg("sh", [[0, "#ffd8e4"], [0.5, "#f1e9e1"], [1, "#cfe3ef"]], [0, 0, 1, 1]) + rg("pl", [[0, "#ffffff"], [0.6, "#f1e9e1"], [1, "#9ab8d0"]], { fx: "35%", fy: "30%" }),
      );
    },
  },
  "yildiz-tozu-kuyruklu": {
    at: "tl br",
    doc: () =>
      d(
        `<ellipse cx='30' cy='30' rx='34' ry='10' transform='rotate(45 30 30)' fill='url(#gx)'/>` +
          star4(22, 22, 8, "#ffe9a8") + star4(22, 22, 3.4, "#ffffff") + star4(44, 12, 4, "#ffe9a8", 0.95) + star4(12, 44, 3.6, "#ffe9a8", 0.9) + star4(40, 36, 2.6, "#e6dcff", 0.9) +
          [[56, 20], [20, 56], [52, 48], [64, 6], [6, 64]].map(([x, y]) => dot(x, y, 1.2, "#e6dcff")).join(""),
        rg("gx", [[0, "#c6b7ff", 0.55], [0.6, "#7c5cff", 0.2], [1, "#2b1f6e", 0]]),
      ),
  },
};

module.exports = { SET_ORN };
