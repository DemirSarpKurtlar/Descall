import { parseAppRoute } from "./appRoutes.js";

/**
 * 3.0.1: links that open the iOS app (`descall://…` custom scheme and
 * https://descall.com universal links) → the in-app route to open.
 * Pure, no DOM / Capacitor (tested by deepLinks.selftest.mjs). The native side
 * (DescallDeepLinkPlugin.swift) only forwards the URL; routing happens here.
 *
 *   descall://open, descall://, descall://home      → /direct (app home)
 *   descall://whats-new                              → /app/whats-new (3.0 notes)
 *   descall://dm/<username>                          → /direct/<username>
 *   descall://group/<id>                             → /groups/<id>
 *   descall://server/<id>[/<channelId>]              → /servers/<id>[/<channelId>]
 *   descall://friends | calls | activity             → /friends | /calls | /activity
 *   descall://settings[/<tab>]                       → /settings[/<tab>]
 *   https://descall.com/<same app path>              → that path
 * Anything else that is ours opens the home screen; foreign URLs return null.
 */

export const DEEP_LINK_SCHEME = "descall";
export const HOME_PATH = "/direct";
export const WHATS_NEW_PATH = "/app/whats-new";
export const UNIVERSAL_LINK_HOSTS = Object.freeze(["descall.com", "www.descall.com"]);

const SEGMENT_RE = /^[\p{L}\p{N}_.\-]{1,64}$/u;
const WHATS_NEW_ALIASES = new Set(["whats-new", "whatsnew", "yenilikler"]);
const HOME_ALIASES = new Set(["", "open", "home", "app"]);
const SIMPLE_VIEWS = new Set(["friends", "calls", "activity"]);

function cleanSegment(value) {
  let decoded;
  try {
    decoded = decodeURIComponent(String(value || ""));
  } catch {
    return null;
  }
  if (!SEGMENT_RE.test(decoded) || decoded === "." || decoded === "..") return null;
  return decoded;
}

/** Route for path segments (already split, not decoded). */
function routeForSegments(rawSegments) {
  const segments = rawSegments.filter((s) => s !== "");
  if (segments.length === 0) return HOME_PATH;
  const head = String(segments[0]).toLowerCase();
  const rest = segments.slice(1);

  if (head === "app" && rest.length) return routeForSegments(rest);
  if (HOME_ALIASES.has(head)) return HOME_PATH;
  if (WHATS_NEW_ALIASES.has(head)) return WHATS_NEW_PATH;

  if (head === "dm" || head === "direct") {
    const user = rest[0] != null ? cleanSegment(rest[0]) : null;
    return user ? `/direct/${encodeURIComponent(user)}` : HOME_PATH;
  }
  if (head === "group" || head === "groups") {
    const id = rest[0] != null ? cleanSegment(rest[0]) : null;
    return id ? `/groups/${encodeURIComponent(id)}` : "/groups";
  }
  if (head === "server" || head === "servers") {
    const id = rest[0] != null ? cleanSegment(rest[0]) : null;
    if (!id) return "/servers";
    const channel = rest[1] != null ? cleanSegment(rest[1]) : null;
    return channel
      ? `/servers/${encodeURIComponent(id)}/${encodeURIComponent(channel)}`
      : `/servers/${encodeURIComponent(id)}`;
  }
  if (SIMPLE_VIEWS.has(head)) return `/${head}`;
  if (head === "settings") {
    const tab = rest[0] != null ? cleanSegment(rest[0]) : null;
    return tab ? `/settings/${encodeURIComponent(tab.toLowerCase())}` : "/settings";
  }
  return HOME_PATH;
}

/**
 * Resolve a URL string to `{ path }`, or null when the URL is not a Descall link.
 * Query strings and fragments are ignored (nothing in them is trusted).
 */
export function resolveDeepLink(raw) {
  const text = String(raw || "").trim();
  if (!text || text.length > 2048) return null;
  const match = /^([a-z][a-z0-9+.-]*):(.*)$/i.exec(text);
  if (!match) return null;
  const scheme = match[1].toLowerCase();
  const rest = match[2].split(/[?#]/)[0];

  if (scheme === DEEP_LINK_SCHEME) {
    // descall://whats-new → host "whats-new"; descall:whats-new and
    // descall:///whats-new are accepted too.
    const segments = rest.replace(/^\/+/, "").split("/");
    return { path: routeForSegments(segments) };
  }

  if (scheme === "https") {
    const hostMatch = /^\/\/([^/:]+)(?::443)?(\/.*)?$/i.exec(rest);
    if (!hostMatch) return null;
    const host = hostMatch[1].toLowerCase();
    if (!UNIVERSAL_LINK_HOSTS.includes(host)) return null;
    const pathname = hostMatch[2] || "/";
    const segments = pathname.split("/");
    const head = String(segments[1] || "").toLowerCase();
    if (head === "app") return { path: routeForSegments(segments.slice(2)) };
    // Only real app routes; a marketing page link is not ours to route.
    if (!head) return { path: HOME_PATH };
    if (["direct", "groups", "servers", "friends", "calls", "activity", "settings"].includes(head)) {
      const route = parseAppRoute(pathname);
      if (route.unknown) return { path: HOME_PATH };
      return { path: routeForSegments(segments) };
    }
    return null;
  }

  return null;
}

/** True when an in-app path is the 3.0 "what's new" landing target. */
export function isWhatsNewPath(pathname) {
  const path = String(pathname || "").replace(/\/+$/, "").toLowerCase();
  return path === WHATS_NEW_PATH;
}
