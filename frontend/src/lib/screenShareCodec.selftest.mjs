/**
 * Screen share picture quality (owner item 8): codec order, capability intersection, AV1
 * policy, SFU codec pick and fallback, encoder tuning, limits the same for every user,
 * and no Descall+ gating or perk text anywhere.
 * Run: node frontend/src/lib/screenShareCodec.selftest.mjs
 */
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BASELINE_DECODE,
  assessEncoderLoad,
  av1EncodeAllowed,
  codecFamily,
  codecLabel,
  contentModeOf,
  degradationPreferenceFor,
  familiesOf,
  formatScreenStats,
  intersectCapabilities,
  intersectDecodeFamilies,
  liveKitScreenEncoding,
  nextFallbackBlock,
  orderScreenCodecs,
  pickSfuScreenCodec,
  sanitizeVideoDecode,
  scalabilityModeFor,
  screenMaxBitrate,
  screenShareLimits,
  summarizeVideoRtp,
} from "./screenShareCodec.js";

const dir = dirname(fileURLToPath(import.meta.url));
const src = join(dir, "..");
const require = createRequire(import.meta.url);
const failures = [];
const expect = (cond, msg) => {
  if (!cond) failures.push(msg);
};
const eq = (a, b, msg) => expect(JSON.stringify(a) === JSON.stringify(b), `${msg}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);

// ---- codec families
eq(["video/AV1", "video/VP9", "video/vp8", "video/H264", "video/H265", "video/rtx", "video/red", "video/ulpfec", "video/flexfec-03", "video/AV1X"].map(codecFamily),
  ["av1", "vp9", "vp8", "h264", "h265", "rtx", "red", "ulpfec", "flexfec", "av1"], "codec families");
eq([codecLabel("av1"), codecLabel("video/H264"), codecLabel("vp9")], ["AV1", "H.264", "VP9"], "labels");

// A Chromium capability list (browser order: VP8 first).
const chrome = [
  { mimeType: "video/VP8", clockRate: 90000 },
  { mimeType: "video/rtx", clockRate: 90000 },
  { mimeType: "video/H264", clockRate: 90000, sdpFmtpLine: "level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e01f" },
  { mimeType: "video/VP9", clockRate: 90000, sdpFmtpLine: "profile-id=2" },
  { mimeType: "video/VP9", clockRate: 90000, sdpFmtpLine: "profile-id=0" },
  { mimeType: "video/AV1", clockRate: 90000, sdpFmtpLine: "level-idx=5;profile=0;tier=0" },
  { mimeType: "video/red", clockRate: 90000 },
  { mimeType: "video/ulpfec", clockRate: 90000 },
];
const fams = (list) => list.map((c) => `${codecFamily(c)}${/profile-id=2/.test(c.sdpFmtpLine || "") ? "p2" : ""}`);

// ---- preference ordering: AV1 > VP9 (profile 0 first) > browser default, aux kept last
eq(fams(orderScreenCodecs(chrome)), ["av1", "vp9", "vp9p2", "vp8", "h264", "rtx", "red", "ulpfec"], "AV1 > VP9 > default, RTX kept");
expect(orderScreenCodecs(chrome)[0] === chrome[5], "capability objects are passed through unchanged");
eq(fams(orderScreenCodecs(chrome, { blocked: ["av1"] })), ["vp9", "vp9p2", "vp8", "h264", "rtx", "red", "ulpfec"], "AV1 blocked");
eq(fams(orderScreenCodecs(chrome, { blocked: ["av1", "vp9"] })), ["vp8", "h264", "rtx", "red", "ulpfec"], "AV1 + VP9 blocked = current codec");
eq(fams(orderScreenCodecs(chrome, { blocked: ["av1", "vp9", "vp8", "h264"] })), fams(orderScreenCodecs(chrome)),
  "never left without a picture codec (blocks ignored)");
eq(fams(orderScreenCodecs(chrome, { allowed: ["vp9", "vp8"] })), ["vp9", "vp9p2", "vp8", "rtx", "red", "ulpfec"], "allowed set (intersection)");
// Safari: no AV1 encode, H.264 first. VP9 still moves ahead, H.264 stays ahead of VP8.
const safari = [
  { mimeType: "video/H264", clockRate: 90000, sdpFmtpLine: "packetization-mode=1;profile-level-id=640c1f" },
  { mimeType: "video/VP8", clockRate: 90000 },
  { mimeType: "video/VP9", clockRate: 90000, sdpFmtpLine: "profile-id=0" },
  { mimeType: "video/rtx", clockRate: 90000 },
];
eq(fams(orderScreenCodecs(safari)), ["vp9", "h264", "vp8", "rtx"], "Safari order");
eq(fams(orderScreenCodecs([])), [], "empty list");

// ---- capability intersection (sender vs receiver capabilities)
const recvNoAv1 = chrome.filter((c) => codecFamily(c) !== "av1");
eq(fams(intersectCapabilities(chrome, recvNoAv1)), fams(recvNoAv1), "send ∩ recv drops AV1 the receiver side lacks");
eq(intersectCapabilities(chrome, []).length, chrome.length, "no receiver list: sender list");
eq(familiesOf(chrome), ["vp8", "h264", "vp9", "av1"], "families of a capability list");

// ---- decode lists over signaling
eq(sanitizeVideoDecode(["AV1", " vp9 ", "vp9", "<x>", 3, "vp8"]), ["av1", "vp9", "vp8"], "decode list sanitized");
eq(sanitizeVideoDecode("av1"), null, "non-list refused");
eq(sanitizeVideoDecode([]), null, "empty list is null");
const backend = require("../../backend/lib/screenShareSignal.js");
for (const sample of [["AV1", "vp9"], ["h265", "H264", "x"], "av1", null, [], ["vp8", "vp8"], new Array(40).fill("vp9")]) {
  eq(backend.sanitizeVideoDecode(sample), sanitizeVideoDecode(sample), `backend and client sanitize agree on ${JSON.stringify(sample)?.slice(0, 40)}`);
}
eq(intersectDecodeFamilies([]), null, "no viewers: no constraint");
eq(intersectDecodeFamilies([["av1", "vp9", "vp8"], ["vp9", "vp8", "h264"]]), ["vp9", "vp8"], "intersection of two viewers");
eq(intersectDecodeFamilies([["av1", "vp9", "vp8"], null]), ["vp8"], "a viewer without a list counts as baseline");
eq(BASELINE_DECODE, ["vp8", "h264"], "baseline decode");

// ---- AV1 encode policy (hardware awareness)
expect(av1EncodeAllowed({ hw: { supported: true, smooth: true, powerEfficient: true }, cores: 2, width: 2560, height: 1440, fps: 60, encoders: 4 }), "hardware AV1 always");
expect(!av1EncodeAllowed({ hw: { supported: false } }), "unsupported AV1 refused");
expect(!av1EncodeAllowed({ hw: { supported: true, smooth: false, powerEfficient: false }, cores: 16 }), "not smooth refused");
expect(av1EncodeAllowed({ hw: null, cores: 8, width: 1920, height: 1080, fps: 30 }), "8 cores: software 1080p30");
expect(!av1EncodeAllowed({ hw: null, cores: 8, width: 2560, height: 1440, fps: 60 }), "8 cores: no software 1440p60");
expect(!av1EncodeAllowed({ hw: null, cores: 6, width: 1920, height: 1080, fps: 30, encoders: 3 }), "mesh multiplies the encode cost");
expect(!av1EncodeAllowed({ hw: null, cores: 2, width: 854, height: 480, fps: 15 }), "2 cores: never software AV1");

// ---- SFU codec pick: only what every viewer decodes
eq(pickSfuScreenCodec({ encode: ["vp8", "vp9", "av1"], viewers: [["av1", "vp9", "vp8"], ["av1", "vp8"]] }), "av1", "everyone decodes AV1");
eq(pickSfuScreenCodec({ encode: ["vp8", "vp9", "av1"], viewers: [["av1", "vp9", "vp8"], ["vp9", "vp8", "h264"]] }), "vp9", "old iPhone without AV1 joins: VP9");
eq(pickSfuScreenCodec({ encode: ["vp8", "vp9", "av1"], viewers: [["av1", "vp9", "vp8"], null] }), "vp8", "unknown viewer: current codec");
eq(pickSfuScreenCodec({ encode: ["vp8", "vp9", "av1"], viewers: [["av1", "vp9", "vp8"]], av1Allowed: false }), "vp9", "weak CPU: VP9");
eq(pickSfuScreenCodec({ encode: ["vp8", "vp9", "av1"], viewers: [["av1", "vp9", "vp8"]], blocked: ["av1"] }), "vp9", "CPU fallback blocks AV1");
eq(pickSfuScreenCodec({ encode: ["vp8", "h264"], viewers: [["av1", "vp9", "vp8"]] }), "vp8", "sender without AV1/VP9");
eq(pickSfuScreenCodec({ encode: ["vp8", "vp9", "av1"], viewers: null }), "av1", "alone in the room");

// ---- fallback chain
eq(nextFallbackBlock("av1", []), ["av1"], "AV1 -> VP9");
eq(nextFallbackBlock("vp9", ["av1"]), ["av1", "vp9"], "VP9 -> default");
eq(nextFallbackBlock("vp9", []), ["av1", "vp9"], "VP9 -> default also blocks AV1");
eq(nextFallbackBlock("vp8", ["av1", "vp9"]), null, "nothing lighter after the default");
eq(nextFallbackBlock("av1", ["av1"]), null, "no double fallback");

// ---- encoder load
const s = (limitation, encodeMs, powerEfficient = false) => ({ limitation, encodeMs, powerEfficient });
expect(!assessEncoderLoad([s("cpu", 40), s("cpu", 40)]).cpuLimited, "needs 3 samples");
expect(assessEncoderLoad([s("none", 5), s("cpu", 9), s("cpu", 9), s("cpu", 9)]).cpuLimited, "cpu limitation 3/4");
expect(!assessEncoderLoad([s("bandwidth", 5), s("bandwidth", 5), s("bandwidth", 5)]).cpuLimited, "bandwidth is not CPU");
expect(assessEncoderLoad([s("none", 31), s("none", 30), s("none", 32)], { targetFps: 30 }).cpuLimited, "slow software encode");
expect(!assessEncoderLoad([s("none", 31, true), s("none", 30, true), s("none", 32, true)], { targetFps: 30 }).cpuLimited, "hardware encoder: encode time alone is fine");
expect(!assessEncoderLoad([s("none", 12), s("none", 14), s("none", 13)], { targetFps: 30 }).cpuLimited, "healthy encode");

// ---- tuning per content
eq(["motion", "detail", "text", undefined, "x"].map(contentModeOf), ["motion", "detail", "text", "motion", "motion"], "content modes");
eq(["text", "detail", "motion"].map(degradationPreferenceFor), ["maintain-resolution", "maintain-resolution", "balanced"], "degradation preference");
eq(scalabilityModeFor({ transport: "sfu", family: "av1" }), "L1T3", "SFU AV1 L1T3");
eq(scalabilityModeFor({ transport: "sfu", family: "vp9", supportedModes: ["L1T1", "L1T3", "L3T3"] }), "L1T3", "SFU VP9 L1T3 when listed");
eq(scalabilityModeFor({ transport: "sfu", family: "vp9", supportedModes: ["L1T1"] }), null, "not listed: none");
eq(scalabilityModeFor({ transport: "sfu", family: "vp8" }), null, "VP8 has no SVC");
eq(scalabilityModeFor({ transport: "mesh", family: "av1" }), null, "mesh: L1T1 default");

// ---- bitrate ceilings
eq(screenMaxBitrate({ resolution: "1080p", fps: 30 }), 4_500_000, "1080p30 1:1");
eq(screenMaxBitrate({ resolution: "1440p", fps: 60 }), 10_500_000, "1440p60 1:1");
eq(screenMaxBitrate({ resolution: "1440p", fps: 60, peerCount: 3 }), 1_600_000, "mesh 3+ capped");
eq(screenMaxBitrate({ resolution: "1440p", fps: 60, peerCount: 6 }), 900_000, "mesh 5+ capped");
eq(screenMaxBitrate({ resolution: "1440p", fps: 60, peerCount: 12, transport: "sfu" }), 10_500_000, "SFU: one upload, no mesh cap");
expect(screenMaxBitrate({ resolution: "720p", fps: 15 }) < screenMaxBitrate({ resolution: "720p", fps: 30 }), "fewer frames, lower ceiling");

// ---- limits: the same for everyone, only mesh size matters
const one = screenShareLimits({ mesh: false, participantCount: 2 });
eq(one.resolutions, ["480p", "720p", "1080p", "1440p"], "every resolution 1:1");
eq(one.fps, [15, 20, 24, 30, 60], "60 fps 1:1");
eq(screenShareLimits({ mesh: false, participantCount: 30 }).fps, [15, 20, 24, 30, 60], "SFU room: 60 fps");
eq(screenShareLimits({ mesh: true, participantCount: 2 }).fps, [15, 20, 24, 30, 60], "2-person group: 60 fps");
eq(screenShareLimits({ mesh: true, participantCount: 4 }).resolutions, ["480p", "720p", "1080p", "1440p"], "1440p in a group too");
eq(screenShareLimits({ mesh: true, participantCount: 4 }).fps, [15, 20, 24, 30], "mesh 3+: up to 30 fps");
const limitsSrc = readFileSync(join(dir, "screenShareCodec.js"), "utf8");
const limitsFn = limitsSrc.slice(limitsSrc.indexOf("export function screenShareLimits"), limitsSrc.indexOf("export function assessEncoderLoad"));
expect(!/plan|tier|premium|isPlus|ultra/i.test(limitsFn.replace(/\/\*\*[\s\S]*?\*\//g, "")), "screenShareLimits takes no plan / tier input");

// ---- LiveKit options
const lkAv1 = liveKitScreenEncoding({ family: "av1", contentHint: "text", maxBitrate: 4_500_000, fps: 30 });
eq([lkAv1.videoCodec, lkAv1.scalabilityMode, lkAv1.degradationPreference, lkAv1.simulcast, lkAv1.backupCodec.codec], ["av1", "L1T3", "maintain-resolution", false, "vp8"], "LiveKit AV1 options");
eq(lkAv1.screenShareEncoding, { maxBitrate: 4_500_000, maxFramerate: 30, priority: "high" }, "LiveKit encoding");
const lkVp8 = liveKitScreenEncoding({ family: "vp8", contentHint: "motion", maxBitrate: 2_500_000, fps: 60 });
eq([lkVp8.videoCodec, lkVp8.scalabilityMode, lkVp8.backupCodec, lkVp8.degradationPreference], ["vp8", undefined, false, "balanced"], "LiveKit VP8 options");

// ---- stats readout
const report = new Map([
  ["c1", { id: "c1", type: "codec", mimeType: "video/AV1" }],
  ["c2", { id: "c2", type: "codec", mimeType: "video/VP8" }],
  ["o1", { id: "o1", type: "outbound-rtp", kind: "video", codecId: "c1", frameWidth: 1920, frameHeight: 1080, framesPerSecond: 29.6, qualityLimitationReason: "none", totalEncodeTime: 3, framesEncoded: 300, powerEfficientEncoder: true, encoderImplementation: "ExternalEncoder" }],
  ["o2", { id: "o2", type: "outbound-rtp", kind: "video", codecId: "c2", frameWidth: 640, frameHeight: 360, framesPerSecond: 30 }],
  ["i1", { id: "i1", type: "inbound-rtp", kind: "video", codecId: "c2", frameWidth: 1280, frameHeight: 720, framesPerSecond: 24 }],
]);
const out = summarizeVideoRtp(report, { direction: "out", prev: { totalEncodeTime: 2, framesEncoded: 200 } });
eq([out.codec, out.width, out.height, out.fps, out.powerEfficient, out.encodeMs, out.limitation], ["AV1", 1920, 1080, 30, true, 10, "none"], "outbound summary (screen = largest)");
eq(formatScreenStats(out), "AV1 · 1920×1080 · 30 fps", "readout text");
const inbound = summarizeVideoRtp(report, { direction: "in" });
eq(formatScreenStats(inbound), "VP8 · 1280×720 · 24 fps", "inbound readout");
eq(summarizeVideoRtp(new Map(), { direction: "out" }), null, "no video stream");
eq(formatScreenStats(null), "", "nothing yet");

// ---- no Descall+ gating of screen share quality, no perk text
const premiumFeatures = readFileSync(join(src, "premium/features.js"), "utf8");
const featureBlock = premiumFeatures.slice(premiumFeatures.indexOf("export const FEATURES"), premiumFeatures.indexOf("export const FEATURE_KEYS"));
expect(!/screen_?(share|quality|hd|res)|stream_quality|share_quality|hd_stream/i.test(featureBlock), "no Descall+ feature key for screen share quality");
const backendFeatures = readFileSync(join(src, "../backend/lib/premium/features.js"), "utf8");
expect(!/screen_?(share|quality|hd|res)|stream_quality|share_quality/i.test(backendFeatures), "backend entitlements have no screen quality key");
const gateRe = /usePremium|hasPremiumFeature|tierAllows|isPremium|premium\.has\(|PLAN_RANK|normalizePlan/;
for (const file of [
  "lib/webrtcScreenShare.js",
  "lib/screenShareCodec.js",
  "lib/screenShareEncoder.js",
  "lib/serverScreenQuality.js",
  "lib/screenShareIdentity.js",
  "components/voice/ScreenShareQualityPanel.jsx",
]) {
  expect(!gateRe.test(readFileSync(join(src, file), "utf8")), `${file}: no plan / premium check`);
}
for (const hook of ["useCall.js", "useGroupCall.js", "useServerVoice.js"]) {
  const code = readFileSync(join(src, "hooks", hook), "utf8");
  const start = code.indexOf("const startScreenShare = useCallback");
  const body = code.slice(start, code.indexOf("const stopScreenShare", start) > start ? code.indexOf("const stopScreenShare", start) : start + 6000);
  expect(start > 0 && !gateRe.test(body), `${hook}: startScreenShare has no plan / premium check`);
}
const perkRe = /(higher|better|hd|sharper|enhanced|premium|1080p?|1440p?|4k|60 ?fps)[^"\n]{0,40}(screen ?shar|stream quality|ekran payla|yayın kalite)|(screen ?shar|ekran payla)[^"\n]{0,40}(quality|kalite)[^"\n]{0,40}(descall\+|premium|plus|ultra)/i;
const localeDir = join(src, "i18n/locales");
for (const name of readdirSync(localeDir).filter((f) => /^premium[A-Za-z]*\.[\w-]+\.js$/.test(f))) {
  expect(!perkRe.test(readFileSync(join(localeDir, name), "utf8")), `${name}: no screen share quality perk`);
}
const contract = readFileSync(join(src, "../../docs/premium/CONTRACT.md"), "utf8");
expect(!/screen_?share_?quality|screen.{0,20}(1080|1440|hd)/i.test(contract), "premium contract lists no screen quality perk");

if (failures.length) {
  console.error(`screenShareCodec.selftest: ${failures.length} failure(s)`);
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}
console.log("screenShareCodec.selftest ok");
