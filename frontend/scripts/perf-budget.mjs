#!/usr/bin/env node
/**
 * Marketing first-load budget checker.
 *
 * 1. "Total" (the gate, unchanged since 3.0): raw size of the JS a marketing HTML
 *    references directly (entry script + modulepreloads), i.e. the first download wave.
 *    235 KB since the react-router 6 -> 7 security upgrade; do not spend headroom.
 *
 * 2. Critical path (report, SEO audit Nov 2026): everything that has to arrive before
 *    content is visible, gzip-compressed like on the wire, for /features (English) and
 *    /de/features (a prefixed language):
 *      - "content visible": the HTML document plus render-blocking CSS / scripts in it.
 *        The prerendered shell paints from the HTML and its inline CSS.
 *      - "React page ready": the full chain until the interactive page has replaced the
 *        shell: entry wave -> hydrateMarketing (+ marketing-entry CSS, site catalog for
 *        a prefixed language) -> MarketingBoot -> MarketingApp (+ CSS) -> page chunk.
 *    The chain is read from the built chunks (static imports + the deps Vite preloads
 *    with each dynamic import), so it follows code changes without a hand-kept list.
 *
 * Usage: node scripts/perf-budget.mjs [--max-kb 235]
 */
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// PERF_DIST=<dir> measures another build (e.g. a saved copy, for before/after numbers).
const distDir = process.env.PERF_DIST ? path.resolve(process.env.PERF_DIST) : path.join(__dirname, "..", "dist");
const maxKbArg = process.argv.find((a) => a.startsWith("--max-kb="));
const maxKb = Number(
  maxKbArg?.split("=")[1] ||
    (process.argv.includes("--max-kb")
      ? process.argv[process.argv.indexOf("--max-kb") + 1]
      : 235)
);

function fileSize(rel) {
  const abs = path.join(distDir, rel.replace(/^\//, ""));
  if (!fs.existsSync(abs)) return 0;
  return fs.statSync(abs).size;
}

function gzipSize(rel) {
  const abs = path.join(distDir, rel.replace(/^\//, ""));
  if (!fs.existsSync(abs)) return 0;
  return zlib.gzipSync(fs.readFileSync(abs), { level: 9 }).length;
}

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

const htmlPath = path.join(distDir, "features.html");
if (!fs.existsSync(htmlPath)) {
  console.error("Missing dist/features.html — run build:prod first");
  process.exit(1);
}

const html = fs.readFileSync(htmlPath, "utf8");
const assets = new Set();
for (const m of html.matchAll(/(?:src|href)="(\/assets\/[^"]+\.js)"/g)) assets.add(m[1]);
for (const m of html.matchAll(/modulepreload[^>]+href="(\/assets\/[^"]+\.js)"/g)) assets.add(m[1]);

const rows = [...assets]
  .map((rel) => ({ rel, bytes: fileSize(rel) }))
  .filter((r) => r.bytes > 0)
  .sort((a, b) => b.bytes - a.bytes);

const total = rows.reduce((s, r) => s + r.bytes, 0);
const totalKb = total / 1024;

console.log("Marketing first-paint JS (/features HTML refs)\n");
for (const r of rows) {
  console.log(`${(r.bytes / 1024).toFixed(1).padStart(7)} KB  ${r.rel}`);
}
console.log("\nTotal:", `${totalKb.toFixed(1)} KB`, `(budget ${maxKb} KB)`);

// ---------------------------------------------------------------------------
// Critical path

const assetDir = path.join(distDir, "assets");
const assetFiles = fs.readdirSync(assetDir);

/** "/assets/MarketingApp-x.js" of a chunk named after its module ("MarketingApp"). */
function chunkNamed(name, ext = "js") {
  const re = new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-[\\w-]{6,}\\.${ext}$`);
  const hit = assetFiles.find((f) => re.test(f));
  return hit ? `/assets/${hit}` : null;
}

/** Static imports of a built chunk ("./vendor-react-x.js"), as /assets paths. */
function staticImports(rel) {
  const code = fs.readFileSync(path.join(distDir, rel.slice(1)), "utf8");
  const out = new Set();
  for (const m of code.matchAll(/(?:^|[;\s}])import\s*(?:[\w${},*\s]+from\s*)?["']\.\/([\w.-]+\.js)["']/g)) out.add(`/assets/${m[1]}`);
  return [...out];
}

/** Files Vite preloads together with a dynamic import of `target` (its CSS and shared chunks). */
function preloadDeps(fromRel, targetRel) {
  const code = fs.readFileSync(path.join(distDir, fromRel.slice(1)), "utf8");
  const list = code.match(/__vite__mapDeps=\([^)]*?m\.f\|\|\(m\.f=(\[[^\]]*\])/);
  if (!list) return [];
  let files;
  try {
    files = JSON.parse(list[1]);
  } catch {
    return [];
  }
  const target = targetRel.replace(/^\//, "");
  const idx = files.indexOf(target);
  if (idx < 0) return [];
  // The deps array of that call: __vite__mapDeps([i, j, ...]) right after import("./target").
  const name = path.basename(targetRel);
  const call = code.match(new RegExp(`import\\(["']\\./${name.replace(/[.]/g, "\\.")}["']\\)\\s*,\\s*__vite__mapDeps\\(\\[([\\d,]*)\\]\\)`));
  if (!call) return [];
  return call[1]
    .split(",")
    .filter(Boolean)
    .map((i) => `/${files[Number(i)]}`);
}

/** A chunk plus everything it statically imports. */
function closure(rel, seen = new Set()) {
  if (!rel || seen.has(rel)) return seen;
  seen.add(rel);
  if (rel.endsWith(".js")) for (const dep of staticImports(rel)) closure(dep, seen);
  return seen;
}

function chainFor(page, localeId) {
  const shellRel = page === "/" ? "/index.html" : `${page}.html`;
  const shell = fs.readFileSync(path.join(distDir, shellRel.slice(1)), "utf8");
  const entry = (shell.match(/<script type="module"[^>]*src="(\/assets\/[^"]+\.js)"/) || [])[1];
  const files = new Set();
  const steps = [];
  // Render-blocking resources in the HTML itself.
  const blockingCss = [...shell.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="(\/assets\/[^"]+\.css)"/g)].map((m) => m[1]);
  const contentVisible = [shellRel, ...blockingCss];
  // Chain: entry -> hydrateMarketing -> MarketingBoot -> MarketingApp -> page chunk.
  const enPage = page.replace(/^\/(de|es|fr|pt-br|ru|tr)(?=\/|$)/, "") || "/";
  const pageChunk = { "/features": "FeaturesPage", "/": "HomePage", "/download": "MarketingDownloadPage" }[enPage] || "FeaturesPage";
  const hops = [
    ["entry", entry, null],
    ["hydrateMarketing", chunkNamed("hydrateMarketing"), entry],
    ["MarketingBoot", chunkNamed("MarketingBoot"), chunkNamed("hydrateMarketing")],
    ["MarketingApp", chunkNamed("MarketingApp"), chunkNamed("MarketingBoot")],
    [pageChunk, chunkNamed(pageChunk), chunkNamed("MarketingApp")],
  ];
  for (const [label, rel, from] of hops) {
    if (!rel) continue;
    const before = files.size;
    for (const f of closure(rel)) files.add(f);
    if (from) for (const dep of preloadDeps(from, rel)) for (const f of closure(dep)) files.add(f);
    const css = chunkNamed(label, "css");
    if (css) files.add(css);
    steps.push(`${label} (+${files.size - before})`);
  }
  // CSS the marketing entry imports (marketing-entry.css) and, for a prefixed language,
  // the site catalog hydrateMarketing waits for.
  const entryCss = chunkNamed("marketing-entry", "css");
  if (entryCss) files.add(entryCss);
  if (localeId) {
    // The site catalog parts this page loads (src/site/siteCatalogParts.js): core + the
    // page's own part, chunks named site-<id>-<part>-<hash>.js (vite.config.js).
    const part = enPage === "/" ? "home" : enPage.slice(1).replace(/[^a-z0-9]+/g, "-");
    for (const name of ["siteCatalogLoaders", `site-${localeId}-core`, `site-${localeId}-${part}`]) {
      const hit = chunkNamed(name);
      if (hit) files.add(hit);
    }
  }
  const sum = (list) => list.reduce((s, f) => s + gzipSize(f), 0);
  const all = [...files];
  return {
    page,
    contentVisible: sum(contentVisible),
    contentFiles: contentVisible,
    reactReady: sum(contentVisible) + sum(all),
    js: sum(all.filter((f) => f.endsWith(".js"))),
    css: sum(all.filter((f) => f.endsWith(".css"))),
    files: all.length,
    allFiles: all,
    steps,
  };
}

console.log("\nCritical path (gzip, what the network sends):");
for (const [page, loc] of [["/features", null], ["/de/features", "de"], ["/es/download", "es"], ["/ru", "ru"], ["/", null]]) {
  try {
    const c = chainFor(page, loc);
    if (process.argv.includes("--verbose")) {
      for (const f of c.allFiles.sort((x, y) => gzipSize(y) - gzipSize(x))) console.log(`      ${kb(gzipSize(f)).padStart(9)}  ${f}`);
    }
    console.log(
      `  ${page.padEnd(13)} content visible: ${kb(c.contentVisible).padStart(9)} (${c.contentFiles.length} file${c.contentFiles.length > 1 ? "s" : ""})` +
        `   React page ready: ${kb(c.reactReady).padStart(9)} (HTML + ${c.files} assets: JS ${kb(c.js)}, CSS ${kb(c.css)})`
    );
  } catch (err) {
    console.log(`  ${page}: could not read the chain (${err.message})`);
  }
}
const holdsShell = /html\.seo-hold/.test(html);
console.log(
  holdsShell
    ? "  NOTE: html.seo-hold hides the prerendered shell, so content is not visible before \"React page ready\"."
    : "  Prerendered shell is visible on first paint (no seo-hold)."
);

const hasSeoStatic = /id="seo-static"[\s\S]*?<main/i.test(html);
const hasLoading = /\bLoading\b/.test(html);
const hasMotionPreload = [...assets].some((a) => a.includes("vendor-motion"));
const hasIconsPreload = [...assets].some((a) => a.includes("vendor-icons"));
console.log("\nseo-static main:", hasSeoStatic ? "yes" : "NO");
console.log("Loading word:", hasLoading ? "YES (bad)" : "no");
console.log("motion preload:", hasMotionPreload ? "YES (bad)" : "no");
console.log("icons preload:", hasIconsPreload ? "yes (warn)" : "no");

if (!hasSeoStatic || hasLoading || hasMotionPreload || totalKb > maxKb) {
  process.exitCode = 1;
} else {
  console.log("perf-budget: ok");
}
