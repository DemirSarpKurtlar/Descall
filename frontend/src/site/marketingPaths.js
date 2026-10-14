/**
 * Public marketing paths that can boot without the authenticated App bundle.
 */
const MARKETING_EXACT = new Set([
  "/",
  "/features",
  "/faq",
  "/download",
  "/about",
  "/privacy",
  "/terms",
  "/copyright",
  "/security",
  "/status",
  "/contact",
  "/iletisim",
  "/gizlilik",
  "/kosullar",
  "/blog",
  "/discord-alternative",
  "/alternatives",
  "/compare/discord",
  "/apps-like-discord",
  "/discord-replacement",
  "/discord-alternative-turkey",
  "/best-discord-alternative-for-gamers",
  "/discord-alternative-for-communities",
  "/discord-alternative-for-lfg",
  "/discord-alternative-for-voice-chat",
  "/discord-alternative-for-friends",
  "/login",
  "/register",
  "/tr",
  "/tr/features",
  "/tr/download",
  "/tr/faq",
  "/tr/discord-alternative",
  "/tr/compare/discord",
  "/tr/about",
  "/tr/contact",
  "/tr/security",
]);

/** Signed-in app, invites, and vanity links must not boot the marketing 404. */
const APP_BOOT_PREFIXES = [
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
];

function isAppBootPath(path) {
  if (APP_BOOT_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) return true;
  if (path === "/i" || path.startsWith("/i/")) return true;
  if (path === "/s" || path.startsWith("/s/")) return true;
  return false;
}

export function isPublicMarketingPath(pathname = "/") {
  const path = String(pathname || "/").split("?")[0].replace(/\/+$/, "") || "/";
  if (MARKETING_EXACT.has(path)) return true;
  if (path.startsWith("/blog/")) return true;
  if (path.startsWith("/compare/")) return true;
  if (path.startsWith("/tr/")) return true;
  if (isAppBootPath(path)) return false;
  // Static files (sitemap, sw, icons) stay off the marketing shell.
  if (path.includes(".")) return false;
  // Unknown web URLs are the marketing 404, not the home prerender or the app shell.
  return true;
}
