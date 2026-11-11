"use strict";
// node backend/lib/signupOrigin.selftest.cjs
const assert = require("node:assert/strict");
const { signupOrigin, referrerHost, landingPath } = require("./signupOrigin");

assert.equal(referrerHost("https://www.google.com.tr/search?q=x"), "google.com.tr");
assert.equal(referrerHost("https://descall.com/tr"), null, "our own domain is not a referrer");
assert.equal(referrerHost("not a url at all ::"), null);
assert.equal(landingPath("https://descall.com/tr/blog/x?utm=1#top"), "/tr/blog/x");
assert.equal(landingPath("/"), "/");
assert.equal(landingPath("https://evil.example/x"), null, "foreign landing hosts are dropped");

const web = signupOrigin({
  first_touch_referrer: "https://www.google.com/",
  first_touch_landing_page: "https://descall.com/pt-br",
  signup_platform: "web_mobile",
  signup_os: "android",
  signup_browser: "chrome",
  signup_country: "br",
  auth_method: "google",
  auth_provider: "google",
  heard_about: "skipped",
  joined_via_invite_code: "group:9xZ",
});
assert.equal(web.referrer, "google.com");
assert.equal(web.landing, "/pt-br");
assert.equal(web.country, "BR");
assert.equal(web.platform, "web_mobile");
assert.equal(web.app, false);
assert.equal(web.heard, null, "a skipped answer is not shown");
assert.equal(web.invite, "group");
assert.equal(web.method, "google");

const iosApp = signupOrigin({ signup_platform: "web_mobile", signup_os: "ios", signup_browser: "other", auth_method: "other", auth_provider: "apple" });
assert.equal(iosApp.platform, "ios_app");
assert.equal(iosApp.app, true);
assert.equal(iosApp.appGuessed, true, "older iOS app signups are flagged as a guess");
assert.equal(iosApp.method, "apple", "Apple sign-in is named even though auth_method folds it into other");

const safari = signupOrigin({ signup_platform: "web_mobile", signup_os: "ios", signup_browser: "safari" });
assert.equal(safari.platform, "web_mobile");
assert.equal(safari.app, false);

const reported = signupOrigin({ signup_platform: "ios_app", signup_os: "ios", signup_browser: "other", heard_about: "ai_assistant", referred_by: "u1" });
assert.equal(reported.appGuessed, false);
assert.equal(reported.heard, "ai_assistant");
assert.equal(reported.invite, "friend");

assert.deepEqual(Object.keys(signupOrigin()).length > 0, true, "empty rows do not throw");
console.log("signupOrigin selftest ok");
