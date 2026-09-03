"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  ALLOWED_EVENTS,
  sanitizeVisitorKey,
  sanitizeAnalyticsEvent,
  isOncePerUserEvent,
  googleAdsMetrics,
  buildLifecycleFunnel,
  buildUserTimeline,
  activeUserCounts,
  headlineSourceCounts,
} = require("./userAnalytics");

test("only known analytics events are accepted", () => {
  assert.equal(sanitizeAnalyticsEvent({ event: "signup_completed" }).event, "signup_completed");
  assert.equal(sanitizeAnalyticsEvent({ event: "DROP TABLE" }).event, null);
  assert.equal(sanitizeAnalyticsEvent({ event: "page_view" }).event, "page_view");
  assert.ok(ALLOWED_EVENTS.has("first_message"));
  assert.equal(sanitizeAnalyticsEvent({ event: "app_opened", props: { html: "<script>" } }).props.html, undefined);
});

test("visitor keys must be short opaque ids", () => {
  assert.equal(sanitizeVisitorKey("vis_abcdefghij"), "vis_abcdefghij");
  assert.equal(sanitizeVisitorKey("<script>"), "");
  assert.equal(sanitizeVisitorKey("x".repeat(80)), "");
});

test("once-per-user events cover signup and firsts", () => {
  assert.equal(isOncePerUserEvent("signup_completed"), true);
  assert.equal(isOncePerUserEvent("first_message"), true);
  assert.equal(isOncePerUserEvent("login"), false);
  assert.equal(isOncePerUserEvent("page_view"), false);
});

test("google ads metrics never invent cost or clicks", () => {
  const metrics = googleAdsMetrics({
    adsSignups: 4,
    adsVisits: 10,
    adsCost: null,
  });
  assert.equal(metrics.signups, 4);
  assert.equal(metrics.clicks, 10);
  assert.equal(metrics.conversionRate, 0.4);
  assert.equal(metrics.costPerSignup, null);
  assert.equal(metrics.costAvailable, false);
});

test("lifecycle funnel uses real counts only", () => {
  const funnel = buildLifecycleFunnel({
    visitors: 100,
    signupStarted: 80,
    signupCompleted: 50,
    appOpened: 40,
    firstAction: 25,
    firstMessage: 10,
  });
  assert.deepEqual(
    funnel.map((s) => s.key),
    ["visitors", "signup_started", "signup_completed", "app_opened", "first_action", "first_message"],
  );
  assert.equal(funnel[2].count, 50);
  assert.equal(funnel[5].count, 10);
});

test("user timeline is ordered and uses server milestones", () => {
  const timeline = buildUserTimeline({
    signup_at: "2026-08-01T10:00:00.000Z",
    auth_method: "google",
    first_touch_source: "discord",
    first_app_opened_at: "2026-08-01T10:01:00.000Z",
    first_action_at: "2026-08-01T10:05:00.000Z",
    first_message_at: null,
    last_seen: "2026-08-01T10:20:00.000Z",
  });
  assert.equal(timeline[0].key, "signup");
  assert.equal(timeline.find((s) => s.key === "first_message").done, false);
  assert.equal(timeline.find((s) => s.key === "app_opened").done, true);
});

test("active users split today / 7d / 30d from last_seen", () => {
  const now = new Date("2026-08-25T12:00:00.000Z");
  const counts = activeUserCounts(
    [
      { last_seen: "2026-08-25T08:00:00.000Z" },
      { last_seen: "2026-08-20T08:00:00.000Z" },
      { last_seen: "2026-07-01T08:00:00.000Z" },
      { last_seen: null },
    ],
    now,
  );
  assert.equal(counts.activeToday, 1);
  assert.equal(counts.active7d, 2);
  assert.equal(counts.active30d, 2);
});

test("headline sources bucket unknown into other", () => {
  const counts = headlineSourceCounts({
    google_ads: 5,
    discord: 2,
    newsletter: 1,
    unknown: 3,
  });
  assert.equal(counts.google_ads, 5);
  assert.equal(counts.discord, 2);
  assert.equal(counts.other, 4);
  assert.equal(counts.reddit, 0);
});
