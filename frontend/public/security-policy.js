/**
 * Security header values for the marketing site.
 * Kept out of _worker.js exports: Pages treats every named export on
 * _worker.js as a handler, and a string export fails the deploy.
 */

export const HSTS = "max-age=63072000; includeSubDomains; preload";
export const PERMISSIONS_POLICY = "camera=(self), microphone=(self), display-capture=(self), autoplay=(self)";
export const CSP_HEADER = "content-security-policy";
/**
 * sha256 of every inline <script> in index.html (the prerendered pages reuse the same
 * head). No 'unsafe-inline' for scripts: a new or edited inline script must be hashed.
 * Regenerate with `node scripts/csp-sync.mjs` (rewrites this list, _headers and vercel.json);
 * src/site/cspHashes.selftest.mjs fails CI when they drift and the build verifies dist/.
 */
export const INLINE_SCRIPT_HASHES = [
  // @csp-hashes-start
  "sha256-S6HfTfHplG8p60gFprOJ2yF+7QjQiqcjT622MJIGsUc=",
  "sha256-8DfRHI8tBT7aebwoSE1O7M5Eyi53vXPaVkKg6Ts+tXs=",
  "sha256-KaoFSX3TCKiHgad1CVsr8xoDclCAffaQrQtErU7iRqc=",
  "sha256-55Lg65UfHgpMWGmpdWaAw1ij+9uyiGVYnh+XvLULkP0=",
  "sha256-yBF1MUju54iRuL/fti/cWyhku2cnv6Ff2scoFZLOa3c=",
  "sha256-8O6fXtGVKTVzWNUD8da/uLiptJqxgFDfLe0FJkarXGw=",
  "sha256-eSNFUNqALkZczatvPjUNWi4Zl3/adLqQoBwvL1fvHqo=",
  "sha256-ixmRUirRZefddAgJKRa6M5hzfgLOuZdgZwNEZajUlNw=",
  "sha256-X6IZooTuD0j+iwfFoTuhClPTwrmMH0sIGqTJHDEEl8Q=",
  "sha256-/Klya6xNTxAqERBzgqp2O3T0Na/gBdvbu0OUya8IKUw=",
  "sha256-ZCBl+yGvdB6zsSMVoAoZBn41QaO8LSqBKEJlxUEoj8A=",
  "sha256-uTUWQ7h7HJ1YJi/9oCc8AwDTUAvj+dsZ7s0p5cNMUcs=",
  // @csp-hashes-end
];
export const SITE_CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  `script-src 'self' ${INLINE_SCRIPT_HASHES.map((h) => `'${h}'`).join(" ")} https://eu-assets.i.posthog.com https://www.googletagmanager.com https://www.google-analytics.com https://www.googleadservices.com https://accounts.google.com https://www.clarity.ms https://*.clarity.ms https://static.cloudflareinsights.com`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://descall.com https://www.descall.com https://des-call.onrender.com https://api.descall.com https://*.supabase.co https://*.supabase.in https://*.giphy.com https://*.tenor.com https://*.gstatic.com https://www.google-analytics.com https://www.googletagmanager.com https://*.githubusercontent.com https://*.googleusercontent.com https://*.clarity.ms",
  "media-src 'self' blob: data: https://descall.com https://des-call.onrender.com https://api.descall.com https://*.supabase.co https://*.giphy.com https://*.tenor.com",
  "connect-src 'self' https://descall.com https://www.descall.com https://des-call.onrender.com wss://des-call.onrender.com https://api.descall.com wss://rt.descall.com https://*.supabase.co wss://*.supabase.co https://*.supabase.in wss://*.supabase.in https://api.giphy.com https://*.giphy.com https://tenor.googleapis.com https://*.tenor.com https://eu.i.posthog.com https://eu-assets.i.posthog.com https://eu.posthog.com https://*.posthog.com https://*.sentry.io https://www.google-analytics.com https://www.googletagmanager.com https://www.google.com https://googleads.g.doubleclick.net https://www.googleadservices.com https://accounts.google.com https://api.github.com https://*.livekit.cloud wss://*.livekit.cloud https://*.clarity.ms https://cloudflareinsights.com",
  "frame-src 'self' https://www.googletagmanager.com https://accounts.google.com",
  "worker-src 'self' blob:",
].join("; ");

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
