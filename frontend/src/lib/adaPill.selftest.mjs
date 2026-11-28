// Phone in-call pill "Ada" (lib/adaPill.js, lib/nativeCallAdapter.js, lib/callMinimize.js).
// node src/lib/adaPill.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ADA,
  adaChrome,
  adaEndedModel,
  adaEvents,
  adaFace,
  adaFromDmCall,
  adaFromGroupCall,
  adaFromServerVoice,
  adaGestureOnEnd,
  adaGestureOnMove,
  adaHoldProgress,
  adaLayout,
  adaLongPressAlive,
  adaRouteModel,
  adaVisible,
  isAdaPhone,
  pickAdaModel,
} from "./adaPill.js";
import { nativeCallAdapterKey, nativeCallAsCall } from "./nativeCallAdapter.js";
import { getCallMinimized, setCallMinimized, subscribeCallMinimized } from "./callMinimize.js";

const ECE = { id: "u-ece", username: "ece", displayName: "Ece", avatarUrl: "https://x/e.png" };
const KAAN = { id: "u-kaan", username: "kaan" };
const ZEY = { id: "u-zey", username: "zeynep", display_name: "Zeynep" };
const ME = { id: "u-me", username: "yigit" };

// ── DM call → model ─────────────────────────────────────────────────────────────
{
  assert.equal(adaFromDmCall(null), null);
  assert.equal(adaFromDmCall({ mode: null, peer: ECE }), null);
  assert.equal(adaFromDmCall({ mode: "incoming", peer: ECE }), null, "an incoming ring is CallKit's, not a pill");
  const live = adaFromDmCall({ mode: "active", peer: ECE, callType: "voice", muted: false, peerConnectionState: "connected", remoteMediaReady: true, durationStartedAt: 1000, connectionQuality: "good", networkStats: { rttMs: 38.4 } }, { speaking: true });
  assert.equal(live.source, "dm");
  assert.equal(live.key, "dm:u-ece");
  assert.equal(live.phase, "live");
  assert.equal(live.title, "Ece");
  assert.equal(live.speaker.avatarUrl, "https://x/e.png");
  assert.equal(live.speaking, true);
  assert.equal(live.rttMs, 38);
  assert.equal(live.callBack.kind, "dm");
  assert.equal(adaFromDmCall({ mode: "outgoing", peer: ECE }).phase, "ringing");
  assert.equal(adaFromDmCall({ mode: "active", peer: ECE, peerConnectionState: "reconnecting" }).phase, "reconnecting");
  assert.equal(adaFromDmCall({ mode: "active", peer: ECE, peerConnectionState: "connected", remoteMediaReady: false }).phase, "connecting");
  assert.equal(adaFromDmCall({ mode: "active", peer: ECE, ending: { at: 1 } }).phase, "ended");
  const sharing = adaFromDmCall({ mode: "active", peer: ECE, remoteScreenSharing: true, remoteMediaReady: true });
  assert.equal(sharing.screen.name, "Ece");
  assert.equal(adaFromDmCall({ mode: "active", peer: ECE, callType: "video", remoteCameraOn: true }).video, true);
  assert.equal(adaFromDmCall({ mode: "active", peer: ECE, callType: "voice", remoteCameraOn: true }).video, false);
  assert.equal(adaFromDmCall({ mode: "active", peer: ECE, peerConnectionState: "reconnecting" }, { speaking: true }).speaking, false, "no wave while reconnecting");
}

// ── native CallKit call → adapter → model (native vs JS source) ─────────────────
{
  assert.equal(nativeCallAsCall({ active: false }), null);
  const calls = [];
  const snap = { active: true, uuid: "aaaa", callerId: "u-ece", callerName: "Ece K.", phase: "connected", muted: false, connectedAt: 5000, mediaVerified: true };
  const route = { active: true, selected: "receiver", current: "receiver", routes: [{ id: "receiver", kind: "receiver", name: "" }, { id: "speaker", kind: "speaker", name: "" }] };
  const a = nativeCallAsCall(snap, { peer: ECE, route, setMuted: (v) => calls.push(["mute", v]), hangup: () => calls.push(["hangup"]), selectRoute: (id) => calls.push(["route", id]) });
  assert.equal(a.native, true);
  assert.equal(a.mode, "active");
  assert.equal(a.peer.avatarUrl, ECE.avatarUrl, "face from the friends list");
  assert.equal(a.durationStartedAt, 5000);
  assert.equal(a.peerConnectionState, "connected");
  assert.equal(a.remoteMediaReady, true);
  assert.equal(a.iosAudioRoute, route);
  a.toggleMute();
  a.endCall("ignored");
  a.selectIosRoute("speaker");
  assert.deepEqual(calls, [["mute", true], ["hangup"], ["route", "speaker"]]);
  const m = adaFromDmCall(a);
  assert.equal(m.source, "native");
  assert.equal(m.key, "native:u-ece");
  assert.equal(m.phase, "live");
  // Caller not in the friends list: CallKit's name, no username (no chat link).
  const stranger = nativeCallAsCall({ ...snap, callerId: "u-x" }, { peer: ECE });
  assert.equal(stranger.peer.id, "u-x");
  assert.equal(stranger.peer.displayName, "Ece K.");
  assert.equal(adaFromDmCall(stranger).title, "Ece K.");
  // Phases from the Swift engine.
  assert.equal(adaFromDmCall(nativeCallAsCall({ ...snap, phase: "reconnecting" })).phase, "reconnecting");
  assert.equal(adaFromDmCall(nativeCallAsCall({ ...snap, phase: "answering", connectedAt: null })).phase, "connecting");
  assert.equal(adaFromDmCall(nativeCallAsCall({ ...snap, mediaVerified: false })).phase, "connecting", "audio not verified both ways yet");
  assert.equal(adaFromDmCall(nativeCallAsCall({ ...snap, muted: true })).muted, true);
  // Memo key changes with what is drawn, not with metrics.
  const k1 = nativeCallAdapterKey(snap, ECE, route);
  assert.equal(k1, nativeCallAdapterKey({ ...snap, metrics: { x: 1 } }, ECE, route));
  assert.notEqual(k1, nativeCallAdapterKey({ ...snap, muted: true }, ECE, route));
  assert.notEqual(k1, nativeCallAdapterKey(snap, ECE, { ...route, selected: "speaker" }));
  assert.equal(nativeCallAdapterKey({ active: false }), "");
}

// ── group call / server voice → model ───────────────────────────────────────────
{
  assert.equal(adaFromGroupCall({ isInCall: false }), null);
  const gc = { isInCall: true, activeGroupId: "g1", isMuted: false, durationStartedAt: 10, participants: [ME, KAAN, ZEY, KAAN] };
  const g = adaFromGroupCall(gc, { me: ME, group: { id: "g1", name: "Gece Ekibi" }, speakerId: "u-zey", speakingIds: ["u-zey"] });
  assert.equal(g.key, "group:g1");
  assert.equal(g.title, "Gece Ekibi");
  assert.deepEqual(g.people.map((p) => p.id), ["u-kaan", "u-zey"], "me and duplicates out");
  assert.equal(g.count, 3);
  assert.equal(g.speaker.id, "u-zey");
  assert.equal(g.speaking, true);
  assert.equal(g.people[0].raw, undefined, "raw hook objects do not leak into the model");
  assert.equal(adaFromGroupCall(gc, { me: ME }).speaker.id, "u-kaan", "nobody talking: first face");
  const allDown = adaFromGroupCall({ ...gc, participants: [ME, { ...KAAN, connectionState: "reconnecting" }, { ...ZEY, connectionQuality: "failed" }] }, { me: ME });
  assert.equal(allDown.phase, "reconnecting");
  const oneDown = adaFromGroupCall({ ...gc, participants: [ME, { ...KAAN, connectionState: "reconnecting" }, ZEY] }, { me: ME });
  assert.equal(oneDown.phase, "live", "one peer's link is that peer's problem, not mine");
  const share = adaFromGroupCall({ ...gc, participants: [ME, { ...KAAN, isScreenSharing: true, screenStream: { id: "s" } }] }, { me: ME });
  assert.equal(share.screen.id, "u-kaan");
  assert.equal(share.screen.stream.id, "s");

  assert.equal(adaFromServerVoice({ isInVoice: false }), null);
  const sv = { isInVoice: true, activeChannelId: "c1", activeServerId: "s1", channelName: "Sohbet", liveKitLink: "connected", muted: false, participants: [ME, KAAN], channelType: "voice" };
  const s = adaFromServerVoice(sv, { me: ME, server: { id: "s1", name: "Gece Ekibi", iconUrl: null }, startedAt: 99 });
  assert.equal(s.key, "server:c1");
  assert.equal(s.serverName, "Gece Ekibi");
  assert.equal(s.count, 2);
  assert.equal(s.startedAt, 99);
  assert.deepEqual(s.callBack, { kind: "server", serverId: "s1", channel: { id: "c1", name: "Sohbet", type: "voice" } });
  assert.equal(adaFromServerVoice({ ...sv, liveKitLink: "reconnecting" }, { me: ME }).phase, "reconnecting");
  assert.equal(adaFromServerVoice({ ...sv, isInVoice: false, connecting: true }, { me: ME }).phase, "connecting");
}

// ── which call, when visible ────────────────────────────────────────────────────
{
  const dm = { source: "dm", key: "dm:1" };
  const native = { source: "native", key: "native:1" };
  const group = { source: "group", key: "group:1" };
  const server = { source: "server", key: "server:1" };
  assert.equal(pickAdaModel({ dm: native, group, server }), native, "native CallKit call owns the audio");
  assert.equal(pickAdaModel({ dm, group, server }), dm);
  assert.equal(pickAdaModel({ group, server }), group);
  assert.equal(pickAdaModel({ server }), server);
  assert.equal(pickAdaModel({}), null);
  assert.equal(adaVisible(dm, { minimized: false }), false, "full screen open: no pill");
  assert.equal(adaVisible(dm, { minimized: true }), true);
  assert.equal(adaVisible(native, { minimized: true }), true);
  assert.equal(adaVisible(server, { minimized: false, onVoiceRoute: false }), true, "voice channel: pill everywhere else");
  assert.equal(adaVisible(server, { onVoiceRoute: true }), false, "its own screen is the full screen");
  assert.equal(adaVisible(null, { minimized: true }), false);
}

// ── what the two ends show ──────────────────────────────────────────────────────
{
  const base = { source: "dm", phase: "live", people: [{ id: "a" }], muted: false, screen: null, video: false, count: 2 };
  assert.deepEqual(adaFace(base), { mode: "call", left: "face", right: "wave", tone: "green" });
  assert.equal(adaFace({ ...base, muted: true }).right, "mic-off");
  assert.equal(adaFace({ ...base, muted: true, screen: { id: "a" } }).right, "mic-off", "mute always visible, over a share");
  assert.equal(adaFace({ ...base, screen: { id: "a" } }).mode, "share");
  assert.equal(adaFace({ ...base, video: true }).right, "video");
  assert.deepEqual(adaFace({ ...base, phase: "reconnecting" }), { mode: "recon", left: "spinner", right: "signal", tone: "amber" });
  assert.deepEqual(adaFace({ ...base, phase: "ended" }), { mode: "ended", left: "end", right: "timer", tone: "red" });
  assert.equal(adaFace({ ...base, phase: "ringing" }).right, "dots");
  assert.equal(adaFace({ ...base, phase: "connecting", muted: true }).right, "mic-off");
  const grp = { ...base, source: "group", people: [{ id: "a" }, { id: "b" }], count: 4 };
  assert.deepEqual(adaFace(grp), { mode: "group", left: "stack", right: "count-wave", tone: "green", count: 4 });
  assert.equal(adaFace({ ...grp, muted: true }).count, 4, "group keeps the head count next to the red mic");
  assert.equal(adaFace({ ...grp, people: [{ id: "a" }] }).left, "face", "alone with one person: one face");
  assert.deepEqual(adaFace({ ...base, source: "server" }), { mode: "voice", left: "server", right: "wave", tone: "blue" });
  assert.equal(adaFace({ ...base, source: "native" }).mode, "call");
  assert.equal(adaFace(null), null);
}

// ── ended copy ──────────────────────────────────────────────────────────────────
{
  const last = { source: "dm", key: "dm:1", phase: "live", startedAt: 1000, stoppedAt: null, speaking: true, screen: { id: "x" }, video: true, callBack: { kind: "dm" } };
  const e = adaEndedModel(last, 253000);
  assert.equal(e.phase, "ended");
  assert.equal(e.key, "dm:1:ended");
  assert.equal(e.stoppedAt, 253000, "duration frozen at the end");
  assert.equal(e.speaking, false);
  assert.equal(e.screen, null);
  assert.equal(e.callBack.kind, "dm", "call back stays available");
  assert.equal(adaEndedModel(null), null);
}

// ── event bubbles ───────────────────────────────────────────────────────────────
{
  const g1 = { key: "group:1", source: "group", phase: "live", people: [{ id: "k", name: "Kaan" }], screen: null, video: false };
  const g2 = { ...g1, people: [{ id: "k", name: "Kaan" }, { id: "z", name: "Zeynep" }] };
  assert.deepEqual(adaEvents(g1, g2).map((e) => [e.kind, e.name]), [["joined", "Zeynep"]]);
  assert.deepEqual(adaEvents(g2, g1).map((e) => [e.kind, e.name]), [["left", "Zeynep"]]);
  assert.deepEqual(adaEvents(g1, { ...g1, phase: "reconnecting" }).map((e) => e.kind), ["reconnecting"]);
  assert.deepEqual(adaEvents({ ...g1, phase: "reconnecting" }, g1).map((e) => e.kind), ["reconnected"]);
  assert.deepEqual(adaEvents(g1, { ...g1, screen: { id: "k", name: "Kaan" } }).map((e) => [e.kind, e.name]), [["screen", "Kaan"]]);
  assert.deepEqual(adaEvents(g1, { ...g1, video: true }).map((e) => e.kind), ["video"]);
  assert.deepEqual(adaEvents(g1, { ...g1, key: "group:2", people: [] }), [], "another call: no join / leave noise");
  assert.deepEqual(adaEvents(null, g1), []);
  assert.deepEqual(adaEvents(g1, { ...g2, phase: "ended" }), []);
  const d1 = { key: "dm:1", source: "dm", phase: "live", people: [{ id: "e", name: "Ece" }], title: "Ece", screen: null, video: false };
  assert.deepEqual(adaEvents(d1, { ...d1, people: [] }), [], "a DM has no join / leave bubbles");
  assert.equal(adaEvents(d1, { ...d1, video: true })[0].name, "Ece");
}

// ── gestures ────────────────────────────────────────────────────────────────────
{
  assert.equal(adaGestureOnMove({ dx: 3, dy: 2 }), "still");
  assert.equal(adaGestureOnMove({ dx: 12, dy: 0 }), "moving");
  assert.equal(adaGestureOnMove({ dx: ADA.SWIPE_DX, dy: 4 }), "swipe");
  assert.equal(adaGestureOnMove({ dx: -ADA.SWIPE_DX - 10, dy: 10 }), "swipe", "both directions");
  assert.equal(adaGestureOnMove({ dx: 50, dy: 40 }), "moving", "diagonal is not a swipe");
  assert.equal(adaGestureOnMove({ dx: 4, dy: ADA.PULL_DY }), "pull");
  assert.equal(adaGestureOnMove({ dx: 0, dy: -ADA.PULL_DY }), "up");
  assert.equal(adaGestureOnEnd({ dx: 2, dy: 1, elapsedMs: 120 }), "tap");
  assert.equal(adaGestureOnEnd({ dx: 2, dy: 1, elapsedMs: ADA.LONG_PRESS_MS + 10 }), "none", "slow press without the panel is not a tap");
  assert.equal(adaGestureOnEnd({ dx: 0, dy: 40, elapsedMs: 200 }), "pull");
  assert.equal(adaGestureOnEnd({ dx: -60, dy: 3, elapsedMs: 200 }), "swipe");
  assert.equal(adaGestureOnEnd({ dx: 0, dy: 0, elapsedMs: 600, longPressed: true }), "none");
  assert.equal(adaGestureOnEnd({ dx: 20, dy: 15, elapsedMs: 100 }), "none");
  assert.equal(adaLongPressAlive({ dx: 5, dy: 5 }), true);
  assert.equal(adaLongPressAlive({ dx: 9, dy: 9 }), false);
  assert.equal(ADA.LONG_PRESS_MS, 350, "draft: 0.35 s");
  assert.equal(ADA.EVENT_MS, 2500, "draft: 2.5 s");
  assert.equal(ADA.PANEL_IDLE_MS, 5000, "draft: 5 s untouched closes the panel");
  assert.equal(ADA.MORPH_MS, 360);
  assert.equal(ADA.MORPH_REDUCED_MS, 160);
  assert.ok(ADA.TOUCH >= 44);
  assert.equal(adaHoldProgress(0), 0);
  assert.equal(adaHoldProgress(ADA.HOLD_END_MS / 2), 0.5);
  assert.equal(adaHoldProgress(ADA.HOLD_END_MS * 3), 1);
  assert.equal(adaHoldProgress(NaN), 0);
}

// ── geometry: never over the content, touch target >= 44 ───────────────────────
{
  const island = adaLayout({ safeTop: 59, viewportW: 393, platform: "ios" });
  assert.equal(island.kind, "island");
  assert.equal(island.reserve, 0, "Dynamic Island: content does not move");
  assert.equal(island.visualTop, 11);
  assert.equal(island.visualH, 37);
  assert.equal(island.width, 214);
  assert.ok(island.hitTop + island.hitH <= 59, "hit zone ends above the safe area (header untouched)");
  assert.ok(island.hitH >= 44);
  assert.equal(island.expandedPadTop, 56);
  assert.equal(adaLayout({ safeTop: 62, viewportW: 440, platform: "ios" }).kind, "island");
  assert.ok(adaLayout({ safeTop: 59, viewportW: 375, platform: "ios" }).width < 214, "narrower phones: narrower pill");

  for (const [safeTop, platform, kind] of [[47, "ios", "notch"], [50, "ios", "notch"], [20, "ios", "strip"], [0, "web", "strip"], [32, "android", "bar"], [24, "android", "bar"], [12, "android", "strip"]]) {
    const l = adaLayout({ safeTop, viewportW: 390, platform });
    assert.equal(l.kind, kind, `${platform} ${safeTop}`);
    assert.ok(l.hitH >= 44, `${kind}: touch target`);
    assert.ok(l.visualTop >= 0 && l.visualTop + l.visualH <= l.hitTop + l.hitH, `${kind}: pill inside its hit zone`);
    // Content starts at safeTop + reserve: the zone must end there or above (0 pt overlap).
    assert.ok(l.hitTop + l.hitH <= safeTop + l.reserve, `${kind}: 0 pt over the content`);
  }
  const notch = adaLayout({ safeTop: 47, viewportW: 390, platform: "ios" });
  assert.ok(notch.visualTop >= 30, "under the notch, not behind it");
}

// ── native chrome ───────────────────────────────────────────────────────────────
{
  const island = adaLayout({ safeTop: 59, viewportW: 393, platform: "ios" });
  assert.deepEqual(adaChrome({ visible: true, expanded: false, layout: island }), { statusBarHidden: false, scrollsToTop: false });
  assert.deepEqual(adaChrome({ visible: true, expanded: true, layout: island }), { statusBarHidden: true, scrollsToTop: false }, "panel open: status glyphs step aside");
  assert.deepEqual(adaChrome({ visible: false }), { statusBarHidden: false, scrollsToTop: true });
  assert.equal(adaChrome({ visible: true, expanded: true, layout: adaLayout({ safeTop: 20, platform: "ios" }) }).statusBarHidden, false, "strip sits below the status bar");
}

// ── output (audio route) button ─────────────────────────────────────────────────
{
  const two = { active: true, selected: "receiver", current: "receiver", routes: [{ id: "receiver", kind: "receiver" }, { id: "speaker", kind: "speaker" }] };
  const r = adaRouteModel({ ios: two });
  assert.equal(r.native, true);
  assert.equal(r.action, "toggle");
  assert.equal(r.toggleTo, "speaker");
  assert.equal(r.current.kind, "receiver", "shows what really plays");
  assert.equal(r.speakerOn, false);
  const sp = adaRouteModel({ ios: { ...two, selected: "speaker" } });
  assert.equal(sp.toggleTo, "receiver");
  assert.equal(sp.speakerOn, true);
  const bt = adaRouteModel({ ios: { active: true, selected: "input:bt1", current: "bluetooth", routes: [...two.routes, { id: "input:bt1", kind: "bluetooth", name: "AirPods Pro" }] } });
  assert.equal(bt.action, "menu", "three routes: a menu");
  assert.equal(bt.current.name, "AirPods Pro");
  // "selected" unknown: fall back to the current output kind.
  const fallback = adaRouteModel({ ios: { active: true, selected: "", current: "speaker", routes: two.routes } });
  assert.equal(fallback.current.id, "speaker");
  const none = adaRouteModel({ ios: null, webDevices: [] });
  assert.equal(none.action, "none");
  const web = adaRouteModel({ webDevices: [{ deviceId: "default", label: "Default" }, { deviceId: "a", label: "Speakers" }, { deviceId: "b", label: "Headset" }], webSelected: "b" });
  assert.equal(web.action, "menu");
  assert.equal(web.current.id, "b");
}

// ── phone gate ──────────────────────────────────────────────────────────────────
{
  assert.equal(isAdaPhone({ screenShort: 393, native: true }), true);
  assert.equal(isAdaPhone({ screenShort: 390, coarse: true }), true, "mobile web phone");
  assert.equal(isAdaPhone({ screenShort: 820, native: true }), false, "iPad keeps the mini card");
  assert.equal(isAdaPhone({ screenShort: 390, coarse: false, native: false }), false, "narrow desktop window keeps the mini card");
  assert.equal(isAdaPhone({ screenShort: 1080, coarse: false }), false);
}

// ── minimize store ──────────────────────────────────────────────────────────────
{
  let n = 0;
  const off = subscribeCallMinimized(() => { n += 1; });
  assert.equal(getCallMinimized(), false);
  setCallMinimized(true);
  setCallMinimized(true);
  assert.equal(getCallMinimized(), true);
  setCallMinimized(false);
  assert.equal(n, 2, "no notify without a change");
  off();
  setCallMinimized(true);
  assert.equal(n, 2);
  setCallMinimized(false);
}

// ── wiring ──────────────────────────────────────────────────────────────────────
{
  const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
  const overlay = read("../components/CallOverlay.jsx");
  assert.match(overlay, /useSyncExternalStore\(subscribeCallMinimized, getCallMinimized, getCallMinimized\)/, "minimize shared with the pill");
  assert.match(overlay, /if \(minimized && adaPhone\)/, "phones: no mini card, the pill draws it");
  const host = read("../components/calls/AdaCallHost.jsx");
  assert.match(host, /setCallMinimized\(false\)/, "the pill brings the full screen back");
  assert.match(host, /serverPath\(m\.serverId, m\.channelId\)/, "voice channel: its own screen");
  assert.match(host, /selectIosRoute\?\.\(id\)/, "output = native route API");
  const pill = read("../components/calls/AdaPill.jsx");
  assert.match(pill, /role="button"/);
  assert.match(pill, /aria-modal="true"/);
  assert.match(pill, /setCallIslandChrome\(adaChrome/);
  assert.doesNotMatch(pill, /t\("[A-Z]/, "copy is in the ada.* catalog");
  const css = read("../components/calls/AdaPill.css");
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /\.ada-panel \{[^}]*background: #000;/, "opaque panel");
  assert.match(css, /html\.ada-reserve #root/);
  const swift = read("../../ios/App/App/DescallDisplayPlugin.swift");
  assert.match(swift, /CAPPluginMethod\(name: "setCallIsland"/);
  const vc = read("../../ios/App/App/DescallBridgeViewController.swift");
  assert.match(vc, /override var prefersStatusBarHidden: Bool/);
  assert.match(vc, /scrollView\.scrollsToTop = scrollsToTop/);
  for (const lc of ["tr", "en", "de", "es", "fr", "pt-BR", "ru"]) {
    const cat = read(`../i18n/locales/ada.${lc}.js`);
    assert.match(cat, /"callBack"/, lc);
    assert.doesNotMatch(cat, /\p{Extended_Pictographic}/u, `${lc}: no emoji`);
  }
}

// ── copy (Turkish UI) ───────────────────────────────────────────────────────────
{
  globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
  const { loadI18nCatalogs } = await import("../i18n/index.js");
  const { setRuntimeLocale, t } = await import("../i18n/runtime.js");
  await loadI18nCatalogs("tr");
  setRuntimeLocale("tr");
  assert.equal(t("ada.btn.callBack"), "Geri ara");
  assert.equal(t("ada.btn.full"), "Tam ekran");
  assert.equal(t("ada.btn.chat"), "Sohbete git");
  assert.equal(t("ada.event.joined", { name: "Kaan" }), "Kaan katıldı");
  assert.equal(t("ada.sub.people", { count: 4 }), "4 kişi");
}

console.log("adaPill.selftest ok");
