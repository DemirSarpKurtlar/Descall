/**
 * Favicon markup is the same on the SPA index, the human sitemap, JSON-LD,
 * the web manifest, and robots. The Vercel catch-all must not rewrite icons
 * to index.html.
 *
 * Run: node src/site/siteIcons.selftest.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildHumanSitemapHtml } from "./buildSitemapHtml.js";
import { buildOrganizationLd, buildWebSiteLd } from "./jsonLdBuilders.js";
import {
  FAVICON_FILES,
  FAVICON_VERSION,
  faviconLinksHtml,
  withFaviconVersion,
} from "./siteIcons.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let failed = 0;

function assert(cond, message) {
  if (cond) return;
  failed += 1;
  console.error(`FAIL ${message}`);
}

function pngSize(buf) {
  const sig = buf.subarray(0, 8).toString("hex");
  assert(sig === "89504e470d0a1a0a", "png signature");
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

const indexHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
const links = faviconLinksHtml("    ");
for (const line of links.split("\n")) {
  assert(indexHtml.includes(line.trim()), `index.html missing ${line.trim()}`);
}

const sitemap = buildHumanSitemapHtml({ origin: "https://descall.com", routes: [], lang: "en" });
for (const line of faviconLinksHtml("  ").split("\n")) {
  assert(sitemap.includes(line.trim()), `sitemap html missing ${line.trim()}`);
}

const logoUrl = `https://descall.com/favicon-192.png?v=${FAVICON_VERSION}`;
for (const ld of [buildOrganizationLd(), buildWebSiteLd()]) {
  assert(ld.logo?.url === logoUrl, `${ld["@type"]} logo url`);
  assert(ld.logo?.width === 192 && ld.logo?.height === 192, `${ld["@type"]} logo size`);
}
assert(indexHtml.includes(logoUrl), "index.html JSON-LD logo");

const manifest = JSON.parse(fs.readFileSync(path.join(root, "public/manifest.webmanifest"), "utf8"));
for (const size of [48, 96, 144, 192]) {
  const src = withFaviconVersion(`/favicon-${size}.png`);
  assert(
    manifest.icons.some((icon) => icon.src === src && icon.sizes === `${size}x${size}` && icon.type === "image/png"),
    `manifest missing ${size}`
  );
}

const robots = fs.readFileSync(path.join(root, "public/robots.txt"), "utf8");
const apiRobots = fs.readFileSync(path.join(root, "backend/routes/sitemap.js"), "utf8");
for (const file of ["favicon.ico", "favicon.svg", "favicon-48.png", "favicon-96.png", "favicon-144.png", "favicon-192.png", "apple-touch-icon.png"]) {
  assert(robots.includes(`Allow: /${file}`), `robots missing ${file}`);
  assert(!robots.includes(`Disallow: /${file}`), `robots blocks ${file}`);
  assert(apiRobots.includes(`Allow: /${file}`), `api robots missing ${file}`);
}

const vercel = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8"));
const iconRewrite = vercel.rewrites.find((rule) => /favicon|apple-touch-icon|\/icon/i.test(String(rule.source)));
assert(!iconRewrite, "vercel rewrites must not send icon URLs to index.html");
const notFound = fs.readFileSync(path.join(root, "public/404.html"), "utf8");
assert(notFound.includes("noindex"), "404.html noindex");
assert(notFound.includes('href="/"'), "404.html home link");
assert(notFound.includes('href="/download"'), "404.html download link");
const redirects = fs.readFileSync(path.join(root, "public/_redirects"), "utf8");
assert(redirects.includes("/* /404.html 404"), "cloudflare 404 rule");
assert(!redirects.includes("/index.html 200"), "cloudflare must not rewrite app routes onto /index.html");
const worker = fs.readFileSync(path.join(root, "public/_worker.js"), "utf8");
assert(worker.includes('"/groups"') && worker.includes('"/invite"') && worker.includes("/404.html"), "pages worker serves the app shell and 404");
assert(worker.includes('readAsset(env, request, "/")'), "pages worker reads the root shell, not the /index.html redirect");
const icoHeader = vercel.headers.find((rule) => rule.source === "/favicon.ico");
assert(icoHeader?.headers?.some((h) => h.key === "Content-Type" && h.value === "image/x-icon"), "ico content-type");
const svgHeader = vercel.headers.find((rule) => rule.source === "/favicon.svg");
assert(svgHeader?.headers?.some((h) => h.key === "Content-Type" && h.value === "image/svg+xml"), "svg content-type");

const svg = fs.readFileSync(path.join(root, "public/favicon.svg"), "utf8");
assert(/<svg[^>]*\swidth="48"/.test(svg) && /<svg[^>]*\sheight="48"/.test(svg), "svg favicon has width and height");

for (const file of FAVICON_FILES) {
  const buf = fs.readFileSync(path.join(root, "public", file.file));
  assert(buf.length > 32, `${file.file} empty`);
  if (file.size && file.file.endsWith(".png")) {
    const { w, h } = pngSize(buf);
    assert(w === file.size && h === file.size, `${file.file} is ${w}x${h}, expected ${file.size}`);
  }
}

const sw = fs.readFileSync(path.join(root, "public/sw.js"), "utf8");
assert(sw.includes(withFaviconVersion("/favicon-192.png")), "sw notification icon");
assert(sw.includes(withFaviconVersion("/favicon-32.png")), "sw notification badge");

if (failed) {
  console.error(`siteIcons.selftest: ${failed} failure(s)`);
  process.exit(1);
}
console.log("siteIcons.selftest ok");
