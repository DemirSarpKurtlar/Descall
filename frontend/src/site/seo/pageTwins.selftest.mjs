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

// 9. Related guides under blog posts: 4 posts + the family guides, never itself, every post linked.
{
  const { relatedForPost } = await import("./blogLinks.js");
  const { BLOG_POSTS, BLOG_RELATED } = await import("../content/discordSeoContent.js");
  const linked = new Set();
  for (const post of BLOG_POSTS) {
    const rel = relatedForPost(post, BLOG_POSTS, BLOG_RELATED);
    assert.ok(rel.length >= 6 && rel.length <= 12, `${post.slug}: 6-12 related links (was every post and guide)`);
    assert.ok(!rel.some((l) => l.to === post.path), `${post.slug}: no self link`);
    rel.forEach((l) => linked.add(l.to));
  }
  for (const post of BLOG_POSTS) assert.ok(linked.has(post.path), `${post.slug} is related from another post`);
  const html = corePageBody("/blog/discord-competitors") || "";
  assert.equal(html, "", "blog posts are not core bodies (prerender-seo.mjs renders them)");
}

// 10. Round 3: SeoLandingShell pages, About and the InfoPage pages are twins too.
{
  const landing = await import("./landingTwins.js");
  const prerender = await import(pathToFileURL(join(frontend, "scripts/prerender-seo.mjs")).href);
  // The kicker prop is never rendered by SeoLandingShell; its "Start free" link only
  // shows on pages without a primary button (the blog index).
  const KICKERS = ["Discord alternatives · 2026", "Discord alternative · 2026"];
  const shell = keysOf(read("src/site/components/SeoLandingShell.jsx"));
  const ROUND3 = [
    { jsx: "src/site/pages/CompareDiscordPage.jsx", html: corePageBody("/compare/discord"), shell: true },
    { jsx: "src/site/pages/AlternativesPage.jsx", html: corePageBody("/alternatives"), shell: true },
    { jsx: "src/site/pages/DiscordAlternativePage.jsx", html: corePageBody("/discord-alternative"), shell: true },
    { jsx: "src/site/pages/DiscordAlternativeGamersPage.jsx", html: landing.gamersTwin("en", "/best-discord-alternative-for-gamers"), shell: true },
    // No FAQ on the blog index.
    { jsx: "src/site/pages/BlogIndexPage.jsx", html: landing.blogIndexTwin("en", "/blog"), shell: true, skip: ["Frequently asked questions"] },
    { jsx: "src/site/pages/AboutPage.jsx", html: corePageBody("/about") },
    { jsx: "src/site/pages/SecurityPage.jsx", html: corePageBody("/security") },
  ];
  for (const page of ROUND3) {
    const html = decode(page.html);
    for (const key of [...keysOf(read(page.jsx)), ...(page.shell ? shell : [])]) {
      if (KICKERS.includes(key) || page.skip?.includes(key)) continue;
      if (key === "Start free" && page.shell && !page.jsx.includes("BlogIndex") && !read(page.jsx).includes('t("Start free")')) continue;
      assert.ok(html.includes(key), `${page.jsx}: twin shows "${key}"`);
    }
  }
  // Who owns Descall uses x() for its English record (t() on prefixed locales).
  const whoOwns = decode(corePageBody("/who-owns-descall"));
  for (const key of [...read("src/site/pages/WhoOwnsDescallPage.jsx").matchAll(/\bx\(\s*"((?:\\.|[^"\\])*)"/g)].map((m) => m[1])) {
    if (key.includes("{name}") || key === "Home") continue; // "Home": JSON-LD breadcrumbs only
    assert.ok(whoOwns.includes(key), `who-owns twin shows "${key}"`);
  }
  const { OWNERSHIP_FAQ_EN, OWNERSHIP_FAQ_TR } = await import("../ownershipFacts.js");
  for (const f of OWNERSHIP_FAQ_EN) assert.ok(whoOwns.includes(`<summary>${f.q}</summary>`) || decode(whoOwns).includes(f.q), f.q);
  assert.ok(decode(corePageBody("/descall-sahibi")).includes(OWNERSHIP_FAQ_TR[0].q), "Turkish record page has the Turkish FAQ");
  // Translated: the text goes through the React t() of that language.
  assert.ok(corePageBody("/de/compare/discord").includes(twins.escapeHtml(deT("Quick verdict"))));
  assert.ok(corePageBody("/tr/compare/discord").includes(twins.escapeHtml(trT("Quick verdict"))));
  assert.ok(corePageBody("/ru/security").includes(twins.escapeHtml(twins.pageT("ru")("Security at Descall"))));
  assert.ok(landing.blogIndexTwin("de", "/de/blog").includes('href="/de/blog/discord-competitors"'), "blog index links the /de posts");
  assert.match(landing.trBlogIndexTwin(), /<h1>Descall blog: Discord alternatifleri/);
  // Main element and CSS blocks: landing twins keep only their block, info pages reuse legal + FAQ.
  assert.match(corePageBody("/compare/discord"), /<main class="seo-main-landing seo-twin-landing">/);
  assert.match(corePageBody("/security"), /<main class="seo-twin seo-twin-info">/);
  assert.match(corePageBody("/about"), /<main class="seo-twin seo-twin-about">/);
  for (const kind of ["landing", "info", "about"]) assert.ok(index.includes(`/* @twin-${kind}-start`) && index.includes(`/* @twin-${kind}-end */`), kind);
  const landingCss = stripTwinCss(index, "landing");
  assert.ok(landingCss.includes(".seo-tl-verdict") && !landingCss.includes("@twin-base-start"), "landing: own block, no base");
  const infoCss = stripTwinCss(index, "info");
  for (const b of ["base", "legal", "faq", "info"]) assert.ok(infoCss.includes(`@twin-${b}-start`), `info keeps ${b}`);
  assert.ok(!infoCss.includes("@twin-landing-start"));
  for (const [html, kind] of [
    [corePageBody("/compare/discord"), "landing"],
    [landing.blogIndexTwin("en", "/blog"), "landing"],
    [corePageBody("/who-owns-descall"), "info"],
    [corePageBody("/about"), "about"],
  ]) {
    const kept = stripTwinCss(index, kind);
    for (const cls of new Set([...html.matchAll(/class="([^"]+)"/g)].flatMap((m) => m[1].split(/\s+/)).filter((c) => /^seo-(tw|tl)-/.test(c)))) {
      assert.ok(kept.includes(`.${cls}`), `${kind}: .${cls} has CSS on the page`);
    }
  }
  // The twin prints the page extras itself (React markup), the prerender adds none.
  assert.ok(corePageBody("/compare/discord").includes("<!--seo-extras-inline-->"));
  // FAQ answers stay in <details> (FAQPage JSON-LD questions are visible).
  assert.match(corePageBody("/alternatives"), /<details><summary>[^<]+<\/summary><p>/);

  // 11. Prefixed shells modulepreload their site catalog parts (src/site/siteCatalogParts.js).
  const files = ["siteCatalogLoaders-AbCd1234.js", "site-de-core-Zz9_-x12.js", "site-de-blog-QQqq1111.js", "site-de-blog-discord-competitors-RRrr2222.js"];
  const pre = prerender.siteCatalogPreload({ locale: "de", path: "/de/blog" }, files);
  assert.match(pre, /href="\/assets\/siteCatalogLoaders-AbCd1234\.js"/);
  assert.match(pre, /href="\/assets\/site-de-core-Zz9_-x12\.js"/);
  assert.match(pre, /site-de-blog-QQqq1111\.js/);
  assert.doesNotMatch(pre, /discord-competitors/, "the blog index does not preload a post's part");
  assert.equal(prerender.siteCatalogPreload({ path: "/blog" }, files), "", "English pages preload no catalog");
}

console.log("pageTwins.selftest.mjs: ok");
