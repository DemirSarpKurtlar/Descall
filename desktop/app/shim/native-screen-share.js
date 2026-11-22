/*
 * Descall native screen share, page side (Tauri on Windows).
 *
 * frontend/src/lib/webrtcScreenShare.js does, unchanged:
 *   sources = electronAPI.getScreenSources(); id = <glass picker>; electronAPI.selectDisplaySource(id);
 *   stream = navigator.mediaDevices.getDisplayMedia({ video: {width,height,frameRate}, audio: {restrictOwnAudio:true} })
 * The main shim maps getScreenSources / selectDisplaySource to window.__descallNativeShare
 * (getSources / select). This file makes that getDisplayMedia call return a MediaStream fed
 * by Rust (desktop/crates/descall-capture):
 *   WGC -> GPU NV12 -> WebView2 shared buffer (ring) -> VideoFrame -> track
 *   WASAPI process loopback excluding Descall's process tree -> AudioData -> track
 *
 * Fallback chain (each lane is announced with a "descall-screenshare-lane" window event):
 *   L1  native video + native audio, MediaStreamTrackGenerator
 *   L2  native video only (loopback unavailable), small notice to the user
 *   L3  native frames without MediaStreamTrackGenerator: VideoTrackGenerator in a worker,
 *       else canvas.captureStream; audio through an AudioWorklet (else ScriptProcessor)
 *   L4  WebView2's own getDisplayMedia, with audio ONLY if restrictOwnAudio is supported and
 *       actually applied; otherwise the audio track is dropped. Whole-system loopback that
 *       includes Descall (the 3.7.33 echo) is never returned on any lane.
 *
 * Ring layout and reading rules: desktop/crates/descall-capture/src/ring.rs (version 2).
 * Command contract: desktop/crates/descall-capture/src/bridge.rs.
 */
(() => {
  "use strict";

  /* ------------------------------------------------------------------ ring reader (pure) */

  const RING_MAGIC = 0x31435344; // "DSC1" little endian
  const RING_VERSION = 2;
  const OFF = {
    MAGIC: 0, VERSION: 4, VIDEO_SLOTS: 8, VIDEO_SLOT_BYTES: 12, AUDIO_SLOTS: 16, AUDIO_SLOT_BYTES: 20,
    VIDEO_OFFSET: 24, AUDIO_OFFSET: 28, LATEST_VIDEO: 32, LATEST_AUDIO: 40, WIDTH: 48, HEIGHT: 52,
    FORMAT: 56, SAMPLE_RATE: 60, CHANNELS: 64, STATE: 68, FLAGS: 72, MAX_WIDTH: 76, MAX_HEIGHT: 80,
    REJECTED: 88, TOTAL: 96,
    V_SEQ_BEGIN: 0, V_SEQ_END: 8, V_TS: 16, V_W: 24, V_H: 28, V_Y_STRIDE: 32, V_UV_OFFSET: 36,
    V_LEN: 40, V_FLAGS: 44, V_ARRIVAL: 48, V_WRITTEN: 56,
    A_SEQ_BEGIN: 0, A_SEQ_END: 8, A_TS: 16, A_FRAMES: 24, A_FLAGS: 28,
  };
  const VIDEO_SLOT_HEADER = 64;
  const AUDIO_SLOT_HEADER = 32;
  const STATE_ENDED = 2;
  const FLAG_AUDIO = 1;
  const FLAG_HDR = 2;

  class RingReader {
    constructor(buffer) {
      this.dv = new DataView(buffer);
      this.u8 = new Uint8Array(buffer);
      if (buffer.byteLength < 256 || this.u32(OFF.MAGIC) !== RING_MAGIC || this.u32(OFF.VERSION) !== RING_VERSION) {
        throw new Error("descall ring: bad header");
      }
      this.vSlots = this.u32(OFF.VIDEO_SLOTS);
      this.vSlotBytes = this.u32(OFF.VIDEO_SLOT_BYTES);
      this.aSlots = this.u32(OFF.AUDIO_SLOTS);
      this.aSlotBytes = this.u32(OFF.AUDIO_SLOT_BYTES);
      this.vOff = this.u32(OFF.VIDEO_OFFSET);
      this.aOff = this.u32(OFF.AUDIO_OFFSET);
      this.sampleRate = this.u32(OFF.SAMPLE_RATE) || 48000;
      this.channels = this.u32(OFF.CHANNELS) || 2;
    }
    u32(o) { return this.dv.getUint32(o, true); }
    u64(o) { return Number(this.dv.getBigUint64(o, true)); }
    state() { return this.u32(OFF.STATE); }
    flags() { return this.u32(OFF.FLAGS); }
    latestVideo() { return this.u64(OFF.LATEST_VIDEO); }
    latestAudio() { return this.u64(OFF.LATEST_AUDIO); }

    /**
     * Seqlock read of video frame `seq`. `make(view, meta)` must copy the bytes (the
     * VideoFrame constructor does) and return the copy; `drop(copy)` discards a torn one.
     * Returns the copy, or null when the slot does not hold `seq` intact.
     */
    readVideo(seq, make, drop) {
      if (!(seq > 0) || !this.vSlots) return null;
      const slot = this.vOff + (seq % this.vSlots) * this.vSlotBytes;
      if (this.u64(slot + OFF.V_SEQ_END) !== seq) return null; // not (or no longer) complete
      const len = this.u32(slot + OFF.V_LEN);
      if (VIDEO_SLOT_HEADER + len > this.vSlotBytes) return null;
      const meta = {
        seq,
        width: this.u32(slot + OFF.V_W),
        height: this.u32(slot + OFF.V_H),
        timestamp: this.u64(slot + OFF.V_TS),
        arrival: this.u64(slot + OFF.V_ARRIVAL),
        written: this.u64(slot + OFF.V_WRITTEN),
      };
      const p = slot + VIDEO_SLOT_HEADER;
      const copy = make(this.u8.subarray(p, p + len), meta);
      if (this.u64(slot + OFF.V_SEQ_BEGIN) !== seq) { // overwritten while copying
        if (drop) drop(copy);
        return null;
      }
      return copy;
    }

    /** Unread audio packets after `last`, oldest first: { packets: [{seq, frames, timestamp, flags, samples}], last }. */
    readAudioSince(last) {
      const latest = this.latestAudio();
      const packets = [];
      if (!this.aSlots || latest <= last) return { packets, last };
      const from = Math.max(last + 1, latest - (this.aSlots - 2));
      for (let s = from; s <= latest; s += 1) {
        const slot = this.aOff + (s % this.aSlots) * this.aSlotBytes;
        if (this.u64(slot + OFF.A_SEQ_END) !== s) continue;
        const frames = this.u32(slot + OFF.A_FRAMES);
        const bytes = frames * this.channels * 4;
        if (AUDIO_SLOT_HEADER + bytes > this.aSlotBytes) continue;
        const p = slot + AUDIO_SLOT_HEADER;
        const samples = new Float32Array(this.u8.slice(p, p + bytes).buffer); // copy
        const pkt = { seq: s, frames, timestamp: this.u64(slot + OFF.A_TS), flags: this.u32(slot + OFF.A_FLAGS), samples };
        if (this.u64(slot + OFF.A_SEQ_BEGIN) === s) packets.push(pkt);
      }
      return { packets, last: latest };
    }
  }

  /** getDisplayMedia constraints -> screen_share_start request (bridge::StartRequest). */
  function buildRequest(sourceId, constraints) {
    const v = (constraints && typeof constraints.video === "object" && constraints.video) || {};
    const pick = (c) => (c && typeof c === "object" ? c.ideal ?? c.max ?? c.exact ?? c.min : c);
    const num = (x) => (Number.isFinite(Number(x)) && Number(x) > 0 ? Math.round(Number(x)) : undefined);
    const a = constraints ? constraints.audio : undefined;
    return {
      sourceId,
      width: num(pick(v.width)),
      height: num(pick(v.height)),
      fps: num(pick(v.frameRate)),
      contentHint: typeof v.contentHint === "string" ? v.contentHint : undefined,
      cursor: v.cursor !== "never",
      audio: Boolean(a) && a !== false,
    };
  }

  /** Which lane the page can run, from feature flags. */
  function pickLane({ nativeOk, hasMstg, wantsAudio, audioOk }) {
    if (!nativeOk) return "L4";
    if (!hasMstg) return "L3";
    return wantsAudio && audioOk ? "L1" : "L2";
  }

  /** "descall-share:<id>:<kind>:<arg>" -> { id, kind, arg } or null. */
  function parseWake(d) {
    if (typeof d !== "string" || !d.startsWith("descall-share:")) return null;
    const parts = d.split(":");
    if (parts.length < 4) return null;
    const id = Number(parts[1]);
    if (!Number.isInteger(id)) return null;
    return { id, kind: parts[2], arg: parts.slice(3).join(":") };
  }

  /* Notices in the app's 7 languages (were Turkish or English only). */
  const NOTICES = {
    black: {
      tr: "Paylaşılan görüntü siyah. Oyunu pencereli tam ekran (borderless) yapın ya da ekranın tamamını paylaşın.",
      en: "The shared picture is black. Switch the game to borderless windowed, or share the whole screen.",
      de: "Das geteilte Bild ist schwarz. Stelle das Spiel auf randloses Fenster (Borderless) oder teile den ganzen Bildschirm.",
      es: "La imagen compartida está en negro. Pon el juego en ventana sin bordes (borderless) o comparte la pantalla completa.",
      fr: "L'image partagée est noire. Passez le jeu en fenêtré sans bordure (borderless) ou partagez l'écran entier.",
      "pt-BR": "A imagem compartilhada está preta. Coloque o jogo em janela sem bordas (borderless) ou compartilhe a tela inteira.",
      ru: "Транслируемое изображение чёрное. Переключите игру в оконный режим без рамки (borderless) или покажите весь экран.",
    },
    noAudio: {
      tr: "Sistem sesi bu bilgisayarda paylaşılamıyor; yalnızca görüntü paylaşılıyor.",
      en: "System audio cannot be shared on this PC; sharing video only.",
      de: "Der Systemton kann auf diesem PC nicht geteilt werden; nur das Bild wird geteilt.",
      es: "El audio del sistema no se puede compartir en este PC; solo se comparte la imagen.",
      fr: "Le son du système ne peut pas être partagé sur ce PC ; seule l'image est partagée.",
      "pt-BR": "O áudio do sistema não pode ser compartilhado neste PC; só a imagem está sendo compartilhada.",
      ru: "Системный звук нельзя транслировать на этом компьютере; транслируется только изображение.",
    },
    echoOff: {
      tr: "Sistem sesi yankı yapmaması için kapatıldı; yalnızca görüntü paylaşılıyor.",
      en: "System audio was turned off to prevent echo; sharing video only.",
      de: "Der Systemton wurde abgeschaltet, um Echo zu vermeiden; nur das Bild wird geteilt.",
      es: "Se desactivó el audio del sistema para evitar eco; solo se comparte la imagen.",
      fr: "Le son du système a été coupé pour éviter l'écho ; seule l'image est partagée.",
      "pt-BR": "O áudio do sistema foi desligado para evitar eco; só a imagem está sendo compartilhada.",
      ru: "Системный звук отключён, чтобы не было эха; транслируется только изображение.",
    },
  };
  /** Notice text for a page language ("pt", "pt-BR", "de-AT" ...), English otherwise. */
  function noticeText(key, lang) {
    const set = NOTICES[key];
    if (!set) return "";
    const l = String(lang || "").toLowerCase();
    const id = l.startsWith("pt") ? "pt-BR" : l.slice(0, 2);
    return set[id] || set.en;
  }

  const internals = { RingReader, buildRequest, pickLane, parseWake, noticeText, NOTICES, OFF, RING_MAGIC, RING_VERSION, FLAG_AUDIO, FLAG_HDR };
  try { globalThis.__descallNativeShareInternals = internals; } catch (_) { /* ignore */ }
  if (typeof module === "object" && module && module.exports) module.exports = internals;

  /* ------------------------------------------------------------------ runtime wiring */

  if (typeof window === "undefined" || window.top !== window) return;
  const T = window.__TAURI__;
  const md = navigator.mediaDevices;
  if (!T || !T.core || !md || typeof md.getDisplayMedia !== "function") return;
  const invoke = (c, a) => T.core.invoke(c, a);
  const originalGetDisplayMedia = md.getDisplayMedia.bind(md);
  const PENDING_TTL_MS = 15000; // same as electron/displayMediaGrant.cjs
  const wv = window.chrome && window.chrome.webview;
  const hasMstg = typeof window.MediaStreamTrackGenerator === "function";
  const hasVideoFrame = typeof window.VideoFrame === "function";
  let pending = null;
  const waiting = new Map(); // share id -> { resolve, reject }
  const early = new Map(); // share id -> ArrayBuffer that arrived before invoke() returned
  const sessions = new Map(); // share id -> Session

  function isMainWebview() {
    try {
      const m = window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.metadata;
      const label = m && m.currentWebview && m.currentWebview.label;
      return !label || label === "main";
    } catch (_) { return true; }
  }
  const pageLang = () => document.documentElement.lang || navigator.language || "";
  function announce(lane, extra) {
    api.lane = lane;
    try { window.dispatchEvent(new CustomEvent("descall-screenshare-lane", { detail: { lane, ...extra } })); } catch (_) { /* ignore */ }
  }

  /* Small notice (opaque dark glass, #587af5 accent), e.g. "video only". */
  function notice(key) {
    try {
      const el = document.createElement("div");
      el.setAttribute("role", "status");
      el.textContent = noticeText(key, pageLang());
      Object.assign(el.style, {
        position: "fixed", left: "50%", bottom: "28px", transform: "translateX(-50%)", zIndex: "2147483646",
        maxWidth: "min(560px, 90vw)", padding: "10px 16px 10px 30px", borderRadius: "12px",
        background: "rgba(16,18,28,0.96)", border: "1px solid rgba(88,122,245,0.55)", color: "#e8eaf6",
        font: "500 13px/1.4 system-ui, -apple-system, Segoe UI, sans-serif", boxShadow: "0 12px 32px rgba(0,0,0,0.5)",
        backdropFilter: "blur(18px)", pointerEvents: "none", opacity: "0", transition: "opacity .2s ease",
      });
      const dot = document.createElement("span");
      Object.assign(dot.style, { position: "absolute", left: "13px", top: "50%", width: "8px", height: "8px", marginTop: "-4px", borderRadius: "50%", background: "#587af5" });
      el.appendChild(dot);
      document.body.appendChild(el);
      requestAnimationFrame(() => { el.style.opacity = "1"; });
      setTimeout(() => { el.style.opacity = "0"; setTimeout(() => el.remove(), 250); }, 6500);
    } catch (_) { /* ignore */ }
  }

  if (wv) {
    wv.addEventListener("sharedbufferreceived", (e) => {
      const meta = e.additionalData || {};
      const id = meta.descallShare;
      if (!id) return;
      const buf = e.getBuffer();
      const w = waiting.get(id);
      if (w) { waiting.delete(id); w.resolve(buf); } else { early.set(id, buf); }
    });
    wv.addEventListener("message", (e) => {
      const m = parseWake(e.data);
      if (!m) return;
      const s = sessions.get(m.id);
      if (!s) return;
      if (m.kind === "v") s.pumpVideo(Number(m.arg));
      else if (m.kind === "a") s.pumpAudio();
      else if (m.kind === "end") s.end(m.arg, true);
    });
  }

  /* ---- video sinks: MSTG (L1/L2), VideoTrackGenerator in a worker or canvas (L3) */

  function mstgVideoSink() {
    const track = new MediaStreamTrackGenerator({ kind: "video" });
    const writer = track.writable.getWriter();
    return {
      track,
      write(frame) {
        if (writer.desiredSize !== null && writer.desiredSize <= 0) { frame.close(); return; } // encoder busy: drop, newest wins
        writer.write(frame).catch(() => frame.close());
      },
      close() { try { writer.close(); } catch (_) { /* ignore */ } },
    };
  }

  async function workerVideoSink() {
    const src = "let w=null;onmessage=(e)=>{if(e.data==='init'){const g=new VideoTrackGenerator();w=g.writable.getWriter();postMessage({track:g.track},[g.track]);}else if(e.data&&e.data.frame){if(w&&w.desiredSize>0){w.write(e.data.frame).catch(()=>e.data.frame.close());}else{e.data.frame.close();}}else if(e.data==='close'){try{w&&w.close();}catch(_){}close();}};";
    const url = URL.createObjectURL(new Blob([src], { type: "text/javascript" }));
    const worker = new Worker(url);
    URL.revokeObjectURL(url);
    const track = await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("VideoTrackGenerator unavailable")), 800);
      worker.onmessage = (e) => { clearTimeout(t); resolve(e.data.track); };
      worker.onerror = () => { clearTimeout(t); reject(new Error("worker failed")); };
      worker.postMessage("init");
    }).catch((err) => { worker.terminate(); throw err; });
    return {
      track,
      write(frame) { worker.postMessage({ frame }, [frame]); },
      close() { worker.postMessage("close"); },
    };
  }

  function canvasVideoSink(fps) {
    const canvas = document.createElement("canvas");
    canvas.width = 2; canvas.height = 2;
    const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
    const stream = canvas.captureStream(0);
    const track = stream.getVideoTracks()[0];
    void fps;
    return {
      track,
      write(frame) {
        try {
          if (canvas.width !== frame.displayWidth || canvas.height !== frame.displayHeight) {
            canvas.width = frame.displayWidth; canvas.height = frame.displayHeight;
          }
          ctx.drawImage(frame, 0, 0);
          if (typeof track.requestFrame === "function") track.requestFrame();
        } finally { frame.close(); }
      },
      close() { /* the track is stopped by the session */ },
    };
  }

  /* ---- audio sinks: MSTG (L1), AudioWorklet / ScriptProcessor (L3) */

  function mstgAudioSink() {
    const track = new MediaStreamTrackGenerator({ kind: "audio" });
    const writer = track.writable.getWriter();
    return {
      track,
      write(p, sampleRate, channels) {
        const ad = new AudioData({ format: "f32", sampleRate, numberOfFrames: p.frames, numberOfChannels: channels, timestamp: p.timestamp, data: p.samples });
        writer.write(ad).catch(() => ad.close());
      },
      close() { try { writer.close(); } catch (_) { /* ignore */ } },
    };
  }

  async function graphAudioSink(sampleRate, channels) {
    const ctx = new AudioContext({ sampleRate, latencyHint: "interactive" });
    const dest = ctx.createMediaStreamDestination();
    dest.channelCount = channels;
    let push;
    try {
      const src = "class P extends AudioWorkletProcessor{constructor(){super();this.q=[];this.o=0;this.port.onmessage=(e)=>{this.q.push(e.data);if(this.q.length>40)this.q.splice(0,this.q.length-20);};}process(_i,outs){const out=outs[0];const ch=out.length;const n=out[0].length;for(let i=0;i<n;i++){if(!this.q.length){for(let c=0;c<ch;c++)out[c][i]=0;continue;}const b=this.q[0];for(let c=0;c<ch;c++)out[c][i]=b[this.o*CH+Math.min(c,CH-1)];this.o++;if(this.o*CH>=b.length){this.q.shift();this.o=0;}}return true;}}registerProcessor('descall-share-audio',P);"
        .replace(/CH/g, String(channels));
      const url = URL.createObjectURL(new Blob([src], { type: "text/javascript" }));
      await ctx.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);
      const node = new AudioWorkletNode(ctx, "descall-share-audio", { numberOfInputs: 0, outputChannelCount: [channels] });
      node.connect(dest);
      push = (samples) => node.port.postMessage(samples, [samples.buffer]);
    } catch (_) {
      // CSP without blob: modules: ScriptProcessorNode (deprecated, still everywhere).
      const q = [];
      let o = 0;
      const sp = ctx.createScriptProcessor(1024, 0, channels);
      sp.onaudioprocess = (e) => {
        const outs = []; for (let c = 0; c < channels; c += 1) outs.push(e.outputBuffer.getChannelData(c));
        for (let i = 0; i < outs[0].length; i += 1) {
          if (!q.length) { for (const out of outs) out[i] = 0; continue; }
          const b = q[0];
          for (let c = 0; c < channels; c += 1) outs[c][i] = b[o * channels + c];
          o += 1;
          if (o * channels >= b.length) { q.shift(); o = 0; }
        }
      };
      sp.connect(dest);
      push = (samples) => { q.push(samples); if (q.length > 40) q.splice(0, q.length - 20); };
    }
    return {
      track: dest.stream.getAudioTracks()[0],
      write(p) { push(p.samples); },
      close() { ctx.close().catch(() => {}); },
    };
  }

  /* ---- one native share */

  class Session {
    constructor(id, buffer, info) {
      this.id = id;
      this.buffer = buffer;
      this.ring = new RingReader(buffer);
      this.info = info;
      this.lastV = 0;
      this.lastA = 0;
      this.ended = false;
      this.video = null;
      this.audio = null;
      this.hintTimer = null;
    }

    pumpVideo(seq) {
      if (this.ended || !this.video) return;
      if (this.ring.state() === STATE_ENDED) { this.end("stopped", true); return; }
      const latest = Math.max(seq || 0, this.ring.latestVideo());
      if (latest <= this.lastV) return;
      // Only the newest frame matters for video: skipping the backlog keeps latency lowest.
      const frame = this.ring.readVideo(
        latest,
        (bytes, m) => new VideoFrame(bytes, {
          format: "NV12", codedWidth: m.width, codedHeight: m.height, timestamp: m.timestamp,
          colorSpace: { primaries: "bt709", transfer: "bt709", matrix: "bt709", fullRange: false },
        }),
        (f) => f && f.close(),
      );
      if (!frame) return;
      this.lastV = latest;
      this.width = frame.codedWidth;
      this.height = frame.codedHeight;
      this.video.write(frame);
    }

    pumpAudio() {
      if (this.ended || !this.audio) return;
      const { packets, last } = this.ring.readAudioSince(this.lastA);
      this.lastA = last;
      for (const p of packets) this.audio.write(p, this.ring.sampleRate, this.ring.channels);
    }

    end(reason, fromHost) {
      if (this.ended) return;
      this.ended = true;
      sessions.delete(this.id);
      clearInterval(this.hintTimer);
      try { this.video && this.video.close(); } catch (_) { /* ignore */ }
      try { this.audio && this.audio.close(); } catch (_) { /* ignore */ }
      try { wv && typeof wv.releaseBuffer === "function" && wv.releaseBuffer(this.buffer); } catch (_) { /* ignore */ }
      // Scoped to this session: a late stop must not end the next share (quality change =
      // stop + start, and Tauri runs the two commands concurrently).
      if (!fromHost) invoke("screen_share_stop", { id: this.id }).catch(() => {});
      // Like a browser share whose surface went away: tracks end and fire "ended", so the
      // page's existing onended handlers stop the share UI (window closed, monitor removed).
      for (const t of this.tracks || []) {
        if (t.readyState === "live") {
          t.__descallStop();
          try { t.dispatchEvent(new Event("ended")); } catch (_) { /* ignore */ }
        }
      }
      announce(api.lane, { ended: reason });
    }
  }

  function decorate(s, track, req, kind) {
    const origStop = track.stop.bind(track);
    track.__descallStop = origStop;
    track.stop = () => { origStop(); if (!s.tracks.some((t) => t.readyState === "live")) s.end("stopped", false); };
    const baseSettings = track.getSettings.bind(track);
    if (kind === "video") {
      track.getSettings = () => ({
        ...baseSettings(),
        displaySurface: s.info.displaySurface,
        logicalSurface: true,
        cursor: req.cursor ? "motion" : "never",
        frameRate: s.info.fps,
        width: s.width || s.info.width,
        height: s.height || s.info.height,
        deviceId: req.sourceId,
      });
      track.getConstraints = () => ({ frameRate: s.info.fps, width: s.info.width, height: s.info.height });
      track.applyConstraints = async (c) => {
        const pick = (x) => (x && typeof x === "object" ? x.ideal ?? x.max ?? x.exact : x);
        const u = { fps: Number(pick(c && c.frameRate)) || undefined, width: Number(pick(c && c.width)) || undefined, height: Number(pick(c && c.height)) || undefined };
        if (c && c.cursor) u.cursor = c.cursor !== "never";
        if (u.fps) s.info.fps = Math.min(60, u.fps);
        await invoke("screen_share_update", { req: u }).catch(() => false);
      };
      try { track.contentHint = req.contentHint === "detail" || req.contentHint === "text" ? "detail" : "motion"; } catch (_) { /* ignore */ }
    } else {
      // Tells guards and the Descall+ stream-audio stage that this is loopback without us.
      track.getSettings = () => ({ ...baseSettings(), restrictOwnAudio: true, suppressLocalAudioPlayback: false, echoCancellation: false, channelCount: s.ring.channels, sampleRate: s.ring.sampleRate });
      try { track.contentHint = "music"; } catch (_) { /* ignore */ }
    }
  }

  async function waitBuffer(id) {
    if (early.has(id)) { const b = early.get(id); early.delete(id); return b; }
    return new Promise((resolve, reject) => {
      waiting.set(id, { resolve, reject });
      setTimeout(() => { if (waiting.delete(id)) reject(new Error("shared buffer timeout")); }, 3000);
    });
  }

  async function startNative(sourceId, constraints) {
    const req = buildRequest(sourceId, constraints);
    const info = await invoke("screen_share_start", { req });
    let s;
    try {
      const buffer = await waitBuffer(info.id);
      s = new Session(info.id, buffer, info);
      const lane = pickLane({ nativeOk: true, hasMstg, wantsAudio: req.audio, audioOk: Boolean(info.audio) });
      if (lane === "L3") {
        s.video = await workerVideoSink().catch(() => canvasVideoSink(info.fps));
        if (info.audio) s.audio = await graphAudioSink(s.ring.sampleRate, s.ring.channels).catch(() => null);
      } else {
        s.video = mstgVideoSink();
        if (lane === "L1") s.audio = mstgAudioSink();
      }
      s.tracks = [s.video.track, ...(s.audio ? [s.audio.track] : [])];
      decorate(s, s.video.track, req, "video");
      if (s.audio) decorate(s, s.audio.track, req, "audio");
      sessions.set(info.id, s);
      s.pumpVideo(0);
      // Exclusive-fullscreen games show up black with WGC: suggest the fix after ~2 s.
      let hinted = false;
      s.hintTimer = setInterval(() => {
        invoke("screen_share_stats").then((st) => {
          if (!hinted && st && st.blackStreak > 2 * (info.fps || 30)) {
            hinted = true;
            // Nothing more to learn: no stats call every 2 s for the rest of the share.
            clearInterval(s.hintTimer);
            s.hintTimer = null;
            notice("black");
          }
        }).catch(() => {});
      }, 2000);
      const audioLane = s.audio ? lane : lane === "L1" ? "L2" : lane;
      announce(audioLane, { audio: Boolean(s.audio), hdr: Boolean(info.hdr), audioError: info.audioError || null, echoRisk: Boolean(info.echoRisk) });
      if (req.audio && !s.audio) {
        notice("noAudio");
        if (info.audioError) console.warn("[ScreenShare] system audio unavailable:", info.audioError);
      }
      if (info.echoRisk) console.warn("[ScreenShare] echo guard: WebView2 audio outside the Descall process tree");
      return new MediaStream(s.tracks);
    } catch (err) {
      if (s) s.end("failed", false); else invoke("screen_share_stop", { id: info.id }).catch(() => {});
      throw err;
    }
  }

  /** L4: WebView2's own capture, never with audio that could contain the call. */
  async function webviewGetDisplayMedia(constraints) {
    const supported = (md.getSupportedConstraints && md.getSupportedConstraints()) || {};
    const c = { ...(constraints || {}) };
    if (c.audio && !supported.restrictOwnAudio) c.audio = false;
    else if (c.audio) c.audio = { ...(typeof c.audio === "object" ? c.audio : {}), restrictOwnAudio: true };
    const stream = await originalGetDisplayMedia(c);
    let dropped = false;
    for (const t of stream.getAudioTracks()) {
      const st = (t.getSettings && t.getSettings()) || {};
      if (st.restrictOwnAudio !== true) { stream.removeTrack(t); t.stop(); dropped = true; }
    }
    announce("L4", { audio: stream.getAudioTracks().length > 0 });
    if ((constraints && constraints.audio) && (dropped || !c.audio)) {
      notice("echoOff");
    }
    return stream;
  }

  const api = {
    // screen_share_start serves the main window only (commands/screen.rs). Descall+ pop-outs
    // and account windows carry this script too: there the lane is off, so the page opens
    // WebView2's picker once instead of ours and then WebView2's.
    supported: Boolean(wv) && hasVideoFrame && isMainWebview(),
    lane: null,
    async getSources() {
      const list = await invoke("screen_sources", { thumbnails: true }).catch(() => []);
      live.track(list);
      return list;
    },
    select(id) {
      if (typeof id !== "string" || !/^(screen|window):[\w:.-]+$/.test(id)) return Promise.resolve(false);
      pending = { id, at: Date.now() };
      return Promise.resolve(true);
    },
    caps: () => invoke("screen_share_caps").catch(() => null),
    stats: () => invoke("screen_share_stats").catch(() => null),
    setCursor: (on) => invoke("screen_share_update", { req: { cursor: Boolean(on) } }).catch(() => false),
    stop: () => invoke("screen_share_stop").catch(() => {}),
  };

  /*
   * Live thumbnails without touching the picker: while an <img> showing one of our
   * thumbnails is in the document, refresh those tiles about once a second and swap the
   * src in place. Stops by itself when the picker closes.
   */
  const live = {
    byUrl: new Map(), // data URL -> source id
    timer: null,
    track(list) {
      this.byUrl.clear();
      for (const s of list || []) if (s && s.thumbnailDataURL) this.byUrl.set(s.thumbnailDataURL, s.id);
      if (!this.timer && this.byUrl.size) this.timer = setTimeout(() => this.tick(), 1000);
    },
    async tick() {
      this.timer = null;
      const imgs = Array.from(document.images).filter((i) => this.byUrl.has(i.src));
      if (!imgs.length) { this.byUrl.clear(); return; }
      const ids = [...new Set(imgs.map((i) => this.byUrl.get(i.src)))];
      const fresh = await invoke("screen_thumbnails", { ids }).catch(() => []);
      const byId = new Map((fresh || []).map((t) => [t.id, t]));
      for (const img of imgs) {
        const t = byId.get(this.byUrl.get(img.src));
        if (!t) continue;
        if (!t.alive) {
          // The window closed while the picker is open: dim the tile and take it out of the
          // picker (a dead source would fail to start and drop to WebView2's own picker).
          img.style.opacity = "0.35";
          const tile = img.closest ? img.closest("button") : null;
          if (tile) { tile.disabled = true; tile.setAttribute("aria-disabled", "true"); }
          continue;
        }
        if (t.thumbnailDataURL && t.thumbnailDataURL !== img.src) {
          this.byUrl.set(t.thumbnailDataURL, t.id);
          this.byUrl.delete(img.src);
          img.src = t.thumbnailDataURL;
        }
      }
      if (document.images.length) this.timer = setTimeout(() => this.tick(), 1000);
    },
  };

  window.__descallNativeShare = api;

  md.getDisplayMedia = async function getDisplayMedia(constraints) {
    const p = pending;
    pending = null;
    if (p && Date.now() - p.at <= PENDING_TTL_MS && api.supported) {
      try {
        return await startNative(p.id, constraints);
      } catch (err) {
        console.warn("[ScreenShare] native lane failed, falling back to WebView2 getDisplayMedia:", err);
      }
    }
    return webviewGetDisplayMedia(constraints);
  };
})();
