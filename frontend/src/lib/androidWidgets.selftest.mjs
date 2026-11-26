/**
 * Run: node frontend/src/lib/androidWidgets.selftest.mjs
 * Android home screen widgets + ongoing call notification (draft B "Yuzler"): the JS bridge
 * rules, plus static checks of the native side (no Gradle here; CI compiles it):
 * manifest wiring, widget provider XML, RemoteViews-safe layouts, every R.* the widget code
 * uses exists, strings in all seven languages with matching placeholders and plural forms,
 * the plugin registered, WorkManager declared, and the session host rule equal to iOS.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  REFRESH_EVENTS,
  WIDGETS_PLUGIN,
  __androidWidgetsForTests,
  callIdentity,
  clearWidgetSession,
  personOf,
  requestWidgetRefresh,
  setWidgetCallState,
  setWidgetSession,
  widgetCallPayload,
  widgetSessionPayload,
  widgetSessionPlan,
} from "./androidWidgets.js";
import { __nativeIntentsForTests, startNativeIntents } from "./nativeIntents.js";

const here = dirname(fileURLToPath(import.meta.url));
const front = join(here, "../..");
const read = (rel) => readFileSync(join(front, rel), "utf8");
const ANDROID = "android/app/src/main";
const RES = `${ANDROID}/res`;
const JAVA = `${ANDROID}/java/com/descall/app`;
const WIDGET = `${JAVA}/widget`;
const ME = "11111111-1111-4111-8111-111111111111";

// ---- session payload / plan ----------------------------------------------------------------
{
  const p = widgetSessionPayload({ id: ME, username: "ayse" }, "  tok-123  ", "https://des-call.onrender.com");
  assert.deepEqual(p, { token: "tok-123", apiBase: "https://des-call.onrender.com", userId: ME });
  assert.equal(widgetSessionPayload(null, "tok"), null, "signed out");
  assert.equal(widgetSessionPayload({ id: ME }, ""), null, "no token");
  assert.equal(widgetSessionPayload({ id: "bad id!" }, "tok"), null, "bad user id");
  assert.equal(widgetSessionPayload({ id: ME }, "a\nb"), null, "no header injection");
  assert.equal(widgetSessionPayload({ id: ME }, "x".repeat(5000)), null, "size cap");

  const first = widgetSessionPlan("", p);
  assert.equal(first.plan, "sync");
  assert.equal(widgetSessionPlan(first.key, p).plan, null, "same session: nothing to send");
  assert.equal(widgetSessionPlan(first.key, { ...p, token: "tok-456" }).plan, "sync", "token change");
  assert.equal(widgetSessionPlan(first.key, null).plan, "clear", "sign-out");
  assert.equal(widgetSessionPlan("", null).plan, null, "never signed in");
}

// ---- people and the call payload ---------------------------------------------------------------
{
  const friends = [{ id: "f-1", username: "kaan", displayName: "Kaan", avatarUrl: "https://cdn.x/k.png" }];
  const byId = new Map(friends.map((f) => [f.id, f]));
  assert.deepEqual(personOf({ id: "f-1", username: "Member" }, byId), { id: "f-1", name: "Kaan", avatarUrl: "https://cdn.x/k.png" }, "bare LiveKit member gets the friend's name");
  assert.equal(personOf({ id: "x y" }), null);
  assert.equal(personOf({ id: "f-2", avatarUrl: "http://plain/x.png", username: "ece" }).avatarUrl, "", "https avatars only");

  assert.deepEqual(widgetCallPayload({}), { active: false });

  const me = { id: ME, username: "ayse", displayName: "Ayşe" };
  const serverVoice = {
    isInVoice: true,
    activeChannelId: "c-1",
    activeServerId: "s-1",
    channelName: "Oyun Gecesi",
    muted: true,
    deafened: false,
    connecting: false,
    participants: [{ id: ME, username: "ayse" }, { id: "f-1", username: "Member" }, { id: "f-3", username: "deniz" }],
  };
  const sv = widgetCallPayload({
    serverVoice, me, friends, servers: [{ id: "s-1", name: "Gece Kuşu" }], speakers: ["f-1"], speakerScope: "c-1", startedAt: 1700000000000,
  });
  assert.equal(sv.active, true);
  assert.equal(sv.kind, "server");
  assert.equal(sv.title, "Oyun Gecesi");
  assert.equal(sv.subtitle, "Gece Kuşu", "server name for the notification line");
  assert.equal(sv.channelId, "c-1");
  assert.deepEqual(sv.participants.map((p) => p.id), ["f-1", "f-3"], "me is not a participant");
  assert.equal(sv.count, 3);
  assert.equal(sv.speaker?.name, "Kaan", "the person talking");
  assert.equal(sv.muted, true);
  assert.equal(sv.startedAt, 1700000000000);
  assert.equal(sv.me.id, ME);
  const otherScope = widgetCallPayload({ serverVoice, me, speakers: ["f-1"], speakerScope: "c-9" });
  assert.equal(otherScope.speaker, null, "speakers of another room are ignored");

  const dm = widgetCallPayload({ call: { mode: "active", peer: { id: "f-1", username: "kaan" }, muted: false, durationStartedAt: 1700000005000 }, me, friends });
  assert.equal(dm.kind, "dm");
  assert.equal(dm.title, "Kaan");
  assert.equal(dm.startedAt, 1700000005000, "the call's own start");
  assert.equal(widgetCallPayload({ call: { mode: "outgoing", peer: { id: "f-1" } }, me }).connecting, true);
  assert.equal(widgetCallPayload({ call: { mode: "incoming", peer: { id: "f-1" } }, me }).active, false, "ringing is not a call yet");

  const group = widgetCallPayload({ groupCall: { isInCall: true, isMuted: true, participants: [{ id: "f-1" }] }, me, friends, groupName: "Kampüs Ekibi" });
  assert.equal(group.kind, "group");
  assert.equal(group.title, "Kampüs Ekibi");
  assert.equal(group.muted, true);

  assert.equal(callIdentity(sv), callIdentity({ ...sv, muted: false, speaker: null }), "timer survives mute / speaker changes");
  assert.notEqual(callIdentity(sv), callIdentity({ ...sv, channelId: "c-2" }));
  assert.equal(callIdentity({ active: false }), "");

  const many = widgetCallPayload({ serverVoice: { ...serverVoice, participants: Array.from({ length: 20 }, (_, i) => ({ id: `p-${i}`, username: `u${i}` })) }, me });
  assert.equal(many.participants.length, 8, "capped for the notification / widget");
}

// ---- refresh events are real socket events --------------------------------------------------------
{
  const sources = [read("src/App.jsx"), read("src/hooks/useServerVoice.js")].join("\n");
  const backend = readdirSync(join(front, "backend"), { recursive: true })
    .filter((f) => String(f).endsWith(".js") && !String(f).includes("node_modules"))
    .map((f) => readFileSync(join(front, "backend", String(f)), "utf8"))
    .join("\n");
  for (const ev of REFRESH_EVENTS) {
    if (ev === "friend:wave") continue; // the widgets backend (iOS branch) adds it
    assert.ok(sources.includes(`"${ev}"`) || backend.includes(`"${ev}"`), `refresh event ${ev} exists`);
  }
}

// ---- plugin plumbing: Android only, never throws ---------------------------------------------------
{
  const calls = [];
  const fake = {
    setSession: async (a) => calls.push(["setSession", a]),
    clearSession: async () => calls.push(["clearSession"]),
    requestRefresh: async (a) => calls.push(["requestRefresh", a]),
    setCallState: async (a) => calls.push(["setCallState", a]),
  };
  __androidWidgetsForTests.setCoreImporter(async () => ({ registerPlugin: (name) => (name === WIDGETS_PLUGIN ? fake : null) }));
  globalThis.window = { Capacitor: { isNativePlatform: () => true, getPlatform: () => "ios" } };
  assert.equal(await setWidgetSession({ token: "t", userId: ME }), null, "iOS: no-op");
  assert.equal(calls.length, 0);
  globalThis.window.Capacitor.getPlatform = () => "android";
  await setWidgetSession({ token: "t", userId: ME, apiBase: "" });
  await requestWidgetRefresh("socket");
  await setWidgetCallState(null);
  await clearWidgetSession();
  assert.deepEqual(calls.map((c) => c[0]), ["setSession", "requestRefresh", "setCallState", "clearSession"]);
  assert.deepEqual(calls[2][1], { active: false });
  // A native build without the plugin method: null, not a throw.
  __androidWidgetsForTests.setCoreImporter(async () => ({ registerPlugin: () => ({}) }));
  assert.equal(await requestWidgetRefresh(), null);
  __androidWidgetsForTests.reset();

  // Widget / notification buttons run through the same action runner (startNativeIntents).
  const listeners = {};
  const completed = [];
  const widgetsPlugin = {
    addListener: async (ev, fn) => {
      listeners[ev] = fn;
      return { remove() {} };
    },
    takePendingActions: async () => ({ actions: [{ id: "a1", type: "openPath", payload: { path: "/direct/kaan" } }] }),
    completeAction: async (a) => completed.push(a),
  };
  __nativeIntentsForTests.setCoreImporter(async () => ({ registerPlugin: (name) => (name === "DescallWidgets" ? widgetsPlugin : {}) }));
  const navigated = [];
  let muted = 0;
  const ctxRef = {
    current: {
      navigate: (p) => navigated.push(p),
      getVoice: () => ({ serverVoice: { isInVoice: true, channelName: "Oyun", muted: false } }),
      callAction: (type) => {
        if (type === "toggleMute") muted += 1;
        return true;
      },
    },
  };
  const stop = startNativeIntents(ctxRef, { platform: "android", pluginName: "DescallWidgets" });
  for (let i = 0; i < 20 && !listeners.action; i++) await new Promise((r) => setTimeout(r, 5));
  for (let i = 0; i < 20 && !navigated.length; i++) await new Promise((r) => setTimeout(r, 5));
  assert.deepEqual(navigated, ["/direct/kaan"], "cold start: the queued widget tap opens the chat");
  await listeners.action({ id: "a2", type: "toggleMute", payload: {} });
  assert.equal(muted, 1, "the notification's Mute reaches the call");
  await listeners.action({ id: "a2", type: "toggleMute", payload: {} });
  assert.equal(muted, 1, "the same action id runs once");
  stop();
  __nativeIntentsForTests.reset();
  delete globalThis.window;
}

// ---- native: manifest ------------------------------------------------------------------------------------
const manifest = read(`${ANDROID}/AndroidManifest.xml`);
function block(nameFragment) {
  const i = manifest.indexOf(`android:name="${nameFragment}"`);
  assert.ok(i > 0, `manifest declares ${nameFragment}`);
  const start = manifest.lastIndexOf("<", i);
  const tag = manifest.slice(start + 1).match(/^[a-z-]+/)[0];
  const openEnd = manifest.indexOf(">", i);
  if (manifest[openEnd - 1] === "/") return manifest.slice(start, openEnd + 1);
  return manifest.slice(start, manifest.indexOf(`</${tag}>`, openEnd) + tag.length + 3);
}
const KINDS = [["friends", "Friends"], ["unread", "Unread"], ["voice", "Voice"], ["call", "Call"]];
for (const [kind, cls] of KINDS) {
  const b = block(`.widget.${cls}WidgetProvider`);
  assert.ok(b.startsWith("<receiver"), `${cls} provider is a receiver`);
  assert.ok(b.includes('android:exported="true"'), "providers are exported for the launcher");
  assert.ok(b.includes("android.appwidget.action.APPWIDGET_UPDATE"), `${cls}: APPWIDGET_UPDATE`);
  assert.ok(b.includes(`android:resource="@xml/widget_${kind}_info"`), `${cls}: provider info`);
  assert.ok(b.includes(`android:label="@string/widget_${kind}_label"`), `${cls}: label`);
  assert.ok(existsSync(join(front, `${WIDGET}/${cls}WidgetProvider.java`)), `${cls}WidgetProvider.java exists`);
}
assert.ok(block(".widget.WidgetActionReceiver").includes('android:exported="false"'), "the action receiver is private");
assert.ok(block(".widget.WidgetLaunchActivity").includes('android:exported="false"'), "the trampoline is private");
const cfg = block(".widget.WidgetConfigActivity");
assert.ok(cfg.includes("android.appwidget.action.APPWIDGET_CONFIGURE"), "settings answer APPWIDGET_CONFIGURE");
assert.ok(cfg.includes('android:theme="@style/WidgetConfigTheme"'), "AppCompat theme for the AppCompatActivity");
assert.ok(manifest.includes("android.permission.POST_PROMOTED_NOTIFICATIONS"), "Android 16 Live Updates permission");
assert.ok(/<service[^>]*CallForegroundService/.test(manifest.replace(/\s+/g, " ")), "call service still declared");

// ---- native: provider XML -------------------------------------------------------------------------------
const exists = (type, name) => {
  const dirs = readdirSync(join(front, RES)).filter((d) => d === type || d.startsWith(`${type}-`));
  return dirs.some((d) => readdirSync(join(front, RES, d)).some((f) => f.split(".")[0] === name));
};
const valuesText = readdirSync(join(front, RES))
  .filter((d) => d === "values" || d.startsWith("values-"))
  .flatMap((d) => readdirSync(join(front, RES, d)).map((f) => read(`${RES}/${d}/${f}`)))
  .join("\n");
const valueExists = (type, name) => new RegExp(`<${type}\\s+name="${name.replace(/_/g, "[._]")}"`).test(valuesText);
for (const [kind] of KINDS) {
  const x = read(`${RES}/xml/widget_${kind}_info.xml`);
  assert.ok(x.includes("<appwidget-provider"), `${kind} info is an appwidget-provider`);
  for (const [attr, type] of [["initialLayout", "layout"], ["previewLayout", "layout"]]) {
    const m = x.match(new RegExp(`android:${attr}="@${type}/([a-z0-9_]+)"`));
    assert.ok(m && exists(type, m[1]), `${kind}: ${attr} exists`);
  }
  const desc = x.match(/android:description="@string\/([a-z0-9_]+)"/);
  assert.ok(desc && valueExists("string", desc[1]), `${kind}: description string`);
  assert.ok(x.includes('android:configure="com.descall.app.widget.WidgetConfigActivity"'), `${kind}: settings activity`);
  assert.ok(x.includes('android:resizeMode="horizontal|vertical"'), `${kind}: resizable`);
  assert.ok(x.includes('android:updatePeriodMillis="0"'), `${kind}: no system polling (WorkManager refreshes)`);
  assert.ok(x.includes("reconfigurable"), `${kind}: Edit from the launcher`);
  assert.ok(/android:minWidth="\d+dp"/.test(x) && /android:minResizeWidth="110dp"/.test(x), `${kind}: resizes down to 2x2`);
}

// ---- native: layouts the launcher inflates only use RemoteViews classes ------------------------------
const REMOTE_OK = new Set(["FrameLayout", "LinearLayout", "RelativeLayout", "GridLayout", "TextView", "ImageView", "Button", "ImageButton", "Chronometer", "ProgressBar", "ViewFlipper", "ListView", "GridView", "StackView", "AdapterViewFlipper", "TextClock", "ViewStub"]);
const widgetLayouts = readdirSync(join(front, `${RES}/layout`)).filter((f) => f.startsWith("widget_"));
assert.ok(widgetLayouts.length >= 15, "widget layouts present");
for (const f of widgetLayouts) {
  const x = read(`${RES}/layout/${f}`);
  for (const m of x.matchAll(/<([A-Za-z.]+)[\s>]/g)) {
    if (m[1] === "?xml") continue;
    assert.ok(REMOTE_OK.has(m[1]), `${f}: <${m[1]}> is not allowed in RemoteViews`);
  }
  for (const m of x.matchAll(/@(drawable|string|dimen|color)\/([a-z0-9_]+)/g)) {
    const ok = m[1] === "drawable" ? exists("drawable", m[2]) : valueExists(m[1], m[2]);
    assert.ok(ok, `${f}: @${m[1]}/${m[2]} exists`);
  }
}
for (const size of ["s", "m", "l"]) {
  for (const [kind] of KINDS) assert.ok(widgetLayouts.includes(`widget_${kind}_${size}.xml`), `layout ${kind} ${size}`);
}

// ---- native: every R.* the widget code uses exists (a small resource linker) ---------------------------------
{
  const ids = new Set();
  for (const d of readdirSync(join(front, RES)).filter((d) => d.startsWith("layout"))) {
    for (const f of readdirSync(join(front, RES, d))) for (const m of read(`${RES}/${d}/${f}`).matchAll(/@\+id\/([A-Za-z0-9_]+)/g)) ids.add(m[1]);
  }
  const javaFiles = readdirSync(join(front, WIDGET)).map((f) => `${WIDGET}/${f}`).concat([`${JAVA}/CallForegroundService.java`]);
  let refs = 0;
  for (const f of javaFiles) {
    const src = read(f);
    for (const m of src.matchAll(/(?<![\w.])R\.(id|string|plurals|drawable|layout|color|dimen|style|xml)\.([A-Za-z0-9_]+)/g)) {
      refs += 1;
      const [, type, name] = m;
      const ok = type === "id" ? ids.has(name)
        : ["drawable", "layout", "xml"].includes(type) ? exists(type, name)
          : valueExists(type === "plurals" ? "plurals" : type, name);
      assert.ok(ok, `${f.split("/").pop()}: R.${type}.${name} exists`);
    }
  }
  assert.ok(refs > 200, "the linker saw the widget code");
}

// ---- native: strings in seven languages ----------------------------------------------------------------------
{
  const LOCALES = ["values", "values-tr", "values-de", "values-es", "values-fr", "values-pt-rBR", "values-ru"];
  const parse = (dir) => {
    const x = read(`${RES}/${dir}/widget_strings.xml`);
    const strings = new Map([...x.matchAll(/<string name="([^"]+)">([\s\S]*?)<\/string>/g)].map((m) => [m[1], m[2]]));
    const plurals = new Map([...x.matchAll(/<plurals name="([^"]+)">([\s\S]*?)<\/plurals>/g)].map((m) => [m[1], new Map([...m[2].matchAll(/<item quantity="([a-z]+)">([\s\S]*?)<\/item>/g)].map((q) => [q[1], q[2]]))]));
    return { strings, plurals, raw: x };
  };
  const holders = (t) => [...t.matchAll(/%(\d+\$)?[sd]/g)].map((m) => m[0]).sort().join(",");
  const en = parse("values");
  assert.ok(en.strings.size > 100 && en.plurals.size >= 9, "English source strings");
  for (const dir of LOCALES) {
    const loc = parse(dir);
    for (const [k, v] of en.strings) {
      assert.ok(loc.strings.has(k), `${dir}: string ${k}`);
      assert.equal(holders(loc.strings.get(k)), holders(v), `${dir}: ${k} placeholders`);
      assert.ok(!/(^|[^\\])'/.test(loc.strings.get(k)), `${dir}: ${k} apostrophe escaped`);
    }
    assert.equal(loc.strings.size, en.strings.size, `${dir}: no extra strings`);
    for (const [k, forms] of en.plurals) {
      const lf = loc.plurals.get(k);
      assert.ok(lf, `${dir}: plurals ${k}`);
      const need = dir === "values-ru" ? ["one", "few", "many", "other"] : ["one", "other"];
      for (const q of need) {
        assert.ok(lf.has(q), `${dir}: ${k} ${q}`);
        assert.equal(holders(lf.get(q)), holders(forms.get("other")), `${dir}: ${k} ${q} placeholders`);
      }
    }
    assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(loc.raw), `${dir}: no emoji`);
    assert.ok(!/valorant/i.test(loc.raw), `${dir}: wording rule`);
  }
  const tr = parse("values-tr");
  assert.equal(tr.strings.get("w_join"), "Katıl");
  assert.equal(tr.strings.get("w_here"), "Buradasın");
  assert.equal(tr.strings.get("cfg_color_dynamic"), "Dinamik renk");
  assert.equal(tr.strings.get("cfg_color_dark"), "Descall koyu");
}

// ---- native: plugin, build, host rule, call notification ------------------------------------------------------
{
  const main = read(`${JAVA}/MainActivity.java`);
  assert.ok(main.includes("registerPlugin(DescallWidgetsPlugin.class)"), "plugin registered in MainActivity");
  assert.ok(main.indexOf("registerPlugin(DescallWidgetsPlugin.class)") < main.indexOf("super.onCreate(savedInstanceState)"), "registered before the bridge starts");
  const plugin = read(`${WIDGET}/DescallWidgetsPlugin.java`);
  assert.ok(plugin.includes(`@CapacitorPlugin(name = "${WIDGETS_PLUGIN}")`), "JS and native plugin names match");
  for (const m of ["setSession", "clearSession", "requestRefresh", "setCallState", "getStatus", "takePendingActions", "completeAction"]) {
    assert.ok(new RegExp(`@PluginMethod\\s+public void ${m}\\(PluginCall`).test(plugin), `plugin method ${m}`);
  }
  assert.ok(!/call\.resolve\([^)]*token/i.test(plugin), "the token never goes back to JS");

  assert.ok(read("android/variables.gradle").includes("androidxWorkVersion"), "WorkManager version");
  assert.ok(read("android/app/build.gradle").includes('implementation "androidx.work:work-runtime:$androidxWorkVersion"'), "WorkManager dependency");

  const api = read(`${WIDGET}/WidgetApi.java`);
  const kit = read("ios/App/DescallKit/DescallKitLogic.swift");
  const iosHosts = [...kit.match(/exactHosts: Set<String> = \[([^\]]+)\]/)[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]).sort();
  const androidHosts = [...api.matchAll(/h\.equals\("([^"]+)"\)/g)].map((m) => m[1]).sort();
  assert.deepEqual(androidHosts, iosHosts, "same token host allowlist as DescallKit");
  assert.ok(api.includes('h.endsWith(".descall.com") && h.length() <= 64'), "same subdomain rule as DescallKit");
  assert.ok(api.includes("setInstanceFollowRedirects(false)"), "the token is never sent through a redirect");

  const store = read(`${WIDGET}/WidgetSessionStore.java`);
  assert.ok(store.includes('"AndroidKeyStore"') && store.includes("AES/GCM/NoPadding") && store.includes("MODE_PRIVATE"), "session encrypted with a Keystore key in private prefs");
  assert.ok(!/Log\.|System\.out/.test(store + api), "nothing logged");

  const repo = read(`${WIDGET}/WidgetRepository.java`);
  assert.ok(repo.includes("/api/native/summary?activity=1&previews=1") && repo.includes("/api/native/friends?activity=1"), "reuses /api/native with the widget extras");
  assert.ok(read(`${WIDGET}/WidgetActionReceiver.java`).includes('"/api/native/wave"') && read(`${WIDGET}/WidgetActionReceiver.java`).includes('.put("to", friendId)'), "wave uses POST /api/native/wave { to }");
  assert.ok(read(`${WIDGET}/WidgetScheduler.java`).includes("PERIOD_MINUTES = 30") && read(`${WIDGET}/WidgetScheduler.java`).includes("NetworkType.CONNECTED"), "30 min periodic refresh on network");

  const notif = read(`${WIDGET}/CallNotification.java`);
  assert.ok(notif.includes("CallStyle.forOngoingCall"), "CallStyle ongoing call");
  assert.ok(notif.includes("setRequestPromotedOngoing(true)") && notif.includes("ProgressStyle"), "Android 16 Live Update (promoted, progress while connecting)");
  assert.ok(notif.includes("ACTION_CALL_MUTE") && notif.includes("ACTION_CALL_LEAVE"), "mute and leave actions");
  const svc = read(`${JAVA}/CallForegroundService.java`);
  assert.ok(svc.includes("CallNotification.build"), "the service posts the rich notification");
  assert.ok(svc.includes("getString(R.string.n_call_channel)"), "channel name localized");

  const app = read("src/App.jsx");
  assert.ok(/useAndroidWidgets\(\{[\s\S]*?socket: socketApi[\s\S]*?\}\);/.test(app), "App wires useAndroidWidgets");
  assert.ok(read("src/hooks/useNativeIntents.js").includes('pluginName: "DescallWidgets"'), "widget actions run through useNativeIntents");
}

console.log("androidWidgets selftest ok");
