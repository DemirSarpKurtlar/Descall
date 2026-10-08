"use strict";

/**
 * Privacy scrubbing for Sentry events (backend). Pure functions so they can be unit-tested.
 * Removes cookies, auth headers, request bodies, user IP/email and token-like values in URLs.
 */

const SENSITIVE_HEADERS = new Set([
  "authorization",
  "proxy-authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "x-auth-token",
  "x-access-token",
  "x-refresh-token",
  // client IP carriers
  "x-forwarded-for",
  "x-real-ip",
  "forwarded",
  "cf-connecting-ip",
  "true-client-ip",
  "x-client-ip",
]);

const SENSITIVE_PARAM_RE =
  /^(token|access_token|refresh_token|id_token|auth|authorization|jwt|code|key|api_key|apikey|password|pass|secret|signature|sig|credential|session|sid)$/i;

const JWT_RE = /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\b/g;
const BEARER_RE = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
const QUERY_PARAM_RE = /([?&#;])([^=&#\s]+)=([^&#\s]*)/g;
// Same, URL-encoded inside another URL (e.g. ...&dl=https%3A%2F%2Fx%2F%3Ftoken%3Dabc).
const ENCODED_PARAM_RE = /(%3F|%26|%23)([A-Za-z0-9_.-]+)%3D((?:(?!%26|%23)[^\s&#])*)/gi;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

function scrubString(value) {
  if (typeof value !== "string" || !value) return value;
  return value
    .replace(JWT_RE, "[Filtered]")
    .replace(BEARER_RE, "Bearer [Filtered]")
    .replace(QUERY_PARAM_RE, (m, sep, key, val) =>
      SENSITIVE_PARAM_RE.test(key) && val ? `${sep}${key}=[Filtered]` : m
    )
    .replace(ENCODED_PARAM_RE, (m, sep, key, val) =>
      SENSITIVE_PARAM_RE.test(key) && val ? `${sep}${key}%3D[Filtered]` : m
    )
    .replace(EMAIL_RE, "[email]");
}

function scrubQueryString(qs) {
  if (!qs) return qs;
  if (typeof qs === "string") {
    const lead = qs.startsWith("?") ? "" : "?";
    const out = scrubString(`${lead}${qs}`);
    return lead ? out.slice(1) : out;
  }
  if (Array.isArray(qs)) {
    return qs.map((pair) =>
      Array.isArray(pair) && SENSITIVE_PARAM_RE.test(String(pair[0])) ? [pair[0], "[Filtered]"] : pair
    );
  }
  if (typeof qs === "object") {
    const out = {};
    for (const [k, v] of Object.entries(qs)) out[k] = SENSITIVE_PARAM_RE.test(k) ? "[Filtered]" : v;
    return out;
  }
  return qs;
}

function scrubHeaders(headers) {
  if (!headers || typeof headers !== "object") return headers;
  const out = {};
  for (const [k, v] of Object.entries(headers)) {
    if (SENSITIVE_HEADERS.has(String(k).toLowerCase())) continue;
    out[k] = typeof v === "string" ? scrubString(v) : v;
  }
  return out;
}

function scrubBreadcrumb(crumb) {
  if (!crumb || typeof crumb !== "object") return crumb;
  if (crumb.message) crumb.message = scrubString(crumb.message);
  if (crumb.data && typeof crumb.data === "object") {
    for (const key of ["url", "to", "from", "http.query", "http.fragment"]) {
      if (typeof crumb.data[key] === "string") crumb.data[key] = scrubString(crumb.data[key]);
    }
    delete crumb.data.body;
    delete crumb.data.request_body;
    delete crumb.data.response_body;
  }
  return crumb;
}

/** beforeSend: mutates and returns the event (never drops it). */
function scrubEvent(event) {
  if (!event || typeof event !== "object") return event;

  if (event.request) {
    const req = event.request;
    delete req.cookies;
    delete req.data;
    if (req.headers) req.headers = scrubHeaders(req.headers);
    if (req.url) req.url = scrubString(req.url);
    if (req.query_string) req.query_string = scrubQueryString(req.query_string);
    delete req.env;
  }

  if (event.user) {
    delete event.user.ip_address;
    delete event.user.email;
    if (!Object.keys(event.user).length) delete event.user;
  }

  if (event.message) event.message = scrubString(event.message);
  if (typeof event.transaction === "string") event.transaction = scrubString(event.transaction);
  const values = event.exception && event.exception.values;
  if (Array.isArray(values)) {
    for (const ex of values) {
      if (ex && typeof ex.value === "string") ex.value = scrubString(ex.value);
      const frames = ex && ex.stacktrace && ex.stacktrace.frames;
      if (Array.isArray(frames)) {
        for (const fr of frames) {
          if (fr && typeof fr.filename === "string") fr.filename = scrubString(fr.filename);
          if (fr && typeof fr.abs_path === "string") fr.abs_path = scrubString(fr.abs_path);
        }
      }
    }
  }

  if (Array.isArray(event.breadcrumbs)) event.breadcrumbs = event.breadcrumbs.map(scrubBreadcrumb);
  else if (event.breadcrumbs && Array.isArray(event.breadcrumbs.values)) {
    event.breadcrumbs.values = event.breadcrumbs.values.map(scrubBreadcrumb);
  }

  return event;
}

module.exports = { scrubEvent, scrubBreadcrumb, scrubString, scrubHeaders, scrubQueryString };
