/**
 * Uyarlanan kart (growth 1B) endpoints, backend routes/auth.js and routes/publicPages.js:
 *   POST /auth/identify               { email, surface, visitorKey } -> { status, emailHint?, registrationClosed? }
 *   GET  /auth/password/range/:prefix  breach list range (text "SUFFIX:COUNT" lines)
 *   POST /auth/username/ideas          { candidates } -> { free }
 *   GET  /api/public-pages/live        live snippets around the card
 */
import { httpRequest } from "./http";
import { apiBase } from "../lib/nodeRouting";
import { getVisitorKey } from "../lib/attribution";
import { runWithHumanCheck } from "../lib/humanCheck/turnstileClient.js";

function visitorKey() {
  try {
    return getVisitorKey() || "";
  } catch {
    return "";
  }
}

/** Which card an email gets. The human check runs only when the server asks (step-up). */
export function identifyEmail(email, { surface } = {}) {
  return runWithHumanCheck(
    "register",
    (hc) =>
      httpRequest("/auth/identify", {
        method: "POST",
        body: JSON.stringify({ email, surface, visitorKey: visitorKey(), ...hc }),
      }),
    { always: false },
  );
}

/**
 * Breach list range for a 5-hex-character SHA-1 prefix. Resolves to the range text; rejects
 * when the list cannot be reached (offline, 503) so the caller can say "could not check".
 */
export async function fetchBreachRange(prefix, { signal } = {}) {
  const res = await fetch(`${apiBase()}/auth/password/range/${encodeURIComponent(prefix)}`, { method: "GET", signal });
  if (!res.ok) {
    const err = new Error(`range ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.text();
}

/** The free ones among the card's username ideas, in the given order. */
export async function freeUsernameIdeas(candidates, { signal } = {}) {
  const body = await httpRequest("/auth/username/ideas", { method: "POST", body: JSON.stringify({ candidates }), signal });
  return Array.isArray(body?.free) ? body.free : [];
}

/** { servers, platform: { online, joinedToday, countries }, builtAt } */
export async function fetchLiveSnippets({ signal } = {}) {
  const res = await fetch(`${apiBase()}/api/public-pages/live`, { method: "GET", signal });
  if (!res.ok) {
    const err = new Error(`live ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}
