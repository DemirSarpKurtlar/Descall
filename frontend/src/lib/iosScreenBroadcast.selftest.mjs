// iOS whole-screen sharing (docs/ios-screen-share.md): companion identity mapping,
// capability detection, share phase machine, picker anchor, wiring.
// Run from frontend/: node src/lib/iosScreenBroadcast.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SCREEN_COMPANION_SUFFIX,
  isScreenCompanionIdentity,
  parseLiveKitIdentity,
  routeLiveKitTrack,
  screenCompanionIdentity,
  speakerIdsWithoutCompanions,
} from "./screenCompanion.js";
import {
  INITIAL_SHARE_STATE,
  SHARE_PHASES,
  anchorFromRect,
  broadcastUnavailableReason,
  formatShareElapsed,
  nativeErrorKey,
  nextShareState,
  screenShareCapability,
  shareTransition,
  tokenErrorKey,
} from "./iosScreenBroadcastModel.js";

const here = dirname(fileURLToPath(import.meta.url));
const src = (rel) => readFileSync(join(here, rel), "utf8");

// --- companion identity (same rules as backend/lib/screenCompanion.js) ---
assert.equal(SCREEN_COMPANION_SUFFIX, ":screen");
assert.equal(screenCompanionIdentity("8f1c-uuid"), "8f1c-uuid:screen");
assert.equal(screenCompanionIdentity(""), null);
assert.equal(screenCompanionIdentity(null), null);
assert.equal(screenCompanionIdentity("a:b"), null);
assert.deepEqual(parseLiveKitIdentity("u1"), { userId: "u1", companion: null });
assert.deepEqual(parseLiveKitIdentity("u1:screen"), { userId: "u1", companion: "screen" });
assert.deepEqual(parseLiveKitIdentity(":screen"), { userId: ":screen", companion: null }, "no owner = not a companion");
assert.deepEqual(parseLiveKitIdentity("a:b:screen"), { userId: "a:b:screen", companion: null }, "never maps onto someone else");
assert.deepEqual(parseLiveKitIdentity(""), { userId: null, companion: null });
assert.equal(isScreenCompanionIdentity("u1:screen"), true);
assert.equal(isScreenCompanionIdentity("u1"), false);
assert.deepEqual(speakerIdsWithoutCompanions(["u1", "u2:screen", null, "u3"]), ["u1", "u3"]);

// Companion tracks are the owner's screen; my own companion is ignored (no self-subscribe).
assert.deepEqual(routeLiveKitTrack({ identity: "u2:screen", classifiedRole: "camera", myUserId: "u1" }), {
  userId: "u2",
  role: "screen",
  ignore: false,
  companion: true,
});
assert.equal(routeLiveKitTrack({ identity: "u1:screen", classifiedRole: "camera", myUserId: "u1" }).ignore, true);
assert.deepEqual(routeLiveKitTrack({ identity: "u2", classifiedRole: "mic", myUserId: "u1" }), {
  userId: "u2",
  role: "mic",
  ignore: false,
  companion: false,
});
assert.equal(routeLiveKitTrack({ identity: "", myUserId: "u1" }).ignore, true);

// --- capability ---
assert.equal(screenShareCapability({ nativeIos: false, hasDisplayMedia: true }), "web");
assert.equal(screenShareCapability({ nativeIos: false, hasDisplayMedia: false }), "none");
assert.equal(screenShareCapability({ nativeIos: true, pluginAvailable: false }), "none", "old app build: button hidden");
assert.equal(
  screenShareCapability({ nativeIos: true, pluginAvailable: true, status: null }),
  "none",
  "status not loaded yet: hidden until the native side answers"
);
assert.equal(
  screenShareCapability({ nativeIos: true, pluginAvailable: true, status: { available: false, reason: "no-extension" } }),
  "none",
  "extension not shipped in this build"
);
assert.equal(screenShareCapability({ nativeIos: true, pluginAvailable: true, status: { available: true } }), "broadcast");
assert.equal(screenShareCapability({ nativeIos: true, pluginAvailable: false, hasDisplayMedia: true }), "web");
assert.equal(broadcastUnavailableReason({ nativeIos: false }), "not-ios");
assert.equal(broadcastUnavailableReason({ nativeIos: true, pluginAvailable: false }), "old-build");
assert.equal(broadcastUnavailableReason({ nativeIos: true, pluginAvailable: true, status: { available: false, reason: "no-app-group" } }), "no-app-group");
assert.equal(broadcastUnavailableReason({ nativeIos: true, pluginAvailable: true, status: { available: true } }), null);

// --- phase machine ---
assert.deepEqual(SHARE_PHASES, ["idle", "preparing", "picker", "live", "stopping"]);
let st = INITIAL_SHARE_STATE;
st = nextShareState(st, { type: "request" });
assert.equal(st.phase, "preparing");
assert.equal(nextShareState(st, { type: "request" }), st, "double tap does not restart");
st = nextShareState(st, { type: "native", phase: "connecting" });
assert.equal(st.phase, "preparing");
st = nextShareState(st, { type: "native", phase: "waiting" });
assert.equal(st.phase, "picker");
const live = nextShareState(st, { type: "native", phase: "live", at: 1000 });
assert.equal(live.phase, "live");
assert.equal(live.startedAt, 1000);
assert.equal(shareTransition(st, live), "started");
assert.equal(nextShareState(live, { type: "native", phase: "waiting" }), live, "a late waiting never pulls a live share back");
assert.equal(nextShareState(live, { type: "native", phase: "live", at: 5000 }).startedAt, 1000, "timer keeps its start");
const stopping = nextShareState(live, { type: "stop" });
assert.equal(stopping.phase, "stopping");
assert.equal(shareTransition(live, stopping), null, "still published while stopping");
assert.equal(nextShareState(stopping, { type: "native", phase: "live" }), stopping, "stop wins over a late live");
const ended = nextShareState(stopping, { type: "native", phase: "ended", reason: "user-stopped" });
assert.equal(ended.phase, "idle");
assert.equal(ended.error, null, "user stop is not an error");
assert.equal(shareTransition(stopping, ended), "stopped");
// Control Center stop while live.
assert.equal(shareTransition(live, nextShareState(live, { type: "native", phase: "ended" })), "stopped");
// Picker dismissed: native times out quietly, nothing was ever published.
const timedOut = nextShareState({ ...INITIAL_SHARE_STATE, phase: "picker" }, { type: "native", phase: "ended", reason: "picker-timeout" });
assert.equal(timedOut.phase, "idle");
assert.equal(timedOut.error, null);
assert.equal(shareTransition({ ...INITIAL_SHARE_STATE, phase: "picker" }, timedOut), null, "no stop event for a share that never started");
// Cancel from the picker: stopping without ever going live sends nothing.
const pickerStop = nextShareState({ ...INITIAL_SHARE_STATE, phase: "picker" }, { type: "stop" });
assert.equal(pickerStop.phase, "stopping");
assert.equal(shareTransition({ ...INITIAL_SHARE_STATE, phase: "picker" }, pickerStop), null);
assert.equal(shareTransition(pickerStop, nextShareState(pickerStop, { type: "native", phase: "ended", reason: "user-stopped" })), null);
// Native failure maps to a translated error.
const failed = nextShareState(live, { type: "native", phase: "error", reason: "connect-failed" });
assert.equal(failed.phase, "idle");
assert.equal(failed.error, "iosShare.errConnection");
assert.equal(nextShareState(INITIAL_SHARE_STATE, { type: "fail", error: "iosShare.errNotInChannel" }).error, "iosShare.errNotInChannel");
assert.equal(nextShareState(INITIAL_SHARE_STATE, { type: "stop" }), INITIAL_SHARE_STATE);
assert.equal(nextShareState(st, { type: "native", phase: "bogus" }), st);
assert.equal(nextShareState(live, { type: "reset" }), INITIAL_SHARE_STATE);

assert.equal(tokenErrorKey("NOT_IN_CHANNEL"), "iosShare.errNotInChannel");
assert.equal(tokenErrorKey("MISSING_PERMISSION"), "iosShare.errPermission");
assert.equal(tokenErrorKey("RATE_LIMITED"), "iosShare.errRateLimited");
assert.equal(tokenErrorKey("SFU_REQUIRED"), "iosShare.errNeedsSfu");
assert.equal(tokenErrorKey("http-500"), "iosShare.errGeneric");
assert.equal(nativeErrorKey("picker-timeout"), null);
assert.equal(nativeErrorKey("no-extension"), "iosShare.errUnavailable");
assert.equal(nativeErrorKey("room-disconnected"), "iosShare.errConnection");
assert.equal(nativeErrorKey(null), null);

// --- picker anchor (iPad popover source) + timer ---
assert.deepEqual(anchorFromRect({ left: 10.4, top: 700.6, width: 44, height: 44 }), { x: 10, y: 701, width: 44, height: 44 });
assert.deepEqual(anchorFromRect({ x: -3, y: 5, width: 0.4, height: 2 }), { x: 0, y: 5, width: 1, height: 2 });
assert.equal(anchorFromRect({ left: 1, top: 1, width: 0, height: 10 }), null);
assert.equal(anchorFromRect(null), null);
assert.equal(formatShareElapsed(null), "0:00");
assert.equal(formatShareElapsed(0, 65_000), "0:00", "no start = 0:00");
assert.equal(formatShareElapsed(1, 65_001), "1:05");
assert.equal(formatShareElapsed(1000, 1000 + 3_725_000), "1:02:05");

// --- wiring ---
const hook = src("../hooks/useServerVoice.js");
assert.match(hook, /routeLiveKitTrack\(\{ identity: participant\?\.identity/, "TrackSubscribed maps companions");
assert.match(hook, /parsed\.companion === "screen"/, "a companion leaving clears only the share");
assert.match(hook, /speakerIdsWithoutCompanions\(/);
assert.match(hook, /nativeBroadcastSupported\(\)/, "Share Screen goes native on iOS");
assert.match(hook, /livekit-screen-token/);
assert.match(hook, /stopNativeBroadcast\("left-channel"\)/, "leaving voice ends the broadcast");
const panel = src("../components/servers/ServerVoicePanel.jsx");
assert.match(panel, /screenShareUnavailableOnIos\(\) && shareCapability !== "broadcast"/, "hidden only without the extension");
assert.match(panel, /<IosBroadcastShareChip/);
const plugin = readFileSync(join(here, "../../ios/App/App/DescallScreenBroadcastPlugin.swift"), "utf8");
assert.match(plugin, /jsName = "DescallScreenBroadcast"/);
for (const method of ["getStatus", "start", "stop"]) {
  assert.match(plugin, new RegExp(`CAPPluginMethod\\(name: "${method}"`), `plugin method ${method}`);
}
for (const phase of ["connecting", "waiting", "live", "stopping", "ended", "error", "orphan"]) {
  assert.ok(plugin.includes(`"${phase}"`) || src("../../ios/App/App/DescallScreenBroadcastLogic.swift").includes(`"${phase}"`), `native emits ${phase}`);
}
const bridge = src("../../ios/App/App/DescallBridgeViewController.swift");
assert.match(bridge, /registerPluginInstance\(DescallScreenBroadcastPlugin\(\)\)/);

for (const loc of ["en", "tr", "de", "es", "fr", "pt-BR", "ru"]) {
  const file = src(`../i18n/locales/iosShare.${loc}.js`);
  const keys = [...file.matchAll(/^ {2}"([A-Za-z]+)":/gm)].map((m) => m[1]);
  assert.equal(keys.length, 18, `iosShare.${loc}.js has every key`);
  assert.match(src(`../i18n/locales/${loc}.js`), /iosShare/, `${loc} catalog includes iosShare`);
}

console.log("iosScreenBroadcast selftest: ok");
