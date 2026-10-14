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

async function asset(env, url, request) {
  return env.ASSETS.fetch(new Request(url.toString(), request));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = barePath(url.pathname);

    if (path === "/dimaai" || path.startsWith("/dimaai/")) {
      return Response.redirect(new URL("/", url), 301);
    }

    if (isSpaPath(path)) {
      const indexUrl = new URL(request.url);
      indexUrl.pathname = "/index.html";
      indexUrl.search = "";
      const shell = await asset(env, indexUrl, request);
      const headers = new Headers(shell.headers);
      headers.set("content-type", "text/html; charset=utf-8");
      headers.set("cache-control", "no-cache");
      return new Response(shell.body, { status: 200, headers });
    }

    const found = await env.ASSETS.fetch(request);
    if (found.status !== 404) return found;

    const notFoundUrl = new URL(request.url);
    notFoundUrl.pathname = "/404.html";
    notFoundUrl.search = "";
    const notFound = await asset(env, notFoundUrl, request);
    const headers = new Headers(notFound.headers);
    headers.set("content-type", "text/html; charset=utf-8");
    headers.set("cache-control", "no-store");
    headers.set("x-robots-tag", "noindex");
    return new Response(notFound.body, { status: 404, headers });
  },
};
