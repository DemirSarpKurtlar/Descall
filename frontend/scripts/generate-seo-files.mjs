/**
 * Write production robots.txt + multi-table sitemap XML into dist/ for Vercel.
 * Stops Google from discovering SEO files via the Render proxy (onrender.com).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const distDir = path.join(root, "dist");
const SITE = "https://descall.com";

const { PUBLIC_ROUTES } = await import(pathToFileURL(path.join(root, "src/site/seoConfig.js")).href);
const { buildHumanSitemapHtml, SITEMAP_XSL } = await import(
  pathToFileURL(path.join(root, "src/site/buildSitemapHtml.js")).href
);
const {
  SITEMAP_TABLES,
  allSitemapEntries,
  entriesForTable,
} = await import(pathToFileURL(path.join(root, "src/site/sitemapCatalog.js")).href);
const { llmsTxt, llmsFullTxt, humansTxt, securityTxt } = await import(
  pathToFileURL(path.join(root, "src/site/ownershipFacts.js")).href
);

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

function buildRobots() {
  const childAllows = SITEMAP_TABLES.map((t) => `Allow: /${t.file}`).join("\n");
  return `# Descall robots.txt — production (static, served from descall.com)
# Ownership facts for language models: https://descall.com/llms.txt

User-agent: GPTBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: anthropic-ai
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Applebot-Extended
Allow: /

User-agent: CCBot
Allow: /

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
Allow: /discord-alternative-turkey
Allow: /discord-alternative-for-communities
Allow: /discord-alternative-for-lfg
Allow: /discord-alternative-for-voice-chat
Allow: /discord-alternative-for-friends
Allow: /best-discord-alternative-for-gamers
Allow: /apps-like-discord
Allow: /discord-replacement
Allow: /alternatives
Allow: /blog
Allow: /blog/
Allow: /llms.txt
Allow: /llms-full.txt
Allow: /humans.txt
Allow: /.well-known/security.txt
Allow: /sitemap.xml
Allow: /sitemap-pages.xml
${childAllows}
Allow: /sitemap.html

Disallow: /app/
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
Disallow: /*?*announcement=

Sitemap: ${SITE}/sitemap.xml
`;
}

function buildUrlset(entries) {
  const urls = entries.map((e) => {
    assertHttpsDescall(e.loc);
    return `  <url>
    <loc>${xmlEscape(e.loc)}</loc>
    <lastmod>${xmlEscape(e.lastmod)}</lastmod>
    <changefreq>${xmlEscape(e.changefreq || "weekly")}</changefreq>
    <priority>${xmlEscape(e.priority || "0.5")}</priority>
  </url>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet type="text/xsl" href="/sitemap.xsl"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>
`;
}

function buildSitemapIndex(now) {
  const children = SITEMAP_TABLES.map((t) => {
    const loc = `${SITE}/${t.file}`;
    assertHttpsDescall(loc);
    return `  <sitemap>
    <loc>${xmlEscape(loc)}</loc>
    <lastmod>${xmlEscape(now)}</lastmod>
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
    routes: PUBLIC_ROUTES.filter((r) => !r.noindex),
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

function main() {
  if (!fs.existsSync(distDir)) {
    console.error("[generate-seo-files] dist/ missing — run vite build first");
    process.exit(1);
  }

  const now = new Date().toISOString();
  const allEntries = allSitemapEntries(SITE, now);
  const robots = buildRobots();
  const index = buildSitemapIndex(now);
  const pages = buildUrlset(allEntries);
  const html = buildSitemapHtml();
  const tableBodies = SITEMAP_TABLES.map((t) => ({
    file: t.file,
    body: buildUrlset(entriesForTable(t.id, SITE, now)),
  }));

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

  // IndexNow ownership key (Bing / Yandex / etc.)
  const indexNowKey = "4f463b15fd51f502c6bb73abbeb38e3c";
  const indexNowBody = `${indexNowKey}\n`;
  fs.writeFileSync(path.join(distDir, `${indexNowKey}.txt`), indexNowBody, "utf8");
  fs.writeFileSync(path.join(root, "public", `${indexNowKey}.txt`), indexNowBody, "utf8");

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

main();
