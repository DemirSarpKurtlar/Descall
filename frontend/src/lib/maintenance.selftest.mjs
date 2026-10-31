import assert from "node:assert/strict";
import * as m from "./maintenance.js";

// Durations take their unit words from the catalog: load it and pick the locale.
const store = new Map();
globalThis.localStorage ??= { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
const i18n = await import("../i18n/index.js");
const runtime = await import("../i18n/runtime.js");
await i18n.ensureLocaleLoaded("tr");
runtime.setRuntimeLocale("tr");

const iso = "2026-10-21T23:00:00.000Z"; // 22 Eki 02:00 TRT
assert.equal(m.formatTrtShort(iso, "tr"), "22 Eki 02:00");
assert.equal(m.formatTrtShort(iso, "en"), "22 Oct, 02:00");
assert.equal(m.formatTrtLongDate(iso, "tr"), "22 Ekim 2026");
assert.equal(m.formatTrtLongDate(iso, "en"), "22 October 2026");
assert.deepEqual(m.toTrtInputs(iso), { date: "2026-10-22", time: "02:00" });
assert.equal(m.fromTrtInputs("2026-10-22", "02:00"), iso);
assert.equal(m.dottedDate("2026-10-22"), "22.10.2026");
assert.equal(m.fromTrtInputs("", "02:00"), null);
assert.deepEqual(m.countdownParts(Date.parse(iso), Date.parse(iso) - (2 * 86400 + 5 * 3600 + 36 * 60 + 12) * 1000), { days: 2, hours: 5, minutes: 36, seconds: 12 });
assert.deepEqual(m.countdownParts(0, 10), { days: 0, hours: 0, minutes: 0, seconds: 0 });
assert.equal(m.formatDuration(150 * 60000, "tr"), "2 sa 30 dk");
assert.equal(m.formatDuration(24 * 60000, "tr"), "24 dk");
assert.equal(m.formatDuration(60 * 60000, "tr"), "1 sa");
assert.equal(m.approxHours(150 * 60000, "tr"), "~2,5 saat");
assert.equal(m.approxHours(20 * 60000, "tr"), "~20 dk");
assert.equal(m.approxHours(3 * 3600000, "tr"), "~3 saat");
runtime.setRuntimeLocale("en");
assert.equal(m.formatDuration(60 * 60000, "en"), "1 h");
assert.equal(m.formatDuration(150 * 60000, "en"), "2 h 30 min");
assert.equal(m.approxHours(150 * 60000, "en"), "~2.5 h");

const now = Date.parse(iso);
const w = { id: "w", announced: true, platforms: ["web", "ios"], startsAt: iso, endsAt: new Date(now + 9e6).toISOString(), announceAt: new Date(now - 3.6e6).toISOString(), adminsBypass: true };
assert.equal(m.shouldBlock(w, { platform: "web", now: now + 1 }), true);
assert.equal(m.shouldBlock(w, { platform: "android", now: now + 1 }), false, "other platform");
assert.equal(m.shouldBlock(w, { platform: "web", isAdmin: true, now: now + 1 }), false, "admin bypass");
assert.equal(m.shouldBlock({ ...w, adminsBypass: false }, { platform: "web", isAdmin: true, now: now + 1 }), true, "no bypass");
assert.equal(m.shouldBlock(w, { platform: "web", now: now + 1e7 }), false, "ended by clock");
assert.equal(m.shouldBlock(w, { platform: "web", now: now - 1 }), false);
assert.equal(m.shouldShowBanner(w, { platform: "ios", now: now - 1000 }), true);
assert.equal(m.shouldShowBanner(w, { platform: "ios", now: now - 4e6 }), false, "before announce time");
assert.equal(m.shouldShowBanner(w, { platform: "ios", now: now - 1000, dismissedId: "w" }), false, "dismissed");
assert.equal(m.shouldShowBanner(w, { platform: "ios", now: now + 1 }), false, "started");
assert.equal(m.detectPlatform({ electronAPI: {} }), "electron");
assert.equal(m.detectPlatform({ Capacitor: { isNativePlatform: () => true, getPlatform: () => "ios" } }), "ios");
assert.equal(m.detectPlatform({}), "web");
console.log("maintenance.selftest.mjs: ok");
