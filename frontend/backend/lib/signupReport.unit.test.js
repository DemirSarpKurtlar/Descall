"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { buildSignupSubject, buildSignupReport, shortUa } = require("./signupReport");

test("signup subject prefers username", () => {
  assert.equal(buildSignupSubject({ username: "demir", email: "a@b.com" }), "Descall · Yeni kullanıcı — @demir");
  assert.match(buildSignupSubject({ email: "a@b.com" }), /a@b\.com/);
});

test("signup report includes core fields", () => {
  const { subject, text, html } = buildSignupReport({
    user: { id: "u1", username: "demo", email: "d@e.com", display_name: "Demo" },
    method: "google",
    invitedBy: null,
    req: { headers: { "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS) Safari/605", "accept-language": "tr-TR" }, ip: "1.2.3.4" },
    verified: true,
  });
  assert.match(subject, /@demo/);
  assert.match(text, /u1/);
  assert.match(text, /Google/);
  assert.match(text, /Organik/);
  assert.match(html, /Signup raporu/);
  assert.match(shortUa("Mozilla/5.0 (iPhone) Safari"), /Mobil/);
});

test("signup report shows Discord acquisition separately from Google auth", () => {
  const { text, html } = buildSignupReport({
    user: { id: "u2", username: "maya", email: "m@e.com" },
    method: "google",
    invitedBy: null,
    req: { headers: { "user-agent": "Mozilla/5.0 Chrome" } },
    verified: true,
    attribution: {
      first_touch_source: "discord",
      first_touch_medium: "referral",
      first_touch_campaign: null,
      last_touch_source: "discord",
      last_touch_medium: "referral",
      last_touch_campaign: null,
      first_touch_referrer: "https://discord.com/channels/1",
      first_touch_landing_page: "https://descall.com/",
      first_touch_gclid: null,
      auth_method: "google",
      signup_at: "2026-08-01T12:00:00.000Z",
    },
  });
  assert.match(text, /Authentication:\s*Google/);
  assert.match(text, /Acquisition:\s*discord/);
  assert.match(text, /First Touch Source:\s*discord/);
  assert.match(text, /Signup Conversion:\s*Yes/);
  assert.match(text, /GCLID:\s*N\/A/);
  assert.doesNotMatch(text, /First Touch Source:\s*google_ads/);
  assert.match(html, /First Touch Source/);
  assert.equal(html.includes("<script>"), false);
});

test("signup report Google Ads + email auth keeps sources distinct", () => {
  const { text } = buildSignupReport({
    user: { email: "ads@e.com", username: "adsuser" },
    method: "email_password",
    attribution: {
      first_touch_source: "google_ads",
      first_touch_medium: "cpc",
      first_touch_campaign: "brand",
      last_touch_source: "direct",
      last_touch_medium: "none",
      last_touch_campaign: "",
      first_touch_referrer: "https://www.google.com/",
      first_touch_landing_page: "https://descall.com/?gclid=abc",
      first_touch_gclid: "abc",
      auth_method: "email",
      signup_at: "2026-08-01T12:00:00.000Z",
    },
  });
  assert.match(text, /Authentication:\s*Email/);
  assert.match(text, /Acquisition:\s*google_ads/);
  assert.match(text, /First Touch Source:\s*google_ads/);
  assert.match(text, /Last Touch Source:\s*direct/);
  assert.match(text, /GCLID:\s*abc/);
});

test("signup report scenarios keep source independent of auth", () => {
  const cases = [
    { source: "google_ads", method: "google", auth: "Google" },
    { source: "google_ads", method: "email_password", auth: "Email" },
    { source: "discord", method: "google", auth: "Google" },
    { source: "google_organic", method: "email_password", auth: "Email" },
    { source: "direct", method: "email_password", auth: "Email" },
  ];
  for (const row of cases) {
    const { text } = buildSignupReport({
      user: { email: "u@e.com", username: "u" },
      method: row.method,
      attribution: {
        first_touch_source: row.source,
        last_touch_source: row.source,
        auth_method: row.method === "google" ? "google" : "email",
      },
    });
    assert.match(text, new RegExp(`Authentication:\\s*${row.auth}`));
    assert.match(text, new RegExp(`Acquisition:\\s*${row.source}`));
  }
});

test("signup report uses Unknown for missing analytics fields", () => {
  const { text } = buildSignupReport({
    user: { email: "x@y.com", username: "x" },
    method: "email_password",
    attribution: {},
  });
  assert.match(text, /Acquisition:\s*Unknown/);
  assert.match(text, /Campaign:\s*Unknown/);
  assert.match(text, /Country:\s*Unknown/);
  assert.match(text, /First Action:\s*Not yet/);
  assert.match(text, /App Opened:\s*No/);
  assert.match(text, /First Message:\s*No/);
});

test("signup report escapes attribution HTML from untrusted strings", () => {
  const { html, text } = buildSignupReport({
    user: { email: "x@y.com", username: "x" },
    method: "google",
    attribution: {
      first_touch_source: "<img src=x onerror=alert(1)>",
      first_touch_campaign: "<b>hack</b>",
    },
  });
  assert.equal(html.includes("<img"), false);
  assert.equal(html.includes("<b>hack"), false);
  assert.match(html, /&lt;img/);
});

test("signup report place comes from request geo, not hardcoded Europe/Istanbul", () => {
  const { text } = buildSignupReport({
    user: { email: "de@e.com", username: "berlin" },
    method: "google",
    req: {
      headers: {
        "user-agent": "Mozilla/5.0 Chrome",
        "x-vercel-ip-country": "DE",
        "x-vercel-ip-city": "Berlin",
        "x-vercel-ip-timezone": "Europe/Berlin",
      },
    },
    attribution: {
      signup_country: "DE",
      signup_at: "2026-08-26T12:00:00.000Z",
    },
  });
  assert.match(text, /Kayıt yeri:\s*Berlin, DE/);
  assert.match(text, /Kayıt saati:.*\(Türkiye\)/);
  assert.doesNotMatch(text, /Europe\/Berlin/);
  assert.doesNotMatch(text, /Kayıt yeri:.*Europe\/Istanbul/);
  assert.doesNotMatch(text, /Kayıt yeri:.*Türkiye/);
  assert.doesNotMatch(text, /TR saati:/);
});

test("signup report without geo does not fake Istanbul as the place", () => {
  const { text } = buildSignupReport({
    user: { email: "x@y.com", username: "x" },
    method: "email_password",
    attribution: { signup_at: "2026-08-26T12:00:00.000Z" },
  });
  assert.match(text, /Kayıt yeri:\s*Unknown/);
  assert.match(text, /Kayıt saati:.*\(Türkiye\)/);
  assert.doesNotMatch(text, /Kayıt yeri:.*Europe\/Istanbul/);
  assert.doesNotMatch(text, /Kayıt yeri:.*Türkiye/);
});
