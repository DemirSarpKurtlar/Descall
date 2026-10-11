// Render src/screens/*.html → <name>-desktop.png (1440 wide, full page) + <name>-mobile.png (390 wide, full page), @2x.
// Frames whose <html> has class "vp-fixed" (modals, sheets, banners) are captured at viewport size: 1440×900 / 390×844.
import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(__dirname, "src/screens");
const args = process.argv.slice(2);
const onlyVp = args.find((a) => a === "--desktop" || a === "--mobile");
const only = args.filter((a) => !a.startsWith("--"));
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".html")).sort().filter((f) => !only.length || only.includes(f.replace(/\.html$/, "")));
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", headless: true });
const VPS = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } };
for (const file of files) {
  const name = file.replace(/\.html$/, "");
  const html = fs.readFileSync(path.join(dir, file), "utf8");
  const fixed = /<html[^>]*class="[^"]*vp-fixed/.test(html);
  const onlyOne = (html.match(/data-only="(desktop|mobile)"/) || [])[1];
  for (const [vpName, vp] of Object.entries(VPS)) {
    if (onlyVp && onlyVp !== `--${vpName}`) continue;
    if (onlyOne && onlyOne !== vpName) continue;
    const page = await browser.newPage({ viewport: vp, deviceScaleFactor: 2 });
    await page.goto(`file://${path.join(dir, file)}`, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(__dirname, `${name}-${vpName}.png`), fullPage: !fixed || (vpName === "mobile" && /tall-sheet/.test(html)), type: "png" });
    await page.close();
    console.log("shot", name, vpName);
  }
}
await browser.close();
