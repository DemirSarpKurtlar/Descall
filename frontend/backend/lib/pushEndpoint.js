"use strict";

/**
 * Web push endpoints we will POST to (security scan 17 Nov 2026: any https:// URL used to
 * be accepted, so a user could make the backend send requests to internal hosts and ports
 * whenever they got a notification). Only the browser push services are allowed:
 * Chrome / Edge / Opera / Brave / Samsung (FCM), Firefox (Mozilla autopush), Safari (Apple)
 * and legacy Edge (WNS). Port 443 only, no credentials, bounded length.
 */

const EXACT_HOSTS = new Set([
  "fcm.googleapis.com",
  "android.googleapis.com",
  "updates.push.services.mozilla.com",
  "web.push.apple.com",
]);
const SUFFIX_HOSTS = [".push.services.mozilla.com", ".push.apple.com", ".notify.windows.com"];
const MAX_ENDPOINT_LENGTH = 2048;

function isAllowedPushEndpoint(raw) {
  if (typeof raw !== "string" || !raw || raw.length > MAX_ENDPOINT_LENGTH) return false;
  let url;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  if (url.username || url.password) return false;
  if (url.port && url.port !== "443") return false;
  const host = url.hostname.toLowerCase();
  if (EXACT_HOSTS.has(host)) return true;
  return SUFFIX_HOSTS.some((suffix) => host.endsWith(suffix) && host.length > suffix.length);
}

module.exports = { isAllowedPushEndpoint, MAX_ENDPOINT_LENGTH };
