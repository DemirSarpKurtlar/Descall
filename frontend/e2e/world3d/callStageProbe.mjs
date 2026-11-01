/**
 * Call UI + 3D world probe (measuring tool and screenshot rig, not a CI test).
 *
 * Runs the real app on the Vite dev server with the dev-only glass QA scenes
 * (src/dev/glassQaBridge.js): a group call (CallOverlay) and a server voice channel
 * (ServerVoicePanel) with synthetic camera / screen streams. All API calls are answered
 * in the page; the 3D world itself talks to e2e/world3d/worldMockServer.cjs.
 *
 * For each surface it saves screenshots of the control dock (Electron-like desktop sizes),
 * then measures for a few seconds with the plain call stage and again with the 3D world
 * open on top of it:
 *   React commits / s, <video> elements playing, video frames presented / s,
 *   elements with a backdrop-filter, main-thread script / layout / style ms per second.
 * Then it leaves the world and checks the stage comes back.
 *
 *   npx vite --port 5287 --strictPort --host 127.0.0.1
 *   node e2e/world3d/worldMockServer.cjs 4887 perf demir
 *   node e2e/world3d/callStageProbe.mjs --out=/tmp/w3d-stage --label=before [--only=group,voice] [--sizes=1440x900,1280x800]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, v] = a.replace(/^--/, "").split("=");
  return [k, v ?? true];
}));
const OUT = args.out || "/tmp/w3d-stage";
const LABEL = String(args.label || "run");
const ORIGIN = process.env.APP_ORIGIN || "http://127.0.0.1:5287";
const WORLD_URL = process.env.WORLD_SOCKET_URL || "http://127.0.0.1:4887";
const ONLY = String(args.only || "group,voice").split(",");
const SIZES = String(args.sizes || "1440x900,1280x800").split(",").map((s) => s.split("x").map(Number));
const MEASURE_MS = Number(args.ms || 6000);
mkdirSync(OUT, { recursive: true });

const iso = (minAgo) => new Date(Date.now() - minAgo * 60000).toISOString();
const user = (id, username, displayName, extra = {}) => ({
  id, username, displayName, display_name: displayName, avatarUrl: null, avatar_url: null, status: "online", is_admin: false, isAdmin: false, ...extra,
});
const ME = user("demir", "demir", "Demir", { is_admin: true, isAdmin: true, email: "demir@example.invalid", descoinBalance: 0 });
const AYSE = user("ayse", "ayse", "Ayşe");
const MERT = user("mert", "mert", "Mert");
const ZEYNEP = user("zeynep", "zeynep", "Zeynep");
const CAN = user("can", "can", "Can");
const ELIF = user("elif", "elif", "Elif");
const BURAK = user("burak", "burak", "Burak");
const GROUP = { id: "grp-aksam", name: "Hafta Sonu Ekibi", memberCount: 7, created_by: ME.id, lastMessage: "", lastActivity: iso(3), members: [ME, AYSE, MERT, ZEYNEP, CAN, ELIF, BURAK] };
const CHANNELS = [
  { id: "cat-ses", serverId: "srv-gece", name: "Ses", type: "category", position: 0, parentId: null },
  { id: "ch-genel", serverId: "srv-gece", name: "genel", type: "text", position: 1, parentId: "cat-ses" },
  { id: "c1", serverId: "srv-gece", name: "Oturma odası", type: "voice", position: 2, parentId: "cat-ses" },
];
const SERVER = {
  id: "srv-gece", name: "Gece", ownerId: ME.id, isOwner: true, memberCount: 7, notificationLevel: "all", channels: CHANNELS,
  myPermissions: { isOwner: true, flags: { ADMINISTRATOR: true } }, roles: [{ id: "role-uye", name: "Üye", color: "#8ea2ff", position: 1 }],
};
const FIXTURE = {
  me: ME,
  worldUrl: WORLD_URL,
  friends: [AYSE, MERT, ZEYNEP, CAN, ELIF, BURAK],
  group: GROUP,
  server: SERVER,
  serverMembers: [ME, AYSE, MERT, ZEYNEP, CAN, ELIF, BURAK].map((u) => ({ userId: u.id, username: u.username, displayName: u.displayName, isOwner: u.id === ME.id, user: u, roles: [] })),
  voiceChannelState: { serverId: SERVER.id, channelId: "c1", members: [AYSE, MERT, ZEYNEP].map((u) => ({ id: u.id, username: u.username, displayName: u.displayName })), memberCount: 3 },
  voiceStates: { serverId: SERVER.id, states: [{ channelId: "c1", members: [AYSE, MERT, ZEYNEP], memberCount: 3 }] },
};

// Runs in the page before any app script.
function install(fixture) {
  try {
    localStorage.setItem("descall_language", "tr");
    localStorage.setItem("descall:glass-desktop", "1");
    localStorage.setItem("descall:glass-desktop-lite", "0");
    localStorage.setItem("descall:cookie_consent_v1", JSON.stringify({ choice: "accepted", at: Date.now() }));
    localStorage.setItem("descall_user_settings", JSON.stringify({ darkMode: true }));
    localStorage.setItem("descall_token", fixture.me.id);
    localStorage.setItem("descall_user", JSON.stringify(fixture.me));
  } catch { /* ignore */ }
  // a desktop with more than 4 threads (4 or fewer switches the glass shell to its lite mode)
  Object.defineProperty(Navigator.prototype, "hardwareConcurrency", { get: () => 8 });
  window.__DESCALL_SOCKET_URL__ = fixture.worldUrl;
  // the app refuses software WebGL: report the Iris Xe string a real laptop gives
  for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
    if (!C) continue;
    const gp = C.prototype.getParameter;
    C.prototype.getParameter = function getParameter(pname) {
      if (pname === 0x9246) return "ANGLE (Intel, Intel(R) Iris(R) Xe Graphics (0x00009A49) Direct3D11 vs_5_0 ps_5_0, D3D11)";
      if (pname === 0x9245) return "Google Inc. (Intel)";
      return gp.call(this, pname);
    };
  }
  // React commit counter (DevTools hook stub)
  const P = (window.__probe = { commits: 0, videoFrames: 0 });
  const renderers = new Map();
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    renderers, supportsFiber: true, isDisabled: false,
    inject(r) { const id = renderers.size + 1; renderers.set(id, r); return id; },
    onScheduleFiberRoot() {}, onCommitFiberRoot() { P.commits += 1; }, onCommitFiberUnmount() {}, onPostCommitFiberRoot() {}, checkDCE() {},
  };
  // presented video frames, every <video> on the page
  const watched = new WeakSet();
  const watch = () => {
    for (const v of document.querySelectorAll("video")) {
      if (watched.has(v) || typeof v.requestVideoFrameCallback !== "function") continue;
      watched.add(v);
      const onFrame = () => { P.videoFrames += 1; v.requestVideoFrameCallback(onFrame); };
      v.requestVideoFrameCallback(onFrame);
    }
  };
  setInterval(watch, 250);

  const media = navigator.mediaDevices || {};
  media.enumerateDevices = async () => [
    { deviceId: "mic-1", kind: "audioinput", label: "Mikrofon" },
    { deviceId: "spk-1", kind: "audiooutput", label: "Hoparlör" },
    { deviceId: "cam-1", kind: "videoinput", label: "Kamera" },
  ];
  media.getUserMedia = async () => { const c = document.createElement("canvas"); c.width = 320; c.height = 180; return c.captureStream(8); };
  media.getDisplayMedia = media.getUserMedia;

  window.__glassQaScenes = [];
  window.__DESCALL_GLASS_QA_SOCKET__ = () => {
    const listeners = new Map();
    const emitLocal = (event, payload) => { for (const fn of [...(listeners.get(event) || [])]) { try { fn(payload); } catch (err) { console.warn("[qa socket]", event, err); } } };
    const socket = {
      connected: false, active: true, id: "qa",
      on(event, fn) { if (!listeners.has(event)) listeners.set(event, new Set()); listeners.get(event).add(fn); return socket; },
      once(event, fn) { const wrap = (p) => { listeners.get(event)?.delete(wrap); fn(p); }; return socket.on(event, wrap); },
      off(event, fn) { if (fn) listeners.get(event)?.delete(fn); else listeners.delete(event); return socket; },
      removeListener(event, fn) { return socket.off(event, fn); },
      removeAllListeners(event) { if (event) listeners.delete(event); else listeners.clear(); return socket; },
      emit(_event, ...rest) { const cb = rest.find((x) => typeof x === "function"); if (cb) queueMicrotask(() => { try { cb(null); } catch { /* ignore */ } }); return socket; },
      timeout() { return socket; },
      disconnect() { socket.connected = false; return socket; },
      connect() { socket.connected = true; queueMicrotask(() => emitLocal("connect")); return socket; },
      io: { on() { return this; }, off() { return this; }, engine: { on() {}, readyState: "open" } },
      resumeWatchdog: { dispose() {}, ensureFresh() { return false; } },
    };
    window.__glassQaEmit = emitLocal;
    setTimeout(() => {
      socket.connected = true;
      emitLocal("connect");
      emitLocal("connected", { user: fixture.me });
      emitLocal("friend:list", fixture.friends);
      emitLocal("friend:requests", []);
      emitLocal("users:update", [fixture.me, ...fixture.friends]);
      emitLocal("sync:state", { dmPreviewsByPeer: {}, dmLastActivityByPeer: {}, notifications: [], dmUnreadByPeer: {} });
      emitLocal("status:current", { status: "online" });
      emitLocal("server:voice:channel-state", fixture.voiceChannelState);
      emitLocal("server:voice:states", fixture.voiceStates);
    }, 80);
    return socket;
  };
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  const orig = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const raw = typeof input === "string" ? input : input?.url || "";
    let p = raw;
    try { const u = new URL(raw, location.origin); p = u.pathname; } catch { /* keep */ }
    if (/\/world3d\/|\/src\/|\/node_modules\/|\/@vite|\/@react-refresh/.test(p) && raw.startsWith(location.origin)) return orig(input, init);
    if (p === "/auth/me" || p === "/api/auth/me") return json({ user: fixture.me });
    if (p.startsWith("/auth/users/")) return json({ user: fixture.friends.find((f) => p.endsWith(f.id)) || fixture.me });
    if (p === "/auth/google/config") return json({ clientId: "" });
    if (p === "/api/features" || p === "/api/features/profanity") return json({ desktopGlass: true });
    if (p === "/api/friends/list" || p === "/friends/list") return json({ friends: fixture.friends });
    if (p === "/api/friends/requests" || p === "/friends/requests") return json({ requests: [] });
    if (p.startsWith("/api/friends/suggestions")) return json({ suggestions: [] });
    if (p === "/api/friends/blocked") return json({ blocked: [] });
    if (p === "/api/dm/previews") return json({ dmPreviewsByPeer: {}, dmLastActivityByPeer: {} });
    if (p === "/api/dm/prefs") return json({ prefs: [] });
    if (p === "/groups/my" || p === "/api/groups/my") return json({ groups: [fixture.group] });
    if (/^\/groups\/[^/]+\/messages/.test(p)) return json({ messages: [], reactionsIncluded: true });
    if (/^\/groups\/[^/]+\/members/.test(p)) return json({ members: fixture.group.members });
    if (p === "/api/servers/my") return json({ servers: [fixture.server], ownedCount: 1, maxOwned: 10 });
    if (p === "/api/servers/me/unread") return json({ unread: {} });
    if (p === "/api/servers/me/folders") return json({ folders: [] });
    if (p === "/api/servers/me/channel-mutes") return json({ mutes: [] });
    if (p === `/api/servers/${fixture.server.id}`) return json({ server: fixture.server });
    if (p === `/api/servers/${fixture.server.id}/members`) return json({ members: fixture.serverMembers });
    if (/\/api\/servers\/[^/]+\/channels\/[^/]+\/messages/.test(p)) return json({ messages: [], reactionsIncluded: true });
    if (p.startsWith("/api/calls")) return json({ calls: [] });
    if (p === "/api/announcements") return json({ announcements: [] });
    if (p === "/api/announcements/unread/count") return json({ count: 0 });
    if (p.startsWith("/api/reactions/")) return json({ reactions: {} });
    if (p.startsWith("/api/shop")) return json({ items: [], inventory: [], balance: 0 });
    if (raw.startsWith(location.origin) || raw.startsWith("/")) return json({});
    return json({});
  };
}

const scenes = {
  group: {
    path: "/groups/grp-aksam?glass-desktop=1",
    detail: {
      scene: "group-call", groupId: GROUP.id, callType: "video", durationSeconds: 1116,
      participants: [
        { ...AYSE, screen: true, screenLabel: "Ayşe ekranı", screenColor: "#4a3566" },
        { ...MERT, isMuted: true },
        { ...ZEYNEP },
        { ...CAN, isCameraOn: false },
        { ...ELIF, isCameraOn: false },
      ],
    },
    ready: ".call-overlay-root",
    dock: ".call-control-bar",
  },
  voice: {
    path: "/servers/srv-gece/c1?glass-desktop=1",
    detail: {
      scene: "server-voice", serverId: SERVER.id, channelId: "c1", channelName: "Oturma odası",
      participants: [{ ...AYSE, screen: true, screenLabel: "Ayşe ekranı", screenColor: "#243056" }, MERT, ZEYNEP],
    },
    ready: ".server-voice-panel",
    dock: ".server-voice-dock",
  },
};

async function measure(page, cdp, ms) {
  const m0 = Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]));
  const p0 = await page.evaluate(() => ({ ...window.__probe, t: performance.now() }));
  await page.waitForTimeout(ms);
  const m1 = Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]));
  const p1 = await page.evaluate(() => {
    const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden"; };
    const all = [...document.querySelectorAll("*")];
    const bf = all.filter((el) => { const cs = getComputedStyle(el); return (cs.backdropFilter && cs.backdropFilter !== "none") || (cs.webkitBackdropFilter && cs.webkitBackdropFilter !== "none"); });
    const videos = [...document.querySelectorAll("video")];
    const anims = document.getAnimations ? document.getAnimations().filter((a) => a.playState === "running").length : null;
    return {
      ...window.__probe,
      t: performance.now(),
      backdrop: bf.filter(vis).length,
      backdropInWorldOverlay: bf.filter((el) => el.closest(".w3d-root")).length,
      videos: videos.length,
      videosPlaying: videos.filter((v) => !v.paused && v.readyState >= 2 && vis(v)).length,
      runningAnimations: anims,
      domNodes: all.length,
      audioEls: document.querySelectorAll("audio").length,
    };
  });
  const sec = (p1.t - p0.t) / 1000;
  const d = (k) => ((m1[k] || 0) - (m0[k] || 0));
  return {
    reactCommitsPerSec: +(p1.commits - p0.commits) / sec,
    videoFramesPerSec: +(p1.videoFrames - p0.videoFrames) / sec,
    videos: p1.videos,
    videosPlaying: p1.videosPlaying,
    backdropFilterElements: p1.backdrop,
    backdropInWorldOverlay: p1.backdropInWorldOverlay,
    runningCssAnimations: p1.runningAnimations,
    domNodes: p1.domNodes,
    audioElements: p1.audioEls,
    scriptMsPerSec: (d("ScriptDuration") * 1000) / sec,
    layoutMsPerSec: (d("LayoutDuration") * 1000) / sec,
    styleMsPerSec: (d("RecalcStyleDuration") * 1000) / sec,
    layoutsPerSec: d("LayoutCount") / sec,
    styleRecalcsPerSec: d("RecalcStyleCount") / sec,
  };
}

const round = (o) => JSON.parse(JSON.stringify(o, (k, v) => (typeof v === "number" ? Math.round(v * 100) / 100 : v)));

const browser = await chromium.launch({
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required", "--hide-scrollbars"],
});
const report = { label: LABEL };
try {
  for (const id of ONLY) {
    const sc = scenes[id];
    for (const [w, h] of SIZES) {
      const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
      const errors = [];
      page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
      await page.addInitScript(install, FIXTURE);
      // the dev server has no SPA fallback for deep links: serve the app shell for documents
      await page.route((url) => url.origin === ORIGIN && !/\.[a-z0-9]+$/i.test(url.pathname) && url.pathname !== "/", async (route) => {
        if (route.request().resourceType() !== "document") return route.continue();
        const res = await fetch(ORIGIN + "/");
        return route.fulfill({ status: 200, contentType: "text/html", body: await res.text() });
      });
      await page.goto(ORIGIN + sc.path, { waitUntil: "domcontentloaded" });
      const logs = [];
      page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`.slice(0, 300)));
      try {
        await page.waitForFunction(() => document.querySelector(".nav-rail, .sidebar, .server-shell-header, .chat-panel"), null, { timeout: 60000 });
      } catch (err) {
        await page.screenshot({ path: join(OUT, `${LABEL}-${id}-boot-failed.png`) });
        console.log(logs.slice(-30).join("\n"), errors.join("\n"));
        console.log((await page.evaluate(() => document.body.innerText)).slice(0, 800));
        throw err;
      }
      await page.waitForTimeout(800);
      await page.evaluate((detail) => {
        window.__glassQaScenes.push(detail);
        window.dispatchEvent(new CustomEvent("descall:glass-qa", { detail }));
      }, sc.detail);
      await page.waitForSelector(sc.ready, { timeout: 20000 });
      await page.waitForTimeout(1500);
      const dock = await page.$(sc.dock);
      const tag = `${LABEL}-${id}-${w}x${h}`;
      await page.screenshot({ path: join(OUT, `${tag}-full.png`) });
      if (dock) {
        const box = await dock.boundingBox();
        const pad = 24;
        await page.screenshot({ path: join(OUT, `${tag}-dock.png`), clip: { x: Math.max(0, box.x - pad), y: Math.max(0, box.y - pad), width: Math.min(w, box.width + pad * 2), height: Math.min(h - Math.max(0, box.y - pad), box.height + pad * 2) } });
      }
      const hasEnter = await page.$(".w3d-enter");
      if (hasEnter) {
        await hasEnter.hover();
        await page.waitForTimeout(450);
        if (dock) {
          const box = await (await page.$(sc.dock)).boundingBox();
          const pad = 24;
          await page.screenshot({ path: join(OUT, `${tag}-dock-hover.png`), clip: { x: Math.max(0, box.x - pad), y: Math.max(0, box.y - pad), width: Math.min(w, box.width + pad * 2), height: Math.min(h - Math.max(0, box.y - pad), box.height + pad * 2) } });
        }
        await page.mouse.move(5, 5);
      }
      if (w !== SIZES[0][0]) { await page.close(); continue; }
      const cdp = await page.context().newCDPSession(page);
      await cdp.send("Performance.enable");
      const row = { enterButton: Boolean(hasEnter), errors };
      row.stage = await measure(page, cdp, MEASURE_MS);
      if (hasEnter) {
        await page.click(".w3d-enter");
        await page.waitForFunction(() => window.__descallWorld && window.__descallWorld.avatars && window.__descallWorld.avatars.size >= 1, null, { timeout: 240000 });
        await page.waitForTimeout(2500);
        await page.evaluate(() => { const w = window.__descallWorld; if (w.perfLockScale) w.perfLockScale(8); else { w.lockQuality = true; w.engine.setHardwareScalingLevel(8); } });
        await page.waitForTimeout(1000);
        row.world = await measure(page, cdp, MEASURE_MS);
        row.world.avatars = await page.evaluate(() => window.__descallWorld.avatars.size);
        await page.evaluate(() => { const w = window.__descallWorld; if (w.perfLockScale) w.perfLockScale(0); else w.engine.setHardwareScalingLevel(1); });
        await page.waitForTimeout(1500);
        await page.screenshot({ path: join(OUT, `${tag}-world.png`) });
        await page.click(".w3d-leave");
        await page.waitForTimeout(1500);
        row.afterLeave = await measure(page, cdp, 3000);
        row.afterLeave.engineGone = await page.evaluate(() => !window.__descallWorld);
        await page.screenshot({ path: join(OUT, `${tag}-after-leave.png`) });
      }
      report[id] = round(row);
      console.log(id, JSON.stringify(report[id], null, 2));
      await page.close();
    }
  }
} finally {
  await browser.close();
}
writeFileSync(join(OUT, `${LABEL}-callstage.json`), JSON.stringify(report, null, 2));
console.log("wrote", join(OUT, `${LABEL}-callstage.json`));
