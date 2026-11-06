/**
 * Instant clip recorder (Ultra, desktop). Runs only while the user has it turned on.
 *
 *  capture:  getUserMedia with the chosen desktopCapturer source (screen or window), video
 *            only, scaled to 720p30 by default
 *  encode:   WebCodecs VideoEncoder, hardware preferred (H.264 when available, VP8 fallback),
 *            a forced keyframe every second
 *  buffer:   encoded chunks in RAM, pruned to the window (30 / 60 s) and a byte cap
 *            (clipRing.js); a frame is dropped instead of queueing when the encoder lags
 *  save:     the chosen range is muxed to MP4 (H.264) or WebM (VP8) with mediabunny, loaded
 *            lazily on the first save; no re-encode
 *
 * No audio on purpose: on Windows the only system audio source is the whole output mix,
 * which includes the voice call, and Descall does not record calls. Separating game audio
 * from call audio needs a native per-app capture module.
 */
import { bitrateFor, keyframeEvery, memoryCapBytes, pruneCount, selectRange, totalBytes, timelineLength, DEFAULTS } from "./clipRing.js";

const CODECS = [
  { id: "avc", codec: "avc1.42001f", mime: "video/mp4", ext: "mp4", extra: { avc: { format: "avc" } } },
  { id: "avc", codec: "avc1.640028", mime: "video/mp4", ext: "mp4", extra: { avc: { format: "avc" } } },
  { id: "vp8", codec: "vp8", mime: "video/webm", ext: "webm", extra: {} },
];

export function clipSupported() {
  return typeof window !== "undefined" && typeof window.VideoEncoder === "function" && typeof window.MediaStreamTrackProcessor === "function";
}

const even = (n) => Math.max(2, Math.floor(n / 2) * 2);

async function pickCodec(width, height, fps) {
  for (const hw of ["prefer-hardware", "no-preference"]) {
    for (const c of CODECS) {
      const config = { codec: c.codec, width, height, framerate: fps, bitrate: bitrateFor(height, fps), bitrateMode: "variable", latencyMode: "realtime", hardwareAcceleration: hw, ...c.extra };
      try {
        const r = await window.VideoEncoder.isConfigSupported(config);
        if (r?.supported) return { ...c, config: r.config || config, hardware: hw === "prefer-hardware" };
      } catch { /* try the next one */ }
    }
  }
  return null;
}

export class ClipRecorder {
  constructor({ sourceId, windowSec = DEFAULTS.windowSec, height = DEFAULTS.height, fps = DEFAULTS.fps, onError } = {}) {
    this.sourceId = sourceId;
    this.windowSec = windowSec;
    this.height = height;
    this.fps = fps;
    this.onError = onError;
    this.chunks = [];
    this.bytes = 0;
    this.frames = 0;
    this.dropped = 0;
    this.decoderConfig = null;
    this.running = false;
    this.maxBytes = memoryCapBytes({ windowSec, height, fps });
    this.startedAt = 0;
  }

  async start() {
    if (this.running) return this.info();
    if (!clipSupported()) throw new Error("unsupported");
    const maxH = this.height;
    const maxW = Math.round((maxH * 16) / 9);
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { mandatory: { chromeMediaSource: "desktop", chromeMediaSourceId: this.sourceId, maxWidth: maxW, maxHeight: maxH, maxFrameRate: this.fps } },
    });
    const track = this.stream.getVideoTracks()[0];
    const s = track.getSettings ? track.getSettings() : {};
    // Scale down to the target height, keep the aspect ratio, even sizes for the encoder.
    const scale = s.height && s.height > maxH ? maxH / s.height : 1;
    this.width = even((s.width || maxW) * scale);
    this.heightPx = even((s.height || maxH) * scale);
    this.codec = await pickCodec(this.width, this.heightPx, this.fps);
    if (!this.codec) {
      track.stop();
      throw new Error("no_codec");
    }
    this.every = keyframeEvery(this.fps, DEFAULTS.keyframeSec);
    this.encoder = new window.VideoEncoder({
      output: (chunk, meta) => this.onChunk(chunk, meta),
      error: (e) => { this.onError?.(e); this.stop(); },
    });
    this.encoder.configure(this.codec.config);
    this.track = track;
    this.reader = new window.MediaStreamTrackProcessor({ track }).readable.getReader();
    this.running = true;
    this.startedAt = Date.now();
    this.loop();
    return this.info();
  }

  async loop() {
    const frameUs = 1e6 / this.fps;
    let lastTs = -Infinity;
    while (this.running) {
      let r;
      try { r = await this.reader.read(); } catch { break; }
      if (r.done || !r.value) break;
      const frame = r.value;
      // Capture can deliver more frames than the target rate; keep to fps. Drop when the
      // encoder is behind, so a slow machine loses frames, not memory.
      if (frame.timestamp - lastTs < frameUs * 0.75 || this.encoder.encodeQueueSize > 3) {
        if (frame.timestamp - lastTs >= frameUs * 0.75) this.dropped += 1;
        frame.close();
        continue;
      }
      lastTs = frame.timestamp;
      let input = frame;
      if (frame.displayHeight !== this.heightPx || frame.displayWidth !== this.width) {
        try {
          input = new window.VideoFrame(frame, { displayWidth: this.width, displayHeight: this.heightPx, timestamp: frame.timestamp });
        } catch { input = frame; }
      }
      try {
        this.encoder.encode(input, { keyFrame: this.frames % this.every === 0 });
        this.frames += 1;
      } catch { this.dropped += 1; }
      if (input !== frame) input.close();
      frame.close();
    }
    this.running = false;
  }

  onChunk(chunk, meta) {
    if (meta?.decoderConfig) this.decoderConfig = { ...meta.decoderConfig };
    const data = new Uint8Array(chunk.byteLength);
    chunk.copyTo(data);
    this.chunks.push({ key: chunk.type === "key", ts: chunk.timestamp, dur: chunk.duration || Math.round(1e6 / this.fps), bytes: data.byteLength, data });
    this.bytes += data.byteLength;
    // Prune at most once a second (on keyframes): the window or the byte cap.
    if (chunk.type === "key" || this.bytes > this.maxBytes) {
      const drop = pruneCount(this.chunks, { windowSec: this.windowSec, maxBytes: this.maxBytes });
      if (drop > 0) {
        for (let i = 0; i < drop; i += 1) this.bytes -= this.chunks[i].bytes;
        this.chunks.splice(0, drop);
      }
    }
  }

  info() {
    return {
      running: this.running,
      codec: this.codec?.id || null,
      hardware: Boolean(this.codec?.hardware),
      width: this.width || 0,
      height: this.heightPx || 0,
      fps: this.fps,
      windowSec: this.windowSec,
      bufferedSec: Math.round(timelineLength(this.chunks) / 100) / 10,
      bytes: this.bytes,
      maxBytes: this.maxBytes,
      frames: this.frames,
      dropped: this.dropped,
    };
  }

  /** Freeze what is buffered now. The live ring keeps going. */
  snapshot() {
    const chunks = this.chunks.slice();
    return { chunks, decoderConfig: this.decoderConfig, codec: this.codec, fps: this.fps, bytes: totalBytes(chunks), lengthMs: timelineLength(chunks), at: Date.now() };
  }

  stop() {
    this.running = false;
    try { this.reader?.cancel(); } catch { /* ignore */ }
    try { this.track?.stop(); } catch { /* ignore */ }
    try { if (this.encoder && this.encoder.state !== "closed") this.encoder.close(); } catch { /* ignore */ }
    this.stream?.getTracks().forEach((t) => { try { t.stop(); } catch { /* ignore */ } });
    this.chunks = [];
    this.bytes = 0;
  }
}

/** Mux [from, to] (ms from the snapshot start) into a playable file. No re-encode. */
export async function muxClip(snap, from, to) {
  if (!snap?.chunks?.length || !snap.decoderConfig) throw new Error("empty");
  const mb = await import("mediabunny");
  const { start, end } = selectRange(snap.chunks, from, to);
  const isAvc = snap.codec?.id === "avc";
  const output = new mb.Output({
    format: isAvc ? new mb.Mp4OutputFormat({ fastStart: "in-memory" }) : new mb.WebMOutputFormat(),
    target: new mb.BufferTarget(),
  });
  const source = new mb.EncodedVideoPacketSource(isAvc ? "avc" : "vp8");
  output.addVideoTrack(source, { frameRate: snap.fps });
  await output.start();
  const base = snap.chunks[start].ts;
  for (let i = start; i < end; i += 1) {
    const c = snap.chunks[i];
    const packet = new mb.EncodedPacket(c.data, c.key ? "key" : "delta", (c.ts - base) / 1e6, c.dur / 1e6);
    await source.add(packet, i === start ? { decoderConfig: snap.decoderConfig } : undefined);
  }
  await output.finalize();
  const type = snap.codec?.mime || "video/webm";
  return new Blob([output.target.buffer], { type });
}

export function clipFileName(snap) {
  const d = new Date(snap?.at || Date.now());
  const p = (n) => String(n).padStart(2, "0");
  return `descall-clip-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.${snap?.codec?.ext || "webm"}`;
}
