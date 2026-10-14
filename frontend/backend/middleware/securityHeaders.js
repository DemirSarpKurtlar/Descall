"use strict";

/**
 * Response headers for the Render API.
 * The site CSP lives in frontend/public/_worker.js (Cloudflare) and vercel.json.
 * This policy is for JSON and the small HTML confirm/unsubscribe pages:
 * no scripts, inline styles only, nobody may frame the API.
 * Shop SVG assets replace Content-Security-Policy with their own sandbox policy
 * after this middleware runs. Do not re-apply CSP on the way out.
 */

const HSTS = "max-age=63072000; includeSubDomains; preload";
const PERMISSIONS_POLICY = "camera=(self), microphone=(self), display-capture=(self), autoplay=(self)";
const API_CSP = "default-src 'none'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'none'; script-src 'none'; style-src 'unsafe-inline'";

function securityHeadersMiddleware(_req, res, next) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Strict-Transport-Security", HSTS);
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Permissions-Policy", PERMISSIONS_POLICY);
  res.setHeader("Content-Security-Policy", API_CSP);
  next();
}

module.exports = {
  securityHeadersMiddleware,
  HSTS,
  PERMISSIONS_POLICY,
  API_CSP,
};
