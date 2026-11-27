"use strict";

// Uyarlanan kart pure helpers (lib/adaptiveSignup.js) and the Kayıt İstatistikleri card
// breakdown (lib/signupStats.js adaptiveCardBreakdown).
const assert = require("assert");
const path = require("path");
const a = require("./adaptiveSignup");

// signupStats imports the Supabase client: stub it.
const supabasePath = require.resolve("../db/supabase");
require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: {} };
const ss = require("./signupStats");

// Emails
assert.strictEqual(a.normalizeEmail("  Ece.Yilmaz@Outlook.com "), "ece.yilmaz@outlook.com");
assert.strictEqual(a.normalizeEmail("ece@outlook"), null);
assert.strictEqual(a.normalizeEmail(""), null);
assert.strictEqual(a.maskEmail("ece.yilmaz@outlook.com"), "e***@outlook.com");
assert.strictEqual(a.maskEmail("nope"), "");
assert.strictEqual(a.looksLikeEmail("demir"), false);
assert.strictEqual(a.looksLikeEmail("demir@x"), true);

// Range prefix + body
assert.strictEqual(a.cleanPrefix("abcde"), "ABCDE");
assert.strictEqual(a.cleanPrefix("ABCDEF"), null);
assert.strictEqual(a.cleanPrefix("GHIJK"), null);
const raw = ["0018A45C4D1DEF81644B54AB7F969B88D65:1", `${"0".repeat(35)}:0`, "garbage", "00D4F6E8FA6EECAD2A3AA415EEC418D38EC:2\r"].join("\r\n");
assert.strictEqual(a.compactRange(raw), "0018A45C4D1DEF81644B54AB7F969B88D65:1\n00D4F6E8FA6EECAD2A3AA415EEC418D38EC:2");
assert.strictEqual(a.countInRange(a.compactRange(raw), "ABCDE00D4F6E8FA6EECAD2A3AA415EEC418D38EC"), 2);
assert.strictEqual(a.countInRange(a.compactRange(raw), "ABCDE11111111111111111111111111111111111"), 0);

// Range cache: one fetch per prefix inside the TTL, outage answers ok:false and is not cached.
(async () => {
  let calls = 0;
  let down = false;
  let t = 0;
  const cache = a.createRangeCache({
    now: () => t,
    ttlMs: 1000,
    fetchImpl: async () => {
      calls += 1;
      if (down) throw new Error("offline");
      return { ok: true, text: async () => "0018A45C4D1DEF81644B54AB7F969B88D65:5" };
    },
  });
  const [x, y] = await Promise.all([cache.get("abcde"), cache.get("ABCDE")]);
  assert.ok(x.ok && y.ok && calls === 1, "concurrent lookups share one fetch");
  assert.strictEqual((await cache.get("ABCDE")).cached, true);
  t = 2000;
  down = true;
  const miss = await cache.get("ABCDE");
  assert.strictEqual(miss.ok, false, "expired + offline: not ok");
  assert.strictEqual((await cache.get("nope")).invalid, true);

  // Email holder pick (sign-in by email)
  const now = Date.parse("2026-11-27T12:00:00Z");
  assert.strictEqual(a.pickEmailHolder([{ id: "a", email_confirmed_at: null, created_at: "2026-11-27T10:00:00Z" }, { id: "b", email_confirmed_at: "2026-10-01T00:00:00Z" }], { now }).id, "b");
  assert.strictEqual(a.pickEmailHolder([{ id: "a", email_confirmed_at: null, created_at: "2026-11-27T10:00:00Z" }], { now }).id, "a");
  assert.strictEqual(a.pickEmailHolder([{ id: "a", email_confirmed_at: null, created_at: "2026-11-20T10:00:00Z" }], { now }), null);

  // Ideas
  assert.deepStrictEqual(a.cleanIdeas(["@demirkaya", "DemirKaya", "", "dkaya", null, "x".repeat(25)]), ["demirkaya", "dkaya"]);
  assert.strictEqual(a.cleanIdeas(Array.from({ length: 20 }, (_, i) => `n${i}`)).length, a.IDEAS_MAX);

  // Card context
  assert.strictEqual(a.cardContext({}), null);
  assert.deepStrictEqual(a.cardContext({ card: { surface: "IOS", breachWarned: true, fixedVia: "suggested" } }), { surface: "ios", breachWarned: true, fixedVia: "suggested" });
  assert.deepStrictEqual(a.cardContext({ card: { surface: "evil", breachWarned: "yes", fixedVia: "suggested" } }), { surface: "app", breachWarned: false, fixedVia: null });

  // Snippets: only allow-listed fields, busiest first, ended events skipped.
  const page = (slug, online, voice, extra = {}) => ({
    slug,
    name: `Sunucu ${slug}`,
    url: `https://descall.com/s/${slug}`,
    iconUrl: null,
    counts: { members: 100, online, voice },
    channels: { text: [{ id: "t", name: "genel" }], voice: [{ id: "v1", name: "Sohbet odası", count: voice }, { id: "v2", name: "Boş", count: 0 }] },
    events: [],
    pin: "  Hoş   geldin! ",
    description: "never shown",
    qrSvg: "<svg/>",
    ...extra,
  });
  const s1 = a.snippetFromPage(page("gece", 23, 5, { events: [{ title: "İzleme partisi", startsAt: "2026-11-27T18:00:00Z", endsAt: null }] }), { now });
  assert.deepStrictEqual(Object.keys(s1).sort(), ["category", "event", "iconUrl", "inVoice", "members", "name", "online", "pin", "slug", "url", "voice"].sort());
  assert.deepStrictEqual(s1.voice, { name: "Sohbet odası", count: 5 });
  assert.strictEqual(s1.pin, "Hoş geldin!");
  assert.strictEqual(s1.event.title, "İzleme partisi");
  const ended = a.snippetFromPage(page("x", 1, 0, { events: [{ title: "Eski", startsAt: "2026-11-20T18:00:00Z", endsAt: "2026-11-20T19:00:00Z" }] }), { now });
  assert.strictEqual(ended.event, null);
  assert.strictEqual(ended.voice, null);
  const hiddenCounts = a.snippetFromPage({ ...page("h", 5, 1), counts: null }, { now });
  assert.strictEqual(hiddenCounts.online, null, "a page that hides its counts shows none");
  const ranked = a.rankSnippets([a.snippetFromPage(page("a", 2, 0), { now }), s1, a.snippetFromPage(page("b", 9, 1), { now }), null]);
  assert.deepStrictEqual(ranked.map((x) => x.slug), ["gece", "b", "a"]);
  assert.strictEqual(a.snippetFromPage(null), null);

  assert.deepStrictEqual(a.topCountries([{ signup_country: "TR" }, { signup_country: "br" }, { signup_country: "TR" }, { signup_country: "US" }, { signup_country: "XXX" }, { signup_country: "DE" }]), ["TR", "BR", "DE"]);

  // Kayıt İstatistikleri: the card breakdown.
  const inRange = (d) => d && d >= "2026-11-20" && d <= "2026-11-27";
  const ev = [
    { event: "identifier_routed", occurred_at: "2026-11-26T10:00:00Z" },
    { event: "identifier_routed", occurred_at: "2026-10-01T10:00:00Z" },
    { event: "breach_warned_inline", occurred_at: "2026-11-26T10:00:00Z" },
    { event: "breach_warned_inline", occurred_at: "2026-11-26T11:00:00Z" },
    { event: "breach_warned_inline", occurred_at: "2026-11-26T12:00:00Z" },
    { event: "breach_warned_inline", occurred_at: "2026-11-26T13:00:00Z" },
    { event: "breach_fixed", occurred_at: "2026-11-26T10:05:00Z", props: { method: "suggested" } },
    { event: "breach_fixed", occurred_at: "2026-11-26T11:05:00Z", props: { method: "passkey" } },
    { event: "breach_fixed", occurred_at: "2026-11-26T11:05:00Z", props: { method: "weird" } },
  ];
  const at = [
    { created_at: "2026-11-26T10:00:00Z", status: "completed", flow: "card" },
    { created_at: "2026-11-26T10:00:00Z", status: "failed", reason: "conflict", reason_detail: "email_taken", flow: "card" },
    { created_at: "2026-11-26T10:00:00Z", status: "failed", reason: "validation", reason_detail: "password_breached", flow: "classic" },
    { created_at: "2026-11-26T10:00:00Z", status: "completed" },
  ];
  const b = ss.adaptiveCardBreakdown(ev, at, inRange);
  assert.strictEqual(b.routed, 1);
  assert.strictEqual(b.warned, 4);
  assert.strictEqual(b.fixed, 3);
  assert.strictEqual(b.fixedPct, 75);
  assert.deepStrictEqual(b.byVia, { suggested: 1, own: 0, passkey: 1 });
  assert.strictEqual(b.emailTaken, 1);
  assert.strictEqual(b.breached, 1);
  assert.deepStrictEqual(b.flows.card, { completed: 1, failed: 1, completedPct: 50 });
  assert.deepStrictEqual(b.flows.classic, { completed: 0, failed: 1, completedPct: 0 });
  assert.strictEqual(ss.adaptiveCardBreakdown([], [{ created_at: "2026-11-26T10:00:00Z", status: "completed" }], inRange).flows, null, "no flow column yet: no flows block");
  const range = ss.resolveRange({ from: "2026-11-20", to: "2026-11-27" }, new Date("2026-11-27T12:00:00Z"));
  const stats = ss.computeSignupStats({ users: [], cardEvents: ev, attempts: at, range, now: new Date("2026-11-27T12:00:00Z") });
  assert.strictEqual(stats.adaptiveCard.routed, 1);
  assert.strictEqual(ss.computeSignupStats({ users: [], range, now: new Date("2026-11-27T12:00:00Z") }).adaptiveCard, null, "older callers: null");
  assert.ok(path.basename(__filename));
  console.log("adaptiveSignup.selftest: ok");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
