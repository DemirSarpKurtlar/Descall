/**
 * Cloudflare Pages advanced-mode worker.
 *
 * A `_redirects` rewrite to `/index.html` is not a rewrite here: Pages pretty-URLs
 * `/index.html` to `/`, so `/groups` was 308'd onto the marketing homepage.
 * Fetch the shell from the asset store instead, and serve 404.html for real misses.
 * Marketing pages stay normal files (prerendered index.html in their folders).
 *
 * This worker owns every response, so security headers are set here. `_headers`
 * is the backup when a request is not handled by the worker.
 */

const SPA_PREFIXES = [
  "/direct",
  "/groups",
  "/servers",
  "/friends",
  "/calls",
  "/activity",
  "/play",
  "/settings",
  "/admin",
  "/invite",
  "/app",
  "/login",
  "/register",
  "/i",
  "/s",
];

export const HSTS = "max-age=63072000; includeSubDomains; preload";
export const PERMISSIONS_POLICY = "camera=(self), microphone=(self), display-capture=(self), autoplay=(self)";
// Enforcing. A headless pass of /, /features, /faq, /download, /login,
// /contact, and /security against the production build reported no violations.
// frame-ancestors 'none' matches X-Frame-Options: DENY.
export const CSP_HEADER = "content-security-policy";
export const SITE_CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://www.google-analytics.com https://www.googleadservices.com https://accounts.google.com https://www.clarity.ms https://*.clarity.ms",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://descall.com https://www.descall.com https://des-call.onrender.com https://*.supabase.co https://*.supabase.in https://*.giphy.com https://*.tenor.com https://*.gstatic.com https://www.google-analytics.com https://www.googletagmanager.com https://*.githubusercontent.com https://*.clarity.ms",
  "media-src 'self' blob: data: https://descall.com https://des-call.onrender.com https://*.supabase.co https://*.giphy.com https://*.tenor.com",
  "connect-src 'self' https://descall.com https://www.descall.com https://des-call.onrender.com wss://des-call.onrender.com https://*.supabase.co wss://*.supabase.co https://*.supabase.in wss://*.supabase.in https://api.giphy.com https://*.giphy.com https://tenor.googleapis.com https://*.tenor.com https://eu.i.posthog.com https://eu-assets.i.posthog.com https://eu.posthog.com https://*.posthog.com https://*.sentry.io https://www.google-analytics.com https://www.googletagmanager.com https://www.google.com https://googleads.g.doubleclick.net https://www.googleadservices.com https://accounts.google.com https://api.github.com https://*.livekit.cloud wss://*.livekit.cloud https://*.clarity.ms",
  "frame-src 'self' https://www.googletagmanager.com https://accounts.google.com",
  "worker-src 'self' blob:",
].join("; ");

function barePath(pathname) {
  const path = String(pathname || "/").split("?")[0];
  if (path.length > 1 && path.endsWith("/")) return path.slice(0, -1);
  return path || "/";
}

function isSpaPath(pathname) {
  const path = barePath(pathname);
  return SPA_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

/** https://descall.com is the only public site host. www and http bounce there. */
export function canonicalRedirect(url) {
  const host = String(url.hostname || "").toLowerCase();
  if (host !== "descall.com" && host !== "www.descall.com") return null;
  if (host === "descall.com" && url.protocol === "https:") return null;
  const dest = new URL(url.href);
  dest.protocol = "https:";
  dest.hostname = "descall.com";
  return dest;
}

export function applySecurityHeaders(headers) {
  headers.set("x-content-type-options", "nosniff");
  headers.set("referrer-policy", "strict-origin-when-cross-origin");
  headers.set("strict-transport-security", HSTS);
  headers.set("x-frame-options", "DENY");
  headers.set("permissions-policy", PERMISSIONS_POLICY);
  headers.set(CSP_HEADER, SITE_CSP);
  return headers;
}

function withSecurity(response) {
  const headers = new Headers(response.headers);
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

    if (path === "/dimaai" || path.startsWith("/dimaai/")) {
      return withSecurity(Response.redirect(new URL("/", url), 301));
    }

    if (isSpaPath(path)) {
      // Root document is the shared shell. /index.html itself 308s to /.
      const shell = await readAsset(env, request, "/");
      return htmlResponse(shell, 200, "no-cache");
    }

    const found = await env.ASSETS.fetch(request);
    if (found.status !== 404) return withSecurity(found);

    const notFound = await readAsset(env, request, "/404.html");
    const response = htmlResponse(notFound, 404, "no-store");
    response.headers.set("x-robots-tag", "noindex");
    return response;
  },
};
