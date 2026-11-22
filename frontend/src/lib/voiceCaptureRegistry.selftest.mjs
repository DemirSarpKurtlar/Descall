/**
 * Run: node frontend/src/lib/voiceCaptureRegistry.selftest.mjs
 * Opening Settings during a call must not cut the call's microphone
 * (feedback: "ayarlara girdigimde sesim bir daha arkadaslarima gitmiyor",
 * iOS 3.7.43, every time). Covers the registry rules and that UserPanel and
 * the call paths use them.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  _resetVoiceCaptures,
  hasLiveVoiceCapture,
  isNativeIosShell,
  liveVoiceCaptureTrack,
  micTestPlan,
  registerVoiceCapture,
  shouldProbeMicForLabels,
} from "./voiceCaptureRegistry.js";

const track = (readyState = "live") => ({ kind: "audio", readyState });
const stream = (...tracks) => ({ getAudioTracks: () => tracks });

// Registry: live tracks are remembered, ended ones drop out.
_resetVoiceCaptures();
assert.equal(hasLiveVoiceCapture(), false);
const t1 = track();
registerVoiceCapture(stream(t1));
assert.equal(liveVoiceCaptureTrack(), t1);
t1.readyState = "ended";
assert.equal(hasLiveVoiceCapture(), false, "ended capture is not live");
registerVoiceCapture(stream(track("ended")));
assert.equal(hasLiveVoiceCapture(), false, "already ended tracks are ignored");
registerVoiceCapture(null);
registerVoiceCapture({});
assert.equal(hasLiveVoiceCapture(), false);

// Label probe: never in the iOS app, never during a call, not when labels are readable.
const noLabels = [{ kind: "audioinput", label: "" }, { kind: "audiooutput", label: "" }];
const labels = [{ kind: "audioinput", label: "Built-in Microphone" }];
assert.equal(shouldProbeMicForLabels({ devices: noLabels }), true);
assert.equal(shouldProbeMicForLabels({ devices: noLabels, nativeIos: true }), false);
assert.equal(shouldProbeMicForLabels({ devices: noLabels, liveCapture: true }), false);
assert.equal(shouldProbeMicForLabels({ devices: labels }), false);
assert.equal(shouldProbeMicForLabels(), true);

// Mic test: during a call it meters a clone and never owns the shared session.
assert.deepEqual(micTestPlan({ callTrack: track() }), { mode: "clone", ownsSession: false });
assert.deepEqual(micTestPlan({ callTrack: track("ended") }), { mode: "acquire", ownsSession: true });
assert.deepEqual(micTestPlan(), { mode: "acquire", ownsSession: true });

// iOS shell detection.
const cap = (platform, native = true) => ({ Capacitor: { isNativePlatform: () => native, getPlatform: () => platform } });
assert.equal(isNativeIosShell(cap("ios")), true);
assert.equal(isNativeIosShell(cap("android")), false);
assert.equal(isNativeIosShell(cap("ios", false)), false);
assert.equal(isNativeIosShell({}), false);
assert.equal(isNativeIosShell(null), false);

// Wiring: the bugs were in these call sites.
const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, p), "utf8");
const panel = read("../components/layout/UserPanel.jsx");
const stopBody = panel.slice(panel.indexOf("const stopMicTest = useCallback"), panel.indexOf("useEffect(() => () => stopMicTest()"));
assert.ok(stopBody.length > 0, "stopMicTest found");
assert.match(
  stopBody,
  /if \(!hadTest \|\| !ownsSession\) return;[\s\S]*disposeNoiseSuppressionSession/,
  "stopMicTest disposes the noise suppression session only when the test opened it"
);
const refreshBody = panel.slice(panel.indexOf("const refreshDevices = useCallback"), panel.indexOf("const startMicTest = useCallback"));
assert.match(refreshBody, /shouldProbeMicForLabels\(\{[\s\S]*nativeIos: isNativeIosShell\(\)[\s\S]*liveCapture: hasLiveVoiceCapture\(\)/, "label probe is guarded");
const gumBeforeGuard = refreshBody.indexOf("getUserMedia({ audio: true })") < refreshBody.indexOf("shouldProbeMicForLabels(");
assert.equal(gumBeforeGuard, false, "no unguarded capture before the probe check");
const startBody = panel.slice(panel.indexOf("const startMicTest = useCallback"), panel.indexOf("const stopMicTest = useCallback"));
assert.match(startBody, /micTestPlan\(\{ callTrack \}\)/);
assert.match(startBody, /callTrack\.clone\(\)/);
assert.match(startBody, /voiceCapture: false/, "the mic test's own capture is not registered as a call");

const ns = read("noiseSuppression.js");
assert.match(ns, /registerVoiceCapture\(raw\)/, "call captures are registered");
const useCall = read("../hooks/useCall.js");
assert.match(useCall, /getUserMedia: async \(constraints\) => \{[\s\S]{0,200}registerVoiceCapture\(fresh\)/, "iOS mic refresh tracks are registered");

const kit = read("../premium/ui/PremiumAudioKit.jsx");
const kitHook = kit.slice(kit.indexOf("export function useMicTestStream"), kit.indexOf("export function useAudioDevices"));
assert.ok(kitHook.indexOf("liveVoiceCaptureTrack()") > -1 && kitHook.indexOf("liveVoiceCaptureTrack()") < kitHook.indexOf(".getUserMedia("), "Descall+ meters reuse the call track before capturing");

console.log("voiceCaptureRegistry selftest ok");
