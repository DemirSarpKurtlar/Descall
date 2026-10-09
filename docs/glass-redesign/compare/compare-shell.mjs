// Stage 2 compare: navigation shell (tab bar, toolbar, large title, search, status menu)
// real app (shotkit fake iOS, html.glass-ui, 440×956 @3x) vs approved mockup.
// Usage: node compare-shell.mjs --port 3106 --status-port 3107 --version 2.9.154 [--only 02-chats]
import { chromium } from "playwright-core";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";
import fs from "node:fs";
import path from "node:path";

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith("--") ? [...a, [v.slice(2), arr[i + 1]]] : a), []));
const PORT = Number(args.port || 3106);
const STATUS_PORT = Number(args["status-port"] || 3107);
const VERSION = args.version || "2.9.154";
const OUT = path.join(path.dirname(new URL(import.meta.url).pathname), "shell");
fs.mkdirSync(OUT, { recursive: true });
const FINAL = new URL("../final", import.meta.url).pathname.replace(/\/$/, "");
const INJECT = fs.readFileSync(new URL("../shotkit/inject.js", import.meta.url), "utf8");
const VIEW = { width: 440, height: 956 };
const DSF = Number(args.dsf || 3);
const SAFE = { top: 62, bottom: 34 };
const GLASS_CSS = fs.readFileSync(`${FINAL}/src/glass.css`, "utf8");
const CHROME_CSS = [...GLASS_CSS.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/(?<=^|\})()\s*([^{}]*)\{([^{}]*)\}/g)]
  .filter((m) => /(^|,)\s*\.(status-bar|home-indicator)/.test(m[2].trim()))
  .map((m) => `${m[2].trim()} { ${m[3]} }`)
  .join("\n") + "\n.status-bar, .home-indicator { font-family: Inter, sans-serif !important; color: #fff; }";

const TAB_PAIRS = [
  ["tabbar", ".tabbar", ".g-tabbar"],
  ["tab-lens", ".tabbar .tab.on", ".g-tab-lens"],
  ["tab-on-icon", ".tabbar .tab.on svg", ".g-tab.on svg"],
  ["tab-on-label", ".tabbar .tab.on span:not(.dotb)", ".g-tab.on .g-tab-label"],
  ...[1, 2, 3, 4, 5, 6, 7].map((i) => [`tab-${i}`, `.tabbar .tab:nth-of-type(${i})`, `.g-tabbar .g-tab:nth-of-type(${i})`]),
  ["badge-chat", ".tabbar .tab:nth-of-type(1) .dotb", ".g-tabbar .g-tab:nth-of-type(1) .g-dotb"],
  ["badge-friends", ".tabbar .tab:nth-of-type(5) .dotb", ".g-tabbar .g-tab:nth-of-type(5) .g-dotb"],
];
const HEAD_PAIRS = [
  ["toolbar", ".toolbar", ".g-toolbar"],
  ["me-btn", ".toolbar .me-btn", ".g-toolbar .g-me-btn"],
  ["me-avatar", ".toolbar .me-btn .av", ".g-toolbar .g-me-av"],
  ["bgroup", ".toolbar .bgroup", ".g-toolbar .g-bgroup"],
  ...[1, 2, 3, 4].map((i) => [`bgroup-btn-${i}`, `.toolbar .bgroup > span:nth-of-type(${i})`, `.g-toolbar .g-bgroup-btn:nth-of-type(${i})`]),
  ["plus", ".toolbar .cbtn", ".g-toolbar .g-cbtn"],
  ["plus-icon", ".toolbar .cbtn svg", ".g-toolbar .g-cbtn svg"],
  ["inline-title", ".toolbar .inline-title", ".g-toolbar .g-inline-title"],
  ["large-title", ".large-title", ".g-large-title"],
  ["large-title-sub", ".large-title small", ".g-large-title small"],
  ["search", ".searchbar", ".g-searchbar"],
  ["search-icon", ".searchbar svg", ".g-searchbar > svg"],
];
const MENU_PAIRS = [
  ["menu", ".menu", ".g-status-menu"],
  ["menu-head-1", ".menu .mhead:nth-of-type(1)", ".g-status-menu .status-picker-header"],
  ...[0, 1, 2, 3].map((i) => [`menu-status-${i + 1}`, [".menu .mi", i], [".g-status-menu .status-picker-item", i]]),
  ["menu-dot-1", [".menu .mi > span", 0], [".g-status-menu .status-picker-dot", 0]],
  ["menu-check", ".menu .mi.on .r svg", ".g-status-menu .g-status-check"],
  ["menu-sep-1", [".menu .msep", 0], [".g-status-menu .status-picker-divider", 0]],
  ["menu-head-2", [".menu .mhead", 1], ".g-status-menu .status-picker-custom-label"],
  ["menu-field", ".menu .field-in", ".g-status-menu .status-picker-input-wrap"],
  ["menu-save", [".menu .btn", 0], [".g-status-menu .status-picker-btn", 0]],
  ["menu-cancel", [".menu .btn", 1], [".g-status-menu .status-picker-btn", 1]],
  ["menu-sep-2", [".menu .msep", 1], [".g-status-menu .status-picker-divider", 1]],
  ["menu-settings", [".menu .mi", 4], [".g-status-menu .status-picker-item", 4]],
  ["menu-me-lens", ".me-btn.lens", ".g-status-me"],
  ["scrim", ".scrim", ".g-scrim"],
];

const SCREENS = [
  { id: "02-chats", route: "/direct", pairs: [...HEAD_PAIRS, ...TAB_PAIRS] },
  { id: "02b-groups", route: "/groups", pairs: [...HEAD_PAIRS, ...TAB_PAIRS] },
  { id: "09-friends", route: "/friends", pairs: [...HEAD_PAIRS, ...TAB_PAIRS] },
  { id: "11-servers", route: "/servers", pairs: [...HEAD_PAIRS, ...TAB_PAIRS] },
  { id: "19-calls", route: "/calls", pairs: [...HEAD_PAIRS, ...TAB_PAIRS] },
  { id: "20-activity", route: "/activity", pairs: [...HEAD_PAIRS, ...TAB_PAIRS] },
  { id: "18-status", route: "/direct", action: "status", port: STATUS_PORT, pairs: [...MENU_PAIRS, ...HEAD_PAIRS.slice(0, 3), ...TAB_PAIRS.slice(0, 4)] },
].filter((s) => !args.only || args.only.split(",").includes(s.id));

const STYLE_PROPS = ["fontSize", "fontWeight", "letterSpacing", "lineHeight", "color", "borderRadius", "backdropFilter", "backgroundImage", "boxShadow"];

const collect = ([pairs, side]) => {
  const pick = (sel) => {
    if (Array.isArray(sel)) return document.querySelectorAll(sel[0])[sel[1]] || null;
    return document.querySelector(sel);
  };
  const out = {};
  for (const p of pairs) {
    const el = pick(side === "mock" ? p[1] : p[2]);
    if (!el) { out[p[0]] = null; continue; }
    const b = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const st = {};
    for (const k of ["fontSize", "fontWeight", "letterSpacing", "lineHeight", "color", "borderRadius", "backdropFilter", "backgroundImage", "boxShadow"]) st[k] = cs[k];
    let text = null;
    if (el.childElementCount === 0 || /title|label|head|mi|status|btn|save|cancel|settings/.test(p[0])) text = (el.innerText || el.value || "").trim().replace(/\s+/g, " ");
    out[p[0]] = { x: b.x, y: b.y, w: b.width, h: b.height, st, text };
  }
  return out;
};

const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", headless: true, args: ["--font-render-hinting=none", "--lang=tr-TR"] });

async function shootMockup(scr, chromeOnly) {
  const page = await browser.newPage({ viewport: VIEW, deviceScaleFactor: DSF });
  await page.goto(`file://${FINAL}/src/screens/${scr.id}.html`);
  await page.evaluate(() => document.fonts.ready);
  const chrome = await page.evaluate(() => ({ status: document.querySelector(".status-bar").outerHTML, home: document.querySelector(".home-indicator").outerHTML }));
  const geo = await page.evaluate(collect, [scr.pairs, "mock"]).catch(() => ({}));
  if (chromeOnly) {
    // Content rows (Stage 3–6), the announcements count (no API for it) → out of scope.
    await page.addStyleTag({ content: ".content, .chips, .toolbar .bgroup .nb { visibility: hidden !important; } .phone > div[style*='position:absolute'][style*='top:178px'] { visibility: hidden !important; }" });
  }
  const file = `${OUT}/${scr.id}-mockup${chromeOnly ? "-chrome" : ""}.png`;
  await page.screenshot({ path: file });
  await page.close();
  return { file, geo, chrome };
}

async function shootApp(scr, chrome, chromeOnly) {
  const port = scr.port || PORT;
  const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: DSF, isMobile: true, hasTouch: true, locale: "tr-TR", timezoneId: "Europe/Istanbul", reducedMotion: "reduce", colorScheme: "dark" });
  await ctx.addInitScript(INJECT);
  const user = { id: "00000000-0000-4000-8000-000000000001", username: "deniz", displayName: "Deniz", birthDate: "2000-05-05", ...(scr.action === "status" ? { customStatus: "🔥 Ranked arıyorum" } : {}) };
  await ctx.addInitScript((u) => { localStorage.setItem("descall_language", "tr"); localStorage.setItem("descall:cookie_consent_v1", JSON.stringify({ choice: "rejected", at: "2026-10-01T00:00:00.000Z" })); localStorage.setItem("descall_token", "demo.fake.token"); localStorage.setItem("descall_user", JSON.stringify(u)); }, user);
  await ctx.route(/.*/, async (r) => {
    const u = new URL(r.request().url());
    if (u.protocol === "data:" || u.protocol === "blob:") return r.continue();
    if (u.hostname === "localhost" || /onrender\.com$/.test(u.hostname)) {
      if (u.protocol !== "http:" || String(u.port) !== String(port)) { try { const x = await r.fetch({ url: `http://localhost:${port}${u.pathname}${u.search}` }); return r.fulfill({ response: x }); } catch { return r.abort(); } }
      return r.continue();
    }
    return r.abort();
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 300)));
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: { top: SAFE.top, bottom: SAFE.bottom, left: 0, right: 0 } });
  await page.goto(`http://localhost:${port}${scr.route}`, { waitUntil: "load", timeout: 60000 }).catch(() => {});
  await page.waitForSelector(".g-tabbar", { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(2500);
  if (scr.action === "status") {
    await page.click(".g-toolbar .g-me-btn");
    await page.waitForSelector(".g-status-menu", { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(600);
  }
  const geo = await page.evaluate(collect, [scr.pairs, "app"]);
  const state = await page.evaluate(() => ({ cls: document.documentElement.className, font: getComputedStyle(document.querySelector(".g-tab") || document.body).fontFamily }));
  if (chromeOnly) {
    await page.addStyleTag({ content: ".app-sidebar-shell .sidebar-content, .server-owned-banner, .app-notif-banner, .app-feedback-banner { opacity: 0 !important; }" });
  }
  await page.evaluate(({ css, status, home }) => {
    const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
    const wrap = document.createElement("div");
    wrap.style.cssText = "position:fixed;inset:0;z-index:2147483647;pointer-events:none;font-size:15px;letter-spacing:-0.012em";
    wrap.innerHTML = status + home; document.body.appendChild(wrap);
  }, { css: CHROME_CSS, ...chrome });
  const file = `${OUT}/${scr.id}-app${chromeOnly ? "-chrome" : ""}.png`;
  await page.screenshot({ path: file });
  await ctx.close();
  return { file, geo, state, errors };
}

const readPng = (f) => PNG.sync.read(fs.readFileSync(f));
function pixelDiff(aFile, bFile, outFile, masks = []) {
  const a = readPng(aFile), b = readPng(bFile);
  const { width, height } = a;
  const out = new PNG({ width, height });
  pixelmatch(a.data, b.data, out.data, width, height, { threshold: 0.1, includeAA: false, alpha: 0.25 });
  const S = DSF;
  const inMask = (x, y) => y < SAFE.top * S || y >= (VIEW.height - SAFE.bottom) * S || masks.some((m) => m && x >= m.x * S && x < (m.x + m.w) * S && y >= m.y * S && y < (m.y + m.h) * S);
  let total = 0, over8 = 0, over32 = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (inMask(x, y)) continue;
    total++;
    const i = (y * width + x) * 4;
    const d = Math.max(Math.abs(a.data[i] - b.data[i]), Math.abs(a.data[i + 1] - b.data[i + 1]), Math.abs(a.data[i + 2] - b.data[i + 2]));
    if (d > 8) over8++;
    if (d > 32) over32++;
  }
  fs.writeFileSync(outFile, PNG.sync.write(out));
  return { over8: +(100 * over8 / total).toFixed(3), over32: +(100 * over32 / total).toFixed(3) };
}

function sideBySide(files, outFile) {
  const ims = files.map(readPng);
  const gap = 12 * DSF / 3;
  const W = ims.reduce((s, i) => s + i.width, 0) + gap * (ims.length - 1);
  const H = Math.max(...ims.map((i) => i.height));
  const out = new PNG({ width: W, height: H });
  out.data.fill(40);
  let ox = 0;
  for (const im of ims) {
    for (let y = 0; y < im.height; y++) im.data.copy(out.data, (y * W + ox) * 4, y * im.width * 4, (y + 1) * im.width * 4);
    ox += im.width + gap;
  }
  fs.writeFileSync(outFile, PNG.sync.write(out));
}

const results = {};
for (const scr of SCREENS) {
  const m = await shootMockup(scr, false);
  const mc = await shootMockup(scr, true);
  const a = await shootApp(scr, m.chrome, false);
  const ac = await shootApp(scr, m.chrome, true);
  // Geometry
  const geo = [];
  for (const [k] of scr.pairs) {
    const mg = m.geo[k], ag = a.geo[k];
    if (!mg && !ag) continue;
    if (!mg || !ag) { geo.push({ k, ok: false, note: !mg ? "app only" : "missing in app", mg, ag }); continue; }
    const d = Math.max(Math.abs(mg.x - ag.x), Math.abs(mg.y - ag.y), Math.abs(mg.w - ag.w), Math.abs(mg.h - ag.h));
    const styleDiff = {};
    for (const p of STYLE_PROPS) if (mg.st[p] !== ag.st[p]) styleDiff[p] = [mg.st[p], ag.st[p]];
    geo.push({ k, ok: d <= 1, d: +d.toFixed(2), mg, ag, styleDiff, textM: mg.text, textA: ag.text });
  }
  // Known data-only regions: own avatar picture (mockup "D" gradient vs account avatar).
  const masks = [a.geo["me-avatar"], m.geo["me-avatar"], a.geo["menu-me-lens"] && { ...a.geo["menu-me-lens"] }].filter(Boolean);
  const px = pixelDiff(mc.file, ac.file, `${OUT}/${scr.id}-diff-chrome.png`, masks);
  sideBySide([m.file, a.file], `${OUT}/${scr.id}-side-by-side.png`);
  sideBySide([mc.file, ac.file, `${OUT}/${scr.id}-diff-chrome.png`], `${OUT}/${scr.id}-chrome-side-by-side.png`);
  const okN = geo.filter((g) => g.ok).length;
  results[scr.id] = { geoOk: okN, geoTotal: geo.length, px, geo, errors: a.errors, state: a.state };
  console.log(scr.id, `geo ${okN}/${geo.length}`, "px", JSON.stringify(px), a.errors.length ? `ERR ${a.errors[0]}` : "");
  for (const g of geo.filter((g) => !g.ok)) console.log("   ✗", g.k, g.note || `d=${g.d}`, g.mg ? JSON.stringify({ x: g.mg.x, y: g.mg.y, w: g.mg.w, h: g.mg.h }) : "-", g.ag ? JSON.stringify({ x: g.ag.x, y: g.ag.y, w: g.ag.w, h: g.ag.h }) : "-");
}
fs.writeFileSync(`${OUT}/results-${VERSION}.json`, JSON.stringify(results, null, 2));
await browser.close();
