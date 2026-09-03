"use strict";

/**
 * Signup acquisition attribution — marketing source is independent of auth method.
 * Google OAuth is never treated as Google Ads.
 */

const MAX_FIELD = 128;
const MAX_URL = 512;
const MAX_CLICK_ID = 200;
const PAID_MEDIA = new Set(["cpc", "ppc", "paid", "paidsearch", "paid_search", "pam", "cpm", "display"]);
const OWN_HOSTS = new Set(["descall.com", "www.descall.com", "localhost", "127.0.0.1"]);

function displayValue(value, empty = "N/A") {
  const text = String(value == null ? "" : value).trim();
  return text || empty;
}

function stripTags(value) {
  return String(value == null ? "" : value).replace(/<[^>]*>/g, "");
}

function clamp(value, max) {
  const text = stripTags(value).replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.slice(0, max);
}

function normalizeKey(value) {
  return clamp(value, MAX_FIELD).toLowerCase();
}

function safeUrl(value, { allowExternal = false } = {}) {
  const raw = clamp(value, MAX_URL);
  if (!raw) return "";
  const lower = raw.toLowerCase();
  if (/^(javascript|data|vbscript|file):/i.test(lower)) return "";
  if (raw.startsWith("/") && !raw.startsWith("//")) return raw.slice(0, MAX_URL);
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    if (!allowExternal && !OWN_HOSTS.has(url.hostname.toLowerCase()) && !OWN_HOSTS.has(host) && url.hostname !== "descall.com") {
      // Landing pages must be Descall; www / apex / localhost only.
      if (!/(^|\.)descall\.com$/i.test(url.hostname) && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
        return "";
      }
    }
    return url.toString().slice(0, MAX_URL);
  } catch {
    return "";
  }
}

function referrerHost(referrer) {
  const url = safeUrl(referrer, { allowExternal: true });
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function isGoogleHost(host) {
  return /(^|\.)google\./i.test(host) || host === "google" || /(^|\.)googleadservices\.com$/i.test(host);
}

function isOwnHost(host) {
  return !host || OWN_HOSTS.has(host) || /(^|\.)descall\.com$/i.test(host);
}

function classifyAcquisitionSource(raw = {}) {
  const gclid = clamp(raw.gclid, MAX_CLICK_ID);
  const utmSource = normalizeKey(raw.utm_source);
  const utmMedium = normalizeKey(raw.utm_medium);
  const host = referrerHost(raw.referrer);

  if (gclid) return "google_ads";
  if (
    (utmSource === "google" || utmSource === "googleads" || utmSource === "adwords" || utmSource === "google_ads") &&
    PAID_MEDIA.has(utmMedium)
  ) {
    return "google_ads";
  }

  if (utmSource === "discord") return "discord";
  if (utmSource === "facebook" || utmSource === "fb" || utmSource === "meta") return "facebook";
  if (utmSource === "instagram" || utmSource === "ig") return "instagram";
  if (utmSource === "twitter" || utmSource === "x") return "twitter";
  if (utmSource === "tiktok") return "tiktok";
  if (utmSource === "reddit") return "reddit";
  if (utmSource === "youtube" || utmSource === "yt") return "youtube";
  if (utmSource === "referral" || utmSource === "invite") return "referral";
  if (utmSource === "bing") return PAID_MEDIA.has(utmMedium) ? "bing_ads" : "bing_organic";
  if (utmSource === "google" || utmSource === "google_organic") return "google_organic";
  if (utmSource === "direct") return "direct";
  if (utmSource && utmSource !== "google_ads") {
    const slug = utmSource.replace(/[^a-z0-9_-]/g, "").slice(0, 48);
    if (slug) return slug;
  }

  if (!host || isOwnHost(host)) {
    if (!utmSource && !gclid && !utmMedium) {
      if (raw.invitedBy) return "referral";
      return "direct";
    }
  }
  if (isGoogleHost(host)) return "google_organic";
  if (host.includes("discord.com") || host.includes("discordapp.com") || host === "discord.gg") return "discord";
  if (host.includes("reddit.com") || host === "redd.it") return "reddit";
  if (host.includes("youtube.com") || host === "youtu.be") return "youtube";
  if (host.includes("facebook.com") || host.includes("fb.com") || host.includes("l.facebook.com")) return "facebook";
  if (host.includes("instagram.com")) return "instagram";
  if (host === "t.co" || host.endsWith(".t.co") || host.includes("twitter.com") || host === "x.com") return "twitter";
  if (host.includes("tiktok.com")) return "tiktok";
  if (host.includes("bing.com")) return "bing_organic";
  if (host.includes("yahoo.")) return "yahoo";
  if (isOwnHost(host)) return raw.invitedBy ? "referral" : "direct";
  if (host) return "other";
  return raw.invitedBy ? "referral" : "direct";
}

function inferMedium(raw = {}, source) {
  const medium = normalizeKey(raw.utm_medium);
  if (medium) return medium;
  if (source === "google_ads" || source === "bing_ads") return "cpc";
  if (source === "google_organic" || source === "bing_organic") return "organic";
  if (source === "direct") return "none";
  if (raw.referrer) return "referral";
  return "";
}

function sanitizeAttributionSnapshot(raw = {}) {
  if (!raw || typeof raw !== "object") {
    return {
      utm_source: "",
      utm_medium: "",
      utm_campaign: "",
      utm_term: "",
      utm_content: "",
      gclid: "",
      fbclid: "",
      referrer: "",
      landing_page: "",
      landing_path: "",
      captured_at: "",
    };
  }
  const landingPage = safeUrl(raw.landing_page, { allowExternal: false });
  let landingPath = clamp(raw.landing_path, MAX_FIELD);
  if (landingPath && !landingPath.startsWith("/")) landingPath = "";
  if (!landingPath && landingPage) {
    try {
      landingPath = new URL(landingPage).pathname || "/";
    } catch {
      landingPath = "";
    }
  }
  let capturedAt = "";
  if (raw.captured_at) {
    const d = new Date(raw.captured_at);
    if (!Number.isNaN(d.getTime())) capturedAt = d.toISOString();
  }
  return {
    utm_source: clamp(raw.utm_source, MAX_FIELD),
    utm_medium: clamp(raw.utm_medium, MAX_FIELD),
    utm_campaign: clamp(raw.utm_campaign, MAX_FIELD),
    utm_term: clamp(raw.utm_term, MAX_FIELD),
    utm_content: clamp(raw.utm_content, MAX_FIELD),
    gclid: clamp(raw.gclid, MAX_CLICK_ID),
    fbclid: clamp(raw.fbclid, MAX_CLICK_ID),
    referrer: safeUrl(raw.referrer, { allowExternal: true }),
    landing_page: landingPage,
    landing_path: landingPath,
    captured_at: capturedAt,
    invitedBy: clamp(raw.invitedBy, 32),
  };
}

function resolveAuthMethod(providerOrMethod) {
  const value = normalizeKey(providerOrMethod);
  if (value === "google") return "google";
  if (value === "email" || value === "email_password" || value === "local" || value === "password") return "email";
  if (value === "local+google" || value === "local_google") return "email";
  if (!value) return "other";
  return "other";
}

function pickSnapshot(attribution) {
  if (!attribution || typeof attribution !== "object") return { first: {}, last: {} };
  const first = attribution.first && typeof attribution.first === "object" ? attribution.first : attribution;
  const last = attribution.last && typeof attribution.last === "object" ? attribution.last : first;
  return { first, last };
}

function snapshotColumns(prefix, snap) {
  const clean = sanitizeAttributionSnapshot(snap);
  const source = classifyAcquisitionSource(clean);
  const at = clean.captured_at || null;
  return {
    [`${prefix}_source`]: source,
    [`${prefix}_medium`]: inferMedium(clean, source) || null,
    [`${prefix}_campaign`]: clean.utm_campaign || null,
    [`${prefix}_term`]: clean.utm_term || null,
    [`${prefix}_content`]: clean.utm_content || null,
    [`${prefix}_gclid`]: clean.gclid || null,
    [`${prefix}_fbclid`]: clean.fbclid || null,
    [`${prefix}_landing_page`]: clean.landing_page || clean.landing_path || null,
    [`${prefix}_referrer`]: clean.referrer || null,
    [`${prefix}_at`]: at,
  };
}

function parseUserAgent(ua) {
  const raw = String(ua || "");
  let device = "desktop";
  if (/iPad|Tablet|PlayBook/i.test(raw)) device = "tablet";
  else if (/Mobile|Android|iPhone|iPod|webOS|BlackBerry/i.test(raw)) device = "mobile";

  let os = "other";
  if (/iPhone|iPad|iPod/i.test(raw)) os = "ios";
  else if (/Android/i.test(raw)) os = "android";
  else if (/Windows NT/i.test(raw)) os = "windows";
  else if (/Mac OS X/i.test(raw)) os = "macos";
  else if (/Linux/i.test(raw)) os = "linux";

  let browser = "other";
  if (/Edg\//i.test(raw)) browser = "edge";
  else if (/Chrome\//i.test(raw) && !/Edg\//i.test(raw)) browser = "chrome";
  else if (/Firefox\//i.test(raw)) browser = "firefox";
  else if (/Safari\//i.test(raw) && !/Chrome\//i.test(raw)) browser = "safari";

  return { device, os, browser };
}

function headerValue(headers, names) {
  if (!headers || typeof headers !== "object") return "";
  const map = {};
  for (const [key, value] of Object.entries(headers)) {
    map[String(key).toLowerCase()] = value;
  }
  for (const name of names) {
    const raw = map[String(name).toLowerCase()];
    if (raw == null) continue;
    const text = String(Array.isArray(raw) ? raw[0] : raw).trim();
    if (text) return text;
  }
  return "";
}

function decodeHeaderText(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    return decodeURIComponent(raw.replace(/\+/g, " ")).replace(/\s+/g, " ").trim();
  } catch {
    return raw.replace(/\+/g, " ").replace(/\s+/g, " ").trim();
  }
}

function isIanaTimeZone(tz) {
  const zone = String(tz || "").trim();
  if (!zone || zone.length > 80) return false;
  if (zone === "UTC" || zone === "Etc/UTC") return true;
  if (!/^[A-Za-z_]+(\/[A-Za-z0-9_+\-]+)+$/.test(zone)) return false;
  try {
    Intl.DateTimeFormat("en-GB", { timeZone: zone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function countryFromHeaders(headers = {}) {
  const code = headerValue(headers, [
    "cf-ipcountry",
    "x-vercel-ip-country",
    "x-country-code",
    "cloudfront-viewer-country",
  ]).toUpperCase();
  if (!/^[A-Z]{2}$/.test(code) || code === "XX" || code === "T1") return "";
  return code;
}

function geoFromHeaders(headers = {}) {
  const country = countryFromHeaders(headers);
  const city = decodeHeaderText(
    headerValue(headers, ["cf-ipcity", "x-vercel-ip-city", "x-city"])
  ).slice(0, 80);
  const region = decodeHeaderText(
    headerValue(headers, ["cf-region", "cf-region-code", "x-vercel-ip-country-region", "x-region"])
  ).slice(0, 40);
  const rawTz = headerValue(headers, ["cf-timezone", "x-vercel-ip-timezone", "x-timezone"]);
  const timezone = isIanaTimeZone(rawTz) ? rawTz : "";
  const parts = [];
  const regionOk =
    region &&
    region.toLowerCase() !== city.toLowerCase() &&
    region !== country &&
    !/^[A-Z0-9]{1,3}$/.test(region);
  if (city) parts.push(city);
  if (regionOk) parts.push(region);
  if (country) parts.push(country);
  return {
    country: country || "",
    city,
    region,
    timezone,
    place: parts.join(", "),
  };
}

function buildUserAttributionColumns({ attribution, authMethod, now, req, invitedBy } = {}) {
  const { first, last } = pickSnapshot(attribution);
  const firstWithInvite = { ...first, invitedBy: invitedBy || first?.invitedBy || "" };
  const lastWithInvite = { ...last, invitedBy: invitedBy || last?.invitedBy || "" };
  const signupAt = now ? new Date(now) : new Date();
  const iso = Number.isNaN(signupAt.getTime()) ? new Date().toISOString() : signupAt.toISOString();
  const firstCols = snapshotColumns("first_touch", firstWithInvite);
  const lastCols = snapshotColumns("last_touch", lastWithInvite);
  if (!firstCols.first_touch_at) firstCols.first_touch_at = iso;
  if (!lastCols.last_touch_at) lastCols.last_touch_at = iso;
  const headers = req?.headers || {};
  const uaInfo = parseUserAgent(headers["user-agent"]);
  const country = countryFromHeaders(headers);
  return {
    ...firstCols,
    ...lastCols,
    auth_method: resolveAuthMethod(authMethod),
    signup_at: iso,
    signup_device: uaInfo.device || null,
    signup_browser: uaInfo.browser || null,
    signup_os: uaInfo.os || null,
    signup_country: country || null,
  };
}

function preserveFirstTouch({ existingFirst, incoming } = {}) {
  const firstClean = sanitizeAttributionSnapshot(existingFirst || {});
  const incomingClean = sanitizeAttributionSnapshot(incoming || {});
  const hasExisting =
    Boolean(firstClean.gclid || firstClean.fbclid || firstClean.utm_source || firstClean.referrer || firstClean.landing_page || firstClean.captured_at);
  return {
    first: hasExisting ? firstClean : incomingClean,
    last: incomingClean,
  };
}

function bump(map, key) {
  const k = key || "unknown";
  map[k] = (map[k] || 0) + 1;
}

function aggregateAttributionStats(rows = []) {
  const bySource = {};
  const byAuthMethod = {};
  const byCampaign = {};
  const byDay = {};
  const sourceAuthMatrix = {};
  let googleAds = 0;

  for (const row of rows) {
    const source = row.first_touch_source || "unknown";
    const auth = row.auth_method || "unknown";
    const campaign = row.first_touch_campaign || "";
    const when = row.signup_at || row.created_at || "";
    const day = when ? String(when).slice(0, 10) : "unknown";
    bump(bySource, source);
    bump(byAuthMethod, auth);
    if (campaign) bump(byCampaign, campaign);
    bump(byDay, day);
    if (!sourceAuthMatrix[source]) sourceAuthMatrix[source] = {};
    bump(sourceAuthMatrix[source], auth);
    if (source === "google_ads") googleAds += 1;
  }

  const totalSignups = rows.length;
  return {
    totalSignups,
    bySource,
    byAuthMethod,
    byCampaign,
    byDay,
    sourceAuthMatrix,
    googleAdsSignups: googleAds,
    googleAdsShare: totalSignups ? googleAds / totalSignups : 0,
  };
}

function isMissingColumnError(err) {
  const msg = String(err?.message || err || "");
  const code = String(err?.code || "");
  return code === "42703" || /column .* does not exist/i.test(msg) || /schema cache/i.test(msg);
}

module.exports = {
  classifyAcquisitionSource,
  resolveAuthMethod,
  sanitizeAttributionSnapshot,
  buildUserAttributionColumns,
  preserveFirstTouch,
  aggregateAttributionStats,
  displayValue,
  isMissingColumnError,
  parseUserAgent,
  countryFromHeaders,
  geoFromHeaders,
  isIanaTimeZone,
};
