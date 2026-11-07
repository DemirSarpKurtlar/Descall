/**
 * Run: node frontend/src/site/seo/pageTwins.selftest.mjs
 *
 * The prerendered twins of /features, /faq, /download, /status and the legal reader must
 * keep the React page's text and the CSS they rely on, or the hand-over to React shows a
 * jump again (Nov 2026 SEO round 2). The browser check of the same guarantee is
 * scripts/handover-cls.mjs (CLS and moved text blocks, run on a build).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const site = join(here, "..");
const frontend = join(site, "..", "..");
const read = (rel) => readFileSync(join(frontend, rel), "utf8");

const { registerSiteCatalogs } = await import(pathToFileURL(join(frontend, "scripts/siteCatalogs.mjs")).href);
await registerSiteCatalogs();
const twins = await import("./pageTwins.js");
const { corePageBody } = await import("./corePageBodies.js");
const { stripTwinCss, lcpImagePreload, interFontFaceCss } = await import(pathToFileURL(join(frontend, "scripts/prerender-seo.mjs")).href);

// 1. Icons are the ones the React pages draw.
const icons = read("src/site/icons.jsx");
for (const [name, d] of Object.entries(twins.TWIN_ICON_PATHS)) {
  const m = icons.match(new RegExp(`const P_${name} = \\["([^"]+)"\\]`));
  assert.ok(m, `icons.jsx has P_${name}`);
  assert.equal(d, m[1], `twin icon ${name} matches icons.jsx`);
}

// 2. Every t("...") the React page renders on its first frame is in the twin.
const keysOf = (src) => [...src.matchAll(/\bt\(\s*"((?:\\.|[^"\\])*)"/g)].map((m) => m[1].replace(/\\"/g, '"'));
const decode = (html) => html.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const PAGES = [
  { jsx: "src/site/pages/FeaturesPage.jsx", path: "/features" },
  { jsx: "src/site/pages/FaqPage.jsx", path: "/faq" },
  {
    jsx: "src/site/pages/MarketingDownloadPage.jsx",
    path: "/download",
    // Shown only after the release lookup, on Android or on iPhone.
    later: ["{label} available", "Latest release", "Download APK", "Download on the App Store"],
  },
  {
    jsx: "src/site/pages/StatusPage.jsx",
    path: "/status",
    // The live API row after the check.
    later: ["API reachable", "Request timed out", "Network error", "Operational", "Degraded", "Unreachable from this browser"],
  },
];
for (const page of PAGES) {
  const html = decode(corePageBody(page.path));
  for (const key of keysOf(read(page.jsx))) {
    if (page.later?.includes(key)) continue;
    assert.ok(html.includes(key), `${page.path} twin shows "${key}" like ${page.jsx}`);
  }
}
assert.match(read("src/site/pages/FeaturesPage.jsx"), /from "\.\.\/seo\/featureGroups\.js"/, "FeaturesPage renders FEATURE_GROUPS");

// 3. Translated twins: the text goes through the React t() of that language.
const deT = twins.pageT("de");
assert.ok(corePageBody("/de/features").includes(twins.escapeHtml(deT("Features of a modern Discord alternative"))));
const trT = twins.pageT("tr");
assert.ok(corePageBody("/tr/faq").includes(twins.escapeHtml(trT("Is Descall a Discord alternative?"))));
assert.match(corePageBody("/de/privacy"), /<h1>Datenschutz/);
assert.match(corePageBody("/gizlilik"), /class="seo-tw-legal"/, "Turkish privacy page is the legal twin");
assert.match(corePageBody("/ru/status"), /class="seo-tw-status"/);

// 4. Each twin is a <main class="seo-twin seo-twin-<kind>"> and its CSS block exists.
const index = read("index.html");
for (const [path, kind] of [["/features", "features"], ["/faq", "faq"], ["/download", "download"], ["/status", "status"], ["/terms", "legal"], ["/copyright", "legal"]]) {
  const html = corePageBody(path);
  assert.match(html, new RegExp(`<main class="seo-twin seo-twin-${kind}">`), `${path} is a ${kind} twin`);
  assert.ok(index.includes(`/* @twin-${kind}-start */`) && index.includes(`/* @twin-${kind}-end */`), `index.html has the ${kind} CSS block`);
  // Every twin class used in the markup is styled in its block or the shared base.
  const kept = stripTwinCss(index, kind);
  for (const cls of new Set([...html.matchAll(/class="([^"]+)"/g)].flatMap((m) => m[1].split(/\s+/)).filter((c) => c.startsWith("seo-tw-")))) {
    assert.ok(kept.includes(`.${cls}`), `${path}: .${cls} has CSS on the page`);
  }
}
assert.ok(index.includes("/* @twin-base-start"), "shared twin CSS block");

// 5. stripTwinCss keeps exactly the page's blocks.
const sample = "a\n/* @twin-base-start x */B/* @twin-base-end */\n/* @twin-faq-start */F/* @twin-faq-end */\n/* @twin-legal-start */L/* @twin-legal-end */\nz";
assert.equal(stripTwinCss(sample, null).replace(/\s+/g, ""), "az");
assert.match(stripTwinCss(sample, "faq"), /B[\s\S]*F/);
assert.doesNotMatch(stripTwinCss(sample, "faq"), /L\/\*/);

// 6. No-JS page stays usable: FAQ answers in <details>, real download links.
assert.match(corePageBody("/faq"), /<details><summary>Is Descall a Discord alternative\?<\/summary><p>Yes\./);
assert.match(corePageBody("/download"), /href="https:\/\/github\.com\/DemirSarpKurtlar\/Descall\/releases\/latest\/download\/Descall-Setup\.exe"/);
assert.match(corePageBody("/features"), /<img src="\/brand\/previews\/06-server\.webp"[^>]*fetchpriority="high"/, "first shot is the LCP candidate");

// 7. Responsive shots: every candidate file exists, the LCP shot is preloaded from the head.
const { PREVIEW_SHOT_FILES, previewSrcset } = await import("./featureGroups.js");
const { existsSync } = await import("node:fs");
for (const src of Object.values(PREVIEW_SHOT_FILES)) {
  for (const cand of previewSrcset(src).split(", ").map((c) => c.split(" ")[0])) {
    assert.ok(existsSync(join(frontend, "public", cand)), `${cand} exists`);
  }
}
for (const f of ["hero-ios-chats-480.webp", "hero-ios-dm-480.webp"]) assert.ok(existsSync(join(frontend, "public/brand/previews", f)), f);
assert.match(lcpImagePreload(corePageBody("/features")), /<link rel="preload" as="image" href="\/brand\/previews\/06-server\.webp" imagesrcset="[^"]*-720\.webp 720w/);
assert.match(lcpImagePreload(corePageBody("/")), /imagesrcset="\/brand\/previews\/hero-ios-chats-480\.webp 480w[^"]*" imagesizes="[^"]+" media="\(max-width: 768px\)"/);
assert.equal(lcpImagePreload(corePageBody("/status")), "", "no image, no preload");
// 8. Fonts: the marketing CSS no longer declares Inter (the shell head does).
assert.doesNotMatch(read("src/site/marketing-entry.css"), /@fontsource\/inter\/latin/);
assert.match(read("src/site/fonts-inter.css"), /unicode-range/);
{
  const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const dir = mkdtempSync(join(tmpdir(), "twin-fonts-"));
  for (const sub of ["latin", "latin-ext"]) for (const w of [400, 600, 700]) writeFileSync(join(dir, `inter-${sub}-${w}-normal-HASH${w}.woff2`), "");
  const fonts = interFontFaceCss(dir);
  rmSync(dir, { recursive: true });
  assert.match(fonts.style, /^<style id="shell-fonts">/);
  assert.equal((fonts.style.match(/font-family: "Inter";/g) || []).length, 6, "six Inter faces in the shell");
  assert.match(fonts.style, /url\("\/assets\/inter-latin-700-normal-HASH700\.woff2"\)/);
  assert.match(fonts.style, /font-family: "Inter Fallback"/);
  assert.match(fonts.preload, /as="font" type="font\/woff2" href="\/assets\/inter-latin-400-normal-HASH400\.woff2" crossorigin/);
  assert.deepEqual(interFontFaceCss(join(tmpdir(), "no-such-dir-x")).style, "", "no files, no faces (hydrateMarketing loads them)");
}

console.log("pageTwins.selftest.mjs: ok");
