"use strict";

/**
 * Descall+ 2.0 pure rules: offer config (validation, merge, selling per platform, prices, VAT),
 * server levels and limits (screen ceiling only where selling is on), the paywall budget, animated
 * image detection and the gate, provider signature checks, event normalisation, the screen guard.
 */

process.env.NODE_ENV = "test";
const assert = require("assert");
const crypto = require("crypto");

const config = require("../lib/plus/config");
const limits = require("../lib/plus/limits");
const paywall = require("../lib/plus/paywall");
const animated = require("../lib/plus/animatedProfile");
const paddle = require("../lib/plus/payments/paddle");
const iyzico = require("../lib/plus/payments/iyzico");
const revenuecat = require("../lib/plus/payments/revenuecat");
const products = require("../lib/plus/payments/products");
const providers = require("../lib/plus/payments");
const screenGuard = require("../lib/plus/screenGuard");
const { reqId } = require("../lib/plus/payments/fulfil");

let passed = 0;
function t(name, fn) {
  try {
    fn();
    passed += 1;
  } catch (err) {
    console.error(`FAIL ${name}`);
    throw err;
  }
}

/* ---------------- config ---------------- */

t("defaults: selling off everywhere, draft prices", () => {
  const c = config.merge({});
  for (const p of config.PLATFORMS) assert.equal(config.salesOn(c, p), false);
  assert.equal(config.priceFor(c, "plus_monthly", "web"), 6999);
  assert.equal(config.priceFor(c, "plus_monthly", "desktop"), 6999);
  assert.equal(config.priceFor(c, "plus_monthly", "ios"), 7499);
  assert.equal(config.priceFor(c, "ultra_monthly", "web"), 13999);
  assert.equal(config.priceFor(c, "ultra_monthly", "android"), 14999);
  assert.equal(config.priceFor(c, "plus_yearly", "web"), 59999);
  assert.equal(config.priceFor(c, "plus_yearly", "ios"), 64999);
  assert.equal(config.priceFor(c, "gift_plus_3", "web"), 19999);
  assert.equal(config.priceFor(c, "gift_plus_3", "ios"), 21499);
  assert.equal(config.priceFor(c, "gift_plus_12", "ios"), 64999);
  assert.equal(c.trial.days, 3);
  assert.equal(c.tickets.perMonth, 2);
  assert.deepEqual(c.levels.map((l) => l.boosts), [2, 5, 10]);
  assert.equal(c.tiers.free.screenHeight, 1080);
  assert.equal(c.tiers.free.screenFps, 30);
  assert.equal(c.tiers.plus.screenHeight, 1440);
  assert.equal(c.tiers.plus.screenFps, 60);
});

t("validatePatch refuses unknown keys and bad values, keeps good ones", () => {
  assert.throws(() => config.validatePatch({ nope: 1 }), /unknown_key/);
  assert.throws(() => config.validatePatch({ sales: { web: "yes" } }), (e) => e.path === "sales.web");
  assert.throws(() => config.validatePatch({ prices: { plus_monthly: { web: -1 } } }), (e) => e.path === "prices.plus_monthly.web");
  assert.throws(() => config.validatePatch({ tiers: { free: { boosts: 2 } } }), (e) => e.path === "tiers.free.boosts");
  assert.throws(() => config.validatePatch({ levels: [{ boosts: 5 }, { boosts: 3 }, { boosts: 10 }] }), (e) => e.path === "levels.1.boosts");
  assert.throws(() => config.validatePatch({ products: { apple: { plus_monthly: "bad id with spaces" } } }));
  const ok = config.validatePatch({ sales: { ios: true }, prices: { plus_monthly: { mobile: 7999 } }, tiers: { free: { screenHeight: 720 } } });
  assert.deepEqual(ok, { sales: { ios: true }, prices: { plus_monthly: { mobile: 7999 } }, tiers: { free: { screenHeight: 720 } } });
});

t("merge drops a bad stored key and keeps the rest", () => {
  const c = config.merge({ sales: { web: true }, prices: { plus_monthly: { web: "x" } } });
  assert.equal(c.sales.web, true);
  assert.equal(c.prices.plus_monthly.web, 6999);
});

t("pilots see selling on; per-platform switches are independent", () => {
  const pilot = "11111111-1111-4111-8111-111111111111";
  const c = config.merge({ sales: { ios: true }, pilotUserIds: [pilot] });
  assert.equal(config.salesOn(c, "ios"), true);
  assert.equal(config.salesOn(c, "web"), false);
  assert.equal(config.salesOn(c, "web", pilot), true);
  assert.equal(config.featureOn(c, "gifts", "android"), false);
  assert.equal(config.normalizePlatform("electron"), "desktop");
  assert.equal(config.normalizePlatform("tauri"), "desktop");
  assert.equal(config.normalizePlatform(""), "web");
});

t("publicOffer hides prices while selling is off", () => {
  const off = config.publicOffer(config.merge({}), "web");
  assert.equal(off.salesOn, false);
  assert.equal(off.prices, null);
  assert.equal(off.features.gifts, false);
  const on = config.publicOffer(config.merge({ sales: { web: true } }), "web");
  assert.equal(on.prices.plus_monthly, 6999);
  assert.equal(on.provider, "iyzico");
  assert.equal(config.publicOffer(config.merge({ sales: { ios: true } }), "ios").provider, "apple");
});

t("VAT share of a VAT-included price", () => {
  assert.equal(config.vatOf(19999, 20), 3333);
  assert.equal(config.vatOf(6999, 20), 1167);
});

t("changedPaths lists nested paths", () => {
  const a = config.merge({});
  const b = config.merge({ prices: { gift_plus_3: { web: 20999 } }, sales: { web: true } });
  assert.deepEqual(config.changedPaths(a, b).sort(), ["prices.gift_plus_3.web", "sales.web"]);
});

/* ---------------- levels and limits ---------------- */

t("levels and progress", () => {
  const lv = config.DEFAULTS.levels;
  assert.equal(limits.levelFor(0, lv), 0);
  assert.equal(limits.levelFor(2, lv), 1);
  assert.equal(limits.levelFor(6, lv), 2);
  assert.equal(limits.levelFor(10, lv), 3);
  const p = limits.progressFor(6, lv);
  assert.deepEqual(p.next, { level: 3, boosts: 10, missing: 4 });
  assert.equal(limits.progressFor(12, lv).next, null);
  assert.equal(limits.levelPerks(2, lv).uploadMb, 250);
  assert.equal(limits.levelPerks(1, lv).screenFps, 60);
});

t("no downgrade while selling is off: everyone keeps 1440p 60", () => {
  const c = config.merge({});
  const free = limits.limitsFor({ cfg: c, plan: null, platform: "web" });
  assert.equal(free.active, false);
  assert.equal(free.screen.height, 1440);
  assert.equal(free.screen.fps, 60);
  assert.equal(free.screen.locked, false);
});

t("selling on: free 1080p 30, Descall+ 1440p 60, server level 1 lifts fps", () => {
  const c = config.merge({ sales: { web: true } });
  const free = limits.limitsFor({ cfg: c, plan: null, platform: "web" });
  assert.equal(free.active, true);
  assert.equal(free.screen.height, 1080);
  assert.equal(free.screen.fps, 30);
  assert.equal(free.screen.locked, true);
  const plus = limits.limitsFor({ cfg: c, plan: "plus", platform: "web" });
  assert.equal(plus.screen.height, 1440);
  assert.equal(plus.screen.fps, 60);
  assert.equal(plus.screen.locked, false);
  const lv1 = limits.limitsFor({ cfg: c, plan: null, serverLevel: 1, platform: "web" });
  assert.equal(lv1.screen.fps, 60);
  assert.equal(lv1.screen.height, 1080);
  const lv3 = limits.limitsFor({ cfg: c, plan: null, serverLevel: 3, platform: "web" });
  assert.equal(lv3.screen.height, 1440);
  // another platform where selling is still off keeps today's quality
  assert.equal(limits.limitsFor({ cfg: c, plan: null, platform: "ios" }).screen.height, 1440);
  // admin settings move the free tier
  const c2 = config.merge({ sales: { web: true }, tiers: { free: { screenHeight: 720, screenFps: 30 } } });
  assert.equal(limits.limitsFor({ cfg: c2, plan: null, platform: "web" }).screen.height, 720);
  // uploads never exceed the hard cap of the current upload path
  assert.equal(plus.uploadMb, limits.HARD_UPLOAD_MB);
});

t("exceedsCeiling with tolerance", () => {
  assert.equal(limits.exceedsCeiling({ width: 2560, height: 1440 }, { height: 1080 }), true);
  assert.equal(limits.exceedsCeiling({ width: 1920, height: 1080 }, { height: 1080 }), false);
  assert.equal(limits.exceedsCeiling({ width: 1170, height: 2532 }, { height: 1080 }), false);
});

/* ---------------- paywall budget ---------------- */

const DAY = 86400000;
const NOW = Date.parse("2026-11-27T12:00:00Z");
const cfgOn = config.merge({ sales: { web: true } });
const old = new Date(NOW - 10 * DAY).toISOString();

t("paywall: off while selling is off", () => {
  assert.equal(paywall.decide({ moment: "gif_upload", cfg: config.merge({}), platform: "web", now: NOW }).show, "none");
});

t("paywall: a tap is always answered, full once a day then compact", () => {
  assert.equal(paywall.decide({ moment: "gif_upload", cfg: cfgOn, accountCreatedAt: old, now: NOW }).show, "full");
  const recent = [{ moment: "gif_upload", action: "shown", created_at: new Date(NOW - 3600000).toISOString() }];
  assert.equal(paywall.decide({ moment: "gif_upload", cfg: cfgOn, recent, accountCreatedAt: old, now: NOW }).show, "compact");
  const yesterday = [{ moment: "gif_upload", action: "shown", created_at: new Date(NOW - 25 * 3600000).toISOString() }];
  assert.equal(paywall.decide({ moment: "gif_upload", cfg: cfgOn, recent: yesterday, accountCreatedAt: old, now: NOW }).show, "full");
});

t("paywall: suggested moments obey 48 h and 1 a day", () => {
  assert.equal(paywall.decide({ moment: "profile_card", cfg: cfgOn, accountCreatedAt: new Date(NOW - 3600000).toISOString(), now: NOW }).reason, "new_account");
  assert.equal(paywall.decide({ moment: "profile_card", cfg: cfgOn, accountCreatedAt: old, now: NOW }).show, "full");
  const other = [{ moment: "profile_card", action: "shown", created_at: new Date(NOW - 7200000).toISOString() }];
  assert.equal(paywall.decide({ moment: "profile_card", cfg: cfgOn, recent: other, accountCreatedAt: old, now: NOW }).show, "none");
});

t("paywall: once moments and members", () => {
  const seen = [{ moment: "profile_gif_note", action: "shown", created_at: new Date(NOW - 30 * DAY).toISOString() }];
  assert.equal(paywall.decide({ moment: "profile_gif_note", cfg: cfgOn, recent: seen, now: NOW }).reason, "once");
  assert.equal(paywall.decide({ moment: "gif_upload", cfg: cfgOn, plan: "plus", now: NOW }).show, "none");
  assert.equal(paywall.decide({ moment: "boost_badge", cfg: cfgOn, plan: "plus", now: NOW }).show, "full");
  assert.equal(paywall.MOMENTS.filter((m) => m.n >= 1).length, 12);
});

t("gift ask: once a week, recipient can turn it off", () => {
  assert.equal(paywall.canAsk({ asks: [], cfg: cfgOn, now: NOW }).ok, true);
  const v = paywall.canAsk({ asks: [{ created_at: new Date(NOW - 2 * DAY).toISOString() }], cfg: cfgOn, now: NOW });
  assert.equal(v.ok, false);
  assert.equal(v.reason, "weekly_limit");
  assert.equal(paywall.canAsk({ asks: [], cfg: cfgOn, now: NOW, recipientOptedOut: true }).reason, "recipient_off");
});

t("paywall meta is cleaned", () => {
  assert.deepEqual(paywall.cleanMeta({ a: "x".repeat(200), "bad key": 1, n: 2, o: { x: 1 } }), { a: "x".repeat(80), n: 2 });
});

/* ---------------- animated images ---------------- */

function gif(frames) {
  const parts = [Buffer.from("GIF89a"), Buffer.from([1, 0, 1, 0, 0x00, 0, 0])];
  for (let i = 0; i < frames; i += 1) {
    parts.push(Buffer.from([0x21, 0xf9, 0x04, 0x00, 0x0a, 0x00, 0x00, 0x00])); // graphic control
    parts.push(Buffer.from([0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0x00, 0x02, 0x02, 0x44, 0x01, 0x00]));
  }
  parts.push(Buffer.from([0x3b]));
  return Buffer.concat(parts);
}

t("GIF frame counting", () => {
  assert.equal(animated.gifFrameCount(gif(1)), 1);
  assert.equal(animated.gifFrameCount(gif(3)), 2); // stops at 2
  assert.equal(animated.isAnimatedImage(gif(1)), false);
  assert.equal(animated.isAnimatedImage(gif(2)), true);
  assert.equal(animated.isAnimatedImage(Buffer.from("not an image at all")), false);
  const webp = Buffer.alloc(32);
  webp.write("RIFF", 0); webp.write("WEBP", 8); webp.write("VP8X", 12); webp[20] = 0x02;
  assert.equal(animated.isAnimatedImage(webp), true);
  assert.equal(animated.looksAnimatedUrl("https://x/banners/a.GIF?v=1"), true);
  assert.equal(animated.looksAnimatedUrl("https://x/banners/a.png"), false);
});

t("animated gate: off while selling is off, members pass, free refused", () => {
  assert.equal(animated.decide({ cfg: config.merge({}), animated: true, plan: null }).allowed, true);
  assert.equal(animated.decide({ cfg: cfgOn, animated: true, plan: "plus" }).allowed, true);
  assert.equal(animated.decide({ cfg: cfgOn, animated: false, plan: null }).allowed, true);
  const no = animated.decide({ cfg: cfgOn, animated: true, plan: null, kind: "banner" });
  assert.equal(no.allowed, false);
  assert.equal(no.code, "ANIMATED_PROFILE_PLUS");
  assert.equal(animated.decide({ cfg: config.merge({ sales: { web: true }, features: { animatedGate: false } }), animated: true, plan: null }).allowed, true);
  assert.equal(animated.platformOf({ headers: { "x-descall-platform": "ios" } }), "ios");
});

/* ---------------- providers ---------------- */

t("paddle signature: valid, wrong, stale", () => {
  const body = JSON.stringify({ event_id: "evt_1" });
  const now = Date.now();
  const header = paddle.sign(body, "fake-secret", Math.floor(now / 1000));
  assert.equal(paddle.verify(Buffer.from(body), header, "fake-secret", { now }), true);
  assert.throws(() => paddle.verify(Buffer.from(body + " "), header, "fake-secret", { now }), (e) => e.code === "bad_signature");
  assert.throws(() => paddle.verify(Buffer.from(body), header, "other", { now }), (e) => e.code === "bad_signature");
  assert.throws(() => paddle.verify(Buffer.from(body), header, "fake-secret", { now: now + 3600 * 1000 }), (e) => e.code === "stale_signature");
  assert.throws(() => paddle.verify(Buffer.from(body), "", "fake-secret", { now }), (e) => e.code === "bad_signature");
  assert.throws(() => paddle.verify(Buffer.from(body), header, "", { now }), (e) => e.code === "not_configured");
});

t("paddle normalisation", () => {
  const cfg = config.merge({ products: { paddle: { plus_monthly: "pri_plus_m" } } });
  const ck = "22222222-2222-4222-8222-222222222222";
  const ev = paddle.normalize({ event_id: "e1", event_type: "transaction.completed", data: { id: "txn_1", origin: "web", custom_data: { checkout_id: ck }, items: [{ price: { id: "pri_plus_m" } }], details: { totals: { total: "6999" } }, currency_code: "TRY", subscription_id: "sub_1", billing_period: { ends_at: "2026-12-27T00:00:00Z" } } }, cfg);
  assert.equal(ev.type, "purchase");
  assert.equal(ev.checkoutId, ck);
  assert.equal(ev.productKey, "plus_monthly");
  assert.equal(ev.amountMinor, 6999);
  assert.equal(paddle.normalize({ event_type: "transaction.completed", data: { origin: "subscription_recurring", items: [] } }, cfg).type, "renewal");
  assert.equal(paddle.normalize({ event_type: "subscription.updated", data: { scheduled_change: { action: "cancel" } } }, cfg).type, "cancel_at_end");
  assert.equal(paddle.normalize({ event_type: "adjustment.created", data: { action: "refund", status: "approved", transaction_id: "txn_1" } }, cfg).type, "refund");
});

t("iyzico IYZWSv2 auth header and V3 webhook signature", () => {
  const h = iyzico.authHeaders({ apiKey: "k", secretKey: "s", uriPath: "/payment/test", body: { a: 1 }, rnd: "123" });
  const sig = crypto.createHmac("sha256", "s").update("123/payment/test{\"a\":1}").digest("hex");
  assert.equal(h.Authorization, `IYZWSv2 ${Buffer.from(`apiKey:k&randomKey:123&signature:${sig}`).toString("base64")}`);
  const env = { IYZICO_SECRET_KEY: "sk", IYZICO_MERCHANT_ID: "m1", IYZICO_API_KEY: "ak" };
  const body = { iyziEventType: "subscription.order.success", subscriptionReferenceCode: "S1", orderReferenceCode: "O1", customerReferenceCode: "C1" };
  const good = iyzico.sign(body, { secretKey: "sk", merchantId: "m1" });
  assert.equal(iyzico.verify(body, good, { env }), true);
  assert.throws(() => iyzico.verify({ ...body, orderReferenceCode: "O2" }, good, { env }), (e) => e.code === "bad_signature");
  assert.equal(iyzico.normalize(body).type, "renewal");
  assert.deepEqual(iyzico.splitName("Demir Yılmaz"), { name: "Demir", surname: "Yılmaz" });
});

t("revenuecat auth and normalisation", () => {
  const env = { REVENUECAT_WEBHOOK_AUTH: "Bearer fake-rc" };
  assert.equal(revenuecat.verify("Bearer fake-rc", { env }), true);
  assert.throws(() => revenuecat.verify("Bearer no", { env }), (e) => e.code === "bad_signature");
  const cfg = config.merge({ products: { revenuecat: { gift_plus_3: "plus_gift_3m" } } });
  const ev = revenuecat.normalize({ event: { id: "r1", type: "NON_RENEWING_PURCHASE", app_user_id: "33333333-3333-4333-8333-333333333333", product_id: "plus_gift_3m", store: "APP_STORE", price_in_purchased_currency: 214.99 } }, cfg);
  assert.equal(ev.productKey, "gift_plus_3");
  assert.equal(ev.amountMinor, 21499);
  assert.equal(ev.platform, "ios");
  assert.equal(revenuecat.normalize({ event: { type: "CANCELLATION", cancel_reason: "CUSTOMER_SUPPORT" } }, cfg).type, "refund");
});

t("products and providers", () => {
  assert.deepEqual(products.parseKey("gift_ultra_12"), { key: "gift_ultra_12", kind: "gift", plan: "ultra", period: null, months: 12, days: 360 });
  assert.equal(products.parseKey("plus_weekly"), null);
  assert.equal(providers.providerFor(config.merge({}), "ios"), "apple");
  assert.equal(providers.providerFor(config.merge({ webProvider: "paddle" }), "desktop"), "paddle");
  const st = providers.statusAll({});
  assert.ok(st.every((p) => p.configured === false));
  assert.ok(st.find((p) => p.id === "google").notBuilt);
});

t("request ids are always valid for the SQL check", () => {
  assert.match(reqId("apple", "200000123456"), /^[A-Za-z0-9:_.-]{8,100}$/);
  assert.match(reqId("x"), /^[A-Za-z0-9:_.-]{8,100}$/);
  assert.match(reqId("paddle", "a b/c?".repeat(40)), /^[A-Za-z0-9:_.-]{8,100}$/);
});

t("screen guard judge", () => {
  const cfg = config.merge({ sales: { web: true } });
  assert.equal(screenGuard.judge({ track: { source: "SCREEN_SHARE", width: 2560, height: 1440 }, ceiling: { height: 1080 }, cfg }).action, "notify");
  assert.equal(screenGuard.judge({ track: { source: "SCREEN_SHARE", width: 1920, height: 1080 }, ceiling: { height: 1080 }, cfg }).action, "ok");
  assert.equal(screenGuard.judge({ track: { source: "CAMERA", width: 2560, height: 1440 }, ceiling: { height: 1080 }, cfg }).action, "ok");
  const mute = config.merge({ screenEnforce: { mute: true } });
  assert.equal(screenGuard.judge({ track: { source: "SCREEN_SHARE", width: 2560, height: 1440 }, ceiling: { height: 1080 }, cfg: mute }).action, "mute");
});

console.log(`plus unit: ${passed} passed`);
