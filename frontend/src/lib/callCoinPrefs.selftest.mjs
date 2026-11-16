// End-of-call DesCoin summary, client rules: setting + threshold (stored with Settings ›
// Görünüm and synced), show-once / device filter, view helpers, wallet grouping, the
// coinpop.* catalogs in all 7 languages (same keys, same placeholders, no emoji, no
// banned words) and the wiring (heartbeat, server voice, settings tab, host, shop focus).
// Run: node src/lib/callCoinPrefs.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  CALL_COIN_THRESHOLDS,
  DEFAULT_CALL_COIN_THRESHOLD,
  normalizeCallCoinPrefs,
  sanitizeCallCoinPatch,
  readCallCoinPrefs,
  writeCallCoinPrefs,
  callCoinSyncFields,
  passesThreshold,
  callContextKey,
  markCallContextSeen,
  wasInCallOnThisDevice,
  _resetDeviceCalls,
  claimSummary,
  decideCallCoinSummary,
  ringFractions,
  splitDuration,
  activeMinutes,
  countdownParts,
  absoluteAssetUrl,
  groupWalletEntries,
  requestShopFocus,
  takeShopFocus,
  peekShopFocus,
  handOffShopFocus,
} from "./callCoinPrefs.js";
import { normalizeAppearance, readAppearance } from "./appearancePrefs.js";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "..");
const read = (p) => readFileSync(join(src, p), "utf8");

function memStore(init = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m };
}

// ---- setting: defaults, sanitizing, storage next to the appearance
assert.deepEqual([...CALL_COIN_THRESHOLDS], [1, 5, 10, 25, 50]);
assert.equal(DEFAULT_CALL_COIN_THRESHOLD, 5);
assert.deepEqual(normalizeCallCoinPrefs({}), { enabled: true, threshold: 5 });
assert.deepEqual(normalizeCallCoinPrefs({ callCoinSummary: false, callCoinThreshold: 25 }), { enabled: false, threshold: 25 });
assert.deepEqual(normalizeCallCoinPrefs({ callCoinThreshold: 7 }), { enabled: true, threshold: 5 }, "off-list threshold falls back");
assert.deepEqual(sanitizeCallCoinPatch({ callCoinSummary: "no", callCoinThreshold: 3, x: 1 }), {});
assert.deepEqual(sanitizeCallCoinPatch({ callCoinSummary: false, callCoinThreshold: 50 }), { callCoinSummary: false, callCoinThreshold: 50 });
assert.deepEqual(callCoinSyncFields({ enabled: false, threshold: 10 }), { callCoinSummary: false, callCoinThreshold: 10 });

const store = memStore({ descall_user_settings: JSON.stringify({ themeMode: "light", accentColor: "#30B05A", msgSounds: false }) });
assert.deepEqual(readCallCoinPrefs(store), { enabled: true, threshold: 5 });
const next = writeCallCoinPrefs({ callCoinSummary: false, callCoinThreshold: 10, evil: 1 }, { storage: store, updatedAt: "2026-11-15T21:00:00.000Z" });
assert.deepEqual(next, { enabled: false, threshold: 10 });
const blob = JSON.parse(store.getItem("descall_user_settings"));
assert.equal(blob.callCoinSummary, false);
assert.equal(blob.callCoinThreshold, 10);
assert.equal(blob.msgSounds, false, "other settings survive");
assert.equal(blob.themeMode, "light", "appearance survives");
assert.equal(blob.appearanceUpdatedAt, "2026-11-15T21:00:00.000Z", "moves the sync clock");
assert.equal("evil" in blob, false);
assert.equal(store.getItem("descall_settings"), store.getItem("descall_user_settings"));
assert.equal(readAppearance(store).themeMode, "light");
assert.deepEqual(Object.keys(normalizeAppearance(blob)).sort(), ["accentColor", "fontStep", "reduceMotion", "reduceTransparency", "themeMode"]);

// ---- threshold
const sum = (earnedTotal, extra = {}) => ({ sessionId: `s-${earnedTotal}-${Math.random()}`, context: "dm", origin: "self", display: { id: "u-b" }, earnedTotal, ...extra });
assert.equal(passesThreshold(sum(4), { enabled: true, threshold: 5 }), false);
assert.equal(passesThreshold(sum(5), { enabled: true, threshold: 5 }), true);
assert.equal(passesThreshold(sum(42), { enabled: false, threshold: 1 }), false);
assert.equal(passesThreshold(sum(1), { enabled: true, threshold: 1 }), true);
assert.equal(passesThreshold(sum(0), { enabled: true, threshold: 1 }), false);
assert.equal(passesThreshold(sum(49), { callCoinThreshold: 50 }), false);
assert.equal(passesThreshold(sum(50), { callCoinThreshold: 50 }), true);

// ---- context keys + device filter
assert.equal(callContextKey({ context: "dm", peerId: "u-b" }), "dm:u-b");
assert.equal(callContextKey({ context: "server", channelId: "CH-1" }), "server:ch-1");
assert.equal(callContextKey({ context: "group", display: { id: "g1" } }), "group:g1");
assert.equal(callContextKey({ context: "x" }), null);
_resetDeviceCalls();
const t0 = 1_800_000_000_000;
assert.equal(wasInCallOnThisDevice({ context: "server", display: { id: "ch-1" } }, t0), false);
markCallContextSeen({ context: "server", channelId: "CH-1" }, t0);
assert.equal(wasInCallOnThisDevice({ context: "server", display: { id: "ch-1" } }, t0 + 60_000), true);
assert.equal(wasInCallOnThisDevice({ context: "server", display: { id: "ch-1" } }, t0 + 16 * 60_000), false, "15 min window");

// ---- decide: setting, threshold, device, once per session
const s2 = memStore();
const on = { enabled: true, threshold: 5 };
assert.deepEqual(decideCallCoinSummary(null, { prefs: on, storage: s2 }), { show: false, reason: "invalid" });
assert.deepEqual(decideCallCoinSummary({ sessionId: "x", context: "world", earnedTotal: 9 }, { prefs: on, storage: s2 }), { show: false, reason: "invalid" });
assert.equal(decideCallCoinSummary(sum(42), { prefs: { enabled: false, threshold: 5 }, storage: s2 }).reason, "off");
assert.equal(decideCallCoinSummary(sum(3), { prefs: on, storage: s2 }).reason, "threshold");
const fromServer = { ...sum(42), origin: "server", context: "group", display: { id: "g-77" } };
assert.equal(decideCallCoinSummary(fromServer, { prefs: on, storage: s2, now: t0 }).reason, "other-device");
markCallContextSeen({ context: "group", groupId: "g-77" }, t0);
assert.equal(decideCallCoinSummary(fromServer, { prefs: on, storage: s2, now: t0 + 1000 }).show, true, "device was in the call");
assert.equal(decideCallCoinSummary(fromServer, { prefs: on, storage: s2, now: t0 + 2000 }).reason, "duplicate", "once per session");
const self = sum(42);
assert.equal(decideCallCoinSummary(self, { prefs: on, storage: s2 }).show, true, "the device that left always shows");
assert.equal(claimSummary(self.sessionId, s2), false);
assert.equal(claimSummary("", s2), false);
// The seen list stays bounded.
for (let i = 0; i < 60; i += 1) claimSummary(`bulk-${i}`, s2);
assert.ok(JSON.parse(s2.getItem("descall:call-coin-seen")).length <= 40);

// ---- view helpers
assert.deepEqual(ringFractions({ todayBefore: 212, earnedTotal: 42, todayCap: 400 }), { before: 0.53, call: 0.105, rest: 1 - 0.53 - 0.105 });
assert.deepEqual(ringFractions({ todayBefore: 390, earnedTotal: 42, todayCap: 400 }).call, 1 - 0.975, "never past the cap");
assert.deepEqual(splitDuration(2292), { h: 0, m: 38, s: 12 });
assert.deepEqual(splitDuration(4320), { h: 1, m: 12, s: 0 });
assert.equal(activeMinutes(0), 0);
assert.equal(activeMinutes(20), 1);
assert.equal(activeMinutes(26 * 60), 26);
const end = new Date(t0 + (5 * 3600 + 12 * 60 + 44) * 1000).toISOString();
assert.equal(countdownParts(end, t0).clock, "05:12:44");
assert.equal(countdownParts(new Date(t0 + 2 * 86400e3 + 61e3).toISOString(), t0).d, 2);
assert.equal(countdownParts(new Date(t0 - 1).toISOString(), t0), null);
assert.equal(countdownParts(null, t0), null);
assert.equal(absoluteAssetUrl("/api/shop/asset/1", "https://api.example.com/"), "https://api.example.com/api/shop/asset/1");
assert.equal(absoluteAssetUrl("https://cdn/x.png", "https://api"), "https://cdn/x.png");
assert.equal(absoluteAssetUrl("javascript:alert(1)", "https://api"), null);

// ---- wallet grouping: one receipt per call
const rows = groupWalletEntries([
  { id: 9, amount: -600, reason: "shop_purchase", created_at: "2026-11-15T22:00:00Z", balance_after: 684 },
  { id: 8, amount: 2, reason: "screenshare_activity", meta: { callSession: "S1", receipt: "DC-7F3A", context: "dm" }, created_at: "2026-11-15T21:41:00Z", balance_after: 1284 },
  { id: 7, amount: 1, reason: "voice_activity", meta: { callSession: "S1", receipt: "DC-7F3A", context: "dm" }, created_at: "2026-11-15T21:40:00Z", balance_after: 1282 },
  { id: 6, amount: 1, reason: "voice_activity", meta: { callSession: "S1", receipt: "DC-7F3A", context: "dm" }, created_at: "2026-11-15T21:05:00Z", balance_after: 1281 },
  { id: 5, amount: 1, reason: "voice_activity", meta: { context: "dm" }, created_at: "2026-11-14T10:00:00Z", balance_after: 1200 },
  null,
]);
assert.equal(rows.length, 3);
assert.equal(rows[0].kind, "row");
assert.equal(rows[0].amount, -600);
assert.deepEqual(
  { kind: rows[1].kind, id: rows[1].id, receipt: rows[1].receipt, voice: rows[1].voice, screen: rows[1].screen, amount: rows[1].amount, at: rows[1].at, firstAt: rows[1].firstAt },
  { kind: "call", id: "S1", receipt: "DC-7F3A", voice: 2, screen: 2, amount: 4, at: "2026-11-15T21:41:00Z", firstAt: "2026-11-15T21:05:00Z" }
);
assert.equal(rows[2].kind, "row", "older rows without a session stay single");
// Market 2.0 rows (meta.shop2) get their own wallet label; plain shop rows keep the reason.
const s2rows = groupWalletEntries([
  { id: 3, amount: -420, reason: "shop_purchase", meta: { shop2: "gift", giftId: "g1" } },
  { id: 2, amount: 420, reason: "shop_refund", meta: { shop2: "gift_recall", giftId: "g1" } },
  { id: 1, amount: -150, reason: "shop_purchase", meta: { shop2: "refresh" } },
  { id: 0, amount: -300, reason: "shop_purchase", meta: { shop2: "item" } },
]);
assert.deepEqual(s2rows.map((r) => r.shop2), ["gift", "giftRecall", "refresh", null]);

// ---- shop focus deep link
requestShopFocus({ itemId: "it-1", buy: true });
assert.equal(peekShopFocus().itemId, "it-1");
assert.deepEqual({ ...takeShopFocus(), at: 0 }, { itemId: "it-1", buy: true, at: 0 });
assert.equal(takeShopFocus(), null, "taken once");
// Market 2.0 decides first; only a handed-off focus reaches the classic catalog.
requestShopFocus({ itemId: "it-2" });
assert.equal(peekShopFocus().classic, undefined, "a new focus is Market 2.0's");
handOffShopFocus();
assert.equal(peekShopFocus().classic, true, "handed to the classic catalog");
assert.equal(takeShopFocus().itemId, "it-2");

// ---- locales: the 7 live languages, same keys, same placeholders, natural Turkish, no emoji
const locales = ["tr", "en", "de", "es", "fr", "pt-BR", "ru"];
const flat = (o, p = "") => Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? flat(v, `${p}${k}.`) : [[`${p}${k}`, v]]));
const cats = {};
for (const id of locales) {
  const mod = await import(pathToFileURL(join(src, "i18n/locales", `coinpop.${id}.js`)).href);
  const name = `COINPOP_${id.replace("-", "_").toUpperCase()}`;
  assert.ok(mod[name], `${id}: export ${name}`);
  cats[id] = Object.fromEntries(flat(mod[name]));
  const entry = read(`i18n/locales/${id}.js`);
  assert.match(entry, new RegExp(`import \\{ ${name} \\} from "\\./coinpop\\.${id}\\.js"`), `${id}: imported`);
  assert.match(entry, new RegExp(`"?coinpop"?: ${name},`), `${id}: registered under coinpop`);
}
const keys = Object.keys(cats.tr).sort();
const placeholders = (s) => [...String(s).matchAll(/\{(\w+)[,}]/g)].map((m) => m[1]).sort().join(",");
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}\u{FE0F}]/u;
for (const id of locales) {
  assert.deepEqual(Object.keys(cats[id]).sort(), keys, `${id}: same keys as tr`);
  for (const k of keys) {
    const v = cats[id][k];
    assert.equal(typeof v, "string", `${id}.${k}`);
    assert.ok(v.trim(), `${id}.${k} empty`);
    assert.equal(placeholders(v), placeholders(cats.tr[k]), `${id}.${k}: placeholders`);
    assert.doesNotMatch(v, EMOJI, `${id}.${k}: emoji`);
    assert.doesNotMatch(v, /valorant|takım bul/i, `${id}.${k}: banned`);
  }
}
assert.equal(cats.tr["settings.toggle"], "Arama sonu DesCoin özeti");
assert.equal(cats.tr["btn.spend"], "Mağazada harca");
assert.equal(cats.tr["foot.receipt"], "Fiş {id} · cüzdan geçmişine kaydedildi");
assert.equal(cats.tr["foot.never"], "Bir daha gösterme");
assert.equal(cats.tr["rows.voiceSub"], "{n} dakika aktif konuştun");

// ---- wiring
const heartbeat = read("lib/descoinHeartbeat.js");
assert.match(heartbeat, /markCallContextSeen\(ctx\)/);
const voice = read("hooks/useServerVoice.js");
assert.match(voice, /startDesCoinHeartbeat\(\{[\s\S]{0,600}context: "server"/, "server voice sends the heartbeat");
const sync = read("lib/appearanceSync.js");
assert.match(sync, /export function updateCallCoinPrefs/);
assert.match(sync, /callCoinSyncFields\(readCallCoinPrefs\(\)\)/, "pushed with the appearance");
const panel = read("components/layout/UserPanel.jsx");
assert.match(panel, /id: "wallet", labelKey: "coinpop\.settings\.nav"/);
assert.match(panel, /case "wallet":/);
const app = read("App.jsx");
assert.match(app, /<CallCoinSummaryHost socket=\{socketApi\}/);
const shop = read("components/settings/ShopPanel.jsx");
assert.match(shop, /data-item-id=\{item\.id\}/);
assert.match(shop, /SHOP_FOCUS_EVENT/);
const host = read("components/descoin/CallCoinSummaryHost.jsx");
assert.match(host, /socket\.on\("descoin:call-summary"/);
assert.match(host, /decideCallCoinSummary\(payload\)/);
// Type scale only: no literal px font sizes in the new stylesheet.
const css = read("styles/call-coin-summary.css");
assert.doesNotMatch(css, /font-size:\s*\d+(\.\d+)?px/);
for (const m of css.matchAll(/font-size:\s*([^;]+);/g)) {
  assert.match(m[1], /^(var\(--fs-(11|12|13|15|17|20|28)\)|calc\(var\(--fs-28\) \* [\d.]+\)|inherit)$/, `font-size ${m[1]}`);
}
assert.match(css, /prefers-reduced-motion: reduce/);
assert.match(css, /html\.glass-desktop \.ccs-card :focus-visible/);
// No emoji anywhere in the new UI source.
for (const f of ["components/descoin/CallCoinSummary.jsx", "components/descoin/CallCoinSummaryHost.jsx", "components/descoin/WalletHistoryDrawer.jsx", "components/descoin/callCoinIcons.jsx", "components/settings/WalletSettingsTab.jsx", "lib/callCoinPrefs.js", "styles/call-coin-summary.css"]) {
  assert.doesNotMatch(read(f), EMOJI, `${f}: emoji`);
}

console.log("callCoinPrefs.selftest ok");
