// Stage compare: real app (shotkit fake-iOS shell, html.glass-ui) vs approved mockup.
// Usage: node compare.mjs [--port 3100] [--version 2.9.151]
// Writes: <screen>-app.png, <screen>-mockup.png, <screen>-diff.png,
//         01-login-side-by-side.png, report-<version>.html, results.json
import { chromium } from "playwright-core";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";
import fs from "node:fs";
import path from "node:path";

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith("--") ? [...a, [v.slice(2), arr[i + 1]]] : a), []));
const PORT = Number(args.port || 3100);
const VERSION = args.version || "2.9.151";
const OUT = path.dirname(new URL(import.meta.url).pathname);
const FINAL = new URL("../final", import.meta.url).pathname.replace(/\/$/, "");
const INJECT = fs.readFileSync(new URL("../shotkit/inject.js", import.meta.url), "utf8");
const VIEW = { width: 440, height: 956 };
const DSF = 3;
const SAFE = { top: 62, bottom: 34 };
const GLASS_CSS = fs.readFileSync(`${FINAL}/src/glass.css`, "utf8");
const CHROME_CSS = [...GLASS_CSS.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/(?<=^|\})()\s*([^{}]*)\{([^{}]*)\}/g)]
  .filter((m) => /(^|,)\s*\.(status-bar|home-indicator)/.test(m[2].trim()))
  .map((m) => `${m[2].trim()} { ${m[3]} }`)
  .join("\n") + "\n.status-bar, .home-indicator { font-family: Inter, sans-serif !important; color: #fff; }";

const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", headless: true, args: ["--font-render-hinting=none", "--lang=tr-TR"] });

// ── Elements compared 1:1 (app selector, mockup locator fn) ──
const APP_SEL = {
  logo: ".g-auth-mark img",
  title: ".g-auth-title",
  tagline: ".g-auth-tagline",
  card: ".g-auth-card",
  segmented: ".g-auth-card .auth-tabs",
  segLens: ".g-seg-lens",
  apple: ".apple-signin-btn",
  appleIcon: ".apple-signin-btn svg",
  divider: ".auth-divider",
  field1: ".auth-form .input-wrapper:nth-of-type(1)",
  field1Icon: ".auth-form .input-wrapper:nth-of-type(1) .input-icon",
  field2: ".auth-form .input-wrapper:nth-of-type(2)",
  eye: ".auth-password-toggle svg",
  forgot: ".auth-forgot-row",
  submit: ".auth-submit",
  footer: ".auth-footer",
  legal: ".auth-legal-links",
};
const TEXT_KEYS = ["title", "tagline", "segmented", "apple", "divider", "field1", "field2", "forgot", "submit", "footer", "legal"];

async function shootMockup(themeless = true) {
  const page = await browser.newPage({ viewport: VIEW, deviceScaleFactor: DSF });
  await page.goto(`file://${FINAL}/src/screens/01-login.html`);
  await page.evaluate(() => document.fonts.ready);
  // Parity: the real iOS app has no Google button (GoogleSignInButton returns null
  // on native iOS). Remove that row; everything below moves up exactly 60 pt.
  const removed = await page.evaluate(() => {
    const g = [...document.querySelectorAll(".btn")].find((b) => /Google/.test(b.textContent));
    if (!g) return false;
    g.remove();
    return true;
  });
  const chrome = await page.evaluate(() => ({ status: document.querySelector(".status-bar").outerHTML, home: document.querySelector(".home-indicator").outerHTML }));
  const geo = await page.evaluate(() => {
    const c = document.querySelector(".content");
    const card = c.querySelector(".glass.heavy");
    const kids = [...card.children];
    const ps = c.querySelectorAll(":scope > p");
    const r = (el) => { const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; };
    const ink = (el) => { const rg = document.createRange(); rg.selectNodeContents(el); const rs = [...rg.getClientRects()].filter((q) => q.width > 0 && q.height > 0); if (!rs.length) return null; const x = Math.min(...rs.map((q) => q.x)), y = Math.min(...rs.map((q) => q.y)), X = Math.max(...rs.map((q) => q.right)), Y = Math.max(...rs.map((q) => q.bottom)); return { x, y, w: X - x, h: Y - y }; };
    return {
      inkTitle: ink(c.children[1]),
      inkTagline: ink(ps[0]),
      inkFooter: ink(ps[1]),
      inkLegal: ink(ps[2]),
      inkForgot: ink(kids[5]),
      logo: r(c.querySelector("img")),
      title: r(c.children[1]),
      tagline: r(ps[0]),
      card: r(card),
      segmented: r(kids[0]),
      segLens: r(kids[0].querySelector(".lens")),
      apple: r(kids[1]),
      appleIcon: r(kids[1].querySelector("svg")),
      divider: r(kids[2]),
      field1: r(kids[3]),
      field1Icon: r(kids[3].querySelector("svg")),
      field2: r(kids[4]),
      eye: r(kids[4].lastElementChild.querySelector("svg") || kids[4].lastElementChild),
      forgot: r(kids[5]),
      submit: r(kids[6]),
      footer: r(ps[1]),
      legal: r(ps[2]),
    };
  });
  const file = `${OUT}/01-login-mockup.png`;
  await page.screenshot({ path: file });
  const plain = `${OUT}/01-login-mockup-original.png`;
  await page.close();
  fs.copyFileSync(`${FINAL}/01-login.png`, plain);
  return { file, geo, chrome, removed };
}

async function shootApp({ theme = null, name = "01-login-app", chrome, fill = true, display = null } = {}) {
  const ctx = await browser.newContext({
    viewport: VIEW,
    deviceScaleFactor: DSF,
    isMobile: true,
    hasTouch: true,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
    locale: "tr-TR",
    timezoneId: "Europe/Istanbul",
    colorScheme: "dark",
  });
  if (display) await ctx.addInitScript((d) => { window.__DESCALL_DISPLAY__ = d; }, display);
  await ctx.addInitScript(INJECT);
  await ctx.addInitScript((theme) => {
    try {
      localStorage.setItem("descall_language", "tr");
      localStorage.setItem("descall:cookie_consent_v1", JSON.stringify({ choice: "rejected", at: new Date().toISOString() }));
      localStorage.removeItem("descall_token");
      if (theme) localStorage.setItem("descall_theme", theme);
    } catch {}
  }, theme);
  await ctx.route(/.*/, (route) => {
    const u = route.request().url();
    if (/^(https?|wss?):\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(u) || u.startsWith("data:") || u.startsWith("blob:")) return route.continue();
    return route.abort();
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: { top: SAFE.top, bottom: SAFE.bottom, left: 0, right: 0 } });
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
  await page.waitForSelector(".g-auth-card", { timeout: 20000 });
  if (theme) {
    await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
  }
  if (fill) {
    await page.fill(".auth-form .input-wrapper:nth-of-type(1) input", "demir");
    await page.fill(".auth-form .input-wrapper:nth-of-type(2) input", "descall123");
    await page.evaluate(() => document.activeElement?.blur());
  }
  await page.waitForTimeout(1500); // materialize spring settled
  const state = await page.evaluate(() => ({
    glass: document.documentElement.classList.contains("glass-ui"),
    classes: document.documentElement.className,
    theme: document.documentElement.getAttribute("data-theme"),
    fontTitle: getComputedStyle(document.querySelector(".g-auth-title")).fontFamily,
    blackBars: (() => {
      const html = getComputedStyle(document.querySelector(".g-auth")).backgroundColor;
      return html;
    })(),
  }));
  const geo = await page.evaluate((SEL) => {
    const ink = (el) => { const rg = document.createRange(); rg.selectNodeContents(el); const rs = [...rg.getClientRects()].filter((q) => q.width > 0 && q.height > 0); if (!rs.length) return null; const x = Math.min(...rs.map((q) => q.x)), y = Math.min(...rs.map((q) => q.y)), X = Math.max(...rs.map((q) => q.right)), Y = Math.max(...rs.map((q) => q.bottom)); return { x, y, w: X - x, h: Y - y }; };
    const out = {
      inkTitle: ink(document.querySelector(".g-auth-title")),
      inkTagline: ink(document.querySelector(".g-auth-tagline")),
      inkFooter: ink(document.querySelector(".auth-footer")),
      inkLegal: ink(document.querySelector(".auth-legal-links")),
      inkForgot: ink(document.querySelector(".auth-forgot-row")),
    };
    for (const [k, s] of Object.entries(SEL)) {
      const el = document.querySelector(s);
      if (!el) { out[k] = null; continue; }
      const b = el.getBoundingClientRect();
      out[k] = { x: b.x, y: b.y, w: b.width, h: b.height };
    }
    return out;
  }, APP_SEL);
  // System chrome (status bar / Island / home indicator) is drawn by iOS on device;
  // paint the mockup's identical chrome so the side-by-side reads the same. Masked in the diff.
  if (chrome) {
    await page.evaluate(({ css, status, home }) => {
      const st = document.createElement("style");
      st.textContent = css;
      document.head.appendChild(st);
      const wrap = document.createElement("div");
      wrap.style.cssText = "position:fixed;inset:0;z-index:2147483647;pointer-events:none;font-size:15px;letter-spacing:-0.012em";
      wrap.innerHTML = status + home;
      document.body.appendChild(wrap);
    }, { css: CHROME_CSS, ...chrome });
  }
  const file = `${OUT}/${name}.png`;
  await page.screenshot({ path: file });
  await ctx.close();
  return { file, geo, state, errors };
}

function readPng(f) { return PNG.sync.read(fs.readFileSync(f)); }

function diff(aFile, bFile, outFile, textBoxes) {
  const a = readPng(aFile), b = readPng(bFile);
  const { width, height } = a;
  const out = new PNG({ width, height });
  pixelmatch(a.data, b.data, out.data, width, height, { threshold: 0.1, includeAA: false, alpha: 0.25 });
  // Region accounting (in device px)
  const S = DSF;
  const masked = (x, y) => y < SAFE.top * S || y >= (VIEW.height - SAFE.bottom) * S;
  const inText = (x, y) => textBoxes.some((r) => x >= r.x * S && x < (r.x + r.w) * S && y >= r.y * S && y < (r.y + r.h) * S);
  const strictA = { px: 0, bad: 0 }, textA = { px: 0, bad: 0 };
  // Per-pixel colour distance (max channel delta) for the strict / relaxed limits.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (masked(x, y)) continue;
      const i = (y * width + x) * 4;
      const d = Math.max(Math.abs(a.data[i] - b.data[i]), Math.abs(a.data[i + 1] - b.data[i + 1]), Math.abs(a.data[i + 2] - b.data[i + 2]));
      if (inText(x, y)) { textA.px++; if (d > 64) textA.bad++; }
      else { strictA.px++; if (d > 8) strictA.bad++; }
    }
  }
  fs.writeFileSync(outFile, PNG.sync.write(out));
  return {
    strict: { pixels: strictA.px, over: strictA.bad, pct: +(100 * strictA.bad / strictA.px).toFixed(3), limit: "max channel Δ ≤ 8/255" },
    text: { pixels: textA.px, over: textA.bad, pct: +(100 * textA.bad / Math.max(1, textA.px)).toFixed(3), limit: "max channel Δ ≤ 64/255 (font rasterization)" },
  };
}

function sideBySide(files, labels, outFile) {
  const imgs = files.map(readPng);
  const gap = 60, head = 120;
  const W = imgs.reduce((s, i) => s + i.width, 0) + gap * (imgs.length + 1);
  const H = imgs[0].height + head + gap;
  const out = new PNG({ width: W, height: H });
  out.data.fill(0);
  for (let i = 0; i < out.data.length; i += 4) { out.data[i] = 24; out.data[i + 1] = 25; out.data[i + 2] = 32; out.data[i + 3] = 255; }
  let x0 = gap;
  for (const img of imgs) {
    for (let y = 0; y < img.height; y++) {
      const src = y * img.width * 4;
      const dst = ((y + head) * W + x0) * 4;
      img.data.copy(out.data, dst, src, src + img.width * 4);
    }
    x0 += img.width + gap;
  }
  fs.writeFileSync(outFile, PNG.sync.write(out));
  return { W, H, labels };
}

const mock = await shootMockup();
const app = await shootApp({ chrome: mock.chrome });
const GEO_KEYS = [...Object.keys(APP_SEL), "inkTitle", "inkTagline", "inkFooter", "inkLegal", "inkForgot"];
// Element boxes of text blocks depend on the font's advance widths; the ink rows
// (Range client rects) show where the glyphs land. Text = font-tolerant (±3 pt in x/w).
const FONT_TOL = new Set(["title", "tagline", "footer", "legal", "inkTitle", "inkTagline", "inkFooter", "inkLegal", "inkForgot", "appleIcon"]);
const geoRows = GEO_KEYS.map((k) => {
  const m = mock.geo[k], a = app.geo[k];
  if (!m || !a) return { k, m, a, ok: false, d: null };
  const d = { x: +(a.x - m.x).toFixed(2), y: +(a.y - m.y).toFixed(2), w: +(a.w - m.w).toFixed(2), h: +(a.h - m.h).toFixed(2) };
  const tol = 1;
  const strictOk = Object.values(d).every((v) => Math.abs(v) <= tol);
  // tagline: the box is max-width 270 (wrap point for any language); the mockup's
  // box hugs its manual <br/> — compare the ink instead.
  const fontOk = Math.abs(d.y) <= tol && Math.abs(d.h) <= tol && Math.abs(d.x) <= 3 && Math.abs(d.w) <= 6;
  const kind = k === "tagline" ? "box (see inkTagline)" : FONT_TOL.has(k) ? "font-tolerant" : "strict ±1pt";
  const ok = k === "tagline" ? Math.abs(d.y) <= tol && Math.abs(d.h) <= tol : FONT_TOL.has(k) ? fontOk : strictOk;
  return { k, m, a, d, ok, kind };
});
const textBoxes = TEXT_KEYS.flatMap((k) => [mock.geo[k], app.geo[k]].filter(Boolean)).map((r) => ({ x: r.x - 2, y: r.y - 2, w: r.w + 4, h: r.h + 4 }))
  // the segmented / button / field boxes contain material too: only their text band is relaxed
  .map((r) => r);
const textOnly = [
  ...["title", "tagline", "footer", "legal", "forgot", "divider"].flatMap((k) => [mock.geo[k], app.geo[k]]),
  ...["segmented", "apple", "submit", "field1", "field2"].flatMap((k) => [mock.geo[k], app.geo[k]]).map((r) => r && { x: r.x + 40, y: r.y + r.h / 2 - 11, w: r.w - 80, h: 22 }),
  // Apple glyph: mockup uses a hand-drawn approximation, the app the real Apple logo (HIG).
  ...[mock.geo.appleIcon, app.geo.appleIcon],
].filter(Boolean).map((r) => ({ x: r.x - 2, y: r.y - 2, w: r.w + 4, h: r.h + 4 }));
const px = diff(mock.file, app.file, `${OUT}/01-login-diff.png`, textOnly);
sideBySide([mock.file, app.file, `${OUT}/01-login-diff.png`], ["Mockup (parity: no Google)", `App ${VERSION}`, "Diff"], `${OUT}/01-login-side-by-side.png`);

// Theme spot checks (glass is theme-aware; not compared to a mockup).
const themeShots = [];
for (const t of ["light", "crimson", "sakura"]) {
  try {
    const s = await shootApp({ theme: t, name: `01-login-theme-${t}`, chrome: null });
    themeShots.push({ theme: t, file: path.basename(s.file), state: s.state });
  } catch (e) {
    themeShots.push({ theme: t, error: String(e).slice(0, 200) });
  }
}
// Accessibility states
const a11yShots = [];
for (const [label, display] of [["reduce-transparency", { reduceTransparency: true }], ["increase-contrast", { darkerColors: true }], ["low-power", { lowPower: true }]]) {
  const s = await shootApp({ name: `01-login-${label}`, chrome: null, display });
  a11yShots.push({ label, file: path.basename(s.file), classes: s.state.classes });
}
await browser.close();

const results = { version: VERSION, removedGoogleRow: mock.removed, app: app.state, errors: app.errors, geometry: geoRows, pixels: px, themeShots, a11yShots };
fs.writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
console.log(JSON.stringify({ geometryFails: geoRows.filter((r) => !r.ok).map((r) => [r.k, r.d]), pixels: px, app: app.state, errors: app.errors, a11y: a11yShots.map((s) => s.classes) }, null, 1));
