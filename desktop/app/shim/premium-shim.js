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
  const T = window.__TAURI__;
  if (!T || !T.core || !T.event) return;
  if (location.hostname === "descallhud.localhost") return; // HUD pages have descallHud instead
  Object.defineProperty(window, "__descallPremiumShim", { value: true });

  const invoke = (cmd, args) => T.core.invoke(cmd, args);
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
      thumb: s.thumbnail || s.thumbnailDataUrl || s.thumbnail_data_url || "",
    }))).catch(() => []);
  }

  async function premiumInvoke(channel, ...args) {
    if (!isPremiumChannel(channel)) throw new Error("premium channel expected");
    if (channel === "premium:app-state" && args[0] && typeof args[0] === "object") {
      args[0] = { ...args[0], __lang: document.documentElement.lang || navigator.language || "" };
    }
    const r = await invoke("premium_invoke", { channel, args: await packArgs(args) });
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
    T.event.listen(channel, (e) => {
      unpack(e.payload).then((p) => {
        try { fn(...(Array.isArray(p) ? p : [p])); } catch (err) { console.error(err); }
      }).catch((err) => console.error("[premium]", err));
    }).then((u) => { if (dead) u(); else un = u; });
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

  // instant_clip: desktop-source getUserMedia (Electron chromeMediaSource) -> native lane.
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
