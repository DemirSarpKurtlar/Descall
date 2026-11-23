/**
 * Screen share encoder, browser side: codec preferences on the screen transceiver, sender
 * tuning, the AV1 hardware probe, the CPU watch with codec fallback and the stats readout.
 * Decisions come from the pure screenShareCodec.js; this file only touches WebRTC objects.
 * Every entry point takes an optional `env` (globals) so selftests can drive it with fakes.
 *
 * One "session" per captured screen track (WeakMap): it remembers the quality pick and the
 * families blocked by the CPU watch, and owns every RTCRtpSender that sends this track (one
 * per viewer in a mesh, one LiveKit sender with an SFU). A fallback applies to all of them.
 */
import {
  assessEncoderLoad,
  av1EncodeAllowed,
  codecFamily,
  contentModeOf,
  degradationPreferenceFor,
  familiesOf,
  intersectCapabilities,
  isAuxCodec,
  nextFallbackBlock,
  orderScreenCodecs,
  sanitizeVideoDecode,
  scalabilityModeFor,
  summarizeVideoRtp,
} from "./screenShareCodec.js";

const WATCH_MS = 3000;
const GRACE_MS = 9000;
const RES_SIZE = {
  "480p": [854, 480],
  "720p": [1280, 720],
  "1080p": [1920, 1080],
  "1440p": [2560, 1440],
  "2160p": [3840, 2160],
};

function g(env) {
  return env || (typeof globalThis !== "undefined" ? globalThis : {});
}

function caps(env, side) {
  try {
    const Ctor = side === "recv" ? g(env).RTCRtpReceiver : g(env).RTCRtpSender;
    return Ctor?.getCapabilities?.("video")?.codecs || [];
  } catch {
    return [];
  }
}

/** This device's video codecs: raw capability lists plus the picture families. */
export function localVideoCaps(env) {
  const send = caps(env, "send");
  const recv = caps(env, "recv");
  return { send, recv, encode: familiesOf(send), decode: familiesOf(recv) };
}

/** Families this device decodes, for the signaling decode list (null when unknown). */
export function localDecodeFamilies(env) {
  return sanitizeVideoDecode(localVideoCaps(env).decode);
}

const probeCache = new Map();

/**
 * navigator.mediaCapabilities.encodingInfo for AV1 over WebRTC at this size. Resolves
 * { supported, smooth, powerEfficient } or null (API missing, error, or no answer in 600 ms).
 */
export async function probeAv1Encode({ width = 1920, height = 1080, fps = 30, bitrate = 4_500_000 } = {}, env) {
  const mc = g(env).navigator?.mediaCapabilities;
  if (typeof mc?.encodingInfo !== "function") return null;
  const key = `${width}x${height}@${fps}`;
  if (probeCache.has(key)) return probeCache.get(key);
  const ask = (async () => {
    try {
      const info = await mc.encodingInfo({
        type: "webrtc",
        video: { contentType: "video/AV1", width, height, bitrate, framerate: fps },
      });
      return info
        ? { supported: Boolean(info.supported), smooth: Boolean(info.smooth), powerEfficient: Boolean(info.powerEfficient) }
        : null;
    } catch {
      return null;
    }
  })();
  const timeout = new Promise((resolve) => {
    const set = g(env).setTimeout || setTimeout;
    set(() => resolve(null), 600);
  });
  const result = await Promise.race([ask, timeout]);
  probeCache.set(key, result);
  return result;
}

export function _clearProbeCacheForTests() {
  probeCache.clear();
}

/** The transceiver that owns `sender` on `pc` (null when unknown). */
export function transceiverOf(pc, sender) {
  try {
    return pc?.getTransceivers?.().find((t) => t?.sender === sender) || null;
  } catch {
    return null;
  }
}

/**
 * Order the transceiver's codecs AV1 > VP9 > browser default (RTX / RED / FEC kept).
 * Returns the family list that was set, or null when the API is missing or refused.
 */
export function applyScreenCodecPreferences(transceiver, { blocked = [], allowed = null, av1Allowed = true } = {}, env) {
  if (!transceiver || typeof transceiver.setCodecPreferences !== "function") return null;
  const local = localVideoCaps(env);
  if (!local.send.length && !local.recv.length) return null;
  const block = av1Allowed ? [...blocked] : [...new Set([...blocked, "av1"])];
  const attempts = [
    intersectCapabilities(local.send, local.recv),
    local.send,
    local.recv,
  ];
  for (const list of attempts) {
    if (!list.length) continue;
    const ordered = orderScreenCodecs(list, { blocked: block, allowed });
    try {
      transceiver.setCodecPreferences(ordered);
      return familiesOf(ordered);
    } catch {
      /* not a subset of what this engine validates against: try the next list */
    }
  }
  return null;
}

/**
 * Sender encoding for a screen share: bitrate and frame rate ceiling, degradation
 * preference by content (text keeps resolution, motion balances), scalability mode for SFU.
 * Engines that reject a member get the call again without it.
 */
export async function tuneScreenSender(sender, { maxBitrate, maxFramerate, contentHint = "motion", transport = "mesh", family = "" } = {}) {
  if (!sender || typeof sender.getParameters !== "function") return false;
  const build = ({ withDegradation, withScalability }) => {
    const params = sender.getParameters();
    if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
    const enc = params.encodings[0];
    if (Number.isFinite(maxBitrate) && maxBitrate > 0) enc.maxBitrate = Math.round(maxBitrate);
    if (Number.isFinite(maxFramerate) && maxFramerate > 0) enc.maxFramerate = Math.round(maxFramerate);
    enc.priority = "high";
    enc.networkPriority = "high";
    if (withDegradation) params.degradationPreference = degradationPreferenceFor(contentHint);
    const mode = withScalability ? scalabilityModeFor({ transport, family }) : null;
    if (mode) enc.scalabilityMode = mode;
    return params;
  };
  const tries = [
    { withDegradation: true, withScalability: true },
    { withDegradation: true, withScalability: false },
    { withDegradation: false, withScalability: false },
  ];
  for (const opt of tries) {
    try {
      await sender.setParameters(build(opt));
      return true;
    } catch {
      /* try again with fewer members */
    }
  }
  return false;
}

/**
 * Switch a live sender to the best negotiated codec that is not blocked, without a new
 * offer (RTCRtpEncodingParameters.codec, Chromium 126+). Returns the family now in use, or
 * null when the engine cannot do it (caller renegotiates instead).
 */
export async function switchSenderCodec(sender, blocked = []) {
  if (!sender || typeof sender.getParameters !== "function") return null;
  let params;
  try {
    params = sender.getParameters();
  } catch {
    return null;
  }
  const negotiated = Array.isArray(params?.codecs) ? params.codecs : [];
  const block = new Set(blocked || []);
  const target = negotiated.find((c) => !isAuxCodec(c) && !block.has(codecFamily(c)));
  if (!target || !params.encodings?.length) return null;
  const family = codecFamily(target);
  const codec = { mimeType: target.mimeType, clockRate: target.clockRate };
  if (target.sdpFmtpLine) codec.sdpFmtpLine = target.sdpFmtpLine;
  params.encodings = params.encodings.map((e) => ({ ...e, codec }));
  try {
    await sender.setParameters(params);
    const after = sender.getParameters()?.encodings?.[0]?.codec;
    return after && codecFamily(after) === family ? family : null;
  } catch {
    return null;
  }
}

/** One stats summary for a sender (direction "out") or receiver ("in"). */
export async function sampleScreenRtp(target, { direction = "out", prev = null } = {}) {
  if (!target || typeof target.getStats !== "function") return null;
  try {
    return summarizeVideoRtp(await target.getStats(), { direction, prev });
  } catch {
    return null;
  }
}

const sessions = new WeakMap();

function hwCores(env) {
  const n = Number(g(env).navigator?.hardwareConcurrency);
  return Number.isFinite(n) && n > 0 ? n : 4;
}

/**
 * The encoder session of a captured screen track (created on first use).
 * config: { contentHint, resolution, fps, peerCount, transport: "mesh" | "sfu" }.
 */
export function screenEncoderFor(track, env) {
  if (!track || typeof track !== "object") return null;
  let s = sessions.get(track);
  if (s) return s;
  s = createSession(track, env);
  try {
    sessions.set(track, s);
  } catch {
    return s;
  }
  return s;
}

export function hasScreenEncoder(track) {
  return Boolean(track && typeof track === "object" && sessions.has(track));
}

function createSession(track, env) {
  const E = g(env);
  const now = () => (typeof E.performance?.now === "function" ? E.performance.now() : Date.now());
  const entries = new Map(); // sender -> { pc, transceiver, history: [], prev: null, family: "" }
  let timer = null;
  let graceUntil = 0;
  let renegotiate = null;
  let busy = false;

  const session = {
    track,
    config: { contentHint: "motion", resolution: "1080p", fps: 30, peerCount: 1, transport: "mesh" },
    blocked: [],
    av1Allowed: null,
    lastFallback: null,
    configure(patch = {}) {
      this.config = { ...this.config, ...patch };
      return this;
    },
    /** fn({ pc, sender, blocked }) -> Promise: new offer (mesh) or republish (SFU). */
    setRenegotiator(fn) {
      renegotiate = typeof fn === "function" ? fn : null;
      return this;
    },
    /** AV1 decision for this share: hardware probe (if the API answers) + CPU budget. */
    async prepare(env2 = env) {
      const [w, h] = RES_SIZE[this.config.resolution] || RES_SIZE["1080p"];
      const fps = Math.max(1, Number(this.config.fps) || 30);
      const encoders = this.config.transport === "sfu" ? 1 : Math.max(1, Number(this.config.peerCount) || 1);
      const local = localVideoCaps(env2);
      if (!local.encode.includes("av1")) {
        this.av1Allowed = false;
        return false;
      }
      const hw = await probeAv1Encode({ width: w, height: h, fps }, env2);
      this.av1Allowed = av1EncodeAllowed({ hw, cores: hwCores(env2), width: w, height: h, fps, encoders });
      return this.av1Allowed;
    },
    av1Ok() {
      if (this.av1Allowed != null) return this.av1Allowed;
      const [w, h] = RES_SIZE[this.config.resolution] || RES_SIZE["1080p"];
      const encoders = this.config.transport === "sfu" ? 1 : Math.max(1, Number(this.config.peerCount) || 1);
      return av1EncodeAllowed({ hw: null, cores: hwCores(env), width: w, height: h, fps: this.config.fps, encoders });
    },
    /** Order codecs on the transceiver (sync: call before the offer) and watch the sender. */
    attach(pc, sender, { transceiver = null } = {}) {
      if (!sender) return null;
      const tx = transceiver || transceiverOf(pc, sender);
      const set = tx ? applyScreenCodecPreferences(tx, { blocked: this.blocked, av1Allowed: this.av1Ok() }, env) : null;
      entries.set(sender, { pc: pc || null, transceiver: tx, sent: sender.track || track, history: [], prev: null, family: "" });
      start();
      return set;
    },
    detach(sender) {
      entries.delete(sender);
      if (!entries.size) stop();
    },
    senders() {
      return [...entries.keys()];
    },
    stop,
    /** Run one watch tick now (selftests; the timer calls the same). */
    tick,
    /** Apply a CPU fallback away from `family` on every sender. */
    fallback,
  };

  function start() {
    if (timer || typeof E.setInterval !== "function") return;
    timer = E.setInterval(() => {
      void tick();
    }, WATCH_MS);
    // Node (selftests, SSR) must not stay alive for a watch; browsers return a number.
    if (timer && typeof timer.unref === "function") timer.unref();
  }

  function stop() {
    if (timer && typeof E.clearInterval === "function") E.clearInterval(timer);
    timer = null;
  }

  function prune() {
    for (const [sender, entry] of entries) {
      const stopped = entry.transceiver?.stopped === true || entry.transceiver?.currentDirection === "stopped";
      const closed = entry.pc && (entry.pc.connectionState === "closed" || entry.pc.signalingState === "closed");
      // Replaced or removed track (stopDedicatedSender, LiveKit unpublish): stop watching.
      if (stopped || closed || sender.track !== entry.sent) entries.delete(sender);
    }
  }

  async function tick() {
    if (busy) return null;
    if (track.readyState === "ended") {
      entries.clear();
      stop();
      return null;
    }
    prune();
    if (!entries.size) {
      stop();
      return null;
    }
    busy = true;
    try {
      let worst = null;
      for (const [sender, entry] of entries) {
        const sample = await sampleScreenRtp(sender, { direction: "out", prev: entry.prev });
        if (!sample) continue;
        entry.prev = sample;
        entry.family = sample.family || entry.family;
        entry.history.push({ limitation: sample.limitation, encodeMs: sample.encodeMs, powerEfficient: sample.powerEfficient });
        if (entry.history.length > 6) entry.history.shift();
        if (now() < graceUntil) continue;
        if (entry.family !== "av1" && entry.family !== "vp9") continue;
        const load = assessEncoderLoad(entry.history, { targetFps: session.config.fps });
        if (load.cpuLimited && (!worst || entry.family === "av1")) worst = { family: entry.family, reason: load.reason };
      }
      if (worst) await fallback(worst.family, worst.reason);
      return worst;
    } finally {
      busy = false;
    }
  }

  async function fallback(family, reason = "cpu") {
    const next = nextFallbackBlock(family, session.blocked);
    if (!next) return false;
    session.blocked = next;
    if (family === "av1") session.av1Allowed = false;
    session.lastFallback = { from: family, reason, at: Date.now() };
    graceUntil = now() + GRACE_MS;
    for (const [sender, entry] of entries) {
      entry.history = [];
      if (entry.transceiver) applyScreenCodecPreferences(entry.transceiver, { blocked: session.blocked, av1Allowed: false }, env);
      let switched = null;
      if (session.config.transport !== "sfu") switched = await switchSenderCodec(sender, session.blocked);
      if (!switched && renegotiate) {
        try {
          await renegotiate({ pc: entry.pc, sender, blocked: [...session.blocked] });
        } catch {
          /* the next tick tries again only if it is still CPU-limited after the grace */
        }
      }
    }
    return true;
  }

  return session;
}

/** The quality pick in the shape the session config uses. */
export function encoderConfigFromQuality(quality = {}, { fps, peerCount = 1, transport = "mesh" } = {}) {
  return {
    contentHint: contentModeOf(quality?.contentHint),
    resolution: RES_SIZE[quality?.resolution] ? quality.resolution : "1080p",
    fps: Math.max(1, Number(fps ?? quality?.fps) || 30),
    peerCount: Math.max(1, Number(peerCount) || 1),
    transport: transport === "sfu" ? "sfu" : "mesh",
  };
}
