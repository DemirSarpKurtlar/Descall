"use strict";

/**
 * Theme scenes: one illustrated still SVG per theme (1600 x 1000, sliced to
 * cover the window). It sits behind the glass panels, so shapes are large,
 * soft-edged and lit; small detail (stars, windows, sparks) adds depth where
 * the scene shows between panels. No animation (a theme is on screen all day).
 */
const { svg, rg, lg, f } = require("./svg");

const W = 1600;
const H = 1000;
let seed = 1;
const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
const reseed = (s) => { seed = s; };

const doc = (defs, body) => svg(body, { vb: `0 0 ${W} ${H}`, defs, par: "xMidYMid slice" });
const sky = (id, stops) => lg(id, stops.map(([o, c, a = 1]) => [o, c, a]), [0, 0, 0, 1]);
const rect = (fill) => `<rect width='${W}' height='${H}' fill='${fill}'/>`;
const glow = (id, c, a = 0.6) => rg(id, [[0, c, a], [1, c, 0]]);
const blob = (cx, cy, rx, ry, fill) => `<ellipse cx='${cx}' cy='${cy}' rx='${rx}' ry='${ry}' fill='${fill}'/>`;

/** Random stars in a box: dots as round-capped zero-length strokes, bucketed. */
function stars(n, x0, y0, x1, y1, color = "#ffffff", s = 7, big = 0.08) {
  reseed(s);
  const buckets = [[], [], []];
  let sparkles = "";
  for (let i = 0; i < n; i += 1) {
    const x = Math.round(x0 + rnd() * (x1 - x0));
    const y = Math.round(y0 + rnd() * (y1 - y0));
    const k = rnd();
    if (rnd() < big) sparkles += `M${x} ${y - 9}l1.6 7.4 7.4 1.6-7.4 1.6-1.6 7.4-1.6-7.4-7.4-1.6 7.4-1.6z`;
    else buckets[k < 0.55 ? 0 : k < 0.88 ? 1 : 2].push(`M${x} ${y}h0`);
  }
  const ws = [1.6, 2.4, 3.4];
  const op = [0.55, 0.75, 0.95];
  return buckets.map((b, i) => (b.length ? `<path d='${b.join("")}' stroke='${color}' stroke-width='${ws[i]}' stroke-linecap='round' opacity='${op[i]}'/>` : "")).join("") + (sparkles ? `<path d='${sparkles}' fill='${color}' opacity='0.9'/>` : "");
}
/** Mountain / hill ridge polygon from y0 with roughness. */
function ridge(y0, amp, step, fill, s = 3, sharp = true) {
  reseed(s);
  let d = `M0 ${H}L0 ${y0}`;
  for (let x = 0; x <= W + step; x += step) {
    const y = f(y0 - rnd() * amp);
    if (sharp) d += `L${x} ${y}`;
    else d += `Q${x - step / 2} ${f(y - amp * 0.3)} ${x} ${y}`;
  }
  return `<path d='${d}L${W} ${H}Z' fill='${fill}'/>`;
}
/** Soft rolling hills. */
function hills(y0, amp, waves, fill, phase = 0) {
  let d = `M0 ${H}L0 ${y0}`;
  for (let x = 0; x <= W; x += 40) d += `L${x} ${f(y0 - amp * (0.5 + 0.5 * Math.sin((x / W) * Math.PI * waves + phase)))}`;
  return `<path d='${d}L${W} ${H}Z' fill='${fill}'/>`;
}
/** Pine tree silhouette. */
const pine = (x, base, h, fill) => {
  const w = h * 0.36;
  return `<path d='M${x} ${base - h}L${x + w * 0.45} ${base - h * 0.62}L${x + w * 0.25} ${base - h * 0.62}L${x + w * 0.75} ${base - h * 0.3}L${x + w * 0.45} ${base - h * 0.3}L${x + w} ${base}L${x - w} ${base}L${x - w * 0.45} ${base - h * 0.3}L${x - w * 0.75} ${base - h * 0.3}L${x - w * 0.25} ${base - h * 0.62}L${x - w * 0.45} ${base - h * 0.62}Z' fill='${fill}'/>`;
};
function forest(n, base, hmin, hmax, fill, s) {
  reseed(s);
  let out = "";
  for (let i = 0; i < n; i += 1) out += pine(f(rnd() * W), base + rnd() * 30, hmin + rnd() * (hmax - hmin), fill);
  return out;
}
/** Vertical aurora curtain (a wavy band with a vertical fade). */
function curtain(x, y, w, h, fillId, sway = 60) {
  const p = [];
  for (let i = 0; i <= 8; i += 1) p.push([f(x + (w / 8) * i), f(y + Math.sin(i * 0.9) * sway * 0.3)]);
  let d = `M${p[0][0]} ${p[0][1]}`;
  for (let i = 1; i < p.length; i += 1) d += `L${p[i][0]} ${p[i][1]}`;
  for (let i = p.length - 1; i >= 0; i -= 1) d += `L${f(p[i][0] + sway * 0.4)} ${f(p[i][1] + h)}`;
  return `<path d='${d}Z' fill='url(#${fillId})'/>`;
}
/** City skyline with lit windows. */
function skyline(base, fill, win, s, n = 26) {
  reseed(s);
  let out = "";
  const wins = [];
  let x = 0;
  for (let i = 0; i < n && x < W; i += 1) {
    const w = 40 + rnd() * 70;
    const h = 60 + rnd() * 200;
    out += `<rect x='${f(x)}' y='${f(base - h)}' width='${f(w)}' height='${f(h + 2)}' fill='${fill}'/>`;
    for (let wy = base - h + 14; wy < base - 10; wy += 18) {
      for (let wx = x + 8; wx < x + w - 10; wx += 14) if (rnd() < 0.32) wins.push(`M${Math.round(wx)} ${Math.round(wy)}h5v7h-5z`);
    }
    x += w + 4 + rnd() * 10;
  }
  return `${out}<path d='${wins.join("")}' fill='${win}' opacity='0.8'/>`;
}
/** A cut gem: outline polygon with facets fanning from a table. */
function gem(cx, cy, r, cols, s) {
  reseed(s);
  const n = 8;
  const outer = [];
  const inner = [];
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * Math.PI * 2 + 0.2;
    outer.push([f(cx + Math.cos(a) * r), f(cy + Math.sin(a) * r * 0.86)]);
    inner.push([f(cx + Math.cos(a + 0.39) * r * 0.5), f(cy + Math.sin(a + 0.39) * r * 0.43)]);
  }
  let out = "";
  for (let i = 0; i < n; i += 1) {
    const j = (i + 1) % n;
    out += `<path d='M${outer[i].join(" ")}L${outer[j].join(" ")}L${inner[i].join(" ")}Z' fill='${cols[i % cols.length]}' opacity='${f(0.55 + rnd() * 0.4)}'/>`;
    out += `<path d='M${inner[i].join(" ")}L${outer[j].join(" ")}L${inner[j].join(" ")}Z' fill='${cols[(i + 2) % cols.length]}' opacity='${f(0.45 + rnd() * 0.4)}'/>`;
  }
  out += `<path d='M${inner.map((p) => p.join(" ")).join("L")}Z' fill='${cols[1]}' opacity='0.7'/>`;
  out += `<path d='M${outer.map((p) => p.join(" ")).join("L")}Z' fill='none' stroke='#ffffff' stroke-opacity='0.35' stroke-width='3'/>`;
  return out;
}
/** Light shafts from a point. */
function shafts(x, y, n, len, spread, id, from = 90) {
  let out = "";
  for (let i = 0; i < n; i += 1) {
    const a = ((from - spread / 2 + (spread / (n - 1)) * i) * Math.PI) / 180;
    const w = 0.04 + (i % 3) * 0.02;
    const x1 = x + Math.cos(a - w) * len;
    const y1 = y + Math.sin(a - w) * len;
    const x2 = x + Math.cos(a + w) * len;
    const y2 = y + Math.sin(a + w) * len;
    out += `<path d='M${x} ${y}L${f(x1)} ${f(y1)}L${f(x2)} ${f(y2)}Z' fill='url(#${id})'/>`;
  }
  return out;
}
const reflect = (x, y0, w, n, c) => {
  let out = "";
  for (let i = 0; i < n; i += 1) {
    const ww = w * (1 - i / n) * (0.6 + ((i * 37) % 10) / 25);
    out += `<rect x='${f(x - ww / 2)}' y='${f(y0 + i * 14)}' width='${f(ww)}' height='4' rx='2' fill='${c}' opacity='${f(0.75 - i * 0.04)}'/>`;
  }
  return out;
};

const SCENES = {
  "kutup-gecesi": () => doc(
    sky("s", [[0, "#020a12"], [0.55, "#05202a"], [1, "#0a2a30"]]) + lg("a1", [[0, "#6effc7", 0], [0.3, "#6effc7", 0.55], [1, "#14a37f", 0]], [0, 0, 0, 1]) + lg("a2", [[0, "#8f7bff", 0], [0.35, "#8f7bff", 0.5], [1, "#8f7bff", 0]], [0, 0, 0, 1]) + lg("ice", [[0, "#dff4ff"], [1, "#5a8aa0"]]),
    `${rect("url(#s)")}${stars(140, 0, 0, W, 520, "#e6fff5", 3)}${curtain(80, 90, 520, 430, "a1")}${curtain(520, 40, 480, 400, "a2", 80)}${curtain(980, 110, 560, 420, "a1", 50)}${ridge(720, 120, 80, "#0c2a36", 5)}${ridge(780, 60, 60, "url(#ice)", 9)}<path d='M0 850H${W}V${H}H0Z' fill='#cfe8f2' opacity='0.35'/>`),
  "ay-isigi-korfezi": () => doc(
    sky("s", [[0, "#0a1530"], [0.6, "#13244a"], [0.601, "#050b1a"], [1, "#060d1c"]]) + glow("m", "#e8f0ff", 0.55),
    `${rect("url(#s)")}${stars(90, 0, 0, W, 560, "#dfe8ff", 11)}<circle cx='1180' cy='230' r='190' fill='url(#m)'/><circle cx='1180' cy='230' r='70' fill='#f4f8ff'/><circle cx='1150' cy='215' r='14' fill='#d4def0'/><circle cx='1205' cy='255' r='10' fill='#d4def0'/>${ridge(600, 70, 120, "#0b1530", 4, false)}${reflect(1180, 610, 230, 26, "#dfe8ff")}`),
  "col-safagi": () => doc(
    sky("s", [[0, "#1a0e1e"], [0.45, "#5a2414"], [0.7, "#e07a3a"], [1, "#3a1a0c"]]) + glow("sun", "#ffd27a", 0.9),
    `${rect("url(#s)")}<circle cx='800' cy='650' r='340' fill='url(#sun)'/><circle cx='800' cy='660' r='95' fill='#ffe2a8'/>${hills(720, 140, 2.2, "#7a3a18", 0.4)}${hills(800, 120, 1.6, "#4a200c", 2.1)}${hills(900, 90, 2.8, "#2a1208", 1)}`),
  "lavanta-tarlasi": () => doc(
    sky("s", [[0, "#140c28"], [0.5, "#3a1a50"], [0.68, "#d67ab8"], [0.7, "#2a1640"], [1, "#120c1e"]]) + lg("row", [[0, "#9a6ae0"], [1, "#3a1a60"]]),
    `${rect("url(#s)")}${stars(60, 0, 0, W, 380, "#f0e0ff", 21)}${Array.from({ length: 14 }, (_, i) => { const x = -400 + i * 170; return `<path d='M800 690L${x} ${H}L${x + 70} ${H}Z' fill='url(#row)' opacity='${f(0.5 + (i % 2) * 0.3)}'/>`; }).join("")}${ridge(690, 40, 160, "#1e1036", 6, false)}`),
  "derin-mercan": () => doc(
    sky("s", [[0, "#0d4a54"], [0.5, "#072a32"], [1, "#04141a"]]) + lg("ray", [[0, "#9ff0ff", 0.25], [1, "#9ff0ff", 0]], [0, 0, 0, 1]) + glow("c1", "#ff6f9a", 0.7) + glow("c2", "#ffb36b", 0.6),
    `${rect("url(#s)")}${shafts(800, -100, 7, 1100, 50, "ray")}${blob(260, 940, 300, 120, "url(#c1)")}${blob(1250, 960, 360, 120, "url(#c1)")}${blob(760, 980, 220, 80, "url(#c2)")}${Array.from({ length: 9 }, (_, i) => { const x = 120 + i * 170; return `<path d='M${x} ${H}C${x - 20} 880 ${x + 30} 860 ${x + 10} 800M${x + 6} 870C${x + 40} 850 ${x + 50} 830 ${x + 44} 810M${x - 4} 900C${x - 40} 880 ${x - 46} 860 ${x - 40} 840' stroke='${i % 2 ? "#ff6f9a" : "#d6336c"}' stroke-width='10' stroke-linecap='round' fill='none' opacity='0.85'/>`; }).join("")}${stars(50, 0, 300, W, 900, "#bff8ff", 23)}`),
  "volkan": () => doc(
    sky("s", [[0, "#140808"], [0.6, "#2a0c08"], [1, "#0e0606"]]) + glow("lava", "#ff3d00", 0.8) + lg("v", [[0, "#2a0c08"], [1, "#0a0404"]]),
    `${rect("url(#s)")}${blob(800, 360, 520, 300, "url(#lava)")}<path d='M380 1000L700 380H900L1220 1000Z' fill='url(#v)'/><path d='M700 380Q800 330 900 380Z' fill='#ffb000'/><path d='M760 400L740 560L790 680L760 830M840 400L870 520L830 640L880 800L850 1000' stroke='#ff6a1f' stroke-width='9' fill='none' stroke-linejoin='round'/><path d='M760 400L740 560L790 680L760 830M840 400L870 520L830 640L880 800L850 1000' stroke='#ffd27a' stroke-width='3' fill='none' stroke-linejoin='round'/>${stars(70, 500, 100, 1100, 420, "#ffb000", 31, 0)}${ridge(860, 70, 120, "#0a0404", 3)}`),
  "sis-ormani": () => doc(
    sky("s", [[0, "#1a2c26"], [1, "#08120e"]]) + lg("fog", [[0, "#cfe8dc", 0], [0.5, "#cfe8dc", 0.22], [1, "#cfe8dc", 0]], [0, 0, 0, 1]),
    `${rect("url(#s)")}${forest(26, 640, 260, 380, "#2a4a3c", 41)}<rect y='540' width='${W}' height='200' fill='url(#fog)'/>${forest(22, 820, 300, 460, "#15281f", 43)}<rect y='720' width='${W}' height='200' fill='url(#fog)'/>${forest(16, 1010, 380, 560, "#08140e", 47)}`),
  "neon-gece": () => doc(
    sky("s", [[0, "#140a30"], [0.62, "#2a0c40"], [0.621, "#0a0618"], [1, "#0a0618"]]) + glow("p", "#ff2e88", 0.7) + glow("c", "#2ef2ff", 0.6),
    `${rect("url(#s)")}${blob(320, 420, 320, 160, "url(#p)")}${blob(1260, 380, 280, 140, "url(#c)")}${skyline(620, "#0c0820", "#ff9ad1", 51)}<rect x='240' y='300' width='180' height='60' rx='12' fill='none' stroke='#ff2e88' stroke-width='8'/><rect x='1180' y='280' width='150' height='50' rx='10' fill='none' stroke='#2ef2ff' stroke-width='7'/>${Array.from({ length: 12 }, (_, i) => `<path d='M${800} 620L${f(-600 + i * 250)} ${H}' stroke='#ff2e88' stroke-opacity='0.35' stroke-width='2'/>`).join("")}${Array.from({ length: 7 }, (_, i) => `<path d='M0 ${f(650 + i * i * 9)}H${W}' stroke='#2ef2ff' stroke-opacity='0.3' stroke-width='2'/>`).join("")}`),
  "bal-isigi": () => doc(
    sky("s", [[0, "#2a1c08"], [1, "#150f06"]]) + lg("ray", [[0, "#ffd98a", 0.3], [1, "#ffd98a", 0]], [0, 0, 1, 1]) + glow("g", "#e0a030", 0.55),
    `${rect("url(#s)")}${blob(260, 160, 520, 380, "url(#g)")}${shafts(100, -60, 6, 1600, 30, "ray", 35)}${(() => { let o = ""; for (let r = 0; r < 9; r += 1) for (let c = 0; c < 14; c += 1) { const x = 900 + c * 52 + (r % 2) * 26; const y = 520 + r * 45; if (x > W + 40) continue; o += `<path d='M${x} ${y - 30}L${x + 26} ${y - 15}L${x + 26} ${y + 15}L${x} ${y + 30}L${x - 26} ${y + 15}L${x - 26} ${y - 15}Z' fill='#e0a030' fill-opacity='${f(0.08 + ((r * 7 + c * 3) % 9) / 40)}' stroke='#ffd98a' stroke-opacity='0.25' stroke-width='2'/>`; } return o; })()}`),
  "buzul-magarasi": () => doc(
    sky("s", [[0, "#0c2a3a"], [1, "#06141c"]]) + glow("g", "#7ad8ff", 0.5),
    `${rect("url(#s)")}${blob(800, 520, 500, 340, "url(#g)")}${Array.from({ length: 11 }, (_, i) => { const x = i * 160; const h = 180 + ((i * 53) % 220); return `<path d='M${x - 40} 0L${x + 80} 0L${x + 20} ${h}Z' fill='${["#b8ecff", "#3a8fb7", "#e8f9ff"][i % 3]}' opacity='${f(0.25 + (i % 3) * 0.12)}'/>`; }).join("")}${Array.from({ length: 9 }, (_, i) => { const x = 60 + i * 190; const h = 220 + ((i * 71) % 260); return `<path d='M${x - 70} ${H}L${x} ${H - h}L${x + 70} ${H}Z' fill='${["#7ad8ff", "#e8f9ff", "#3a8fb7"][i % 3]}' opacity='${f(0.3 + (i % 3) * 0.12)}'/><path d='M${x} ${H - h}L${x + 18} ${H}' stroke='#ffffff' stroke-opacity='0.5' stroke-width='3'/>`; }).join("")}`),
  "mavi-saat": () => doc(
    sky("s", [[0, "#0e1636"], [0.55, "#2a3a8a"], [0.8, "#6a5ab8"], [1, "#0a0f24"]]),
    `${rect("url(#s)")}${stars(50, 0, 0, W, 340, "#dfe8ff", 61)}${skyline(1000, "#0a0f24", "#ffd98a", 63, 30)}`),
  "bordo-kadife": () => doc(
    sky("s", [[0, "#200a10"], [1, "#140609"]]) + lg("fold", [[0, "#000000", 0.45], [0.5, "#ff8aa0", 0.12], [1, "#000000", 0.45]], [0, 0, 1, 0]) + glow("g", "#d4a050", 0.4),
    `${rect("url(#s)")}${Array.from({ length: 12 }, (_, i) => `<path d='M${i * 140} 0C${i * 140 + 40} 300 ${i * 140 - 30} 600 ${i * 140 + 20} ${H}H${i * 140 + 150}C${i * 140 + 100} 600 ${i * 140 + 170} 300 ${i * 140 + 140} 0Z' fill='url(#fold)'/>`).join("")}<path d='M0 0H${W}V90C1200 160 400 160 0 90Z' fill='#5a1020'/><path d='M0 90C400 160 1200 160 ${W} 90' stroke='#d4a050' stroke-width='6' fill='none'/>${blob(800, 0, 600, 200, "url(#g)")}`),
  "yesim": () => doc(
    sky("s", [[0, "#0c2420"], [1, "#06120f"]]) + rg("st", [[0, "#9fe8c8", 0.55], [0.6, "#1c8264", 0.4], [1, "#0a3a2c", 0.2]], { fx: "35%", fy: "30%" }),
    `${rect("url(#s)")}${blob(300, 760, 260, 170, "url(#st)")}${blob(620, 860, 200, 120, "url(#st)")}${blob(1250, 300, 300, 200, "url(#st)")}${blob(1040, 820, 150, 100, "url(#st)")}${blob(170, 220, 140, 90, "url(#st)")}<path d='M0 600C400 520 800 700 ${W} 560' stroke='#9fe8c8' stroke-opacity='0.12' stroke-width='40' fill='none'/>`),
  "grafit-cam": () => doc(
    sky("s", [[0, "#1a1c22"], [1, "#0c0d10"]]) + lg("pane", [[0, "#ffffff", 0.08], [1, "#ffffff", 0.01]], [0, 0, 1, 1]),
    `${rect("url(#s)")}${Array.from({ length: 7 }, (_, i) => `<path d='M${-200 + i * 300} ${H}L${200 + i * 300} 0H${330 + i * 300}L${-70 + i * 300} ${H}Z' fill='url(#pane)'/>`).join("")}<path d='M0 640L${W} 360' stroke='#ffffff' stroke-opacity='0.08' stroke-width='3'/><path d='M0 700L${W} 420' stroke='#ffffff' stroke-opacity='0.05' stroke-width='2'/>`),
  "gece-gulu": () => doc(
    sky("s", [[0, "#1e0c18"], [1, "#140810"]]) + rg("r", [[0, "#ffb3cc", 0.8], [0.5, "#c2386e", 0.6], [1, "#5a1030", 0]]),
    `${rect("url(#s)")}${[[260, 760, 150], [1260, 240, 190], [1350, 820, 120], [520, 220, 90]].map(([x, y, r]) => `<circle cx='${x}' cy='${y}' r='${r * 1.6}' fill='url(#r)'/>${Array.from({ length: 5 }, (_, k) => `<ellipse cx='${x}' cy='${y - r * 0.35}' rx='${r * 0.42}' ry='${r * 0.6}' transform='rotate(${k * 72} ${x} ${y})' fill='#c2386e' opacity='0.45'/>`).join("")}<circle cx='${x}' cy='${y}' r='${r * 0.3}' fill='#ffb3cc' opacity='0.5'/>`).join("")}<path d='M0 900C300 860 500 980 800 920S1300 880 ${W} 940' stroke='#2a5a3a' stroke-width='12' fill='none' opacity='0.6'/>`),
  "okyanus-dibi": () => doc(
    sky("s", [[0, "#04142a"], [0.6, "#020a14"], [1, "#01060c"]]) + glow("j", "#5fe8ff", 0.6),
    `${rect("url(#s)")}${stars(160, 0, 0, W, H, "#5fe8ff", 71, 0.03)}${[[400, 380, 70], [1150, 560, 90], [800, 220, 50]].map(([x, y, r]) => `<circle cx='${x}' cy='${y}' r='${r * 2.2}' fill='url(#j)'/><path d='M${x - r} ${y}A${r} ${r * 0.8} 0 0 1 ${x + r} ${y}Z' fill='#7fd8ff' opacity='0.55'/>${Array.from({ length: 5 }, (_, k) => `<path d='M${x - r * 0.7 + k * r * 0.35} ${y}C${x - r * 0.9 + k * r * 0.35} ${y + r} ${x - r * 0.4 + k * r * 0.35} ${y + r * 1.6} ${x - r * 0.7 + k * r * 0.35} ${y + r * 2.4}' stroke='#7fd8ff' stroke-opacity='0.5' stroke-width='4' fill='none'/>`).join("")}`).join("")}`),
  "bakir-atolye": () => doc(
    sky("s", [[0, "#22140c"], [1, "#140c08"]]) + lg("cu", [[0, "#f0b48a"], [0.5, "#a85a24"], [1, "#5a2a10"]], [0, 0, 1, 1]) + glow("g", "#e08a4a", 0.45),
    `${rect("url(#s)")}${blob(400, 300, 500, 340, "url(#g)")}${[[1200, 300, 180, 18], [1420, 560, 110, 12], [280, 760, 150, 16]].map(([cx, cy, r, n]) => { let d = ""; for (let i = 0; i < n * 2; i += 1) { const a = (i / (n * 2)) * Math.PI * 2; const rr = i % 2 ? r : r * 0.86; d += `${i ? "L" : "M"}${f(cx + Math.cos(a) * rr)} ${f(cy + Math.sin(a) * rr)}`; } return `<path d='${d}Z' fill='url(#cu)' opacity='0.55'/><circle cx='${cx}' cy='${cy}' r='${r * 0.35}' fill='#22140c'/>`; }).join("")}<path d='M0 520H700Q760 520 760 580V${H}' stroke='url(#cu)' stroke-width='34' fill='none' opacity='0.55'/><path d='M0 520H700Q760 520 760 580V${H}' stroke='#3fa89a' stroke-width='6' fill='none' opacity='0.35'/>`),
  "seftali-bulutu": () => doc(
    sky("s", [[0, "#2a1418"], [1, "#160c0e"]]) + rg("c", [[0, "#ffc8b0", 0.6], [0.7, "#e88aa0", 0.3], [1, "#e88aa0", 0]]),
    `${rect("url(#s)")}${[[300, 260, 340, 140], [560, 320, 260, 110], [1150, 520, 420, 160], [1400, 460, 260, 120], [500, 780, 380, 140], [900, 860, 300, 110]].map(([x, y, rx, ry]) => `${blob(x, y, rx, ry, "url(#c)")}${blob(x - rx * 0.3, y - ry * 0.4, rx * 0.5, ry * 0.7, "url(#c)")}`).join("")}`),
  "firtina-mavisi": () => doc(
    sky("s", [[0, "#1a2436"], [1, "#080c14"]]) + rg("c", [[0, "#6a7ca4", 0.85], [1, "#3b4a6b", 0]]),
    `${rect("url(#s)")}${[[200, 140, 420, 160], [700, 100, 520, 170], [1300, 160, 480, 170], [450, 300, 380, 130], [1100, 320, 420, 140]].map(([x, y, rx, ry]) => blob(x, y, rx, ry, "url(#c)")).join("")}<path d='M980 300L940 460L1000 470L950 640' stroke='#dbe7ff' stroke-width='6' fill='none' stroke-linejoin='round'/>${Array.from({ length: 90 }, (_, i) => { reseed(i + 300); const x = f(rnd() * W); const y = f(300 + rnd() * 700); return `<path d='M${x} ${y}l-14 46' stroke='#c8d8ff' stroke-opacity='0.25' stroke-width='2'/>`; }).join("")}`),
  "mor-nebula": () => doc(
    sky("s", [[0, "#0e0820"], [1, "#0a0618"]]) + rg("n1", [[0, "#d64fa8", 0.65], [1, "#d64fa8", 0]]) + rg("n2", [[0, "#6238d0", 0.7], [1, "#6238d0", 0]]) + rg("n3", [[0, "#2ec8e0", 0.4], [1, "#2ec8e0", 0]]),
    `${rect("url(#s)")}${blob(900, 420, 560, 300, "url(#n2)")}${blob(1000, 380, 300, 180, "url(#n1)")}${blob(700, 560, 260, 140, "url(#n3)")}${blob(1040, 390, 60, 40, "#ffe6f4")}${stars(200, 0, 0, W, H, "#e6dcff", 81)}`),
  "tayga": () => doc(
    sky("s", [[0, "#142a2a"], [1, "#071210"]]),
    `${rect("url(#s)")}${ridge(560, 140, 110, "#1e3a40", 13)}${forest(30, 760, 240, 360, "#0e2420", 91)}${hills(860, 40, 2, "#dfeef0", 0.5)}${forest(14, 1000, 320, 460, "#061410", 93)}${stars(160, 0, 0, W, H, "#ffffff", 95, 0)}`),
  "ege-mavisi": () => doc(
    sky("s", [[0, "#0c3a6a"], [0.5, "#1868b8"], [0.52, "#0a3a6a"], [1, "#04101c"]]) + glow("sun", "#ffffff", 0.5),
    `${rect("url(#s)")}<circle cx='1250' cy='180' r='260' fill='url(#sun)'/><path d='M0 560C200 380 380 400 520 520L520 ${H}H0Z' fill='#e8f0f8' opacity='0.9'/>${[[60, 470, 90, 70], [170, 440, 80, 90], [270, 470, 100, 60], [120, 530, 110, 60], [320, 520, 90, 70]].map(([x, y, w, h]) => `<rect x='${x}' y='${y}' width='${w}' height='${h}' fill='#ffffff'/><rect x='${x + w * 0.35}' y='${y + h * 0.4}' width='${w * 0.25}' height='${h * 0.4}' fill='#1868b8'/>`).join("")}${Array.from({ length: 14 }, (_, i) => `<path d='M${520 + (i % 3) * 60} ${540 + i * 32}H${W}' stroke='#a8dcff' stroke-opacity='${f(0.25 - i * 0.012)}' stroke-width='3'/>`).join("")}`),
  "kehribar-gece": () => doc(
    sky("s", [[0, "#1e1006"], [1, "#120a04"]]) + glow("l", "#ff9a3c", 0.7),
    `${rect("url(#s)")}<path d='M-40 140Q400 360 820 180T1680 220' stroke='#3a2410' stroke-width='4' fill='none'/>${[[120, 210], [330, 290], [560, 290], [790, 190], [1020, 180], [1250, 210], [1480, 200]].map(([x, y]) => `<circle cx='${x}' cy='${y + 40}' r='90' fill='url(#l)'/><path d='M${x} ${y}V${y + 14}' stroke='#3a2410' stroke-width='3'/><rect x='${x - 18}' y='${y + 14}' width='36' height='52' rx='14' fill='#ffcf8a'/><rect x='${x - 18}' y='${y + 14}' width='36' height='52' rx='14' fill='none' stroke='#a85808' stroke-width='3'/>`).join("")}${hills(900, 60, 1.4, "#0a0602", 0.3)}`),
  "safir": () => doc(sky("s", [[0, "#0a1230"], [1, "#050a1c"]]) + glow("g", "#6a8aff", 0.45), `${rect("url(#s)")}${blob(1150, 380, 520, 420, "url(#g)")}${gem(1150, 400, 300, ["#9fb8ff", "#2a48c8", "#e0e8ff", "#1a2a80", "#6a8aff"], 101)}${gem(260, 820, 120, ["#6a8aff", "#e0e8ff", "#2a48c8"], 103)}`),
  "yakut": () => doc(sky("s", [[0, "#200810"], [1, "#14040a"]]) + glow("g", "#ff5a7a", 0.45), `${rect("url(#s)")}${blob(420, 420, 520, 420, "url(#g)")}${gem(420, 430, 290, ["#ff9fb0", "#b8123a", "#ffd6de", "#6a0820", "#ff5a7a"], 111)}${gem(1350, 780, 140, ["#ff5a7a", "#ffd6de", "#b8123a"], 113)}`),
  "ametist": () => doc(sky("s", [[0, "#160a26"], [1, "#0e0618"]]) + glow("g", "#c87aff", 0.4), `${rect("url(#s)")}${blob(800, 900, 700, 360, "url(#g)")}${Array.from({ length: 9 }, (_, i) => { const x = 480 + i * 80; const h = 260 + ((i * 97) % 300); const c = ["#d8b8ff", "#8030d0", "#f0e0ff", "#4a1880", "#c87aff"][i % 5]; return `<path d='M${x - 40} ${H}L${x - 40} ${H - h + 60}L${x} ${H - h}L${x + 40} ${H - h + 60}L${x + 40} ${H}Z' fill='${c}' opacity='0.55'/><path d='M${x} ${H - h}L${x} ${H}' stroke='#ffffff' stroke-opacity='0.3' stroke-width='3'/>`; }).join("")}`),
  "zumrut": () => doc(sky("s", [[0, "#082018"], [1, "#04140c"]]) + glow("g", "#49d17d", 0.42), `${rect("url(#s)")}${blob(1100, 500, 560, 440, "url(#g)")}<path d='M880 240H1320L1420 340V660L1320 760H880L780 660V340Z' fill='#127e44' opacity='0.6'/><path d='M940 320H1260L1320 380V620L1260 680H940L880 620V380Z' fill='#49d17d' opacity='0.45'/><path d='M1000 400H1200V600H1000Z' fill='#9fffc8' opacity='0.4'/><path d='M880 240L940 320M1320 240L1260 320M1420 340L1320 380M1420 660L1320 620M1320 760L1260 680M880 760L940 680M780 660L880 620M780 340L880 380' stroke='#e0fff0' stroke-opacity='0.45' stroke-width='3'/>${gem(250, 250, 100, ["#49d17d", "#e0fff0", "#127e44"], 121)}`),
  "topaz": () => doc(sky("s", [[0, "#1e1608"], [1, "#140e04"]]) + glow("g", "#f2c230", 0.4), `${rect("url(#s)")}${blob(560, 520, 520, 440, "url(#g)")}<path d='M560 180C760 360 800 560 760 700C720 820 400 820 360 700C320 560 360 360 560 180Z' fill='#9a660a' opacity='0.65'/><path d='M560 180L470 520L560 760L650 520Z' fill='#fff3c4' opacity='0.35'/><path d='M560 180L360 700M560 180L760 700M470 520L360 700M650 520L760 700' stroke='#fff3c4' stroke-opacity='0.4' stroke-width='3'/>${gem(1350, 300, 110, ["#f2c230", "#fff3c4", "#9a660a"], 131)}`),
  "prizma-sisi": () => doc(
    sky("s", [[0, "#120e1e"], [1, "#0c0a14"]]) + ["#ff3b6b", "#ffb13b", "#f6ff5a", "#3bff9d", "#3bc8ff", "#8a5bff"].map((c, i) => lg(`b${i}`, [[0, c, 0.6], [1, c, 0]], [0, 0, 1, 0])).join("") + glow("g", "#7046d8", 0.4),
    `${rect("url(#s)")}${blob(400, 500, 500, 400, "url(#g)")}<path d='M0 520L560 440' stroke='#ffffff' stroke-opacity='0.5' stroke-width='10'/><path d='M560 300L720 600H400Z' fill='#e0d8ff' opacity='0.3' stroke='#ffffff' stroke-opacity='0.6' stroke-width='4'/>${Array.from({ length: 6 }, (_, i) => `<path d='M640 470L${W} ${f(330 + i * 70)}L${W} ${f(390 + i * 70)}Z' fill='url(#b${i})'/>`).join("")}`),
  "siber-izgara": () => doc(
    sky("s", [[0, "#060a20"], [0.55, "#1a0c3a"], [0.6, "#d81b9a"], [0.601, "#050816"], [1, "#050816"]]) + glow("sun", "#d81b9a", 0.6),
    `${rect("url(#s)")}<circle cx='800' cy='600' r='420' fill='url(#sun)'/><circle cx='800' cy='600' r='170' fill='#ff7cd0' opacity='0.85'/>${Array.from({ length: 6 }, (_, i) => `<rect x='620' y='${510 + i * 15}' width='360' height='${3 + i}' fill='#1a0c3a'/>`).join("")}<rect y='600' width='${W}' height='400' fill='#050816'/>${Array.from({ length: 21 }, (_, i) => `<path d='M800 600L${f(-1200 + i * 200)} ${H}' stroke='#2ee6ff' stroke-opacity='0.5' stroke-width='2'/>`).join("")}${Array.from({ length: 9 }, (_, i) => `<path d='M0 ${f(600 + i * i * 5 + i * 4)}H${W}' stroke='#2ee6ff' stroke-opacity='${f(0.25 + i * 0.05)}' stroke-width='2'/>`).join("")}${stars(70, 0, 0, W, 480, "#9ff0ff", 141)}`),
  "samanyolu": () => doc(
    sky("s", [[0, "#08061a"], [1, "#05040e"]]) + lg("band", [[0, "#d8d0ff", 0], [0.5, "#d8d0ff", 0.3], [1, "#d8d0ff", 0]], [0, 0, 1, 1]) + lg("core", [[0, "#e0b860", 0], [0.5, "#e0b860", 0.25], [1, "#e0b860", 0]], [0, 0, 1, 1]),
    `${rect("url(#s)")}<path d='M-200 1000L700 -100H1200L300 1100Z' fill='url(#band)'/><path d='M150 900L850 0H1050L350 1000Z' fill='url(#core)'/>${stars(380, 0, 0, W, H, "#ffffff", 151, 0.03)}${(() => { reseed(155); let d = ""; for (let i = 0; i < 300; i += 1) { const t = rnd(); const x = Math.round(-100 + t * 1300 + (rnd() - 0.5) * 380); const y = Math.round(1000 - t * 1100 + (rnd() - 0.5) * 200); d += `M${x} ${y}h0`; } return `<path d='${d}' stroke='#fff6e0' stroke-width='2' stroke-linecap='round' opacity='0.7'/>`; })()}${ridge(900, 60, 100, "#05040e", 17, false)}`),
  "gun-batimi-okyanusu": () => doc(
    sky("s", [[0, "#1a0c2a"], [0.4, "#4a1a50"], [0.62, "#c0441e"], [0.64, "#2a0c30"], [1, "#120a18"]]) + lg("sun", [[0, "#ffe08a"], [1, "#ff4f6b"]]),
    `${rect("url(#s)")}<circle cx='800' cy='620' r='230' fill='url(#sun)'/>${Array.from({ length: 7 }, (_, i) => `<rect x='560' y='${f(560 + i * 12 + i * i * 1.4)}' width='480' height='${4 + i * 1.6}' fill='#4a1a50'/>`).join("")}<rect y='640' width='${W}' height='360' fill='#1a0a24'/>${reflect(800, 652, 460, 24, "#ff8a5a")}`),
  "kar-gecesi": () => doc(
    sky("s", [[0, "#0c1828"], [0.7, "#1a2a44"], [1, "#08101c"]]),
    `${rect("url(#s)")}${hills(700, 120, 1.4, "#c8dcf0", 0.3)}${hills(820, 90, 2, "#9ab4d0", 1.6)}${[[300, 640], [380, 660], [1180, 690]].map(([x, y]) => `<path d='M${x - 40} ${y}L${x} ${y - 40}L${x + 40} ${y}V${y + 44}H${x - 40}Z' fill='#2a3a54'/><rect x='${x - 12}' y='${y + 10}' width='24' height='20' fill='#ffd98a'/>`).join("")}${forest(10, 880, 120, 200, "#1a2a40", 161)}${stars(220, 0, 0, W, H, "#ffffff", 163, 0)}`),
  "espresso": () => doc(
    sky("s", [[0, "#1e140c"], [1, "#120c08"]]) + rg("cr", [[0, "#d4a070", 0.55], [0.7, "#8a5228", 0.45], [1, "#3a2010", 0.6]]),
    `${rect("url(#s)")}<circle cx='1180' cy='560' r='300' fill='#2a1a10'/><circle cx='1180' cy='560' r='250' fill='url(#cr)'/><path d='M1180 400C1260 460 1100 520 1180 580S1100 680 1180 720' stroke='#f0dcc0' stroke-opacity='0.5' stroke-width='14' fill='none' stroke-linecap='round'/><path d='M1480 520Q1580 560 1480 620' stroke='#2a1a10' stroke-width='40' fill='none'/>${[[260, 300], [420, 760], [180, 640], [600, 220]].map(([x, y], i) => `<ellipse cx='${x}' cy='${y}' rx='46' ry='32' transform='rotate(${i * 40} ${x} ${y})' fill='#5a3418'/><path d='M${x - 30} ${y}Q${x} ${y - 14} ${x + 30} ${y}' transform='rotate(${i * 40} ${x} ${y})' stroke='#2a1a10' stroke-width='5' fill='none'/>`).join("")}${[0, 1, 2].map((i) => `<path d='M${1120 + i * 60} 240C${1090 + i * 60} 180 ${1150 + i * 60} 140 ${1120 + i * 60} 80' stroke='#e8cbb0' stroke-opacity='0.2' stroke-width='10' fill='none' stroke-linecap='round'/>`).join("")}`),
  "gece-bahcesi": () => doc(
    sky("s", [[0, "#0e1c14"], [1, "#08120c"]]) + glow("f", "#e870a8", 0.6),
    `${rect("url(#s)")}${Array.from({ length: 16 }, (_, i) => { const x = 50 + i * 100; return `<path d='M${x} ${H}C${x - 30} 800 ${x + 40} 700 ${x + 10} ${f(560 + ((i * 53) % 200))}' stroke='#1e4a2e' stroke-width='8' fill='none'/><ellipse cx='${x + 40}' cy='${f(780 + ((i * 37) % 120))}' rx='40' ry='16' transform='rotate(-30 ${x + 40} ${f(780 + ((i * 37) % 120))})' fill='#2a6a40'/>`; }).join("")}${[[160, 520], [470, 600], [760, 500], [1060, 590], [1340, 520], [620, 760], [1200, 780]].map(([x, y], i) => `<circle cx='${x}' cy='${y}' r='90' fill='url(#f)'/>${Array.from({ length: 6 }, (_, k) => `<ellipse cx='${x}' cy='${y - 22}' rx='12' ry='22' transform='rotate(${k * 60} ${x} ${y})' fill='${i % 2 ? "#ffb3cc" : "#e870a8"}'/>`).join("")}<circle cx='${x}' cy='${y}' r='9' fill='#ffe08a'/>`).join("")}`),
  "elektrik-mavisi": () => doc(
    sky("s", [[0, "#06102c"], [1, "#040a1c"]]) + glow("g", "#2ee0ff", 0.5),
    `${rect("url(#s)")}${blob(400, 400, 420, 320, "url(#g)")}${[[120, 0, "M120 0L220 180L160 220L300 420L240 450L420 700"], [1300, 0, "M1300 0L1220 160L1290 200L1150 380L1230 420L1080 640"], [700, 1000, "M700 1000L760 820L700 790L820 620L760 590L880 420"]].map(([, , d]) => `<path d='${d}' stroke='#2ee0ff' stroke-opacity='0.35' stroke-width='18' fill='none' stroke-linejoin='round'/><path d='${d}' stroke='#e6f6ff' stroke-width='4' fill='none' stroke-linejoin='round'/>`).join("")}${Array.from({ length: 12 }, (_, i) => `<path d='M${f(i * 140)} ${H}V${f(860 - (i % 3) * 60)}H${f(i * 140 + 80)}' stroke='#0d62d0' stroke-opacity='0.6' stroke-width='3' fill='none'/><circle cx='${f(i * 140 + 80)}' cy='${f(860 - (i % 3) * 60)}' r='6' fill='#2ee0ff'/>`).join("")}`),
  "sedef": () => doc(
    sky("s", [[0, "#16181e"], [1, "#0e1014"]]) + lg("n", [[0, "#e8a0b8", 0.55], [0.33, "#a0c8e8", 0.5], [0.66, "#c8b8f0", 0.5], [1, "#b8e8d8", 0.45]], [0, 0, 1, 1]) + rg("p", [[0, "#ffffff"], [0.4, "#f8f0f4"], [1, "#a8a0b8"]], { fx: "35%", fy: "30%" }) + rg("nn", [[0, "#e8a0b8", 0.45], [1, "#e8a0b8", 0]]) + rg("n2", [[0, "#a0c8e8", 0.4], [1, "#a0c8e8", 0]]),
    `${rect("url(#s)")}<path d='M1200 760C1000 760 900 560 1000 380C1080 240 1320 240 1400 380C1500 560 1400 760 1200 760Z' fill='url(#n)'/>${Array.from({ length: 9 }, (_, i) => `<path d='M1200 760L${f(1000 + i * 50)} ${f(380 - Math.sin((i / 8) * Math.PI) * 120)}' stroke='#ffffff' stroke-opacity='0.25' stroke-width='4'/>`).join("")}${Array.from({ length: 11 }, (_, i) => `<circle cx='${f(140 + i * 70)}' cy='${f(700 + Math.sin(i * 0.6) * 60)}' r='26' fill='url(#p)'/>`).join("")}${blob(380, 240, 520, 300, "url(#nn)")}${blob(560, 200, 260, 180, "url(#n2)")}`),
  "karbon": () => doc(
    sky("s", [[0, "#141416"], [1, "#0a0a0b"]]) + `<pattern id='w' width='24' height='24' patternUnits='userSpaceOnUse'><rect width='24' height='24' fill='#0e0e10'/><rect width='12' height='12' fill='#1a1a1e'/><rect x='12' y='12' width='12' height='12' fill='#1a1a1e'/><path d='M0 0L12 12M12 12L24 24' stroke='#26262c' stroke-width='2'/></pattern>` + lg("o", [[0, "#c0500c", 0], [0.5, "#ff7a1f", 0.85], [1, "#c0500c", 0]], [0, 0, 1, 0]),
    `${rect("url(#w)")}<rect width='${W}' height='${H}' fill='url(#s)' opacity='0.55'/><path d='M0 760L${W} 420' stroke='url(#o)' stroke-width='10'/><path d='M0 800L${W} 460' stroke='#ffffff' stroke-opacity='0.08' stroke-width='3'/><path d='M900 0L1200 0L700 1000L400 1000Z' fill='#ffffff' opacity='0.03'/>`),
};

module.exports = { SCENES };
