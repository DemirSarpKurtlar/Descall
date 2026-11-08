/**
 * Builds the HTML page for one Reel. The page exposes window.__setTime(seconds), which
 * puts every element in its state at that moment (pure function of t), so frames are
 * deterministic and can be captured one by one.
 */
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { BRAND, REPO_ROOT, SPEC } from "../config.mjs";
import { buildTimeline, resolveScript } from "../script.mjs";

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** "Bir *vurgu* satırı" -> escaped HTML with the accent span. */
export function lineHtml(line) {
  const parts = String(line).split("*");
  return parts.map((p, i) => (i % 2 ? `<span class="acc">${esc(p)}</span>` : esc(p))).join("");
}

const ICONS = {
  hash: '<path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"/>',
  voice: '<path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>',
  stage: '<circle cx="12" cy="12" r="2.5"/><path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M5 5a10 10 0 0 0 0 14M19 5a10 10 0 0 1 0 14"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  shield: '<path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6z"/>',
};
const icon = (name, cls = "ic") => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ""}</svg>`;

const AVATAR_COLORS = [
  ["#f472b6", "#e11d48"],
  ["#2dd4bf", "#0d9488"],
  ["#fbbf24", "#f97316"],
  ["#a78bfa", "#6366f1"],
  ["#60a5fa", "#2563eb"],
  ["#34d399", "#059669"],
];
const ROLE_COLORS = ["#f25f5c", "#8eacff", "#2ad4b8", "#fbbf24", "#c084fc", "#94a3b8"];

function itemText(it) {
  return typeof it === "string" ? it : it?.name ?? it?.label ?? "";
}

/** One visual block. `t0` is when items start entering. */
function visualHtml(visual, t0, tOut, screenshots) {
  if (!visual) return "";
  const items = Array.isArray(visual.items) ? visual.items : [];
  const step = Math.min(0.32, 1.5 / Math.max(1, items.length));
  const at = (i) => (t0 + i * step).toFixed(2);
  const anim = (i, kind = "rise") => `data-a="${kind}" data-in="${at(i)}" data-out="${tOut}"`;
  switch (visual.type) {
    case "chips":
      return `<div class="v chips">${items.map((it, i) => `<div class="chip" ${anim(i, "pop")}>${lineHtml(itemText(it))}</div>`).join("")}</div>`;
    case "keys":
      return `<div class="v keys">${items
        .map((it, i) => {
          const combo = String(typeof it === "string" ? it : it.keys).split("+").map((k) => `<kbd>${esc(k.trim())}</kbd>`).join('<span class="plus">+</span>');
          const label = typeof it === "object" && (it.name || it.label) ? `<div class="klabel">${lineHtml(it.name || it.label)}</div>` : "";
          return `<div class="krow" ${anim(i)}><div class="combo">${combo}</div>${label}</div>`;
        })
        .join("")}</div>`;
    case "channels":
      return `<div class="v panel channels">${items
        .map((it, i) => {
          const kind = typeof it === "object" ? it.kind || "text" : "text";
          const ic = kind === "voice" ? "voice" : kind === "stage" ? "stage" : "hash";
          const active = typeof it === "object" && it.active ? " active" : "";
          return `<div class="chan${active}" ${anim(i, "slide")}>${icon(ic)}<span>${esc(itemText(it))}</span></div>`;
        })
        .join("")}</div>`;
    case "voice":
      return `<div class="v voice">${items
        .map((it, i) => {
          const name = itemText(it);
          const [a, b] = AVATAR_COLORS[i % AVATAR_COLORS.length];
          return `<div class="tile" ${anim(i, "pop")}><div class="av${i === 0 ? " speaking" : ""}" style="background:linear-gradient(135deg,${a},${b})">${esc(name.slice(0, 1).toLocaleUpperCase("tr-TR"))}</div><div class="tname">${esc(name)}</div></div>`;
        })
        .join("")}</div>`;
    case "roles":
      return `<div class="v panel roles">${items
        .map((it, i) => `<div class="role" ${anim(i, "slide")}><span class="dot" style="background:${ROLE_COLORS[i % ROLE_COLORS.length]}"></span><span class="rname" style="color:${ROLE_COLORS[i % ROLE_COLORS.length]}">${esc(itemText(it))}</span></div>`)
        .join("")}</div>`;
    case "toggles":
      return `<div class="v panel toggles">${items
        .map((it, i) => `<div class="tog" ${anim(i, "slide")}><span class="tl">${lineHtml(itemText(it))}</span><span class="sw" data-on="${(Number(at(i)) + 0.45).toFixed(2)}"><span class="knob"></span></span></div>`)
        .join("")}</div>`;
    case "checklist":
      return `<div class="v list">${items.map((it, i) => `<div class="li" ${anim(i, "slide")}><span class="bullet ok">${icon("check", "ic sm")}</span><span>${lineHtml(itemText(it))}</span></div>`).join("")}</div>`;
    case "steps":
      return `<div class="v list">${items.map((it, i) => `<div class="li" ${anim(i, "slide")}><span class="bullet num">${i + 1}</span><span>${lineHtml(itemText(it))}</span></div>`).join("")}</div>`;
    case "stat":
      return `<div class="v stat" ${anim(0, "pop")}><div class="sv">${lineHtml(visual.value)}</div>${visual.label ? `<div class="sl">${lineHtml(visual.label)}</div>` : ""}</div>`;
    case "screenshot": {
      const shot = screenshots[visual.ref];
      if (!shot) return "";
      const src = pathToFileURL(join(REPO_ROOT, shot.file)).href;
      const c = shot.crop;
      const boxH = 780;
      const scale = boxH / c.h;
      const boxW = Math.round(c.w * scale);
      return `<div class="v shot" ${anim(0, "float")} style="width:${boxW}px;height:${boxH}px"><img src="${src}" style="width:${Math.round(scale * (shot.width || 1320))}px;left:${-Math.round(c.x * scale)}px;top:${-Math.round(c.y * scale)}px"></div>`;
    }
    default:
      return "";
  }
}

function fontFaces() {
  const f = (path, weight) => `@font-face{font-family:"DescallInter";font-weight:${weight};font-style:normal;src:url("${pathToFileURL(path).href}") format("woff2");}`;
  return [f(BRAND.fonts.medium, 500), f(BRAND.fonts.semibold, 600), f(BRAND.fonts.bold, 700)].join("\n");
}

function svgInline(path, cls) {
  return readFileSync(path, "utf8").replace("<svg ", `<svg class="${cls}" `);
}

/**
 * @param {object} raw script
 * @param {object} o { screenshots, mode: "video" | "cover" }
 * @returns {{ html: string, total: number }}
 */
export function buildHtml(raw, { screenshots = {}, mode = "video" } = {}) {
  const s = resolveScript(raw);
  const { segments, total } = buildTimeline(s);
  const segHtml = [];
  for (const seg of segments) {
    const tOut = seg.kind === "cta" ? (total + 5).toFixed(2) : (seg.end - 0.32).toFixed(2);
    const t = (x) => (seg.start + x).toFixed(2);
    if (seg.kind === "hook") {
      segHtml.push(`<section class="seg hook">
  <div class="kicker" data-a="fade" data-in="0.00" data-out="${tOut}">${esc(s.kicker)}</div>
  ${s.hook.lines.map((l, i) => `<h1 class="fit" data-a="pop" data-in="${(0.05 + i * 0.16).toFixed(2)}" data-out="${tOut}">${lineHtml(l)}</h1>`).join("\n  ")}
</section>`);
    } else if (seg.kind === "scene") {
      const sc = s.scenes[seg.index];
      const lines = sc.lines.map((l, i) => `<h2 class="fit" data-a="rise" data-in="${t(0.04 + i * 0.13)}" data-out="${tOut}">${lineHtml(l)}</h2>`).join("\n  ");
      const vStart = seg.start + 0.25 + sc.lines.length * 0.13;
      segHtml.push(`<section class="seg scene">
  <div class="lines">${lines}</div>
  ${visualHtml(sc.visual, vStart, tOut, screenshots)}
</section>`);
    } else {
      segHtml.push(`<section class="seg cta">
  <div class="logo-wrap" data-a="pop" data-in="${t(0.02)}" data-out="${tOut}">${svgInline(BRAND.symbolSvg, "logo-big")}</div>
  ${s.cta.lines.map((l, i) => `<h2 class="fit center" data-a="rise" data-in="${t(0.18 + i * 0.14)}" data-out="${tOut}">${lineHtml(l)}</h2>`).join("\n  ")}
  <div class="v chips center">${s.cta.chips.map((c, i) => `<div class="chip" data-a="pop" data-in="${t(0.6 + i * 0.12)}" data-out="${tOut}">${esc(c)}</div>`).join("")}</div>
</section>`);
    }
  }

  const coverHtml = `<section class="seg hook cover">
  <div class="kicker">${esc(s.kicker)}</div>
  ${s.hook.lines.map((l) => `<h1 class="fit">${lineHtml(l)}</h1>`).join("\n  ")}
  <div class="cover-url">descall.com</div>
</section>`;

  const html = `<!doctype html>
<html lang="tr"><head><meta charset="utf-8">
<style>
${fontFaces()}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${SPEC.width}px;height:${SPEC.height}px;overflow:hidden;background:${BRAND.bg}}
body{font-family:"DescallInter",Inter,system-ui,sans-serif;color:${BRAND.text};-webkit-font-smoothing:antialiased;position:relative}
.bg{position:absolute;inset:0;overflow:hidden}
.orb{position:absolute;border-radius:50%;filter:blur(110px);opacity:.55}
.orb.a{width:900px;height:900px;background:${BRAND.blue};left:-300px;top:-220px}
.orb.b{width:760px;height:760px;background:${BRAND.accent2};right:-360px;bottom:120px;opacity:.28}
.orb.c{width:620px;height:620px;background:#6d5ae6;left:180px;bottom:-380px;opacity:.35}
.grid{position:absolute;inset:0;background-image:radial-gradient(rgba(255,255,255,.07) 1.6px,transparent 1.6px);background-size:44px 44px;mask-image:linear-gradient(180deg,transparent,#000 25%,#000 70%,transparent)}
.brand{position:absolute;left:90px;top:228px;display:flex;align-items:center;gap:18px}
.brand .sym{width:58px;height:58px}
.brand .wm{height:34px;width:auto}
.progress{position:absolute;left:90px;right:150px;top:318px;height:6px;border-radius:6px;background:rgba(255,255,255,.12);overflow:hidden}
.progress i{display:block;height:100%;width:0;background:linear-gradient(90deg,${BRAND.accent},${BRAND.accent2});border-radius:6px}
.seg{position:absolute;left:90px;right:150px;top:390px;bottom:500px;display:flex;flex-direction:column;justify-content:center;gap:54px;visibility:hidden}
.seg .lines{display:flex;flex-direction:column;gap:10px}
.kicker{align-self:flex-start;font-weight:600;font-size:34px;letter-spacing:.06em;text-transform:uppercase;color:${BRAND.accent};padding:14px 26px;border:1.5px solid rgba(142,172,255,.45);border-radius:999px;background:rgba(88,122,245,.12)}
.hook{gap:22px}
h1{font-weight:700;font-size:118px;line-height:1.04;letter-spacing:-.035em;white-space:nowrap}
h2{font-weight:700;font-size:86px;line-height:1.08;letter-spacing:-.03em;white-space:nowrap}
.center{text-align:center;align-self:center}
.acc{background:linear-gradient(92deg,${BRAND.accent} 10%,${BRAND.accent2} 95%);-webkit-background-clip:text;background-clip:text;color:transparent}
.v{font-size:50px;font-weight:600}
.chips{display:flex;flex-wrap:wrap;gap:20px}
.chips.center{justify-content:center}
.chip{padding:26px 42px;border-radius:999px;background:${BRAND.surface};border:1.5px solid rgba(255,255,255,.14);box-shadow:0 18px 40px rgba(0,0,0,.35)}
.panel{background:${BRAND.surface};border:1.5px solid rgba(255,255,255,.12);border-radius:44px;padding:34px 36px;box-shadow:0 30px 60px rgba(0,0,0,.4);display:flex;flex-direction:column;gap:6px}
.ic{width:52px;height:52px;flex:none;color:${BRAND.muted}}
.ic.sm{width:36px;height:36px;color:#08090d}
.chan{display:flex;align-items:center;gap:22px;padding:16px 22px;border-radius:22px;color:${BRAND.muted}}
.chan.active{background:rgba(88,122,245,.22);color:#fff}
.chan.active .ic{color:#fff}
.voice{display:grid;grid-template-columns:1fr 1fr;gap:24px}
.tile{background:${BRAND.surface};border:1.5px solid rgba(255,255,255,.12);border-radius:36px;height:250px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px}
.av{width:132px;height:132px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:62px;font-weight:700;color:#fff}
.av.speaking{box-shadow:0 0 0 7px ${BRAND.bg},0 0 0 13px #3ddc84}
.tname{font-size:40px;color:${BRAND.muted}}
.role{display:flex;align-items:center;gap:22px;padding:14px 18px}
.dot{width:26px;height:26px;border-radius:50%;flex:none}
.rname{font-weight:700}
.tog{display:flex;align-items:center;justify-content:space-between;gap:24px;padding:18px 16px}
.tl{font-size:48px}
.sw{position:relative;width:132px;height:76px;border-radius:999px;background:rgba(255,255,255,.18);flex:none}
.knob{position:absolute;top:8px;left:8px;width:60px;height:60px;border-radius:50%;background:#fff;box-shadow:0 4px 10px rgba(0,0,0,.35)}
.list{display:flex;flex-direction:column;gap:30px}
.li{display:flex;align-items:center;gap:26px}
.bullet{width:74px;height:74px;border-radius:50%;flex:none;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:34px}
.bullet.ok{background:${BRAND.accent2}}
.bullet.num{background:${BRAND.blue};color:#fff}
.keys{display:flex;flex-direction:column;gap:30px}
.krow{display:flex;flex-direction:column;gap:12px}
.combo{display:flex;align-items:center;gap:14px}
kbd{font-family:inherit;font-weight:700;font-size:52px;min-width:96px;text-align:center;padding:16px 26px;border-radius:22px;background:linear-gradient(180deg,#232a3d,#161b28);border:1.5px solid rgba(255,255,255,.18);box-shadow:0 8px 0 #0b0e16,0 18px 30px rgba(0,0,0,.4)}
.plus{color:${BRAND.muted};font-size:40px}
.klabel{font-size:42px;color:${BRAND.muted};font-weight:500}
.stat{display:flex;flex-direction:column;gap:8px}
.sv{font-size:220px;font-weight:700;letter-spacing:-.05em;line-height:1}
.sl{font-size:52px;color:${BRAND.muted};font-weight:600}
.shot{position:relative;align-self:center;overflow:hidden;border-radius:56px;box-shadow:0 40px 90px rgba(0,0,0,.55)}
.shot img{position:absolute}
.cta{align-items:center;gap:30px}
.logo-wrap{width:210px;height:210px;border-radius:56px;background:linear-gradient(140deg,${BRAND.blue},#3f5fe0);display:flex;align-items:center;justify-content:center;box-shadow:0 30px 80px rgba(88,122,245,.55);margin-bottom:24px}
.logo-big{width:140px;height:140px}
.cover{visibility:visible;justify-content:center}
.cover-url{margin-top:30px;font-size:44px;font-weight:600;color:${BRAND.muted}}
</style></head>
<body class="${mode}">
<div class="bg"><div class="orb a"></div><div class="orb b"></div><div class="orb c"></div><div class="grid"></div></div>
<div class="brand">${svgInline(BRAND.symbolSvg, "sym")}${svgInline(BRAND.wordmarkSvg, "wm")}</div>
${mode === "cover" ? "" : '<div class="progress"><i></i></div>'}
${mode === "cover" ? coverHtml : segHtml.join("\n")}
<script>
(() => {
  const TOTAL = ${total};
  const SEGS = ${JSON.stringify(segments)};
  const clamp = (x) => Math.max(0, Math.min(1, x));
  const easeOut = (x) => 1 - Math.pow(1 - x, 3);
  const easeBack = (x) => { const c1 = 1.5, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };

  // Shrink a line until it fits its box (deterministic, once).
  function fit() {
    for (const el of document.querySelectorAll(".fit")) {
      const max = el.closest(".seg").clientWidth;
      let size = parseFloat(getComputedStyle(el).fontSize);
      while (el.scrollWidth > max && size > 30) { size -= 2; el.style.fontSize = size + "px"; }
    }
  }

  const animated = [...document.querySelectorAll("[data-a]")].map((el) => ({ el, kind: el.dataset.a, tin: +el.dataset.in, tout: +el.dataset.out }));
  const switches = [...document.querySelectorAll(".sw")].map((el) => ({ el, on: +el.dataset.on, knob: el.querySelector(".knob") }));
  const speaking = [...document.querySelectorAll(".av.speaking")];
  const sections = [...document.querySelectorAll("section.seg:not(.cover)")];
  const orbs = [...document.querySelectorAll(".orb")];
  const bar = document.querySelector(".progress i");

  window.__setTime = (t) => {
    sections.forEach((sec, i) => {
      const s = SEGS[i];
      sec.style.visibility = t >= s.start - 0.001 && t < s.end + (s.kind === "cta" ? 99 : 0.02) ? "visible" : "hidden";
    });
    for (const a of animated) {
      const pin = clamp((t - a.tin) / (a.kind === "fade" ? 0.4 : 0.5));
      const pout = clamp((t - a.tout) / 0.3);
      let op = easeOut(pin) * (1 - pout);
      let tf = "";
      if (a.kind === "pop") { const k = pin < 1 ? 0.82 + 0.18 * easeBack(pin) : 1; tf = "scale(" + k.toFixed(4) + ") translateY(" + ((1 - easeOut(pin)) * 30 - pout * 40).toFixed(2) + "px)"; }
      else if (a.kind === "slide") tf = "translateX(" + ((1 - easeOut(pin)) * -60).toFixed(2) + "px) translateY(" + (-pout * 30).toFixed(2) + "px)";
      else if (a.kind === "float") tf = "translateY(" + ((1 - easeOut(pin)) * 80 + Math.sin(t * 1.6) * 8 - pout * 40).toFixed(2) + "px)";
      else if (a.kind === "rise") tf = "translateY(" + ((1 - easeOut(pin)) * 48 - pout * 36).toFixed(2) + "px)";
      a.el.style.opacity = op.toFixed(4);
      a.el.style.transform = tf;
      if (a.kind === "pop" || a.kind === "rise") a.el.style.transformOrigin = "left center";
      if (a.el.classList.contains("center") || a.el.closest(".cta")) a.el.style.transformOrigin = "center";
    }
    for (const s of switches) {
      const p = easeOut(clamp((t - s.on) / 0.35));
      s.knob.style.transform = "translateX(" + (p * 56).toFixed(2) + "px)";
      s.el.style.background = p > 0.5 ? "${BRAND.blue}" : "rgba(255,255,255,.18)";
    }
    for (const el of speaking) {
      const g = 0.5 + 0.5 * Math.sin(t * 7.5);
      el.style.boxShadow = "0 0 0 7px ${BRAND.bg}, 0 0 0 " + (11 + g * 5).toFixed(2) + "px rgba(61,220,132," + (0.65 + 0.35 * g).toFixed(3) + ")";
    }
    orbs.forEach((o, i) => {
      const k = i + 1;
      o.style.transform = "translate(" + (Math.sin(t * 0.21 * k + k) * 70).toFixed(1) + "px," + (Math.cos(t * 0.17 * k + 2 * k) * 60).toFixed(1) + "px)";
    });
    if (bar) bar.style.width = (Math.min(1, t / TOTAL) * 100).toFixed(3) + "%";
  };

  window.__ready = document.fonts.ready.then(() => { fit(); window.__setTime(${mode === "cover" ? 0 : 0}); return { total: TOTAL, fonts: [...document.fonts].filter((f) => f.status === "loaded").length }; });
})();
</script>
</body></html>`;
  return { html, total };
}
