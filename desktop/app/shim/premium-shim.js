/*
 * window.descallPremium on Tauri 2: the Descall+ bridge, same API as frontend/electron/preload.cjs
 * (invoke / on, 'premium:*' channels only), so frontend/src stays unchanged.
 * Injected by the premium plugin (src-tauri/src/premium/mod.rs, js_init_script) into the main
 * frame of app windows; electron-api-shim.js may also concatenate it (it is idempotent).
 *
 * What the Electron IPC did implicitly and Tauri IPC (JSON) does not:
 *  - ArrayBuffer arguments (instant_clip save-file) travel as raw bodies (premium_blob_put)
 *    and are passed on as { __blob } handles;
 *  - ArrayBuffers in events (quick_file_drop files) arrive as { __blob } handles and are fetched
 *    back (premium_blob_take) before the listener runs;
 *  - window.open('about:blank', 'descall-premium-<kind>') carries the kind in the URL fragment,
 *    because WebView2 does not report the window name to the shell;
 *  - getUserMedia with a desktop chromeMediaSource (instant_clip) goes to the native capture lane.
 */
(() => {
  "use strict";
  if (window.top !== window || window.__descallPremiumShim) return;
  // Plugin init scripts run BEFORE the withGlobalTauri bundle (tauri manager/webview.rs: core
  // init, plugin init scripts, then plugin_global_api_scripts), so window.__TAURI__ does not
  // exist yet here. Reading it at load time made this shim return early on every start: no
  // descallPremium, and Settings > Descall+ showed every desktop feature as "Masaustu / Kilitli"
  // (owner report, desktop-v4.0.1). __TAURI_INTERNALS__ (invoke, transformCallback) is already
  // there; __TAURI__ is read per call, once all init scripts have run.
  const internals = () => window.__TAURI_INTERNALS__ || null;
  const tauri = () => window.__TAURI__ || null;
  const I0 = internals();
  if (!I0 && !tauri()) return; // not a Tauri page
  if (location.hostname === "descallhud.localhost") return; // HUD pages have descallHud instead
  // Admin windows never had descallPremium (adminPreload.cjs), nor do the shell's own pages
  // (capsules, overlay). The label is known before any page script runs.
  const meta = window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.metadata;
  const label = String((meta && meta.currentWebview && meta.currentWebview.label) || "");
  // The tray panel ("tray-menu") has its own three-call bridge (tray-menu-shim.js).
  if (label === "admin" || label === "signup-stats" || label === "tray-menu" || location.hostname === "descall-shell.localhost") return;
  Object.defineProperty(window, "__descallPremiumShim", { value: true });

  function invoke(cmd, args) {
    const T = tauri();
    if (T && T.core && typeof T.core.invoke === "function") return T.core.invoke(cmd, args);
    const I = internals();
    if (I && typeof I.invoke === "function") return I.invoke(cmd, args);
    return Promise.reject(new Error("tauri ipc unavailable"));
  }

  /** event.listen as @tauri-apps/api does it, for a call before the global bundle exists. */
  function listen(event, handler) {
    const T = tauri();
    if (T && T.event && typeof T.event.listen === "function") return T.event.listen(event, handler);
    const I = internals();
    if (!I || typeof I.transformCallback !== "function") return Promise.reject(new Error("tauri events unavailable"));
    return I.invoke("plugin:event|listen", { event, target: { kind: "Any" }, handler: I.transformCallback(handler) }).then((eventId) => () => {
      const reg = window.__TAURI_EVENT_PLUGIN_INTERNALS__;
      if (reg && typeof reg.unregisterListener === "function") reg.unregisterListener(event, eventId);
      return I.invoke("plugin:event|unlisten", { event, eventId }).catch(() => {});
    });
  }
  const isPremiumChannel = (c) => typeof c === "string" && /^premium:[a-z0-9:_-]{1,64}$/i.test(c);

  const isBytes = (v) => v instanceof ArrayBuffer || ArrayBuffer.isView(v);
  const toBuffer = (v) => (v instanceof ArrayBuffer ? v : v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength));
  async function packArgs(args) {
    const out = [];
    for (const a of args) {
      if (isBytes(a)) out.push(await invoke("premium_blob_put", toBuffer(a)));
      else out.push(a === undefined ? null : a);
    }
    return out;
  }

  const isBlob = (v) => v && typeof v === "object" && typeof v.__blob === "number";
  async function unpack(v, depth = 0) {
    if (depth > 4 || !v || typeof v !== "object") return v;
    if (isBlob(v)) {
      const r = await invoke("premium_blob_take", { id: v.__blob });
      return r instanceof ArrayBuffer ? r : new Uint8Array(r || []).buffer;
    }
    if (Array.isArray(v)) return Promise.all(v.map((x) => unpack(x, depth + 1)));
    const o = {};
    for (const [k, x] of Object.entries(v)) o[k] = await unpack(x, depth + 1);
    return o;
  }

  function nativeSources() {
    const api = window.electronAPI;
    const list = api && typeof api.getScreenSources === "function" ? api.getScreenSources() : Promise.resolve([]);
    return Promise.resolve(list).then((arr) => (Array.isArray(arr) ? arr : []).slice(0, 40).map((s) => ({
      id: String(s.id || ""),
      name: String(s.name || "").slice(0, 80),
      kind: String(s.id || "").startsWith("screen:") ? "screen" : "window",
      thumb: s.thumbnailDataURL || s.thumbnail || s.thumbnailDataUrl || s.thumbnail_data_url || "",
    }))).catch(() => []);
  }

  // ---- ordering and late starts ----------------------------------------------------------------
  // Electron handled IPC in order and started a feature inside premium:settings:set, so a call
  // right after "switch on" found it running. Here every premium_invoke runs on its own thread
  // and the host starts features on its bus thread, so (1) calls wait for a settings:set still in
  // flight, (2) a "locked" answer just after a settings:set is retried briefly, and (3) the
  // renderer's state pushes (hotkeys, tray mirrors) that arrive before the shell's own
  // membership check has passed are kept and sent again once their feature runs. Without (3) the
  // command center / workspace profile / clip hotkeys and the focus / audio profile tray entries
  // stayed unregistered until the user changed a setting (the check takes a network round trip,
  // the renderer pushes as soon as its own copy of the plan arrives).
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const isLocked = (r) => Boolean(r && typeof r === "object" && r.ok === false && r.error === "locked");
  const FEATURE_OF = { hotkeys: "custom_hotkeys", launcher: "quick_launcher" };
  const featureOf = (channel) => {
    const m = /^premium:([a-z0-9_]+):/.exec(channel);
    return m ? FEATURE_OF[m[1]] || m[1] : "";
  };
  // Idempotent "here is the current state" pushes: the latest call wins.
  const REPLAY = new Set([
    "premium:command_center:hotkey",
    "premium:workspace_profiles:bind",
    "premium:focus_mode:state",
    "premium:audio_device_profiles:mirror",
    "premium:instant_clip:hotkey",
    "premium:multi_account:labels",
    "premium:quick_file_drop:state",
  ]);
  const latest = new Map(); // channel -> packed args of the newest call
  const pending = new Set(); // channels whose newest call was answered "locked"
  let pendingSet = Promise.resolve();
  let lastSetAt = 0;
  let pollTimer = 0;
  let pollUntil = 0;
  let pollDelay = 0;

  async function poll() {
    pollTimer = 0;
    if (!pending.size) return;
    let running = [];
    try {
      const s = await invoke("premium_invoke", { channel: "premium:status", args: [] });
      running = s && Array.isArray(s.running) ? s.running : [];
    } catch (_) { /* host not ready yet */ }
    for (const channel of [...pending]) {
      if (!running.includes(featureOf(channel))) continue;
      const args = latest.get(channel);
      try {
        const r = await invoke("premium_invoke", { channel, args });
        if (!isLocked(r) && latest.get(channel) === args) pending.delete(channel);
      } catch (_) { pending.delete(channel); }
    }
    schedulePoll(false);
  }

  /** Poll premium:status while something waits: 1 s, slowing to 10 s, for at most 3 minutes. */
  function schedulePoll(restart) {
    if (!pending.size) return;
    const now = Date.now();
    if (restart || !pollUntil) { pollUntil = now + 180000; pollDelay = 1000; }
    if (now > pollUntil) { pollUntil = 0; return; }
    if (pollTimer && !restart) return;
    if (pollTimer) clearTimeout(pollTimer);
    const wait = pollDelay;
    pollDelay = Math.min(10000, Math.round(pollDelay * 1.5));
    pollTimer = setTimeout(poll, wait);
  }

  async function send(channel, packed) {
    let r = await invoke("premium_invoke", { channel, args: packed });
    if (REPLAY.has(channel)) {
      if (latest.get(channel) === packed) {
        if (isLocked(r)) { pending.add(channel); schedulePoll(false); } else pending.delete(channel);
      }
      return r;
    }
    // A feature switched on a moment ago may still be starting on the host's bus thread.
    for (let i = 0; i < 6 && isLocked(r) && channel !== "premium:settings:set" && Date.now() - lastSetAt < 2000; i += 1) {
      await sleep(150);
      r = await invoke("premium_invoke", { channel, args: packed });
    }
    return r;
  }

  async function premiumInvoke(channel, ...args) {
    if (!isPremiumChannel(channel)) throw new Error("premium channel expected");
    if (channel === "premium:app-state" && args[0] && typeof args[0] === "object") {
      args[0] = { ...args[0], __lang: document.documentElement.lang || navigator.language || "" };
    }
    const packed = await packArgs(args);
    if (REPLAY.has(channel)) latest.set(channel, packed);
    let r;
    if (channel === "premium:settings:set") {
      // In order, like Electron; later calls wait for it.
      const run = pendingSet.catch(() => {}).then(() => invoke("premium_invoke", { channel, args: packed }));
      pendingSet = run.then(() => { lastSetAt = Date.now(); }, () => { lastSetAt = Date.now(); });
      r = await run;
      if (r && r.ok && packed[1] && packed[1].enabled === true) schedulePoll(true);
    } else {
      await pendingSet.catch(() => {});
      r = await send(channel, packed);
    }
    if (channel === "premium:instant_clip:sources" && r && r.ok && r.delegate) {
      const { delegate, ...rest } = r;
      return { ...rest, sources: await nativeSources() };
    }
    return r;
  }

  function premiumOn(channel, fn) {
    if (!isPremiumChannel(channel) || typeof fn !== "function") return () => {};
    let un = null;
    let dead = false;
    listen(channel, (e) => {
      unpack(e.payload).then((p) => {
        try { fn(...(Array.isArray(p) ? p : [p])); } catch (err) { console.error(err); }
      }).catch((err) => console.error("[premium]", err));
    }).then((u) => { if (dead) u(); else un = u; }).catch((err) => console.error("[premium]", err));
    return () => { dead = true; if (un) un(); };
  }

  if (!window.descallPremium) {
    try {
      Object.defineProperty(window, "descallPremium", {
        value: Object.freeze({ invoke: premiumInvoke, on: premiumOn }),
        writable: false,
        configurable: false,
      });
    } catch (_) { /* already defined by the main shim */ }
  }

  // Portal windows: keep the target name, add it as the fragment the shell reads.
  const origOpen = window.open;
  window.open = function open(url, target, features) {
    if (typeof target === "string" && target.startsWith("descall-premium-") && (url === "about:blank" || url === "" || url == null)) {
      return origOpen.call(window, `about:blank#${target}`, target, features);
    }
    return origOpen.call(window, url, target, features);
  };

  // instant_clip native recorder (premium/clip.rs): hardware H.264 + game audio (never the
  // call) in a native fragmented-MP4 ring. Same interface as the page's WebCodecs ClipRecorder
  // and muxClip (frontend/src/premium/gaming/instantClip.js), which pick it when present and
  // keep their own recorder as the fallback.
  class NativeClipRecorder {
    constructor(opts = {}) {
      this.opts = opts;
      this.fps = Number(opts.fps) || 30;
      this.windowSec = Number(opts.windowSec) === 60 ? 60 : 30;
      this.height = Number(opts.height) || 720;
      this.fallback = null;
      this.cached = { running: false, native: true, lengthMs: 0 };
      this.timer = 0;
    }

    async start() {
      const r = await premiumInvoke("premium:instant_clip:native-start", {
        sourceId: String(this.opts.sourceId || ""), windowSec: this.windowSec, height: this.height, fps: this.fps, audio: true,
      }).catch(() => null);
      if (r && r.ok) {
        this.cached = r.info || this.cached;
        this.timer = setInterval(() => this.poll(), 1000);
        return this.info();
      }
      const Fallback = this.opts.fallback;
      if (typeof Fallback !== "function") throw new Error((r && r.error) || "start");
      console.warn("[instant clip] native recorder unavailable, using WebCodecs:", r && r.error);
      this.fallback = new Fallback(this.opts);
      return this.fallback.start();
    }

    poll() {
      premiumInvoke("premium:instant_clip:native-info").then((r) => {
        const info = r && r.info;
        if (!info) return;
        this.cached = info;
        if (!info.running && this.timer) {
          clearInterval(this.timer);
          this.timer = 0;
          if (this.opts.onError) this.opts.onError(new Error(info.error || "stopped"));
        }
      }).catch(() => {});
    }

    info() {
      if (this.fallback) return this.fallback.info();
      const i = this.cached || {};
      return {
        running: Boolean(i.running), codec: "avc", hardware: Boolean(i.hardware), width: i.width || 0, height: i.height || 0,
        fps: this.fps, windowSec: this.windowSec, bufferedSec: i.bufferedSec || 0, bytes: i.bytes || 0, maxBytes: i.maxBytes || 0,
        frames: i.frames || 0, dropped: i.dropped || 0, native: true, audio: Boolean(i.audio),
      };
    }

    /** Synchronous like the WebCodecs recorder: the timeline comes from the last poll and is
     *  replaced in place by the frozen native snapshot a moment later. */
    snapshot() {
      if (this.fallback) return this.fallback.snapshot();
      const lengthMs = Math.round((this.cached.bufferedSec || 0) * 1000);
      const chunks = [];
      for (let t = 0; t < lengthMs; t += 1000) chunks.push({ key: true, ts: t * 1000, dur: Math.min(1000, lengthMs - t) * 1000, bytes: 0 });
      const snap = {
        chunks, decoderConfig: { native: true }, fps: this.fps, bytes: this.cached.bytes || 0, lengthMs, at: Date.now(),
        codec: { id: "avc", mime: "video/mp4", ext: "mp4", native: true },
      };
      snap.ready = premiumInvoke("premium:instant_clip:native-snapshot").then((r) => {
        if (!r || !r.ok) throw new Error((r && r.error) || "empty");
        snap.chunks.splice(0, snap.chunks.length, ...r.chunks);
        snap.lengthMs = r.lengthMs;
        snap.bytes = r.bytes;
        return r.id;
      });
      snap.ready.catch(() => {});
      return snap;
    }

    stop() {
      if (this.timer) clearInterval(this.timer);
      this.timer = 0;
      if (this.fallback) { this.fallback.stop(); return; }
      premiumInvoke("premium:instant_clip:native-stop").catch(() => {});
    }
  }

  async function nativeMuxClip(snap, from, to) {
    const id = await snap.ready;
    const r = await premiumInvoke("premium:instant_clip:native-export", id, Number(from) || 0, Number(to) || 0);
    if (!r || !r.ok) throw new Error((r && r.error) || "export");
    const bytes = await unpack(r.data);
    return new Blob([bytes], { type: r.mime || "video/mp4" });
  }

  if (window.descallPremium && !window.__descallNativeClip) {
    Object.defineProperty(window, "__descallNativeClip", {
      value: Object.freeze({ supported: true, ClipRecorder: NativeClipRecorder, muxClip: nativeMuxClip }),
    });
  }

  // instant_clip fallback: desktop-source getUserMedia (Electron chromeMediaSource) -> native lane.
  const md = navigator.mediaDevices;
  if (md && typeof md.getUserMedia === "function") {
    const origGum = md.getUserMedia.bind(md);
    md.getUserMedia = async function getUserMedia(constraints) {
      const m = constraints && constraints.video && constraints.video.mandatory;
      if (m && m.chromeMediaSource === "desktop" && window.__descallNativeShare && m.chromeMediaSourceId) {
        await window.__descallNativeShare.select(String(m.chromeMediaSourceId));
        return md.getDisplayMedia({
          video: { width: { max: m.maxWidth }, height: { max: m.maxHeight }, frameRate: { ideal: m.maxFrameRate, max: m.maxFrameRate } },
          audio: false,
        });
      }
      return origGum(constraints);
    };
  }
})();
