// Builds the Descall+ / Descall Ultra logo drafts: SVG files, sheet.html and PNG renders.
// Run: node docs/design/premium-logo/build.cjs   (needs the Playwright install under /opt/node22)
const fs = require("fs");
const path = require("path");
const { chromium } = require("/opt/node22/lib/node_modules/playwright");

const OUT = __dirname;
const WORDMARK_SVG = path.join(__dirname, "../../brand/new-logo/svg/descall-wordmark-white.svg");
const WORDMARK_D = fs.readFileSync(WORDMARK_SVG, "utf8").match(/ d="([^"]+)"/)[1];

// ---------- palette (tied to the brand: #587AF5 blue, #393C4D charcoal) ----------
const C = {
  plus: ["#A99BFF", "#6A60EF"], // violet step next to the brand blue (brand blue itself is the staff badge)
  ultra: ["#FFCB5C", "#E97A2C"], // warm gold to amber
  plusInk: "#FFFFFF",
  ultraInk: "#2B2D3A", // brand charcoal, a touch deeper
  charcoal: "#393C4D",
  blue: "#587AF5",
};

// ---------- geometry helpers ----------
const n = (v) => +v.toFixed(3);
const P = (cx, cy, r, a) => [cx + r * Math.cos((a * Math.PI) / 180), cy + r * Math.sin((a * Math.PI) / 180)];
const xy = (p) => `${n(p[0])} ${n(p[1])}`;

/** Thick arc with round ends as a filled outline (angles in degrees, clockwise on screen, a1 > a0). */
function arc(cx, cy, r, w, a0, a1) {
  const R = r + w / 2, ri = r - w / 2, h = w / 2, L = a1 - a0 > 180 ? 1 : 0;
  return `M${xy(P(cx, cy, R, a0))}A${n(R)} ${n(R)} 0 ${L} 1 ${xy(P(cx, cy, R, a1))}A${n(h)} ${n(h)} 0 0 1 ${xy(P(cx, cy, ri, a1))}A${n(ri)} ${n(ri)} 0 ${L} 0 ${xy(P(cx, cy, ri, a0))}A${n(h)} ${n(h)} 0 0 1 ${xy(P(cx, cy, R, a0))}Z`;
}
const circle = (cx, cy, r) => `M${n(cx - r)} ${n(cy)}a${n(r)} ${n(r)} 0 1 0 ${n(2 * r)} 0a${n(r)} ${n(r)} 0 1 0 ${n(-2 * r)} 0Z`;

/** Plus sign with round arm ends as one outline. L = centre to arm tip. */
function plus(cx, cy, L, w) {
  const h = w / 2, e = L - h;
  const p = (x, y) => `${n(cx + x)} ${n(cy + y)}`;
  const A = `A${n(h)} ${n(h)} 0 0 1 `;
  return `M${p(-h, -e)}${A}${p(h, -e)}L${p(h, -h)}L${p(e, -h)}${A}${p(e, h)}L${p(h, h)}L${p(h, e)}${A}${p(-h, e)}L${p(-h, h)}L${p(-e, h)}${A}${p(-e, -h)}L${p(-h, -h)}Z`;
}

/** Circle with one square (slightly rounded) corner: a chat bubble. rot 0 = corner bottom-left, 180 = top-right. */
function bubble(cx, cy, r, cr, rot = 0) {
  const t = (x, y) => {
    const a = (rot * Math.PI) / 180, dx = x - cx, dy = y - cy;
    return xy([cx + dx * Math.cos(a) - dy * Math.sin(a), cy + dx * Math.sin(a) + dy * Math.cos(a)]);
  };
  return `M${t(cx, cy + r)}L${t(cx - r + cr, cy + r)}A${cr} ${cr} 0 0 1 ${t(cx - r, cy + r - cr)}L${t(cx - r, cy)}A${r} ${r} 0 1 1 ${t(cx, cy + r)}Z`;
}
const rrect = (x, y, w, h, r) => `M${n(x + r)} ${n(y)}H${n(x + w - r)}A${r} ${r} 0 0 1 ${n(x + w)} ${n(y + r)}V${n(y + h - r)}A${r} ${r} 0 0 1 ${n(x + w - r)} ${n(y + h)}H${n(x + r)}A${r} ${r} 0 0 1 ${n(x)} ${n(y + h - r)}V${n(y + r)}A${r} ${r} 0 0 1 ${n(x + r)} ${n(y)}Z`;

// The brand symbol (docs/brand/new-logo): two 257-degree rings around (40.5,59.5) / (59.5,40.5), centre dot at (50,50).
const BRAND_RING_A0 = 6.3, BRAND_RING_A1 = 263.7;
const brandLink = (w, dot) => [arc(40.5, 59.5, 21.5, w, BRAND_RING_A0, BRAND_RING_A1), arc(59.5, 40.5, 21.5, w, BRAND_RING_A0 + 180, BRAND_RING_A1 + 180), circle(50, 50, dot)].join("");

// ---------- marks ----------
// A layer: { d, paint: "main" | "alt" | "ink" | "sheen", stroke?, mask? }. evenodd everywhere, so holes are real holes.
const marks = {};
const def = (id, tier, layers, opt = {}) => (marks[id] = { id, tier, layers, pad: opt.pad ?? 0.03, tile: !!opt.tile, mask: opt.mask || null });

// A - Halka (link): Plus = one brand ring and a plus in its open side; Ultra = the full link, closed with the dot.
def("A-plus", "plus", [{ d: arc(40.5, 59.5, 21.5, 11.5, BRAND_RING_A0, BRAND_RING_A1) + plus(62, 38, 12.5, 10.5), paint: "main" }]);
def("A-plus-small", "plus", [{ d: arc(40.5, 59.5, 21.5, 13.5, BRAND_RING_A0, BRAND_RING_A1) + plus(66.5, 33.5, 17, 10.5), paint: "main" }]);
def("A-ultra", "ultra", [{ d: brandLink(11.5, 5.75), paint: "main", rule: "nonzero" }]);
def("A-ultra-small", "ultra", [{ d: brandLink(13.5, 6.75), paint: "main", rule: "nonzero" }]);

// B - Yayin (signal): the brand centre dot is the person; Plus has one ring, Ultra a second ring turned 180 degrees.
def("B-plus", "plus", [{ d: circle(12, 12, 2.7) + arc(12, 12, 7.6, 3.3, BRAND_RING_A0, BRAND_RING_A1), paint: "main" }]);
def("B-plus-small", "plus", [{ d: circle(12, 12, 3.0) + arc(12, 12, 7.6, 3.9, BRAND_RING_A0, BRAND_RING_A1), paint: "main" }]);
def("B-ultra", "ultra", [{ d: circle(12, 12, 2.3) + arc(12, 12, 6.1, 2.7, BRAND_RING_A0, BRAND_RING_A1) + arc(12, 12, 10.4, 2.7, BRAND_RING_A0 + 180, BRAND_RING_A1 + 180), paint: "main" }]);
// Small: the outer ring shrinks to a cap over the inner ring's opening, so fewer stroke ends meet at 16 px.
def("B-ultra-small", "ultra", [{ d: circle(12, 12, 2.6) + arc(12, 12, 6.3, 3.0, BRAND_RING_A0, BRAND_RING_A1) + arc(12, 12, 11.2, 2.9, 245, 385), paint: "main" }]);

// C - Balon (bubble): the ring's open quadrant becomes a bubble corner. Ultra = a Plus bubble behind a gold one, on the brand diagonal.
def("C-plus", "plus", [{ d: bubble(12, 12, 10, 2.8) + plus(12, 12, 5.2, 3.2), paint: "main" }]);
def("C-plus-small", "plus", [{ d: bubble(12, 12, 10, 2.8) + plus(12, 12, 5.6, 3.8), paint: "main" }]);
const cFront = bubble(9.4, 14.6, 8.2, 2.4), cBack = bubble(15, 9, 7, 2.2, 180);
def("C-ultra", "ultra", [{ d: cBack, paint: "alt", mask: true }, { d: cFront + plus(9.4, 14.6, 4.2, 2.8), paint: "main" }], { mask: { d: cFront, gap: 1.5 } });
const cFrontS = bubble(9.6, 14.4, 8.4, 2.4), cBackS = bubble(15.2, 8.8, 7, 2.2, 180);
def("C-ultra-small", "ultra", [{ d: cBackS, paint: "alt", mask: true }, { d: cFrontS + plus(9.6, 14.4, 4.4, 3.3), paint: "main" }], { mask: { d: cFrontS, gap: 1.8 } });

// D - Harf (letter tile): the app-icon squircle with "+" or a "U" drawn from the brand ring, dot inside.
const U = (w) => `M7.6 6.9V12.6A4.4 4.4 0 0 0 16.4 12.6V6.9`;
def("D-plus", "plus", [{ d: rrect(1, 1, 22, 22, 5.6), paint: "main" }, { d: plus(12, 12, 6.1, 3.4), paint: "ink" }], { tile: true, pad: 0 });
def("D-plus-small", "plus", [{ d: rrect(1, 1, 22, 22, 5.6), paint: "main" }, { d: plus(12, 12, 6.6, 4.2), paint: "ink" }], { tile: true, pad: 0 });
def("D-ultra", "ultra", [
  { d: rrect(1, 1, 22, 22, 5.6), paint: "main" },
  { d: rrect(2.6, 2.6, 18.8, 18.8, 4.2), paint: "sheen", stroke: 0.55 },
  { d: U(), paint: "ink", stroke: 3.1 },
  { d: circle(12, 11.3, 1.55), paint: "ink" },
], { tile: true, pad: 0 });
def("D-ultra-small", "ultra", [
  { d: rrect(1, 1, 22, 22, 5.6), paint: "main" },
  { d: "M7.2 6.4V12.4A4.8 4.8 0 0 0 16.8 12.4V6.4", paint: "ink", stroke: 3.9 },
], { tile: true, pad: 0 });

const CONCEPTS = [
  { key: "A", name: "Halka", idea: "Logodaki bağlantı halkasından doğar. Descall+ tek halka ve açık ucuna takılmış bir artı; Ultra iki halkası ve merkez noktasıyla tamamlanmış bağın kendisi, altın renkte." },
  { key: "B", name: "Yayın", idea: "Logonun merkez noktası kişiyi, halkalar sesin yayılmasını anlatır. Descall+ tek halka, Ultra ters yöne dönmüş ikinci bir halka ekler: daha fazla yayın, daha üst seviye." },
  { key: "C", name: "Balon", idea: "Halkanın açık köşesi kare bir köşeye dönüşür ve sohbet balonu olur. Descall+ artılı tek balon; Ultra'da önde altın balon, arkasında Plus balonu durur: Ultra, Plus'ı da içerir." },
  { key: "D", name: "Harf", idea: "Uygulama ikonunun yuvarlak karesi üzerinde net bir harf. Descall+ artı işareti, Ultra halka yayından çizilmiş bir U ve merkez noktası; en kolay okunan, bugünkü rozete en yakın seçenek." },
];

// ---------- SVG output ----------
function render(mark, vb, o = {}) {
  // o: { mono: color, monoAlt: opacity, idp: id prefix, size, ink: override }
  const idp = o.idp || "";
  const tier = C[mark.tier];
  const altTier = C.plus; // the back layer in C-ultra is the Plus bubble
  const defs = [];
  const gid = (k) => `${idp}${k}`;
  if (!o.mono) {
    defs.push(`<linearGradient id="${gid("g")}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${tier[0]}"/><stop offset="1" stop-color="${tier[1]}"/></linearGradient>`);
    if (mark.layers.some((l) => l.paint === "alt")) defs.push(`<linearGradient id="${gid("a")}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${altTier[0]}"/><stop offset="1" stop-color="${altTier[1]}"/></linearGradient>`);
  }
  if (mark.mask) defs.push(`<mask id="${gid("m")}" maskUnits="userSpaceOnUse" x="${vb[0] - 5}" y="${vb[1] - 5}" width="${vb[2] + 10}" height="${vb[3] + 10}"><rect x="${vb[0] - 5}" y="${vb[1] - 5}" width="${vb[2] + 10}" height="${vb[3] + 10}" fill="#fff"/><path d="${mark.mask.d}" fill="#000" stroke="#000" stroke-width="${mark.mask.gap * 2}" stroke-linejoin="round"/></mask>`);
  const ink = o.ink || (mark.tier === "ultra" ? C.ultraInk : C.plusInk);
  const body = mark.layers.map((l) => {
    let paint, extra = "";
    if (l.paint === "main") paint = o.mono || `url(#${gid("g")})`;
    else if (l.paint === "alt") { paint = o.mono || `url(#${gid("a")})`; if (o.mono) extra += ` opacity="${o.monoAlt ?? 0.5}"`; }
    else if (l.paint === "ink") paint = ink;
    else if (l.paint === "sheen") { if (o.mono) return ""; paint = "rgba(255,255,255,0.55)"; }
    if (l.mask) extra += ` mask="url(#${gid("m")})"`;
    if (l.stroke) return `<path d="${l.d}" fill="none" stroke="${paint}" stroke-width="${l.stroke}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;
    return `<path d="${l.d}" fill="${paint}"${l.rule === "nonzero" ? "" : ' fill-rule="evenodd"'}${extra}/>`;
  }).join("");
  const size = o.size ? ` width="${o.size}" height="${o.size}"` : "";
  const cls = o.cls ? ` class="${o.cls}"` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.map(n).join(" ")}"${size}${cls}${o.label ? ` role="img" aria-label="${o.label}"` : ""}>${defs.length ? `<defs>${defs.join("")}</defs>` : ""}${body}</svg>`;
}

async function measure(browser) {
  // Square viewBox centred on each mark's real bounding box.
  const page = await browser.newPage();
  const html = Object.values(marks).map((m) => `<svg id="${m.id}" viewBox="-200 -200 400 400" width="400" height="400">${m.layers.filter((l) => !l.mask).map((l) => `<path d="${l.d}" ${l.stroke ? `fill="none" stroke="#000" stroke-width="${l.stroke}"` : ""}/>`).join("")}${m.layers.filter((l) => l.mask).map((l) => `<path d="${l.d}"/>`).join("")}</svg>`).join("");
  await page.setContent(`<body>${html}</body>`);
  const boxes = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll("svg")].map((s) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of s.querySelectorAll("path")) {
      const b = p.getBBox(), sw = +(p.getAttribute("stroke-width") || 0) / 2;
      x0 = Math.min(x0, b.x - sw); y0 = Math.min(y0, b.y - sw); x1 = Math.max(x1, b.x + b.width + sw); y1 = Math.max(y1, b.y + b.height + sw);
    }
    return [s.id, [x0, y0, x1, y1]];
  })));
  await page.close();
  for (const m of Object.values(marks)) {
    const [x0, y0, x1, y1] = boxes[m.id];
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, side = Math.max(x1 - x0, y1 - y0) * (1 + 2 * m.pad);
    m.vb = [cx - side / 2, cy - side / 2, side, side];
    m.bbox = boxes[m.id];
  }
}

// ---------- sheet ----------
let uid = 0;
const inl = (id, o = {}) => render(marks[id], marks[id].vb, { ...o, idp: `u${++uid}-` });
const pick = (k, tier, px) => (px <= 18 ? `${k}-${tier}-small` : `${k}-${tier}`);
const tierName = (t) => (t === "plus" ? "Descall+" : "Descall Ultra");

function lockup(k, tier, dark) {
  const ink = dark ? "#FFFFFF" : C.charcoal;
  const m = marks[`${k}-${tier}`];
  const t = C[tier];
  const gid = `lk${++uid}`;
  // Mark box 78 tall left of the wordmark, as in the brand's horizontal lockup.
  const s = 78 / m.vb[3];
  const markG = `<g transform="translate(0 -76.5) scale(${n(s)}) translate(${n(-m.vb[0])} ${n(-m.vb[1])})">${render(m, m.vb, { idp: gid + "m" }).replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "")}</g>`;
  const suffix = tier === "plus"
    ? `<path d="${plus(482, -25.6, 22, 12.4)}" fill="url(#${gid})"/>`
    : `<text x="468" y="0" font-family="Inter Display, Inter, sans-serif" font-weight="700" font-size="93" letter-spacing="-1.5" fill="url(#${gid})">ultra</text>`;
  return `<svg class="fit" viewBox="-10 -90 760 105"><defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t[0]}"/><stop offset="1" stop-color="${t[1]}"/></linearGradient></defs>${markG}<path transform="translate(104 0)" fill="${ink}" d="${WORDMARK_D}"/>${suffix}</svg>`;
}

function badgeRow(k, dark, px) {
  return ["plus", "ultra"].map((tier) => `
    <div class="msg">
      <div class="av av-${tier}"></div>
      <div class="msg-body">
        <div class="msg-head"><span class="uname" style="font-size:${px === 14 ? 13.5 : 15}px">Demirr</span><span class="badge" style="width:${px}px;height:${px}px">${inl(pick(k, tier, px), { label: tierName(tier) })}</span><span class="time">bugün 21:4${tier === "plus" ? 2 : 3}</span></div>
        <div class="msg-text">${tier === "plus" ? "akşam ses kanalında mısın?" : "geliyorum, ekran paylaşımını açıyorum"}</div>
      </div>
    </div>`).join("");
}

function tile(k, tier, kind) {
  const m = marks[`${k}-${tier}`];
  if (m.tile) return `<span class="tile32 raw">${inl(`${k}-${tier}`)}</span>`;
  if (kind === "filled") {
    return `<span class="tile32 t-${tier}">${inl(`${k}-${tier}`, { mono: tier === "plus" ? "#FFFFFF" : C.ultraInk, monoAlt: 0.45 })}</span>`;
  }
  return `<span class="tile32 t-neutral">${inl(`${k}-${tier}`)}</span>`;
}

function settingsNav(k, dark) {
  const isTile = marks[`${k}-plus`].tile;
  const kinds = isTile ? ["raw"] : ["filled", "neutral"];
  return kinds.map((kind) => `
    <div class="nav">
      <div class="nav-cap">${kind === "raw" ? "işaretin kendisi 32 px kare" : kind === "filled" ? "dolu kare, tek renk işaret" : "nötr kare, renkli işaret"}</div>
      ${["plus", "ultra"].map((tier) => `<div class="nav-item${tier === "ultra" ? " on" : ""}">${tile(k, tier, kind)}<span>${tierName(tier)}</span></div>`).join("")}
      <div class="nav-item muted"><span class="tile32 t-gray"></span><span>Bildirimler</span></div>
    </div>`).join("");
}

function section(c) {
  const k = c.key;
  const big = (tier, dark) => `<div class="card ${dark ? "dark" : "light"}"><div class="cap">${tierName(tier)} · ${dark ? "koyu" : "açık"} · 128 px</div><div class="big">${inl(`${k}-${tier}`, { size: 128, label: tierName(tier) })}</div></div>`;
  const smalls = ["plus", "ultra"].map((tier) => [24, 20, 16, 14].map((s) => `<span class="sz">${inl(pick(k, tier, s), { size: s })}</span>`).join("")).join('<span class="sep"></span>');
  return `
  <section class="concept" id="concept-${k}">
    <header><div class="key">${k}</div><div><h2>${c.name}</h2><p>${c.idea}</p></div></header>
    <div class="grid4">${big("plus", true)}${big("plus", false)}${big("ultra", true)}${big("ultra", false)}</div>
    <div class="grid2">
      <div class="card dark pad"><div class="cap">Profil rozeti · 16 px · koyu</div>${badgeRow(k, true, 16)}<div class="cap mt">14 px</div>${badgeRow(k, true, 14)}</div>
      <div class="card light pad"><div class="cap">Profil rozeti · 16 px · açık</div>${badgeRow(k, false, 16)}<div class="cap mt">14 px</div>${badgeRow(k, false, 14)}</div>
    </div>
    <div class="grid2">
      <div class="card dark pad"><div class="cap">Ayarlar menüsü · 32 px kare</div><div class="navs">${settingsNav(k, true)}</div><div class="cap mt">Boyut merdiveni · 24 / 20 / 16 / 14 px${marks[`${k}-plus-small`] ? " (16 ve 14 px küçük çizim)" : ""}</div><div class="ladder">${smalls}</div></div>
      <div class="card light pad"><div class="cap">Ayarlar menüsü · 32 px kare</div><div class="navs">${settingsNav(k, false)}</div><div class="cap mt">Boyut merdiveni · 24 / 20 / 16 / 14 px</div><div class="ladder">${smalls}</div></div>
    </div>
    <div class="grid2">
      <div class="card dark pad lock"><div class="cap">Yazı birleşimi</div>${lockup(k, "plus", true)}${lockup(k, "ultra", true)}</div>
      <div class="card light pad lock"><div class="cap">Yazı birleşimi</div>${lockup(k, "plus", false)}${lockup(k, "ultra", false)}</div>
    </div>
  </section>`;
}

function sheet() {
  return `<!doctype html>
<html lang="tr"><head><meta charset="utf-8"><title>Descall+ / Descall Ultra · logo taslakları</title>
<style>
  :root { --bg:#1B1C24; --card-d:#2A2C38; --card-l:#F3F4F8; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:#E8E9F0; font-family: Inter, system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
  .page { width: 1240px; margin: 0 auto; padding: 48px 40px 24px; }
  .page > h1 { font: 700 34px/1.1 "Inter Display", Inter, sans-serif; margin: 0 0 6px; letter-spacing:-0.01em; }
  .page > .sub { color:#8E91A6; margin:0 0 32px; font-size:14px; }
  .concept { background:#20212B; border:1px solid #2C2E3B; border-radius:20px; padding:28px; margin-bottom:28px; }
  header { display:flex; gap:16px; align-items:flex-start; margin-bottom:20px; }
  .key { width:44px; height:44px; border-radius:12px; background:${C.blue}; color:#fff; display:grid; place-items:center; font:700 22px "Inter Display", Inter; flex:none; }
  h2 { margin:0 0 4px; font:700 24px "Inter Display", Inter, sans-serif; }
  header p { margin:0; color:#A6A9BC; font-size:14px; line-height:1.5; max-width: 900px; }
  .grid4 { display:grid; grid-template-columns:repeat(4,1fr); gap:14px; margin-bottom:14px; }
  .grid2 { display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-bottom:14px; }
  .card { border-radius:14px; position:relative; }
  .card.dark { background:var(--card-d); color:#F2F3F5; }
  .card.light { background:var(--card-l); color:#1F2130; }
  .card.pad { padding:16px 18px 18px; }
  .cap { font-size:10.5px; letter-spacing:.08em; text-transform:uppercase; color:#8A8DA2; font-weight:600; }
  .card.light .cap { color:#7A7D90; }
  .grid4 .cap { position:absolute; top:12px; left:14px; }
  .cap.mt { margin-top:14px; }
  .big { height:230px; display:grid; place-items:center; padding-top:14px; }
  .big svg { display:block; }
  .msg { display:flex; gap:12px; padding:10px 0 2px; }
  .av { width:36px; height:36px; border-radius:50%; flex:none; background:linear-gradient(160deg,#6B7CF6,#3A3F8F); }
  .av-ultra { background:linear-gradient(160deg,#F08F6B,#7C3B5E); }
  .msg-head { display:flex; align-items:center; line-height:20px; }
  .uname { font-weight:600; }
  .badge { display:inline-flex; margin-left:5px; flex:none; }
  .badge svg { width:100%; height:100%; display:block; }
  .time { font-size:11.5px; color:#8A8DA2; margin-left:8px; }
  .msg-text { font-size:14.5px; line-height:20px; opacity:.86; }
  .navs { display:flex; gap:14px; margin-top:10px; }
  .nav { flex:1; border-radius:12px; padding:8px; }
  .card.dark .nav { background:#232530; }
  .card.light .nav { background:#FFFFFF; border:1px solid #E3E5EC; }
  .nav-cap { font-size:10.5px; color:#8A8DA2; padding:2px 6px 6px; }
  .nav-item { display:flex; align-items:center; gap:10px; padding:6px; border-radius:9px; font-size:14px; font-weight:500; }
  .card.dark .nav-item.on { background:rgba(255,255,255,.06); }
  .card.light .nav-item.on { background:#EEF0F6; }
  .nav-item.muted { opacity:.55; }
  .tile32 { width:32px; height:32px; border-radius:9px; display:grid; place-items:center; flex:none; }
  .tile32 svg { width:20px; height:20px; display:block; }
  .tile32.raw svg { width:32px; height:32px; }
  .tile32.t-plus { background:linear-gradient(180deg,${C.plus[0]},${C.plus[1]}); }
  .tile32.t-ultra { background:linear-gradient(180deg,${C.ultra[0]},${C.ultra[1]}); }
  .card.dark .tile32.t-neutral { background:#33364A; box-shadow: inset 0 0 0 1px rgba(255,255,255,.06); }
  .card.light .tile32.t-neutral { background:#F1F2F7; box-shadow: inset 0 0 0 1px #E1E3EA; }
  .tile32.t-gray { background:#6b6f80; }
  .ladder { display:flex; align-items:center; gap:14px; margin-top:12px; }
  .ladder .sz svg { display:block; }
  .ladder .sep { width:1px; height:24px; background:rgba(128,128,150,.35); margin:0 6px; }
  .lock svg.fit { display:block; height:44px; width:auto; margin-top:16px; }
  footer { color:#6F7286; font-size:12px; padding: 4px 0 24px; }
</style></head>
<body><div class="page">
  <h1>Descall+ ve Descall Ultra · logo taslakları</h1>
  <p class="sub">Dört konsept, her biri iki seviye. Hepsi Descall logosundaki halka, merkez nokta ve 45 derecelik eksenden türetildi. Mor = Descall+, altın = Ultra (marka mavisi yetkili rozetinde kullanılıyor).</p>
  ${CONCEPTS.map(section).join("")}
  <footer>docs/design/premium-logo · taslak, uygulamaya bağlı değil</footer>
</div>
<script>
  // Fit each lockup's viewBox to its content so the row sits flush.
  for (const s of document.querySelectorAll("svg.fit")) {
    const b = s.getBBox(); const p = 2;
    s.setAttribute("viewBox", [b.x - p, b.y - p, b.width + 2 * p, b.height + 2 * p].join(" "));
  }
</script>
</body></html>`;
}

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
  await measure(browser);
  for (const m of Object.values(marks)) {
    fs.writeFileSync(path.join(OUT, `${m.id}.svg`), render(m, m.vb, { label: tierName(m.tier) }) + "\n");
  }
  fs.writeFileSync(path.join(OUT, "sheet.html"), sheet());
  const page = await browser.newPage({ viewport: { width: 1240, height: 900 }, deviceScaleFactor: 2 });
  await page.goto("file://" + path.join(OUT, "sheet.html"));
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(OUT, "overview.png"), fullPage: true });
  for (const c of CONCEPTS) {
    await page.locator(`#concept-${c.key}`).screenshot({ path: path.join(OUT, `concept-${c.key}.png`) });
  }
  // Centring report: offset of each mark's box centre from its viewBox centre, in % of the side.
  for (const m of Object.values(marks)) {
    const [x0, y0, x1, y1] = m.bbox, [vx, vy, s] = m.vb;
    const dx = ((x0 + x1) / 2 - (vx + s / 2)) / s * 100, dy = ((y0 + y1) / 2 - (vy + s / 2)) / s * 100;
    if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) console.log("off-centre", m.id, dx.toFixed(2), dy.toFixed(2));
  }
  await browser.close();
  console.log("ok", Object.keys(marks).length, "marks");
})();
