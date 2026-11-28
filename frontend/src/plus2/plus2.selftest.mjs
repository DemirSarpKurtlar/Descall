// Run: node src/plus2/plus2.selftest.mjs
// Descall+ 2.0 client rules: prices, level bars, gift steps, the screen share ceiling on every
// capture path (one resolver for Electron, Tauri and web: server voice, group and 1:1 calls; the
// iOS broadcast clamps to the token's ceiling), key parity of the plus2 catalogs in 7 locales,
// the StoreKit plugin wiring, and the public page thank-you wall.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  clampToCeiling, comparison, daysLeft, errorKey, formatPrice, giftChip, giftSteps, levelAdds, levelBar, levelFor,
  optionLock, scheduleIso, shareOf, vatOf,
} from "./model.js";
import { capCaptureSize, cappedResolution, clearScreenCeilings, getScreenCeiling, setScreenCeiling } from "./screenCeiling.js";

const rd = (f) => readFileSync(new URL(f, import.meta.url), "utf8");

// prices
assert.equal(formatPrice(6999, "TRY", "tr"), "69,99 ₺");
assert.equal(formatPrice(21499, "TRY", "tr"), "214,99 ₺");
assert.equal(formatPrice(0, "TRY", "tr"), "0 ₺");
assert.equal(formatPrice(238400, "TRY", "tr"), "2.384 ₺");
assert.match(formatPrice(6999, "TRY", "en"), /69\.99/);
assert.equal(vatOf(19999, 20), 3333);
assert.equal(shareOf(59999, 4), 15000);
assert.equal(shareOf(59999, 9), 15000, "shares clamp to 4");

// levels
assert.equal(levelFor(1), 0);
assert.equal(levelFor(6), 2);
const bar = levelBar(6);
assert.equal(bar.level, 2);
assert.deepEqual(bar.next, { level: 3, boosts: 10, missing: 4 });
assert.equal(bar.ticks.length, 3);
assert.equal(Math.round(bar.fill * 100), 60);
assert.deepEqual(levelAdds(0).map((a) => a.key), ["animatedIcon", "emoji", "screen"]);
assert.ok(levelAdds(1).some((a) => a.key === "upload" && a.n === 250));
assert.ok(levelAdds(2).some((a) => a.key === "vanity"));

// gifts
const g = { paidAt: "2026-11-27T21:44:00Z", deliverAt: "2026-12-02T09:00:00Z", status: "scheduled" };
assert.deepEqual(giftSteps(g).map((s) => s.done), [true, false, false, false]);
assert.deepEqual(giftSteps({ ...g, deliveredAt: "x", openedAt: "y", status: "opened" }).map((s) => s.done), [true, true, true, false]);
assert.equal(giftChip({ status: "scheduled" }).key, "scheduled");
assert.equal(giftChip({ status: "opened" }).tone, "ok");
assert.equal(daysLeft(new Date(Date.now() + 2.2 * 86400000).toISOString()), 3);
assert.equal(scheduleIso("2020-01-01", "09:00"), null, "past time refused");
assert.ok(scheduleIso("2099-12-02", "09:00"));
assert.equal(errorKey("no_slots"), "plus2.err.no_slots");
assert.equal(errorKey("weird"), "plus2.err.generic");
const cmp = comparison({ tiers: { free: { screenHeight: 1080, screenFps: 30 }, plus: { screenHeight: 1440, screenFps: 60, boosts: 2, tickets: 2 }, ultra: { screenHeight: 1440, screenFps: 60, boosts: 5, sourceQuality: true } } });
assert.equal(cmp.free.screen, "1080p 30");
assert.equal(cmp.plus.boosts, 2);
assert.equal(cmp.ultra.source, true);

// screen ceiling: pure helpers
const free = { height: 1080, fps: 30, locked: true };
assert.deepEqual(optionLock({ resolution: "1440p" }, free), { locked: true, reason: "height" });
assert.deepEqual(optionLock({ resolution: "1080p" }, free), { locked: false, reason: null });
assert.deepEqual(optionLock({ fps: 60 }, free), { locked: true, reason: "fps" });
assert.deepEqual(optionLock({ resolution: "1440p" }, null), { locked: false, reason: null }, "no ceiling = nothing locked (selling off)");
assert.deepEqual(clampToCeiling({ resolution: "1440p", fps: 60, contentHint: "motion" }, free), { resolution: "1080p", fps: 30, contentHint: "motion" });
assert.deepEqual(clampToCeiling({ resolution: "1440p", fps: 60 }, null), { resolution: "1440p", fps: 60 });
assert.deepEqual(capCaptureSize({ width: 2560, height: 1440, fps: 60 }, free), { width: 1920, height: 1080, fps: 30 });
assert.deepEqual(capCaptureSize({ width: 1280, height: 720, fps: 30 }, free), { width: 1280, height: 720, fps: 30 });
assert.equal(cappedResolution("1440p", free), "1080p");

// screen ceiling on the shared capture resolver (every desktop / web capture path)
const { resolveScreenCaptureSize } = await import("../lib/webrtcScreenShare.js");
clearScreenCeilings();
assert.deepEqual(resolveScreenCaptureSize({ resolution: "1440p", fps: 60 }), { width: 2560, height: 1440, fps: 60 }, "today: 1440p 60 for everyone");
setScreenCeiling(free, "");
assert.deepEqual(resolveScreenCaptureSize({ resolution: "1440p", fps: 60 }), { width: 1920, height: 1080, fps: 30 }, "1:1 call capped");
assert.deepEqual(resolveScreenCaptureSize({ resolution: "1440p", fps: 60 }, { peerCount: 4 }), { width: 1920, height: 1080, fps: 30 }, "group mesh capped");
setScreenCeiling({ height: 1080, fps: 60, locked: true }, "server-a");
assert.deepEqual(resolveScreenCaptureSize({ resolution: "1440p", fps: 60 }, { peerCount: 1, serverId: "server-a" }), { width: 1920, height: 1080, fps: 60 }, "server level 1 gives 60 fps there");
assert.equal(getScreenCeiling("server-b").fps, 30, "other servers fall back to the account ceiling");
setScreenCeiling(null, "");
setScreenCeiling(null, "server-a");
assert.equal(getScreenCeiling(""), null);
assert.deepEqual(resolveScreenCaptureSize({ resolution: "1440p", fps: 60 }), { width: 2560, height: 1440, fps: 60 }, "ceiling cleared");

// every capture path goes through the resolver; server voice passes its server id; iOS clamps
const sv = rd("../hooks/useServerVoice.js");
assert.match(sv, /resolveScreenCaptureSize\(quality, \{[\s\S]{0,120}serverId: activeServerIdRef\.current/);
assert.match(sv, /setScreenCeiling\(tokenData\.screenCeiling/);
assert.match(sv, /maxHeight: Math\.min\(1080, ceil\.height\)/);
assert.match(rd("../hooks/useGroupCall.js"), /resolveScreenCaptureSize\(/);
assert.match(rd("../hooks/useCall.js"), /resolveScreenCaptureSize\(/);
const panel = rd("../components/voice/ScreenShareQualityPanel.jsx");
assert.match(panel, /onStartWithQuality\?\.\(clampToCeiling\(quality, ceiling\)\)/, "a new share starts at the ceiling");
assert.ok(!/onRestartWithQuality\?\.\(clampToCeiling/.test(panel), "a running share is never re-encoded by the gate");

// catalogs: same keys, same placeholders in all 7 locales
const LOCALES = { tr: "TR", en: "EN", de: "DE", es: "ES", fr: "FR", "pt-BR": "PT_BR", ru: "RU" };
const flat = (o, p = "", out = {}) => {
  for (const [k, v] of Object.entries(o)) {
    const q = p ? `${p}.${k}` : k;
    if (v && typeof v === "object") flat(v, q, out);
    else out[q] = v;
  }
  return out;
};
const args = (s) => [...new Set((String(s).match(/\{(\w+)[,}]/g) || []).map((x) => x.slice(1, -1)))].sort().join(",");
const base = flat((await import("../i18n/locales/plus2.tr.js")).PLUS2_TR);
for (const [loc, suf] of Object.entries(LOCALES)) {
  const cat = flat((await import(`../i18n/locales/plus2.${loc}.js`))[`PLUS2_${suf}`]);
  assert.deepEqual(Object.keys(cat).sort(), Object.keys(base).sort(), `${loc} has the same keys`);
  for (const k of Object.keys(base)) assert.equal(args(cat[k]), args(base[k]), `${loc} ${k} placeholders`);
  assert.match(rd(`../i18n/locales/${loc}.js`), new RegExp(`plus2"?: PLUS2_${suf}`), `${loc} registers plus2`);
}
// no emoji in UI copy
for (const v of Object.values(base)) assert.ok(!/\p{Extended_Pictographic}/u.test(v), `no emoji: ${v}`);

// every static plus2 key used by the code exists
const used = new Set();
for (const f of ["PlusHub.jsx", "CheckoutWindow.jsx", "ManageMembership.jsx", "GiftTracker.jsx", "GifOffer.jsx", "ServerBoostPage.jsx", "PlusBits.jsx", "ScreenQualityGate.jsx", "TrialBanner.jsx", "ProfileGifNote.jsx", "PlusHost.jsx", "ui.jsx", "../components/admin/premium/PlusWorkspace.jsx"]) {
  for (const m of rd(f).matchAll(/"(plus2\.[A-Za-z0-9_.]+)"/g)) used.add(m[1].slice(6));
}
for (const k of used) assert.ok(k in base, `missing catalog key plus2.${k}`);

// StoreKit plugin wiring (compiled in CI): registered, and the JS calls only its methods
const swift = rd("../../ios/App/App/DescallStorePlugin.swift");
const bridge = rd("../../ios/App/App/DescallBridgeViewController.swift");
const pbx = rd("../../ios/App/App.xcodeproj/project.pbxproj");
assert.match(bridge, /registerPluginInstance\(DescallStorePlugin\(\)\)/);
assert.equal((pbx.match(/DescallStorePlugin\.swift/g) || []).length, 6, "file ref (2), build file (2), group, sources");
for (const m of ["products", "purchase", "finish", "currentEntitlements", "start"]) assert.match(swift, new RegExp(`CAPPluginMethod\\(name: "${m}"`));
const js = rd("./storeKit.js");
for (const m of js.matchAll(/\bp\.(\w+)\??\.?\(/g)) if (m[1] !== "addListener") assert.match(swift, new RegExp(`name: "${m[1]}"`), `swift has ${m[1]}`);
assert.match(swift, /notifyListeners\("transaction"/, "the listener event exists");
assert.match(swift, /appAccountToken/);
assert.match(js, /registerPlugin\("DescallStore"\)/);

// public page wall: names only, escaped
const sp = await import("../../public/server-page.js");
assert.equal(sp.normalizeWall(null), null);
const wall = sp.normalizeWall({ count: 6, level: 2, boosters: [{ username: "demir", displayName: "<b>Demir</b>", since: "2026-11-12T10:00:00Z", id: "secret" }] });
assert.deepEqual(wall.boosters[0], { username: "demir", displayName: "<b>Demir</b>", since: "2026-11" });
const html = sp.renderBody({ ...sp.normalizePage({ page: { slug: "gecekuslari", name: "Gece Kuşları" } }), boostWall: wall }, "tr");
assert.match(html, /Teşekkür duvarı/);
assert.match(html, /&lt;b&gt;Demir&lt;\/b&gt;/);
assert.ok(!/secret/.test(html));

console.log("plus2 selftest ok");
