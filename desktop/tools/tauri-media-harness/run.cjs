// Tauri-origin media harness (calls and screen share), Linux + Chromium, no network:
// the real frontend media modules (noise suppression, devices, screen share, wake lock) and
// the Tauri shims (electron-api-shim.js, native-screen-share.js) at https://tauri.localhost
// with the tauri.conf.json CSP, Chromium fake devices, and a fake WebView2 + Tauri bridge that
// feeds the native lane from a JS mirror of the ring (descall-capture ring.rs v2).
//
//   node desktop/tools/tauri-media-harness/build.mjs          (bundles into $OUT)
//   node desktop/tools/tauri-media-harness/run.cjs native     (lane L1: shared buffer present)
//   node desktop/tools/tauri-media-harness/run.cjs nowebview  (no shared buffers: one picker, L4)
// Needs Playwright, openssl and port 443 on 127.0.0.1 (AudioWorklet module fetches bypass
// page.route, so a real HTTPS server answers for tauri.localhost). OUT defaults to /dev/shm.
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { chromium } = (() => { try { return require("playwright"); } catch { return require("/opt/node-tools/node_modules/playwright"); } })();

const WT = path.join(__dirname, "..", "..", "..");
const OUT = process.env.OUT || "/dev/shm/descall-media-harness";
if (!fs.existsSync(path.join(OUT, "cert.pem"))) {
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", path.join(OUT, "key.pem"), "-out", path.join(OUT, "cert.pem"),
    "-days", "2", "-subj", "/CN=tauri.localhost", "-addext", "subjectAltName=DNS:tauri.localhost"], { stdio: "ignore" });
}
const conf = JSON.parse(fs.readFileSync(process.env.CONF || path.join(WT, "desktop/app/src-tauri/tauri.conf.json"), "utf8"));
const CSP = Object.entries(conf.app.security.csp).map(([k, v]) => `${k} ${v}`).join("; ");
const shim = (f) => fs.readFileSync(path.join(WT, "desktop/app/shim", f), "utf8");

const MODE = process.argv[2] || "native"; // native | nowebview

const fakeTauri = `(() => {
  const MODE = ${JSON.stringify(MODE)};
  const calls = []; window.__calls = calls;
  const thumb = (c) => { const cv = document.createElement('canvas'); cv.width = 32; cv.height = 18; const x = cv.getContext('2d'); x.fillStyle = c; x.fillRect(0,0,32,18); return cv.toDataURL('image/png'); };
  let tick = 0;
  const sources = () => [
    { id: 'screen:0:0', name: 'Screen 1', thumbnailDataURL: thumb('#335') },
    { id: 'window:42:0', name: 'Game', thumbnailDataURL: thumb('#533'), appIconDataURL: null },
  ];
  // JS mirror of ring.rs (layout v2), as in desktop/tools/native-share-shim-test.
  function makeRing(maxW, maxH, vSlots = 3, aSlots = 64) {
    const align = (v) => (v + 63) & ~63;
    const vSlotBytes = align(64 + (maxW * maxH * 3) / 2), aSlotBytes = align(32 + 960 * 2 * 4);
    const vOff = 256, aOff = vOff + vSlots * vSlotBytes, total = aOff + aSlots * aSlotBytes;
    const buf = new ArrayBuffer(total), dv = new DataView(buf), u8 = new Uint8Array(buf);
    const p32 = (o, v) => dv.setUint32(o, v, true), p64 = (o, v) => dv.setBigUint64(o, BigInt(v), true);
    p32(0, 0x31435344); p32(4, 2); p32(8, vSlots); p32(12, vSlotBytes); p32(16, aSlots); p32(20, aSlotBytes);
    p32(24, vOff); p32(28, aOff); p32(56, 1); p32(60, 48000); p32(64, 2); p32(68, 1);
    let vSeq = 0, aSeq = 0;
    return { buf,
      video(w, h, fill, ts) { const seq = ++vSeq, slot = vOff + (seq % vSlots) * vSlotBytes, len = (w * h * 3) / 2;
        p64(slot, seq); u8.fill(fill, slot + 64, slot + 64 + len); p64(slot + 16, ts); p32(slot + 24, w); p32(slot + 28, h); p32(slot + 32, w); p32(slot + 36, w * h); p32(slot + 40, len);
        p64(slot + 8, seq); p64(32, seq); return seq; },
      audio(value, ts, frames = 480) { const seq = ++aSeq, slot = aOff + (seq % aSlots) * aSlotBytes;
        p64(slot, seq); new Float32Array(buf, slot + 32, frames * 2).fill(value); p64(slot + 16, ts); p32(slot + 24, frames); p32(slot + 28, 0); p64(slot + 8, seq); p64(40, seq); return seq; },
      end() { p32(68, 2); } };
  }
  const wv = new EventTarget();
  wv.releaseBuffer = () => {};
  const send = (data) => { const e = new Event('message'); e.data = data; wv.dispatchEvent(e); };
  window.__share = null;
  async function invoke(cmd, args) {
    calls.push([cmd, JSON.parse(JSON.stringify(args ?? null))]);
    if (cmd === 'screen_sources') return sources();
    if (cmd === 'screen_thumbnails') { tick++; return (args.ids || []).map((id) => ({ id, alive: id !== 'window:42:0' || tick < 3, thumbnailDataURL: thumb(tick % 2 ? '#2a5' : '#52a') })); }
    if (cmd === 'screen_share_start') {
      const r = args.req, w = Math.min(r.width || 1920, 2560), h = Math.min(r.height || 1080, 1440);
      const ring = makeRing(w, h);
      const id = 7;
      setTimeout(() => { const e = new Event('sharedbufferreceived'); e.additionalData = { descallShare: id }; e.getBuffer = () => ring.buf; wv.dispatchEvent(e); }, 5);
      let ts = 0;
      const timer = setInterval(() => { ts += 16667; const s = ring.video(w, h, 128, ts); send('descall-share:' + id + ':v:' + s); ring.audio(0.1, ts); send('descall-share:' + id + ':a:0'); }, 16);
      window.__share = { id, ring, end: (reason) => { clearInterval(timer); ring.end(); send('descall-share:' + id + ':end:' + reason); } , stop: () => clearInterval(timer) };
      return { id, bytes: ring.buf.byteLength, width: w, height: h, fps: Math.min(r.fps || 30, 60), displaySurface: r.sourceId.startsWith('window') ? 'window' : 'monitor', hdr: false, cursor: true, audio: Boolean(r.audio) && !window.__noLoopback, audioError: window.__noLoopback ? 'loopback unavailable' : null, echoRisk: false, lane: 'L1' };
    }
    if (cmd === 'screen_share_stop') { if (window.__share) window.__share.stop(); return null; }
    if (cmd === 'screen_share_stats') return { blackStreak: 0 };
    return null;
  }
  Object.defineProperty(window, '__TAURI_INTERNALS__', { value: { invoke, transformCallback: () => 1, metadata: { currentWebview: { label: 'main' } }, plugins: {} } });
  window.__TAURI__ = { core: { invoke }, event: { listen: async () => () => {}, emit: async () => {} } };
  if (MODE === 'native') window.chrome = Object.assign(window.chrome || {}, { webview: wv });
  window.__DESCALL_BOOT__ = { version: '4.1.0', platform: 'win32' };
  window.__csp = [];
  document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI));
})();`;

const HTML = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>h</title></head><body><script src="./assets/h.js"></script></body></html>`;

(async () => {
  const srv = await require("./serve.cjs")({ root: OUT, html: HTML, csp: CSP, certDir: OUT });
  const browser = await chromium.launch({
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--auto-select-desktop-capture-source=Entire screen",
      "--host-resolver-rules=MAP tauri.localhost 127.0.0.1, MAP * ~NOTFOUND", "--autoplay-policy=no-user-gesture-required"],
  });
  const ctx = await browser.newContext({ deviceScaleFactor: 1, viewport: { width: 1100, height: 700 }, ignoreHTTPSErrors: true });
  await ctx.route("**/*", async (route) => {
    const u = new URL(route.request().url());
    if (u.hostname !== "tauri.localhost") return route.abort();
    if (u.pathname === "/" || u.pathname.endsWith(".html")) return route.fulfill({ status: 200, contentType: "text/html", headers: { "Content-Security-Policy": CSP }, body: HTML });
    const f = path.join(OUT, u.pathname);
    if (!fs.existsSync(f)) return route.fulfill({ status: 404, body: "nf" });
    const type = f.endsWith(".wasm") ? "application/wasm" : "text/javascript";
    return route.fulfill({ status: 200, contentType: type, body: fs.readFileSync(f) });
  });
  const page = await ctx.newPage();
  const logs = [];
  page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
  await page.addInitScript(fakeTauri);
  await page.addInitScript(shim("electron-api-shim.js"));
  await page.addInitScript(shim("native-screen-share.js"));
  await page.goto("https://tauri.localhost/");
  await page.waitForFunction(() => window.__h);
  const r = {};
  const step = async (name, fn, arg) => { try { r[name] = await page.evaluate(fn, arg); } catch (e) { r[name] = { error: String(e.message || e).split("\n")[0] }; } };

  await step("shim", () => ({ electron: Boolean(window.electronAPI?.isElectron), native: Boolean(window.__descallNativeShare), supported: window.__descallNativeShare?.supported, tauriClass: document.documentElement.classList.contains("tauri-app") }));
  if (process.argv[3] === "shim-only") { console.log(JSON.stringify(r, null, 1)); await browser.close(); return; }

  await step("mic", async () => {
    const s = await window.__h.ns.acquireVoiceMicStream();
    await new Promise((res) => setTimeout(res, 1500));
    const d = window.__h.ns.getNoiseSuppressionDiagnostics();
    const t = s.getAudioTracks()[0];
    return { tracks: s.getAudioTracks().length, ready: t?.readyState, engine: d.engine || window.__h.ns.getNoiseSuppressionEngine(), fallback: d.fallback ?? d.lastFallbackReason ?? null, diag: d };
  });
  await step("devices", async () => {
    const list = await navigator.mediaDevices.enumerateDevices();
    return { count: list.length, kinds: [...new Set(list.map((d) => d.kind))], labeled: list.filter((d) => d.label).length, ondevicechange: "ondevicechange" in navigator.mediaDevices };
  });
  await step("sink", async () => {
    const res = await window.__h.dev.setOutputSink("default").then((x) => x ?? "ok", (e) => "err:" + e.message);
    return { res, ctxSetSink: typeof AudioContext.prototype.setSinkId, elSetSink: typeof HTMLMediaElement.prototype.setSinkId };
  });
  await step("camera", async () => {
    const s = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 } });
    const st = s.getVideoTracks()[0].getSettings();
    s.getTracks().forEach((t) => t.stop());
    return { w: st.width, h: st.height };
  });
  // Screen share through the real webrtcScreenShare flow and the real glass picker.
  await step("share1440", async () => {
    const p = window.__h.ss.captureScreenShareStream({ width: 2560, height: 1440, fps: 60 });
    await new Promise((res) => setTimeout(res, 400));
    const tiles = document.querySelectorAll(".electron-screen-picker-item");
    const before = [...document.querySelectorAll(".electron-screen-picker-item img")].map((i) => i.src.slice(-24));
    await new Promise((res) => setTimeout(res, 2600));
    const after = [...document.querySelectorAll(".electron-screen-picker-item img")].map((i) => i.src.slice(-24));
    const fadedWindows = [...document.querySelectorAll(".electron-screen-picker-tab")].map((b) => b.textContent);
    tiles[0]?.click();
    const stream = await p;
    await new Promise((res) => setTimeout(res, 300));
    const v = stream.getVideoTracks()[0];
    const a = stream.getAudioTracks()[0];
    window.__shareStream = stream;
    const start = window.__calls.find((c) => c[0] === "screen_share_start");
    return { tiles: tiles.length, liveThumbs: before.join() !== after.join(), thumbCalls: window.__calls.filter((c) => c[0] === "screen_thumbnails").length, tabs: fadedWindows,
      req: start && start[1].req, v: v && { ready: v.readyState, s: v.getSettings() }, a: a && { ready: a.readyState, restrictOwnAudio: a.getSettings().restrictOwnAudio }, lane: window.__descallNativeShare.lane };
  });
  await step("frames", async () => {
    const v = window.__shareStream?.getVideoTracks()[0];
    if (!v) return null;
    const el = document.createElement("video"); el.muted = true; el.srcObject = new MediaStream([v]); document.body.appendChild(el);
    await el.play().catch(() => {});
    await new Promise((res) => setTimeout(res, 800));
    const q = el.getVideoPlaybackQuality ? el.getVideoPlaybackQuality() : {};
    return { w: el.videoWidth, h: el.videoHeight, frames: q.totalVideoFrames };
  });
  await step("windowClosed", async () => {
    const s = window.__shareStream;
    const v = s.getVideoTracks()[0];
    let ended = 0; v.addEventListener("ended", () => { ended += 1; });
    let onended = 0; v.onended = () => { onended += 1; };
    window.__share.end("source-closed");
    await new Promise((res) => setTimeout(res, 50));
    return { ready: v.readyState, ended, onended, all: s.getTracks().map((t) => t.readyState), stopCalls: window.__calls.filter((c) => c[0] === "screen_share_stop").length };
  });
  await step("stopFromPage", async () => {
    const s = await window.__h.ss.captureScreenShareStream({ width: 1920, height: 1080, fps: 60, pickSource: async (list) => list.find((x) => x.id.startsWith("window")).id });
    const v = s.getVideoTracks()[0];
    const st = v.getSettings();
    const before = window.__calls.filter((c) => c[0] === "screen_share_stop").length;
    s.getTracks().forEach((t) => t.stop());
    await new Promise((r) => setTimeout(r, 50));
    return { surface: st.displaySurface, w: st.width, fps: st.frameRate, stopCalls: window.__calls.filter((c) => c[0] === "screen_share_stop").length - before, lane: window.__descallNativeShare.lane };
  });
  // Round 2: no process loopback on this PC (L2) on a German page: video-only share and the
  // notice in German (the shim's notices were Turkish or English only).
  await step("videoOnlyNoticeDe", async () => {
    document.documentElement.lang = "de";
    window.__noLoopback = true;
    const s = await window.__h.ss.captureScreenShareStream({ width: 1920, height: 1080, fps: 30, pickSource: async (list) => list[0].id });
    await new Promise((r) => setTimeout(r, 100));
    const note = [...document.querySelectorAll('[role="status"]')].map((n) => n.textContent).find((t) => /Systemton/.test(t)) || null;
    const res = { audioTracks: s.getAudioTracks().length, videoTracks: s.getVideoTracks().length, lane: window.__descallNativeShare.lane, note };
    s.getTracks().forEach((t) => t.stop());
    window.__noLoopback = false;
    document.documentElement.lang = "tr";
    return res;
  });
  await step("wakeLock", async () => {
    window.__h.wl.acquireCallWakeLock({ title: "t", skipNative: true });
    await new Promise((res) => setTimeout(res, 300));
    window.__h.wl.releaseCallWakeLock();
    return { api: "wakeLock" in navigator };
  });
  await step("autoplay", async () => {
    const ctx = new AudioContext();
    await new Promise((res) => setTimeout(res, 100));
    const st = ctx.state; ctx.close();
    return { audioContext: st };
  });
  await step("ipcCsp", async () => {
    const before = window.__csp.length;
    const res = await fetch("https://ipc.localhost/app_version", { method: "POST" }).then(() => "sent", (e) => "rejected");
    await new Promise((r) => setTimeout(r, 50));
    return { res, cspBlocked: window.__csp.slice(before) };
  });
  r.csp = await page.evaluate(() => window.__csp);
  r.calls = await page.evaluate(() => window.__calls.map((c) => c[0]).filter((c, i, a) => a.indexOf(c) === i));
  console.log(JSON.stringify(r, null, 1));
  console.log(logs.filter((l) => !/\[debug\]/.test(l)).slice(0, 40).join("\n"));
  await browser.close();
  srv.close();
})().catch((e) => { console.error(e); process.exit(1); });
