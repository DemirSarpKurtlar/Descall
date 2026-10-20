/**
 * Voice capture and playback preferences shared by DM calls, group calls,
 * and server voice. Stored on this device only.
 */

const PROFILE_KEY = "descall:voiceProfile";
const LEGACY_NS_KEY = "descall:noiseSuppressionEnabled";
const VOLUME_KEY = "descall:participantVolumes";
const MUTE_KEY = "descall:localMute";

export const PTT_ACCELERATORS = [
  { id: "mod+shift+m", label: "Ctrl/Cmd+Shift+M", code: "KeyM", shift: true, mod: true },
  { id: "mod+shift+space", label: "Ctrl/Cmd+Shift+Space", code: "Space", shift: true, mod: true },
  { id: "alt+shift+m", label: "Alt+Shift+M", code: "KeyM", shift: true, alt: true },
];

export const SOFT_CUE_TYPES = new Set([
  "userJoin",
  "userLeave",
  "channelJoin",
  "channelLeave",
  "mute",
  "unmute",
]);

export function defaultVoiceProfile() {
  return {
    noiseMode: "on",
    echoCancellation: true,
    autoGainControl: true,
    inputSensitivity: 45,
    pushToTalk: false,
    pttAccelerator: "mod+shift+m",
  };
}

function storage() {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

function normalizeMode(value) {
  return value === "off" || value === "strong" ? value : "on";
}

export function readVoiceProfile() {
  const base = defaultVoiceProfile();
  const store = storage();
  if (!store) return base;
  try {
    const raw = store.getItem(PROFILE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        ...base,
        ...parsed,
        noiseMode: normalizeMode(parsed?.noiseMode),
        echoCancellation: parsed?.echoCancellation !== false,
        autoGainControl: parsed?.autoGainControl !== false,
        inputSensitivity: clampSensitivity(parsed?.inputSensitivity),
        pushToTalk: Boolean(parsed?.pushToTalk),
        pttAccelerator: PTT_ACCELERATORS.some((item) => item.id === parsed?.pttAccelerator)
          ? parsed.pttAccelerator
          : base.pttAccelerator,
      };
    }
  } catch {
    /* fall through to the legacy boolean */
  }
  const legacy = store.getItem(LEGACY_NS_KEY);
  if (legacy === "0" || legacy === "false") base.noiseMode = "off";
  return base;
}

export function writeVoiceProfile(patch) {
  const next = { ...readVoiceProfile(), ...patch };
  next.noiseMode = normalizeMode(next.noiseMode);
  next.inputSensitivity = clampSensitivity(next.inputSensitivity);
  next.echoCancellation = next.echoCancellation !== false;
  next.autoGainControl = next.autoGainControl !== false;
  next.pushToTalk = Boolean(next.pushToTalk);
  if (!PTT_ACCELERATORS.some((item) => item.id === next.pttAccelerator)) {
    next.pttAccelerator = defaultVoiceProfile().pttAccelerator;
  }
  const store = storage();
  try {
    store?.setItem(PROFILE_KEY, JSON.stringify(next));
    store?.setItem(LEGACY_NS_KEY, next.noiseMode === "off" ? "0" : "1");
  } catch {
    /* private mode */
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("descall:voice-profile", { detail: next }));
  }
  return next;
}

export function clampSensitivity(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 45;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * Higher sensitivity opens the speaking gate on quieter speech.
 * Default (45) ≈ 0.030 RMS: normal speech on a laptop / phone mic after AGC
 * sits around 0.03–0.15, so the old 0.046 default missed quiet talkers and
 * made the ring flicker on and off mid-sentence.
 */
export function speakingThreshold(sensitivity = readVoiceProfile().inputSensitivity) {
  const s = clampSensitivity(sensitivity);
  return 0.045 - (s / 100) * 0.034;
}

export function audioBitrateForQuality(quality, { music = false } = {}) {
  if (music) {
    if (quality === "poor") return 48_000;
    if (quality === "fair") return 64_000;
    if (quality === "excellent") return 128_000;
    return 96_000;
  }
  if (quality === "excellent") return 64_000;
  if (quality === "fair") return 32_000;
  if (quality === "poor" || quality === "failed") return 24_000;
  return 48_000;
}

/**
 * RTCRtpReceiver.jitterBufferTarget is in milliseconds. null = browser default
 * (lowest delay) on a healthy link; a deeper target only once the link is
 * losing packets / jittery. Bench (10-20% loss, 40-70 ms jitter): 100-120 ms
 * cut concealed audio by ~25% vs the default.
 */
export function jitterBufferTargetMs(quality) {
  if (quality === "poor" || quality === "failed") return 120;
  if (quality === "fair") return 80;
  return null;
}

/** Seconds. Shorter when the link is healthy, longer when it is losing packets. */
export function jitterBufferTargetSeconds(quality) {
  if (quality === "poor" || quality === "failed") return 0.16;
  if (quality === "fair") return 0.1;
  return 0.05;
}

export function captureConstraints(prefs = readVoiceProfile(), deviceId) {
  const neural = prefs.noiseMode !== "off";
  const audio = {
    echoCancellation: { ideal: prefs.echoCancellation !== false },
    noiseSuppression: { ideal: false },
    autoGainControl: { ideal: prefs.autoGainControl !== false },
    channelCount: { ideal: 1 },
    sampleRate: { ideal: 48000 },
    latency: { ideal: 0.01 },
    googEchoCancellation: prefs.echoCancellation !== false,
    googAutoGainControl: prefs.autoGainControl !== false,
    googNoiseSuppression: false,
    googHighpassFilter: true,
  };
  if (!neural) {
    audio.noiseSuppression = { ideal: false };
    audio.googNoiseSuppression = false;
  }
  if (deviceId) audio.deviceId = { exact: deviceId };
  return audio;
}

export function gateSettings(mode) {
  if (mode === "strong") return { openThreshold: -44, closeThreshold: -56, holdMs: 140 };
  return { openThreshold: -52, closeThreshold: -62, holdMs: 110 };
}

export function agcCompressorSettings() {
  return { threshold: -30, knee: 12, ratio: 2.2, attack: 0.012, release: 0.28 };
}

export function clampGain(volume) {
  const n = Number(volume);
  if (!Number.isFinite(n)) return 1;
  return Math.max(0, Math.min(2, n));
}

export function readParticipantGain(userId) {
  if (userId == null) return null;
  const store = storage();
  if (!store) return null;
  try {
    const map = JSON.parse(store.getItem(VOLUME_KEY) || "{}");
    if (!Object.prototype.hasOwnProperty.call(map, String(userId))) return null;
    return clampGain(map[String(userId)]);
  } catch {
    return null;
  }
}

export function writeParticipantGain(userId, gain) {
  if (userId == null) return;
  const store = storage();
  if (!store) return;
  try {
    const map = JSON.parse(store.getItem(VOLUME_KEY) || "{}");
    map[String(userId)] = clampGain(gain);
    store.setItem(VOLUME_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export function readLocalMute() {
  const store = storage();
  if (!store) return false;
  return store.getItem(MUTE_KEY) === "1";
}

export function writeLocalMute(muted) {
  try {
    storage()?.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export function applyStoredMute(stream) {
  if (!stream || !readLocalMute()) return stream;
  stream.getAudioTracks?.().forEach((track) => {
    track.enabled = false;
  });
  return stream;
}

/** Persisted mute, or push-to-talk, starts the call silent until the user talks. */
export function primeCapturedMic(stream) {
  const muted = Boolean(readVoiceProfile().pushToTalk) || readLocalMute();
  stream?.getAudioTracks?.().forEach((track) => {
    track.enabled = !muted;
  });
  return muted;
}

const HEADSET_LABEL = /airpod|headphone|headset|bluetooth|buds|earbud/i;

export function nextMicDeviceId(reason, inputs, preferredId = "") {
  const list = inputs || [];
  if (reason === "headset-added") {
    const hit = list.find((device) => HEADSET_LABEL.test(device?.label || ""));
    return hit?.deviceId || "";
  }
  if (preferredId && list.some((device) => device?.deviceId === preferredId)) return preferredId;
  return "";
}

/**
 * First snapshot only records the device list. Later changes recapture when
 * the live mic disappeared or a headset showed up on the system default.
 */
export function micRecapturePlan({
  previousIds = [],
  inputs = [],
  currentDeviceId = "",
  preferredId = "",
} = {}) {
  const inputIds = inputs.map((device) => device?.deviceId).filter(Boolean);
  const firstSnapshot = previousIds.length === 0;
  const addedLabels = firstSnapshot
    ? []
    : inputs
        .filter((device) => device?.deviceId && !previousIds.includes(device.deviceId))
        .map((device) => device.label);
  const reason = shouldRecaptureMic({ currentDeviceId, inputIds, preferredId, addedLabels });
  if (!reason) return { reason: null, deviceId: preferredId || "" };
  return { reason, deviceId: nextMicDeviceId(reason, inputs, preferredId) };
}

export function participantVolumePercent(liveGain, userId) {
  const remembered = liveGain != null ? liveGain : readParticipantGain(userId);
  const gain = remembered == null ? 1 : remembered;
  return Math.round(clampGain(gain) * 100);
}

export function networkQualityBucket(quality) {
  const q = String(quality || "").toLowerCase();
  if (q === "excellent" || q === "good") return "good";
  if (q === "fair" || q === "medium") return "medium";
  if (q === "poor" || q === "failed" || q === "lost" || q === "weak") return "poor";
  return "";
}

export function networkQualityTooltipKey(quality) {
  const bucket = networkQualityBucket(quality);
  if (bucket === "good") return "Connection is good";
  if (bucket === "medium") return "Connection is medium. Voice bitrate is reduced.";
  if (bucket === "poor") return "Connection is poor. Extra redundancy is on to ride out packet loss.";
  return "";
}

/**
 * current-missing: headphones unplugged.
 * preferred-missing: the saved device is gone.
 * headset-added: a new headset appeared while following the system default.
 */
export function shouldRecaptureMic({ currentDeviceId = "", inputIds = [], preferredId = "", addedLabels = [] } = {}) {
  const ids = inputIds.filter(Boolean);
  if (preferredId && !ids.includes(preferredId)) return "preferred-missing";
  if (currentDeviceId && !ids.includes(currentDeviceId)) return "current-missing";
  if (!preferredId && addedLabels.some((label) => /airpod|headphone|headset|bluetooth|buds|earbud/i.test(String(label || "")))) {
    return "headset-added";
  }
  return null;
}

export function matchPushToTalkEvent(event, acceleratorId) {
  const spec = PTT_ACCELERATORS.find((item) => item.id === acceleratorId);
  if (!spec || !event || event.repeat) return false;
  if (event.code !== spec.code) return false;
  if (Boolean(event.shiftKey) !== Boolean(spec.shift)) return false;
  if (Boolean(event.altKey) !== Boolean(spec.alt)) return false;
  const mod = Boolean(event.metaKey || event.ctrlKey);
  if (spec.mod && !mod) return false;
  if (!spec.mod && mod) return false;
  return true;
}

export function softCueVolume(base) {
  const n = Number(base);
  const v = Number.isFinite(n) ? n : 1;
  return Math.max(0, Math.min(1, v * 0.55));
}

function mergeFmtp(existing, desired) {
  const map = new Map();
  for (const part of String(existing || "").split(";")) {
    if (!part.trim()) continue;
    const idx = part.indexOf("=");
    if (idx <= 0) continue;
    map.set(part.slice(0, idx).trim(), part.slice(idx + 1).trim());
  }
  for (const [key, value] of Object.entries(desired)) map.set(key, value);
  return [...map.entries()].map(([key, value]) => `${key}=${value}`).join(";");
}

export function opusFmtp(options = {}) {
  const bitrate = Number(options.maxAverageBitrate) || 48_000;
  const stereo = Boolean(options.stereo);
  return mergeFmtp("", {
    minptime: "10",
    ptime: "20",
    maxplaybackrate: "48000",
    "sprop-maxcapturerate": "48000",
    useinbandfec: options.fec === false ? "0" : "1",
    usedtx: options.dtx === false ? "0" : "1",
    stereo: stereo ? "1" : "0",
    "sprop-stereo": stereo ? "1" : "0",
    maxaveragebitrate: String(bitrate),
    cbr: "0",
  });
}

/** Rewrite Opus fmtp so voice offers ask for FEC, DTX, 48 kHz and a bitrate cap. */
export function tuneOpusSdp(sdp, options = {}) {
  if (typeof sdp !== "string" || !/opus\/48000/i.test(sdp)) return sdp;
  const nl = sdp.includes("\r\n") ? "\r\n" : "\n";
  const lines = sdp.split(/\r\n|\n/);
  const opusPts = new Set();
  for (const line of lines) {
    const match = line.match(/^a=rtpmap:(\d+)\s+opus\/48000/i);
    if (match) opusPts.add(match[1]);
  }
  if (!opusPts.size) return sdp;
  const fmtpLine = opusFmtp(options);
  const hasFmtp = new Set();
  const out = [];
  for (const line of lines) {
    const fmtp = line.match(/^a=fmtp:(\d+)\s+/);
    if (fmtp && opusPts.has(fmtp[1])) {
      out.push(`a=fmtp:${fmtp[1]} ${fmtpLine}`);
      hasFmtp.add(fmtp[1]);
      continue;
    }
    out.push(line);
    const rtp = line.match(/^a=rtpmap:(\d+)\s+opus\/48000/i);
    if (rtp && !hasFmtp.has(rtp[1])) {
      const later = lines.some((candidate) => candidate.startsWith(`a=fmtp:${rtp[1]} `));
      if (!later) {
        out.push(`a=fmtp:${rtp[1]} ${fmtpLine}`);
        hasFmtp.add(rtp[1]);
      }
    }
  }
  return out.join(nl);
}

export function opusOptionsForSenders(senders) {
  const music = (senders || []).some((sender) => {
    const track = sender?.track;
    if (track?.kind !== "audio") return false;
    // Screen/tab audio is tagged music (and descall-screen-audio). Voice DTX
    // and mono on that m-line drop system audio the remote cannot turn back up.
    if (track.contentHint === "music") return true;
    return track.__descallRole === "screen-audio";
  });
  return {
    maxAverageBitrate: audioBitrateForQuality(music ? "excellent" : "good", { music }),
    stereo: music,
    dtx: !music,
    fec: true,
  };
}

export function liveKitRoomOptions(prefs = readVoiceProfile()) {
  return {
    adaptiveStream: true,
    dynacast: true,
    audioCaptureDefaults: {
      echoCancellation: prefs.echoCancellation !== false,
      noiseSuppression: false,
      autoGainControl: prefs.autoGainControl !== false,
      channelCount: 1,
      sampleRate: 48000,
    },
    publishDefaults: {
      dtx: true,
      red: true,
      forceStereo: false,
      audioPreset: { maxBitrate: 48_000 },
    },
  };
}

export function liveKitMicPublishOptions(source) {
  return {
    source,
    dtx: true,
    red: true,
    forceStereo: false,
    audioPreset: { maxBitrate: audioBitrateForQuality("good") },
  };
}

export async function pickFastestLiveKitUrl(urls, { fetchImpl, now = () => Date.now(), timeoutMs = 700 } = {}) {
  const list = [...new Set((urls || []).map((url) => String(url || "").trim()).filter(Boolean))];
  if (list.length <= 1) return list[0] || "";
  const probe = fetchImpl || (typeof fetch === "function" ? fetch : null);
  if (!probe) return list[0];
  const attempts = list.map(async (url) => {
    const started = now();
    const httpUrl = url.replace(/^ws/i, "http");
    let timer = 0;
    try {
      const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
      timer = setTimeout(() => ctrl?.abort(), timeoutMs);
      await probe(httpUrl, { method: "GET", mode: "no-cors", signal: ctrl?.signal });
      return { url, ms: now() - started };
    } catch {
      return { url, ms: timeoutMs + 1 };
    } finally {
      clearTimeout(timer);
    }
  });
  const ranked = await Promise.all(attempts);
  ranked.sort((a, b) => a.ms - b.ms);
  return ranked[0]?.url || list[0];
}

export function claimVoiceAudioSession() {
  try {
    const session = typeof navigator !== "undefined" ? navigator.audioSession : null;
    if (session && "type" in session) session.type = "play-and-record";
  } catch {
    /* browsers without the audio session API keep the default */
  }
}

export function tuneAudioReceiver(receiver, quality = "good") {
  if (!receiver) return;
  const target = jitterBufferTargetSeconds(quality);
  try {
    if ("jitterBufferTarget" in receiver) receiver.jitterBufferTarget = target;
  } catch {
    /* older browsers ignore the hint */
  }
  try {
    if (typeof receiver.playoutDelayHint === "number" || "playoutDelayHint" in receiver) {
      receiver.playoutDelayHint = target;
    }
  } catch {
    /* ignore */
  }
}

export function preferVoiceCodecs(transceiver) {
  if (!transceiver || typeof RTCRtpSender === "undefined" || !RTCRtpSender.getCapabilities) return;
  try {
    const caps = RTCRtpSender.getCapabilities("audio");
    if (!caps?.codecs?.length || typeof transceiver.setCodecPreferences !== "function") return;
    const rank = (codec) => {
      const mime = String(codec?.mimeType || "").toLowerCase();
      if (mime === "audio/red") return 0;
      if (mime === "audio/opus") return 1;
      return 2;
    };
    transceiver.setCodecPreferences([...caps.codecs].sort((a, b) => rank(a) - rank(b)));
  } catch {
    /* setCodecPreferences throws if the list is not a subset on some browsers */
  }
}
