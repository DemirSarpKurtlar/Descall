"use strict";

// Client routes that are also Express API mounts (see src/lib/appRoutes.js).
// A document navigation to these paths must get the SPA shell; REST calls
// (GET /groups/my, GET /api/servers/my) must still hit the API.
const AMBIGUOUS_APP_ROUTE_PREFIXES = ["/groups", "/friends", "/calls", "/servers"];

function headerValue(req, name) {
  if (typeof req.get === "function") {
    const viaGetter = req.get(name);
    if (viaGetter != null) return String(viaGetter);
  }
  const headers = req.headers || {};
  const raw = headers[String(name).toLowerCase()] ?? headers[name];
  if (Array.isArray(raw)) return raw.join(",");
  return raw == null ? "" : String(raw);
}

function pathnameOf(req) {
  if (req.path) return req.path;
  const url = String(req.url || "");
  const q = url.indexOf("?");
  return q >= 0 ? url.slice(0, q) : url;
}

function publicPathname(req) {
  const forwarded = headerValue(req, "x-forwarded-uri");
  if (forwarded.startsWith("/")) return forwarded.split("?")[0];
  return pathnameOf(req);
}

function isExplicitApiPath(req) {
  const candidates = [pathnameOf(req), publicPathname(req)];
  return candidates.some((p) => p === "/api" || p.startsWith("/api/"));
}

function isBrowserPageNavigation(req) {
  if (headerValue(req, "sec-fetch-mode") === "navigate") return true;
  return headerValue(req, "accept").includes("text/html");
}

function matchesAmbiguousAppRoute(pathname) {
  return AMBIGUOUS_APP_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

function shouldServeSpaShell(req) {
  const method = String(req.method || "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD") return false;
  if (isExplicitApiPath(req)) return false;
  return matchesAmbiguousAppRoute(pathnameOf(req)) && isBrowserPageNavigation(req);
}

module.exports = {
  AMBIGUOUS_APP_ROUTE_PREFIXES,
  isBrowserPageNavigation,
  isExplicitApiPath,
  shouldServeSpaShell,
};
