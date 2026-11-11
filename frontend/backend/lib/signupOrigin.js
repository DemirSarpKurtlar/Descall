"use strict";

/**
 * Compact "where did this signup come from" summary for the admin overview's
 * newly-joined list. Pure: takes a users row (snake_case columns), returns plain
 * values the panel turns into chips. Every field is optional; missing columns
 * (older rows, migrations not applied) simply yield nulls.
 */

const APP_PLATFORMS = new Set(["ios_app", "ipad_app", "android_app", "electron_windows", "electron_macos", "electron_linux", "watch"]);

function clean(value, max = 120) {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  return s ? s.slice(0, max) : null;
}

/** "https://www.google.com.tr/search?q=x" -> "google.com.tr"; our own domain -> null. */
function referrerHost(raw) {
  const s = clean(raw, 500);
  if (!s) return null;
  try {
    const host = new URL(s.includes("://") ? s : `https://${s}`).hostname.toLowerCase().replace(/^www\./, "");
    if (!host || host === "descall.com" || host.endsWith(".descall.com")) return null;
    return host.slice(0, 80);
  } catch {
    return null;
  }
}

/** Landing URL or path -> path only ("/tr/blog/x"), query and hash dropped. */
function landingPath(raw) {
  const s = clean(raw, 500);
  if (!s) return null;
  try {
    const u = new URL(s, "https://descall.com");
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    if (host !== "descall.com" && !host.endsWith(".descall.com") && !host.endsWith(".pages.dev")) return null;
    const path = u.pathname.replace(/\/+$/, "") || "/";
    return path.slice(0, 80);
  } catch {
    return null;
  }
}

/**
 * The iOS app before 3.7.43 did not send its platform, so it was stored as
 * web_mobile. Its web view reports no Safari token (browser "other") on iOS: treat
 * that combination as "probably the iPhone app" and say so.
 */
function platformOf(row) {
  const platform = clean(row.signup_platform, 40);
  if (platform && APP_PLATFORMS.has(platform)) return { platform, app: true, guessed: false };
  const os = clean(row.signup_os, 20);
  const browser = clean(row.signup_browser, 20);
  if (os === "ios" && (browser === "other" || !browser) && (!platform || platform === "web_mobile" || platform === "web_tablet")) {
    return { platform: platform === "web_tablet" ? "ipad_app" : "ios_app", app: true, guessed: true };
  }
  return { platform: platform || null, app: false, guessed: false };
}

function inviteOf(row) {
  const joined = clean(row.joined_via_invite_code, 80);
  if (joined) {
    const [kind] = joined.split(":");
    if (["server", "vanity", "group", "friend"].includes(kind)) return kind;
  }
  const kind = clean(row.signup_invite_kind, 20);
  if (kind && ["server", "vanity", "group"].includes(kind)) return kind;
  if (row.referred_by) return "friend";
  return null;
}

function signupOrigin(row = {}) {
  const { platform, app, guessed } = platformOf(row);
  const heard = clean(row.heard_about, 24);
  const provider = String(row.auth_provider || "").toLowerCase();
  const rawMethod = clean(row.auth_method, 20);
  // auth_method folds Apple into "other"; the provider column still says "apple".
  const method = provider.includes("apple") ? "apple" : provider.includes("google") && rawMethod !== "email" ? "google" : rawMethod;
  const country = clean(row.signup_country, 2);
  return {
    sub: clean(row.signup_source_sub, 40),
    referrer: referrerHost(row.first_touch_referrer),
    landing: landingPath(row.first_touch_landing_page),
    term: clean(row.first_touch_term, 80),
    campaign: clean(row.first_touch_campaign, 80),
    country: country && /^[A-Za-z]{2}$/.test(country) ? country.toUpperCase() : null,
    platform,
    app,
    appGuessed: guessed,
    os: clean(row.signup_os, 20),
    browser: clean(row.signup_browser, 20),
    method,
    heard: heard && heard !== "skipped" ? heard : null,
    invite: inviteOf(row),
  };
}

const ORIGIN_COLS = [
  "first_touch_referrer",
  "first_touch_landing_page",
  "first_touch_term",
  "first_touch_campaign",
  "signup_source_sub",
  "signup_platform",
  "signup_os",
  "signup_browser",
  "signup_country",
  "auth_method",
  "auth_provider",
  "heard_about",
  "joined_via_invite_code",
  "signup_invite_kind",
  "referred_by",
];

module.exports = { signupOrigin, referrerHost, landingPath, ORIGIN_COLS };
