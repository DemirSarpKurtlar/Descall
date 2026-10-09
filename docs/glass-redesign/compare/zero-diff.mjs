// Desktop / web / Android / iPad must be pixel-identical before vs after (glass is iPhone-only).
// Before = main HEAD build on :3101, after = working tree build on :3100.
import { chromium } from "playwright-core";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";
import fs from "node:fs";

const OUT = process.env.OUT || new URL("./out/zero-diff", import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const INJECT = fs.readFileSync(new URL("../shotkit/inject.js", import.meta.url), "utf8");
const BEFORE = Number(process.env.BEFORE || 3101), AFTER = Number(process.env.AFTER || 3100);
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", headless: true, args: ["--font-render-hinting=none", "--lang=tr-TR"] });

const user = { id: "00000000-0000-4000-8000-000000000001", username: "deniz", displayName: "Deniz", birthDate: "2000-05-05" };
const SCEN = [
  { name: "web-desktop-landing", vp: [1440, 900, 1], url: "/" },
  { name: "web-desktop-login", vp: [1440, 900, 1], url: "/login" },
  { name: "web-desktop-app", vp: [1440, 900, 1], url: "/direct", loggedIn: true },
  { name: "web-mobile-login", vp: [390, 844, 3], mobile: true, url: "/login" },
  { name: "web-mobile-app", vp: [390, 844, 3], mobile: true, url: "/direct", loggedIn: true },
  { name: "electron-login", vp: [1280, 800, 1], url: "/", electron: true },
  { name: "electron-app", vp: [1280, 800, 1], url: "/direct", electron: true, loggedIn: true },
  { name: "android-login", vp: [412, 915, 3], mobile: true, url: "/", platform: "android" },
  { name: "android-app", vp: [412, 915, 3], mobile: true, url: "/direct", platform: "android", loggedIn: true },
  { name: "ipad-login", vp: [1032, 1376, 2], mobile: true, url: "/", platform: "ios" },
  { name: "ipad-app", vp: [1032, 1376, 2], mobile: true, url: "/direct", platform: "ios", loggedIn: true },
  // Stage 2 (navigation shell): every root tab on the non-glass mobile layouts + iPhone with glass off.
  { name: "web-mobile-groups", vp: [390, 844, 3], mobile: true, url: "/groups", loggedIn: true },
  { name: "web-mobile-friends", vp: [390, 844, 3], mobile: true, url: "/friends", loggedIn: true },
  { name: "web-mobile-servers", vp: [390, 844, 3], mobile: true, url: "/servers", loggedIn: true },
  { name: "web-mobile-calls", vp: [390, 844, 3], mobile: true, url: "/calls", loggedIn: true },
  { name: "web-mobile-activity", vp: [390, 844, 3], mobile: true, url: "/activity", loggedIn: true },
  { name: "electron-app-servers", vp: [1280, 800, 1], url: "/servers", electron: true, loggedIn: true },
  { name: "electron-app-activity", vp: [1280, 800, 1], url: "/activity", electron: true, loggedIn: true },
  { name: "android-app-friends", vp: [412, 915, 3], mobile: true, url: "/friends", platform: "android", loggedIn: true },
  { name: "android-app-activity", vp: [412, 915, 3], mobile: true, url: "/activity", platform: "android", loggedIn: true },
  { name: "iphone-glass-off-app", vp: [440, 956, 3], mobile: true, url: "/direct", platform: "ios", loggedIn: true, glassOff: true },
  { name: "iphone-glass-off-activity", vp: [440, 956, 3], mobile: true, url: "/activity", platform: "ios", loggedIn: true, glassOff: true },
];

async function shot(s, port) {
  const [w, h, dsf] = s.vp;
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dsf, isMobile: !!s.mobile, hasTouch: !!s.mobile, locale: "tr-TR", timezoneId: "Europe/Istanbul", colorScheme: "dark", reducedMotion: "reduce" });
  await ctx.addInitScript(() => { Date.now = ((n) => () => 1791540000000 + (n() % 1))(Date.now); });
  if (s.platform) await ctx.addInitScript(INJECT.replace('return "ios"', `return "${s.platform}"`));
  if (s.electron) await ctx.addInitScript(() => { window.electronAPI = { isElectron: true, platform: "win32", on() {}, off() {}, invoke: async () => null, send() {} }; });
  await ctx.addInitScript(({ loggedIn, user, glassOff }) => {
    try {
      if (glassOff) localStorage.setItem("descall:glass", "0");
      localStorage.setItem("descall_language", "tr");
      localStorage.setItem("descall:cookie_consent_v1", JSON.stringify({ choice: "rejected", at: "2026-10-01T00:00:00.000Z" }));
      if (loggedIn) { localStorage.setItem("descall_token", "demo.fake.token"); localStorage.setItem("descall_user", JSON.stringify(user)); }
    } catch {}
  }, { loggedIn: !!s.loggedIn, user, glassOff: !!s.glassOff });
  await ctx.addInitScript(() => {
    const st = document.createElement("style");
    st.textContent = "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}";
    document.addEventListener("DOMContentLoaded", () => document.head.appendChild(st));
  });
  await ctx.route(/.*/, async (route) => {
    const u = new URL(route.request().url());
    if (u.protocol === "data:" || u.protocol === "blob:") return route.continue();
    if (u.hostname === "localhost" || u.hostname === "127.0.0.1" || /onrender\.com$/.test(u.hostname)) {
      if (u.protocol !== "http:" || String(u.port) !== String(port)) {
        const target = `http://localhost:${port}${u.pathname}${u.search}`;
        try { const resp = await route.fetch({ url: target }); return route.fulfill({ response: resp }); } catch { return route.abort(); }
      }
      return route.continue();
    }
    return route.abort();
  });
  const page = await ctx.newPage();
  await page.goto(`http://localhost:${port}${s.url}`, { waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(3500);
  const file = `${OUT}/${s.name}-${port === BEFORE ? "before" : "after"}.png`;
  await page.screenshot({ path: file });
  const dom = await page.evaluate(() => (document.getElementById("root")?.outerHTML || "").replace(/-[A-Za-z0-9_-]{8}\.(js|css|png|svg|webp|woff2)/g, ".$1"));
  const htmlClass = await page.evaluate(() => document.documentElement.className);
  await ctx.close();
  return { file, dom, htmlClass };
}

const rows = [];
const ONLY = process.env.ONLY ? process.env.ONLY.split(",") : null;
for (const s of SCEN.filter((x) => !ONLY || ONLY.includes(x.name))) {
  const b = await shot(s, BEFORE);
  const a = await shot(s, AFTER);
  const A = PNG.sync.read(fs.readFileSync(b.file)), B = PNG.sync.read(fs.readFileSync(a.file));
  let diffPx = -1;
  if (A.width === B.width && A.height === B.height) {
    const d = new PNG({ width: A.width, height: A.height });
    diffPx = pixelmatch(A.data, B.data, d.data, A.width, A.height, { threshold: 0 });
    if (diffPx) fs.writeFileSync(`${OUT}/${s.name}-diff.png`, PNG.sync.write(d));
  }
  const norm = (html) => html.replace(/localhost:\d+/g, "localhost:PORT");
  const domSame = norm(a.dom) === norm(b.dom);
  if (!domSame) { fs.writeFileSync(`${OUT}/${s.name}-before.html`, b.dom); fs.writeFileSync(`${OUT}/${s.name}-after.html`, a.dom); }
  rows.push({ name: s.name, diffPx, domSame, glass: /glass-ui/.test(a.htmlClass), htmlClass: a.htmlClass, domLen: a.dom.length });
  console.log(s.name, "diffPx=" + diffPx, "dom=" + (domSame ? "same" : "DIFFERENT"), "glass=" + /glass-ui/.test(a.htmlClass), a.dom.length);
}
await browser.close();
const prev = fs.existsSync(`${OUT}/zero-diff.json`) ? JSON.parse(fs.readFileSync(`${OUT}/zero-diff.json`, "utf8")) : [];
const merged = [...prev.filter((r) => !rows.some((x) => x.name === r.name)), ...rows];
fs.writeFileSync(`${OUT}/zero-diff.json`, JSON.stringify(merged, null, 2));
