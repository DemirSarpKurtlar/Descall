"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildSignupSubject,
  buildSignupReport,
  shortUa,
  journeyLength,
  isDisposableDomain,
  istanbulDayStartIso,
  loadSignupContext,
} = require("./signupReport");

const EMOJI = /\p{Extended_Pictographic}/u;

test("subject leads with the handle, then method, country and today's number", () => {
  assert.equal(
    buildSignupSubject({ username: "demir", email: "a@b.com", method: "google", country: "tr", ordinal: 4 }),
    "Yeni üye: @demir · Google · TR · bugün 4."
  );
  assert.equal(buildSignupSubject({ email: "a@b.com" }), "Yeni üye: a@b.com");
  assert.equal(buildSignupSubject({}), "Yeni üye: yeni hesap");
});

test("report has the person, grouped Turkish sections and a plain-text twin", () => {
  const { subject, text, html } = buildSignupReport({
    user: { id: "u1", username: "demo", email: "d@e.com", display_name: "Demo Kişi" },
    method: "google",
    req: { headers: { "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS) Safari/605", "accept-language": "tr-TR,tr;q=0.9" }, ip: "1.2.3.4" },
    verified: true,
    context: { todayCount: 7, totalUsers: 1294 },
  });
  assert.match(subject, /@demo/);
  assert.match(subject, /bugün 7\./);
  for (const part of ["KİMLİK", "NEREDEN GELDİ", "CİHAZ VE KONUM", "GÜVENLİK SİNYALLERİ"]) assert.ok(text.includes(part), part);
  assert.match(text, /Hesap kimliği: u1/);
  assert.match(text, /Kayıt yöntemi: Google/);
  assert.match(text, /Cihaz: Telefon · iOS · Safari/);
  assert.match(text, /IP adresi: 1\.2\.3\.4/);
  assert.match(text, /Bugünkü 7\. kayıt · toplam 1294 üye/);
  assert.match(html, /Demo Kişi/);
  assert.match(html, /1\.294/);
  assert.match(html, /Yönetici Paneli&#39;nde aç|Yönetici Paneli'nde aç/);
  assert.match(html, /display:none;max-height:0/);
  assert.doesNotMatch(text, /Acquisition|Signup Conversion|First Touch|Unknown/);
  assert.equal(EMOJI.test(html) || EMOJI.test(text) || EMOJI.test(subject), false, "no emoji");
  assert.match(shortUa("Mozilla/5.0 (iPhone) Safari"), /Mobil/);
});

test("Discord visitor signing in with Google keeps source and method apart", () => {
  const { text } = buildSignupReport({
    user: { id: "u2", username: "maya", email: "m@e.com" },
    method: "google",
    verified: true,
    attribution: {
      first_touch_source: "discord",
      first_touch_medium: "referral",
      last_touch_source: "discord",
      first_touch_referrer: "https://discord.com/channels/1",
      first_touch_landing_page: "https://descall.com/",
      first_touch_at: "2026-08-01T11:40:00.000Z",
      auth_method: "google",
      signup_at: "2026-08-01T12:00:00.000Z",
    },
  });
  assert.match(text, /Kayıt yöntemi: Google/);
  assert.match(text, /İlk geldiği yer: Discord/);
  assert.match(text, /Yönlendiren sayfa: discord\.com\/channels\/1/);
  assert.match(text, /Kayıt olana kadar: 20 dk/);
  assert.doesNotMatch(text, /Kayıttan önce son/);
  assert.doesNotMatch(text, /Google Ads/);
});

test("Google Ads click + email sign-up", () => {
  const { text } = buildSignupReport({
    user: { email: "ads@e.com", username: "adsuser" },
    method: "email_password",
    attribution: {
      first_touch_source: "google_ads",
      first_touch_medium: "cpc",
      first_touch_campaign: "brand",
      last_touch_source: "direct",
      first_touch_gclid: "abc",
      auth_method: "email",
      signup_at: "2026-08-01T12:00:00.000Z",
    },
  });
  assert.match(text, /Kayıt yöntemi: E-posta ve şifre/);
  assert.match(text, /İlk geldiği yer: Google Ads reklamı/);
  assert.match(text, /Kayıttan önce son: Doğrudan giriş/);
  assert.match(text, /Kampanya: brand/);
  assert.match(text, /Google Ads tıklaması: Var/);
  assert.match(text, /E-posta henüz doğrulanmadı/);
});

test("Apple sign-up is labelled Apple", () => {
  const { subject, text } = buildSignupReport({ user: { username: "ap", email: "x@privaterelay.appleid.com" }, method: "apple", verified: true });
  assert.match(subject, /· Apple/);
  assert.match(text, /Kayıt yöntemi: Apple/);
});

test("untrusted strings are escaped", () => {
  const { html } = buildSignupReport({
    user: { email: "x@y.com", username: "x", display_name: "<script>alert(1)</script>" },
    method: "google",
    attribution: { first_touch_source: "<img src=x onerror=alert(1)>", first_touch_campaign: "<b>hack</b>" },
  });
  assert.equal(html.includes("<img src=x"), false);
  assert.equal(html.includes("<b>hack"), false);
  assert.equal(html.includes("<script>alert"), false);
  assert.match(html, /&lt;img/);
});

test("place comes from request geo; no geo is Bilinmiyor, never a fake Istanbul", () => {
  const berlin = buildSignupReport({
    user: { email: "de@e.com", username: "berlin" },
    method: "google",
    req: { headers: { "user-agent": "Mozilla/5.0 Chrome", "x-vercel-ip-country": "DE", "x-vercel-ip-city": "Berlin" } },
    attribution: { signup_country: "DE", signup_at: "2026-08-26T12:00:00.000Z" },
  });
  assert.match(berlin.text, /Konum: Berlin, DE/);
  assert.match(berlin.text, /Kayıt saati:.*\(Türkiye saati\)/);
  assert.match(berlin.subject, /· DE/);
  const none = buildSignupReport({ user: { email: "x@y.com", username: "x" }, method: "email_password", attribution: {} });
  assert.match(none.text, /Konum: Bilinmiyor/);
  assert.doesNotMatch(none.text, /Konum:.*(Istanbul|Türkiye)/);
});

test("risk signals: disposable domain, shared browser, same IP", () => {
  const bad = buildSignupReport({
    user: { id: "u9", email: "a@mailinator.com", username: "spam" },
    method: "email_password",
    context: { sameIpCount: 4, sameDeviceCount: 2 },
  });
  assert.match(bad.text, /Geçici e-posta servisi \(mailinator\.com\)/);
  assert.match(bad.text, /Aynı tarayıcıdan 2 hesap daha var/);
  assert.match(bad.text, /aynı IP'den 4 kayıt daha/);
  assert.equal(bad.model.risk, "bad");
  assert.match(bad.model.preheader, /Kontrol et/);
  const ok = buildSignupReport({ user: { email: "a@gmail.com", username: "ok" }, method: "google", verified: true, invitedBy: "demir" });
  assert.equal(ok.model.risk, "ok");
  assert.match(ok.text, /@demir davet etti/);
  assert.match(ok.text, /Davet eden: @demir/);
});

test("helpers", () => {
  assert.equal(isDisposableDomain("yopmail.com"), true);
  assert.equal(isDisposableDomain("x.yopmail.com"), true);
  assert.equal(isDisposableDomain("gmail.com"), false);
  assert.equal(journeyLength("2026-01-01T10:00:00Z", "2026-01-01T10:00:20Z"), "1 dakikadan kısa");
  assert.equal(journeyLength("2026-01-01T10:00:00Z", "2026-01-01T12:05:00Z"), "2 sa 5 dk");
  assert.equal(journeyLength("2026-01-01T10:00:00Z", "2026-01-05T10:00:00Z"), "4 gün");
  assert.equal(journeyLength(null, "2026-01-01T10:00:00Z"), "");
  // 22:30 UTC on Oct 31 is already Nov 1 in Istanbul.
  assert.equal(istanbulDayStartIso(new Date("2026-10-31T22:30:00Z")), "2026-10-31T21:00:00.000Z");
  assert.equal(istanbulDayStartIso(new Date("2026-10-31T09:00:00Z")), "2026-10-30T21:00:00.000Z");
});

test("loadSignupContext counts and never throws", async () => {
  const rows = [
    { id: "me", active_sessions: [{ ip: "9.9.9.9" }] },
    { id: "a", active_sessions: [{ ip: "9.9.9.9" }] },
    { id: "b", active_sessions: [{ ip: "8.8.8.8" }] },
  ];
  const fake = {
    from() {
      const q = { filters: [], head: false };
      const api = {
        select(_cols, opts) {
          q.head = Boolean(opts?.head);
          return api;
        },
        gte() {
          q.filters.push("gte");
          return api;
        },
        eq() {
          q.filters.push("eq");
          return api;
        },
        neq() {
          return api;
        },
        limit() {
          return Promise.resolve({ data: rows, error: null });
        },
        then(resolve) {
          const c = q.filters.includes("eq") ? 1 : q.filters.includes("gte") ? 5 : 1300;
          resolve({ count: c, error: null });
        },
      };
      return api;
    },
  };
  const ctx = await loadSignupContext({ userId: "me", ip: "9.9.9.9", visitorKey: "vk" }, { supabase: fake });
  assert.deepEqual(ctx, { todayCount: 5, totalUsers: 1300, sameIpCount: 1, sameDeviceCount: 1 });
  const broken = { from() { throw new Error("db down"); } };
  assert.deepEqual(await loadSignupContext({ userId: "me" }, { supabase: broken }), {});
});
