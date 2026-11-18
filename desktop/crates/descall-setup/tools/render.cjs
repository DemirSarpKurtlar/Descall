// Renders every Descall Setup screen/state headless (Chromium, deviceScaleFactor 2).
// usage: node tools/render.cjs <outDir> [--draft <installer-drafts/B dir>] [--only welcome,progress]
// Writes <outDir>/states/<lang>/<screen>-<variant>.png, and with --draft frozen pairs in
// <outDir>/frozen/ (both draft and build with animations paused at t=0) for pixel diffs.
const path = require("path");
const fs = require("fs");
let pw;
try { pw = require("playwright"); } catch { pw = require("/opt/node-tools/node_modules/playwright"); }

const UI = path.resolve(__dirname, "..", "ui", "index.html");
const args = process.argv.slice(2);
const OUT = path.resolve(args[0] || "render-out");
const draftIdx = args.indexOf("--draft");
const DRAFT = draftIdx >= 0 ? path.resolve(args[draftIdx + 1]) : null;
const onlyIdx = args.indexOf("--only");
const ONLY = onlyIdx >= 0 ? args[onlyIdx + 1].split(",") : null;
const LANGS = ["tr", "en", "de", "es", "fr", "pt-BR", "ru"];

// [screen, variant, extra query]
const STATES = [
  ["welcome", "menu", "menu=1&hover=en"],
  ["welcome", "", ""],
  ["welcome", "upgrade", ""],
  ["welcome", "unsupported", ""],
  ["welcome", "lowdisk", ""],
  ["progress", "", ""],
  ["progress", "connect", ""],
  ["progress", "paused", ""],
  ["progress", "confirm", ""],
  ["progress", "verify", ""],
  ["progress", "install", ""],
  ["progress", "embedded", ""],
  ["migration", "", ""],
  ["migration", "installing", ""],
  ["migration", "session", ""],
  ["migration", "details", ""],
  ["migration", "finished", ""],
  ["done", "", ""],
  ["done", "kept", ""],
  ["error", "net", ""],
  ["error", "disk", ""],
  ["error", "locked", ""],
  ["error", "integrity", ""],
  ["error", "install", ""],
  ["error", "migrate", ""],
  ["error", "system", ""],
  ["update", "", ""],
  ["update", "installing", ""],
  ["update", "done", ""],
  ["update", "error", ""],
];
// draft state -> our state (for the side-by-side)
const PAIRS = [
  ["welcome", "welcome", "menu", "menu=1&hover=en"],
  ["progress", "progress", "", ""],
  ["migration", "migration", "", "days=7"],
  ["done", "done", "", ""],
  ["error", "error", "net", ""],
  ["update", "update", "", ""],
];
const FREEZE = "*,*::before,*::after{animation-delay:0s!important;animation-play-state:paused!important;transition:none!important;caret-color:transparent!important}.slide,.confirm,.check-burst *{animation:none!important}";

(async () => {
  const browser = await pw.chromium.launch({ args: ["--disable-dev-shm-usage", "--disable-gpu", "--font-render-hinting=none"] });
  const ctx = await browser.newContext({ deviceScaleFactor: 2, viewport: { width: 1400, height: 1000 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.error("pageerror", e.message));
  page.on("console", (m) => { if (m.type() === "error") console.error("console", m.text()); });

  async function shoot(url, file, { freeze = false, wait = 1500, sel = "section.shot", exe = false } = {}) {
    await page.goto(url);
    if (freeze) await page.addStyleTag({ content: FREEZE });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => document.body.getAttribute("data-ready") === "1" || document.body.getAttribute("data-current"), null, { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(wait);
    if (freeze) await page.addStyleTag({ content: FREEZE });
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const el = await page.$(exe ? ".frame" : sel);
    await el.screenshot({ path: file, animations: "allow", omitBackground: exe });
  }
  const ours = (screen, variant, extra, lang, more = "") => `file://${UI}?demo=${screen}&variant=${variant}&lang=${lang}${extra ? "&" + extra : ""}${more}`;

  for (const lang of LANGS) {
    for (const [screen, variant, extra] of STATES) {
      if (ONLY && !ONLY.includes(screen)) continue;
      if (lang !== "tr" && lang !== "en" && variant && !["menu", "net", "paused"].includes(variant)) continue; // full matrix in tr+en; main states in all
      const name = `${screen}${variant ? "-" + variant : ""}.png`;
      await shoot(ours(screen, variant, extra, lang), path.join(OUT, "states", lang, name), { wait: 700 });
    }
    console.log("states", lang);
  }
  // exe-mode framing (what the WebView itself paints) and reduced motion
  for (const [screen, variant, extra] of [["welcome", "", ""], ["progress", "", ""], ["update", "", ""]]) {
    await shoot(ours(screen, variant, extra, "tr", "&exe=1"), path.join(OUT, "exe", `${screen}.png`), { exe: true, wait: 700 });
  }
  await shoot(ours("progress", "", "", "tr", "&rm=1"), path.join(OUT, "exe", "progress-reduced-motion.png"), { wait: 700 });

  if (DRAFT) {
    for (const [dState, screen, variant, extra] of PAIRS) {
      const sel = "section.shot";
      await shoot(ours(screen, variant, extra, "tr"), path.join(OUT, "pairs", `${dState}-built.png`), { sel });
      await shoot(ours(screen, variant, extra, "tr", "&freeze=1"), path.join(OUT, "frozen", `${dState}-built.png`), { sel, freeze: true, wait: 400 });
      await shoot(`file://${path.join(DRAFT, "index.html")}?state=${dState}`, path.join(OUT, "frozen", `${dState}-draft.png`), { sel, freeze: true, wait: 400 });
      console.log("pair", dState);
    }
  }
  await browser.close();
})();
