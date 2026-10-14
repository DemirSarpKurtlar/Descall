/**
 * Cloudflare Pages advanced-mode worker.
 *
 * A `_redirects` rewrite to `/index.html` is not a rewrite here: Pages pretty-URLs
 * `/index.html` to `/`, so `/groups` was 308'd onto the marketing homepage.
 * Fetch the shell from the asset store instead, and serve 404.html for real misses.
 * Marketing pages stay normal files (prerendered index.html in their folders).
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

function barePath(pathname) {
  const path = String(pathname || "/").split("?")[0];
  if (path.length > 1 && path.endsWith("/")) return path.slice(0, -1);
  return path || "/";
}

function isSpaPath(pathname) {
  const path = barePath(pathname);
  return SPA_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
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
  headers.set("x-content-type-options", "nosniff");
  return new Response(source.body, { status, headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = barePath(url.pathname);

    if (path === "/dimaai" || path.startsWith("/dimaai/")) {
      return Response.redirect(new URL("/", url), 301);
    }

    if (isSpaPath(path)) {
      // Root document is the shared shell. /index.html itself 308s to /.
      const shell = await readAsset(env, request, "/");
      return htmlResponse(shell, 200, "no-cache");
    }

    const found = await env.ASSETS.fetch(request);
    if (found.status !== 404) return found;

    const notFound = await readAsset(env, request, "/404.html");
    const response = htmlResponse(notFound, 404, "no-store");
    response.headers.set("x-robots-tag", "noindex");
    return response;
  },
};
