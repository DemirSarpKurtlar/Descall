"use strict";

/**
 * One URL per page in letter case (SEO round 2, Nov 2026), same rule as the Pages worker
 * (public/_worker.js): /Features or /TR/Blog answer 301 to the lower-case page when that
 * page is in the build (dist/<path>.html). Only page paths (no file extension) that do not
 * exist as typed; API paths, files and case-sensitive invite codes (/s/AbC) are never
 * folded. The query string is kept.
 */

const fs = require("fs");
const path = require("path");

const API_PREFIXES = [
  "/api", "/auth", "/admin", "/media", "/groups", "/friends", "/servers", "/reactions",
  "/health", "/debug", "/calls", "/socket.io",
];

function isApiPath(p) {
  return API_PREFIXES.some((prefix) => p === prefix || p.toLowerCase().startsWith(`${prefix}/`) || p.toLowerCase() === prefix);
}

/** The prerendered page of `p` in `distPath`, or null (never outside distPath). */
function pageFile(distPath, p) {
  const root = path.resolve(distPath);
  const file = p === "/" ? path.join(root, "index.html") : path.resolve(root, `.${p}.html`);
  if (!file.startsWith(root + path.sep)) return null;
  return fs.existsSync(file) ? file : null;
}

/** Lower-case target of a request path, or null when it must not be folded. */
function letterCaseTarget(distPath, rawPath) {
  const p = String(rawPath || "/").replace(/\/+$/, "") || "/";
  if (!/[A-Z]/.test(p) || /\.[a-z0-9]+$/i.test(p) || isApiPath(p)) return null;
  if (pageFile(distPath, p)) return null;
  const lower = p.toLowerCase();
  return pageFile(distPath, lower) ? lower : null;
}

function letterCaseRedirect(distPath) {
  return function letterCaseRedirectMiddleware(req, res, next) {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    const target = letterCaseTarget(distPath, req.path);
    if (!target) return next();
    const q = req.originalUrl.indexOf("?");
    res.setHeader("Cache-Control", "public, max-age=3600");
    return res.redirect(301, target + (q >= 0 ? req.originalUrl.slice(q) : ""));
  };
}

module.exports = { letterCaseRedirect, letterCaseTarget };
