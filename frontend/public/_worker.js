/**
 * Cloudflare Pages advanced-mode worker.
 *
 * A `_redirects` rewrite to `/index.html` is not a rewrite here: Pages pretty-URLs
 * `/index.html` to `/`, so `/groups` was 308'd onto the marketing homepage.
 * Fetch the shell from the asset store instead, and serve 404.html for real misses.
 * Marketing pages stay normal files: dist/<route>.html, which Pages serves at
 * /<route> with 200 (no trailing-slash redirect).
 *
 * This worker owns every response, so security headers are set here. `_headers`
 * is the backup when a request is not handled by the worker.
 *
 * Only the default export is allowed. Pages registers every named export as
 * a handler, and a string export fails the deployment.
 */

import { applySecurityHeaders, canonicalRedirect } from "./security-policy.js";

const SPA_PREFIXES = [
  "/direct",
  "/groups",
  "/servers",
  "/friends",
  "/calls",
  "/activity",
  "/settings",
  "/admin",
  "/invite",
  "/app",
  "/login",
  "/register",
  // Turkish auth entry points (MarketingApp opens the same login/register dialog).
  "/tr/login",
  "/tr/register",
  "/i",
  "/s",
];

/** Permanent marketing moves (kept in sync with _redirects). */
const PERMANENT_REDIRECTS = {
  "/discord-alternative-turkey": "/tr/discord-alternatifi",
  "/tr/discord-alternative": "/tr/discord-alternatifi",
  "/tr/contact": "/iletisim",
  "/founder": "/who-owns-descall",
  "/owner": "/who-owns-descall",
  "/kurucu": "/descall-sahibi",
  "/sahip": "/descall-sahibi",
  "/tr/who-owns-descall": "/descall-sahibi",
};

/** Removed surfaces: old links land on the home page (kept in sync with _redirects). */
const RETIRED_TO_HOME = ["/dimaai", "/play", "/lfg", "/valorant", "/riot", "/discord-alternative-for-lfg", "/blog/best-discord-alternative-for-lfg"];

function barePath(pathname) {
  const path = String(pathname || "/").split("?")[0];
  if (path.length > 1 && path.endsWith("/")) return path.slice(0, -1);
  return path || "/";
}

function isSpaPath(pathname) {
  const path = barePath(pathname);
  return SPA_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

function withSecurity(response) {
  const headers = new Headers(response.headers);
  // Asset responses sometimes carry a wildcard CORS header. The site is not an API.
  headers.delete("access-control-allow-origin");
  headers.delete("access-control-allow-credentials");
  applySecurityHeaders(headers);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function readAsset(env, request, pathname) {
  const target = new URL(request.url);
  target.pathname = pathname;
  target.search = "";
  let res = await env.ASSETS.fetch(new Request(target.toString(), { method: "GET", redirect: "manual" }));
  // /index.html and /404.html pretty-redirect (308, empty body) to / and /404.
  if (res.status >= 300 && res.status < 400) {
    const loc = res.headers.get("location");
    if (loc) {
      const next = new URL(loc, target);
      next.search = "";
      res = await env.ASSETS.fetch(new Request(next.toString(), { method: "GET", redirect: "manual" }));
    }
  }
  return res;
}

function htmlResponse(source, status, cacheControl) {
  const headers = new Headers();
  const type = source.headers.get("content-type") || "text/html; charset=utf-8";
  headers.set("content-type", type);
  headers.set("cache-control", cacheControl);
  applySecurityHeaders(headers);
  return new Response(source.body, { status, headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const dest = canonicalRedirect(url);
    if (dest) {
      const headers = new Headers();
      applySecurityHeaders(headers);
      headers.set("cache-control", "public, max-age=3600");
      headers.set("location", dest.toString());
      return new Response(null, { status: 301, headers });
    }

    const path = barePath(url.pathname);

    // 3.0.1: iOS universal links. Apple fetches this exact path (no redirect,
    // JSON). The asset has no extension, so set the type here.
    if (path === "/.well-known/apple-app-site-association" || path === "/apple-app-site-association") {
      const res = await readAsset(env, request, "/.well-known/apple-app-site-association");
      if (res.ok) {
        const headers = new Headers();
        headers.set("content-type", "application/json");
        headers.set("cache-control", "public, max-age=3600");
        applySecurityHeaders(headers);
        return new Response(res.body, { status: 200, headers });
      }
    }

    if (PERMANENT_REDIRECTS[path]) {
      const headers = new Headers();
      applySecurityHeaders(headers);
      headers.set("cache-control", "public, max-age=3600");
      headers.set("location", new URL(PERMANENT_REDIRECTS[path], url).toString());
      return new Response(null, { status: 301, headers });
    }

    // DimaAI (2.9.141) and the retired game tab + its marketing pages (2.13.0) go home.
    if (RETIRED_TO_HOME.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
      return withSecurity(Response.redirect(new URL("/", url), 301));
    }

    if (isSpaPath(path)) {
      // Root document is the shared shell. /index.html itself 308s to /.
      const shell = await readAsset(env, request, "/");
      const response = htmlResponse(shell, 200, "no-cache");
      // SEO (3.7.14): the app shell carries the homepage's canonical/meta, so
      // without this /app, /login, /register, /s/... looked like duplicate
      // homepages to crawlers that do not run JS. The app is never a search result.
      response.headers.set("x-robots-tag", "noindex, follow");
      return response;
    }

    // SEO (3.7.14): one URL per page. /tr/ and /tr, /features/ and /features
    // were indexed as two pages (Search Console) because Pages answered the
    // slash form itself. Canonicals use the bare form, so 301 to it.
    if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
      const headers = new Headers();
      applySecurityHeaders(headers);
      headers.set("cache-control", "public, max-age=3600");
      headers.set("location", new URL(path + url.search, url).toString());
      return new Response(null, { status: 301, headers });
    }

    const found = await env.ASSETS.fetch(request);
    if (found.status !== 404) return withSecurity(found);

    const notFound = await readAsset(env, request, "/404.html");
    const response = htmlResponse(notFound, 404, "no-store");
    response.headers.set("x-robots-tag", "noindex");
    return response;
  },
};
