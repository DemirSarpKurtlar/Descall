/**
 * Run: node frontend/src/lib/nativeIntents.selftest.mjs
 * 4.2 Siri / Shortcuts / Spotlight (iOS), launcher shortcuts (Android): the JS bridge rules,
 * plus static checks of the native side (no Xcode / Gradle here; CI compiles them):
 * intents and phrases present and localized in every language, the shared Keychain group in
 * both entitlements, the Swift files in the App target, shortcuts.xml valid and wired, the
 * sign-in / sign-out sync hooked up, and every link the intents open routed by deepLinks.js.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  INTENT_ACTIONS,
  __nativeIntentsForTests,
  callStatePayload,
  nativePlatform,
  parseIntentAction,
  profilePayload,
  publishRecentShortcuts,
  getRecentShortcuts,
  subscribeRecentShortcuts,
  recentConversations,
  runIntentAction,
  safeAvatarUrl,
  sessionSyncPlan,
  startNativeIntents,
} from "./nativeIntents.js";
import { jumpListPayload } from "./jumpList.js";
import { resolveDeepLink } from "./deepLinks.js";
import { SHORTCUT_LOCALES, VOICE_SHORTCUTS, phrasePlaceholders, shortcutsForLocale, speakablePhrase } from "../i18n/voiceShortcutsCatalog.js";
import { INTENT_STRINGS, STATIC_STRINGS, staleFiles } from "../../scripts/ios-intents-strings.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const front = join(here, "../..");
const read = (rel) => readFileSync(join(front, rel), "utf8");

// ---- session sync (sign-in, profile change, sign-out) ------------------------------------
{
  const me = { id: "11111111-1111-4111-8111-111111111111", username: "ayse", displayName: "Ayşe", avatarUrl: "https://cdn.x/a.png", token: "SECRET" };
  const p = profilePayload(me, { apiBase: "https://des-call.onrender.com", locale: "tr" });
  assert.deepEqual(p, {
    userId: me.id,
    username: "ayse",
    displayName: "Ayşe",
    avatarUrl: "https://cdn.x/a.png",
    apiBase: "https://des-call.onrender.com",
    locale: "tr",
  });
  assert.ok(!JSON.stringify(p).includes("SECRET"), "the token never crosses the bridge from here");
  assert.equal(profilePayload({ id: "bad id;" }), null);
  assert.equal(profilePayload(null), null);
  assert.equal(profilePayload({ id: "x1", avatarUrl: "http://plain" }).avatarUrl, "", "https avatars only");
  assert.equal(safeAvatarUrl("data:image/png;base64,AA"), "");

  assert.equal(sessionSyncPlan(null, p), "sync", "sign-in");
  assert.equal(sessionSyncPlan(p, { ...p }), null, "no change, no bridge call");
  assert.equal(sessionSyncPlan(p, { ...p, displayName: "Ayşe Y." }), "sync", "profile change");
  assert.equal(sessionSyncPlan(p, null), "clear", "sign-out");
  assert.equal(sessionSyncPlan(null, null), null, "signed out at boot");
}

// ---- call state ---------------------------------------------------------------------------
{
  assert.deepEqual(callStatePayload({}), { active: false });
  assert.deepEqual(callStatePayload({ call: { mode: "active", muted: true, peer: { username: "bora" } } }), {
    active: true, kind: "dm", title: "bora", muted: true, deafened: false,
  });
  assert.equal(callStatePayload({ call: { mode: "incoming" } }).active, false, "a ringing call is not active");
  assert.equal(callStatePayload({ groupCall: { isInCall: true, isMuted: true } }).muted, true);
  const sv = callStatePayload({ serverVoice: { isInVoice: true, channelName: "Lobi", deafened: true } });
  assert.deepEqual(sv, { active: true, kind: "server", title: "Lobi", muted: false, deafened: true });
  assert.equal(callStatePayload({ call: { mode: "active" }, serverVoice: { isInVoice: true } }).kind, "dm", "DM call wins");
}

// ---- actions ------------------------------------------------------------------------------
{
  assert.equal(parseIntentAction({ type: "rm -rf" }), null);
  assert.equal(parseIntentAction({ type: "joinVoice", payload: { serverId: "s1", channelId: "../x" } }), null);
  assert.deepEqual(parseIntentAction({ id: "a", type: "joinVoice", payload: { serverId: "s1", channelId: "c1", type: "stage" } }).payload,
    { serverId: "s1", channelId: "c1", channelName: "", type: "stage" });
  assert.equal(parseIntentAction({ type: "setStatus", payload: { status: "busy" } }), null);
  assert.equal(parseIntentAction({ type: "openPath", payload: { path: "https://evil.com" } }), null, "never a URL");
  assert.equal(parseIntentAction({ type: "openPath", payload: { path: "/direct/ay%C5%9Fe" } }).payload.path, "/direct/ay%C5%9Fe");
  assert.equal(parseIntentAction({ type: "openPath", payload: { path: "/admin" } }), null);
  for (const t of INTENT_ACTIONS) assert.ok(typeof t === "string");

  const log = [];
  let muted = false;
  const voice = { serverVoice: { isInVoice: true, get muted() { return muted; }, toggleMute: () => { muted = !muted; log.push("mute"); }, leave: () => log.push("leave") } };
  const ctx = {
    getVoice: () => voice,
    callAction: (type, v) => {
      if (type === "toggleMute") { v.serverVoice.toggleMute(); return true; }
      if (type === "leave") { v.serverVoice.leave(); return true; }
      return false;
    },
    setStatus: (s) => log.push(`status:${s}`),
    getStatus: () => "dnd",
    navigate: (p) => log.push(`go:${p}`),
    joinVoice: async (p) => (p.channelId === "full" ? { ok: false, error: "no_permission" } : { ok: true }),
  };
  assert.deepEqual(await runIntentAction({ type: "toggleMute" }, ctx), { ok: true, state: { active: true, kind: "server", title: "", muted: true, deafened: false } });
  assert.deepEqual(await runIntentAction({ type: "toggleDeafen" }, ctx), { ok: false, error: "failed" }, "a handler that cannot answers failed");
  assert.deepEqual(await runIntentAction({ type: "toggleMute" }, { ...ctx, getVoice: () => ({}) }), { ok: false, error: "no_call" });
  assert.deepEqual(await runIntentAction({ type: "leave" }, ctx), { ok: true, state: { active: false } });
  assert.deepEqual(await runIntentAction({ type: "toggleDnd" }, ctx), { ok: true, state: { status: "online" } }, "DND toggles back to online");
  assert.deepEqual(await runIntentAction({ type: "joinVoice", payload: { serverId: "s", channelId: "full" } }, ctx), { ok: false, error: "no_permission" });
  assert.equal((await runIntentAction({ type: "joinVoice", payload: { serverId: "s", channelId: "c" } }, {})).error, "not_ready");
  const denied = await runIntentAction({ type: "joinVoice", payload: { serverId: "s", channelId: "c" } }, {
    joinVoice: async () => { const e = new Error("x"); e.name = "NotAllowedError"; throw e; },
  });
  assert.deepEqual(denied, { ok: false, error: "mic_denied" });
  await runIntentAction({ type: "newMessage" }, ctx);
  await runIntentAction({ type: "openFriends" }, ctx);
  assert.deepEqual(log, ["mute", "leave", "status:online", "go:/direct", "go:/friends"]);
}

// ---- recent conversations (Android shortcuts, jump list) ---------------------------------
{
  const friends = [
    { id: "a1", username: "ayse", displayName: "Ayşe", avatarUrl: "https://cdn.x/a.png" },
    { id: "b2", username: "bora" },
    { id: "c3", username: "cem" },
    { id: "d4", username: "bad user" },
    { id: "e5", username: "blocked" },
  ];
  const at = { a1: "2026-11-20T10:00:00Z", b2: "2026-11-22T10:00:00Z", d4: "2026-11-23T10:00:00Z", e5: "2026-11-23T11:00:00Z" };
  const recent = recentConversations(friends, at, { blocked: (id) => id === "e5" });
  assert.deepEqual(recent.map((r) => r.username), ["bora", "ayse"], "newest first, no chat -> no shortcut, bad / blocked out");
  assert.equal(recent[1].path, "/direct/ayse");
  assert.equal(recentConversations(friends, at, { max: 1 }).length, 1);
  const jl = jumpListPayload({ signedIn: true, recent, labels: { newMessage: "Yeni mesaj", bad: 3 } });
  assert.deepEqual(jl, { signedIn: true, recent: [{ username: "bora", name: "bora" }, { username: "ayse", name: "Ayşe" }], labels: { newMessage: "Yeni mesaj" } });

  let hits = 0;
  const off = subscribeRecentShortcuts(() => { hits += 1; });
  publishRecentShortcuts(recent);
  publishRecentShortcuts([...recent]);
  assert.equal(hits, 1, "same list, no second render");
  assert.equal(getRecentShortcuts().length, 2);
  off();
  publishRecentShortcuts([]);
}

// ---- plugin plumbing (fake Capacitor) -----------------------------------------------------
{
  assert.equal(nativePlatform({}), "");
  assert.equal(nativePlatform({ Capacitor: { isNativePlatform: () => true, getPlatform: () => "ios" } }), "ios");
  assert.equal(nativePlatform({ Capacitor: { isNativePlatform: () => true, getPlatform: () => "web" } }), "");

  const completed = [];
  let listener = null;
  const fake = {
    addListener: (name, fn) => { assert.equal(name, "action"); listener = fn; return Promise.resolve({ remove() { listener = null; } }); },
    takePendingActions: async () => ({ actions: [{ id: "q1", type: "openFriends" }, { id: "q1", type: "openFriends" }] }),
    completeAction: async (r) => { completed.push(r); },
  };
  __nativeIntentsForTests.setCoreImporter(async () => ({ registerPlugin: (name) => { assert.equal(name, "DescallIntents"); return fake; } }));
  const went = [];
  const ctxRef = { current: { navigate: (p) => went.push(p), getVoice: () => ({}) } };
  const stop = startNativeIntents(ctxRef, { platform: "ios" });
  for (let i = 0; i < 20 && completed.length < 1; i++) await new Promise((r) => setTimeout(r, 5));
  assert.deepEqual(went, ["/friends"], "queued action ran once (duplicate id ignored)");
  assert.deepEqual(completed[0], { id: "q1", ok: true, error: "", state: {} });
  await listener({ id: "l1", type: "toggleMute" });
  assert.deepEqual(completed[1], { id: "l1", ok: false, error: "no_call", state: {} }, "Siri hears there is no call");
  stop();
  assert.equal(listener, null, "listener removed on stop");
  assert.equal(startNativeIntents(ctxRef, { platform: "" })(), undefined, "web: no-op");
  __nativeIntentsForTests.reset();
}

// ---- links the native side opens are routed -------------------------------------------------
{
  assert.deepEqual(resolveDeepLink("descall://dm/ay%C5%9Fe"), { path: "/direct/ay%C5%9Fe" }, "Swift DescallDeepLink.dm");
  assert.deepEqual(resolveDeepLink("descall://server/s1/c1"), { path: "/servers/s1/c1" });
  assert.deepEqual(resolveDeepLink("descall://server/s1"), { path: "/servers/s1" });
  assert.deepEqual(resolveDeepLink("descall://group/g1"), { path: "/groups/g1" });
  assert.deepEqual(resolveDeepLink("descall://friends"), { path: "/friends" });
  assert.deepEqual(resolveDeepLink("descall://open"), { path: "/direct" });
}

// ---- iOS: phrases, strings, intents, entitlements, project ---------------------------------
{
  const swift = read("ios/App/App/DescallAppIntents.swift");
  const intents = [...swift.matchAll(/struct (Descall\w+Intent): (?:AppIntent|OpenIntent)/g)].map((m) => m[1]);
  for (const name of ["DescallSendMessageIntent", "DescallOpenFriendIntent", "DescallOpenPlaceIntent", "DescallJoinVoiceIntent",
    "DescallSetStatusIntent", "DescallToggleMuteIntent", "DescallToggleDeafenIntent", "DescallLeaveCallIntent",
    "DescallUnreadIntent", "DescallWhoIsOnlineIntent"]) {
    assert.ok(intents.includes(name), `intent ${name}`);
  }
  assert.match(swift, /struct DescallAppShortcuts: AppShortcutsProvider/);
  assert.match(swift, /static let openAppWhenRun = false[\s\S]*?DescallSendMessageIntent|DescallSendMessageIntent[\s\S]*?openAppWhenRun = false/, "send runs without opening the app");
  assert.match(swift, /requestConfirmation\(/, "send asks before sending");

  // Phrases in Swift == catalog, in the same order; at most 10 App Shortcuts.
  const provider = swift.slice(swift.indexOf("struct DescallAppShortcuts"));
  const blocks = [...provider.matchAll(/AppShortcut\(intent: (\w+)\(\), phrases: \[([\s\S]*?)\]/g)];
  assert.ok(blocks.length <= 10, "App Shortcuts limit");
  assert.deepEqual(blocks.map((b) => b[1]), VOICE_SHORTCUTS.map((s) => s.intent), "same shortcuts as the catalog");
  blocks.forEach((b, i) => {
    const swiftPhrases = [...b[2].matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) =>
      m[1].replace(/\\\(\.applicationName\)/g, "${applicationName}").replace(/\\\(\\\.\$(\w+)\)/g, "${$1}"));
    assert.deepEqual(swiftPhrases, VOICE_SHORTCUTS[i].phrases.map((p) => p.en), `${b[1]} phrases match the catalog`);
  });
  for (const s of VOICE_SHORTCUTS) {
    for (const p of s.phrases) {
      for (const lang of SHORTCUT_LOCALES) {
        assert.ok(p[lang], `${s.id}: ${lang} phrase`);
        assert.ok(p[lang].includes("${applicationName}"), `${s.id}/${lang}: app name in the phrase`);
        assert.deepEqual(phrasePlaceholders(p[lang]), phrasePlaceholders(p.en), `${s.id}/${lang}: same parameters`);
      }
    }
  }
  assert.equal(speakablePhrase("Join ${room} on ${applicationName}"), "Join … on Descall");
  assert.equal(shortcutsForLocale("tr")[0].phrase, "Descall ile mesaj gönder");
  assert.equal(shortcutsForLocale("pt").find((r) => r.id === "online").phrase, "Quem está online no Descall");

  // Localizable.strings covers every static literal of the intents file.
  const literals = new Set();
  const pick = (re) => { for (const m of swift.matchAll(re)) literals.add(m[1]); };
  pick(/static let title: LocalizedStringResource = "([^"]+)"/g);
  pick(/IntentDescription\("([^"]+)"\)/g);
  pick(/TypeDisplayRepresentation\(name: "([^"]+)"\)/g);
  pick(/@Parameter\(title: "([^"]+)"\)/g);
  pick(/shortTitle: "([^"]+)"/g);
  pick(/\.\w+: DisplayRepresentation\(title: "([^"]+)"/g);
  for (const m of swift.matchAll(/Summary\("((?:[^"\\]|\\.)*)"\)/g)) literals.add(m[1].replace(/\\\(\\\.\$(\w+)\)/g, "${$1}"));
  for (const lit of literals) assert.ok(STATIC_STRINGS[lit], `Localizable.strings has "${lit}"`);
  for (const [k, v] of Object.entries(STATIC_STRINGS)) {
    for (const lang of SHORTCUT_LOCALES) assert.ok(v[lang], `${k}: ${lang}`);
  }

  // Intents.strings covers every DescallIntentText / failure key, same format specifiers everywhere.
  const swiftKeys = new Set();
  for (const m of swift.matchAll(/(?:text|dialog)\("([a-z][\w.]+)"/g)) swiftKeys.add(m[1]);
  for (const m of swift.matchAll(/DescallIntentFailure\(key: "([\w.]+)"\)/g)) swiftKeys.add(m[1]);
  for (const m of swift.matchAll(/\.init\(key: "([\w.]+)"\)/g)) swiftKeys.add(m[1]);
  for (const m of swift.matchAll(/forbidden: "([\w.]+)"/g)) swiftKeys.add(m[1]);
  for (const st of ["online", "idle", "dnd", "invisible"]) swiftKeys.add(`status.${st}`);
  for (const pr of ["online", "idle", "dnd", "offline"]) swiftKeys.add(`presence.${pr}`);
  for (const k of swiftKeys) assert.ok(INTENT_STRINGS[k], `Intents.strings has ${k}`);
  const specs = (s) => (s.match(/%(?:@|ld|d)/g) || []).join(",");
  for (const [k, v] of Object.entries(INTENT_STRINGS)) {
    for (const lang of SHORTCUT_LOCALES) {
      assert.ok(v[lang], `${k}: ${lang}`);
      assert.equal(specs(v[lang]), specs(v.en), `${k}/${lang}: same format specifiers`);
    }
  }
  assert.deepEqual(staleFiles(), [], "generated .strings files are up to date (node scripts/ios-intents-strings.mjs)");

  // Entitlements: the shared session group, app group first so the app's default stays.
  for (const f of ["App.debug.entitlements", "App.release.entitlements"]) {
    const ent = read(`ios/App/App/${f}`);
    const groups = /<key>keychain-access-groups<\/key>\s*<array>([\s\S]*?)<\/array>/.exec(ent);
    assert.ok(groups, `${f}: keychain-access-groups`);
    const list = [...groups[1].matchAll(/<string>([^<]+)<\/string>/g)].map((m) => m[1]);
    assert.deepEqual(list, ["$(AppIdentifierPrefix)com.descall.app", "$(AppIdentifierPrefix)com.descall.shared"], f);
  }
  assert.match(read("ios/App/DescallKit/DescallSessionStore.swift"), /sharedGroupSuffix = "com\.descall\.shared"/);
  assert.match(read("../.github/workflows/ios-testflight.yml"), /\\\$\(AppIdentifierPrefix\)\/'"\$TEAM_ID"'\./, "TestFlight expands the prefix");

  // Xcode project: every new Swift file in the App target, the strings as variant groups.
  const pbx = read("ios/App/App.xcodeproj/project.pbxproj");
  for (const f of ["DescallModels.swift", "DescallKitLogic.swift", "DescallSessionStore.swift", "DescallAPIClient.swift", "DescallIntentsPlugin.swift", "DescallAppIntents.swift"]) {
    assert.ok(pbx.includes(`/* ${f} in Sources */ = {isa = PBXBuildFile;`), `${f} build file`);
    assert.ok(existsSync(join(front, f.startsWith("DescallIntents") || f.startsWith("DescallAppIntents") ? `ios/App/App/${f}` : `ios/App/DescallKit/${f}`)), `${f} on disk`);
  }
  for (const t of ["AppShortcuts.strings", "Localizable.strings", "Intents.strings"]) {
    assert.ok(pbx.includes(`/* ${t} in Resources */`), `${t} in Resources`);
    for (const lang of SHORTCUT_LOCALES) {
      const path = lang.includes("-") ? `"${lang}.lproj/${t}"` : `${lang}.lproj/${t}`;
      assert.ok(pbx.includes(`path = ${path};`), `${lang}.lproj/${t} referenced`);
      assert.ok(existsSync(join(front, `ios/App/App/${lang}.lproj/${t}`)), `${lang}.lproj/${t} on disk`);
    }
  }
  assert.match(read("ios/App/App/DescallBridgeViewController.swift"), /registerPluginInstance\(DescallIntentsPlugin\(\)\)/);
  assert.match(read("ios/App/App/AppDelegate.swift"), /DescallSharedSessionSync\.migrateIfNeeded\(\)/);
  const keychain = read("ios/App/App/DescallKeychainPlugin.swift");
  assert.match(keychain, /DescallSharedSessionSync\.tokenChanged\(value\)/, "sign-in / refresh mirrored");
  assert.match(keychain, /DescallSharedSessionSync\.signedOut\(\)/, "sign-out mirrored");
  assert.match(read("ios/App/App/DescallDeepLinkPlugin.swift"), /static func deliverFromIntent/);
  assert.match(read("../.github/workflows/ios-build-check.yml"), /selftest\/kit\/main\.swift/, "DescallKit selftest in CI");
}

// ---- JS bridge wired into the app -----------------------------------------------------------
{
  const app = read("src/App.jsx");
  assert.match(app, /useNativeIntents\(\{[\s\S]*?me,[\s\S]*?setStatus: handleStatusChange/);
  const hook = read("src/hooks/useNativeIntents.js");
  assert.match(hook, /syncNativeSession\(sessionPayload\)/, "sign-in / profile sync");
  assert.match(hook, /clearNativeSession\(\)/, "sign-out clear");
  assert.match(hook, /reportNativeCallState/);
  assert.match(read("src/components/layout/UserPanel.jsx"), /case "shortcuts":\s*return <VoiceShortcutsPane \/>/);
}

// ---- Android: shortcuts.xml, trampoline, plugin --------------------------------------------
{
  const xml = read("android/app/src/main/res/xml/shortcuts.xml");
  const manifest = read("android/app/src/main/AndroidManifest.xml");
  assert.match(manifest, /android:name="android\.app\.shortcuts"\s+android:resource="@xml\/shortcuts"/);
  assert.match(manifest, /android:name="\.DescallShortcutActivity"[\s\S]*?android:taskAffinity=""/);
  const ids = [...xml.matchAll(/android:shortcutId="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(ids, ["new_message", "toggle_dnd", "friends"], "static shortcuts: new message, status, friends");
  const activity = read("android/app/src/main/java/com/descall/app/DescallShortcutActivity.java");
  for (const m of xml.matchAll(/android:action="(com\.descall\.app\.action\.[A-Z_]+)"/g)) {
    assert.ok(activity.includes(`"${m[1]}"`), `${m[1]} handled by the trampoline`);
  }
  for (const m of xml.matchAll(/android:targetClass="([^"]+)"/g)) assert.equal(m[1], "com.descall.app.DescallShortcutActivity");
  for (const m of xml.matchAll(/android:targetPackage="([^"]+)"/g)) assert.equal(m[1], "com.descall.app");
  assert.match(xml, /actions\.intent\.OPEN_APP_FEATURE/, "App Actions capability (shortcuts.xml, not actions.xml)");
  assert.ok(!existsSync(join(front, "android/app/src/main/res/xml/actions.xml")), "no deprecated actions.xml");
  for (const m of xml.matchAll(/@drawable\/(\w+)/g)) assert.ok(existsSync(join(front, `android/app/src/main/res/drawable/${m[1]}.xml`)), m[1]);
  const stringRefs = [...xml.matchAll(/@string\/(\w+)/g)].map((m) => m[1]);
  const arrayRefs = [...xml.matchAll(/@array\/(\w+)/g)].map((m) => m[1]);
  const folders = { en: "values/strings.xml", tr: "values-tr/shortcuts_strings.xml", de: "values-de/shortcuts_strings.xml", es: "values-es/shortcuts_strings.xml", fr: "values-fr/shortcuts_strings.xml", "pt-BR": "values-pt-rBR/shortcuts_strings.xml", ru: "values-ru/shortcuts_strings.xml" };
  for (const [lang, file] of Object.entries(folders)) {
    const res = read(`android/app/src/main/res/${file}`);
    for (const s of stringRefs) {
      const m = new RegExp(`<string name="${s}">([^<]+)</string>`).exec(res);
      assert.ok(m, `${lang}: ${s}`);
      if (s.endsWith("_short")) assert.ok(m[1].length <= 25, `${lang}: ${s} fits a launcher`);
    }
    for (const a of arrayRefs) assert.match(res, new RegExp(`<string-array name="${a}">`), `${lang}: ${a}`);
  }
  assert.match(read("android/app/src/main/java/com/descall/app/MainActivity.java"), /registerPlugin\(DescallShortcutsPlugin\.class\)/);
  assert.match(read("android/app/build.gradle"), /androidx\.core:core:\$androidxCoreVersion/);
  const plugin = read("android/app/src/main/java/com/descall/app/DescallShortcutsPlugin.java");
  for (const m of ["setRecentConversations", "pinConversation", "clear", "takePendingActions", "completeAction", "getAvailability"]) {
    assert.match(plugin, new RegExp(`public void ${m}\\(PluginCall call\\)`), `plugin method ${m}`);
  }
  assert.match(plugin, /IconCompat\.createWithAdaptiveBitmap/, "avatars as adaptive icons");
}

console.log("nativeIntents selftest ok");
