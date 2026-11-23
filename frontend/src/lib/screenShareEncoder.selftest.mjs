/**
 * Screen share encoder glue with fake WebRTC objects: codec preferences on every screen
 * sender (addDedicatedSender), the AV1 hardware probe, sender tuning per content, codec
 * switching on a live sender, and the CPU watch falling back AV1 -> VP9 -> default
 * (setParameters where the engine can, a new offer where it cannot).
 * Run: node frontend/src/lib/screenShareEncoder.selftest.mjs
 */
import {
  _clearProbeCacheForTests,
  applyScreenCodecPreferences,
  localDecodeFamilies,
  localVideoCaps,
  probeAv1Encode,
  screenEncoderFor,
  switchSenderCodec,
  tuneScreenSender,
} from "./screenShareEncoder.js";
import { addDedicatedSender, tagLocalTrack, ROLE_SCREEN, ROLE_CAMERA } from "./screenShareIdentity.js";
import { codecFamily } from "./screenShareCodec.js";

const failures = [];
const expect = (cond, msg) => {
  if (!cond) failures.push(msg);
};
const eq = (a, b, msg) => expect(JSON.stringify(a) === JSON.stringify(b), `${msg}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);

const CAPS = [
  { mimeType: "video/VP8", clockRate: 90000 },
  { mimeType: "video/rtx", clockRate: 90000 },
  { mimeType: "video/H264", clockRate: 90000, sdpFmtpLine: "packetization-mode=1;profile-level-id=42e01f" },
  { mimeType: "video/VP9", clockRate: 90000, sdpFmtpLine: "profile-id=0" },
  { mimeType: "video/AV1", clockRate: 90000, sdpFmtpLine: "level-idx=5;profile=0;tier=0" },
  { mimeType: "video/red", clockRate: 90000 },
];
const RECV_NO_AV1 = CAPS.filter((c) => codecFamily(c) !== "av1");

function fakeEnv({ send = CAPS, recv = CAPS, mc = null, cores = 8 } = {}) {
  let t = 0;
  return {
    RTCRtpSender: { getCapabilities: (kind) => (kind === "video" ? { codecs: send } : null) },
    RTCRtpReceiver: { getCapabilities: (kind) => (kind === "video" ? { codecs: recv } : null) },
    navigator: { hardwareConcurrency: cores, mediaCapabilities: mc },
    performance: { now: () => t },
    advance(ms) {
      t += ms;
    },
    setTimeout: (fn) => {
      fn();
      return 0;
    },
    // The watch is driven by tick() in this test; no real timer.
    setInterval: () => 1,
    clearInterval: () => {},
  };
}

function fakeTransceiver({ refuse = 0 } = {}) {
  const tx = { prefs: [], calls: 0, sender: null };
  tx.setCodecPreferences = (list) => {
    tx.calls += 1;
    if (tx.calls <= refuse) throw new Error("InvalidModificationError");
    tx.prefs = list.map((c) => codecFamily(c));
  };
  return tx;
}

function fakeSender({ track, negotiated = ["av1", "vp9", "vp8"], canSwitch = true, rejectDegradation = false } = {}) {
  const byFam = Object.fromEntries(CAPS.map((c) => [codecFamily(c), c]));
  const state = { encodings: [{ active: true }], degradationPreference: undefined, setCalls: [] };
  const sender = {
    track,
    stats: [],
    getParameters() {
      return {
        transactionId: "t",
        codecs: negotiated.map((f, i) => ({ payloadType: 96 + i, ...byFam[f] })).concat([{ payloadType: 120, mimeType: "video/rtx", clockRate: 90000 }]),
        encodings: state.encodings.map((e) => ({ ...e })),
        degradationPreference: state.degradationPreference,
      };
    },
    async setParameters(p) {
      state.setCalls.push(p);
      if (rejectDegradation && p.degradationPreference) throw new Error("degradationPreference unsupported");
      state.encodings = p.encodings.map((e) => {
        const copy = { ...e };
        if (!canSwitch) delete copy.codec;
        return copy;
      });
      state.degradationPreference = p.degradationPreference;
    },
    async getStats() {
      return new Map(sender.stats.shift() || []);
    },
    state,
  };
  return sender;
}

function statsReport(family, { limitation = "none", encodeTotal = 0, frames = 0, fps = 30, powerEfficient = false } = {}) {
  return [
    ["c", { id: "c", type: "codec", mimeType: `video/${family.toUpperCase()}` }],
    ["o", { id: "o", type: "outbound-rtp", kind: "video", codecId: "c", frameWidth: 1920, frameHeight: 1080, framesPerSecond: fps, qualityLimitationReason: limitation, totalEncodeTime: encodeTotal, framesEncoded: frames, powerEfficientEncoder: powerEfficient }],
  ];
}

// ---- local capabilities
{
  const env = fakeEnv({ recv: RECV_NO_AV1 });
  const caps = localVideoCaps(env);
  eq(caps.encode, ["vp8", "h264", "vp9", "av1"], "encode families");
  eq(caps.decode, ["vp8", "h264", "vp9"], "decode families (no AV1 decoder)");
  eq(localDecodeFamilies(env), ["vp8", "h264", "vp9"], "decode list for signaling");
  eq(localDecodeFamilies({}), null, "no WebRTC: no list");
}

// ---- AV1 hardware probe
{
  _clearProbeCacheForTests();
  let asked = 0;
  const mc = {
    encodingInfo: async (cfg) => {
      asked += 1;
      expect(cfg.type === "webrtc" && cfg.video.contentType === "video/AV1", "probe asks for AV1 over WebRTC");
      return { supported: true, smooth: true, powerEfficient: true };
    },
  };
  const env = fakeEnv({ mc });
  env.setTimeout = () => 0; // the answer wins the race
  eq(await probeAv1Encode({ width: 1920, height: 1080, fps: 30 }, env), { supported: true, smooth: true, powerEfficient: true }, "probe answer");
  await probeAv1Encode({ width: 1920, height: 1080, fps: 30 }, env);
  eq(asked, 1, "probe cached per size");
  eq(await probeAv1Encode({ width: 1280, height: 720, fps: 30 }, fakeEnv({ mc: null })), null, "no API: null");
  _clearProbeCacheForTests();
  const hang = fakeEnv({ mc: { encodingInfo: () => new Promise(() => {}) } });
  eq(await probeAv1Encode({ width: 640, height: 360, fps: 30 }, hang), null, "no answer in time: null");
}

// ---- codec preferences on a transceiver
{
  const env = fakeEnv();
  const tx = fakeTransceiver();
  eq(applyScreenCodecPreferences(tx, {}, env), ["av1", "vp9", "vp8", "h264"], "families returned");
  eq(tx.prefs, ["av1", "vp9", "vp8", "h264", "rtx", "red"], "AV1 > VP9 > default, RTX/RED kept");
  applyScreenCodecPreferences(tx, { av1Allowed: false }, env);
  eq(tx.prefs.slice(0, 2), ["vp9", "vp8"], "AV1 not offered when the CPU cannot encode it");
  const picky = fakeTransceiver({ refuse: 1 });
  applyScreenCodecPreferences(picky, {}, fakeEnv({ recv: RECV_NO_AV1 }));
  expect(picky.calls === 2 && picky.prefs[0] === "av1", "refused list retried with the sender list");
  eq(applyScreenCodecPreferences({}, {}, env), null, "no setCodecPreferences: null");
}

// ---- sender tuning per content
{
  const motion = fakeSender({ track: { kind: "video" } });
  expect(await tuneScreenSender(motion, { maxBitrate: 4_500_000, maxFramerate: 60, contentHint: "motion" }), "tuned");
  const last = motion.state.setCalls.at(-1);
  eq([last.encodings[0].maxBitrate, last.encodings[0].maxFramerate, last.degradationPreference, last.encodings[0].scalabilityMode], [4_500_000, 60, "balanced", undefined], "motion: balanced, no SVC in a mesh");
  const text = fakeSender({ track: { kind: "video" } });
  await tuneScreenSender(text, { maxBitrate: 4_500_000, maxFramerate: 20, contentHint: "text", transport: "sfu", family: "av1" });
  const tl = text.state.setCalls.at(-1);
  eq([tl.degradationPreference, tl.encodings[0].scalabilityMode], ["maintain-resolution", "L1T3"], "text keeps resolution; SFU AV1 L1T3");
  const old = fakeSender({ track: { kind: "video" }, rejectDegradation: true });
  expect(await tuneScreenSender(old, { maxBitrate: 1_000_000, maxFramerate: 30, contentHint: "detail" }), "engine without degradationPreference still gets the bitrate");
  eq(old.state.encodings[0].maxBitrate, 1_000_000, "bitrate applied on retry");
}

// ---- codec switch on a live sender
{
  const sender = fakeSender({ track: { kind: "video" } });
  eq(await switchSenderCodec(sender, ["av1"]), "vp9", "AV1 -> VP9 without renegotiation");
  eq(codecFamily(sender.state.encodings[0].codec), "vp9", "encoding carries VP9");
  eq(await switchSenderCodec(sender, ["av1", "vp9"]), "vp8", "VP9 -> current default");
  const oldEngine = fakeSender({ track: { kind: "video" }, canSwitch: false });
  eq(await switchSenderCodec(oldEngine, ["av1"]), null, "engine ignores encoding codec: null (renegotiate)");
}

// ---- every screen sender gets the codec order (addDedicatedSender), cameras do not
const env = fakeEnv();
Object.assign(globalThis, { RTCRtpSender: env.RTCRtpSender, RTCRtpReceiver: env.RTCRtpReceiver });
function fakePc() {
  const txs = [];
  return {
    txs,
    connectionState: "connected",
    signalingState: "stable",
    addTransceiver(track) {
      const tx = fakeTransceiver();
      tx.sender = fakeSender({ track });
      txs.push(tx);
      return tx;
    },
    getTransceivers: () => txs,
    addTrack: () => null,
  };
}
{
  const camera = tagLocalTrack({ kind: "video", readyState: "live" }, ROLE_CAMERA);
  const pc = fakePc();
  addDedicatedSender(pc, camera, null);
  eq(pc.txs[0].prefs, [], "camera transceiver untouched");

  const screen = tagLocalTrack({ kind: "video", readyState: "live" }, ROLE_SCREEN);
  const session = screenEncoderFor(screen, env).configure({ contentHint: "text", resolution: "1080p", fps: 30, transport: "mesh" });
  session.av1Allowed = true;
  const pcA = fakePc();
  const senderA = addDedicatedSender(pcA, screen, null);
  eq(pcA.txs[0].prefs.slice(0, 3), ["av1", "vp9", "vp8"], "screen sender: AV1 first before the offer");
  const pcB = fakePc();
  const senderB = addDedicatedSender(pcB, screen, null);
  eq(session.senders().length, 2, "one session watches every viewer's sender");

  // ---- CPU watch: AV1 software encode is CPU-limited -> VP9 on every sender
  for (const s of [senderA, senderB]) {
    s.stats = [1, 2, 3, 4].map((i) => statsReport("av1", { limitation: "cpu", encodeTotal: i * 4, frames: i * 100, fps: 14 }));
  }
  let fellBack = null;
  for (let i = 0; i < 4 && !fellBack; i += 1) fellBack = await session.tick();
  eq(fellBack?.family, "av1", "CPU-limited AV1 detected");
  eq(session.blocked, ["av1"], "AV1 blocked for this share");
  eq(pcA.txs[0].prefs.slice(0, 2), ["vp9", "vp8"], "codec order updated (next offer has no AV1)");
  eq([codecFamily(senderA.state.encodings[0].codec), codecFamily(senderB.state.encodings[0].codec)], ["vp9", "vp9"], "both live senders switched to VP9");
  expect(!session.av1Ok(), "AV1 stays off for the rest of the share");

  // A viewer joining after the fallback gets VP9 first straight away.
  const pcC = fakePc();
  addDedicatedSender(pcC, screen, null);
  eq(pcC.txs[0].prefs[0], "vp9", "late viewer starts on VP9");

  // Grace period: no second fallback right away.
  senderA.stats = [1, 2, 3, 4].map((i) => statsReport("vp9", { limitation: "cpu", encodeTotal: i * 4, frames: i * 100 }));
  eq(await session.tick(), null, "no decision during the grace period");
}

// ---- engines without live codec switching renegotiate instead; VP9 -> default
{
  const screen = tagLocalTrack({ kind: "video", readyState: "live" }, ROLE_SCREEN);
  const session = screenEncoderFor(screen, env).configure({ fps: 30, transport: "mesh" });
  session.av1Allowed = false;
  const pc = fakePc();
  pc.addTransceiver = (track) => {
    const tx = fakeTransceiver();
    tx.sender = fakeSender({ track, negotiated: ["vp9", "vp8"], canSwitch: false });
    pc.txs.push(tx);
    return tx;
  };
  const sender = addDedicatedSender(pc, screen, null);
  eq(pc.txs[0].prefs[0], "vp9", "weak CPU: VP9 first");
  const offers = [];
  session.setRenegotiator(async ({ pc: p, blocked }) => offers.push({ same: p === pc, blocked }));
  sender.stats = [1, 2, 3, 4].map((i) => statsReport("vp9", { encodeTotal: i * 3.2, frames: i * 100 }));
  let r = null;
  for (let i = 0; i < 4 && !r; i += 1) r = await session.tick();
  eq(r?.reason, "encode-time", "slow software VP9 detected from encode time");
  eq(offers, [{ same: true, blocked: ["av1", "vp9"] }], "new offer requested for that peer");
  eq(pc.txs[0].prefs.slice(0, 2), ["vp8", "h264"], "next offer uses the current default codec");
  eq(await session.fallback("vp8"), false, "nothing lighter than the default");

  // ---- share stopped: the watch ends itself
  screen.readyState = "ended";
  eq(await session.tick(), null, "ended track");
  eq(session.senders().length, 0, "senders released");
}

// ---- hardware encoder under load is left alone unless the browser reports CPU
{
  const screen = tagLocalTrack({ kind: "video", readyState: "live" }, ROLE_SCREEN);
  const session = screenEncoderFor(screen, env).configure({ fps: 60 });
  session.av1Allowed = true;
  const pc = fakePc();
  const sender = addDedicatedSender(pc, screen, null);
  sender.stats = [1, 2, 3, 4].map((i) => statsReport("av1", { encodeTotal: i * 2, frames: i * 100, powerEfficient: true }));
  let r = null;
  for (let i = 0; i < 4; i += 1) r = (await session.tick()) || r;
  eq(r, null, "hardware AV1 at 20 ms/frame is not a CPU problem");
  eq(session.blocked, [], "nothing blocked");
}

if (failures.length) {
  console.error(`screenShareEncoder.selftest: ${failures.length} failure(s)`);
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}
console.log("screenShareEncoder.selftest ok");
