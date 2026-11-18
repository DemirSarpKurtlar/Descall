/*
 * Native screen-share lane, page side (Tauri on Windows).
 *
 * frontend/src/lib/webrtcScreenShare.js does, unchanged:
 *   sources = electronAPI.getScreenSources(); id = <glass picker>; electronAPI.selectDisplaySource(id);
 *   stream = navigator.mediaDevices.getDisplayMedia({ video: {width,height,frameRate}, audio: {restrictOwnAudio:true} })
 * This file makes that getDisplayMedia call return a MediaStream fed by Rust:
 *   WGC -> GPU NV12 -> WebView2 shared buffer -> VideoFrame -> MediaStreamTrackGenerator (video)
 *   WASAPI process loopback (excluding Descall's process tree) -> AudioData -> MediaStreamTrackGenerator (audio)
 * The tracks are ordinary MediaStreamTracks: RTCPeerConnection (DM mesh) and LiveKit publish
 * them exactly like a getDisplayMedia track. Without a pending native selection, or when the
 * native lane fails, the original getDisplayMedia runs (WebView2 picker, restrictOwnAudio).
 */
(() => {
  "use strict";
  if (window.top !== window) return;
  const T = window.__TAURI__;
  const md = navigator.mediaDevices;
  if (!T || !md || typeof md.getDisplayMedia !== "function") return;
  const invoke = (c, a) => T.core.invoke(c, a);
  const originalGetDisplayMedia = md.getDisplayMedia.bind(md);
  const PENDING_TTL_MS = 15000; // same as electron/displayMediaGrant.cjs
  let pending = null;
  const waiting = new Map(); // share id -> resolve(ArrayBuffer)
  const sessions = new Map(); // share id -> session

  const hasGenerator = typeof window.MediaStreamTrackGenerator === "function";

  const wv = window.chrome && window.chrome.webview;
  if (wv) {
    wv.addEventListener("sharedbufferreceived", (e) => {
      const meta = e.additionalData || {};
      const id = meta.descallShare;
      if (!id) return;
      const buf = e.getBuffer();
      const res = waiting.get(id);
      if (res) { waiting.delete(id); res(buf); }
    });
    wv.addEventListener("message", (e) => {
      const d = e.data;
      if (typeof d !== "string" || !d.startsWith("descall-share:")) return;
      const [, idStr, kind, arg] = d.split(":");
      const s = sessions.get(Number(idStr));
      if (!s) return;
      if (kind === "v") s.pumpVideo(Number(arg));
      else if (kind === "a") s.pumpAudio(Number(arg));
      else if (kind === "end") s.end(arg);
    });
  }

  class Session {
    constructor(id, buffer) {
      this.id = id;
      this.dv = new DataView(buffer);
      this.u8 = new Uint8Array(buffer);
      this.vSlots = this.dv.getUint32(8, true);
      this.vSlotBytes = this.dv.getUint32(12, true);
      this.aSlots = this.dv.getUint32(16, true);
      this.aSlotBytes = this.dv.getUint32(20, true);
      this.vOff = this.dv.getUint32(24, true);
      this.aOff = this.dv.getUint32(28, true);
      this.sampleRate = this.dv.getUint32(60, true) || 48000;
      this.channels = this.dv.getUint32(64, true) || 2;
      this.lastV = 0; this.lastA = 0; this.ended = false;
      this.video = new MediaStreamTrackGenerator({ kind: "video" });
      this.vWriter = this.video.writable.getWriter();
      this.audio = null; this.aWriter = null;
    }
    withAudio() {
      this.audio = new MediaStreamTrackGenerator({ kind: "audio" });
      this.aWriter = this.audio.writable.getWriter();
    }
    u64(off) { return Number(this.dv.getBigUint64(off, true)); }
    pumpVideo(seq) {
      if (this.ended || seq <= this.lastV) return;
      // Only the newest frame matters for video (drop the backlog = lowest latency).
      const slot = this.vOff + (seq % this.vSlots) * this.vSlotBytes;
      if (this.u64(slot) !== seq) return;
      const w = this.dv.getUint32(slot + 24, true);
      const h = this.dv.getUint32(slot + 28, true);
      const len = this.dv.getUint32(slot + 40, true);
      const ts = this.u64(slot + 16);
      let frame;
      try {
        frame = new VideoFrame(this.u8.subarray(slot + 64, slot + 64 + len), {
          format: "NV12", codedWidth: w, codedHeight: h, timestamp: ts,
          colorSpace: { primaries: "bt709", transfer: "bt709", matrix: "bt709", fullRange: false },
        }); // copies out of the shared buffer
      } catch (_) { return; }
      if (this.u64(slot + 8) !== seq) { frame.close(); return; } // overwritten while copying
      this.lastV = seq;
      if (this.vWriter.desiredSize !== null && this.vWriter.desiredSize <= 0) { frame.close(); return; } // encoder busy: drop
      this.vWriter.write(frame).catch(() => frame.close());
    }
    pumpAudio(seq) {
      if (this.ended || !this.aWriter) return;
      let from = Math.max(this.lastA + 1, seq - this.aSlots + 2);
      for (let s = from; s <= seq; s += 1) {
        const slot = this.aOff + (s % this.aSlots) * this.aSlotBytes;
        if (this.u64(slot) !== s) continue;
        const frames = this.dv.getUint32(slot + 24, true);
        const ts = this.u64(slot + 16);
        const bytes = frames * this.channels * 4;
        const data = this.u8.slice(slot + 32, slot + 32 + bytes); // copy
        if (this.u64(slot + 8) !== s) continue;
        const ad = new AudioData({ format: "f32", sampleRate: this.sampleRate, numberOfFrames: frames, numberOfChannels: this.channels, timestamp: ts, data });
        this.aWriter.write(ad).catch(() => ad.close());
      }
      this.lastA = seq;
    }
    end(reason) {
      if (this.ended) return;
      this.ended = true;
      sessions.delete(this.id);
      try { this.vWriter.close(); } catch (_) {}
      try { this.aWriter && this.aWriter.close(); } catch (_) {}
      if (reason !== "stopped") invoke("screen_share_stop").catch(() => {});
    }
  }

  async function startNative(sourceId, constraints) {
    const v = (constraints && constraints.video) || {};
    const pick = (c) => (c && typeof c === "object" ? c.ideal || c.max || c.exact : c);
    const wantsAudio = constraints && constraints.audio !== false && constraints.audio !== undefined;
    const req = {
      sourceId,
      width: Number(pick(v.width)) || 1920,
      height: Number(pick(v.height)) || 1080,
      fps: Number(pick(v.frameRate)) || 30,
      cursor: v.cursor !== "never",
      audio: Boolean(wantsAudio),
    };
    const info = await invoke("screen_share_start", { req });
    const buffer = await new Promise((resolve, reject) => {
      waiting.set(info.id, resolve);
      setTimeout(() => { if (waiting.delete(info.id)) reject(new Error("shared buffer timeout")); }, 3000);
    });
    const s = new Session(info.id, buffer);
    if (info.audio) s.withAudio();
    sessions.set(info.id, s);
    const tracks = [s.video, ...(s.audio ? [s.audio] : [])];
    const kindOf = sourceId.startsWith("window:") ? "window" : "monitor";
    for (const t of tracks) {
      const origStop = t.stop.bind(t);
      t.stop = () => { s.end("stopped"); invoke("screen_share_stop").catch(() => {}); origStop(); };
    }
    const vs = s.video.getSettings.bind(s.video);
    s.video.getSettings = () => ({ ...vs(), displaySurface: kindOf, frameRate: req.fps, width: req.width, height: req.height });
    s.video.applyConstraints = async (c) => { const fps = Number(pick(c && c.frameRate)); if (fps) await invoke("screen_share_update", { fps }); };
    s.video.contentHint = "motion";
    if (s.audio) s.audio.contentHint = "music";
    if (info.audioError) console.warn("[ScreenShare] system audio unavailable:", info.audioError);
    return new MediaStream(tracks);
  }

  window.__descallNativeShare = {
    supported: hasGenerator && Boolean(wv),
    getSources: () => invoke("screen_sources").catch(() => []),
    select: (id) => {
      if (typeof id !== "string" || !/^(screen|window):[\w:.-]+$/.test(id)) return Promise.resolve(false);
      pending = { id, at: Date.now() };
      return Promise.resolve(true);
    },
  };

  md.getDisplayMedia = async function getDisplayMedia(constraints) {
    const p = pending; pending = null;
    if (p && Date.now() - p.at <= PENDING_TTL_MS && window.__descallNativeShare.supported) {
      try {
        return await startNative(p.id, constraints);
      } catch (err) {
        console.warn("[ScreenShare] native lane failed, falling back to WebView2 getDisplayMedia:", err);
      }
    }
    return originalGetDisplayMedia(constraints);
  };
})();
