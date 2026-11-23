'use strict';

/**
 * Cloudflare Turnstile inside the Electron app (src/lib/humanCheck/turnstileClient.js).
 *
 * main.cjs replaces the Content-Security-Policy of every response in the window's session
 * with the app's own policy. That is right for descall:// documents, but the human check
 * runs in frames from other origins: the API's bridge page (/api/turnstile/frame, which
 * sends its own nonce-based CSP) and Cloudflare's challenge frames. With the app policy
 * forced on them their scripts would not run and every sign-up from the desktop app would
 * fall back to the no-token rule. Those frames keep the headers their server sent.
 * Nothing else changes: only sub-frame documents, only these exact https origins.
 */

const BRIDGE_HOSTS = new Set(['des-call.onrender.com', 'api.descall.com', 'des-call-staging.onrender.com', 'api-staging.descall.com']);
const CHALLENGE_HOST = 'challenges.cloudflare.com';

/** True when this response is a Turnstile frame that must keep its own CSP. */
function keepsOwnCsp(details) {
  if (!details || details.resourceType !== 'subFrame') return false;
  let url;
  try {
    url = new URL(String(details.url || ''));
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  if (url.hostname === CHALLENGE_HOST) return true;
  return BRIDGE_HOSTS.has(url.hostname) && url.pathname === '/api/turnstile/frame';
}

module.exports = { keepsOwnCsp, BRIDGE_HOSTS, CHALLENGE_HOST };
