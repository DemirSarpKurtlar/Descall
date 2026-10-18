// 2.10.113 call-audio wiring (static): mic → input menu, deafen → output menu,
// speaker choice applied to every sink + saved, Electron speaker permission,
// remote-audio keeper, native ICE-before-answer fix.
// Run: node src/components/call/callAudioWiring.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const read = (p) => readFileSync(join(root, p), "utf8");

const overlay = read("src/components/CallOverlay.jsx");
const micSlot = overlay.slice(overlay.indexOf('menuLabel={t("Choose microphone")}'), overlay.indexOf("<MicOff"));
assert.match(micSlot, /groups=\{inputMenuGroups\(/, "mic button opens the input menu");
assert.doesNotMatch(micSlot, /outputMenuGroups/, "mic menu has no output section");
const deafSlot = overlay.slice(overlay.indexOf('menuLabel={t("Choose speaker")}'), overlay.indexOf("<HeadphoneOff"));
assert.match(deafSlot, /groups=\{outputMenuGroups\(/, "deafen button opens the output menu");
assert.match(deafSlot, /toggleDeafen/);
assert.ok(!/AudioDevicePanel/.test(overlay), "old opaque audio panel removed");
assert.ok(!/audio\.srcObject = stream/.test(overlay), "overlay no longer flips the remote srcObject");
assert.match(overlay, /ensureRemoteAudio\?\.\("overlay"\)/);

const svp = read("src/components/servers/ServerVoicePanel.jsx");
const svMic = svp.slice(svp.indexOf('menuLabel={t("Choose microphone")}'), svp.indexOf("<MicOff size={18}"));
assert.match(svMic, /inputMenuGroups\(serverVoice, t\)/);
const svDeaf = svp.slice(svp.indexOf('menuLabel={t("Choose speaker")}'), svp.indexOf("<HeadphoneOff size={18}"));
assert.match(svDeaf, /outputMenuGroups\(serverVoice, t\)/);
assert.match(svDeaf, /toggleDeafen/);

const picker = read("src/components/call/DevicePicker.jsx");
assert.match(picker, /className="call-device-menu"/);
assert.match(picker, /createPortal\(/, "menu is portaled (never clipped by the dock)");
assert.match(picker, /role="menuitemradio"/);
assert.match(picker, /aria-checked=/);
assert.match(picker, /LONG_PRESS_MS/);
assert.match(picker, /onContextMenu/);
assert.match(picker, /transformOrigin/, "menu scales out of its button");

const glassCall = read("src/styles/glass/call.css");
assert.ok(!/\.server-voice-dock-chevron\s*\{\s*display:\s*none/.test(glassCall), "chevron visible on iPhone");

const main = read("electron/main.cjs");
assert.match(main, /MEDIA_PERMISSIONS = \[[^\]]*'speaker-selection'/);
assert.equal((main.match(/MEDIA_PERMISSIONS\.includes\(permission\)/g) || []).length, 2, "request + check handlers");

for (const hook of ["src/hooks/useCall.js", "src/hooks/useGroupCall.js", "src/hooks/useServerVoice.js"]) {
  const src = read(hook);
  assert.match(src, /writeAudioPref\("output", id\)/, `${hook}: speaker choice saved`);
  assert.match(src, /writeAudioPref\("input", id\)/, `${hook}: mic choice saved`);
  assert.match(src, /await setOutputSink\(id\)/, `${hook}: every sink follows`);
  assert.match(src, /readAudioPrefs\(\)/, `${hook}: saved choice restored`);
  assert.match(src, /liveMicDeviceId\(localStreamRef\.current, getNoiseSuppressionRawTrack\(\)\)/, `${hook}: devicechange uses the raw mic id`);
  assert.ok(!/setSinkId\(deviceId\)\.catch\(\(\) => \{\}\)/.test(src), `${hook}: sink errors not swallowed`);
}
const useCall = read("src/hooks/useCall.js");
assert.match(useCall, /swapMicTrack\(\{/);
assert.match(useCall, /onRefreshed: \(\{ reason \} = \{\}\) => \{\s*setTimeout\(\(\) => remoteAudioKeeperRef\.current\?\.rebind/);
assert.match(useCall, /keeper\.rebind\("callkit-activated"\)/);
assert.match(useCall, /remoteAudioKeeperRef\.current\.attach\("inbound"\)/);
assert.ok(!/audio\.srcObject = new MediaStream\(micTracks\)/.test(useCall), "hook attaches through the keeper");
assert.match(useCall, /dm_call_inbound_audio_missing/);
const gain = read("src/lib/voiceGain.js");
assert.match(gain, /registerSinkElement\(el\)/);
assert.match(gain, /registerSinkContext\(ctx\)/);

const bridge = read("src/hooks/useIosCallKitBridge.js");
const activation = bridge.slice(bridge.indexOf("onAudioSessionActivated:"), bridge.indexOf("onAudioReleased:"));
assert.ok(!/audio\.muted = false/.test(activation), "CallKit activation never unmutes a deafened call");

const swift = read("ios/App/App/DescallNativeCall.swift");
assert.match(swift, /if s\.iceConnected \{ markConnected\(s\) \}/, "ICE connected while ringing is applied on answer");
const ice = swift.slice(swift.indexOf("didChange newState: RTCIceConnectionState"));
assert.ok(ice.indexOf("s.iceConnected = true") < ice.indexOf("guard s.answered else { return }"), "pre-answer ICE state is recorded");
assert.match(swift, /private func enableRemoteAudio\(_ s: Session\)/);
assert.match(swift, /callKitAudioActive && !RTCAudioSession\.sharedInstance\(\)\.isAudioEnabled/);
console.log("callAudioWiring selftest ok");
