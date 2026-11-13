/**
 * Write production robots.txt + multi-table sitemap XML into dist/ for Vercel.
 * Stops Google from discovering SEO files via the Render proxy (onrender.com).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const distDir = path.join(root, "dist");
const SITE = "https://descall.com";

const { PUBLIC_ROUTES, localizeRouteMeta } = await import(pathToFileURL(path.join(root, "src/site/seoConfig.js")).href);
const { buildHumanSitemapHtml, SITEMAP_XSL } = await import(
  pathToFileURL(path.join(root, "src/site/buildSitemapHtml.js")).href
);
const {
  SITEMAP_TABLES,
  SITEMAP_LANG_TABLES,
  allSitemapEntries,
  entriesForTable,
  entriesForLanguage,
} = await import(pathToFileURL(path.join(root, "src/site/sitemapCatalog.js")).href);
const { llmsTxt, llmsFullTxt, humansTxt, securityTxt } = await import(
  pathToFileURL(path.join(root, "src/site/ownershipFacts.js")).href
);

const { BLOG_POSTS } = await import(pathToFileURL(path.join(root, "src/site/content/discordSeoContent.js")).href);
const { TR_BLOG_POSTS } = await import(pathToFileURL(path.join(root, "src/site/seo/trBlog.js")).href);
const { NICHE_LANDINGS } = await import(pathToFileURL(path.join(root, "src/site/seo/nicheLandings.js")).href);
const { contentLastmod } = await import(pathToFileURL(path.join(root, "src/site/seo/contentDates.js")).href);
const { hreflangAlternates } = await import(pathToFileURL(path.join(root, "src/site/localePaths.js")).href);
const { PREFIXED_SITE_LOCALES, localePrefix, prefixedLocaleFromPath, stripPrefixedLocale } = await import(
  pathToFileURL(path.join(root, "src/site/siteLocales.js")).href
);
const { siteText } = await import(pathToFileURL(path.join(root, "src/site/siteText.js")).href);
const { registerSiteCatalogs } = await import(pathToFileURL(path.join(__dirname, "siteCatalogs.mjs")).href);
const { readDirectoryThinPaths } = await import(pathToFileURL(path.join(__dirname, "directoryPrerender.mjs")).href);
const { INDEXNOW_KEY, BUILD_ID_FILE } = await import(pathToFileURL(path.join(__dirname, "indexnow-submit.mjs")).href);

/** Commit of this build: Cloudflare Pages sets CF_PAGES_COMMIT_SHA, GitHub Actions GITHUB_SHA. */
function buildCommit() {
  const fromEnv = process.env.CF_PAGES_COMMIT_SHA || process.env.GITHUB_SHA;
  if (fromEnv) return fromEnv.trim();
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

/**
 * Server directory category pages this build left noindex (fewer than 3 listed servers,
 * dist/directory-manifest.json from prerender-seo): not in any sitemap.
 */
let sitemapOptions = { exclude: [] };

/**
 * Sitemap lastmod = the day the page's copy last changed (src/site/seo/contentDates.js),
 * never a git or build date: code and style commits used to move it for most URLs.
 */
const lastmodFor = contentLastmod;

function xmlEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function assertHttpsDescall(url) {
  if (!url.startsWith("https://descall.com")) {
    throw new Error(`[generate-seo-files] Non-canonical URL: ${url}`);
  }
}

/**
 * Crawlers of AI assistants and AI search (ChatGPT, Claude, Perplexity, Gemini, ...).
 * They get their own group, and a crawler that matches a named group ignores the `*`
 * group, so the group repeats the app-path Disallow lines: marketing pages and the
 * llms.txt files are open, the app, API and invite URLs stay closed for every bot.
 */
export const AI_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-SearchBot",
  "Claude-User",
  "anthropic-ai",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Applebot-Extended",
  "CCBot",
];

/** Private and ephemeral paths, closed for every crawler. */
export const ROBOTS_DISALLOW = `Disallow: /app/
Disallow: /api/
Disallow: /auth/
Disallow: /admin/
Disallow: /media/
Disallow: /groups/
Disallow: /friends/
Disallow: /guilds/
Disallow: /invite/
Disallow: /i/
Disallow: /debug/
Disallow: /health
Disallow: /*?*invite=
Disallow: /*?*announcement=`;

export function buildRobots() {
  const childAllows = SITEMAP_TABLES.map((t) => `Allow: /${t.file}`).join("\n");
  return `# Descall robots.txt — production (static, served from descall.com)
# Ownership facts for language models: https://descall.com/llms.txt

# AI assistants and AI search
${AI_CRAWLERS.map((ua) => `User-agent: ${ua}`).join("\n")}
Allow: /
Allow: /llms.txt
Allow: /llms-full.txt
${ROBOTS_DISALLOW}

User-agent: *
Allow: /
Allow: /download
Allow: /features
Allow: /faq
Allow: /security
Allow: /about
Allow: /who-owns-descall
Allow: /descall-sahibi
Allow: /privacy
Allow: /terms
Allow: /contact
Allow: /compare/
Allow: /discord-alternative
Allow: /tr/
${PREFIXED_SITE_LOCALES.map((id) => `Allow: ${localePrefix(id)}/\n`).join("")}Allow: /discord-alternative-for-communities
Allow: /discord-alternative-for-voice-chat
Allow: /discord-alternative-for-friends
Allow: /best-discord-alternative-for-gamers
Allow: /apps-like-discord
Allow: /discord-replacement
Allow: /alternatives
Allow: /blog
Allow: /blog/
Allow: /communities
Allow: /llms.txt
Allow: /llms-full.txt
Allow: /humans.txt
Allow: /.well-known/security.txt
Allow: /sitemap.xml
Allow: /sitemap-pages.xml
${SITEMAP_LANG_TABLES.map((t) => `Allow: /${t.file}`).join("\n")}
${childAllows}
Allow: /sitemap
Allow: /sitemap.html
Allow: /favicon.ico
Allow: /favicon.svg
Allow: /favicon-32.png
Allow: /favicon-48.png
Allow: /favicon-96.png
Allow: /favicon-144.png
Allow: /favicon-192.png
Allow: /favicon-512.png
Allow: /icon-512.png
Allow: /apple-touch-icon.png
Allow: /manifest.webmanifest

${ROBOTS_DISALLOW}

Sitemap: ${SITE}/sitemap.xml
`;
}

/**
 * SEO 3.7.14: hreflang alternates in the sitemap too (Google reads either source).
 * Every served site language of the page plus x-default; nothing for one-language pages.
 */
export function alternateLinks(loc, { locales, pageDrafts } = {}) {
  let pathname = "/";
  try {
    pathname = new URL(loc).pathname || "/";
  } catch {
    return "";
  }
  const alternates = hreflangAlternates(pathname, {
    ...(locales ? { locales } : {}),
    ...(pageDrafts ? { pageDrafts } : {}),
  });
  if (!alternates.length) return "";
  return (
    alternates
      .map((alt) => `    <xhtml:link rel="alternate" hreflang="${alt.hreflang}" href="${xmlEscape(`${SITE}${alt.path}`)}" />`)
      .join("\n") + "\n"
  );
}

/**
 * Image sitemap entries of a page: the product shots and screenshots of its prerendered
 * HTML (not the logo or icons), with their alt text as the title.
 */
export function pageImages(loc) {
  let pathname = "/";
  try {
    pathname = new URL(loc).pathname || "/";
  } catch {
    return [];
  }
  const file = path.join(distDir, pathname === "/" ? "index.html" : `${pathname.replace(/^\//, "")}.html`);
  if (!fs.existsSync(file)) return [];
  const html = fs.readFileSync(file, "utf8");
  const body = html.slice(html.indexOf('<div id="seo-static"'));
  const out = new Map();
  for (const m of body.matchAll(/<img\b[^>]*>/g)) {
    const src = m[0].match(/\ssrc="(\/brand\/previews\/[^"]+\.(?:webp|png|jpe?g))"/)?.[1];
    if (!src || out.has(src)) continue;
    out.set(src, (m[0].match(/\salt="([^"]*)"/)?.[1] || "").trim());
  }
  return [...out].map(([src, alt]) => ({ loc: `${SITE}${src}`, title: alt }));
}

function imageLinks(loc) {
  return pageImages(loc)
    .map((img) => `    <image:image>\n      <image:loc>${xmlEscape(img.loc)}</image:loc>\n    </image:image>\n`)
    .join("");
}

export function buildUrlset(entries) {
  const urls = entries.map((e) => {
    assertHttpsDescall(e.loc);
    // sitemaps.org schema order: loc, lastmod, changefreq, priority, then the extension
    // elements (xhtml:link, image:image). They used to come before lastmod, which a strict
    // validator rejects (seo-validate --dist checks the order).
    return `  <url>
    <loc>${xmlEscape(e.loc)}</loc>
    <lastmod>${xmlEscape(e.lastmod)}</lastmod>
    <changefreq>${xmlEscape(e.changefreq || "weekly")}</changefreq>
    <priority>${xmlEscape(e.priority || "0.5")}</priority>
${alternateLinks(e.loc)}${imageLinks(e.loc)}  </url>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet type="text/xsl" href="/sitemap.xsl"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls.join("\n")}
</urlset>
`;
}

function buildSitemapIndex(now) {
  const children = SITEMAP_LANG_TABLES.map((t) => {
    const loc = `${SITE}/${t.file}`;
    assertHttpsDescall(loc);
    const newest = entriesForLanguage(t.lang, SITE, now, lastmodFor, sitemapOptions)
      .map((e) => e.lastmod)
      .sort()
      .pop();
    return `  <sitemap>
    <loc>${xmlEscape(loc)}</loc>
    <lastmod>${xmlEscape(newest || now)}</lastmod>
  </sitemap>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet type="text/xsl" href="/sitemap.xsl"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${children.join("\n")}
</sitemapindex>
`;
}

function buildSitemapHtml() {
  return buildHumanSitemapHtml({
    origin: SITE,
    routes: PUBLIC_ROUTES.filter((r) => !r.noindex && !r.noindexFollow && !sitemapOptions.exclude.includes(r.path)).map((r) => localizeRouteMeta(r, siteText)),
    lang: "en",
  });
}

function guardBody(name, body) {
  if (/https?:\/\/[^"'\s]*onrender\.com/i.test(body)) {
    throw new Error(`[generate-seo-files] ${name} contains onrender.com`);
  }
  if (/http:\/\/descall\.com/i.test(body)) {
    throw new Error(`[generate-seo-files] ${name} contains http://descall.com`);
  }
  if (/localhost|127\.0\.0\.1|vercel\.app/i.test(body)) {
    throw new Error(`[generate-seo-files] ${name} contains non-production host`);
  }
}

async function main() {
  await registerSiteCatalogs();
  if (!fs.existsSync(distDir)) {
    console.error("[generate-seo-files] dist/ missing — run vite build first");
    process.exit(1);
  }

  sitemapOptions = { exclude: readDirectoryThinPaths(distDir) };
  const now = new Date().toISOString();
  const allEntries = allSitemapEntries(SITE, now, lastmodFor, sitemapOptions);
  const robots = buildRobots();
  const index = buildSitemapIndex(now);
  const pages = buildUrlset(allEntries);
  const html = buildSitemapHtml();
  const tableBodies = [
    ...SITEMAP_TABLES.map((t) => ({ file: t.file, body: buildUrlset(entriesForTable(t.id, SITE, now, lastmodFor, sitemapOptions)) })),
    ...SITEMAP_LANG_TABLES.map((t) => ({ file: t.file, body: buildUrlset(entriesForLanguage(t.lang, SITE, now, lastmodFor, sitemapOptions)) })),
  ];

  for (const [name, body] of [
    ["robots", robots],
    ["sitemap", index],
    ["pages", pages],
    ...tableBodies.map((t) => [t.file, t.body]),
  ]) {
    guardBody(name, body);
  }

  fs.writeFileSync(path.join(distDir, "robots.txt"), robots, "utf8");
  fs.writeFileSync(path.join(distDir, "sitemap.xml"), index, "utf8");
  fs.writeFileSync(path.join(distDir, "sitemap-pages.xml"), pages, "utf8");
  for (const t of tableBodies) {
    fs.writeFileSync(path.join(distDir, t.file), t.body, "utf8");
  }
  fs.writeFileSync(path.join(distDir, "sitemap.html"), html, "utf8");
  fs.writeFileSync(path.join(distDir, "sitemap.xsl"), SITEMAP_XSL, "utf8");

  const llms = llmsTxt();
  const llmsFull = llmsFullTxt();
  const humans = humansTxt();
  const security = securityTxt();
  guardBody("llms.txt", llms);
  guardBody("llms-full.txt", llmsFull);
  guardBody("humans.txt", humans);
  guardBody("security.txt", security);

  const wellKnownDist = path.join(distDir, ".well-known");
  fs.mkdirSync(wellKnownDist, { recursive: true });
  fs.writeFileSync(path.join(distDir, "llms.txt"), llms, "utf8");
  fs.writeFileSync(path.join(distDir, "llms-full.txt"), llmsFull, "utf8");
  fs.writeFileSync(path.join(distDir, "humans.txt"), humans, "utf8");
  fs.writeFileSync(path.join(wellKnownDist, "security.txt"), security, "utf8");

  // IndexNow key file (Bing, Yandex, Seznam, Naver): .github/workflows/indexnow.yml submits
  // the changed URLs after each deploy (scripts/indexnow-submit.mjs).
  const indexNowBody = `${INDEXNOW_KEY}\n`;
  fs.writeFileSync(path.join(distDir, `${INDEXNOW_KEY}.txt`), indexNowBody, "utf8");
  fs.writeFileSync(path.join(root, "public", `${INDEXNOW_KEY}.txt`), indexNowBody, "utf8");

  // Deploy marker: the commit this build came from. The IndexNow workflow waits until
  // descall.com serves its own commit before it reads the new sitemaps.
  fs.writeFileSync(path.join(distDir, BUILD_ID_FILE), `${buildCommit()}\n`, "utf8");

  // Also refresh public/ copies so Vite copies them on next builds too
  fs.writeFileSync(path.join(root, "public/robots.txt"), robots, "utf8");
  fs.writeFileSync(path.join(root, "public/sitemap.xsl"), SITEMAP_XSL, "utf8");
  fs.writeFileSync(path.join(root, "public/llms.txt"), llms, "utf8");
  fs.writeFileSync(path.join(root, "public/llms-full.txt"), llmsFull, "utf8");
  fs.writeFileSync(path.join(root, "public/humans.txt"), humans, "utf8");
  const wellKnownPublic = path.join(root, "public/.well-known");
  fs.mkdirSync(wellKnownPublic, { recursive: true });
  fs.writeFileSync(path.join(wellKnownPublic, "security.txt"), security, "utf8");

  const tableSummary = SITEMAP_TABLES.map(
    (t) => `${t.id}:${entriesForTable(t.id, SITE, now).length}`
  ).join(", ");
  console.log(
    `[generate-seo-files] wrote robots + llms.txt + humans.txt + sitemap index/tables/pages/html (${PUBLIC_ROUTES.length} routes; ${tableSummary}) → ${SITE}`
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  await main();
}
