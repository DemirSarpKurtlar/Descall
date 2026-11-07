/**
 * Cloudflare Pages worker routes (descall.com) match vercel.json and the app's own links.
 * /tr/login and /tr/register 404'd in production because only vercel.json knew them.
 * Run: node src/site/pagesWorkerRoutes.selftest.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import worker from "../../public/_worker.js";
import { mergedPageRedirects } from "./seo/mergedPages.js";
import { PUBLIC_ROUTES } from "./seoConfig.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const vercel = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8"));
const redirectsFile = fs.readFileSync(path.join(root, "public/_redirects"), "utf8");

const SHELL = "<!doctype html><title>shell</title>";
const FILES = new Set(["/", "/404.html", "/tr/download.html"]);
const env = {
  ASSETS: {
    async fetch(request) {
      const { pathname } = new URL(request.url);
      if (pathname === "/index.html") return new Response(null, { status: 308, headers: { location: "/" } });
      if (FILES.has(pathname)) return new Response(pathname === "/" ? SHELL : "page", { status: 200, headers: { "content-type": "text/html" } });
      // Pages serves /tr/download from tr/download.html.
      if (FILES.has(`${pathname}.html`)) return new Response("page", { status: 200, headers: { "content-type": "text/html" } });
      return new Response("missing", { status: 404 });
    },
  },
};

async function get(pathname) {
  return worker.fetch(new Request(`https://descall.com${pathname}`), env);
}

for (const p of ["/login", "/register", "/tr/login", "/tr/register", "/tr/login/", "/tr/register/abc", "/tr/register?ref=x"]) {
  const res = await get(p);
  assert.equal(res.status, 200, `${p} must serve the app shell`);
  assert.equal(await res.text(), SHELL, `${p} must serve the root shell`);
}
assert.equal((await get("/tr/loginx")).status, 404, "prefix match must not swallow other paths");

// SEO 3.7.14: the app shell is never indexed; marketing pages have one URL (no trailing slash).
for (const p of ["/app", "/login", "/register", "/s/abc", "/direct/x"]) {
  assert.equal((await get(p)).headers.get("x-robots-tag"), "noindex, follow", `${p} is noindex`);
}
for (const [from, to] of [["/tr/", "/tr"], ["/tr/download/", "/tr/download"], ["/features/?a=1", "/features?a=1"], ["/discord-alternative-turkey/", "/tr/discord-alternatifi"]]) {
  const res = await get(from);
  assert.equal(res.status, 301, `${from} redirects`);
  assert.equal(res.headers.get("location"), `https://descall.com${to}`, `${from} -> ${to}`);
}
// Letter case: an existing page answers 301 to its lower-case URL, anything else stays 404.
for (const [from, to] of [["/TR/Download", "/tr/download"], ["/tr/DOWNLOAD?x=1", "/tr/download?x=1"]]) {
  const res = await get(from);
  assert.equal(res.status, 301, `${from} redirects`);
  assert.equal(res.headers.get("location"), `https://descall.com${to}`, `${from} -> ${to}`);
}
assert.equal((await get("/Nope")).status, 404, "unknown upper-case path stays 404");
assert.equal((await get("/assets/App-X.js")).status, 404, "files are never case-folded");
assert.equal((await get("/s/AbC")).status, 200, "invite codes keep their case (app shell)");
assert.equal((await get("/")).status, 200, "the root is served, never redirected");
assert.equal((await get("/")).headers.get("x-robots-tag"), null, "marketing pages stay indexable");

const owner = {
  "/founder": "/who-owns-descall",
  "/owner": "/who-owns-descall",
  "/kurucu": "/descall-sahibi",
  "/sahip": "/descall-sahibi",
  "/tr/who-owns-descall": "/descall-sahibi",
};
for (const [from, to] of Object.entries(owner)) {
  const res = await get(from);
  assert.equal(res.status, 301, `${from} must redirect`);
  assert.equal(res.headers.get("location"), `https://descall.com${to}`);
  assert.ok(redirectsFile.includes(`${from} ${to} 301`), `_redirects must list ${from}`);
  assert.ok(vercel.redirects.some((r) => r.source === from && r.destination === to), `vercel.json must list ${from}`);
}

// Merged pages (SEO audit, Nov 2026): every removed URL 301s to the kept page in every
// language, on Pages (worker + _redirects), Vercel and the Express server, and is no
// longer a route (so it is out of the sitemaps and hreflang sets).
const serverJs = fs.readFileSync(path.join(root, "backend/server.js"), "utf8");
const merged = mergedPageRedirects();
assert.ok(merged.length >= 35, "five merged pages in seven languages");
for (const [from, to] of merged) {
  const res = await get(from);
  assert.equal(res.status, 301, `${from} must redirect`);
  assert.equal(res.headers.get("location"), `https://descall.com${to}`, `${from} -> ${to}`);
  assert.ok(redirectsFile.includes(`${from} ${to} 301`), `_redirects must list ${from}`);
  assert.ok(vercel.redirects.some((r) => r.source === from && r.destination === to && r.statusCode === 301), `vercel.json must list ${from}`);
  assert.ok(serverJs.includes(`"${from}": "${to}"`), `backend/server.js must list ${from}`);
  assert.ok(!PUBLIC_ROUTES.some((r) => r.path === from), `${from} is not a route any more`);
  assert.ok(PUBLIC_ROUTES.some((r) => r.path === to), `${to} is a live route`);
}

// Every SPA rewrite on Vercel has a matching shell route on Cloudflare Pages.
const sources = vercel.rewrites.map((r) => r.source).filter((s) => !s.startsWith("/api"));
for (const source of sources) {
  const sample = source.replace("/:path*", "/x");
  const res = await get(sample);
  assert.equal(res.status, 200, `Pages worker must serve ${sample} like vercel.json (${source})`);
}
for (const p of ["/tr/login", "/tr/register"]) {
  assert.ok(sources.includes(p) && sources.includes(`${p}/:path*`), `vercel.json must rewrite ${p}`);
}

// 3.0.1 universal links: AASA is served as JSON, 200, no redirect, never the SPA shell.
const aasaBody = fs.readFileSync(path.join(root, "public/.well-known/apple-app-site-association"), "utf8");
const aasaEnv = {
  ASSETS: {
    async fetch(request) {
      const { pathname } = new URL(request.url);
      if (pathname === "/.well-known/apple-app-site-association") {
        return new Response(aasaBody, { status: 200, headers: { "content-type": "application/octet-stream" } });
      }
      return env.ASSETS.fetch(request);
    },
  },
};
for (const p of ["/.well-known/apple-app-site-association", "/apple-app-site-association"]) {
  const res = await worker.fetch(new Request(`https://descall.com${p}`), aasaEnv);
  assert.equal(res.status, 200, `${p} must be 200`);
  assert.equal(res.headers.get("location"), null, `${p} must not redirect`);
  assert.match(res.headers.get("content-type") || "", /^application\/json/, `${p} must be JSON`);
  assert.deepEqual(JSON.parse(await res.text()), JSON.parse(aasaBody));
}
const aasaHeaders = vercel.headers.find((h) => h.source === "/.well-known/apple-app-site-association");
assert.ok(aasaHeaders?.headers.some((h) => h.key === "Content-Type" && h.value === "application/json"), "vercel.json AASA content-type");
assert.ok(!vercel.rewrites.some((r) => r.source.startsWith("/.well-known")), "no rewrite may swallow /.well-known");

// Hashed build output is immutable (Pages default was 4 h + must-revalidate).
const assetEnv = {
  ASSETS: {
    async fetch(request) {
      const { pathname } = new URL(request.url);
      if (pathname === "/assets/index-abc123.js") {
        return new Response("x", { status: 200, headers: { "content-type": "text/javascript", "cache-control": "public, max-age=14400, must-revalidate" } });
      }
      return env.ASSETS.fetch(request);
    },
  },
};
{
  const res = await worker.fetch(new Request("https://descall.com/assets/index-abc123.js"), assetEnv);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "public, max-age=31536000, immutable", "/assets/* must be immutable");
  const missing = await worker.fetch(new Request("https://descall.com/assets/gone-123.js"), assetEnv);
  assert.equal(missing.status, 404, "a missing asset is still a 404");
  assert.notEqual(missing.headers.get("cache-control"), "public, max-age=31536000, immutable", "a 404 is never cached for a year");
}
assert.match(fs.readFileSync(path.join(root, "public/_headers"), "utf8"), /\/assets\/\*\n\s+Cache-Control: public, max-age=31536000, immutable/, "_headers marks /assets/* immutable");
assert.ok(vercel.headers.some((h) => h.source === "/assets/(.*)" && h.headers.some((x) => /immutable/.test(x.value))), "vercel.json marks /assets immutable");

console.log("pagesWorkerRoutes selftest ok");
