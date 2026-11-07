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

for (const route of routes) {
  const file = fileFor(route.path);
  if (!fs.existsSync(file)) {
    problems.push(`missing shell for ${route.path}`);
    continue;
  }
  for (const target of shellLinks(fs.readFileSync(file, "utf8"))) {
    if (target === route.path || !known.has(target)) continue;
    inbound.get(target).add(route.path);
  }
}

const weak = routes
  .map((r) => ({ path: r.path, count: inbound.get(r.path).size }))
  .filter((r) => r.count < MIN_INBOUND)
  .sort((a, b) => a.count - b.count);

const counts = [...inbound.values()].map((s) => s.size).sort((a, b) => a - b);
console.log(
  `seo-link-audit: ${routes.length} routes, inbound links per page min ${counts[0]}, median ${counts[Math.floor(counts.length / 2)]} (need >= ${MIN_INBOUND})`
);
if (report) {
  for (const r of routes.map((x) => ({ path: x.path, count: inbound.get(x.path).size })).sort((a, b) => a.count - b.count).slice(0, 40)) {
    console.log(`  ${String(r.count).padStart(4)}  ${r.path}`);
  }
}
for (const p of problems) console.error(`ERROR ${p}`);
for (const w of weak) console.error(`ERROR ${w.path}: linked from ${w.count} page(s), need ${MIN_INBOUND}`);
if (problems.length || weak.length) {
  console.error(`\nseo-link-audit failed: ${weak.length} weakly linked route(s)`);
  process.exit(1);
}
console.log("seo-link-audit: ok");
