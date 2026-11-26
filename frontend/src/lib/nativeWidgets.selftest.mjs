/**
 * Run: node frontend/src/lib/nativeWidgets.selftest.mjs
 * Widgets draft B ("Yuzler"): the JS bridge rules (favourites, speaker choice, Live Activity
 * payload, reload coalescing, plugin plumbing) plus static checks of the native side (no Xcode
 * here; CI compiles it): the widget extension target, its entitlements and Info.plist, the
 * shared files in both targets, NSSupportsLiveActivities, the plugin registered, the strings in
 * every language and the CI gates.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_PREFS,
  FAVORITES_KEY,
  MAX_FAVORITES,
  RELOAD_SPACING_MS,
  __nativeWidgetsForTests,
  callActivityChange,
  callActivityPayload,
  clearWidgetSettings,
  createReloadScheduler,
  favoritePeople,
  getWidgetSettings,
  initialsOf,
  kindsForEvent,
  moveFavorite,
  normalizeFavorites,
  normalizePrefs,
  pickSpeaker,
  pushFavorites,
  readWidgetSettings,
  reloadWidgets,
  sendCallActivity,
  subscribeWidgetSettings,
  suggestedFavorites,
  toggleFavorite,
  updateWidgetSettings,
  waveErrorKey,
} from "./nativeWidgets.js";
import { parseIntentAction, runIntentAction } from "./nativeIntents.js";

const here = dirname(fileURLToPath(import.meta.url));
const front = join(here, "../..");
const read = (rel) => readFileSync(join(front, rel), "utf8");

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";
const ME = "99999999-9999-4999-8999-999999999999";

// ---- favourites ----------------------------------------------------------------------------
{
  assert.deepEqual(normalizeFavorites([A, A, "bad id;", B, null, C]), [A, B, C], "valid, unique, in order");
  assert.equal(normalizeFavorites(Array.from({ length: 12 }, (_, i) => `id${i}`)).length, MAX_FAVORITES, "at most 8");
  assert.deepEqual(normalizeFavorites([A, B, C], [B, C]), [B, C], "a removed friend drops out");
  assert.deepEqual(toggleFavorite([A, B], A), [B], "tap a numbered face: it leaves, the rest close up");
  assert.deepEqual(toggleFavorite([A], B), [A, B], "tap a free face: it gets the next number");
  const full = Array.from({ length: 8 }, (_, i) => `f${i}`);
  assert.deepEqual(toggleFavorite(full, "f9"), full, "no ninth face");
  assert.deepEqual(moveFavorite([A, B, C], 2, 0), [C, A, B], "drag to the front");
  assert.deepEqual(moveFavorite([A, B, C], 0, 9), [B, C, A], "drag past the end");
  assert.deepEqual(moveFavorite([A, B], 5, 0), [A, B], "out of range: unchanged");
  assert.deepEqual(normalizePrefs({ showActivity: false, waveButton: "yes" }), { ...DEFAULT_PREFS, showActivity: false });
  assert.equal(initialsOf("Ece Yılmaz"), "EY");
  assert.equal(initialsOf("@ışıl"), "I", "Turkish dotless i upper-cases to I");
  assert.equal(initialsOf(""), "?");

  const friends = [
    { id: A, username: "ece", displayName: "Ece", status: "idle", avatarUrl: "https://cdn.x/e.png" },
    { id: B, username: "kaan", displayName: "Kaan", status: "online", avatar_url: "http://insecure/k.png" },
    { id: C, username: "baris", status: "offline" },
  ];
  assert.deepEqual(suggestedFavorites(friends), [B, A, C], "online first, then idle, then the rest");
  const people = favoritePeople([A, B, "gone"], friends);
  assert.deepEqual(people.map((p) => p.id), [A, B], "only friends the app knows");
  assert.equal(people[0].avatarUrl, "https://cdn.x/e.png");
  assert.equal(people[1].avatarUrl, null, "https avatars only");
  assert.equal(people[1].initials, "K");
}

// ---- settings store --------------------------------------------------------------------------
{
  const mem = new Map();
  const store = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  __nativeWidgetsForTests.reset();
  assert.deepEqual(readWidgetSettings(store), { favorites: [], prefs: DEFAULT_PREFS, picked: false });
  let calls = 0;
  const off = subscribeWidgetSettings(() => (calls += 1));
  updateWidgetSettings({ favorites: [A, B] }, store);
  assert.equal(calls, 1);
  assert.equal(getWidgetSettings().picked, true, "choosing faces marks the list as the user's");
  updateWidgetSettings({ favorites: [A, B] }, store);
  assert.equal(calls, 1, "no change, no announcement");
  updateWidgetSettings({ prefs: { waveButton: false } }, store);
  assert.equal(getWidgetSettings().prefs.waveButton, false);
  assert.equal(getWidgetSettings().prefs.showActivity, true, "other prefs kept");
  assert.deepEqual(JSON.parse(mem.get(FAVORITES_KEY)).favorites, [A, B], "persisted");
  assert.deepEqual(readWidgetSettings({ getItem: () => "{broken" }).favorites, [], "corrupt storage reads as empty");
  clearWidgetSettings(store);
  assert.equal(mem.has(FAVORITES_KEY), false, "sign-out forgets the faces");
  assert.deepEqual(getWidgetSettings().favorites, []);
  off();
}

// ---- speaker ---------------------------------------------------------------------------------
{
  const present = new Set([A, B]);
  assert.equal(pickSpeaker(null, [A], ME, present), A);
  assert.equal(pickSpeaker(A, [ME, B], ME, present), B, "someone else speaking beats me");
  assert.equal(pickSpeaker(A, [], ME, present), A, "a pause keeps the last face (no flicker)");
  assert.equal(pickSpeaker(A, [], ME, new Set([B])), null, "the last speaker left");
  assert.equal(pickSpeaker(null, [ME], ME, present), ME, "only me");
  assert.equal(pickSpeaker(null, [C], ME, present), null, "a speaker outside the call is ignored");
}

// ---- Live Activity payload ------------------------------------------------------------------
{
  assert.deepEqual(callActivityPayload({ state: { active: false } }), { active: false });
  const people = Array.from({ length: 8 }, (_, i) => ({ id: `p${i}`, displayName: `P${i}`, avatarUrl: "https://cdn.x/p.png", isScreenSharing: i === 3 }));
  const p = callActivityPayload({
    state: { active: true, kind: "server", title: "Oyun Gecesi", muted: true, deafened: false },
    people,
    me: { id: ME, username: "demir", displayName: "Demir" },
    speakerId: "p5",
    startedAt: 1_700_000_000_000,
    subtitle: "Gece Kusu",
    link: { serverId: "s1", channelId: "v1" },
  });
  assert.equal(p.active, true);
  assert.equal(p.speaker.id, "p5");
  assert.equal(p.participants.length, 6, "six faces at most");
  assert.equal(p.participants[0].me, true, "me first in the strip");
  assert.equal(p.participants[1].id, "p5", "the speaker right after me");
  assert.equal(p.participants[1].speaking, true);
  assert.equal(p.participantCount, 9, "everyone counted");
  assert.equal(p.muted, true);
  assert.deepEqual(p.link, { serverId: "s1", channelId: "v1", groupId: null, username: null });
  assert.ok(p.participants.some((x) => x.screen), "screen share flag");
  assert.equal(p.startedAt, 1_700_000_000_000);
  assert.ok(Date.now() - callActivityPayload({ state: { active: true, kind: "dm" } }).startedAt < 1000, "no start time: now");
  assert.equal(callActivityPayload({ state: { active: true, kind: "weird" } }).kind, "server");

  const other = callActivityPayload({ state: { active: true, kind: "server", title: "Oyun Gecesi", muted: true }, people, me: { id: ME, displayName: "Demir" }, speakerId: "p2", startedAt: 1_700_000_000_000, subtitle: "Gece Kusu", link: { serverId: "s1", channelId: "v1" } });
  assert.equal(callActivityChange(p, other), "speaker", "a new speaker only: spaced out");
  assert.equal(callActivityChange(p, { ...p, muted: false }), "state", "mute: sent at once");
  assert.equal(callActivityChange(p, p), "none");
  assert.equal(callActivityChange(p, { active: false }), "state", "call ended");
  assert.equal(callActivityChange(null, { active: false }), "state", "first report");
  assert.equal(callActivityChange({ active: false }, { active: false }), "none");
}

// ---- reloads ---------------------------------------------------------------------------------
{
  assert.deepEqual(kindsForEvent("presence:delta"), ["friends"]);
  assert.deepEqual(kindsForEvent("dm:message"), ["unread"]);
  assert.deepEqual(kindsForEvent("voice"), ["voice", "friends"]);
  assert.deepEqual(kindsForEvent("resume"), ["friends", "unread", "voice", "call"]);
  assert.deepEqual(kindsForEvent("nope"), []);

  let t = 0;
  const timers = [];
  const sent = [];
  const s = createReloadScheduler({
    send: (k) => sent.push(k.slice().sort()),
    now: () => t,
    setTimer: (fn, ms) => {
      const h = { fn, at: t + ms };
      timers.push(h);
      return h;
    },
    clearTimer: (h) => {
      const i = timers.indexOf(h);
      if (i >= 0) timers.splice(i, 1);
    },
  });
  const run = (until) => {
    for (;;) {
      timers.sort((a, b) => a.at - b.at);
      const next = timers[0];
      if (!next || next.at > until) break;
      timers.shift();
      t = next.at;
      next.fn();
    }
    t = until;
  };
  t = 100_000;
  s.request(["unread"]);
  assert.deepEqual(sent, [["unread"]], "first request goes at once");
  s.request(["unread"]);
  s.request(["unread"]);
  assert.equal(sent.length, 1, "a burst is coalesced");
  run(t + RELOAD_SPACING_MS.unread - 1);
  assert.equal(sent.length, 1);
  run(t + 1);
  assert.deepEqual(sent[1], ["unread"], "one trailing reload after the spacing");
  s.request(["friends", "bogus"]);
  assert.deepEqual(sent[2], ["friends"], "another kind is not held back; unknown kinds ignored");
  s.request(["friends"]);
  s.cancel();
  run(t + 120_000);
  assert.equal(sent.length, 3, "cancel drops what was pending");
}

assert.equal(waveErrorKey("wave_limit"), "widgets.wave.limit");
assert.equal(waveErrorKey("wave_cooldown"), "widgets.wave.cooldown");
assert.equal(waveErrorKey("x"), "widgets.wave.failed");

// ---- "Kaan'i ara" through the intent bridge ---------------------------------------------------
{
  assert.equal(parseIntentAction({ type: "callFriend", payload: { userId: "bad id" } }), null);
  assert.deepEqual(parseIntentAction({ id: "1", type: "callFriend", payload: { userId: A, username: "kaan" } }).payload, { userId: A, username: "kaan", video: false });
  let called = null;
  const ok = await runIntentAction({ type: "callFriend", payload: { userId: A, username: "kaan" } }, { getVoice: () => ({}), callFriend: async (p) => { called = p; return { ok: true }; } });
  assert.deepEqual(ok, { ok: true });
  assert.equal(called.userId, A);
  const busy = await runIntentAction({ type: "callFriend", payload: { userId: A } }, { getVoice: () => ({ call: { mode: "active", peer: {} } }), callFriend: async () => ({ ok: true }) });
  assert.deepEqual(busy, { ok: false, error: "busy" }, "already in a call");
  assert.deepEqual(await runIntentAction({ type: "callFriend", payload: { userId: A } }, { getVoice: () => ({}) }), { ok: false, error: "not_ready" });
}

// ---- plugin plumbing (web: no-ops; native: forwarded) ----------------------------------------
{
  assert.equal(await reloadWidgets(["friends"]), null, "web: nothing to call");
  globalThis.window = { Capacitor: { isNativePlatform: () => true, getPlatform: () => "ios" } };
  const seen = [];
  __nativeWidgetsForTests.setCoreImporter(async () => ({
    registerPlugin: () => ({
      reload: async (a) => (seen.push(["reload", a]), { ok: 1 }),
      setFavorites: async (a) => (seen.push(["setFavorites", a]), { saved: a.ids.length }),
      callActivity: async (a) => (seen.push(["callActivity", a]), { active: a.active }),
    }),
  }));
  assert.deepEqual(await reloadWidgets(["friends", "x"]), { ok: 1 });
  assert.deepEqual(seen[0], ["reload", { kinds: ["friends"] }]);
  assert.equal(await reloadWidgets(["x"]), null, "nothing valid, no bridge call");
  await pushFavorites({ favorites: [A, "bad;"], people: [{ id: A }], prefs: { waveButton: false } });
  assert.deepEqual(seen[1][1].ids, [A]);
  assert.equal(seen[1][1].prefs.waveButton, false);
  await sendCallActivity(null);
  assert.deepEqual(seen[2], ["callActivity", { active: false }]);
  delete globalThis.window;
  __nativeWidgetsForTests.reset();
}

// ---- native side, static checks -----------------------------------------------------------------
{
  const pbx = read("ios/App/App.xcodeproj/project.pbxproj");
  assert.match(pbx, /PRODUCT_BUNDLE_IDENTIFIER = com\.descall\.app\.widgets;/, "widget extension bundle id");
  assert.match(pbx, /DescallWidgets\.appex in Embed Foundation Extensions/, "extension embedded in the app");
  assert.match(pbx, /productType = "com\.apple\.product-type\.app-extension";[\s\S]*?DescallWidgets|DescallWidgets[\s\S]*?productType = "com\.apple\.product-type\.app-extension";/);
  for (const f of ["DescallWidgetLogic.swift", "DescallWidgetStore.swift", "DescallCallActivity.swift"]) {
    const n = (pbx.match(new RegExp(`${f.replace(".", "\\.")} in Sources`, "g")) || []).length;
    assert.ok(n >= 2, `${f} compiled into the app and the extension (${n})`);
  }
  for (const f of ["DescallKitLogic.swift", "DescallSessionStore.swift", "DescallAPIClient.swift", "DescallModels.swift"]) {
    const n = (pbx.match(new RegExp(`${f.replace(".", "\\.")} in Sources`, "g")) || []).length;
    assert.ok(n >= 2, `DescallKit ${f} in the extension too (${n})`);
  }
  assert.match(pbx, /DescallWidgetsPlugin\.swift in Sources/);
  assert.match(pbx, /IPHONEOS_DEPLOYMENT_TARGET = 17\.0;/, "widget extension needs iOS 17 (interactive widgets, AppIntentConfiguration)");

  const info = read("ios/App/App/Info.plist");
  assert.match(info, /<key>NSSupportsLiveActivities<\/key>\s*<true\/>/, "Live Activities enabled in the app");
  const ext = read("ios/App/DescallWidgets/Info.plist");
  assert.match(ext, /com\.apple\.widgetkit-extension/);
  const ent = read("ios/App/DescallWidgets/DescallWidgets.entitlements");
  assert.match(ent, /group\.com\.descall\.app/, "App Group");
  assert.match(ent, /\$\(AppIdentifierPrefix\)com\.descall\.shared/, "shared Keychain session");
  assert.match(read("ios/App/App/DescallBridgeViewController.swift"), /registerPluginInstance\(DescallWidgetsPlugin\(\)\)/);
  assert.match(read("ios/App/App/DescallIntentsPlugin.swift"), /DescallWidgetsBridge\.signedOut\(\)/, "sign-out clears the widgets");

  const sources = ["Widgets.swift", "WidgetSupport.swift", "WidgetData.swift", "WidgetViews.swift", "LiveCallActivity.swift", "WaveIntent.swift"];
  for (const f of sources) assert.ok(existsSync(join(front, "ios/App/DescallWidgets", f)), `extension source ${f}`);
  const widgets = read("ios/App/DescallWidgets/Widgets.swift");
  for (const k of ["DescallFriendsWidget", "DescallPersonWidget", "DescallUnreadWidget", "DescallVoiceWidget", "DescallCallWidget", "DescallLiveCallActivityWidget"]) {
    assert.match(widgets, new RegExp(k), `${k} in the bundle`);
  }
  assert.match(widgets, /AppIntentConfiguration/);
  for (const fam of ["accessoryCircular", "accessoryRectangular", "accessoryInline", "systemSmall", "systemMedium", "systemLarge"]) {
    assert.match(widgets, new RegExp(`\\.${fam}`), fam);
  }

  // Strings: every key the extension asks for exists in every language.
  const { WIDGET_STRINGS, widgetStaleFiles } = await import("../../scripts/ios-widgets-strings.mjs");
  assert.deepEqual(widgetStaleFiles(), [], "DescallWidgets/<lang>.lproj/Localizable.strings up to date (node frontend/scripts/ios-widgets-strings.mjs)");
  const swift = sources.map((f) => read(`ios/App/DescallWidgets/${f}`)).join("\n");
  const used = new Set([...swift.matchAll(/WL\.t\("([a-zA-Z0-9_.]+)"/g)].map((m) => m[1]));
  for (const k of used) assert.ok(WIDGET_STRINGS[k], `widget string ${k} is translated`);
  for (const [k, row] of Object.entries(WIDGET_STRINGS)) {
    for (const l of ["en", "tr", "de", "es", "fr", "pt-BR", "ru"]) assert.ok(row[l], `${k} in ${l}`);
    const ph = (s) => (s.match(/%(@|ld|d)/g) || []).sort().join();
    for (const l of ["tr", "de", "es", "fr", "pt-BR", "ru"]) assert.equal(ph(row[l]), ph(row.en), `${k} placeholders in ${l}`);
  }

  const ci = read("../.github/workflows/ios-testflight.yml");
  assert.match(ci, /com\.descall\.app\.widgets/, "TestFlight registers the widget App ID");
  assert.match(ci, /IOS_WIDGETS/, "repository variable gate");
  assert.match(ci, /DescallWidgets\.appex/);
  const check = read("../.github/workflows/ios-build-check.yml");
  assert.match(check, /DescallWidgets\.appex/, "build check verifies the embedded extension");
  assert.match(check, /selftest\/widgets\/main\.swift/, "widget logic selftest runs in CI");
}

console.log("nativeWidgets selftest ok");
