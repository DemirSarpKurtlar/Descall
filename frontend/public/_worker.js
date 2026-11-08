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
import {
  BOT_TIMEOUT_MS,
  VISITOR_TIMEOUT_MS,
  bannerArgumentFor,
  fetchInvitePreview,
  inviteHeadHtml,
  inviteTarget,
  inviteUrl,
  isPreviewBot,
  previewLang,
  rewriteShell,
} from "./invite-preview.js";

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
  "/tr/turk-discord": "/tr/turk-sohbet-uygulamasi",
  "/founder": "/who-owns-descall",
  "/owner": "/who-owns-descall",
  "/kurucu": "/descall-sahibi",
  "/sahip": "/descall-sahibi",
  "/tr/who-owns-descall": "/descall-sahibi",
  // Merged pages (SEO audit, Nov 2026), source: src/site/seo/mergedPages.js.
  "/blog/discord-vs-descall": "/compare/discord",
  "/blog/apps-like-discord": "/apps-like-discord",
  "/blog/voice-chat-alternative-to-discord": "/discord-alternative-for-voice-chat",
  "/blog/discord-alternative-for-communities-guide": "/discord-alternative-for-communities",
  "/blog/migrate-from-discord-to-descall": "/discord-replacement",
  "/tr/blog/discord-vs-descall": "/tr/compare/discord",
  "/tr/blog/apps-like-discord": "/tr/discord-yerine-ne-kullanilir",
  "/tr/blog/voice-chat-alternative-to-discord": "/tr/sesli-sohbet-uygulamasi",
  "/tr/blog/discord-alternative-for-communities-guide": "/tr/discord-alternatifi",
  "/tr/blog/migrate-from-discord-to-descall": "/tr/discord-alternatifi",
  "/de/blog/discord-vs-descall": "/de/compare/discord",
  "/de/blog/apps-like-discord": "/de/apps-like-discord",
  "/de/blog/voice-chat-alternative-to-discord": "/de/discord-alternative-for-voice-chat",
  "/de/blog/discord-alternative-for-communities-guide": "/de/discord-alternative-for-communities",
  "/de/blog/migrate-from-discord-to-descall": "/de/discord-replacement",
  "/es/blog/discord-vs-descall": "/es/compare/discord",
  "/es/blog/apps-like-discord": "/es/apps-like-discord",
  "/es/blog/voice-chat-alternative-to-discord": "/es/discord-alternative-for-voice-chat",
  "/es/blog/discord-alternative-for-communities-guide": "/es/discord-alternative-for-communities",
  "/es/blog/migrate-from-discord-to-descall": "/es/discord-replacement",
  "/fr/blog/discord-vs-descall": "/fr/compare/discord",
  "/fr/blog/apps-like-discord": "/fr/apps-like-discord",
  "/fr/blog/voice-chat-alternative-to-discord": "/fr/discord-alternative-for-voice-chat",
  "/fr/blog/discord-alternative-for-communities-guide": "/fr/discord-alternative-for-communities",
  "/fr/blog/migrate-from-discord-to-descall": "/fr/discord-replacement",
  "/pt-br/blog/discord-vs-descall": "/pt-br/compare/discord",
  "/pt-br/blog/apps-like-discord": "/pt-br/apps-like-discord",
  "/pt-br/blog/voice-chat-alternative-to-discord": "/pt-br/discord-alternative-for-voice-chat",
  "/pt-br/blog/discord-alternative-for-communities-guide": "/pt-br/discord-alternative-for-communities",
  "/pt-br/blog/migrate-from-discord-to-descall": "/pt-br/discord-replacement",
  "/ru/blog/discord-vs-descall": "/ru/compare/discord",
  "/ru/blog/apps-like-discord": "/ru/apps-like-discord",
  "/ru/blog/voice-chat-alternative-to-discord": "/ru/discord-alternative-for-voice-chat",
  "/ru/blog/discord-alternative-for-communities-guide": "/ru/discord-alternative-for-communities",
  "/ru/blog/migrate-from-discord-to-descall": "/ru/discord-replacement",
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

/** Vite content-hashes every file under /assets, so a URL never changes content. */
const IMMUTABLE_CACHE = "public, max-age=31536000, immutable";

function isHashedAsset(pathname) {
  return pathname.startsWith("/assets/");
}

function withSecurity(response, { immutable = false } = {}) {
  const headers = new Headers(response.headers);
  // Pages answered /assets/* with max-age=14400, must-revalidate (SEO audit, Nov 2026).
  if (immutable && response.status === 200) headers.set("cache-control", IMMUTABLE_CACHE);
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

/**
 * Invite links (WhatsApp, Instagram, Telegram, X, iMessage previews): the shell gets the
 * invite's own title, description, Open Graph / Twitter card and Smart App Banner.
 * Other app paths lose the Smart App Banner (marketing pages only). Any failure: the plain shell.
 */
async function appShellResponse(response, request, env, ctx, path) {
  const target = inviteTarget(path);
  if (!target) return rewriteShell(response);
  const url = inviteUrl(path);
  let cache = null;
  try {
    cache = typeof caches !== "undefined" && caches.default ? caches.default : null;
  } catch {
    cache = null;
  }
  const ua = request.headers.get("user-agent") || "";
  const preview = await fetchInvitePreview(target, {
    apiOrigin: env?.API_ORIGIN || undefined,
    cache,
    timeoutMs: isPreviewBot(ua) ? BOT_TIMEOUT_MS : VISITOR_TIMEOUT_MS,
    clientIp: request.headers.get("cf-connecting-ip") || "",
    waitUntil: ctx && typeof ctx.waitUntil === "function" ? (p) => ctx.waitUntil(p) : null,
  });
  const appArgument = bannerArgumentFor(target, url);
  if (!preview) return rewriteShell(response, { banner: appArgument || true });
  const lang = previewLang(request.headers.get("accept-language"));
  response.headers.append("vary", "accept-language");
  return rewriteShell(response, { headHtml: inviteHeadHtml(preview, { lang, url, appArgument }) });
}

export default {
  async fetch(request, env, ctx) {
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
      return appShellResponse(response, request, env, ctx, path);
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
    if (found.status !== 404) return withSecurity(found, { immutable: isHashedAsset(url.pathname) });

    // SEO round 2 (Nov 2026): one URL per page in letter case too. /Features or /TR/Blog
    // 301 to the lower-case page when that page exists. Only for page paths (no file
    // extension) that 404 as typed, so hashed assets and case-sensitive invite codes
    // (/s/AbC, served by the app shell above) are never touched.
    if (/[A-Z]/.test(path) && !/\.[a-z0-9]+$/i.test(path)) {
      const lower = path.toLowerCase();
      const probe = await env.ASSETS.fetch(new Request(new URL(lower, url).toString(), { method: "GET", redirect: "manual" }));
      if (probe.status === 200) {
        const headers = new Headers();
        applySecurityHeaders(headers);
        headers.set("cache-control", "public, max-age=3600");
        headers.set("location", new URL(lower + url.search, url).toString());
        return new Response(null, { status: 301, headers });
      }
    }

    const notFound = await readAsset(env, request, "/404.html");
    const response = htmlResponse(notFound, 404, "no-store");
    response.headers.set("x-robots-tag", "noindex");
    return response;
  },
};
