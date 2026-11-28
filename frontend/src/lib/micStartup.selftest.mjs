/**
 * 4.2.1: nothing asks for the microphone before the user asks for it.
 *
 * A brand-new iOS user (4.1.4, no call yet) wrote "Mikrofona izin veriyorum".
 * The microphone may only be requested by an explicit action: starting or
 * answering a call, joining voice, recording a voice note, the voice settings
 * test, a screen share or a clip. This test pins every getUserMedia call site
 * to that list (a new one fails until it is reviewed here) and checks that the
 * start-up paths (boot, App shell, Başla panosu / onboarding, Descall+ audio
 * bridge) never capture.
 * Run: node frontend/src/lib/micStartup.selftest.mjs
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { shouldProbeMicForLabels } from "./voiceCaptureRegistry.js";

const src = join(dirname(fileURLToPath(import.meta.url)), "..");
const rel = (p) => relative(src, p).split("\\").join("/");

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(js|jsx|mjs)$/.test(name) && !/\.(selftest|test)\./.test(name)) out.push(p);
  }
  return out;
}

/** Source without comments (enough for call-site matching). */
function code(file) {
  return readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
}

const CAPTURE = /getUserMedia\s*(\?\.)?\s*\(|getUserMedia:\s*async/;

// file -> the user action that captures there.
const ALLOWED = {
  "components/chat/MessageComposer.jsx": "voice note: the Mic button (startRecording) and its retry",
  "components/layout/UserPanel.jsx": "Settings > Voice: the mic test button; device labels on the web only while the Voice tab is open",
  "hooks/useCall.js": "DM call: start / answer / camera / device switch",
  "hooks/useGroupCall.js": "group call: start / answer / join / camera / device switch",
  "hooks/useServerVoice.js": "server voice: join / unmute / camera / device switch",
  "lib/cameraFacing.js": "camera flip in a call (getUserMedia is injected)",
  "lib/iosCallMic.js": "iOS call microphone recovery during a call (injected)",
  "lib/noiseSuppression.js": "acquireVoiceMicStream, called by the call / voice hooks above",
  "lib/voiceMicError.js": "the toast's Allow button after a refused capture",
  "lib/webrtcScreenShare.js": "screen share (desktop capture)",
  "premium/gaming/instantClip.js": "Descall+ instant clip (desktop capture)",
  "premium/ui/PremiumAudioKit.jsx": "Descall+ noise gate test button (useMicTestStream)",
};

const files = walk(src);
const callers = files.filter((f) => CAPTURE.test(code(f))).map(rel).sort();
for (const f of callers) {
  assert.ok(ALLOWED[f], `${f} calls getUserMedia: add it to ALLOWED with the user action that triggers it, or remove the call`);
}
for (const f of Object.keys(ALLOWED)) {
  assert.ok(callers.includes(f), `${f} no longer captures: drop it from ALLOWED`);
}

// Start-up paths never capture, directly or through the voice helpers.
const STARTUP = [
  "main.jsx",
  "App.jsx",
  "i18n/boot.js",
  "premium/usePremiumAudioBridge.js",
  ...files.map(rel).filter((f) => f.startsWith("components/onboarding/")),
];
const STARTUP_CAPTURE = /getUserMedia|acquireVoiceMicStream|useMicTestStream|startMicTest|startRecording/;
for (const f of STARTUP) {
  assert.ok(!STARTUP_CAPTURE.test(code(join(src, f))), `${f} must not request the microphone at start-up`);
}
assert.ok(STARTUP.some((f) => f.startsWith("components/onboarding/")), "onboarding (Başla panosu) files are covered");

// Voice note: only the Mic button (and the toast's retry) starts a recording.
const composer = code(join(src, "components/chat/MessageComposer.jsx"));
const starts = composer.match(/startRecording(Ref\.current\?\.)?\(\)/g) || [];
assert.equal(starts.length, 2, "startRecording(): the Mic button's onClick and the Allow retry");
assert.match(composer, /onClick=\{\(\) => \{\s*if \(!canVoiceHere\) \{[\s\S]*?startRecording\(\);/, "the Mic button");

// Voice settings: devices are listed only while the Voice tab is open, the mic test only on its button.
const panel = code(join(src, "components/layout/UserPanel.jsx"));
assert.match(panel, /if \(activeTab !== "voice"\) \{\s*stopMicTest\(\);\s*return undefined;\s*\}\s*refreshDevices\(\);/);
assert.equal((panel.match(/startMicTest\b/g) || []).length, 2, "startMicTest: defined once, used by its button only");
assert.match(panel, /onClick=\{startMicTest\}/);
// The label probe never runs in the iOS app or during a call.
assert.equal(shouldProbeMicForLabels({ devices: [{ kind: "audioinput", label: "" }], nativeIos: true }), false);
assert.equal(shouldProbeMicForLabels({ devices: [{ kind: "audioinput", label: "" }], liveCapture: true }), false);
assert.equal(shouldProbeMicForLabels({ devices: [{ kind: "audioinput", label: "Mic" }] }), false);

// Descall+ noise gate: the test stream is off until its button turns it on.
const gate = code(join(src, "premium/settings/noise_gate.jsx"));
assert.match(gate, /const \[testing, setTesting\] = useState\(false\);\s*const \{ stream, error \} = useMicTestStream\(testing,/);

// iOS shell: the web view's media capture answer is the app's own (granted for the
// bundled page only, never a WebKit prompt), installed before the page can capture.
const ios = join(src, "..", "ios");
const bridgeVc = readFileSync(join(ios, "App", "App", "DescallBridgeViewController.swift"), "utf8");
assert.match(bridgeVc, /override open func viewDidLoad\(\) \{\s*super\.viewDidLoad\(\)\s*installMediaCapturePolicy\(\)/);
assert.match(bridgeVc, /webView\.uiDelegate = proxy/);
assert.match(bridgeVc, /decisionHandler\(decision == \.grant \? \.grant : \.deny\)/);
assert.ok(!/decisionHandler\(\.prompt\)/.test(bridgeVc), "never a second (WebKit) microphone prompt");
assert.match(bridgeVc, /override func forwardingTarget\(for aSelector: Selector!\) -> Any\?/, "everything else still reaches Capacitor's delegate");
const pbx = readFileSync(join(ios, "App", "App.xcodeproj", "project.pbxproj"), "utf8");
assert.equal(pbx.split("\n").filter((l) => l.includes("DescallMediaCaptureLogic.swift")).length, 4, "logic file is in the App target (build file, file ref, group, sources)");
const iosCi = readFileSync(join(src, "..", "..", ".github", "workflows", "ios-build-check.yml"), "utf8");
assert.match(iosCi, /App\/App\/DescallMediaCaptureLogic\.swift selftest\/mediacapture\/main\.swift/);
const display = readFileSync(join(ios, "App", "App", "DescallDisplayPlugin.swift"), "utf8");
for (const m of ["getMicrophonePermission", "openAppSettings"]) {
  assert.match(display, new RegExp(`CAPPluginMethod\\(name: "${m}"`), `DescallDisplay.${m} is exposed`);
}

console.log(`micStartup.selftest.mjs: ok (${callers.length} capture sites, ${STARTUP.length} start-up files)`);
