// Layout QA: (1) interactive chrome/text must not intrude into status bar / Island (y<54) unless it's content scrolling under chrome,
// (2) text elements that overflow their box (truncation/clipping), (3) overlapping chrome elements.
import { chromium } from "playwright";
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(__dirname, "src/screens");
const only = process.argv.slice(2);
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".html")).sort().filter((f) => !only.length || only.includes(f.replace(/\.html$/, "")));
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 440, height: 956 } });
for (const f of files) {
  await page.goto(`file://${path.join(dir, f)}`, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  const res = await page.evaluate(() => {
    const out = [];
    const chromeSel = ".toolbar,.conv-nav,.tabbar,.composer,.call-head,.ctrl,.large-title,.searchbar,.sheet,.menu,[data-chrome]";
    // 1. chrome inside status area
    document.querySelectorAll(chromeSel).forEach((el) => { const r = el.getBoundingClientRect(); if (r.height && r.top < 56) out.push(`TOP-INTRUDE ${el.className} top=${r.top.toFixed(0)}`); if (r.bottom > 944 && !el.matches(".sheet")) out.push(`BOTTOM-INTRUDE ${el.className} bottom=${r.bottom.toFixed(0)}`); if (r.left < 0 || r.right > 440) out.push(`H-OVERFLOW ${el.className} ${r.left.toFixed(0)}-${r.right.toFixed(0)}`); });
    // 2. text overflow (ellipsis/clipped) inside elements with nowrap
    document.querySelectorAll("body *").forEach((el) => {
      if (el.closest("[data-allow-clip]")) return;
      const cs = getComputedStyle(el);
      if (el.children.length === 0 && el.textContent.trim() && el.scrollWidth > el.clientWidth + 1 && (cs.overflow === "hidden" || cs.textOverflow === "ellipsis") && cs.display !== "inline")
        out.push(`TEXT-CLIP "${el.textContent.trim().slice(0, 40)}" ${el.scrollWidth}>${el.clientWidth}`);
    });
    // 3. tab labels must fit
    document.querySelectorAll(".tab span:not(.dotb)").forEach((s) => { const r = s.getBoundingClientRect(), p = s.parentElement.getBoundingClientRect(); if (r.left < p.left - 0.5 || r.right > p.right + 0.5) out.push(`TAB-LABEL "${s.textContent}" ${r.width.toFixed(1)} > ${p.width.toFixed(1)}`); });
    // 4. overlap among top-level chrome blocks
    const chrome = [...document.querySelectorAll(".toolbar,.large-title,.searchbar,.conv-nav,.call-head,.ctrl,.tabbar,.composer,[data-chrome]")].map((el) => [el, el.getBoundingClientRect()]);
    for (let i = 0; i < chrome.length; i++) for (let j = i + 1; j < chrome.length; j++) {
      const [a, ra] = chrome[i], [b, rb] = chrome[j];
      if (a.contains(b) || b.contains(a)) continue;
      const ix = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left), iy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
      if (ix > 1 && iy > 1) out.push(`OVERLAP ${a.className.split(" ")[0]} × ${b.className.split(" ")[0]} (${ix.toFixed(0)}×${iy.toFixed(0)})`);
    }
    // 5. text sitting on/under Island (non-status) region & visible (content text under the Island is ok only if covered by edge-top)
    return out;
  });
  console.log(`${f}: ${res.length ? "\n  " + res.join("\n  ") : "OK"}`);
}
await browser.close();
