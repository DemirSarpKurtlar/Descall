// Render every src/screens/*.html → <name>.png at 1440×900 @2x (narrow frames: 1024×768 @2x).
import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const screensDir = path.join(__dirname, "src/screens");
const only = process.argv.slice(2);
const files = fs.readdirSync(screensDir).filter((f) => f.endsWith(".html") && !f.includes("-inner")).sort()
  .filter((f) => !only.length || only.includes(f.replace(/\.html$/, "")));
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", headless: true });
for (const file of files) {
  const name = file.replace(/\.html$/, "");
  const html = fs.readFileSync(path.join(screensDir, file), "utf8");
  const narrow = /<html[^>]*class="narrow"/.test(html);
  const page = await browser.newPage({ viewport: narrow ? { width: 1024, height: 768 } : { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await page.goto(`file://${path.join(screensDir, file)}`, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(__dirname, `${name}.png`), type: "png" });
  await page.close();
  console.log("shot", name);
}
await browser.close();
