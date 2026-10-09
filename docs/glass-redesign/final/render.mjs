import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const screensDir = path.join(__dirname, "src/screens");
const only = process.argv.slice(2);
const files = fs.readdirSync(screensDir).filter((f) => f.endsWith(".html")).sort()
  .filter((f) => !only.length || only.includes(f.replace(/\.html$/, "")));
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 440, height: 956 }, deviceScaleFactor: 3 });
for (const file of files) {
  const name = file.replace(/\.html$/, "");
  await page.goto(`file://${path.join(screensDir, file)}`, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(__dirname, `${name}.png`), type: "png" });
  console.log("shot", name);
}
await browser.close();
