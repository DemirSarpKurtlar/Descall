#!/usr/bin/env node
/**
 * Internal-link audit on the built HTML (runs in build:prod after prerender).
 *
 * For every indexable route it reads dist/<route>.html, takes the internal links of the
 * crawlable shell (#seo-static, which is what a crawler without JavaScript sees), and
 * counts how many OTHER pages link to each route. A route with fewer than MIN_INBOUND
 * linking pages fails the build: it is an orphan or close to one.
 *
 * The old version guessed links from hub lists and flagged every /de, /es, ... page as
 * an orphan (75 false warnings) because it never looked at the localized shells.
 *
 * SEO round 2 (Nov 2026) adds, on the same shells:
 *  - every internal link that is not a page is run through the production worker
 *    (public/_worker.js with dist/ as its assets): a link to a 301 (merged page, old URL)
 *    or a 404 fails, links to files and the app shell pass;
 *  - click depth: every page is reachable from "/" in at most MAX_DEPTH clicks;
 *  - images: every <img> of a shell has an alt attribute (empty only when aria-hidden)
 *    and width / height (no layout shift while it loads).
 *
 * Usage: node scripts/seo-link-audit.mjs [--min=3] [--report]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const minArg = process.argv.find((a) => a.startsWith("--min="));
const MIN_INBOUND = Number(minArg ? minArg.split("=")[1] : 3);
const report = process.argv.includes("--report");

const { PUBLIC_ROUTES } = await import(pathToFileURL(path.join(root, "src/site/seoConfig.js")).href);

function fileFor(routePath) {
  return path.join(dist, routePath === "/" ? "index.html" : `${routePath.slice(1)}.html`);
}

function clean(href) {
  const p = href.split(/[?#]/)[0].replace(/\/+$/, "");
  return p || "/";
}

/** Internal page links of the crawlable shell (the prerendered #seo-static block). */
function shellLinks(html) {
  const start = html.indexOf('<div id="seo-static"');
  if (start < 0) return [];
  const end = html.indexOf('<div id="mkt-consent-static"', start);
  const shell = html.slice(start, end > start ? end : undefined);
  const out = new Set();
  for (const m of shell.matchAll(/<a\b[^>]*\bhref="(\/[^"]*)"/g)) {
    if (m[1].startsWith("//")) continue;
    out.add(clean(m[1]));
  }
  return [...out];
}

if (!fs.existsSync(dist)) {
  console.error("seo-link-audit: dist/ missing, run the build first");
  process.exit(1);
}

const routes = PUBLIC_ROUTES.filter((r) => !r.noindex);
const known = new Set(routes.map((r) => r.path));
const inbound = new Map(routes.map((r) => [r.path, new Set()]));
const problems = [];

const MAX_DEPTH = 4;
const outbound = new Map();
const unknownTargets = new Map(); // target -> first page linking to it
let images = 0;

/** <img> tags of the shell without alt, or without width/height. */
function imageProblems(html, routePath) {
  const start = html.indexOf('<div id="seo-static"');
  if (start < 0) return [];
  const end = html.indexOf('<div id="mkt-consent-static"', start);
  const out = [];
  for (const m of html.slice(start, end > start ? end : undefined).matchAll(/<img\b[^>]*>/g)) {
    images += 1;
    const tag = m[0];
    const src = tag.match(/\ssrc="([^"]+)"/)?.[1] || "?";
    const alt = tag.match(/\salt="([^"]*)"/);
    if (!alt) out.push(`${routePath}: <img src="${src}"> has no alt`);
    else if (!alt[1].trim() && !/aria-hidden="true"/.test(tag)) out.push(`${routePath}: <img src="${src}"> has an empty alt but is not aria-hidden`);
    if (!/\swidth="\d+"/.test(tag) || !/\sheight="\d+"/.test(tag)) out.push(`${routePath}: <img src="${src}"> has no width/height`);
  }
  return out;
}

for (const route of routes) {
  const file = fileFor(route.path);
  if (!fs.existsSync(file)) {
    problems.push(`missing shell for ${route.path}`);
    continue;
  }
  const html = fs.readFileSync(file, "utf8");
  const links = shellLinks(html);
  outbound.set(route.path, links.filter((t) => known.has(t)));
  for (const target of links) {
    if (!known.has(target)) {
      if (!unknownTargets.has(target)) unknownTargets.set(target, route.path);
      continue;
    }
    if (target === route.path) continue;
    inbound.get(target).add(route.path);
  }
  problems.push(...imageProblems(html, route.path));
}

// Links that are not pages: ask the production worker what they answer.
const { default: worker } = await import(pathToFileURL(path.join(root, "public/_worker.js")).href);
const assetEnv = {
  ASSETS: {
    async fetch(request) {
      const { pathname } = new URL(request.url);
      const rel = decodeURIComponent(pathname === "/" ? "/index.html" : pathname);
      for (const candidate of [rel, `${rel}.html`]) {
        const file = path.join(dist, candidate);
        if (file.startsWith(dist) && fs.existsSync(file) && fs.statSync(file).isFile()) {
          return new Response(fs.readFileSync(file), { status: 200, headers: { "content-type": "text/html" } });
        }
      }
      return new Response("missing", { status: 404 });
    },
  },
};
let linkedFiles = 0;
for (const [target, from] of unknownTargets) {
  const res = await worker.fetch(new Request(`https://descall.com${target}`), assetEnv);
  if (res.status === 301 || res.status === 302 || res.status === 308) {
    problems.push(`${from} links to ${target}, a redirect to ${res.headers.get("location")?.replace("https://descall.com", "")}: link the page itself`);
  } else if (res.status >= 400) {
    problems.push(`${from} links to ${target}, which answers ${res.status}`);
  } else linkedFiles += 1;
}

// Click depth from the English home (the URL crawlers find first).
const depth = new Map([["/", 0]]);
for (let queue = ["/"]; queue.length; ) {
  const next = [];
  for (const p of queue) {
    for (const t of outbound.get(p) || []) {
      if (depth.has(t)) continue;
      depth.set(t, depth.get(p) + 1);
      next.push(t);
    }
  }
  queue = next;
}
const deepest = Math.max(...routes.map((r) => depth.get(r.path) ?? Infinity));
for (const r of routes) {
  const d = depth.get(r.path);
  if (d === undefined) problems.push(`${r.path} cannot be reached from / through page links`);
  else if (d > MAX_DEPTH) problems.push(`${r.path} is ${d} clicks from / (max ${MAX_DEPTH})`);
}

const weak = routes
  .map((r) => ({ path: r.path, count: inbound.get(r.path).size }))
  .filter((r) => r.count < MIN_INBOUND)
  .sort((a, b) => a.count - b.count);

const counts = [...inbound.values()].map((s) => s.size).sort((a, b) => a - b);
console.log(
  `seo-link-audit: ${routes.length} routes, inbound links per page min ${counts[0]}, median ${counts[Math.floor(counts.length / 2)]} (need >= ${MIN_INBOUND})`
);
console.log(
  `seo-link-audit: click depth from / at most ${deepest} (max ${MAX_DEPTH}); ${unknownTargets.size} non-page link targets (${linkedFiles} files / app routes answer 200); ${images} shell images checked for alt and size`
);
if (report) {
  for (const r of routes.map((x) => ({ path: x.path, count: inbound.get(x.path).size })).sort((a, b) => a.count - b.count).slice(0, 40)) {
    console.log(`  ${String(r.count).padStart(4)}  ${r.path}`);
  }
}
for (const p of problems) console.error(`ERROR ${p}`);
for (const w of weak) console.error(`ERROR ${w.path}: linked from ${w.count} page(s), need ${MIN_INBOUND}`);
if (problems.length || weak.length) {
  console.error(`\nseo-link-audit failed: ${weak.length} weakly linked route(s), ${problems.length} other problem(s)`);
  process.exit(1);
}
console.log("seo-link-audit: ok");
