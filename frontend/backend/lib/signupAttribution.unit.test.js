"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  classifyAcquisitionSource,
  resolveAuthMethod,
  sanitizeAttributionSnapshot,
  buildUserAttributionColumns,
  preserveFirstTouch,
  aggregateAttributionStats,
  displayValue,
  countryFromHeaders,
  geoFromHeaders,
  isIanaTimeZone,
} = require("./signupAttribution");

function adsClick() {
  return {
    utm_source: "google",
    utm_medium: "cpc",
    utm_campaign: "brand",
    gclid: "Cj0KCQjwAdsClick",
    landing_page: "https://descall.com/?gclid=Cj0KCQjwAdsClick&utm_source=google&utm_medium=cpc",
    landing_path: "/",
    referrer: "https://www.google.com/",
    captured_at: "2026-08-01T10:00:00.000Z",
  };
}

test("scenario 1: Google Ads click + Google OAuth is ads acquisition, google auth", () => {
  const cols = buildUserAttributionColumns({
    attribution: { first: adsClick(), last: adsClick() },
    authMethod: resolveAuthMethod("google"),
    now: "2026-08-01T12:00:00.000Z",
  });
  assert.equal(cols.first_touch_source, "google_ads");
  assert.equal(cols.auth_method, "google");
  assert.notEqual(cols.first_touch_source, cols.auth_method);
});

test("scenario 2: Google Ads click + email signup stays google_ads", () => {
  const cols = buildUserAttributionColumns({
    attribution: { first: adsClick(), last: adsClick() },
    authMethod: resolveAuthMethod("email_password"),
    now: "2026-08-01T12:00:00.000Z",
  });
  assert.equal(cols.first_touch_source, "google_ads");
  assert.equal(cols.auth_method, "email");
});

test("scenario 3: Discord referrer + Google OAuth is discord, not google_ads", () => {
  const snap = {
    referrer: "https://discord.com/channels/123/456",
    landing_page: "https://descall.com/",
    landing_path: "/",
    captured_at: "2026-08-01T10:00:00.000Z",
  };
  const cols = buildUserAttributionColumns({
    attribution: { first: snap, last: snap },
    authMethod: resolveAuthMethod("google"),
  });
  assert.equal(cols.first_touch_source, "discord");
  assert.equal(cols.auth_method, "google");
  assert.notEqual(cols.first_touch_source, "google_ads");
});

test("scenario 4: Google organic search + email signup", () => {
  const snap = {
    referrer: "https://www.google.com/search?q=descall",
    landing_page: "https://descall.com/",
    landing_path: "/",
  };
  assert.equal(classifyAcquisitionSource(snap), "google_organic");
  const cols = buildUserAttributionColumns({
    attribution: { first: snap, last: snap },
    authMethod: resolveAuthMethod("local"),
  });
  assert.equal(cols.first_touch_source, "google_organic");
  assert.equal(cols.auth_method, "email");
});

test("scenario 5: Direct visit + email signup", () => {
  const snap = {
    referrer: "",
    landing_page: "https://descall.com/",
    landing_path: "/",
  };
  assert.equal(classifyAcquisitionSource(snap), "direct");
  const cols = buildUserAttributionColumns({
    attribution: { first: snap, last: snap },
    authMethod: resolveAuthMethod("email_password"),
  });
  assert.equal(cols.first_touch_source, "direct");
  assert.equal(cols.auth_method, "email");
});

test("auth_method google never classifies acquisition as google_ads", () => {
  assert.equal(classifyAcquisitionSource({}), "direct");
  assert.equal(classifyAcquisitionSource({ utm_source: "google" }), "google_organic");
  assert.equal(resolveAuthMethod("google"), "google");
  const cols = buildUserAttributionColumns({
    attribution: { first: {}, last: {} },
    authMethod: "google",
  });
  assert.equal(cols.first_touch_source, "direct");
  assert.equal(cols.auth_method, "google");
});

test("gclid or paid google UTM is google_ads even without guessing from OAuth", () => {
  assert.equal(classifyAcquisitionSource({ gclid: "abc" }), "google_ads");
  assert.equal(
    classifyAcquisitionSource({ utm_source: "google", utm_medium: "ppc" }),
    "google_ads",
  );
  assert.equal(
    classifyAcquisitionSource({ utm_source: "google", utm_medium: "paid" }),
    "google_ads",
  );
});

test("client cannot spoof google_ads by sending a source field", () => {
  const cols = buildUserAttributionColumns({
    attribution: {
      first: {
        source: "google_ads",
        first_touch_source: "google_ads",
        referrer: "https://discord.com/",
      },
    },
    authMethod: "google",
  });
  assert.equal(cols.first_touch_source, "discord");
});

test("first-touch is preserved when last-touch is a later direct visit", () => {
  const first = adsClick();
  const last = { referrer: "", landing_page: "https://descall.com/register", landing_path: "/register" };
  const merged = preserveFirstTouch({
    existingFirst: sanitizeAttributionSnapshot(first),
    incoming: sanitizeAttributionSnapshot(last),
  });
  assert.equal(classifyAcquisitionSource(merged.first), "google_ads");
  assert.equal(classifyAcquisitionSource(merged.last), "direct");

  const cols = buildUserAttributionColumns({
    attribution: { first, last },
    authMethod: "email",
  });
  assert.equal(cols.first_touch_source, "google_ads");
  assert.equal(cols.last_touch_source, "direct");
});

test("sanitize strips HTML and javascript: URLs", () => {
  const clean = sanitizeAttributionSnapshot({
    utm_source: "<script>alert(1)</script>google",
    utm_campaign: "summer<img>",
    referrer: "javascript:alert(1)",
    landing_page: "https://evil.example/phish",
    gclid: "ok-gclid",
  });
  assert.equal(clean.utm_source.includes("<"), false);
  assert.equal(clean.referrer, "");
  assert.equal(clean.landing_page, "");
  assert.equal(clean.gclid, "ok-gclid");
});

test("displayValue falls back to N/A or Unknown", () => {
  assert.equal(displayValue(""), "N/A");
  assert.equal(displayValue(null), "N/A");
  assert.equal(displayValue("google_ads"), "google_ads");
  assert.equal(displayValue("", "Unknown"), "Unknown");
});

test("reddit, youtube, twitter, instagram and referral classify without using auth method", () => {
  assert.equal(classifyAcquisitionSource({ referrer: "https://www.reddit.com/r/discordapp" }), "reddit");
  assert.equal(classifyAcquisitionSource({ utm_source: "youtube" }), "youtube");
  assert.equal(classifyAcquisitionSource({ referrer: "https://youtu.be/abc" }), "youtube");
  assert.equal(classifyAcquisitionSource({ referrer: "https://x.com/descall" }), "twitter");
  assert.equal(classifyAcquisitionSource({ referrer: "https://t.co/abc" }), "twitter");
  assert.equal(classifyAcquisitionSource({ referrer: "https://www.instagram.com/" }), "instagram");
  assert.equal(classifyAcquisitionSource({ utm_source: "referral" }), "referral");
  const invited = buildUserAttributionColumns({
    attribution: { first: { landing_page: "https://descall.com/register?ref=maya", landing_path: "/register" } },
    authMethod: "google",
    invitedBy: "maya",
  });
  assert.equal(invited.first_touch_source, "referral");
  assert.equal(invited.auth_method, "google");
});

test("scenario 6: Google Ads first visit then Direct last visit", () => {
  const cols = buildUserAttributionColumns({
    attribution: {
      first: adsClick(),
      last: {
        landing_page: "https://descall.com/register",
        landing_path: "/register",
        referrer: "",
        captured_at: "2026-08-01T12:30:00.000Z",
      },
    },
    authMethod: "email_password",
  });
  assert.equal(cols.first_touch_source, "google_ads");
  assert.equal(cols.last_touch_source, "direct");
  assert.equal(cols.auth_method, "email");
});

test("invite does not override Google Ads first touch", () => {
  const cols = buildUserAttributionColumns({
    attribution: { first: adsClick(), last: adsClick() },
    authMethod: "email",
    invitedBy: "maya",
  });
  assert.equal(cols.first_touch_source, "google_ads");
});

test("device browser os country come from server request not client claims", () => {
  const cols = buildUserAttributionColumns({
    attribution: { first: adsClick(), last: adsClick() },
    authMethod: "email",
    req: {
      headers: {
        "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        "cf-ipcountry": "DE",
      },
    },
    clientHints: { country: "XX", device: "supercomputer" },
  });
  assert.equal(cols.signup_country, "DE");
  assert.equal(cols.signup_device, "mobile");
  assert.equal(cols.signup_os, "ios");
  assert.equal(cols.signup_browser, "safari");
});


test("aggregateAttributionStats builds source, auth, campaign, and matrix counts", () => {
  const stats = aggregateAttributionStats([
    { first_touch_source: "google_ads", auth_method: "google", first_touch_campaign: "brand", signup_at: "2026-08-01T00:00:00.000Z" },
    { first_touch_source: "google_ads", auth_method: "email", first_touch_campaign: "brand", signup_at: "2026-08-01T00:00:00.000Z" },
    { first_touch_source: "discord", auth_method: "google", first_touch_campaign: null, signup_at: "2026-08-02T00:00:00.000Z" },
    { first_touch_source: "direct", auth_method: "email", first_touch_campaign: null, signup_at: "2026-08-02T00:00:00.000Z" },
    { first_touch_source: "google_organic", auth_method: "email", first_touch_campaign: null, signup_at: "2026-08-02T00:00:00.000Z" },
  ]);
  assert.equal(stats.totalSignups, 5);
  assert.equal(stats.bySource.google_ads, 2);
  assert.equal(stats.bySource.discord, 1);
  assert.equal(stats.byAuthMethod.google, 2);
  assert.equal(stats.byAuthMethod.email, 3);
  assert.equal(stats.byCampaign.brand, 2);
  assert.equal(stats.sourceAuthMatrix.google_ads.google, 1);
  assert.equal(stats.sourceAuthMatrix.google_ads.email, 1);
  assert.equal(stats.sourceAuthMatrix.discord.google, 1);
  assert.equal(stats.googleAdsShare, 0.4);
});

test("geoFromHeaders reads Vercel and Cloudflare place, not a hardcoded Istanbul zone", () => {
  assert.equal(countryFromHeaders({ "CF-IPCountry": "DE" }), "DE");
  const geo = geoFromHeaders({
    "x-vercel-ip-country": "DE",
    "x-vercel-ip-city": "Berlin",
    "x-vercel-ip-country-region": "BE",
    "x-vercel-ip-timezone": "Europe/Berlin",
  });
  assert.equal(geo.country, "DE");
  assert.equal(geo.city, "Berlin");
  assert.equal(geo.timezone, "Europe/Berlin");
  assert.equal(geo.place, "Berlin, DE");
  assert.equal(isIanaTimeZone("Europe/Berlin"), true);
  assert.equal(isIanaTimeZone("NotAZone/Nope"), false);
  assert.equal(isIanaTimeZone("javascript:alert(1)"), false);
});

test("geoFromHeaders decodes city and ignores bogus country codes", () => {
  const geo = geoFromHeaders({
    "cf-ipcountry": "TR",
    "cf-ipcity": "%C4%B0stanbul",
    "cf-timezone": "Europe/Istanbul",
  });
  assert.equal(geo.place, "İstanbul, TR");
  assert.equal(geo.timezone, "Europe/Istanbul");
  assert.equal(countryFromHeaders({ "cf-ipcountry": "XX" }), "");
  assert.equal(geoFromHeaders({}).place, "");
});
