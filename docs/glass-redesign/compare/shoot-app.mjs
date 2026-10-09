// Generic fake-iOS app shooter. node shoot-app.mjs <port> <outdir> <dsf> name=/route[@action] ...
import { chromium } from "playwright-core";
import fs from "node:fs";
const [port, outdir, dsf, ...specs] = process.argv.slice(2);
fs.mkdirSync(outdir, { recursive: true });
const INJECT = fs.readFileSync(new URL("../shotkit/inject.js", import.meta.url), "utf8");
const user = { id: "00000000-0000-4000-8000-000000000001", username: "deniz", displayName: "Deniz", birthDate: "2000-05-05" };
const W = Number(process.env.W || 440), H = Number(process.env.H || 956);
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", headless: true, args: ["--font-render-hinting=none"] });
const out = {};
for (const spec of specs) {
  const [name, rest] = spec.split("=");
  const [route, action] = rest.split("@");
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: Number(dsf), isMobile: true, hasTouch: true, locale: "tr-TR", timezoneId: "Europe/Istanbul", reducedMotion: process.env.MOTION ? "no-preference" : "reduce", colorScheme: "dark" });
  if (!process.env.WEB) await ctx.addInitScript(INJECT);
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
  const errs = []; page.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: { top: Number(process.env.SAFE_TOP || 62), bottom: Number(process.env.SAFE_BOTTOM || 34), left: 0, right: 0 } });
  await page.goto(`http://localhost:${port}${route}`, { waitUntil: "load", timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(3500);
  if (action === "status") {
    await page.evaluate(() => (document.querySelector(".g-shell-me") || document.querySelector(".rail-user-panel"))?.click());
    await page.waitForTimeout(800);
  }
  if (action === "scroll") {
    await page.evaluate(() => { for (const el of document.querySelectorAll("*")) { if (el.scrollHeight > el.clientHeight + 40 && /auto|scroll/.test(getComputedStyle(el).overflowY)) el.scrollTop = 120; } });
    await page.waitForTimeout(500);
  }
  await page.screenshot({ path: `${outdir}/${name}.png` });
  out[name] = { errs, cls: await page.evaluate(() => document.documentElement.className) };
  await ctx.close();
}
await browser.close();
console.log(JSON.stringify(out));
