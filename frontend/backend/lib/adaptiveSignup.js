"use strict";

/**
 * Uyarlanan kart (growth draft 1B): the email-first sign-in / sign-up card.
 *
 * Pure helpers (no database, no network) behind the routes in routes/auth.js:
 *   POST /auth/identify                 email or username -> "new" | "registered" (the card
 *                                        turns into the sign-up or the sign-in card; an unknown
 *                                        username stays on the first step: sign-up needs an email)
 *   GET  /auth/password/range/:prefix    breach list range (k-anonymity proxy: only the first
 *                                        5 hex characters of the SHA-1 reach the server)
 *   POST /auth/username/ideas            which of the card's username ideas are free
 *   POST /auth/login                     also accepts the email as the identifier
 *   POST /auth/register                  { passwordless: true } creates the account without a
 *                                        password; the card adds a passkey right after
 * and GET /api/public-pages/live (the live server snippets around the card).
 *
 * Enumeration: /identify answers whether an email has an account. POST /auth/register already
 * answered that (409 email_taken) behind the same human check, so the card adds no new kind of
 * disclosure; it is rate limited per address and asks for the human check after a few lookups,
 * like the sign-in step-up. The sign-in methods of the account are never disclosed. A username
 * lookup answers no more than GET /auth/username/check and the public profiles already do
 * (whether the name is taken), under the same limit and human check, and never carries the
 * account's email hint.
 *
 * Tests: adaptiveSignup.selftest.cjs, test/adaptiveSignup.integration.test.cjs.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PREFIX_RE = /^[0-9A-F]{5}$/;
const RANGE_TTL_MS = 10 * 60 * 1000;
const RANGE_CACHE_MAX = 4000;
const RANGE_TIMEOUT_MS = 2500;
const IDEAS_MAX = 8;
/** Lookups per address before the human check is asked (15 minutes). */
const IDENTIFY_STEPUP = 6;
/** Hard ceiling per address (15 minutes); the register limiter is 20. */
const IDENTIFY_MAX = 40;
const IDENTIFY_WINDOW_MS = 15 * 60 * 1000;
/** Sign-up surfaces the card reports (analytics props.source). */
const SURFACES = ["app", "desktop", "ios", "android", "site", "modal"];
/** How a breached password was replaced (analytics props.method, breach_fixed). */
const FIX_METHODS = ["suggested", "own", "passkey"];
/** Card events the analytics collector accepts (lib/userAnalytics.js ALLOWED_EVENTS). */
const CARD_EVENTS = ["identifier_routed", "breach_warned_inline", "breach_fixed", "card_signup_started"];

function normalizeEmail(raw) {
  const v = String(raw ?? "").trim().toLowerCase();
  if (!v || v.length > 254 || !EMAIL_RE.test(v)) return null;
  return v;
}

function looksLikeEmail(raw) {
  return String(raw ?? "").includes("@");
}

/**
 * The username a person typed in the card's first field ("Demirkaya", "@demirkaya"), or
 * null. Only the shape is checked (no spaces, no "@" inside, 2..32 characters): reserved
 * names and names from before today's rules still sign in, and the lookup is exact.
 */
function cleanLoginName(raw) {
  const v = String(raw ?? "").trim().replace(/^@/, "");
  if (v.length < 2 || v.length > 32 || /[\s@]/.test(v)) return null;
  return v;
}

/** "ece.yilmaz@outlook.com" -> "e***@outlook.com" (shown on the reset panel). */
function maskEmail(email) {
  const v = normalizeEmail(email);
  if (!v) return "";
  const [local, domain] = v.split("@");
  return `${local.slice(0, 1)}***@${domain}`;
}

/** Upper-case 5 hex characters, or null. */
function cleanPrefix(raw) {
  const v = String(raw ?? "").trim().toUpperCase();
  return PREFIX_RE.test(v) ? v : null;
}

/**
 * HIBP range body -> lines "SUFFIX:COUNT" without the padding rows (count 0), so the
 * client gets the same answer with less to download.
 */
function compactRange(text) {
  const out = [];
  for (const line of String(text || "").split(/\r?\n/)) {
    const [suffix, count] = line.split(":");
    const s = String(suffix || "").trim().toUpperCase();
    const n = Number(String(count || "").trim());
    if (!/^[0-9A-F]{35}$/.test(s) || !Number.isFinite(n) || n <= 0) continue;
    out.push(`${s}:${Math.floor(n)}`);
  }
  return out.join("\n");
}

/** Count for one full SHA-1 hash in a (compact or raw) range body, 0 when absent. */
function countInRange(text, sha1Hex) {
  const hash = String(sha1Hex || "").toUpperCase();
  if (hash.length !== 40) return 0;
  const suffix = hash.slice(5);
  for (const line of String(text || "").split(/\r?\n/)) {
    const [s, c] = line.split(":");
    if (String(s || "").trim().toUpperCase() === suffix) return Math.max(0, Math.floor(Number(c) || 0));
  }
  return 0;
}

/**
 * Small TTL cache of breach list ranges (one entry per prefix). A miss fetches the range
 * with padding; an outage answers { ok: false } so the card says "could not check" and
 * the server check on submit still runs (it fails open, lib/passwordPolicy.js).
 */
function createRangeCache({ fetchImpl = (...a) => fetch(...a), now = () => Date.now(), ttlMs = RANGE_TTL_MS, max = RANGE_CACHE_MAX } = {}) {
  const cache = new Map();
  const inflight = new Map();
  async function load(prefix) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), RANGE_TIMEOUT_MS);
    try {
      const res = await fetchImpl(`https://api.pwnedpasswords.com/range/${prefix}`, {
        signal: ctrl.signal,
        headers: { "Add-Padding": "true", "User-Agent": "Descall-signup" },
      });
      if (!res || !res.ok) return { ok: false };
      return { ok: true, body: compactRange(await res.text()) };
    } catch {
      return { ok: false };
    } finally {
      clearTimeout(timer);
    }
  }
  async function get(rawPrefix) {
    const prefix = cleanPrefix(rawPrefix);
    if (!prefix) return { ok: false, invalid: true };
    const hit = cache.get(prefix);
    if (hit && now() - hit.at < ttlMs) return { ok: true, body: hit.body, cached: true };
    if (inflight.has(prefix)) return inflight.get(prefix);
    const p = load(prefix).then((r) => {
      inflight.delete(prefix);
      if (r.ok) {
        cache.set(prefix, { at: now(), body: r.body });
        if (cache.size > max) cache.delete(cache.keys().next().value);
      }
      return r;
    });
    inflight.set(prefix, p);
    return p;
  }
  return { get, size: () => cache.size, clear: () => cache.clear() };
}

/**
 * Which account a sign-in by email means. Rows: users with that email (case-insensitive).
 * A confirmed address wins; otherwise the newest unconfirmed one that is still fresh
 * (a person who just signed up and has not opened the code yet). Stale unconfirmed rows
 * never match: their address is released for the next sign-up.
 */
function pickEmailHolder(rows, { now = Date.now(), staleMs = 24 * 60 * 60 * 1000 } = {}) {
  const list = Array.isArray(rows) ? rows.filter(Boolean) : [];
  const confirmed = list.filter((r) => r.email_confirmed_at);
  if (confirmed.length) {
    return confirmed.sort((a, b) => Date.parse(a.email_confirmed_at || 0) - Date.parse(b.email_confirmed_at || 0))[0];
  }
  const fresh = list.filter((r) => {
    const at = Date.parse(r.confirmation_sent_at || r.created_at || "");
    return Number.isFinite(at) && now - at < staleMs;
  });
  if (!fresh.length) return null;
  return fresh.sort((a, b) => Date.parse(b.created_at || 0) - Date.parse(a.created_at || 0))[0];
}

/** The card's username ideas, deduplicated and cut to IDEAS_MAX; invalid ones are dropped by the caller. */
function cleanIdeas(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const out = [];
  for (const v of list) {
    const s = String(v ?? "").trim().replace(/^@+/, "");
    if (!s || s.length > 24) continue;
    if (out.some((x) => x.toLowerCase() === s.toLowerCase())) continue;
    out.push(s);
    if (out.length >= IDEAS_MAX) break;
  }
  return out;
}

function cleanSurface(raw) {
  const v = String(raw || "").trim().toLowerCase();
  return SURFACES.includes(v) ? v : null;
}

function cleanFixMethod(raw) {
  const v = String(raw || "").trim().toLowerCase();
  return FIX_METHODS.includes(v) ? v : null;
}

/**
 * The card block a register body may carry: { surface, breachWarned, fixedVia }.
 * Anything else is ignored. Used for signup_attempts.flow and the breach_fixed event.
 */
function cardContext(body) {
  const c = body && typeof body.card === "object" && body.card ? body.card : null;
  if (!c) return null;
  return {
    surface: cleanSurface(c.surface) || "app",
    breachWarned: c.breachWarned === true,
    fixedVia: c.breachWarned === true ? cleanFixMethod(c.fixedVia) : null,
  };
}

// ---- live snippets ---------------------------------------------------------------------

const SNIPPET_MAX = 6;

/**
 * Public page payloads (lib/serverPublicPage.js buildPublicPayload, already allow-listed and
 * profanity masked) -> the small cards around the sign-up card. Only what the public page
 * itself shows: name, icon, counts, the busiest voice channel name with its head count, the
 * next event and the owner's pinned note. Never member names or messages.
 * Busiest first (online + 3 x in voice); servers with nobody online sort last.
 */
function snippetFromPage(page, { now = Date.now() } = {}) {
  if (!page || !page.slug || !page.name) return null;
  const counts = page.counts || null;
  const voiceChannels = Array.isArray(page.channels?.voice) ? page.channels.voice : Array.isArray(page.channels) ? page.channels.filter((c) => c && (c.type === "voice" || c.type === "stage")) : [];
  let voice = null;
  for (const c of voiceChannels) {
    const n = Number(c?.inVoice ?? c?.voiceCount ?? c?.count ?? 0) || 0;
    if (n > 0 && (!voice || n > voice.count)) voice = { name: String(c.name || "").slice(0, 40), count: n };
  }
  // The page already dropped ended events (upcomingEvents); a running one stays until its end.
  const next = (Array.isArray(page.events) ? page.events : [])
    .map((e) => ({ title: String(e?.title || "").slice(0, 60), startsAt: e?.startsAt || e?.starts_at || null, endsAt: e?.endsAt || null }))
    .find((e) => e.title && e.startsAt && Number.isFinite(Date.parse(e.startsAt)) && (Date.parse(e.endsAt || "") || Date.parse(e.startsAt) + 3 * 3600000) >= now) || null;
  return {
    slug: String(page.slug),
    url: page.url || `https://descall.com/s/${page.slug}`,
    name: String(page.name).slice(0, 60),
    iconUrl: page.iconUrl || null,
    members: counts ? Math.max(0, Number(counts.members) || 0) : null,
    online: counts ? Math.max(0, Number(counts.online) || 0) : null,
    inVoice: counts ? Math.max(0, Number(counts.voice) || 0) : null,
    voice,
    event: next,
    pin: page.pin ? String(page.pin).replace(/\s+/g, " ").trim().slice(0, 140) : "",
    category: page.category || null,
  };
}

function rankSnippets(list, { max = SNIPPET_MAX } = {}) {
  const score = (s) => (Number(s.online) || 0) + 3 * (Number(s.inVoice) || 0) + (s.event ? 2 : 0);
  return (Array.isArray(list) ? list : [])
    .filter(Boolean)
    .sort((a, b) => score(b) - score(a) || (Number(b.members) || 0) - (Number(a.members) || 0) || a.name.localeCompare(b.name))
    .slice(0, max);
}

/** Top sign-up countries of today (ISO codes, at most 3, from users.signup_country). */
function topCountries(rows, max = 3) {
  const by = new Map();
  for (const r of Array.isArray(rows) ? rows : []) {
    const c = String(r?.signup_country || "").toUpperCase();
    if (!/^[A-Z]{2}$/.test(c)) continue;
    by.set(c, (by.get(c) || 0) + 1);
  }
  return [...by.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, max).map(([code]) => code);
}

module.exports = {
  EMAIL_RE,
  IDENTIFY_STEPUP,
  IDENTIFY_MAX,
  IDENTIFY_WINDOW_MS,
  IDEAS_MAX,
  SURFACES,
  FIX_METHODS,
  CARD_EVENTS,
  normalizeEmail,
  looksLikeEmail,
  cleanLoginName,
  maskEmail,
  cleanPrefix,
  compactRange,
  countInRange,
  createRangeCache,
  pickEmailHolder,
  cleanIdeas,
  cleanSurface,
  cleanFixMethod,
  cardContext,
  snippetFromPage,
  rankSnippets,
  topCountries,
};
