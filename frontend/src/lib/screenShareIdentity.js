/**
 * Screen share vs camera identity.
 *
 * A share is a display capture (getDisplayMedia / desktopCapturer) published
 * on its own stream and transceiver. The camera is getUserMedia video.
 * Remote viewers classify by LiveKit source, track name, signaled stream id,
 * or transceiver mid. Arrival order and "a share is expected" never promote
 * a camera into the screen stage.
 */

export const ROLE_SCREEN = "screen";
export const ROLE_SCREEN_AUDIO = "screen-audio";
export const ROLE_CAMERA = "camera";
export const ROLE_MIC = "mic";

export const TRACK_NAME = {
  screen: "descall-screen",
  screenAudio: "descall-screen-audio",
  camera: "descall-camera",
  mic: "descall-mic",
};

export const LIVEKIT_SOURCE = {
  screen: "screen_share",
  screenAudio: "screen_share_audio",
  camera: "camera",
  mic: "microphone",
};

const CAPTURE_SURFACES = new Set(["monitor", "window", "browser", "application"]);

/** Capture-source labels only. A window title that merely contains "window" is not enough. */
const CAPTURE_LABEL = /^(screen\b|display\b|monitor\b|web-contents|primary monitor|entire screen|window capture|tab capture|desktop capture)/i;

export function tagLocalTrack(track, role) {
  if (!track || !role) return track;
  try {
    Object.defineProperty(track, "__descallRole", {
      value: role,
      writable: true,
      configurable: true,
    });
  } catch {
    try {
      track.__descallRole = role;
    } catch {
      /* frozen test doubles */
    }
  }
  return track;
}

export function readLocalRole(track) {
  return track?.__descallRole || null;
}

export function sanitizeScreenAnnouncement(input) {
  if (!input || typeof input !== "object") return null;
  const clean = (value, max) => {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    return trimmed.slice(0, max);
  };
  const streamId = clean(input.streamId, 128);
  const videoMid = clean(input.videoMid, 64);
  const audioMid = clean(input.audioMid, 64);
  if (!streamId && !videoMid && !audioMid) return null;
  return { v: 1, streamId, videoMid, audioMid };
}

export function mergeScreenAnnouncement(prev, next) {
  const incoming = sanitizeScreenAnnouncement(next);
  const current = sanitizeScreenAnnouncement(prev);
  if (!incoming) return current;
  if (!current) return incoming;
  return sanitizeScreenAnnouncement({
    streamId: incoming.streamId || current.streamId,
    videoMid: incoming.videoMid || current.videoMid,
    audioMid: incoming.audioMid || current.audioMid,
  });
}

function matchesAnnouncement(info, announcement) {
  if (!announcement) return false;
  const streamId = info?.streamId ? String(info.streamId) : "";
  const mid = info?.mid ? String(info.mid) : "";
  if (announcement.streamId && streamId && announcement.streamId === streamId) return true;
  if (info?.kind === "video" && announcement.videoMid && mid && announcement.videoMid === mid) return true;
  if (info?.kind === "audio" && announcement.audioMid && mid && announcement.audioMid === mid) return true;
  return false;
}

/**
 * Classify one inbound track.
 * `announcement` is the signaled display stream. It never matches a camera
 * source, a microphone source, or a descall-camera / descall-mic name.
 */
export function classifyInboundMedia({
  kind,
  source = null,
  trackName = null,
  streamId = null,
  mid = null,
  displaySurface = null,
  label = "",
  announcement = null,
  localRole = null,
} = {}) {
  const k = kind === "audio" ? "audio" : kind === "video" ? "video" : null;
  if (!k) return null;

  if (
    localRole === ROLE_SCREEN ||
    localRole === ROLE_SCREEN_AUDIO ||
    localRole === ROLE_CAMERA ||
    localRole === ROLE_MIC
  ) {
    return localRole;
  }

  const src = String(source || "");
  if (src === LIVEKIT_SOURCE.screen) return ROLE_SCREEN;
  if (src === LIVEKIT_SOURCE.screenAudio) return ROLE_SCREEN_AUDIO;
  if (src === LIVEKIT_SOURCE.camera) return ROLE_CAMERA;
  if (src === LIVEKIT_SOURCE.mic) return ROLE_MIC;

  const name = String(trackName || "");
  if (name === TRACK_NAME.screen) return ROLE_SCREEN;
  if (name === TRACK_NAME.screenAudio) return ROLE_SCREEN_AUDIO;
  if (name === TRACK_NAME.camera) return ROLE_CAMERA;
  if (name === TRACK_NAME.mic) return ROLE_MIC;

  const info = { kind: k, streamId, mid };
  if (matchesAnnouncement(info, sanitizeScreenAnnouncement(announcement))) {
    return k === "audio" ? ROLE_SCREEN_AUDIO : ROLE_SCREEN;
  }

  if (k === "video" && CAPTURE_SURFACES.has(String(displaySurface || ""))) return ROLE_SCREEN;
  if (k === "video" && CAPTURE_LABEL.test(String(label || "").trim())) return ROLE_SCREEN;

  return k === "audio" ? ROLE_MIC : ROLE_CAMERA;
}

export function isScreenRole(role) {
  return role === ROLE_SCREEN || role === ROLE_SCREEN_AUDIO;
}

/**
 * Refuse to publish a camera as a share, or a display capture as the camera.
 * Call after tagging the track with the role you intend to publish.
 */
export function assertPublishRole(track, role) {
  if (!track) {
    const err = new Error(`Missing ${role} track`);
    err.code = "SCREEN_SHARE_TRACK_MISSING";
    throw err;
  }
  const tagged = readLocalRole(track);
  if (tagged && tagged !== role) {
    const err = new Error(`Refusing to publish a ${tagged} track as ${role}`);
    err.code = "SCREEN_SHARE_ROLE_MISMATCH";
    throw err;
  }
  const settings = typeof track.getSettings === "function" ? track.getSettings() || {} : {};
  if (role === ROLE_SCREEN) {
    if (settings.facingMode && !CAPTURE_SURFACES.has(String(settings.displaySurface || ""))) {
      const err = new Error("Refusing to publish a camera track as screen share");
      err.code = "SCREEN_SHARE_CAMERA_REFUSED";
      throw err;
    }
  }
  if (role === ROLE_CAMERA && CAPTURE_SURFACES.has(String(settings.displaySurface || ""))) {
    const err = new Error("Refusing to publish a display capture as the camera");
    err.code = "CAMERA_DISPLAY_REFUSED";
    throw err;
  }
  if ((role === ROLE_SCREEN || role === ROLE_SCREEN_AUDIO) && tagged === ROLE_MIC) {
    const err = new Error("Refusing to publish the microphone as screen-share audio");
    err.code = "SCREEN_SHARE_MIC_REFUSED";
    throw err;
  }
  return true;
}

/** Tag a display stream and refuse it when the video track is actually a camera. */
export function guardDisplayCapture(stream) {
  const video = stream?.getVideoTracks?.().find((track) => track && track.readyState !== "ended");
  if (!video) {
    const err = new Error("Screen capture produced no video track.");
    err.name = "NotFoundError";
    err.code = "SCREEN_SHARE_TRACK_MISSING";
    throw err;
  }
  tagLocalTrack(video, ROLE_SCREEN);
  try {
    assertPublishRole(video, ROLE_SCREEN);
  } catch (err) {
    try {
      stream.getTracks().forEach((track) => track.stop());
    } catch {
      /* ignore */
    }
    if (!err.code) err.code = "SCREEN_SHARE_CAMERA_REFUSED";
    throw err;
  }
  for (const audio of stream.getAudioTracks?.() || []) {
    tagLocalTrack(audio, ROLE_SCREEN_AUDIO);
  }
  return stream;
}

export function liveKitScreenVideoPublishOptions() {
  return {
    source: LIVEKIT_SOURCE.screen,
    name: TRACK_NAME.screen,
    simulcast: false,
  };
}

export function liveKitScreenAudioPublishOptions() {
  return {
    source: LIVEKIT_SOURCE.screenAudio,
    name: TRACK_NAME.screenAudio,
    dtx: false,
    red: false,
    forceStereo: true,
    audioPreset: { maxBitrate: 128_000 },
  };
}

export function liveKitCameraPublishOptions() {
  return {
    source: LIVEKIT_SOURCE.camera,
    name: TRACK_NAME.camera,
  };
}

/** Screen-share audio stays on its own gain. Deafening silences both. */
export function playbackGains({ micVolume = 1, screenVolume = 1, deafened = false } = {}) {
  const clamp = (value) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return 1;
    return Math.max(0, Math.min(1, n));
  };
  if (deafened) return { mic: 0, screen: 0 };
  return { mic: clamp(micVolume), screen: clamp(screenVolume) };
}

export function describeRtcTrackEvent(event) {
  const track = event?.track || null;
  const raw = event?.streams?.[0] || null;
  let displaySurface = null;
  try {
    displaySurface = track?.getSettings?.().displaySurface || null;
  } catch {
    displaySurface = null;
  }
  return {
    track,
    kind: track?.kind || null,
    streamId: raw?.id || null,
    mid: event?.transceiver?.mid || null,
    displaySurface,
    label: track?.label || "",
    rawStream: raw,
  };
}

export function addDedicatedSender(pc, track, stream) {
  if (!pc || !track) return null;
  if (typeof pc.addTransceiver === "function") {
    try {
      const init = { direction: "sendonly" };
      if (stream) init.streams = [stream];
      const transceiver = pc.addTransceiver(track, init);
      if (transceiver?.sender) return transceiver.sender;
    } catch {
      /* older Safari rejects the streams init member */
    }
    try {
      const transceiver = pc.addTransceiver(track, { direction: "sendonly" });
      if (transceiver?.sender) return transceiver.sender;
    } catch {
      /* fall through to addTrack */
    }
  }
  return pc.addTrack(track, stream);
}

export function stopDedicatedSender(pc, sender) {
  if (!sender) return;
  const transceiver = pc?.getTransceivers?.().find((item) => item.sender === sender);
  if (transceiver && transceiver.stopped !== true && typeof transceiver.stop === "function") {
    try {
      transceiver.stop();
      return;
    } catch {
      /* fall through */
    }
  }
  try {
    pc?.removeTrack?.(sender);
  } catch {
    /* already removed */
  }
}

/** Track ids the adaptive voice tuner must leave alone (system/tab audio). */
export function collectScreenAudioTrackIds(inbound, announcement) {
  const ids = new Set();
  for (const entry of inbound || []) {
    const track = entry?.track;
    if (!track || track.kind !== "audio" || track.readyState === "ended") continue;
    const role = classifyInboundMedia({
      kind: "audio",
      source: entry.source,
      trackName: entry.trackName,
      streamId: entry.streamId,
      mid: entry.mid,
      displaySurface: entry.displaySurface,
      label: entry.label || track.label,
      announcement,
      localRole: entry.localRole || readLocalRole(track),
    });
    if (role === ROLE_SCREEN_AUDIO) ids.add(track.id);
  }
  return ids;
}

export function senderMid(pc, sender) {
  if (!pc || !sender) return null;
  const transceiver = pc.getTransceivers?.().find((item) => item.sender === sender);
  return transceiver?.mid || null;
}

export function announcementFromSenders(pc, stream, videoSender, audioSender) {
  return sanitizeScreenAnnouncement({
    streamId: stream?.id || null,
    videoMid: senderMid(pc, videoSender),
    audioMid: senderMid(pc, audioSender),
  });
}

export function layoutInboundEntries(entries, announcement) {
  const layout = { screen: null, screenAudio: null, camera: null, mic: null };
  for (const entry of entries || []) {
    if (!entry || entry.ended) continue;
    const role = classifyInboundMedia({
      kind: entry.kind,
      source: entry.source,
      trackName: entry.trackName,
      streamId: entry.streamId,
      mid: entry.mid,
      displaySurface: entry.displaySurface,
      label: entry.label,
      announcement,
      localRole: entry.localRole,
    });
    if (role === ROLE_SCREEN) layout.screen = entry.id ?? layout.screen;
    else if (role === ROLE_SCREEN_AUDIO) layout.screenAudio = entry.id ?? layout.screenAudio;
    else if (role === ROLE_CAMERA) layout.camera = entry.id ?? layout.camera;
    else if (role === ROLE_MIC) layout.mic = entry.id ?? layout.mic;
  }
  return layout;
}

export function partitionInbound(entries, announcement) {
  const screen = [];
  const main = [];
  for (const entry of entries || []) {
    const track = entry?.track;
    if (!track || track.readyState === "ended") continue;
    const role = classifyInboundMedia({
      kind: entry.kind || track.kind,
      source: entry.source,
      trackName: entry.trackName,
      streamId: entry.streamId,
      mid: entry.mid,
      displaySurface: entry.displaySurface,
      label: entry.label || track.label,
      announcement,
      localRole: readLocalRole(track),
    });
    if (isScreenRole(role)) screen.push(track);
    else main.push(track);
  }
  return { screen, main };
}

export function dropScreenEntries(entries, announcement) {
  return (entries || []).filter((entry) => {
    const track = entry?.track;
    if (track && track.readyState === "ended") return false;
    if (entry?.ended) return false;
    const role = classifyInboundMedia({
      kind: entry.kind || track?.kind,
      source: entry.source,
      trackName: entry.trackName,
      streamId: entry.streamId,
      mid: entry.mid,
      displaySurface: entry.displaySurface,
      label: entry.label || track?.label,
      announcement,
      localRole: entry.localRole || readLocalRole(track),
    });
    return !isScreenRole(role);
  });
}
