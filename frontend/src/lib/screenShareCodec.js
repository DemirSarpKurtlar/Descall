/**
 * Screen share picture quality: codec choice, encoder tuning and limits (pure logic, no
 * browser globals, so it runs in node selftests). Browser glue lives in screenShareEncoder.js.
 *
 * Policy (owner decision, "herkes en yuksek kalite"): every user gets the same, highest
 * quality tier. Nothing here takes a plan, tier or premium flag; the only limits left are
 * physical ones of a mesh call (one encode and one upload per viewer).
 *
 * Codec order for screen content: AV1, then VP9, then whatever the browser uses today
 * (VP8 in Chromium / Firefox, H.264 in Safari). AV1 is only offered when this device can
 * encode it without choking (hardware encoder, or a software encode that fits the CPU), and
 * a viewer only ever receives a codec it can decode:
 *  - mesh (DM, group call, server voice without SFU): every viewer has its own peer
 *    connection, so the SDP answer of that viewer drops codecs it cannot decode and the
 *    sender falls to the next one in our order. A new viewer gets its own negotiation.
 *  - SFU (LiveKit): one encode for everyone, so the publisher picks the best codec in the
 *    intersection of every viewer's decode list (sent over signaling) and keeps VP8 as the
 *    LiveKit backup codec for a viewer that joins later and cannot decode it.
 */

/** Codec families in the order we want them for screen content. */
export const SCREEN_CODEC_ORDER = Object.freeze(["av1", "vp9"]);

/** Every family a decode list may carry over signaling. */
export const VIDEO_CODEC_FAMILIES = Object.freeze(["av1", "vp9", "h265", "h264", "vp8"]);

/** Families that are not a picture codec (retransmission, redundancy, FEC). */
const AUX_FAMILIES = new Set(["rtx", "red", "ulpfec", "flexfec"]);

/** What a viewer that never reported its decoders is assumed to decode (every WebRTC stack). */
export const BASELINE_DECODE = Object.freeze(["vp8", "h264"]);

/** "video/AV1" -> "av1". Unknown or empty -> "". */
export function codecFamily(mimeTypeOrCodec) {
  const raw = typeof mimeTypeOrCodec === "string" ? mimeTypeOrCodec : mimeTypeOrCodec?.mimeType;
  const mime = String(raw || "").toLowerCase();
  const name = mime.includes("/") ? mime.slice(mime.indexOf("/") + 1) : mime;
  if (!name) return "";
  if (name === "av1" || name === "av1x") return "av1";
  if (name === "vp9") return "vp9";
  if (name === "vp8") return "vp8";
  if (name === "h264") return "h264";
  if (name === "h265" || name === "hevc") return "h265";
  if (name === "rtx") return "rtx";
  if (name === "red") return "red";
  if (name === "ulpfec") return "ulpfec";
  if (name.startsWith("flexfec")) return "flexfec";
  return name;
}

export function isAuxCodec(codec) {
  return AUX_FAMILIES.has(codecFamily(codec));
}

/** Short label for the stats readout: "AV1", "VP9", "H.264". */
export function codecLabel(mimeTypeOrFamily) {
  const fam = VIDEO_CODEC_FAMILIES.includes(mimeTypeOrFamily) ? mimeTypeOrFamily : codecFamily(mimeTypeOrFamily);
  return { av1: "AV1", vp9: "VP9", vp8: "VP8", h264: "H.264", h265: "H.265" }[fam] || (fam ? fam.toUpperCase() : "");
}

function vp9Profile(codec) {
  const m = /profile-id=(\d+)/.exec(String(codec?.sdpFmtpLine || ""));
  return m ? Number(m[1]) : 0;
}

/**
 * Order a capability list (RTCRtpSender.getCapabilities("video").codecs) for screen share.
 * AV1 first, VP9 next (profile 0 before the 10-bit profiles), then the remaining picture
 * codecs in the browser's own order, then RTX / RED / FEC (kept: dropping RTX would turn
 * off retransmission). The capability objects are returned as is, because
 * setCodecPreferences compares them field by field.
 *
 * `blocked`: families never to offer (CPU fallback). `allowed`: when given, only these
 * picture families are offered (SFU intersection). Neither may remove every picture codec:
 * if they would, the browser order is kept, so a share is never left without a codec.
 */
export function orderScreenCodecs(codecs, { blocked = [], allowed = null } = {}) {
  const list = Array.isArray(codecs) ? codecs.filter((c) => c && typeof c.mimeType === "string") : [];
  const block = new Set(blocked || []);
  const allow = allowed ? new Set(allowed) : null;
  const aux = list.filter((c) => isAuxCodec(c));
  const primary = list.filter((c) => !isAuxCodec(c));
  let usable = primary.filter((c) => {
    const fam = codecFamily(c);
    if (block.has(fam)) return false;
    if (allow && !allow.has(fam)) return false;
    return true;
  });
  if (!usable.length) usable = primary;
  const rank = (c) => {
    const i = SCREEN_CODEC_ORDER.indexOf(codecFamily(c));
    return i === -1 ? SCREEN_CODEC_ORDER.length : i;
  };
  const ordered = usable
    .map((c, index) => ({ c, index }))
    .sort((a, b) => {
      const r = rank(a.c) - rank(b.c);
      if (r) return r;
      if (codecFamily(a.c) === "vp9" && codecFamily(b.c) === "vp9") {
        const p = vp9Profile(a.c) - vp9Profile(b.c);
        if (p) return p;
      }
      return a.index - b.index;
    })
    .map((x) => x.c);
  return [...ordered, ...aux];
}

/**
 * Sender capabilities that the receiver side also lists (same mimeType + fmtp line).
 * Older WebKit / Chromium validate setCodecPreferences against the receiver capabilities
 * even on a sendonly transceiver; using the intersection is accepted everywhere.
 */
export function intersectCapabilities(sendCodecs, recvCodecs) {
  const recv = Array.isArray(recvCodecs) ? recvCodecs : [];
  if (!recv.length) return Array.isArray(sendCodecs) ? [...sendCodecs] : [];
  const key = (c) => `${String(c?.mimeType || "").toLowerCase()}|${c?.sdpFmtpLine || ""}`;
  const keys = new Set(recv.map(key));
  return (Array.isArray(sendCodecs) ? sendCodecs : []).filter((c) => keys.has(key(c)));
}

/** Picture codec families in a capability list, deduplicated, in list order. */
export function familiesOf(codecs) {
  const out = [];
  for (const c of Array.isArray(codecs) ? codecs : []) {
    const fam = codecFamily(c);
    if (!fam || AUX_FAMILIES.has(fam) || out.includes(fam)) continue;
    out.push(fam);
  }
  return out;
}

/** Whitelist a decode list received over signaling (or about to be sent). */
export function sanitizeVideoDecode(input) {
  if (!Array.isArray(input)) return null;
  const out = [];
  for (const raw of input.slice(0, 16)) {
    const fam = typeof raw === "string" ? raw.trim().toLowerCase() : "";
    if (VIDEO_CODEC_FAMILIES.includes(fam) && !out.includes(fam)) out.push(fam);
  }
  return out.length ? out : null;
}

/**
 * Families every viewer can decode. `viewers` is one entry per viewer: its decode list, or
 * null / undefined when it never reported one (older app): such a viewer counts as
 * BASELINE_DECODE. No viewers -> null (no constraint yet).
 */
export function intersectDecodeFamilies(viewers) {
  const list = Array.isArray(viewers) ? viewers : [];
  if (!list.length) return null;
  let acc = null;
  for (const entry of list) {
    const fams = sanitizeVideoDecode(entry) || [...BASELINE_DECODE];
    acc = acc ? acc.filter((f) => fams.includes(f)) : fams;
  }
  return acc || [];
}

/**
 * AV1 is offered only when this device can encode it smoothly. `hw` is the answer of
 * navigator.mediaCapabilities.encodingInfo({ type: "webrtc", video: AV1 ... }) or null.
 * A hardware (power efficient) encoder always qualifies. A software encoder qualifies when
 * the pixel rate of every encode this share runs (one per viewer in a mesh) fits the CPU.
 */
export function av1EncodeAllowed({ hw = null, cores = 4, width = 1920, height = 1080, fps = 30, encoders = 1 } = {}) {
  if (hw && hw.supported === false) return false;
  if (hw && hw.powerEfficient === true) return true;
  if (hw && hw.smooth === false) return false;
  const n = Math.max(1, Number(cores) || 4);
  const pixelRate = Math.max(1, width) * Math.max(1, height) * Math.max(1, fps) * Math.max(1, encoders);
  let budget = 0;
  if (n >= 8) budget = 2560 * 1440 * 30;
  else if (n >= 6) budget = 1920 * 1080 * 30;
  else if (n >= 4) budget = 1280 * 720 * 30;
  return pixelRate <= budget;
}

/**
 * The codec an SFU publish should use: the first of AV1 / VP9 that this device encodes,
 * every viewer decodes and is not blocked; else VP8 (LiveKit's default and backup codec).
 */
export function pickSfuScreenCodec({ encode = [], viewers = null, blocked = [], av1Allowed = true } = {}) {
  const can = new Set(Array.isArray(encode) ? encode : []);
  const block = new Set(blocked || []);
  const decodable = intersectDecodeFamilies(viewers);
  for (const fam of SCREEN_CODEC_ORDER) {
    if (fam === "av1" && !av1Allowed) continue;
    if (!can.has(fam) || block.has(fam)) continue;
    if (decodable && !decodable.includes(fam)) continue;
    return fam;
  }
  return "vp8";
}

/** Content mode from the quality pick: "text" and "detail" keep text sharp, else motion. */
export function contentModeOf(contentHint) {
  return contentHint === "text" || contentHint === "detail" ? contentHint : "motion";
}

/** Text, code, slides and apps keep their resolution; games and video trade both. */
export function degradationPreferenceFor(contentHint) {
  return contentModeOf(contentHint) === "motion" ? "balanced" : "maintain-resolution";
}

/**
 * Scalability mode. SFU + SVC codec (AV1 / VP9): L1T3, so the SFU can drop temporal layers
 * per viewer (one spatial layer: screen text stays full size). Mesh: none (L1T1 default):
 * nothing sits between sender and viewer to drop layers, and Chromium caps VP9 L1T3 with a
 * screen content hint at 5 fps. Only returned when the browser lists the mode (when it
 * reports modes at all).
 */
export function scalabilityModeFor({ transport = "mesh", family = "", supportedModes = null } = {}) {
  if (transport !== "sfu") return null;
  if (family !== "av1" && family !== "vp9") return null;
  if (Array.isArray(supportedModes) && supportedModes.length && !supportedModes.includes("L1T3")) return null;
  return "L1T3";
}

/** Ceiling per resolution at 30 fps, one viewer (or the single SFU upload). */
const RES_CEILING = Object.freeze({
  "480p": 1_200_000,
  "720p": 2_500_000,
  "1080p": 4_500_000,
  "1440p": 7_000_000,
  "2160p": 12_000_000,
});

/**
 * Encoder bitrate ceiling for one screen sender. The codec is not a factor: at the same
 * ceiling AV1 / VP9 draw a sharper picture than VP8, which is the point. Static screens use
 * far less than the ceiling. A mesh caps each copy because the sharer uploads one per viewer.
 */
export function screenMaxBitrate({ resolution = "720p", fps = 30, peerCount = 1, transport = "mesh" } = {}) {
  const base = RES_CEILING[resolution] || RES_CEILING["720p"];
  const f = Math.max(1, Number(fps) || 30);
  const fpsFactor = Math.min(1.5, Math.max(0.6, Math.pow(f / 30, 0.6)));
  let bps = Math.round((base * fpsFactor) / 1000) * 1000;
  const n = Math.max(1, Number(peerCount) || 1);
  if (transport !== "sfu") {
    if (n >= 5) bps = Math.min(bps, 900_000);
    else if (n >= 3) bps = Math.min(bps, 1_600_000);
  }
  return bps;
}

export const SCREEN_RESOLUTIONS = Object.freeze(["480p", "720p", "1080p", "1440p"]);
export const SCREEN_FPS = Object.freeze([15, 20, 24, 30, 60]);

/**
 * What a call lets the sharer pick. The same for every user (no plan input). Every
 * resolution everywhere; 60 fps everywhere except a mesh of 3+ people, where each viewer
 * costs one more full encode and upload, so it tops out at 30.
 */
export function screenShareLimits({ mesh = false, participantCount = 2 } = {}) {
  const heavyMesh = Boolean(mesh) && Number(participantCount) >= 3;
  const maxFps = heavyMesh ? 30 : 60;
  return {
    resolutions: [...SCREEN_RESOLUTIONS],
    fps: SCREEN_FPS.filter((f) => f <= maxFps),
    maxFps,
  };
}

/**
 * Encoder load from a window of stats samples ({ limitation, encodeMs, powerEfficient }),
 * newest last. CPU-limited when the browser says so in 3 of the last 4 samples, or when a
 * software encoder spends more than 85 % of the frame budget in 3 of the last 4.
 */
export function assessEncoderLoad(samples, { targetFps = 30 } = {}) {
  const recent = (Array.isArray(samples) ? samples : []).slice(-4);
  if (recent.length < 3) return { cpuLimited: false, reason: "warming-up" };
  const budgetMs = 1000 / Math.max(1, Number(targetFps) || 30);
  const cpu = recent.filter((s) => s?.limitation === "cpu").length;
  if (cpu >= 3) return { cpuLimited: true, reason: "quality-limitation-cpu" };
  const software = recent.every((s) => s?.powerEfficient !== true);
  const slow = recent.filter((s) => Number.isFinite(s?.encodeMs) && s.encodeMs > budgetMs * 0.85).length;
  if (software && slow >= 3) return { cpuLimited: true, reason: "encode-time" };
  return { cpuLimited: false, reason: "ok" };
}

/** CPU fallback chain: AV1 -> VP9 -> the browser default. null when nothing lighter is left. */
export function nextFallbackBlock(currentFamily, blocked = []) {
  const block = new Set(blocked || []);
  if (currentFamily === "av1" && !block.has("av1")) return [...block, "av1"];
  if (currentFamily === "vp9" && !block.has("vp9")) return [...block, "av1", "vp9"].filter((v, i, a) => a.indexOf(v) === i);
  return null;
}

/**
 * Codec + encoding options for a LiveKit screen publish (one encode for the whole room).
 * VP8 backup codec: a viewer that joins later and cannot decode AV1 / VP9 makes the SFU ask
 * for it, so the share keeps going without a restart.
 */
export function liveKitScreenEncoding({ family = "vp8", contentHint = "motion", maxBitrate = 4_500_000, fps = 30 } = {}) {
  const svc = family === "av1" || family === "vp9";
  const maxFramerate = Math.max(1, Math.round(Number(fps) || 30));
  const opts = {
    videoCodec: family,
    simulcast: false,
    degradationPreference: degradationPreferenceFor(contentHint),
    screenShareEncoding: { maxBitrate, maxFramerate, priority: "high" },
    backupCodec: svc ? { codec: "vp8", encoding: { maxBitrate, maxFramerate } } : false,
  };
  if (svc) opts.scalabilityMode = "L1T3";
  return opts;
}

/**
 * One RTP stream out of a getStats() report: the video outbound-rtp (direction "out") or
 * inbound-rtp ("in") entry, with its codec resolved through codecId. When several match,
 * the largest frame wins (the screen is larger than a camera). `prev` is the summary of
 * the previous call, for per-interval encode time.
 */
export function summarizeVideoRtp(report, { direction = "out", prev = null } = {}) {
  const entries = [];
  const byId = new Map();
  const each = (fn) => {
    if (!report) return;
    if (typeof report.forEach === "function") report.forEach((v) => fn(v));
    else if (Array.isArray(report)) report.forEach(fn);
  };
  each((e) => {
    if (!e || typeof e !== "object") return;
    if (e.id) byId.set(e.id, e);
    const type = direction === "in" ? "inbound-rtp" : "outbound-rtp";
    if (e.type === type && (e.kind === "video" || e.mediaType === "video")) entries.push(e);
  });
  if (!entries.length) return null;
  entries.sort((a, b) => (b.frameWidth || 0) * (b.frameHeight || 0) - (a.frameWidth || 0) * (a.frameHeight || 0));
  const e = entries[0];
  const codec = e.codecId ? byId.get(e.codecId) : null;
  const family = codecFamily(codec?.mimeType || "");
  let encodeMs = null;
  if (direction !== "in" && prev && Number.isFinite(e.totalEncodeTime) && Number.isFinite(e.framesEncoded)) {
    const frames = e.framesEncoded - (prev.framesEncoded ?? 0);
    const secs = e.totalEncodeTime - (prev.totalEncodeTime ?? 0);
    if (frames > 0 && secs >= 0) encodeMs = Math.round((secs / frames) * 10000) / 10;
  }
  const fps = Number.isFinite(e.framesPerSecond) ? Math.round(e.framesPerSecond) : null;
  return {
    direction: direction === "in" ? "in" : "out",
    family,
    codec: codecLabel(family),
    width: e.frameWidth || null,
    height: e.frameHeight || null,
    fps,
    limitation: e.qualityLimitationReason || null,
    powerEfficient: direction === "in" ? e.powerEfficientDecoder === true : e.powerEfficientEncoder === true,
    implementation: (direction === "in" ? e.decoderImplementation : e.encoderImplementation) || null,
    scalabilityMode: e.scalabilityMode || null,
    encodeMs,
    framesEncoded: Number.isFinite(e.framesEncoded) ? e.framesEncoded : null,
    totalEncodeTime: Number.isFinite(e.totalEncodeTime) ? e.totalEncodeTime : null,
  };
}

/** "AV1 · 1920×1080 · 30 fps" for the connection card. Empty when nothing is known yet. */
export function formatScreenStats(summary) {
  if (!summary) return "";
  const parts = [];
  if (summary.codec) parts.push(summary.codec);
  if (summary.width && summary.height) parts.push(`${summary.width}×${summary.height}`);
  if (summary.fps != null) parts.push(`${summary.fps} fps`);
  return parts.join(" · ");
}
