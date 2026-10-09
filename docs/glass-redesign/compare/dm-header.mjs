// DM header admin badge / long name shots. node dm-header.mjs <port> <tag> <name>
import { chromium } from "playwright-core";
import fs from "node:fs";
const [port, tag, name] = process.argv.slice(2);
const OUT = new URL("./out/dm-fix", import.meta.url).pathname;
const INJECT = fs.readFileSync(new URL("../shotkit/inject.js", import.meta.url), "utf8");
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", headless: true, args: ["--font-render-hinting=none"] });
const user = { id: "00000000-0000-4000-8000-000000000001", username: "deniz", displayName: "Deniz", birthDate: "2000-05-05" };
const res = {};
for (const [dev, w, h, ios] of [["w440", 440, 956, true], ["w375", 375, 667, true], ["w390web", 390, 844, false], ["desk", 1280, 800, false]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: dev !== "desk", hasTouch: dev !== "desk", locale: "tr-TR", timezoneId: "Europe/Istanbul", reducedMotion: "reduce" });
  if (ios) await ctx.addInitScript(INJECT);
  await ctx.addInitScript((u) => { localStorage.setItem("descall_language", "tr"); localStorage.setItem("descall:cookie_consent_v1", JSON.stringify({ choice: "rejected", at: "2026-10-01T00:00:00.000Z" })); localStorage.setItem("descall_token", "demo.fake.token"); localStorage.setItem("descall_user", JSON.stringify(u)); }, user);
  await ctx.route(/.*/, async (route) => {
    const u = new URL(route.request().url());
    if (u.protocol === "data:" || u.protocol === "blob:") return route.continue();
    if (u.hostname === "localhost" || /onrender\.com$/.test(u.hostname)) {
      if (u.protocol !== "http:" || String(u.port) !== String(port)) { try { const r = await route.fetch({ url: `http://localhost:${port}${u.pathname}${u.search}` }); return route.fulfill({ response: r }); } catch { return route.abort(); } }
      return route.continue();
    }
    return route.abort();
  });
  const page = await ctx.newPage();
  if (ios) { const cdp = await ctx.newCDPSession(page); await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: { top: dev === "w375" ? 20 : 62, bottom: dev === "w375" ? 0 : 34, left: 0, right: 0 } }); }
  await page.goto(`http://localhost:${port}/direct`, { waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/${tag}-${dev}-list.png` });
  await page.evaluate((n) => {
    const els = [...document.querySelectorAll("*")].filter((e) => e.children.length === 0 && e.textContent.trim() === n);
    const el = els[0];
    (el?.closest("button, [role=button], li, a, .conversation-item, div[class*=item]") || el)?.click();
  }, name);
  await page.waitForTimeout(2500);
  res[dev] = await page.evaluate(() => {
    const q = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height) }; };
    return { title: q(".panel-header .header-title-text"), block: q(".panel-header .header-title-block"), badge: q(".panel-header .dsc-admin-badge"), right: q(".panel-header .header-right") };
  });
  await page.screenshot({ path: `${OUT}/${tag}-${dev}-dm.png`, clip: { x: 0, y: 0, width: w, height: dev === "desk" ? 140 : (dev === "w375" ? 120 : 170) } });
  await ctx.close();
}
await browser.close();
console.log(tag, JSON.stringify(res));
