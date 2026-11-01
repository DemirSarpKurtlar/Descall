/**
 * SEO health checks — run after build or in CI.
 * Validates route registry integrity, prerender shells, and basic meta quality.
 *
 * Usage:
 *   node scripts/seo-validate.mjs
 *   node scripts/seo-validate.mjs --dist   (also check dist shells)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const checkDist = process.argv.includes("--dist");

const errors = [];
const warnings = [];

function fail(msg) {
  errors.push(msg);
}
function warn(msg) {
  warnings.push(msg);
}

const seoConfig = await import(pathToFileURL(path.join(root, "src/site/seoConfig.js")).href);
const { siteText } = await import(pathToFileURL(path.join(root, "src/site/siteText.js")).href);
const { registerSiteCatalogs } = await import(pathToFileURL(path.join(__dirname, "siteCatalogs.mjs")).href);
await registerSiteCatalogs();
// Prefixed site languages (/de/...) are checked with their translated title / description.
const PUBLIC_ROUTES = seoConfig.PUBLIC_ROUTES.map((r) => seoConfig.localizeRouteMeta(r, siteText));
const { KEYWORD_STRATEGY } = await import(
  pathToFileURL(path.join(root, "src/site/seo/keywordStrategy.js")).href
);
const { NICHE_LANDINGS } = await import(pathToFileURL(path.join(root, "src/site/seo/nicheLandings.js")).href);
const { BLOG_POSTS } = await import(
  pathToFileURL(path.join(root, "src/site/content/discordSeoContent.js")).href
);
const { BLOG_BODIES } = await import(pathToFileURL(path.join(root, "src/site/seo/blogBodies.js")).href);
const { TR_LANDINGS } = await import(pathToFileURL(path.join(root, "src/site/seo/trLandings.js")).href);
const { TR_BLOG_POSTS, TR_BLOG_BODIES } = await import(pathToFileURL(path.join(root, "src/site/seo/trBlog.js")).href);

const marketingApp = fs.readFileSync(path.join(root, "src/site/MarketingApp.jsx"), "utf8");
const sitemapJs = fs.readFileSync(path.join(root, "backend/routes/sitemap.js"), "utf8");
const robotsTxt = fs.readFileSync(path.join(root, "public/robots.txt"), "utf8");
{
  const { spawnSync } = await import("node:child_process");
  const iconCheck = spawnSync(process.execPath, [path.join(root, "src/site/siteIcons.selftest.mjs")], {
    encoding: "utf8",
  });
  if (iconCheck.status !== 0) {
    fail(iconCheck.stderr || iconCheck.stdout || "siteIcons.selftest failed");
  }
}
const {
  SITEMAP_TABLES,
  allSitemapEntries,
  indexingUrlQueue,
} = await import(pathToFileURL(path.join(root, "src/site/sitemapCatalog.js")).href);

const paths = PUBLIC_ROUTES.map((r) => r.path);
const titles = new Map();
const descriptions = new Map();

for (const route of PUBLIC_ROUTES) {
  if (!route.path?.startsWith("/")) fail(`Invalid path: ${route.path}`);
  if (!route.title) fail(`Missing title: ${route.path}`);
  if (!route.description) fail(`Missing description: ${route.path}`);
  if (route.title.length > 70) warn(`Title long (${route.title.length}): ${route.path}`);
  if (route.title.length < 20) warn(`Title short (${route.title.length}): ${route.path}`);
  if (route.description.length > 170) warn(`Description long (${route.description.length}): ${route.path}`);
  if (route.description.length < 70) warn(`Description short (${route.description.length}): ${route.path}`);

  if (titles.has(route.title)) fail(`Duplicate title: "${route.title}" (${titles.get(route.title)} & ${route.path})`);
  else titles.set(route.title, route.path);

  if (descriptions.has(route.description)) {
    fail(`Duplicate description: ${route.path} & ${descriptions.get(route.description)}`);
  } else descriptions.set(route.description, route.path);

  // Route should be registered in MarketingApp (blog/:slug covers posts)
  if (route.path.startsWith("/tr/blog/")) {
    const slug = route.path.slice("/tr/blog/".length);
    if (!marketingApp.includes('path="/tr/blog/:slug"')) fail("MarketingApp missing /tr/blog/:slug");
    if (!TR_BLOG_POSTS.some((p) => p.slug === slug) || !TR_BLOG_BODIES[slug]) fail(`TR blog post missing: ${slug}`);
    if (!BLOG_POSTS.some((p) => p.slug === slug)) fail(`TR blog post has no EN twin: ${slug}`);
  } else if (route.path.startsWith("/blog/") && route.path !== "/blog") {
    const slug = route.path.slice("/blog/".length);
    if (!marketingApp.includes('path="/blog/:slug"')) fail("MarketingApp missing /blog/:slug");
    if (!BLOG_POSTS.some((p) => p.slug === slug)) fail(`Blog slug missing from BLOG_POSTS: ${slug}`);
    if (!BLOG_BODIES[slug]) fail(`Blog body missing: ${slug}`);
  } else if (NICHE_LANDINGS[route.path]) {
    if (!marketingApp.includes("DiscordAlternativeNichePage")) {
      fail("MarketingApp missing DiscordAlternativeNichePage");
    }
  } else if (route.locale) {
    // Prefixed site languages render the English page from MarketingApp's MIRROR_PAGES map.
    if (!marketingApp.includes(`"${route.enPath}":`)) fail(`MarketingApp MIRROR_PAGES missing ${route.enPath} (${route.path})`);
  } else if (route.path !== "/download" && route.path !== "/") {
    // soft check — path string appears in MarketingApp or is niche/blog
    const needle = route.path === "/" ? 'path="/"' : `path="${route.path}"`;
    if (!marketingApp.includes(needle) && !marketingApp.includes(`'${route.path}'`)) {
      // dynamic niche routes share one component — already handled
      if (!route.path.startsWith("/discord-alternative-for-") && route.path !== "/apps-like-discord" && route.path !== "/discord-replacement") {
        warn(`Path may be missing from MarketingApp.jsx: ${route.path}`);
      }
    }
  }

}

const catalogPaths = new Set(allSitemapEntries("https://descall.com").map((e) => e.path));
for (const route of PUBLIC_ROUTES) {
  if (route.noindex) continue;
  if (!catalogPaths.has(route.path)) {
    fail(`sitemapCatalog missing path: ${route.path}`);
  }
}
if (!sitemapJs.includes("sitemapCatalog") || !sitemapJs.includes("sitemap-core.xml")) {
  fail("backend/routes/sitemap.js must serve multi-table sitemapCatalog children");
}
if (indexingUrlQueue("https://descall.com").length < PUBLIC_ROUTES.filter((r) => !r.noindex).length) {
  fail("indexingUrlQueue shorter than indexable PUBLIC_ROUTES");
}
for (const table of SITEMAP_TABLES) {
  if (!["core", "niches", "blog", "company"].includes(table.id)) {
    fail(`Unexpected sitemap table id: ${table.id}`);
  }
}

// Keyword targets must resolve to known routes
const routeSet = new Set(paths);
for (const row of KEYWORD_STRATEGY) {
  if (!routeSet.has(row.targetPath)) {
    fail(`Keyword "${row.keyword}" targets unknown path ${row.targetPath}`);
  }
}

// Niche uniqueness
const nicheH1 = new Set();
for (const [p, niche] of Object.entries(NICHE_LANDINGS)) {
  if (!routeSet.has(p)) fail(`Niche landing not in PUBLIC_ROUTES: ${p}`);
  if (nicheH1.has(niche.h1)) fail(`Duplicate niche H1: ${niche.h1}`);
  nicheH1.add(niche.h1);
  if (!niche.faq?.length) fail(`Niche missing FAQ: ${p}`);
  if ((niche.lead || "").length < 80) warn(`Niche lead short: ${p}`);
}

if (!robotsTxt.includes("Sitemap: https://descall.com/sitemap.xml")) {
  fail("public/robots.txt must point Sitemap to https://descall.com/sitemap.xml");
}
if (robotsTxt.includes("des-call.onrender.com")) {
  fail("public/robots.txt still references onrender.com");
}
if (/http:\/\/descall\.com/i.test(robotsTxt)) {
  fail("public/robots.txt contains http://descall.com");
}

const vercelJson = fs.readFileSync(path.join(root, "vercel.json"), "utf8");
// /api → Render is allowed. Fail only if SEO/static files are rewritten to onrender.
try {
  const vercelCfg = JSON.parse(vercelJson);
  const seoPathRe =
    /(robots\.txt|sitemap(?:-[a-z]+)?\.(?:xml|html|xsl)|4f463b15fd51f502c6bb73abbeb38e3c\.txt)/i;
  for (const rule of vercelCfg.rewrites || []) {
    const dest = String(rule.destination || "");
    const src = String(rule.source || "");
    if (/des-call\.onrender\.com/i.test(dest) && seoPathRe.test(src)) {
      fail("vercel.json still proxies SEO files to onrender.com — use static dist sitemap/robots");
    }
  }
} catch (err) {
  fail(`vercel.json parse failed: ${err?.message || err}`);
}
if (!/"statusCode"\s*:\s*301/.test(vercelJson)) {
  fail("vercel.json missing statusCode 301 redirects for www/http canonicalization");
}
if (!/"Strict-Transport-Security"/.test(vercelJson)) {
  fail("vercel.json missing Strict-Transport-Security");
}
if (!vercelJson.includes("/tr/discord-alternative") || !vercelJson.includes("/discord-alternative-turkey")) {
  fail("vercel.json missing TR discord-alternative → turkey 301");
}

const homeRoute = PUBLIC_ROUTES.find((r) => r.path === "/");
if (/discord alternative/i.test(homeRoute?.title || "")) {
  fail("Homepage title cannibalizes the /discord-alternative pillar — keep homepage brand-first");
}
const pillar = PUBLIC_ROUTES.find((r) => r.path === "/discord-alternative");
if (!/discord alternative/i.test(pillar?.title || "")) {
  fail("/discord-alternative title should include the exact-match query");
}

const seoConfigSrc = fs.readFileSync(path.join(root, "src/site/seoConfig.js"), "utf8");
if (!seoConfigSrc.includes("canonicalOrigin") || !seoConfigSrc.includes("https://descall.com")) {
  fail("seoConfig.js must pin canonicalOrigin to https://descall.com");
}

if (checkDist) {
  const dist = path.join(root, "dist");
  if (!fs.existsSync(dist)) {
    fail("dist/ missing — run build first");
  } else {
    for (const name of [
      "robots.txt",
      "llms.txt",
      "llms-full.txt",
      "humans.txt",
      "sitemap.xml",
      "sitemap-pages.xml",
      "sitemap-core.xml",
      "sitemap-niches.xml",
      "sitemap-blog.xml",
      "sitemap-company.xml",
      "sitemap.html",
      "sitemap.xsl",
    ]) {
      const file = path.join(dist, name);
      if (!fs.existsSync(file)) {
        fail(`Missing dist/${name} — run generate-seo-files`);
        continue;
      }
      const body = fs.readFileSync(file, "utf8");
      if (/onrender\.com|vercel\.app|localhost|127\.0\.0\.1/i.test(body)) {
        fail(`dist/${name} contains non-production host`);
      }
      if (/http:\/\/descall\.com/i.test(body)) {
        fail(`dist/${name} contains http://descall.com`);
      }
    }

      if (!fs.existsSync(path.join(dist, ".well-known/security.txt"))) {
        fail("Missing dist/.well-known/security.txt");
      }
      const robotsBody = fs.readFileSync(path.join(dist, "robots.txt"), "utf8");
      if (!robotsBody.includes("User-agent: GPTBot") || !robotsBody.includes("Allow: /llms.txt")) {
        fail("dist/robots.txt must allow GPTBot and /llms.txt");
      }

      const indexXml = fs.readFileSync(path.join(dist, "sitemap.xml"), "utf8");
    if (!indexXml.includes("<sitemapindex")) {
      fail("dist/sitemap.xml must be a sitemapindex of child tables");
    }
    for (const table of SITEMAP_TABLES) {
      if (!indexXml.includes(`https://descall.com/${table.file}`)) {
        fail(`dist/sitemap.xml missing child ${table.file}`);
      }
    }

    const humanSitemap = fs.readFileSync(path.join(dist, "sitemap.html"), "utf8");
    if (!humanSitemap.includes('class="card"') || !humanSitemap.includes("--font-display")) {
      fail("dist/sitemap.html looks unstyled — expected branded card layout");
    }
    const pagesXmlBody = fs.readFileSync(path.join(dist, "sitemap-pages.xml"), "utf8");
    if (!pagesXmlBody.includes('href="/sitemap.xsl"')) {
      fail("sitemap-pages.xml missing xml-stylesheet → /sitemap.xsl");
    }

    const pagesXml = fs.readFileSync(path.join(dist, "sitemap-pages.xml"), "utf8");
    for (const route of PUBLIC_ROUTES) {
      const loc = route.path === "/" ? "https://descall.com/" : `https://descall.com${route.path}`;
      if (!pagesXml.includes(`<loc>${loc}</loc>`)) {
        fail(`sitemap-pages.xml missing ${loc}`);
      }
    }

    for (const route of PUBLIC_ROUTES) {
      const rel = route.path === "/" ? "index.html" : `${route.path.replace(/^\//, "")}.html`;
      const file = path.join(dist, rel);
      if (!fs.existsSync(file)) {
        fail(`Prerender shell missing: ${rel}`);
        continue;
      }
      const html = fs.readFileSync(file, "utf8");
      if (!html.includes(`favicon-48.png?v=`)) fail(`Favicon links missing in ${rel}`);
      if (!html.includes(`rel="icon"`)) fail(`No icon link in ${rel}`);
      if (route.path === "/" && !html.includes("favicon-192.png?v=")) {
        fail(`Homepage JSON-LD logo missing in ${rel}`);
      }
      if (!html.includes("<title>")) fail(`No <title> in ${rel}`);
      if (!html.includes('rel="canonical"')) fail(`No canonical in ${rel}`);
      if (!html.includes("<h1")) fail(`No <h1> crawl content in ${rel}`);
      if (/\bLoading\b/i.test(html)) fail(`Loading placeholder found in ${rel}`);
      const mainMatch = html.match(/<main[\s\S]*?<\/main>/i);
      if (!mainMatch || mainMatch[0].length < 400) {
        fail(`Thin crawl <main> in ${rel} (${mainMatch ? mainMatch[0].length : 0} chars)`);
      }
      // Prefixed site languages (/de/faq) must carry the same structured data as their English page.
      const page = route.enPath || route.path;
      if (page === "/faq" && !html.includes('"@type":"FAQPage"') && !html.includes('"@type": "FAQPage"')) {
        fail(`FAQPage JSON-LD missing in ${rel}`);
      }
      if (
        (["/discord-alternative", "/alternatives", "/compare/discord", "/tr/faq", "/faq"].includes(page) ||
          TR_LANDINGS[route.path]) &&
        !html.includes("FAQPage")
      ) {
        fail(`FAQPage JSON-LD missing in ${rel}`);
      }
      if (
        (page === "/" || page === "/features") &&
        !html.includes("SoftwareApplication")
      ) {
        fail(`SoftwareApplication JSON-LD missing in ${rel}`);
      }
      if (page === "/who-owns-descall" || page === "/descall-sahibi") {
        if (!html.includes("Demir Sarp Kurtlar")) fail(`Owner name missing in ${rel}`);
        if (!html.includes("ownedBy") && !html.includes('"@type":"Person"') && !html.includes('"@type": "Person"')) {
          fail(`Person/ownedBy JSON-LD missing in ${rel}`);
        }
        if (!html.includes("FAQPage")) fail(`FAQPage JSON-LD missing in ${rel}`);
      }
      if (page === "/" && !html.includes("Demir Sarp Kurtlar")) {
        fail(`Homepage shell missing owner name ${rel}`);
      }
      if (route.path.startsWith("/blog/") && route.path !== "/blog" && !html.includes('"@type":"Article"') && !html.includes('"@type": "Article"')) {
        warn(`Article JSON-LD missing in ${rel}`);
      }
      if (/rel="canonical"[^>]*http:\/\//i.test(html)) fail(`HTTP canonical in ${rel}`);
      if (/rel="canonical"[^>]*(onrender\.com|vercel\.app|localhost)/i.test(html)) {
        fail(`Non-production canonical in ${rel}`);
      }
      const expectedCanon =
        route.path === "/"
          ? 'rel="canonical" href="https://descall.com/"'
          : `rel="canonical" href="https://descall.com${route.path}"`;
      if (!html.includes(expectedCanon)) fail(`Wrong/missing self canonical in ${rel}`);
      if (html.includes('content=""') && html.includes('name="description"')) {
        warn(`Empty description meta possible in ${rel}`);
      }
      // noindex should not appear on indexable shells
      if (/noindex/i.test(html) && !route.noindex) fail(`noindex found on indexable shell ${rel}`);
      const h1Count = (html.match(/<h1[\s>]/gi) || []).length;
      if (h1Count !== 1) warn(`Expected 1 H1 in ${rel}, found ${h1Count}`);
    }
  }
}

if (checkDist) {
  // Cloudflare Pages model: /foo is served 200 from dist/foo.html; a dist/foo/index.html
  // would make Pages 308 /foo → /foo/. Every sitemap URL must be a 200 at its own
  // canonical, so simulate that here.
  const dist = path.join(root, "dist");
  const pagesXmlPath = path.join(dist, "sitemap-pages.xml");
  if (fs.existsSync(pagesXmlPath)) {
    const locs = [...fs.readFileSync(pagesXmlPath, "utf8").matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    const seenLoc = new Set();
    const hreflangByUrl = new Map();
    for (const loc of locs) {
      if (seenLoc.has(loc)) fail(`Duplicate sitemap loc ${loc}`);
      seenLoc.add(loc);
      const u = new URL(loc);
      if (u.origin !== "https://descall.com") fail(`Sitemap loc not on https://descall.com: ${loc}`);
      if (u.pathname !== "/" && u.pathname.endsWith("/")) fail(`Sitemap loc has trailing slash (would 308): ${loc}`);
      if (u.pathname.endsWith(".html")) fail(`Sitemap loc ends with .html (Pages 308s it): ${loc}`);
      const rel = u.pathname === "/" ? "index.html" : `${u.pathname.slice(1)}.html`;
      const file = path.join(dist, rel);
      if (!fs.existsSync(file)) {
        fail(`Sitemap URL would not be 200 (no dist/${rel}): ${loc}`);
        continue;
      }
      if (u.pathname !== "/" && fs.existsSync(path.join(dist, u.pathname.slice(1), "index.html"))) {
        fail(`Stale folder index dist${u.pathname}/index.html would 308 ${loc} → trailing slash`);
      }
      const html = fs.readFileSync(file, "utf8");
      const canon = html.match(/<link rel="canonical" href="([^"]+)"/i)?.[1];
      if (canon !== loc) fail(`Canonical != sitemap URL for ${loc} (got ${canon})`);
      const ogUrl = html.match(/<meta property="og:url" content="([^"]+)"/i)?.[1];
      if (ogUrl && ogUrl !== loc) fail(`og:url != URL for ${loc} (got ${ogUrl})`);
      const alts = {};
      for (const m of html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)"/gi)) alts[m[1]] = m[2];
      hreflangByUrl.set(loc, alts);
      const lang = html.match(/<html\s+lang="([^"]+)"/i)?.[1];
      const ogLocale = html.match(/<meta property="og:locale" content="([^"]+)"/i)?.[1];
      if (lang === "tr" && ogLocale !== "tr_TR") fail(`TR page without og:locale tr_TR: ${loc}`);
      if (lang === "en" && ogLocale && ogLocale !== "en_US") fail(`EN page with og:locale ${ogLocale}: ${loc}`);
      for (const m of html.matchAll(/href="(\/[^"#?]*)"/g)) {
        const href = m[1];
        if (href.length > 1 && href.endsWith("/") && !href.startsWith("//")) {
          fail(`Internal link with trailing slash (308) in dist/${rel}: ${href}`);
        }
      }
    }
    for (const [loc, alts] of hreflangByUrl) {
      const langs = Object.keys(alts).filter((k) => k !== "x-default");
      if (!langs.length) continue;
      const selfLang = (fs.readFileSync(path.join(dist, new URL(loc).pathname === "/" ? "index.html" : `${new URL(loc).pathname.slice(1)}.html`), "utf8").match(/<html\s+lang="([^"]+)"/i) || [])[1];
      if (alts[selfLang] !== loc) fail(`hreflang self-reference missing on ${loc}`);
      for (const [lang, href] of Object.entries(alts)) {
        if (!seenLoc.has(href)) fail(`hreflang ${lang} on ${loc} points to non-sitemap URL ${href}`);
        if (lang === "x-default") continue;
        const back = hreflangByUrl.get(href);
        if (back && back[selfLang] !== loc) fail(`hreflang not reciprocal: ${loc} -> ${href} (${lang})`);
      }
    }
    // No folder-index shells may remain anywhere except the root.
    const walk = (dir) => {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) {
          if (["assets", ".well-known"].includes(ent.name)) continue;
          walk(full);
        } else if (ent.name === "index.html" && dir !== dist) {
          fail(`Stale folder index shell: ${path.relative(dist, full)} (Pages would 308 to trailing slash)`);
        }
      }
    };
    walk(dist);
  }
}

console.log(`SEO validate: ${PUBLIC_ROUTES.length} routes, ${KEYWORD_STRATEGY.length} keywords, ${Object.keys(NICHE_LANDINGS).length} niches`);
for (const w of warnings) console.warn(`WARN  ${w}`);
for (const e of errors) console.error(`ERROR ${e}`);

if (errors.length) {
  console.error(`\nseo-validate failed: ${errors.length} error(s), ${warnings.length} warning(s)`);
  process.exit(1);
}
console.log(`\nseo-validate ok (${warnings.length} warning(s))`);
