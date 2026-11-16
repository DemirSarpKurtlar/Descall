// Market 2.0 (C4): voice tile cosmetics ("Ses kutucugu").
//
// A voice tile is how a user's tile looks to everyone in a server voice channel and in
// DM / group call grids: an illustrated scene behind the avatar, an edge, and a speaking
// ring in the theme's colour. The art is generated here from the item's effect_key, so
// the equipped item that travels with the member data stays tiny ({ effect_key }), and
// the same art renders in the shop, the voice grid and the call tiles.
//
// Layers (see styles/shop2-c4.css):
//   .vt2-skin   background = scene SVG (static image, decoded once per key)
//   .vt2-fx     tileable particle / light SVG that moves (transform only); idle tiles in
//               big rooms and phones stay still, reduced motion never moves
//   ::after     edge + speaking ring (theme colour, 3 px, glow), so speaking stays clear
//
// Pure module (no DOM): node selftests import it.

const f = (n) => Math.round(n * 10) / 10;

function rnd(seed) {
  let x = (Math.abs(Math.floor(seed)) % 2147483646) + 1;
  return () => {
    x = (x * 16807) % 2147483647;
    return (x - 1) / 2147483646;
  };
}

function seedOf(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) || 7;
}

function hexToRgb(hex) {
  const h = String(hex).replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgba(hex, a) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

/** Mix two hex colours (t = 0 -> a, 1 -> b). */
function mix(a, b, t) {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  const c = A.map((v, i) => Math.round(v + (B[i] - v) * t));
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** Relative luminance (WCAG). */
export function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// ---------- SVG helpers ----------
const W = 400;
const H = 300;

const lin = (id, stops, x1 = 0, y1 = 0, x2 = 0, y2 = 1) =>
  `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stops
    .map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}"${a < 1 ? ` stop-opacity="${a}"` : ""}/>`)
    .join("")}</linearGradient>`;

const rad = (id, stops, cx = 0.5, cy = 0.5, r = 0.5) =>
  `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}">${stops
    .map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}"${a < 1 ? ` stop-opacity="${a}"` : ""}/>`)
    .join("")}</radialGradient>`;

const blur = (id, sd) =>
  `<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${sd}"/></filter>`;

/** Smooth ridge path from x=-10..410 closed to the bottom. */
function ridge(y0, amp, waves, phase, R, { bottom = H + 10, jitter = 0.35, steps = 14 } = {}) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const x = -10 + (i * (W + 20)) / steps;
    const y =
      y0 +
      Math.sin((i / steps) * Math.PI * waves + phase) * amp +
      Math.sin((i / steps) * Math.PI * waves * 2.3 + phase * 1.7) * amp * 0.35 +
      (R ? (R() - 0.5) * amp * jitter : 0);
    pts.push([x, y]);
  }
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 1; i < pts.length; i++) {
    const [px, py] = pts[i - 1];
    const [x, y] = pts[i];
    const mx = (px + x) / 2;
    d += ` Q${f(px)} ${f(py)} ${f(mx)} ${f((py + y) / 2)}`;
  }
  d += ` L${W + 10} ${bottom} L-10 ${bottom} Z`;
  return d;
}

/** Open wave line (stroke). */
function waveLine(y0, amp, waves, phase, x0 = -10, x1 = W + 10, steps = 24) {
  let d = "";
  for (let i = 0; i <= steps; i++) {
    const x = x0 + ((x1 - x0) * i) / steps;
    const y = y0 + Math.sin((i / steps) * Math.PI * waves + phase) * amp;
    d += `${i ? " L" : "M"}${f(x)} ${f(y)}`;
  }
  return d;
}

function starField(R, n, { colors = ["#ffffff"], maxR = 1.2, minR = 0.4, yMax = H, glow = false } = {}) {
  let o = "";
  for (let i = 0; i < n; i++) {
    const x = R() * W;
    const y = R() * yMax;
    const r = minR + R() * (maxR - minR);
    const c = colors[Math.floor(R() * colors.length)];
    o += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${c}" opacity="${f(0.35 + R() * 0.65)}"${glow ? ' filter="url(#gl)"' : ""}/>`;
  }
  return o;
}

/** Four-point sparkle. */
function sparkle(x, y, s, c, op = 1) {
  return `<path d="M${f(x)} ${f(y - s)} Q${f(x + s * 0.16)} ${f(y - s * 0.16)} ${f(x + s)} ${f(y)} Q${f(x + s * 0.16)} ${f(y + s * 0.16)} ${f(x)} ${f(y + s)} Q${f(x - s * 0.16)} ${f(y + s * 0.16)} ${f(x - s)} ${f(y)} Q${f(x - s * 0.16)} ${f(y - s * 0.16)} ${f(x)} ${f(y - s)}Z" fill="${c}" opacity="${op}"/>`;
}

function svgDoc(defs, body, { w = W, h = H } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice"><defs>${defs}</defs>${body}</svg>`;
}

/** Shared finish: halo behind the avatar, bottom shade under the name chip, edge vignette. */
function finish(p, { halo = 0.22, shade = 0.55 } = {}) {
  const defs =
    rad("fh", [[0, p.accent, halo], [0.55, p.accent, halo * 0.25], [1, p.accent, 0]], 0.5, 0.48, 0.42) +
    lin("fb", [[0.55, "#000", 0], [1, "#000", shade]]) +
    rad("fv", [[0.62, "#000", 0], [1, "#000", 0.42]], 0.5, 0.5, 0.75);
  const body = `<rect width="${W}" height="${H}" fill="url(#fh)"/><rect width="${W}" height="${H}" fill="url(#fb)"/><rect width="${W}" height="${H}" fill="url(#fv)"/>`;
  return { defs, body };
}

// ---------- scenes ----------
// Each scene: (p, R) => { defs, body }. p = { dark, mid, accent, light, extra? }.
// Composition rule: the avatar sits in the middle; the drama lives in the corners, the
// horizon and the edges, the centre stays calmer so the face and the ring read.

const SCENES = {
  harbor(p, R) {
    const defs =
      lin("s", [[0, p.dark], [0.62, p.mid], [1, mix(p.mid, p.accent, 0.35)]]) +
      lin("sea", [[0, mix(p.dark, p.mid, 0.5)], [1, p.dark]]) +
      lin("beam", [[0, p.light, 0.55], [1, p.light, 0]], 1, 0, 0, 0.4) +
      rad("lamp", [[0, p.light], [0.3, p.accent, 0.8], [1, p.accent, 0]]) +
      lin("tw", [[0, mix(p.dark, "#000000", 0.2)], [1, mix(p.mid, p.dark, 0.4)]], 0, 0, 1, 0) +
      blur("b6", 6) + blur("b14", 14) + blur("gl", 1.2);
    let body = `<rect width="${W}" height="${H}" fill="url(#s)"/>`;
    body += starField(R, 46, { colors: [p.light, p.accent], yMax: 150, maxR: 1.1 });
    body += `<circle cx="70" cy="58" r="20" fill="${p.light}" opacity=".9"/><circle cx="70" cy="58" r="40" fill="${p.light}" opacity=".12" filter="url(#b14)"/>`;
    // Beam from the lamp sweeping to the upper left.
    body += `<path d="M334 92 L-20 10 L-20 120 Z" fill="url(#beam)" opacity=".55" filter="url(#b6)"/>`;
    // Headland + lighthouse (right).
    body += `<path d="M300 210 Q330 186 360 192 Q392 196 420 186 L420 300 L300 300Z" fill="${mix(p.dark, "#000000", 0.35)}"/>`;
    body += `<path d="M322 196 L327 112 L341 112 L346 196Z" fill="url(#tw)"/>`;
    body += `<path d="M324.6 170 L343.4 170 L344.2 182 L323.8 182Z M326.4 140 L341.6 140 L342.4 152 L325.6 152Z" fill="${p.light}" opacity=".85"/>`;
    body += `<rect x="323" y="100" width="22" height="13" rx="2" fill="${mix(p.dark, p.mid, 0.4)}"/><path d="M321 100 L334 88 L347 100Z" fill="${mix(p.dark, "#000000", 0.3)}"/>`;
    body += `<circle cx="334" cy="106" r="30" fill="url(#lamp)"/><circle cx="334" cy="106" r="4" fill="#fff"/>`;
    // Fog bands.
    body += `<ellipse cx="120" cy="196" rx="190" ry="16" fill="${p.light}" opacity=".12" filter="url(#b14)"/><ellipse cx="300" cy="214" rx="160" ry="12" fill="${p.light}" opacity=".1" filter="url(#b14)"/>`;
    // Sea + waves.
    body += `<rect y="206" width="${W}" height="94" fill="url(#sea)"/>`;
    for (let i = 0; i < 7; i++) {
      const y = 214 + i * 12;
      body += `<path d="${waveLine(y, 2.4 + i * 0.5, 9 + i, R() * 6)}" stroke="${i % 2 ? p.accent : p.light}" stroke-width="${f(1 + i * 0.25)}" fill="none" opacity="${f(0.18 + i * 0.06)}" stroke-linecap="round"/>`;
    }
    body += `<path d="M334 214 L330 300 L338 300Z" fill="${p.light}" opacity=".18" filter="url(#b6)"/>`;
    return { defs, body };
  },

  dunes(p, R) {
    const defs =
      lin("s", [[0, p.dark], [0.45, mix(p.dark, p.mid, 0.7)], [0.78, p.accent], [1, p.light]]) +
      rad("sun", [[0, p.light], [0.55, p.accent, 0.9], [1, p.accent, 0]]) +
      lin("d1", [[0, mix(p.mid, p.accent, 0.4)], [1, mix(p.dark, p.mid, 0.4)]]) +
      lin("d2", [[0, mix(p.mid, p.dark, 0.2)], [1, p.dark]]) +
      lin("d3", [[0, mix(p.dark, "#000000", 0.2)], [1, mix(p.dark, "#000000", 0.5)]]) +
      blur("b10", 10) + blur("gl", 1.5);
    let body = `<rect width="${W}" height="${H}" fill="url(#s)"/>`;
    body += starField(R, 22, { colors: [p.light], yMax: 80, maxR: 0.9 });
    body += `<circle cx="300" cy="168" r="70" fill="url(#sun)" opacity=".9"/><circle cx="300" cy="168" r="30" fill="${p.light}" opacity=".95"/>`;
    for (let i = 0; i < 4; i++) body += `<rect x="252" y="${152 + i * 9}" width="96" height="2.4" fill="${mix(p.accent, p.mid, 0.4)}" opacity=".55"/>`;
    body += `<path d="${ridge(190, 14, 2.2, 0.4, R)}" fill="url(#d1)"/>`;
    // Caravan on the far ridge.
    const camel = (x, y, s) =>
      `<path transform="translate(${x} ${y}) scale(${s})" d="M0 0 C2 -6 6 -9 10 -9 C12 -14 16 -14 18 -9 C21 -9 24 -12 26 -16 L28 -17 L30 -15 L28 -12 C27 -9 25 -6 24 -4 L24 6 L22 6 L22 0 L12 0 L12 6 L10 6 L10 0 C6 1 3 2 2 6 L0 6Z" fill="${p.dark}"/>`;
    body += camel(70, 186, 0.9) + camel(104, 182, 0.8) + camel(134, 180, 0.72);
    body += `<path d="M60 192 Q110 176 160 186" stroke="${p.dark}" stroke-width="1" fill="none" opacity=".7"/>`;
    body += `<circle cx="96" cy="180" r="2.2" fill="${p.light}" filter="url(#gl)"/><circle cx="96" cy="180" r="9" fill="${p.accent}" opacity=".35" filter="url(#b10)"/>`;
    body += `<path d="${ridge(226, 18, 1.6, 2.1, R)}" fill="url(#d2)"/>`;
    body += `<path d="${ridge(262, 12, 1.2, 0.9, R)}" fill="url(#d3)"/>`;
    for (let i = 0; i < 5; i++) body += `<path d="${waveLine(244 + i * 9, 3, 2.4, i)}" stroke="${p.accent}" stroke-width=".8" fill="none" opacity=".18"/>`;
    return { defs, body };
  },

  orchid(p, R) {
    const defs =
      lin("s", [[0, p.dark], [1, mix(p.dark, p.mid, 0.45)]], 0, 0, 1, 1) +
      lin("pt", [[0, mix(p.accent, "#ffffff", 0.45)], [0.6, p.accent], [1, p.mid]]) +
      lin("pt2", [[0, mix(p.mid, "#ffffff", 0.35)], [1, p.mid]]) +
      rad("lip", [[0, p.light], [1, mix(p.light, p.accent, 0.5)]]) +
      blur("b18", 18) + blur("gl", 1.4);
    let body = `<rect width="${W}" height="${H}" fill="url(#s)"/>`;
    body += `<ellipse cx="320" cy="70" rx="120" ry="70" fill="${p.mid}" opacity=".45" filter="url(#b18)"/><ellipse cx="60" cy="260" rx="120" ry="60" fill="${p.accent}" opacity=".22" filter="url(#b18)"/>`;
    // Greenhouse glass ribs.
    for (let i = 0; i < 7; i++) body += `<path d="M${f(-20 + i * 70)} 0 Q${f(i * 70 + 20)} 150 ${f(-20 + i * 70)} 300" stroke="#ffffff" stroke-opacity=".05" fill="none"/>`;
    const orchid = (x, y, s, rot) => {
      let g = `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})">`;
      g += `<ellipse cx="0" cy="-20" rx="10" ry="20" fill="url(#pt2)"/>`;
      g += `<ellipse cx="0" cy="-20" rx="10" ry="20" fill="url(#pt2)" transform="rotate(120)"/><ellipse cx="0" cy="-20" rx="10" ry="20" fill="url(#pt2)" transform="rotate(240)"/>`;
      g += `<ellipse cx="0" cy="-17" rx="13" ry="16" fill="url(#pt)" transform="rotate(60)"/><ellipse cx="0" cy="-17" rx="13" ry="16" fill="url(#pt)" transform="rotate(-60)"/>`;
      g += `<path d="M-8 4 Q0 22 8 4 Q0 10 -8 4Z" fill="url(#lip)"/><circle r="3.4" fill="${p.light}"/>`;
      return g + "</g>";
    };
    body += `<path d="M330 300 C330 240 350 200 372 168" stroke="${mix(p.light, p.dark, 0.5)}" stroke-width="3" fill="none"/>`;
    body += `<path d="M40 300 C44 260 30 220 22 196" stroke="${mix(p.light, p.dark, 0.5)}" stroke-width="2.6" fill="none"/>`;
    body += `<path d="M300 300 C310 270 330 262 350 262 C340 276 322 288 300 300Z" fill="${mix(p.light, p.dark, 0.35)}" opacity=".8"/>`;
    body += orchid(368, 160, 1.5, 12) + orchid(330, 66, 1.05, -18) + orchid(24, 186, 1.2, -10) + orchid(70, 44, 0.75, 30) + orchid(380, 252, 0.8, 40);
    body += starField(R, 30, { colors: [p.light, mix(p.accent, "#ffffff", 0.5)], maxR: 1.8, minR: 0.6, glow: true });
    return { defs, body };
  },

  embers(p, R) {
    const defs =
      rad("s", [[0, mix(p.mid, p.dark, 0.35)], [1, p.dark]], 0.5, 1.05, 0.95) +
      lin("fl", [[0, p.light], [0.45, p.accent], [1, p.mid, 0.2]]) +
      lin("gr", [[0, mix(p.dark, "#000000", 0.2)], [1, "#000000"]]) +
      blur("b4", 4) + blur("b16", 16) + blur("gl", 1.6);
    let body = `<rect width="${W}" height="${H}" fill="url(#s)"/>`;
    body += `<ellipse cx="200" cy="300" rx="240" ry="70" fill="${p.accent}" opacity=".28" filter="url(#b16)"/>`;
    // Ground with glowing seams.
    body += `<path d="${ridge(250, 8, 1.5, 1.1, R)}" fill="url(#gr)"/>`;
    for (let i = 0; i < 6; i++) {
      const x = 20 + i * 66 + R() * 20;
      body += `<path d="M${f(x)} 300 L${f(x + 6)} 276 L${f(x - 4)} 262 L${f(x + 10)} 252" stroke="${p.accent}" stroke-width="1.6" fill="none" opacity=".75" filter="url(#gl)"/>`;
    }
    // Fire flowers (petals of flame) in the lower corners.
    const flower = (x, y, s) => {
      let g = `<g transform="translate(${x} ${y}) scale(${s})">`;
      for (let k = 0; k < 7; k++) {
        const a = -90 + (k - 3) * 24;
        g += `<path transform="rotate(${a + 90})" d="M0 0 C-9 -14 -7 -30 0 -44 C7 -30 9 -14 0 0Z" fill="url(#fl)" opacity="${f(0.75 + (k % 2) * 0.2)}"/>`;
      }
      return g + `<circle r="5" fill="${p.light}"/><circle r="14" fill="${p.accent}" opacity=".5" filter="url(#b4)"/></g>`;
    };
    body += `<ellipse cx="50" cy="250" rx="80" ry="50" fill="${p.accent}" opacity=".3" filter="url(#b16)"/><ellipse cx="350" cy="250" rx="80" ry="50" fill="${p.accent}" opacity=".3" filter="url(#b16)"/>`;
    body += flower(50, 268, 1.7) + flower(352, 262, 1.45) + flower(300, 292, 0.8) + flower(108, 296, 0.75) + flower(20, 120, 0.55) + flower(384, 110, 0.5);
    body += starField(R, 40, { colors: [p.light, p.accent], maxR: 1.6, minR: 0.5, glow: true });
    return { defs, body };
  },

  glacier(p, R) {
    const defs =
      lin("s", [[0, mix(p.dark, p.mid, 0.25)], [0.7, p.dark], [1, mix(p.dark, "#000000", 0.3)]]) +
      lin("ice1", [[0, p.light], [1, p.accent]], 0, 0, 1, 1) +
      lin("ice2", [[0, p.accent], [1, p.mid]], 0, 0, 1, 1) +
      lin("ice3", [[0, p.mid], [1, mix(p.dark, p.mid, 0.4)]], 0, 0, 1, 1) +
      lin("ray", [[0, p.light, 0.35], [1, p.light, 0]]) + blur("b8", 8) + blur("gl", 1);
    let body = `<rect width="${W}" height="${H}" fill="url(#s)"/>`;
    for (let i = 0; i < 4; i++) body += `<path d="M${130 + i * 46} -10 L${100 + i * 70} 300 L${150 + i * 70} 300 L${154 + i * 46} -10Z" fill="url(#ray)" opacity=".3" filter="url(#b8)"/>`;
    const shard = (pts, fills) => {
      // pts: apex + base points; facets alternate fills
      let o = "";
      for (let i = 0; i < pts.length - 2; i++) o += `<path d="M${pts[0]} L${pts[i + 1]} L${pts[i + 2]}Z" fill="url(#${fills[i % fills.length]})"/>`;
      return o;
    };
    body += shard(["40 150", "-10 300", "20 300", "70 300", "100 300"], ["ice2", "ice1", "ice3", "ice2"]);
    body += shard(["110 210", "70 300", "110 300", "150 300"], ["ice1", "ice3", "ice2"]);
    body += shard(["350 120", "300 300", "340 300", "380 300", "420 300"], ["ice3", "ice1", "ice2", "ice1"]);
    body += shard(["286 200", "250 300", "286 300", "320 300"], ["ice2", "ice1", "ice3"]);
    body += shard(["380 0", "330 -10", "360 70", "420 -10"], ["ice1", "ice2"]);
    body += shard(["0 70", "-10 -10", "60 -10"], ["ice2"]);
    body += `<path d="M0 286 L400 286 L400 300 L0 300Z" fill="${p.light}" opacity=".18"/>`;
    for (let i = 0; i < 6; i++) body += sparkle(30 + R() * 340, 20 + R() * 240, 3 + R() * 5, "#ffffff", f(0.5 + R() * 0.5));
    body += starField(R, 40, { colors: ["#ffffff", p.light], maxR: 1.1 });
    return { defs, body };
  },

  neon(p, R) {
    const defs =
      lin("s", [[0, p.dark], [0.6, mix(p.dark, p.mid, 0.16)], [1, p.dark]]) +
      lin("wet", [[0, mix(p.dark, p.mid, 0.12)], [1, p.dark]]) +
      lin("aw", [[0, p.mid], [1, mix(p.mid, p.dark, 0.5)]]) +
      lin("aw2", [[0, p.accent], [1, mix(p.accent, p.dark, 0.55)]]) +
      rad("lan", [[0, p.extra || p.light], [0.35, p.light, 0.8], [1, p.light, 0]]) +
      blur("b3", 3) + blur("b10", 10) + blur("b18", 18) + blur("gl", 1.6);
    let body = `<rect width="${W}" height="${H}" fill="url(#s)"/>`;
    body += `<ellipse cx="60" cy="90" rx="110" ry="70" fill="${p.mid}" opacity=".22" filter="url(#b18)"/><ellipse cx="350" cy="80" rx="110" ry="70" fill="${p.accent}" opacity=".2" filter="url(#b18)"/>`;
    // Back buildings with lit windows.
    let x = -10;
    while (x < 410) {
      const w = 34 + R() * 26;
      const h = 110 + R() * 70;
      body += `<rect x="${f(x)}" y="${f(222 - h)}" width="${f(w)}" height="${f(h)}" fill="${mix(p.dark, "#000000", 0.15 + R() * 0.25)}"/>`;
      for (let wy = 230 - h; wy < 200; wy += 11) for (let wx = x + 5; wx < x + w - 6; wx += 9) if (R() < 0.18) body += `<rect x="${f(wx)}" y="${f(wy)}" width="4" height="5" fill="${R() > 0.5 ? p.mid : p.accent}" opacity=".55"/>`;
      x += w + 3;
    }
    // Striped awnings (stalls) at both sides.
    const awning = (x0, y0, w, grad, n) => {
      let o = `<path d="M${x0} ${y0} L${x0 + w} ${y0} L${x0 + w - 8} ${y0 + 16} L${x0 + 8} ${y0 + 16}Z" fill="url(#${grad})"/>`;
      for (let i = 0; i < n; i++) o += `<path d="M${f(x0 + 8 + ((w - 16) / n) * i)} ${y0 + 16} q${f((w - 16) / n / 2)} 9 ${f((w - 16) / n)} 0" fill="url(#${grad})"/>`;
      for (let i = 1; i < n; i += 2) o += `<rect x="${f(x0 + (w / n) * i)}" y="${y0}" width="${f(w / n)}" height="16" fill="#ffffff" opacity=".12"/>`;
      return o;
    };
    body += awning(-12, 150, 112, "aw", 6) + awning(298, 140, 116, "aw2", 6);
    // Paper lanterns on a string.
    body += `<path d="M-10 26 Q100 58 200 40 Q300 22 410 50" stroke="${p.light}" stroke-opacity=".35" fill="none"/>`;
    for (const [lx, ly, s] of [[40, 40, 1], [96, 50, 0.8], [306, 32, 0.85], [362, 42, 1.05]]) {
      body += `<circle cx="${lx}" cy="${ly + 14 * s}" r="${24 * s}" fill="url(#lan)" opacity=".7"/><rect x="${f(lx - 8 * s)}" y="${f(ly + 4 * s)}" width="${f(16 * s)}" height="${f(20 * s)}" rx="${f(7 * s)}" fill="${p.extra || p.light}"/><path d="M${f(lx - 8 * s)} ${f(ly + 14 * s)} h${f(16 * s)}" stroke="${p.mid}" stroke-width="1"/>`;
    }
    // Neon signs: double tube with glow, abstract glyphs (no words).
    const tube = (d, c, w = 2.4) => `<path d="${d}" stroke="${c}" stroke-width="${w * 3.6}" fill="none" opacity=".4" filter="url(#b10)" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" stroke="${c}" stroke-width="${w}" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" stroke="#ffffff" stroke-width="${f(w * 0.35)}" fill="none" opacity=".85" stroke-linecap="round" stroke-linejoin="round"/>`;
    body += tube("M22 84 h70 a12 12 0 0 1 0 24 h-70 a12 12 0 0 1 0 -24z", p.mid) + tube("M36 96 h12 M56 96 l6 -6 l6 12 l6 -6 h8", p.light, 1.8);
    body += tube("M318 76 l18 -26 l18 26 z", p.accent) + tube("M336 60 v10", p.light, 1.6);
    body += tube("M336 112 a16 16 0 1 1 0.1 0", p.light, 2.2) + tube("M318 196 q18 -18 36 0 q18 18 36 0", p.accent, 2);
    // Wet street, mirrored glow.
    body += `<rect y="222" width="${W}" height="78" fill="url(#wet)"/>`;
    body += `<rect x="20" y="232" width="80" height="44" fill="${p.mid}" opacity=".4" filter="url(#b10)"/><rect x="306" y="230" width="70" height="56" fill="${p.accent}" opacity=".35" filter="url(#b10)"/><rect x="326" y="244" width="22" height="40" fill="${p.light}" opacity=".22" filter="url(#b10)"/>`;
    for (let i = 0; i < 16; i++) body += `<rect x="${f(R() * 400)}" y="${f(232 + R() * 62)}" width="${f(16 + R() * 44)}" height="1.4" fill="${[p.mid, p.accent, p.light][i % 3]}" opacity=".55"/>`;
    return { defs, body };
  },

  wheat(p, R) {
    const defs =
      lin("s", [[0, mix(p.dark, p.mid, 0.4)], [0.55, p.mid], [0.85, p.accent], [1, p.light]]) +
      rad("sun", [[0, p.light], [0.4, p.light, 0.9], [1, p.accent, 0]]) +
      lin("f1", [[0, mix(p.accent, p.mid, 0.4)], [1, p.dark]]) +
      lin("st", [[0, p.light], [1, p.accent]]) + blur("b12", 12);
    let body = `<rect width="${W}" height="${H}" fill="url(#s)"/>`;
    body += `<circle cx="96" cy="176" r="90" fill="url(#sun)" opacity=".85"/>`;
    for (let i = 0; i < 10; i++) {
      const a = (-160 + i * 16) * (Math.PI / 180);
      body += `<path d="M96 176 L${f(96 + Math.cos(a - 0.04) * 420)} ${f(176 + Math.sin(a - 0.04) * 420)} L${f(96 + Math.cos(a + 0.04) * 420)} ${f(176 + Math.sin(a + 0.04) * 420)}Z" fill="${p.light}" opacity=".07"/>`;
    }
    body += `<path d="${ridge(196, 8, 1.3, 0.2, R)}" fill="${mix(p.mid, p.dark, 0.25)}"/>`;
    body += `<path d="${ridge(222, 10, 1.1, 1.4, R)}" fill="url(#f1)"/>`;
    // Wheat stalks in front.
    const stalk = (x, h, lean, s = 1) => {
      const tx = x + lean;
      const ty = 300 - h;
      let g = `<path d="M${x} 300 Q${f(x + lean * 0.2)} ${f(300 - h * 0.6)} ${f(tx)} ${f(ty)}" stroke="url(#st)" stroke-width="${f(1.6 * s)}" fill="none"/>`;
      for (let k = 0; k < 6; k++) {
        const yy = ty + k * 7 * s;
        const xx = tx - (lean / h) * k * 7 * s;
        g += `<ellipse cx="${f(xx - 3 * s)}" cy="${f(yy)}" rx="${f(2.2 * s)}" ry="${f(5 * s)}" transform="rotate(-28 ${f(xx - 3 * s)} ${f(yy)})" fill="url(#st)"/><ellipse cx="${f(xx + 3 * s)}" cy="${f(yy)}" rx="${f(2.2 * s)}" ry="${f(5 * s)}" transform="rotate(28 ${f(xx + 3 * s)} ${f(yy)})" fill="url(#st)"/>`;
      }
      return g;
    };
    for (let i = 0; i < 9; i++) body += stalk(250 + i * 20 + R() * 10, 70 + R() * 50, 10 + R() * 16, 0.9 + R() * 0.4);
    for (let i = 0; i < 5; i++) body += stalk(-6 + i * 18 + R() * 8, 50 + R() * 40, 8 + R() * 10, 0.8);
    body += starField(R, 18, { colors: [p.light], maxR: 1.3, yMax: 240 });
    return { defs, body };
  },

  nebula(p, R) {
    const defs = lin("s", [[0, p.dark], [1, mix(p.dark, p.mid, 0.3)]], 0, 0, 1, 1) + blur("b24", 24) + blur("b10", 10) + blur("gl", 1.2);
    let body = `<rect width="${W}" height="${H}" fill="url(#s)"/>`;
    const blobs = [
      [310, 70, 130, 70, p.mid, 0.75],
      [80, 240, 150, 70, p.mid, 0.6],
      [340, 230, 90, 60, p.accent, 0.45],
      [60, 60, 90, 50, p.accent, 0.35],
      [250, 120, 70, 40, p.light, 0.18],
    ];
    for (const [x, y, rx, ry, c, o] of blobs) body += `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${c}" opacity="${o}" filter="url(#b24)"/>`;
    // Dust spiral arms.
    for (let k = 0; k < 2; k++) {
      let d = "";
      for (let i = 0; i <= 40; i++) {
        const t = i / 40;
        const a = t * Math.PI * 2.2 + k * Math.PI;
        const r = 20 + t * 220;
        d += `${i ? " L" : "M"}${f(200 + Math.cos(a) * r)} ${f(150 + Math.sin(a) * r * 0.55)}`;
      }
      body += `<path d="${d}" stroke="${p.light}" stroke-width="10" fill="none" opacity=".08" filter="url(#b10)"/>`;
    }
    body += `<circle cx="318" cy="76" r="34" fill="${p.light}" opacity=".35" filter="url(#b10)"/><circle cx="318" cy="76" r="10" fill="#ffffff" opacity=".85" filter="url(#b10)"/>`;
    body += `<ellipse cx="96" cy="236" rx="60" ry="26" fill="${p.light}" opacity=".18" filter="url(#b10)" transform="rotate(-18 96 236)"/>`;
    body += starField(R, 90, { colors: ["#ffffff", p.light, p.accent], maxR: 1.2 });
    for (let i = 0; i < 5; i++) body += sparkle(R() * 400, R() * 300, 3 + R() * 4, p.light, 0.85);
    body += sparkle(318, 76, 14, "#ffffff", 0.9);
    return { defs, body };
  },

  coral(p, R) {
    const defs =
      lin("s", [[0, mix(p.dark, p.extra || p.mid, 0.25)], [1, p.dark]]) +
      lin("cr", [[0, p.light], [1, p.mid]]) +
      lin("cr2", [[0, mix(p.extra || p.accent, "#ffffff", 0.2)], [1, p.extra || p.accent]]) +
      lin("ray", [[0, p.light, 0.3], [1, p.light, 0]]) + blur("b8", 8) + blur("gl", 1.4);
    let body = `<rect width="${W}" height="${H}" fill="url(#s)"/>`;
    for (let i = 0; i < 5; i++) body += `<path d="M${60 + i * 70} -10 L${30 + i * 80} 300 L${70 + i * 80} 300 L${90 + i * 70} -10Z" fill="url(#ray)" opacity=".22" filter="url(#b8)"/>`;
    const branch = (x, y, len, ang, w, depth, grad) => {
      if (depth === 0 || len < 6) return "";
      const x2 = x + Math.cos(ang) * len;
      const y2 = y + Math.sin(ang) * len;
      let o = `<path d="M${f(x)} ${f(y)} Q${f((x + x2) / 2 + (R() - 0.5) * 10)} ${f((y + y2) / 2)} ${f(x2)} ${f(y2)}" stroke="url(#${grad})" stroke-width="${f(w)}" stroke-linecap="round" fill="none"/>`;
      o += branch(x2, y2, len * 0.72, ang - 0.45 - R() * 0.2, w * 0.72, depth - 1, grad);
      o += branch(x2, y2, len * 0.7, ang + 0.4 + R() * 0.2, w * 0.7, depth - 1, grad);
      if (depth <= 2) o += `<circle cx="${f(x2)}" cy="${f(y2)}" r="${f(w * 0.7)}" fill="${p.light}" opacity=".9"/>`;
      return o;
    };
    body += branch(40, 310, 60, -1.45, 9, 5, "cr") + branch(360, 310, 54, -1.7, 8, 5, "cr2") + branch(300, 310, 30, -1.3, 5, 4, "cr");
    // Anemones.
    for (let i = 0; i < 3; i++) {
      const x = [120, 250, 395][i];
      let a = "";
      for (let k = 0; k < 9; k++) a += `<path d="M${x} 300 Q${f(x + (k - 4) * 4)} 280 ${f(x + (k - 4) * 6)} ${f(268 + R() * 6)}" stroke="${p.accent}" stroke-width="2" fill="none" stroke-linecap="round" opacity=".85"/>`;
      body += a;
    }
    body += starField(R, 26, { colors: [p.light, p.accent], maxR: 1.6, minR: 0.5, glow: true });
    return { defs, body };
  },

  aurora(p, R) {
    const defs =
      lin("s", [[0, p.dark], [0.7, mix(p.dark, p.mid, 0.2)], [1, p.dark]]) +
      lin("cu", [[0, p.extra || p.light, 0], [0.4, p.light, 0.55], [1, p.mid, 0]]) +
      lin("cu2", [[0, p.accent, 0], [0.5, p.accent, 0.5], [1, p.accent, 0]]) +
      lin("mt", [[0, mix(p.dark, "#000000", 0.1)], [1, "#000000"]]) + blur("b6", 6) + blur("b14", 14);
    let body = `<rect width="${W}" height="${H}" fill="url(#s)"/>`;
    body += starField(R, 60, { colors: ["#ffffff", p.light], maxR: 1.1, yMax: 200 });
    // Curtains: vertical strips following a sine path.
    for (let band = 0; band < 2; band++) {
      let o = "";
      for (let i = 0; i < 40; i++) {
        const x = i * 11 - 10;
        const y = 50 + band * 26 + Math.sin(i * 0.32 + band * 1.6) * 26;
        const h = 70 + Math.sin(i * 0.5 + band) * 26;
        o += `<rect x="${f(x)}" y="${f(y)}" width="12" height="${f(h)}" fill="url(#${band ? "cu2" : "cu"})"/>`;
      }
      body += `<g filter="url(#b6)" opacity="${band ? 0.65 : 0.9}">${o}</g>`;
    }
    body += `<path d="${ridge(210, 22, 2.6, 0.6, R, { jitter: 0.8 })}" fill="url(#mt)"/>`;
    body += `<rect y="250" width="${W}" height="50" fill="${p.dark}"/><rect y="252" width="${W}" height="30" fill="${p.light}" opacity=".12" filter="url(#b14)"/>`;
    for (let i = 0; i < 6; i++) body += `<rect x="${f(R() * 380)}" y="${f(258 + i * 6)}" width="${f(30 + R() * 50)}" height="1.2" fill="${p.light}" opacity=".35"/>`;
    return { defs, body };
  },

  forest(p, R) {
    const defs =
      lin("s", [[0, mix(p.dark, p.mid, 0.4)], [1, p.dark]]) +
      rad("moon", [[0, p.light], [0.5, p.light, 0.3], [1, p.light, 0]]) + blur("b12", 12) + blur("gl", 1.8);
    let body = `<rect width="${W}" height="${H}" fill="url(#s)"/>`;
    body += `<circle cx="300" cy="60" r="60" fill="url(#moon)"/><circle cx="300" cy="60" r="16" fill="${p.light}"/>`;
    const tree = (x, base, h, w, c) => {
      let d = "";
      for (let k = 0; k < 4; k++) {
        const ty = base - h + k * (h / 5);
        const ww = w * (0.45 + k * 0.2);
        d += `M${f(x)} ${f(ty)} L${f(x - ww)} ${f(ty + h * 0.32)} L${f(x + ww)} ${f(ty + h * 0.32)}Z `;
      }
      return `<path d="${d}" fill="${c}"/><rect x="${f(x - w * 0.06)}" y="${f(base - h * 0.1)}" width="${f(w * 0.12)}" height="${f(h * 0.12)}" fill="${c}"/>`;
    };
    const layers = [
      [170, 70, 22, mix(p.mid, p.dark, 0.45), 14],
      [210, 100, 30, mix(p.mid, p.dark, 0.7), 10],
      [262, 140, 42, mix(p.dark, "#000000", 0.35), 7],
    ];
    layers.forEach(([base, h, w, c, n], li) => {
      for (let i = 0; i < n; i++) {
        const x = (i / (n - 1)) * 440 - 20 + (R() - 0.5) * 20;
        if (li === 2 && x > 110 && x < 290) continue; // keep the middle open
        body += tree(x, base + R() * 10, h * (0.8 + R() * 0.4), w, c);
      }
      if (li < 2) body += `<rect y="${base - 10}" width="${W}" height="30" fill="${p.light}" opacity=".08" filter="url(#b12)"/>`;
    });
    body += `<rect y="262" width="${W}" height="40" fill="${mix(p.dark, "#000000", 0.35)}"/>`;
    for (let i = 0; i < 18; i++) {
      const x = R() * 400;
      const y = 120 + R() * 170;
      body += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(1 + R() * 1.4)}" fill="${p.light}" filter="url(#gl)"/><circle cx="${f(x)}" cy="${f(y)}" r="6" fill="${p.accent}" opacity=".18"/>`;
    }
    return { defs, body };
  },

  hourglass(p, R) {
    const defs =
      lin("s", [[0, p.dark], [0.6, mix(p.dark, p.mid, 0.5)], [1, p.mid]]) +
      rad("sun", [[0, p.extra || p.light], [0.5, p.light, 0.5], [1, p.light, 0]]) +
      lin("sd", [[0, p.light], [1, p.accent]]) + blur("b8", 8);
    let body = `<rect width="${W}" height="${H}" fill="url(#s)"/>`;
    body += `<circle cx="80" cy="70" r="70" fill="url(#sun)" opacity=".7"/><circle cx="80" cy="70" r="22" fill="${p.extra || p.light}" opacity=".9"/>`;
    // Ripple field.
    for (let i = 0; i < 14; i++) {
      const y = 170 + i * 10;
      body += `<path d="${waveLine(y, 4 + i * 0.4, 2.6 + i * 0.1, i * 0.7)}" stroke="${i % 2 ? p.light : p.accent}" stroke-width="${f(1 + i * 0.12)}" fill="none" opacity="${f(0.16 + i * 0.03)}"/>`;
    }
    // Falling sand streams from the upper right.
    for (let i = 0; i < 3; i++) {
      const x = 300 + i * 26;
      body += `<path d="M${x} -10 Q${x + 4} 90 ${x - 6} 180" stroke="${p.light}" stroke-width="${6 - i * 1.4}" fill="none" opacity=".18" filter="url(#b8)"/><path d="M${x} -10 Q${x + 4} 90 ${x - 6} 180" stroke="url(#sd)" stroke-width="${2.6 - i * 0.5}" fill="none" stroke-dasharray="1 3" stroke-linecap="round"/>`;
      body += `<ellipse cx="${x - 6}" cy="186" rx="${18 - i * 4}" ry="5" fill="${p.light}" opacity=".35" filter="url(#b8)"/>`;
    }
    // Ivory hourglass glyph, top left, quiet.
    body += `<g transform="translate(350 200)" opacity=".85"><rect x="-16" y="-34" width="32" height="5" rx="2" fill="${p.light}"/><rect x="-16" y="29" width="32" height="5" rx="2" fill="${p.light}"/><path d="M-12 -29 h24 c0 14 -10 20 -11 29 c1 9 11 15 11 29 h-24 c0 -14 10 -20 11 -29 c-1 -9 -11 -15 -11 -29z" fill="${rgba(p.light, 0.12)}" stroke="${p.light}" stroke-width="1.6"/><path d="M-7 27 h14 c0 -6 -5 -9 -7 -12 c-2 3 -7 6 -7 12z" fill="${p.accent}"/></g>`;
    body += starField(R, 24, { colors: [p.light], maxR: 1, yMax: 160 });
    return { defs, body };
  },

  storm(p, R) {
    const defs =
      lin("s", [[0, p.dark], [1, mix(p.dark, p.mid, 0.5)]]) + blur("b14", 14) + blur("b4", 4) + blur("gl", 1.4);
    let body = `<rect width="${W}" height="${H}" fill="url(#s)"/>`;
    const cloud = (x, y, s, c, o) => {
      let g = "";
      for (let k = 0; k < 6; k++) g += `<circle cx="${f(x + (k - 2.5) * 22 * s)}" cy="${f(y + Math.sin(k) * 6 * s)}" r="${f((26 + (k % 3) * 8) * s)}" fill="${c}" opacity="${o}"/>`;
      return `<g filter="url(#b14)">${g}</g>`;
    };
    body += cloud(90, 40, 1.4, p.mid, 0.85) + cloud(320, 30, 1.6, p.mid, 0.9) + cloud(220, 70, 1.1, mix(p.mid, p.dark, 0.4), 0.8);
    body += `<ellipse cx="330" cy="60" rx="70" ry="30" fill="${p.accent}" opacity=".35" filter="url(#b14)"/>`;
    const bolt = "M338 60 L318 118 L334 118 L310 186 L352 104 L334 104 L352 60Z";
    body += `<path d="${bolt}" fill="${p.accent}" opacity=".6" filter="url(#b4)"/><path d="${bolt}" fill="${p.light}"/>`;
    body += `<path d="M60 64 L52 92 L60 92 L48 124" stroke="${p.light}" stroke-width="1.6" fill="none" opacity=".55" filter="url(#gl)"/>`;
    for (let i = 0; i < 70; i++) {
      const x = R() * 420 - 10;
      const y = 90 + R() * 210;
      body += `<path d="M${f(x)} ${f(y)} l-4 12" stroke="${p.light}" stroke-width=".8" opacity="${f(0.15 + R() * 0.3)}"/>`;
    }
    body += `<rect y="270" width="${W}" height="30" fill="${p.accent}" opacity=".08" filter="url(#b14)"/>`;
    return { defs, body };
  },

  lava(p, R) {
    const defs =
      lin("s", [[0, p.dark], [1, mix(p.dark, p.mid, 0.4)]]) +
      lin("rk", [[0, mix(p.dark, "#2a1a1a", 0.4)], [1, p.dark]], 0, 0, 1, 1) + blur("b5", 5) + blur("b16", 16);
    let body = `<rect width="${W}" height="${H}" fill="url(#s)"/>`;
    body += `<rect width="${W}" height="${H}" fill="${p.accent}" opacity=".12"/>`;
    // Voronoi-like plates on a jittered grid; the cracks between glow.
    const cols = 6;
    const rows = 5;
    const pts = [];
    for (let r = 0; r <= rows; r++) {
      pts[r] = [];
      for (let c = 0; c <= cols; c++) {
        const edge = r === 0 || c === 0 || r === rows || c === cols;
        pts[r][c] = [c * (W / cols) + (edge ? 0 : (R() - 0.5) * 44), r * (H / rows) + (edge ? 0 : (R() - 0.5) * 36)];
      }
    }
    let cracks = "";
    let plates = "";
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const q = [pts[r][c], pts[r][c + 1], pts[r + 1][c + 1], pts[r + 1][c]];
        const cx = (q[0][0] + q[2][0]) / 2;
        const cy = (q[0][1] + q[2][1]) / 2;
        const shrink = (pt) => [cx + (pt[0] - cx) * 0.9, cy + (pt[1] - cy) * 0.88];
        const s = q.map(shrink);
        const inCenter = cx > 120 && cx < 280 && cy > 70 && cy < 230;
        plates += `<path d="M${s.map((v) => `${f(v[0])} ${f(v[1])}`).join(" L")}Z" fill="url(#rk)" opacity="${inCenter ? 0.7 : 1}"/>`;
        cracks += `<path d="M${q.map((v) => `${f(v[0])} ${f(v[1])}`).join(" L")}Z" stroke="${p.accent}" stroke-width="5" fill="none"/>`;
      }
    }
    body += `<g filter="url(#b5)" opacity=".9">${cracks}</g><g>${cracks.replace(/stroke-width="5"/g, 'stroke-width="1.6"').replaceAll(p.accent, p.light)}</g>${plates}`;
    body += `<ellipse cx="200" cy="300" rx="260" ry="60" fill="${p.light}" opacity=".18" filter="url(#b16)"/>`;
    return { defs, body };
  },

  pearl(p, R) {
    const defs =
      lin("s", [[0, mix(p.dark, p.mid, 0.55)], [0.55, mix(p.dark, p.mid, 0.25)], [1, p.dark]]) +
      lin("iri", [[0, p.accent, 0.5], [0.5, "#a8e6ff", 0.25], [1, p.light, 0.4]], 0, 0, 1, 1) +
      rad("pe", [[0, "#ffffff"], [0.3, p.light], [0.75, mix(p.light, p.accent, 0.45)], [1, mix(p.mid, p.accent, 0.4)]], 0.35, 0.3, 0.8) +
      lin("sh", [[0, mix(p.light, "#ffffff", 0.3)], [0.6, p.accent], [1, mix(p.accent, p.mid, 0.55)]]) +
      lin("shd", [[0, mix(p.accent, p.mid, 0.3)], [1, mix(p.mid, p.dark, 0.5)]]) + blur("b10", 10) + blur("b18", 18) + blur("gl", 1);
    let body = `<rect width="${W}" height="${H}" fill="url(#s)"/>`;
    body += `<ellipse cx="90" cy="40" rx="170" ry="80" fill="url(#iri)" filter="url(#b18)"/><ellipse cx="340" cy="150" rx="120" ry="60" fill="${p.accent}" opacity=".18" filter="url(#b18)"/>`;
    // Caustic shimmer lines.
    for (let i = 0; i < 6; i++) body += `<path d="${waveLine(30 + i * 22, 5, 2 + i * 0.5, i, -10, 410, 20)}" stroke="#ffffff" stroke-width=".8" fill="none" opacity="${f(0.1 + (i % 2) * 0.06)}"/>`;
    // Open scallop shell, lower right: ribbed fan with a lip.
    let shell = `<g transform="translate(332 296)">`;
    for (let k = 0; k < 11; k++) {
      const a = (-168 + k * 15.6) * (Math.PI / 180);
      const a1 = a - 0.068;
      const a2 = a + 0.068;
      shell += `<path d="M0 0 L${f(Math.cos(a1) * 118)} ${f(Math.sin(a1) * 118)} Q${f(Math.cos(a) * 132)} ${f(Math.sin(a) * 132)} ${f(Math.cos(a2) * 118)} ${f(Math.sin(a2) * 118)}Z" fill="url(#${k % 2 ? "sh" : "shd"})"/>`;
    }
    shell += `<path d="M-30 0 Q0 -26 30 0Z" fill="${mix(p.accent, p.mid, 0.4)}"/></g>`;
    body += shell;
    const pearl = (x, y, r) => `<circle cx="${x}" cy="${y}" r="${f(r * 1.8)}" fill="${p.light}" opacity=".22" filter="url(#b10)"/><circle cx="${x}" cy="${y}" r="${r}" fill="url(#pe)"/><ellipse cx="${f(x - r * 0.35)}" cy="${f(y - r * 0.42)}" rx="${f(r * 0.3)}" ry="${f(r * 0.17)}" fill="#ffffff" opacity=".95"/><circle cx="${f(x + r * 0.4)}" cy="${f(y + r * 0.45)}" r="${f(r * 0.12)}" fill="${p.accent}" opacity=".7"/>`;
    body += pearl(330, 238, 19) + pearl(56, 64, 11) + pearl(76, 82, 6) + pearl(372, 70, 8) + pearl(30, 238, 9) + pearl(48, 252, 5.5);
    // Foam lines and sand.
    body += `<path d="${ridge(272, 6, 1.4, 0.4, R)}" fill="${mix(p.light, p.mid, 0.6)}" opacity=".35"/>`;
    for (let i = 0; i < 4; i++) body += `<path d="${waveLine(258 + i * 9, 3.5, 3 + i, i * 1.3, -10, 250)}" stroke="#ffffff" stroke-width="${2 - i * 0.35}" fill="none" opacity="${f(0.55 - i * 0.1)}" stroke-linecap="round"/>`;
    body += starField(R, 26, { colors: ["#ffffff", p.accent], maxR: 1.1 });
    return { defs, body };
  },

  stardust(p, R) {
    const defs =
      lin("s", [[0, p.dark], [1, mix(p.dark, p.mid, 0.4)]], 0, 0, 1, 1) +
      lin("band", [[0, p.mid, 0], [0.5, p.light, 0.5], [1, p.mid, 0]], 0, 0, 1, 0) + blur("b16", 16) + blur("b5", 5) + blur("gl", 1.2);
    let body = `<rect width="${W}" height="${H}" fill="url(#s)"/>`;
    body += `<g transform="rotate(-24 200 150)"><ellipse cx="200" cy="150" rx="320" ry="44" fill="url(#band)" filter="url(#b16)"/><ellipse cx="200" cy="150" rx="260" ry="14" fill="${p.accent}" opacity=".25" filter="url(#b5)"/></g>`;
    // Dense dust along the band.
    for (let i = 0; i < 160; i++) {
      const t = R() * 2 - 1;
      const off = (R() - 0.5) * 70 * (1 - Math.abs(t) * 0.5);
      const x = 200 + t * 300;
      const y = 150 + off;
      const a = (-24 * Math.PI) / 180;
      const rx = 200 + (x - 200) * Math.cos(a) - (y - 150) * Math.sin(a);
      const ry = 150 + (x - 200) * Math.sin(a) + (y - 150) * Math.cos(a);
      body += `<circle cx="${f(rx)}" cy="${f(ry)}" r="${f(0.3 + R() * 0.9)}" fill="${R() > 0.7 ? p.accent : p.light}" opacity="${f(0.4 + R() * 0.6)}"/>`;
    }
    body += starField(R, 40, { colors: ["#ffffff"], maxR: 1 });
    body += sparkle(338, 54, 9, p.extra || p.light) + sparkle(52, 236, 7, p.extra || p.light, 0.9) + sparkle(370, 250, 5, p.light, 0.8) + sparkle(70, 50, 4, p.light, 0.8);
    return { defs, body };
  },

  // ---------- single-item scenes ----------
  ebru(p, R) {
    const defs = lin("s", [[0, p.dark], [1, mix(p.dark, p.mid, 0.25)]]) + blur("b2", 0.6);
    let body = `<rect width="${W}" height="${H}" fill="url(#s)"/>`;
    // Combed background bands (tarakli ebru).
    for (let i = 0; i < 18; i++) {
      const y = i * 18 - 6;
      body += `<path d="${waveLine(y, 7, 3.2, i * 0.6, -10, 410, 32)}" stroke="${[p.mid, p.accent, p.light][i % 3]}" stroke-width="7" fill="none" opacity=".28" stroke-linecap="round"/>`;
    }
    // Battal drops: concentric irregular rings.
    const drop = (x, y, r, cols) => {
      let o = "";
      for (let k = 0; k < cols.length; k++) {
        const rr = r * (1 - k / cols.length);
        let d = "";
        for (let i = 0; i <= 28; i++) {
          const a = (i / 28) * Math.PI * 2;
          const w = rr * (1 + Math.sin(a * 3 + k) * 0.06 + Math.sin(a * 5 + x) * 0.04);
          d += `${i ? " L" : "M"}${f(x + Math.cos(a) * w)} ${f(y + Math.sin(a) * w * 0.92)}`;
        }
        o += `<path d="${d}Z" fill="${cols[k]}"/>`;
      }
      return `<g filter="url(#b2)">${o}</g>`;
    };
    const c = [p.light, p.accent, p.mid, p.dark];
    body += drop(52, 60, 58, [c[2], c[1], c[0], c[1], c[3]]);
    body += drop(352, 238, 64, [c[1], c[0], c[2], c[0], c[1], c[3]]);
    body += drop(366, 52, 34, [c[0], c[2], c[1], c[3]]);
    body += drop(44, 258, 40, [c[0], c[1], c[2], c[0]]);
    // Comb pull through the drops (thin curved strokes).
    for (let i = 0; i < 6; i++) body += `<path d="M${-10 + i * 6} ${40 + i * 44} C120 ${20 + i * 44} 280 ${70 + i * 44} 410 ${30 + i * 44}" stroke="${p.dark}" stroke-width="1.2" fill="none" opacity=".45"/>`;
    return { defs, body };
  },

  cini(p, R) {
    const T = 66;
    const star = (cx, cy, r1, r2, n) => {
      let d = "";
      for (let i = 0; i < n * 2; i++) {
        const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
        const r = i % 2 ? r2 : r1;
        d += `${i ? " L" : "M"}${f(cx + Math.cos(a) * r)} ${f(cy + Math.sin(a) * r)}`;
      }
      return d + "Z";
    };
    const tulip = (x, y, s, c) =>
      `<g transform="translate(${x} ${y}) scale(${s})"><path d="M0 8 C-7 4 -8 -4 -6 -9 C-3 -5 -2 -6 0 -10 C2 -6 3 -5 6 -9 C8 -4 7 4 0 8Z" fill="${c}"/><path d="M0 8 L0 16" stroke="${p.light}" stroke-width="1.2"/></g>`;
    const tile =
      `<rect width="${T}" height="${T}" fill="${p.dark}"/>` +
      `<path d="${star(T / 2, T / 2, 26, 15, 8)}" fill="${p.mid}" stroke="${p.light}" stroke-width="1.4"/>` +
      `<path d="${star(T / 2, T / 2, 15, 9, 8)}" fill="${p.dark}" stroke="${p.accent}" stroke-width="1"/>` +
      tulip(T / 2, T / 2 - 1, 0.95, p.extra || p.accent) +
      `<path d="M0 0 L10 0 L0 10Z M${T} 0 L${T - 10} 0 L${T} 10Z M0 ${T} L10 ${T} L0 ${T - 10}Z M${T} ${T} L${T - 10} ${T} L${T} ${T - 10}Z" fill="${p.accent}"/>` +
      `<rect width="${T}" height="${T}" fill="none" stroke="${p.light}" stroke-opacity=".35"/>`;
    const defs =
      `<pattern id="pt" width="${T}" height="${T}" patternUnits="userSpaceOnUse" x="${(200 - T / 2) % T}" y="${(150 - T / 2) % T}">${tile}</pattern>` +
      rad("dim", [[0, p.dark, 0.9], [0.45, p.dark, 0.7], [1, p.dark, 0.05]], 0.5, 0.48, 0.62) +
      lin("gloss", [[0, "#ffffff", 0.16], [0.4, "#ffffff", 0], [1, "#ffffff", 0.05]], 0, 0, 1, 1);
    let body = `<rect width="${W}" height="${H}" fill="url(#pt)"/><rect width="${W}" height="${H}" fill="url(#dim)"/><rect width="${W}" height="${H}" fill="url(#gloss)"/>`;
    void R;
    return { defs, body };
  },

  kilim(p, R) {
    const defs = lin("s", [[0, p.dark], [1, mix(p.dark, "#000000", 0.25)]]) + rad("dim", [[0, "#000", 0.7], [0.5, "#000", 0.45], [1, "#000", 0]], 0.5, 0.48, 0.58);
    let body = `<rect width="${W}" height="${H}" fill="url(#s)"/>`;
    const bands = [
      [0, 26, p.mid],
      [26, 8, p.light],
      [34, 44, p.accent],
      [78, 8, p.light],
      [222, 8, p.light],
      [230, 44, p.accent],
      [274, 8, p.light],
      [282, 26, p.mid],
    ];
    for (const [y, h, c] of bands) body += `<rect y="${y}" width="${W}" height="${h}" fill="${c}" opacity=".9"/>`;
    // Lozenge rows with hooks.
    const lozRow = (yc, size, c, inner) => {
      let o = "";
      for (let x = -size; x < W + size; x += size * 2.2) {
        o += `<path d="M${f(x)} ${f(yc - size)} L${f(x + size)} ${f(yc)} L${f(x)} ${f(yc + size)} L${f(x - size)} ${f(yc)}Z" fill="${c}"/>`;
        o += `<path d="M${f(x)} ${f(yc - size * 0.45)} L${f(x + size * 0.45)} ${f(yc)} L${f(x)} ${f(yc + size * 0.45)} L${f(x - size * 0.45)} ${f(yc)}Z" fill="${inner}"/>`;
        o += `<path d="M${f(x + size)} ${f(yc)} h${f(size * 0.35)} v${f(-size * 0.35)} M${f(x - size)} ${f(yc)} h${f(-size * 0.35)} v${f(size * 0.35)}" stroke="${c}" stroke-width="2.4" fill="none"/>`;
      }
      return o;
    };
    body += lozRow(56, 16, p.dark, p.light) + lozRow(252, 16, p.dark, p.light);
    body += lozRow(150, 40, mix(p.mid, p.dark, 0.3), p.accent);
    // Woven texture.
    for (let i = 0; i < 60; i++) body += `<rect y="${i * 5}" width="${W}" height="1" fill="#000" opacity=".12"/>`;
    body += `<rect width="${W}" height="${H}" fill="url(#dim)"/>`;
    void R;
    return { defs, body };
  },

  cappadocia(p, R) {
    const defs =
      lin("s", [[0, p.dark], [0.5, p.mid], [0.82, p.accent], [1, p.light]]) +
      lin("rk", [[0, mix(p.accent, p.dark, 0.35)], [1, mix(p.dark, "#000000", 0.3)]], 0, 0, 1, 1) +
      lin("rk2", [[0, mix(p.mid, p.dark, 0.5)], [1, p.dark]], 0, 0, 1, 1) + blur("b12", 12);
    let body = `<rect width="${W}" height="${H}" fill="url(#s)"/>`;
    body += starField(R, 20, { colors: ["#ffffff"], yMax: 90, maxR: 0.9 });
    body += `<ellipse cx="300" cy="240" rx="160" ry="40" fill="${p.light}" opacity=".35" filter="url(#b12)"/>`;
    const chimney = (x, base, h, w, fill) =>
      `<path d="M${f(x - w)} ${base} C${f(x - w * 0.9)} ${f(base - h * 0.5)} ${f(x - w * 0.45)} ${f(base - h * 0.9)} ${f(x)} ${f(base - h)} C${f(x + w * 0.45)} ${f(base - h * 0.9)} ${f(x + w * 0.9)} ${f(base - h * 0.5)} ${f(x + w)} ${base}Z" fill="${fill}"/><ellipse cx="${f(x)}" cy="${f(base - h)}" rx="${f(w * 0.55)}" ry="${f(w * 0.22)}" fill="${mix(p.dark, "#000000", 0.2)}"/>`;
    body += `<path d="${ridge(236, 10, 1.4, 0.4, R)}" fill="url(#rk2)"/>`;
    body += chimney(30, 270, 110, 26, "url(#rk)") + chimney(76, 274, 76, 20, "url(#rk)") + chimney(338, 270, 96, 24, "url(#rk)") + chimney(380, 276, 120, 22, "url(#rk)") + chimney(290, 280, 56, 18, "url(#rk2)");
    body += `<rect y="268" width="${W}" height="40" fill="${mix(p.dark, "#000000", 0.4)}"/>`;
    // Windows in the rock.
    body += `<rect x="26" y="210" width="6" height="9" rx="3" fill="${p.light}" opacity=".9"/><rect x="334" y="222" width="5" height="8" rx="2.5" fill="${p.light}" opacity=".9"/><rect x="378" y="200" width="5" height="8" rx="2.5" fill="${p.light}" opacity=".7"/>`;
    const balloon = (x, y, s, c1, c2) => {
      let g = `<g transform="translate(${x} ${y}) scale(${s})">`;
      g += `<path d="M0 -26 C16 -26 22 -12 18 0 C15 9 7 14 4 20 L-4 20 C-7 14 -15 9 -18 0 C-22 -12 -16 -26 0 -26Z" fill="${c1}"/>`;
      g += `<path d="M0 -26 C7 -26 9 -10 7 2 C6 10 3 15 2 20 L-2 20 C-3 15 -6 10 -7 2 C-9 -10 -7 -26 0 -26Z" fill="${c2}"/>`;
      g += `<path d="M-4 20 L-3 26 M4 20 L3 26" stroke="${p.dark}" stroke-width=".8"/><rect x="-3.5" y="26" width="7" height="5" rx="1" fill="${mix(p.dark, p.accent, 0.3)}"/>`;
      g += `<path d="M-10 -20 C-6 -25 6 -25 10 -20" stroke="#ffffff" stroke-opacity=".5" stroke-width="1.2" fill="none"/>`;
      return g + "</g>";
    };
    body += balloon(326, 70, 1.4, p.accent, p.light) + balloon(64, 104, 1, p.light, p.accent) + balloon(250, 40, 0.6, mix(p.accent, p.mid, 0.4), p.light) + balloon(130, 46, 0.45, p.light, p.mid) + balloon(370, 150, 0.5, p.light, p.accent);
    return { defs, body };
  },

  bosphorus(p, R) {
    const defs =
      lin("s", [[0, p.dark], [0.7, p.mid], [1, mix(p.mid, p.accent, 0.3)]]) +
      lin("w", [[0, mix(p.dark, p.mid, 0.5)], [1, p.dark]]) + blur("b10", 10) + blur("gl", 1.2);
    let body = `<rect width="${W}" height="${H}" fill="url(#s)"/>`;
    body += starField(R, 36, { colors: ["#ffffff", p.light], yMax: 110, maxR: 1 });
    body += `<circle cx="64" cy="48" r="13" fill="${p.light}"/><circle cx="70" cy="44" r="12" fill="${p.dark}" opacity=".9"/>`;
    // Hills with lights.
    body += `<path d="${ridge(170, 14, 1.4, 0.3, R)}" fill="${mix(p.dark, "#000000", 0.25)}"/>`;
    for (let i = 0; i < 60; i++) body += `<circle cx="${f(R() * 400)}" cy="${f(172 + R() * 30)}" r="${f(0.5 + R() * 0.8)}" fill="${R() > 0.6 ? p.accent : p.light}" opacity="${f(0.5 + R() * 0.5)}"/>`;
    // Suspension bridge.
    const deckY = 150;
    body += `<rect x="96" y="70" width="7" height="${deckY - 70 + 30}" fill="${mix(p.dark, "#000000", 0.4)}"/><rect x="300" y="70" width="7" height="${deckY - 70 + 30}" fill="${mix(p.dark, "#000000", 0.4)}"/>`;
    body += `<path d="M-10 120 Q50 ${deckY} 100 72 Q200 ${deckY + 4} 303 72 Q356 ${deckY} 410 120" stroke="${p.light}" stroke-width="1.6" fill="none" opacity=".8"/>`;
    for (let x = 0; x <= 400; x += 10) {
      const cableY = x < 100 ? 120 + ((x - (-10)) / 110) * -48 + Math.sin((x / 100) * Math.PI) * 14 : x < 303 ? 72 + Math.sin(((x - 100) / 203) * Math.PI) * 60 : 72 + ((x - 303) / 107) * 48;
      body += `<path d="M${x} ${f(cableY)} L${x} ${deckY}" stroke="${p.light}" stroke-width=".5" opacity=".35"/>`;
    }
    body += `<rect x="-10" y="${deckY}" width="420" height="5" fill="${mix(p.dark, "#000000", 0.3)}"/>`;
    for (let x = 4; x < 400; x += 12) body += `<circle cx="${x}" cy="${deckY - 1}" r="1.4" fill="${p.accent}" filter="url(#gl)"/>`;
    // Water + reflections.
    body += `<rect y="196" width="${W}" height="104" fill="url(#w)"/>`;
    for (let i = 0; i < 26; i++) {
      const x = R() * 400;
      body += `<rect x="${f(x)}" y="${f(204 + R() * 90)}" width="${f(4 + R() * 26)}" height="1.4" fill="${R() > 0.5 ? p.accent : p.light}" opacity="${f(0.25 + R() * 0.45)}"/>`;
    }
    body += `<rect x="96" y="200" width="8" height="90" fill="${p.light}" opacity=".12" filter="url(#b10)"/><rect x="300" y="200" width="8" height="90" fill="${p.light}" opacity=".12" filter="url(#b10)"/>`;
    return { defs, body };
  },

  ink(p, R) {
    const defs =
      lin("s", [[0, mix(p.dark, p.mid, 0.35)], [1, p.dark]]) +
      lin("m1", [[0, p.light, 0.5], [1, p.light, 0]]) +
      lin("m2", [[0, p.mid, 0.95], [1, p.mid, 0]]) +
      lin("m3", [[0, mix(p.dark, "#000000", 0.25)], [1, mix(p.dark, "#000000", 0.25), 0.3]]) + blur("b3", 3) + blur("b12", 12);
    let body = `<rect width="${W}" height="${H}" fill="url(#s)"/>`;
    body += `<circle cx="306" cy="70" r="24" fill="${p.accent}"/><circle cx="306" cy="70" r="44" fill="${p.accent}" opacity=".18" filter="url(#b12)"/>`;
    body += `<path d="${ridge(126, 34, 2.4, 0.6, R, { jitter: 1.2, steps: 22 })}" fill="url(#m1)" filter="url(#b3)"/>`;
    body += `<path d="${ridge(176, 26, 1.8, 2.2, R, { jitter: 1.4, steps: 22 })}" fill="url(#m2)" filter="url(#b3)"/>`;
    body += `<rect y="196" width="${W}" height="34" fill="${p.light}" opacity=".14" filter="url(#b12)"/>`;
    // Still water with a small boat (right) and its reflection.
    body += `<rect y="236" width="${W}" height="64" fill="${mix(p.dark, "#000000", 0.2)}"/>`;
    for (let i = 0; i < 5; i++) body += `<path d="M${f(20 + R() * 300)} ${f(246 + i * 10)} h${f(30 + R() * 60)}" stroke="${p.light}" stroke-width=".8" opacity=".25"/>`;
    body += `<path d="M300 236 Q330 246 362 236 L356 242 Q330 250 306 242Z" fill="${p.dark}"/><path d="M330 236 V206" stroke="${p.dark}" stroke-width="1.6"/><path d="M331 208 L348 232 L331 232Z" fill="${p.light}" opacity=".8"/>`;
    body += `<path d="M331 240 L346 262 L331 262Z" fill="${p.light}" opacity=".12"/>`;
    // Ink-brush birds.
    body += `<path d="M118 62 q6 -6 12 0 q6 -6 12 0 M150 50 q4 -4 8 0 q4 -4 8 0 M96 78 q3 -3 6 0 q3 -3 6 0" stroke="${p.dark}" stroke-width="1.6" fill="none" stroke-linecap="round"/>`;
    return { defs, body };
  },

  holo(p, R) {
    const defs = lin("s", [[0, p.dark], [1, mix(p.dark, p.mid, 0.3)]], 0, 0, 1, 1) + blur("b30", 30) + lin("sh", [[0, "#ffffff", 0], [0.5, "#ffffff", 0.35], [1, "#ffffff", 0]], 0, 0, 1, 1);
    let body = `<rect width="${W}" height="${H}" fill="url(#s)"/>`;
    const blobs = [[60, 50, p.mid], [340, 60, p.accent], [320, 260, p.light], [70, 250, p.extra || p.accent], [200, 0, p.light], [200, 300, p.mid]];
    for (const [x, y, c] of blobs) body += `<circle cx="${x}" cy="${y}" r="110" fill="${c}" opacity=".7" filter="url(#b30)"/>`;
    // Diffraction lines.
    for (let i = 0; i < 40; i++) body += `<path d="M${-60 + i * 14} 0 L${-160 + i * 14} 300" stroke="#ffffff" stroke-width=".7" opacity="${f(0.05 + (i % 4) * 0.03)}"/>`;
    body += `<path d="M-40 300 L120 -10 L190 -10 L30 300Z" fill="url(#sh)"/><path d="M260 300 L380 -10 L410 -10 L290 300Z" fill="url(#sh)" opacity=".7"/>`;
    // Fine grid.
    for (let i = 0; i < 20; i++) body += `<path d="M0 ${i * 15} H400" stroke="#ffffff" stroke-width=".4" opacity=".06"/>`;
    body += starField(R, 14, { colors: ["#ffffff"], maxR: 1.4 });
    return { defs, body };
  },

  clouds(p, R) {
    const defs =
      lin("s", [[0, p.dark], [0.55, p.mid], [0.85, p.accent], [1, p.light]]) +
      rad("sun", [[0, "#ffffff"], [0.25, p.light], [1, p.light, 0]]) +
      lin("cl", [[0, "#ffffff"], [1, mix(p.mid, "#ffffff", 0.4)]]) +
      lin("cl2", [[0, mix(p.light, "#ffffff", 0.5)], [1, mix(p.mid, p.dark, 0.2)]]) + blur("b3", 3);
    let body = `<rect width="${W}" height="${H}" fill="url(#s)"/>`;
    body += starField(R, 18, { colors: ["#ffffff"], yMax: 70, maxR: 0.8 });
    body += `<circle cx="200" cy="204" r="110" fill="url(#sun)" opacity=".9"/>`;
    const puff = (y, n, rMin, rMax, fill, op) => {
      let g = "";
      for (let i = 0; i < n; i++) {
        const x = (i / (n - 1)) * 440 - 20;
        const r = rMin + R() * (rMax - rMin);
        g += `<circle cx="${f(x)}" cy="${f(y + (R() - 0.5) * 10)}" r="${f(r)}" fill="${fill}"/>`;
      }
      return `<g opacity="${op}" filter="url(#b3)">${g}<rect x="-10" y="${y}" width="420" height="${H}" fill="${fill}"/></g>`;
    };
    body += puff(214, 9, 22, 34, "url(#cl2)", 0.8);
    body += puff(244, 11, 20, 30, "url(#cl)", 0.9);
    body += puff(276, 13, 16, 26, "url(#cl)", 1);
    body += `<rect y="0" width="${W}" height="${H}" fill="${p.dark}" opacity=".12"/>`;
    return { defs, body };
  },

  rainglass(p, R) {
    const defs = lin("s", [[0, p.dark], [1, mix(p.dark, p.mid, 0.3)]]) + blur("b14", 14) + rad("dr", [[0, "#ffffff", 0.05], [0.7, "#ffffff", 0.08], [0.92, "#ffffff", 0.5], [1, "#ffffff", 0.1]], 0.45, 0.4, 0.6);
    let body = `<rect width="${W}" height="${H}" fill="url(#s)"/>`;
    // City bokeh behind the glass.
    const cols = [p.mid, p.accent, p.light, p.extra || p.accent];
    for (let i = 0; i < 26; i++) body += `<circle cx="${f(R() * 400)}" cy="${f(R() * 300)}" r="${f(10 + R() * 26)}" fill="${cols[i % 4]}" opacity="${f(0.25 + R() * 0.35)}" filter="url(#b14)"/>`;
    // Drops with trails.
    for (let i = 0; i < 30; i++) {
      const x = R() * 400;
      const y = R() * 300;
      const r = 1.6 + R() * 4.4;
      if (i % 3 === 0) body += `<path d="M${f(x)} ${f(y - r)} L${f(x + (R() - 0.5) * 6)} ${f(y - r - 20 - R() * 40)}" stroke="#ffffff" stroke-width="${f(r * 0.5)}" opacity=".12" stroke-linecap="round"/>`;
      body += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="url(#dr)"/><circle cx="${f(x - r * 0.3)}" cy="${f(y - r * 0.35)}" r="${f(r * 0.25)}" fill="#ffffff" opacity=".85"/>`;
    }
    return { defs, body };
  },

  vinyl(p, R) {
    const defs =
      lin("s", [[0, mix(p.dark, p.mid, 0.25)], [1, p.dark]], 0, 0, 1, 1) +
      rad("disc", [[0, "#141418"], [0.9, "#0b0b0e"], [1, "#25252c"]]) +
      lin("refl", [[0, "#ffffff", 0], [0.5, "#ffffff", 0.22], [1, "#ffffff", 0]], 0, 0, 1, 1) +
      rad("lab", [[0, p.light], [1, p.accent]]) + blur("b12", 12);
    let body = `<rect width="${W}" height="${H}" fill="url(#s)"/>`;
    body += `<circle cx="352" cy="252" r="190" fill="${p.accent}" opacity=".18" filter="url(#b12)"/>`;
    body += `<g transform="translate(352 252)"><circle r="176" fill="url(#disc)"/>`;
    for (let r = 60; r < 172; r += 4) body += `<circle r="${r}" fill="none" stroke="#ffffff" stroke-width=".5" opacity="${r % 12 === 0 ? 0.12 : 0.05}"/>`;
    body += `<path d="M0 0 L-176 -40 A180 180 0 0 1 -150 -96Z" fill="url(#refl)"/><path d="M0 0 L120 120 A170 170 0 0 1 70 156Z" fill="url(#refl)" opacity=".6"/>`;
    body += `<circle r="54" fill="url(#lab)"/><circle r="40" fill="none" stroke="${p.dark}" stroke-opacity=".35"/><circle r="5" fill="${p.dark}"/></g>`;
    // Tone arm.
    body += `<path d="M150 20 L208 140 L196 150" stroke="#c9ccd6" stroke-width="5" fill="none" stroke-linecap="round"/><circle cx="150" cy="20" r="12" fill="#2a2c36" stroke="#c9ccd6" stroke-width="2"/><rect x="186" y="142" width="18" height="10" rx="2" transform="rotate(30 195 147)" fill="#e4e6ee"/>`;
    // Notes rising (quiet).
    body += `<path d="M40 70 v-24 l14 -4 v22" stroke="${p.light}" stroke-width="2" fill="none" opacity=".5"/><circle cx="37" cy="70" r="4" fill="${p.light}" opacity=".5"/><circle cx="51" cy="64" r="4" fill="${p.light}" opacity=".5"/>`;
    void R;
    return { defs, body };
  },

  equalizer(p, R) {
    const defs =
      lin("s", [[0, p.dark], [1, mix(p.dark, p.mid, 0.3)]]) +
      lin("bar", [[0, p.light], [0.5, p.accent], [1, p.mid]]) +
      lin("refl", [[0, p.mid, 0.4], [1, p.mid, 0]]) + blur("b8", 8);
    let body = `<rect width="${W}" height="${H}" fill="url(#s)"/>`;
    for (let i = 0; i < 9; i++) body += `<path d="M0 ${i * 30 + 15} H400" stroke="#ffffff" stroke-width=".5" opacity=".06"/>`;
    const n = 32;
    for (let i = 0; i < n; i++) {
      const x = 4 + i * (392 / n);
      const centerDip = Math.abs(i - n / 2) < 6 ? 0.45 : 1;
      const h = (30 + Math.abs(Math.sin(i * 0.55)) * 80 + R() * 40) * centerDip;
      const w = 392 / n - 4;
      body += `<rect x="${f(x)}" y="${f(220 - h)}" width="${f(w)}" height="${f(h)}" rx="2" fill="url(#bar)"/>`;
      body += `<rect x="${f(x)}" y="224" width="${f(w)}" height="${f(h * 0.45)}" rx="2" fill="url(#refl)"/>`;
      body += `<rect x="${f(x)}" y="${f(214 - h)}" width="${f(w)}" height="2.4" rx="1" fill="${p.light}" opacity=".9"/>`;
    }
    body += `<rect y="200" width="${W}" height="40" fill="${p.accent}" opacity=".18" filter="url(#b8)"/>`;
    return { defs, body };
  },

  prism(p, R) {
    const defs = lin("s", [[0, p.dark], [1, mix(p.dark, p.mid, 0.25)]], 0, 0, 1, 1) + blur("b4", 4) + blur("b10", 10) + lin("gl2", [[0, "#ffffff", 0.5], [1, "#ffffff", 0.08]], 0, 0, 1, 1);
    let body = `<rect width="${W}" height="${H}" fill="url(#s)"/>`;
    body += `<path d="M-10 74 L70 92 L70 98 L-10 82Z" fill="#ffffff" opacity=".8" filter="url(#b4)"/>`;
    const rainbow = ["#ff4d6d", "#ff9f43", "#ffe066", "#4cd97b", "#4dabf7", "#845ef7"];
    rainbow.forEach((c, i) => {
      body += `<path d="M96 100 L410 ${170 + i * 22} L410 ${190 + i * 22}Z" fill="${c}" opacity=".55" filter="url(#b4)"/>`;
    });
    body += `<path d="M96 100 L410 170 L410 302Z" fill="#ffffff" opacity=".06" filter="url(#b10)"/>`;
    body += `<path d="M70 40 L118 130 L22 130Z" fill="url(#gl2)" stroke="#ffffff" stroke-opacity=".7" stroke-width="1.2"/><path d="M70 40 L86 130 L118 130Z" fill="#ffffff" opacity=".12"/>`;
    body += starField(R, 30, { colors: [p.light, "#ffffff"], maxR: 1 });
    return { defs, body };
  },

  smoke(p, R) {
    const defs = lin("s", [[0, p.dark], [1, mix(p.dark, p.mid, 0.35)]]) + blur("b8", 8) + blur("b3", 2.2) + blur("b20", 20);
    let body = `<rect width="${W}" height="${H}" fill="url(#s)"/>`;
    body += `<ellipse cx="200" cy="320" rx="260" ry="80" fill="${p.accent}" opacity=".25" filter="url(#b20)"/>`;
    // Smooth rising plumes: a sine column that widens as it rises.
    const plume = (x0, sway, phase, c, wide) => {
      let d = "";
      for (let i = 0; i <= 30; i++) {
        const t = i / 30;
        const y = 310 - t * 330;
        const x = x0 + Math.sin(t * Math.PI * 2.4 + phase) * sway * (0.3 + t) + t * sway * 0.6;
        d += `${i ? " L" : "M"}${f(x)} ${f(y)}`;
      }
      return `<path d="${d}" stroke="${c}" stroke-width="${wide}" fill="none" opacity=".2" filter="url(#b8)" stroke-linecap="round"/><path d="${d}" stroke="${c}" stroke-width="${f(wide * 0.25)}" fill="none" opacity=".35" filter="url(#b3)" stroke-linecap="round"/><path d="${d}" stroke="#ffffff" stroke-width=".8" fill="none" opacity=".25" stroke-linecap="round"/>`;
    };
    const cols = [p.light, p.accent, p.mid];
    for (let i = 0; i < 4; i++) body += plume(18 + i * 26, 30 + R() * 20, R() * 6, cols[i % 3], 18 + R() * 10);
    for (let i = 0; i < 4; i++) body += plume(300 + i * 28, -(30 + R() * 20), R() * 6, cols[(i + 1) % 3], 18 + R() * 10);
    return { defs, body };
  },

  abyss(p, R) {
    const defs =
      lin("s", [[0, mix(p.mid, p.accent, 0.25)], [0.45, p.mid], [1, p.dark]]) +
      lin("ray", [[0, p.light, 0.55], [1, p.light, 0]]) + blur("b6", 6) + blur("gl", 1);
    let body = `<rect width="${W}" height="${H}" fill="url(#s)"/>`;
    for (let i = 0; i < 6; i++) {
      const x = 40 + i * 64 + R() * 20;
      body += `<path d="M${f(x)} -10 L${f(x + 20)} -10 L${f(x + 90)} 300 L${f(x + 30)} 300Z" fill="url(#ray)" opacity="${f(0.2 + R() * 0.2)}" filter="url(#b6)"/>`;
    }
    // Caustic net near the surface.
    let net = "";
    for (let i = 0; i < 14; i++) {
      const x = i * 32 - 10;
      net += `<path d="M${x} 0 C${x + 10} 14 ${x - 8} 24 ${x + 6} 40 C${x + 16} 50 ${x + 26} 30 ${x + 34} 40" stroke="${p.light}" stroke-width="1.2" fill="none"/>`;
    }
    body += `<g opacity=".4">${net}</g>`;
    // Jellyfish (soft, glowing) right.
    const jelly = (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})"><path d="M-16 0 C-16 -18 16 -18 16 0 C10 3 -10 3 -16 0Z" fill="${p.light}" opacity=".55"/><path d="M-10 2 q-3 14 2 28 M-3 2 q3 16 -1 32 M4 2 q-3 14 2 30 M11 2 q3 12 -1 24" stroke="${p.light}" stroke-width="1" fill="none" opacity=".45"/><circle r="22" fill="${p.accent}" opacity=".2" filter="url(#b6)"/></g>`;
    body += jelly(338, 190, 1.2) + jelly(58, 220, 0.8) + jelly(372, 96, 0.6);
    body += `<path d="${ridge(276, 10, 1.8, 0.3, R)}" fill="${mix(p.dark, "#000000", 0.4)}"/>`;
    for (let i = 0; i < 14; i++) {
      const x = R() * 400;
      const y = 60 + R() * 220;
      const r = 1.5 + R() * 3.5;
      body += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="none" stroke="${p.light}" stroke-width=".9" opacity=".6"/><circle cx="${f(x - r * 0.3)}" cy="${f(y - r * 0.3)}" r="${f(r * 0.25)}" fill="#ffffff" opacity=".8"/>`;
    }
    return { defs, body };
  },

  eclipse(p, R) {
    const defs =
      lin("s", [[0, p.dark], [1, mix(p.dark, p.mid, 0.25)]], 0, 0, 1, 1) +
      rad("cor", [[0.5, p.light, 0.95], [0.58, p.accent, 0.6], [1, p.accent, 0]]) + blur("b4", 4) + blur("b20", 20);
    let body = `<rect width="${W}" height="${H}" fill="url(#s)"/>`;
    body += starField(R, 80, { colors: ["#ffffff", p.light], maxR: 1.1 });
    const cx = 318;
    const cy = 86;
    body += `<circle cx="${cx}" cy="${cy}" r="120" fill="${p.mid}" opacity=".35" filter="url(#b20)"/>`;
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2 + R() * 0.1;
      const l = 70 + R() * 50;
      body += `<path d="M${f(cx + Math.cos(a) * 46)} ${f(cy + Math.sin(a) * 46)} L${f(cx + Math.cos(a) * l)} ${f(cy + Math.sin(a) * l)}" stroke="${p.light}" stroke-width="${f(1 + R() * 2)}" opacity=".35" filter="url(#b4)"/>`;
    }
    body += `<circle cx="${cx}" cy="${cy}" r="88" fill="url(#cor)"/>`;
    body += `<circle cx="${cx}" cy="${cy}" r="46" fill="#020205"/><circle cx="${cx}" cy="${cy}" r="46" fill="none" stroke="#ffffff" stroke-width="1.4" opacity=".9"/>`;
    body += `<circle cx="${cx - 34}" cy="${cy + 30}" r="4" fill="#ffffff" filter="url(#b4)"/><circle cx="${cx - 34}" cy="${cy + 30}" r="2" fill="#ffffff"/>`;
    return { defs, body };
  },

  tulips(p, R) {
    const defs =
      lin("s", [[0, p.dark], [0.7, mix(p.dark, p.mid, 0.6)], [1, p.mid]]) +
      lin("tp", [[0, mix(p.accent, "#ffffff", 0.3)], [1, p.accent]]) +
      lin("tp2", [[0, p.light], [1, mix(p.light, p.accent, 0.4)]]) +
      lin("lf", [[0, p.extra || "#4a9a5a"], [1, mix(p.extra || "#4a9a5a", "#000000", 0.5)]]) + blur("b12", 12);
    let body = `<rect width="${W}" height="${H}" fill="url(#s)"/>`;
    body += `<ellipse cx="200" cy="300" rx="240" ry="50" fill="${p.accent}" opacity=".2" filter="url(#b12)"/>`;
    body += starField(R, 24, { colors: ["#ffffff"], yMax: 120, maxR: 0.9 });
    const tulip = (x, y, s, g) => {
      let o = `<g transform="translate(${x} ${y}) scale(${s})">`;
      o += `<path d="M0 0 Q4 40 0 80" stroke="url(#lf)" stroke-width="3" fill="none"/>`;
      o += `<path d="M0 60 C-18 40 -22 20 -16 6 C-8 24 -4 40 0 60Z" fill="url(#lf)"/>`;
      o += `<path d="M-12 -2 C-14 -18 -10 -30 -6 -34 C-4 -26 -2 -24 0 -32 C2 -24 4 -26 6 -34 C10 -30 14 -18 12 -2 C8 6 -8 6 -12 -2Z" fill="url(#${g})"/>`;
      o += `<path d="M0 -32 C-3 -20 -3 -8 0 4" stroke="#ffffff" stroke-opacity=".25" fill="none"/>`;
      return o + "</g>";
    };
    const spots = [[28, 206, 1.7, "tp"], [76, 238, 1.25, "tp2"], [118, 262, 0.9, "tp"], [296, 256, 1.0, "tp2"], [346, 204, 1.6, "tp"], [392, 240, 1.2, "tp2"], [156, 284, 0.6, "tp2"], [258, 282, 0.65, "tp"], [210, 292, 0.45, "tp"]];
    for (const [x, y, s, g] of spots) body += tulip(x, y, s, g);
    return { defs, body };
  },

  honeycomb(p, R) {
    const defs = lin("s", [[0, p.dark], [1, mix(p.dark, p.mid, 0.3)]], 0, 0, 1, 1) + lin("cell", [[0, p.light, 0.5], [1, p.accent, 0.12]], 0, 0, 1, 1) + blur("b10", 10);
    let body = `<rect width="${W}" height="${H}" fill="url(#s)"/>`;
    const r = 24;
    const hx = r * Math.sqrt(3);
    for (let row = -1; row < 9; row++) {
      for (let col = -1; col < 11; col++) {
        const cx = col * hx + (row % 2 ? hx / 2 : 0);
        const cy = row * r * 1.5;
        const dist = Math.hypot((cx - 200) / 200, (cy - 150) / 150);
        let d = "";
        for (let k = 0; k < 6; k++) {
          const a = (Math.PI / 3) * k + Math.PI / 6;
          d += `${k ? " L" : "M"}${f(cx + Math.cos(a) * (r - 2.5))} ${f(cy + Math.sin(a) * (r - 2.5))}`;
        }
        const lit = R() < 0.18 && dist > 0.55;
        body += `<path d="${d}Z" fill="${lit ? "url(#cell)" : p.mid}" fill-opacity="${lit ? 1 : f(0.08 + dist * 0.18)}" stroke="${p.light}" stroke-opacity="${f(0.12 + dist * 0.3)}" stroke-width="1"/>`;
        if (lit) body += `<circle cx="${f(cx)}" cy="${f(cy)}" r="16" fill="${p.accent}" opacity=".25" filter="url(#b10)"/>`;
      }
    }
    return { defs, body };
  },

  papercut(p, R) {
    const defs =
      lin("s", [[0, p.dark], [0.7, p.mid], [1, mix(p.mid, p.light, 0.5)]]) +
      rad("sun", [[0, p.light], [0.5, p.light, 0.6], [1, p.light, 0]]) +
      `<filter id="ds" x="-10%" y="-30%" width="120%" height="160%"><feDropShadow dx="0" dy="-3" stdDeviation="4" flood-color="#000" flood-opacity=".45"/></filter>`;
    let body = `<rect width="${W}" height="${H}" fill="url(#s)"/>`;
    body += starField(R, 20, { colors: [p.light], yMax: 90, maxR: 0.9 });
    body += `<circle cx="300" cy="96" r="56" fill="url(#sun)"/><circle cx="300" cy="96" r="22" fill="${p.light}"/>`;
    const layers = 6;
    for (let i = 0; i < layers; i++) {
      const t = i / (layers - 1);
      const c = mix(mix(p.accent, p.light, 0.25), mix(p.dark, "#000000", 0.2), t);
      body += `<path d="${ridge(118 + i * 30, 16 - i, 1.6 + i * 0.25, i * 1.3, R, { jitter: 0.6 })}" fill="${c}" filter="url(#ds)"/>`;
    }
    return { defs, body };
  },

  candles(p, R) {
    const defs =
      rad("s", [[0, mix(p.mid, p.dark, 0.4)], [1, p.dark]], 0.5, 0.8, 0.9) +
      lin("wax", [[0, p.light], [1, mix(p.light, p.mid, 0.6)]], 0, 0, 1, 0) +
      rad("fl", [[0, "#ffffff"], [0.3, p.light], [1, p.accent, 0]]) + blur("b12", 12) + blur("b3", 3);
    let body = `<rect width="${W}" height="${H}" fill="url(#s)"/>`;
    for (let i = 0; i < 22; i++) body += `<circle cx="${f(R() * 400)}" cy="${f(R() * 200)}" r="${f(8 + R() * 22)}" fill="${R() > 0.5 ? p.accent : p.light}" opacity="${f(0.12 + R() * 0.25)}" filter="url(#b12)"/>`;
    const candle = (x, h, w) => {
      const top = 300 - h;
      return `<rect x="${f(x - w / 2)}" y="${f(top)}" width="${w}" height="${h}" rx="3" fill="url(#wax)"/><path d="M${f(x - w / 2)} ${f(top + 3)} q${f(w / 2)} 6 ${w} 0" stroke="#ffffff" stroke-opacity=".4" fill="none"/><path d="M${x} ${f(top)} v-6" stroke="${p.dark}" stroke-width="1.2"/><ellipse cx="${x}" cy="${f(top - 14)}" rx="${f(w * 0.9)}" ry="${f(w * 1.5)}" fill="url(#fl)" filter="url(#b3)"/><path d="M${x} ${f(top - 26)} C${f(x + 5)} ${f(top - 16)} ${f(x + 4)} ${f(top - 7)} ${x} ${f(top - 6)} C${f(x - 4)} ${f(top - 7)} ${f(x - 5)} ${f(top - 16)} ${x} ${f(top - 26)}Z" fill="${p.light}"/><circle cx="${x}" cy="${f(top - 12)}" r="40" fill="${p.accent}" opacity=".15" filter="url(#b12)"/>`;
    };
    body += candle(34, 90, 20) + candle(66, 60, 16) + candle(338, 100, 22) + candle(372, 66, 16) + candle(304, 46, 12);
    return { defs, body };
  },

  pastel(p, R) {
    const defs =
      lin("s", [[0, p.mid], [0.6, p.accent], [1, p.light]]) +
      rad("sun", [[0, "#ffffff"], [0.4, p.light], [1, p.light, 0]]) + blur("b10", 10);
    let body = `<rect width="${W}" height="${H}" fill="url(#s)"/>`;
    body += `<circle cx="96" cy="160" r="60" fill="url(#sun)"/><circle cx="96" cy="160" r="22" fill="#ffffff" opacity=".9"/>`;
    const tones = [mix(p.mid, p.accent, 0.3), mix(p.mid, p.dark, 0.25), mix(p.mid, p.dark, 0.5), mix(p.dark, "#000000", 0.1)];
    tones.forEach((c, i) => {
      body += `<path d="${ridge(150 + i * 34, 22 - i * 3, 1.4 + i * 0.4, i * 1.9, R, { jitter: 0.5 })}" fill="${c}"/>`;
      if (i < 3) body += `<rect y="${168 + i * 34}" width="${W}" height="18" fill="#ffffff" opacity=".1" filter="url(#b10)"/>`;
    });
    body += `<path d="M260 70 q8 -6 16 0 q8 -6 16 0" stroke="${p.dark}" stroke-width="1.6" fill="none" opacity=".6"/>`;
    return { defs, body };
  },

  skyline(p, R) {
    const defs =
      lin("s", [[0, p.dark], [0.75, p.mid], [1, mix(p.mid, p.accent, 0.4)]]) + blur("b12", 12) + blur("gl", 1);
    let body = `<rect width="${W}" height="${H}" fill="url(#s)"/>`;
    body += starField(R, 30, { colors: ["#ffffff"], yMax: 100, maxR: 0.9 });
    body += `<circle cx="330" cy="54" r="18" fill="${p.light}"/><circle cx="330" cy="54" r="40" fill="${p.light}" opacity=".15" filter="url(#b12)"/>`;
    const city = (base, n, minH, maxH, c, winOp) => {
      let o = "";
      let x = -10;
      while (x < 410) {
        const w = 18 + R() * 30;
        const h = minH + R() * (maxH - minH);
        o += `<rect x="${f(x)}" y="${f(base - h)}" width="${f(w)}" height="${f(h + 40)}" fill="${c}"/>`;
        if (R() > 0.7) o += `<rect x="${f(x + w / 2 - 1)}" y="${f(base - h - 14)}" width="2" height="14" fill="${c}"/>`;
        for (let wy = base - h + 6; wy < base - 4; wy += 8) {
          for (let wx = x + 4; wx < x + w - 4; wx += 6) {
            if (R() < 0.32) o += `<rect x="${f(wx)}" y="${f(wy)}" width="2.6" height="3.4" fill="${R() > 0.25 ? p.light : p.accent}" opacity="${winOp}"/>`;
          }
        }
        x += w + 2;
      }
      return o;
    };
    body += city(230, 0, 50, 110, mix(p.mid, p.dark, 0.55), 0.5);
    body += `<rect y="200" width="${W}" height="40" fill="${p.accent}" opacity=".18" filter="url(#b12)"/>`;
    body += city(276, 0, 30, 70, mix(p.dark, "#000000", 0.3), 0.9);
    return { defs, body };
  },

  circuit(p, R) {
    const defs = lin("s", [[0, p.dark], [1, mix(p.dark, p.mid, 0.2)]], 0, 0, 1, 1) + blur("b3", 3);
    let body = `<rect width="${W}" height="${H}" fill="url(#s)"/>`;
    let traces = "";
    let pads = "";
    for (let i = 0; i < 26; i++) {
      let x = Math.round(R() * 20) * 20;
      let y = Math.round(R() * 15) * 20;
      if (x > 120 && x < 280 && y > 60 && y < 240) continue;
      let d = `M${x} ${y}`;
      for (let k = 0; k < 4; k++) {
        const horiz = R() > 0.5;
        const len = (1 + Math.floor(R() * 4)) * 20 * (R() > 0.5 ? 1 : -1);
        if (horiz) x += len;
        else y += len;
        d += ` L${x} ${y}`;
        if (R() > 0.6) {
          x += 20;
          y += 20 * (R() > 0.5 ? 1 : -1);
          d += ` L${x} ${y}`;
        }
      }
      traces += `<path d="${d}" stroke-linejoin="round" stroke-linecap="round"/>`;
      pads += `<circle cx="${x}" cy="${y}" r="4.2" fill="${p.dark}" stroke="${p.light}" stroke-width="1.6"/>`;
    }
    body += `<g stroke="${p.accent}" stroke-width="5" fill="none" opacity=".35" filter="url(#b3)">${traces}</g><g stroke="${p.mid}" stroke-width="2.2" fill="none">${traces}</g><g stroke="${p.light}" stroke-width=".7" fill="none" opacity=".7">${traces}</g>${pads}`;
    // Chips.
    body += `<rect x="20" y="210" width="60" height="40" rx="4" fill="${mix(p.dark, "#000000", 0.4)}" stroke="${p.mid}"/><rect x="320" y="40" width="54" height="34" rx="4" fill="${mix(p.dark, "#000000", 0.4)}" stroke="${p.mid}"/>`;
    for (let i = 0; i < 6; i++) body += `<rect x="${26 + i * 9}" y="204" width="3" height="6" fill="${p.light}"/><rect x="${326 + i * 8}" y="74" width="3" height="6" fill="${p.light}"/>`;
    return { defs, body };
  },

  orbit(p, R) {
    const defs =
      lin("s", [[0, p.dark], [1, mix(p.dark, p.mid, 0.3)]], 0, 0, 1, 1) +
      rad("pl", [[0, p.light], [0.6, p.accent], [1, p.mid]], 0.35, 0.3, 0.8) +
      lin("ring", [[0, p.light, 0], [0.5, p.light, 0.8], [1, p.light, 0]], 0, 0, 1, 0) + blur("b16", 16);
    let body = `<rect width="${W}" height="${H}" fill="url(#s)"/>`;
    body += starField(R, 70, { colors: ["#ffffff", p.light], maxR: 1 });
    body += `<ellipse cx="200" cy="150" rx="210" ry="70" fill="none" stroke="${p.light}" stroke-dasharray="2 6" opacity=".35" transform="rotate(-12 200 150)"/>`;
    body += `<ellipse cx="200" cy="150" rx="170" ry="120" fill="none" stroke="${p.light}" stroke-dasharray="1 5" opacity=".25" transform="rotate(20 200 150)"/>`;
    body += `<circle cx="340" cy="232" r="90" fill="${p.accent}" opacity=".25" filter="url(#b16)"/>`;
    body += `<g transform="rotate(-18 340 232)"><ellipse cx="340" cy="232" rx="104" ry="18" fill="none" stroke="url(#ring)" stroke-width="6"/></g>`;
    body += `<circle cx="340" cy="232" r="54" fill="url(#pl)"/>`;
    body += `<path d="M300 222 Q340 210 382 214 M296 240 Q340 232 386 236" stroke="#ffffff" stroke-opacity=".18" stroke-width="5" fill="none"/>`;
    body += `<g transform="rotate(-18 340 232)"><path d="M236 232 A104 18 0 0 0 444 232" fill="none" stroke="url(#ring)" stroke-width="6"/></g>`;
    body += `<circle cx="72" cy="66" r="10" fill="url(#pl)"/><circle cx="160" cy="34" r="4" fill="${p.light}"/>`;
    return { defs, body };
  },

  stainedglass(p, R) {
    const defs = rad("lt", [[0, "#ffffff", 0.35], [1, "#ffffff", 0]], 0.5, 0, 0.9) + rad("dim", [[0, "#05050a", 0.82], [0.5, "#05050a", 0.55], [1, "#05050a", 0]], 0.5, 0.48, 0.58);
    const cols = [p.mid, p.accent, p.light, p.extra || p.accent, mix(p.mid, p.dark, 0.4)];
    const nx = 8;
    const ny = 6;
    const pts = [];
    for (let r = 0; r <= ny; r++) {
      pts[r] = [];
      for (let c = 0; c <= nx; c++) {
        const edge = r === 0 || c === 0 || r === ny || c === nx;
        pts[r][c] = [(c * W) / nx + (edge ? 0 : (R() - 0.5) * 30), (r * H) / ny + (edge ? 0 : (R() - 0.5) * 30)];
      }
    }
    let body = `<rect width="${W}" height="${H}" fill="${p.dark}"/>`;
    for (let r = 0; r < ny; r++) {
      for (let c = 0; c < nx; c++) {
        const q = [pts[r][c], pts[r][c + 1], pts[r + 1][c + 1], pts[r + 1][c]];
        // Split each quad along a diagonal into two panes.
        const tri1 = [q[0], q[1], q[2]];
        const tri2 = [q[0], q[2], q[3]];
        for (const t of (r + c) % 2 ? [tri1, tri2] : [[q[0], q[1], q[3]], [q[1], q[2], q[3]]]) {
          const col = cols[Math.floor(R() * cols.length)];
          body += `<path d="M${t.map((v) => `${f(v[0])} ${f(v[1])}`).join(" L")}Z" fill="${col}" opacity="${f(0.55 + R() * 0.3)}" stroke="#0a0a10" stroke-width="3.2" stroke-linejoin="round"/>`;
        }
      }
    }
    body += `<rect width="${W}" height="${H}" fill="url(#lt)"/><rect width="${W}" height="${H}" fill="url(#dim)"/>`;
    return { defs, body };
  },
};

// ---------- moving layer (fx) ----------
// Tileable 240x180 particle fields. The CSS loops translate by exactly one tile.
const FX_W = 240;
const FX_H = 180;

function fxSvg(kind, p, seed) {
  const R = rnd(seed);
  let body = "";
  const defs = blur("g", 1.4);
  const wrap = (fn) => {
    // Draw each particle three times (y - H, y, y + H) so the tile wraps seamlessly.
    let o = "";
    for (const dy of [-FX_H, 0, FX_H]) for (const dx of [-FX_W, 0, FX_W]) o += fn(dx, dy);
    return o;
  };
  const parts = [];
  const n = { motes: 16, embers: 14, snow: 22, sparkle: 9, rain: 26, bubbles: 10, fireflies: 9, dust: 18 }[kind] || 12;
  for (let i = 0; i < n; i++) parts.push([R() * FX_W, R() * FX_H, R(), R()]);
  if (kind === "rain") {
    body = wrap((dx, dy) => parts.map(([x, y, a]) => `<path d="M${f(x + dx)} ${f(y + dy)} l-3 ${f(10 + a * 8)}" stroke="${p.light}" stroke-width=".9" opacity="${f(0.25 + a * 0.35)}"/>`).join(""));
  } else if (kind === "sparkle") {
    body = wrap((dx, dy) => parts.map(([x, y, a, b]) => sparkle(x + dx, y + dy, 2 + a * 3.5, b > 0.5 ? p.light : "#ffffff", f(0.55 + a * 0.45))).join(""));
  } else if (kind === "bubbles") {
    body = wrap((dx, dy) => parts.map(([x, y, a]) => `<circle cx="${f(x + dx)}" cy="${f(y + dy)}" r="${f(1.4 + a * 3)}" fill="none" stroke="${p.light}" stroke-width=".8" opacity=".7"/>`).join(""));
  } else {
    const cols = kind === "embers" ? [p.accent, p.light] : kind === "snow" ? ["#ffffff", p.light] : [p.light, p.accent];
    const rMax = kind === "snow" ? 1.6 : kind === "fireflies" ? 1.8 : 1.4;
    body = wrap((dx, dy) =>
      parts
        .map(([x, y, a, b]) => {
          const c = cols[b > 0.5 ? 0 : 1];
          const r = 0.6 + a * rMax;
          return `<circle cx="${f(x + dx)}" cy="${f(y + dy)}" r="${f(r)}" fill="${c}" opacity="${f(0.5 + a * 0.5)}"${kind === "snow" ? "" : ' filter="url(#g)"'}/>`;
        })
        .join("")
    );
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${FX_W} ${FX_H}" width="${FX_W}" height="${FX_H}"><defs>${defs}</defs>${body}</svg>`;
}

// ---------- registry ----------
// key -> { scene, pal: [dark, mid, accent, light, extra?], ring, anim, fx }
// anim: rise | fall | drift (horizontal) | twinkle | sweep | none
// fx: particle kind for the moving layer (null = light sweep only)
export const VOICE_TILE_DESIGNS = {
  // set themes
  "vt-gece-limani": { scene: "harbor", pal: ["#0b1b3a", "#1e4b8f", "#35d0e0", "#e8f6ff"], ring: "#35d0e0", anim: "sweep", fx: "motes" },
  "vt-bakir-kervan": { scene: "dunes", pal: ["#2a140a", "#b5622b", "#f0a443", "#ffe2b0"], ring: "#f0a443", anim: "drift", fx: "dust" },
  "vt-orkide-sisi": { scene: "orchid", pal: ["#1d0f2e", "#8b3fd1", "#ff6fb5", "#c8ff6a"], ring: "#ff6fb5", anim: "rise", fx: "motes" },
  "vt-kor-bahcesi": { scene: "embers", pal: ["#1a0705", "#a3220f", "#ff6a2b", "#ffd27a"], ring: "#ff6a2b", anim: "rise", fx: "embers" },
  "vt-buzul-sessizligi": { scene: "glacier", pal: ["#071a24", "#3a8fb7", "#a6e7ff", "#ffffff"], ring: "#a6e7ff", anim: "fall", fx: "snow" },
  "vt-neon-carsi": { scene: "neon", pal: ["#0a0618", "#ff2e88", "#2ef2ff", "#fff04a"], ring: "#2ef2ff", anim: "fall", fx: "rain" },
  "vt-altin-hasat": { scene: "wheat", pal: ["#1b1405", "#8a6a12", "#f2c230", "#fff3c4"], ring: "#f2c230", anim: "drift", fx: "dust" },
  "vt-mor-sis": { scene: "nebula", pal: ["#120a24", "#4b2a9c", "#a77bff", "#e6dcff"], ring: "#a77bff", anim: "twinkle", fx: "sparkle" },
  "vt-gece-mercani": { scene: "coral", pal: ["#0c0a1f", "#d6336c", "#ff8fab", "#ffd1dc", "#7c5cff"], ring: "#ff8fab", anim: "rise", fx: "bubbles" },
  "vt-kuzey-isigi": { scene: "aurora", pal: ["#04121c", "#14a37f", "#8f7bff", "#6effc7", "#d6fff0"], ring: "#6effc7", anim: "twinkle", fx: "sparkle" },
  "vt-zumrut-orman": { scene: "forest", pal: ["#06140c", "#1f7a46", "#49d17d", "#d8ffe6"], ring: "#49d17d", anim: "drift", fx: "fireflies" },
  "vt-kum-saati": { scene: "hourglass", pal: ["#1f160c", "#9c7a4a", "#e8cf9a", "#fff8e8", "#fff8e8"], ring: "#e8cf9a", anim: "fall", fx: "dust" },
  "vt-firtina-cekirdegi": { scene: "storm", pal: ["#0a0d14", "#3b4a6b", "#7aa7ff", "#f5f9ff"], ring: "#7aa7ff", anim: "fall", fx: "rain" },
  "vt-lav-akisi": { scene: "lava", pal: ["#120404", "#5a0e0e", "#ff3d00", "#ffb000"], ring: "#ff6a00", anim: "rise", fx: "embers" },
  "vt-inci-kiyisi": { scene: "pearl", pal: ["#0d1a22", "#3e6f80", "#ffc6d6", "#f6efe7"], ring: "#ffd8e4", anim: "sweep", fx: "sparkle" },
  "vt-yildiz-tozu": { scene: "stardust", pal: ["#05030f", "#2b1f6e", "#c6b7ff", "#ffe9a8", "#ffe9a8"], ring: "#c6b7ff", anim: "twinkle", fx: "sparkle" },
  // singles
  "vt-ebru-aksami": { scene: "ebru", pal: ["#0d1b2a", "#1f6f78", "#e07a5f", "#f2cc8f"], ring: "#f2cc8f", anim: "none", fx: null },
  "vt-iznik-cinisi": { scene: "cini", pal: ["#0a1838", "#1d4fa8", "#2ec4b6", "#f4f1e8", "#e4573d"], ring: "#2ec4b6", anim: "sweep", fx: null },
  "vt-kilim": { scene: "kilim", pal: ["#2a0e12", "#7d1d2b", "#c8553d", "#f2d0a4"], ring: "#f2d0a4", anim: "none", fx: null },
  "vt-balon-vadisi": { scene: "cappadocia", pal: ["#1d1a3d", "#6a4c93", "#f08a5d", "#ffd6a5"], ring: "#ffd6a5", anim: "drift", fx: "dust" },
  "vt-bogaz-gecesi": { scene: "bosphorus", pal: ["#070d1f", "#1b2a52", "#ffb347", "#cfe3ff"], ring: "#ffb347", anim: "twinkle", fx: "sparkle" },
  "vt-murekkep-daglari": { scene: "ink", pal: ["#0f1114", "#4a5560", "#c2272d", "#d8dde3"], ring: "#d8dde3", anim: "drift", fx: "dust" },
  "vt-holo-folyo": { scene: "holo", pal: ["#0d0b1e", "#5b5bff", "#ff5fd2", "#62f7ff", "#ffe86b"], ring: "#62f7ff", anim: "sweep", fx: "sparkle" },
  "vt-bulutlarin-ustu": { scene: "clouds", pal: ["#16224a", "#4a6fb5", "#ffb48a", "#ffe3b8"], ring: "#ffe3b8", anim: "drift", fx: null },
  "vt-yagmurlu-cam": { scene: "rainglass", pal: ["#0b0f1a", "#ff4f8b", "#3fb8ff", "#ffd36b", "#9b6bff"], ring: "#3fb8ff", anim: "fall", fx: "rain" },
  "vt-gece-plagi": { scene: "vinyl", pal: ["#120d1c", "#3c2a5a", "#ff7a59", "#ffd0b5"], ring: "#ff7a59", anim: "none", fx: null },
  "vt-ekolayzer": { scene: "equalizer", pal: ["#070b16", "#2348ff", "#22d3ee", "#a5f3fc"], ring: "#22d3ee", anim: "twinkle", fx: null },
  "vt-prizma": { scene: "prism", pal: ["#0a0a12", "#2a2a44", "#ffffff", "#d9dcff"], ring: "#ffffff", anim: "sweep", fx: null },
  "vt-lacivert-duman": { scene: "smoke", pal: ["#080c1c", "#243b6b", "#5a8dee", "#b8ccff"], ring: "#5a8dee", anim: "rise", fx: "dust" },
  "vt-okyanus-derinligi": { scene: "abyss", pal: ["#020c1a", "#0b3d5c", "#1fd1c1", "#b8fff4"], ring: "#1fd1c1", anim: "rise", fx: "bubbles" },
  "vt-ay-tutulmasi": { scene: "eclipse", pal: ["#030308", "#2a1440", "#ff8a3d", "#ffe7c2"], ring: "#ffb070", anim: "twinkle", fx: "sparkle" },
  "vt-lale-bahcesi": { scene: "tulips", pal: ["#120a1e", "#3b1e4d", "#e63946", "#ffb4c2", "#3d8b55"], ring: "#ff6b7d", anim: "drift", fx: "motes" },
  "vt-kristal-petek": { scene: "honeycomb", pal: ["#06141c", "#145a73", "#3ddbd9", "#c9fbff"], ring: "#3ddbd9", anim: "twinkle", fx: null },
  "vt-kagit-katlar": { scene: "papercut", pal: ["#141a33", "#3a506b", "#5bc0be", "#f6e6cb"], ring: "#5bc0be", anim: "none", fx: null },
  "vt-mum-isigi": { scene: "candles", pal: ["#120b06", "#3a2210", "#ff9f1c", "#ffe8b0"], ring: "#ffb84d", anim: "rise", fx: "motes" },
  "vt-pastel-aksam": { scene: "pastel", pal: ["#2b2350", "#b39ddb", "#ffb3a7", "#ffe5d0"], ring: "#ffe5d0", anim: "none", fx: null },
  "vt-gece-sehri": { scene: "skyline", pal: ["#060914", "#1d2b53", "#ff6f91", "#ffe08a"], ring: "#ffe08a", anim: "twinkle", fx: "sparkle" },
  "vt-bakir-devre": { scene: "circuit", pal: ["#06120f", "#c9733a", "#ffb067", "#ffe2c2"], ring: "#ffb067", anim: "sweep", fx: null },
  "vt-yorunge": { scene: "orbit", pal: ["#05060f", "#3a2d7a", "#7f5af0", "#d6ccff"], ring: "#9f86ff", anim: "twinkle", fx: "sparkle" },
  "vt-vitray": { scene: "stainedglass", pal: ["#0b0b14", "#1e5aa8", "#d7263d", "#ffd23f", "#2ec4b6"], ring: "#ffd23f", anim: "sweep", fx: null },
};

export const VOICE_TILE_KEYS = Object.keys(VOICE_TILE_DESIGNS);

function palOf(design) {
  const [dark, mid, accent, light, extra] = design.pal;
  return { dark, mid, accent, light, extra };
}

/** Full scene SVG markup for an effect key, or "" when unknown. */
export function voiceTileSvg(key) {
  const design = VOICE_TILE_DESIGNS[key];
  if (!design) return "";
  const scene = SCENES[design.scene];
  if (!scene) return "";
  const p = palOf(design);
  const R = rnd(seedOf(key));
  const s = scene(p, R);
  const fin = finish(p);
  return svgDoc(s.defs + fin.defs, s.body + fin.body);
}

export function voiceTileFxSvg(key) {
  const design = VOICE_TILE_DESIGNS[key];
  if (!design || !design.fx) return "";
  return fxSvg(design.fx, palOf(design), seedOf(`${key}:fx`));
}

/** Percent-encode an SVG string into a CSS-safe data URI. */
export function svgDataUri(svg) {
  const body = svg
    .replace(/\s{2,}/g, " ")
    .replace(/%/g, "%25")
    .replace(/#/g, "%23")
    .replace(/</g, "%3C")
    .replace(/>/g, "%3E")
    .replace(/"/g, "'")
    .replace(/\n/g, " ");
  return `data:image/svg+xml;charset=utf-8,${body}`;
}

const cache = new Map();

/**
 * Style + class for the skin layer of a voice tile (`.vt2-skin`). Cached per key, so 20
 * tiles with the same theme share one decoded image.
 */
export function voiceTileSkin(key) {
  if (!key || !VOICE_TILE_DESIGNS[key]) return null;
  if (cache.has(key)) return cache.get(key);
  const design = VOICE_TILE_DESIGNS[key];
  const p = palOf(design);
  const fx = voiceTileFxSvg(key);
  const out = {
    key,
    anim: design.anim || "none",
    className: `vt2-skin vt2-a-${design.anim || "none"}${design.fx ? ` vt2-fxk-${design.fx}` : ""}`,
    style: {
      "--vt-bg": `url("${svgDataUri(voiceTileSvg(key))}")`,
      "--vt-fx": fx ? `url("${svgDataUri(fx)}")` : "none",
      "--vt-ring": design.ring,
      "--vt-glow": rgba(design.ring, 0.42),
      "--vt-edge": rgba(p.light, 0.18),
      "--vt-tint": rgba(p.accent, 0.22),
    },
  };
  cache.set(key, out);
  return out;
}

/** Effect key of the voice tile a user wears (member objects from voice / calls / me). */
export function voiceTileKeyOf(user) {
  const item = user?.equippedVoiceTile;
  const key = item?.effect_key || item?.effectKey || null;
  return key && VOICE_TILE_DESIGNS[key] ? key : null;
}
