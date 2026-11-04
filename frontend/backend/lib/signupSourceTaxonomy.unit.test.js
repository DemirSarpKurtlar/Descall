"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  classifySignupSource: c,
  classifyUserRow,
  resolvePlatform,
  aggregateSourceBreakdown,
  buildSignupSourceColumns,
  inviteFromPath,
  GROUPS,
} = require("./signupSourceTaxonomy");

const pick = (r) => `${r.group}/${r.sub}`;
const WEB = { platform: "web_desktop", has_snapshot: true };

test("search engines by referrer", () => {
  assert.equal(pick(c({ ...WEB, referrer: "https://www.google.com.tr/" })), "search/google");
  assert.equal(pick(c({ ...WEB, referrer: "https://www.bing.com/search?q=x" })), "search/bing");
  assert.equal(pick(c({ ...WEB, referrer: "https://yandex.com.tr/search" })), "search/yandex");
  assert.equal(pick(c({ ...WEB, referrer: "https://duckduckgo.com/" })), "search/duckduckgo");
  assert.equal(pick(c({ ...WEB, referrer: "https://chatgpt.com/" })), "search/ai_assistant");
});

test("social, video, community and messaging referrers", () => {
  const cases = {
    "https://l.instagram.com/?u=x": "social/instagram",
    "https://www.tiktok.com/@d": "social/tiktok",
    "https://t.co/abc": "social/x",
    "https://x.com/descall": "social/x",
    "https://m.facebook.com/": "social/facebook",
    "https://youtu.be/abc": "video/youtube",
    "https://www.twitch.tv/x": "video/twitch",
    "https://www.reddit.com/r/x": "community/reddit",
    "https://discord.com/channels/1": "community/discord",
    "https://eksisozluk.com/x": "community/eksisozluk",
    "https://web.whatsapp.com/": "messaging/whatsapp",
    "https://t.me/descall": "messaging/telegram",
    "https://apps.apple.com/tr/app/descall": "app_store/app_store",
    "https://testflight.apple.com/join/x": "app_store/testflight",
    "android-app://com.instagram.android": "social/instagram",
    "https://mail.google.com/": "email/webmail",
  };
  for (const [ref, want] of Object.entries(cases)) assert.equal(pick(c({ ...WEB, referrer: ref })), want, ref);
});

test("unknown external site keeps its domain as detail", () => {
  const r = c({ ...WEB, referrer: "https://m.example.org/post/1" });
  assert.equal(pick(r), "website/other_site");
  assert.equal(r.detail, "example.org");
});

test("paid click ids and paid UTM", () => {
  assert.equal(pick(c({ gclid: "x" })), "paid/google_ads");
  assert.equal(pick(c({ msclkid: "x" })), "paid/bing_ads");
  assert.equal(pick(c({ ttclid: "x" })), "paid/tiktok_ads");
  assert.equal(pick(c({ utm_source: "instagram", utm_medium: "paid_social" })), "paid/meta_ads");
  assert.equal(pick(c({ utm_source: "newsite", utm_medium: "cpc" })), "paid/paid_other");
  assert.equal(c({ gclid: "x", utm_campaign: "launch-tr" }).detail, "launch-tr");
});

test("UTM sources, email and campaigns", () => {
  assert.equal(pick(c({ utm_source: "tiktok", utm_medium: "social" })), "social/tiktok");
  assert.equal(pick(c({ utm_source: "resend", utm_medium: "email" })), "email/transactional");
  assert.equal(pick(c({ utm_source: "x", utm_medium: "newsletter" })), "email/newsletter");
  assert.equal(pick(c({ utm_source: "poster", utm_medium: "qr" })), "campaign/qr_offline");
  assert.equal(pick(c({ utm_source: "streamerx", utm_medium: "influencer" })), "campaign/influencer");
  assert.equal(pick(c({ utm_source: "something" })), "campaign/utm_other");
});

test("invites: server, group, friend, referral code", () => {
  assert.equal(pick(c({ ...WEB, invite_kind: "server_invite" })), "invite/server_invite");
  assert.equal(pick(c({ ...WEB, invitedBy: "ali" })), "invite/friend_invite");
  assert.equal(pick(c({ ...WEB, landing_page: "https://descall.com/servers/join/abc123" })), "invite/server_invite");
  assert.equal(pick(c({ ...WEB, landing_page: "https://descall.com/invite/abc123" })), "invite/group_invite");
  assert.equal(inviteFromPath("/register?ref=ali"), "friend_invite");
  assert.equal(inviteFromPath("/?referral=CODE12"), "referral_code");
  // paid click beats invite
  assert.equal(pick(c({ gclid: "g", invitedBy: "ali" })), "paid/google_ads");
});

test("no referrer: native apps are not lumped into Direkt", () => {
  assert.equal(pick(c({ platform: "ios_app" })), "app_direct/ios_app");
  assert.equal(pick(c({ platform: "electron_macos" })), "app_direct/desktop_macos");
  assert.equal(pick(c({ platform: "electron_windows" })), "app_direct/desktop_windows");
  assert.equal(pick(c({ platform: "watch" })), "app_direct/watch");
});

test("real direct vs unknown", () => {
  assert.equal(pick(c({ ...WEB, landing_page: "https://descall.com/" })), "direct/typed");
  assert.equal(pick(c({ ...WEB, landing_page: "https://descall.com/download" })), "direct/download_page");
  assert.equal(pick(c({ ...WEB, landing_page: "https://descall.com/features" })), "direct/deep_link");
  assert.equal(pick(c({ platform: "web_desktop" })), "unknown/no_data");
  assert.equal(pick(c({ ...WEB, referrer: "https://accounts.google.com/" })), "unknown/oauth_return");
});

test("platform resolution", () => {
  assert.equal(resolvePlatform({ clientPlatform: "electron", userAgent: "Mozilla/5.0 (Windows NT 10.0) Electron/30" }), "electron_windows");
  assert.equal(resolvePlatform({ clientPlatform: "electron", userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14) Electron/30" }), "electron_macos");
  assert.equal(resolvePlatform({ clientPlatform: "ios", userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18) Mobile" }), "ios_app");
  assert.equal(resolvePlatform({ clientPlatform: "web", userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18) Mobile Safari" }), "web_mobile");
  assert.equal(resolvePlatform({ clientPlatform: "web", userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/130" }), "web_desktop");
  assert.equal(resolvePlatform({}), "unknown");
});

test("legacy rows are reclassified only from stored data", () => {
  assert.equal(pick(classifyUserRow({})), "unknown/legacy");
  assert.equal(pick(classifyUserRow({ first_touch_source: "direct" })), "unknown/legacy");
  assert.equal(pick(classifyUserRow({ first_touch_source: "direct", first_touch_landing_page: "https://descall.com/" })), "direct/typed");
  // bare path = non-http origin (capacitor:// / file://) => native app
  assert.equal(pick(classifyUserRow({ first_touch_source: "direct", first_touch_landing_page: "/", signup_os: "ios", signup_device: "mobile" })), "app_direct/ios_app");
  assert.equal(pick(classifyUserRow({ first_touch_source: "direct", first_touch_landing_page: "/", signup_os: "windows" })), "app_direct/desktop_windows");
  assert.equal(pick(classifyUserRow({ first_touch_source: "direct", first_touch_landing_page: "https://descall.com/", referred_by: "u1" })), "invite/friend_invite");
  assert.equal(pick(classifyUserRow({ first_touch_source: "google_ads", first_touch_gclid: "g" })), "paid/google_ads");
  assert.equal(pick(classifyUserRow({ first_touch_source: "google_organic" })), "search/google");
  assert.equal(pick(classifyUserRow({ first_touch_source: "twitter", first_touch_referrer: "https://t.co/x" })), "social/x");
  assert.equal(pick(classifyUserRow({ first_touch_source: "other", first_touch_referrer: "https://blog.example.com/a" })), "website/other_site");
  assert.equal(pick(classifyUserRow({ first_touch_source: "referral" })), "invite/friend_invite");
  // new columns win
  assert.equal(pick(classifyUserRow({ signup_source_group: "social", signup_source_sub: "tiktok", first_touch_source: "direct" })), "social/tiktok");
});

test("aggregate tree: counts, percentages, drill-down", () => {
  const rows = [
    { signup_source_group: "social", signup_source_sub: "instagram", signup_platform: "web_mobile" },
    { signup_source_group: "social", signup_source_sub: "instagram", signup_platform: "ios_app" },
    { signup_source_group: "social", signup_source_sub: "tiktok", signup_platform: "web_mobile" },
    { signup_source_group: "website", signup_source_sub: "other_site", signup_source_detail: "example.org", signup_platform: "web_desktop" },
    {},
  ];
  const out = aggregateSourceBreakdown(rows);
  assert.equal(out.total, 5);
  assert.equal(out.groups[0].key, "social");
  assert.equal(out.groups[0].count, 3);
  assert.equal(out.groups[0].pct, 60);
  assert.equal(out.groups[0].subs[0].key, "instagram");
  assert.equal(out.groups[0].subs[0].pctOfGroup, 66.7);
  assert.equal(out.groups[0].subs[0].platforms.length, 2);
  const site = out.groups.find((g) => g.key === "website");
  assert.deepEqual(site.subs[0].details, [{ key: "example.org", count: 1 }]);
  assert.ok(out.groups.find((g) => g.key === "unknown"));
  assert.equal(out.platforms.reduce((n, p) => n + p.count, 0), 5);
  for (const g of out.groups) assert.ok(GROUPS.includes(g.key));
});

test("buildSignupSourceColumns writes only the new nullable columns", () => {
  const cols = buildSignupSourceColumns({
    snapshot: { referrer: "https://www.tiktok.com/", landing_page: "https://descall.com/", client_platform: "web", captured_at: "2026-11-01T00:00:00Z" },
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18) Mobile Safari",
  });
  assert.deepEqual(Object.keys(cols).sort(), ["first_touch_utm_source", "signup_platform", "signup_source_detail", "signup_source_group", "signup_source_sub"]);
  assert.equal(cols.signup_source_group, "social");
  assert.equal(cols.signup_source_sub, "tiktok");
  assert.equal(cols.signup_platform, "web_mobile");
  const none = buildSignupSourceColumns({ snapshot: {}, userAgent: "" });
  assert.equal(none.signup_source_group, "unknown");
  const app = buildSignupSourceColumns({ snapshot: { client_platform: "electron", landing_path: "/" }, userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14) Electron/30" });
  assert.equal(`${app.signup_source_group}/${app.signup_source_sub}`, "app_direct/desktop_macos");
});
