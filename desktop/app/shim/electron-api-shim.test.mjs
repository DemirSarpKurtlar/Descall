// electronAPI parity test for the Tauri shim (plan section 4, P1 acceptance: every
// electronAPI member gets an automated "page call -> expected shell command" check).
// Run: node desktop/app/shim/electron-api-shim.test.mjs   (CI: tauri-build.yml)
//
// 1. Same member names and types as frontend/electron/preload.cjs (main) and
//    adminPreload.cjs (admin windows), read from the real preload files.
// 2. Every member reaches the expected Tauri command with the expected arguments, or answers
//    the same constant the Electron preload answered, without any IPC.
// 3. Every listener subscribes to the same channel name Electron used and maps the payload
//    the same way (including the legacy (event, info) callbacks and removeAllListeners).
// 4. Every command the shim can call is registered in src-tauri/src/main.rs.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..", "..", "..");
const electronDir = join(repo, "frontend", "electron");
const shimSrc = readFileSync(join(here, "electron-api-shim.js"), "utf8");
const premiumShimSrc = readFileSync(join(here, "premium-shim.js"), "utf8");
const mainRs = readFileSync(join(here, "..", "src-tauri", "src", "main.rs"), "utf8");

// ---- Electron preloads with a fake electron module --------------------------------------------
function loadPreload(file) {
  const exposed = {};
  const ipcCalls = [];
  const ipc = {
    invoke: (ch, ...a) => { ipcCalls.push(["invoke", ch, a]); return Promise.resolve(null); },
    send: (ch, ...a) => ipcCalls.push(["send", ch, a]),
    sendSync: (ch, ...a) => { ipcCalls.push(["sendSync", ch, a]); return null; },
    on: (ch) => { ipcCalls.push(["on", ch]); return ipc; },
    off: () => ipc,
    removeListener: () => ipc,
    removeAllListeners: () => ipc,
  };
  const electron = {
    contextBridge: { exposeInMainWorld: (name, api) => { exposed[name] = api; } },
    ipcRenderer: ipc,
    webFrame: { getZoomFactor: () => 1, setZoomFactor: () => {} },
  };
  const sandbox = { require: (m) => (m === "electron" ? electron : {}), process: { platform: "win32" }, console: { log() {}, warn() {}, error() {} }, Promise };
  vm.runInNewContext(readFileSync(join(electronDir, file), "utf8"), sandbox, { filename: file });
  return { api: exposed.electronAPI, premium: exposed.descallPremium, ipcCalls };
}
const electronMain = loadPreload("preload.cjs");
const electronAdmin = loadPreload("adminPreload.cjs");

// ---- the shim with a fake Tauri bridge -----------------------------------------------------------
function loadShim({ boot = {}, responses = {} } = {}) {
  const invokes = [];
  const listeners = new Map();
  const unlistened = [];
  const store = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), _m: m }; };
  const window = {
    __DESCALL_BOOT__: boot,
    __TAURI_INTERNALS__: { metadata: { currentWebview: { label: boot.mode === "admin" ? "admin" : "main" } } },
    __TAURI__: {
      core: { invoke: (cmd, args) => { invokes.push([cmd, args]); return Promise.resolve(responses[cmd] ?? null); } },
      event: {
        listen: (event, handler) => {
          if (!listeners.has(event)) listeners.set(event, []);
          listeners.get(event).push(handler);
          return Promise.resolve(() => { unlistened.push(event); listeners.set(event, listeners.get(event).filter((h) => h !== handler)); });
        },
      },
    },
  };
  window.top = window;
  const ctx = {
    window,
    document: { addEventListener: () => {} },
    localStorage: store(),
    sessionStorage: store(),
    location: { href: "https://tauri.localhost/", origin: "https://tauri.localhost", hostname: "tauri.localhost" },
    navigator: {},
    URL,
    console,
    Promise,
    Uint8Array,
    ArrayBuffer,
  };
  // Same order as Tauri: plugin init scripts (premium-shim.js) run before the window's own.
  vm.createContext(ctx);
  vm.runInContext(premiumShimSrc, ctx, { filename: "premium-shim.js" });
  vm.runInContext(shimSrc, ctx, { filename: "electron-api-shim.js" });
  const emit = (event, payload) => (listeners.get(event) || []).forEach((h) => h({ payload }));
  return { api: window.electronAPI, premium: window.descallPremium, window, invokes, listeners, unlistened, emit, ctx };
}
// Values from the vm realm have other prototypes: compare their JSON shape.
const plain = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const deq = (a, b, m) => assert.deepEqual(plain(a), plain(b), m);
const tick = () => new Promise((r) => setTimeout(r, 0));

// 1. Key sets and types ------------------------------------------------------------------------
const mainShim = loadShim({ boot: { version: "4.0.0", platform: "win32", token: "boot.tok.en" } });
const adminShim = loadShim({ boot: { mode: "admin", version: "4.0.0", platform: "win32" } });
for (const [label, shim, ref] of [["main", mainShim, electronMain], ["admin", adminShim, electronAdmin]]) {
  deq(Object.keys(shim.api).sort(), Object.keys(ref.api).sort(), `${label}: same electronAPI keys as the Electron preload`);
  for (const k of Object.keys(ref.api)) assert.equal(typeof shim.api[k], typeof ref.api[k], `${label}.${k} has the same type`);
  deq(Object.keys(shim.api.secureToken).sort(), Object.keys(ref.api.secureToken).sort());
  deq(Object.keys(shim.api.zoom).sort(), Object.keys(ref.api.zoom).sort());
  assert.equal(shim.api.isElectron, true);
  assert.equal(shim.api.platform, "win32");
}
assert.ok(mainShim.premium && typeof mainShim.premium.invoke === "function", "descallPremium in the main window");
assert.equal(Boolean(adminShim.premium), Boolean(electronAdmin.premium), "no descallPremium in admin windows, as Electron");
assert.equal(mainShim.api.isTauri, true, "isTauri is an extra, non-enumerable flag");
const memberCount = Object.keys(electronMain.api).length - 2 + 2 + 3; // -zoom -secureToken objects, +2 zoom, +3 token
console.log(`electronAPI members checked: ${memberCount}`);

// 2. Calls -> commands ------------------------------------------------------------------------
const CASES = [
  // [member path, args, expected command, expected args]
  ["setLocale", ["tr-TR-extra-long-locale"], "app_set_locale", { locale: "tr-TR-extra-long" }],
  ["readClipboardImage", [], "clipboard_read_image", undefined],
  ["writeClipboardText", ["hi"], "clipboard_write_text", { text: "hi" }],
  ["zoom.set", [1.25], "window_set_zoom", { factor: 1.25 }],
  ["checkForUpdates", [], "updates_check", undefined],
  ["restartApp", [], "updates_restart", { confirmed: false }],
  ["confirmRestartApp", [], "updates_restart", { confirmed: true }],
  ["getUpdateStatus", [], "updates_status", undefined],
  ["setVoiceBusy", [1], "voice_set_busy", { busy: true }],
  ["setActivityBusy", [0], "activity_set_busy", { busy: false }],
  ["minimizeWindow", [], "window_minimize", undefined],
  ["maximizeWindow", [], "window_toggle_maximize", undefined],
  ["closeWindow", [], "window_close", undefined],
  ["getContentBox", [], "window_content_box", undefined],
  ["retryBoot", [], "app_boot_retry", undefined],
  ["bootState", ["painted", "812"], "app_boot_state", { phase: "painted", ms: 812 }],
  ["downloadFile", ["https://x/y.zip", "y.zip"], "download_file", { url: "https://x/y.zip", filename: "y.zip" }],
  ["showNotification", ["Ayşe", { body: "selam", tag: "dm:1", data: { type: "dm" } }], "notification_show", { payload: { title: "Ayşe", options: { body: "selam", tag: "dm:1", data: { type: "dm" } } } }],
  ["closeNotification", [{ tag: "call:1" }], "notification_close", { payload: { tag: "call:1" } }],
  ["closeNotification", [], "notification_close", { payload: {} }],
  ["getScreenSources", [], "screen_sources", undefined],
  ["isWindowFocused", [], "window_is_focused", undefined],
  ["focusWindow", [], "window_focus", undefined],
  ["scanProcesses", [], "processes_scan", undefined],
  ["overlayShow", [{ title: "Genel" }], "overlay_show", { payload: { title: "Genel" } }],
  ["overlayHide", [], "overlay_hide", undefined],
  ["overlayUpdate", [{ muted: true }], "overlay_update", { payload: { muted: true } }],
  ["secureToken.set", ["a.b.c"], "token_set", { token: "a.b.c" }],
  ["secureToken.set", [""], "token_clear", undefined],
  ["secureToken.clear", [], "token_clear", undefined],
];
const get = (obj, path) => path.split(".").reduce((o, k) => o[k], obj);
const called = new Set();
for (const [path, args, cmd, expected] of CASES) {
  const s = loadShim({ boot: { version: "4.0.0" }, responses: { screen_sources: [], clipboard_read_image: new ArrayBuffer(0) } });
  const out = get(s.api, path)(...args);
  if (out && typeof out.then === "function") await out;
  await tick();
  deq(s.invokes.map((c) => c[0]), [cmd], `${path} -> ${cmd}`);
  deq(s.invokes[0][1], expected, `${path} args`);
  called.add(cmd);
}

// Values answered locally (sync in Electron) and return shapes.
{
  const s = loadShim({ boot: { version: "4.0.0", token: "boot.tok.en", reducedTransparency: true } });
  assert.equal(await s.api.getVersion(), "4.0.0", "version from the boot snapshot, no IPC");
  assert.equal(s.api.getPrefersReducedTransparency(), true);
  assert.equal(await s.api.requestNotificationPermission(), true);
  assert.equal(s.api.zoom.get(), 1);
  s.api.zoom.set(3);
  assert.equal(s.api.zoom.get(), 1, "zoom outside 0.5..2 ignored");
  deq(await s.api.writeClipboardText(5), { ok: false }, "non-string copy refused without IPC");
  assert.equal(s.api.secureToken.get(), "boot.tok.en", "token from the boot snapshot, synchronously");
  assert.equal(s.api.secureToken.set("new.tok.en"), true);
  assert.equal(s.api.secureToken.get(), "new.tok.en");
  assert.equal(s.ctx.sessionStorage.getItem("__descall_token_override"), "new.tok.en", "survives a boot-retry reload");
  assert.equal(s.api.secureToken.clear(), true);
  assert.equal(s.api.secureToken.get(), null);
  assert.equal(await s.api.selectDisplaySource("screen:0:0"), false, "no native lane loaded -> false");
  assert.equal(s.invokes.filter((c) => c[0] !== "token_set" && c[0] !== "token_clear").length, 0);
  const noVersion = loadShim({ boot: {} });
  await noVersion.api.getVersion();
  deq(noVersion.invokes.map((c) => c[0]), ["app_version"]);
  called.add("app_version");
}
{
  // Screen sources keep Electron's field names for the glass picker.
  const s = loadShim({ responses: { screen_sources: [{ id: "screen:0:0", name: "Ekran 1", thumbnailDataUrl: "data:image/jpeg;base64,x" }] } });
  deq(await s.api.getScreenSources(), [{ id: "screen:0:0", name: "Ekran 1", thumbnailDataURL: "data:image/jpeg;base64,x", appIconDataURL: null }]);
  // With the native lane present, selection goes there.
  let picked = null;
  s.window.__descallNativeShare = { getSources: () => Promise.resolve([]), select: (id) => { picked = id; return Promise.resolve(true); } };
  assert.equal(await s.api.selectDisplaySource("window:1234:0"), true);
  assert.equal(picked, "window:1234:0");
  assert.equal(await s.api.selectDisplaySource("file:///x"), false, "bad ids refused (main.cjs regex)");
}
{
  // Clipboard image: raw bytes -> Uint8Array, empty -> null.
  const s = loadShim({ responses: { clipboard_read_image: new Uint8Array([137, 80, 78, 71]).buffer } });
  const img = await s.api.readClipboardImage();
  assert.equal(img.length, 4);
  const e = loadShim({ responses: { clipboard_read_image: new ArrayBuffer(0) } });
  assert.equal(await e.api.readClipboardImage(), null);
}
{
  // descallPremium (premium-shim.js): same channel allow-list as preload.cjs.
  const s = loadShim();
  await s.premium.invoke("premium:hotkeys:list", 1, 2);
  deq(s.invokes[0], ["premium_invoke", { channel: "premium:hotkeys:list", args: [1, 2] }]);
  await assert.rejects(s.premium.invoke("app-version"), /premium channel expected/);
  assert.equal(typeof s.premium.on("nope", () => {}), "function");
  called.add("premium_invoke");
}

// Admin windows: the same constants adminPreload.cjs answers, with no IPC.
{
  const s = loadShim({ boot: { mode: "admin" } });
  const STUBS = {
    readClipboardImage: null,
    checkForUpdates: { success: true, skipped: true },
    restartApp: { installing: false },
    confirmRestartApp: { installing: false },
    getScreenSources: [],
    selectDisplaySource: false,
    scanProcesses: [],
  };
  for (const [k, value] of Object.entries(STUBS)) {
    const mine = await s.api[k]();
    const theirs = await electronAdmin.api[k]();
    deq(mine, value, `admin ${k}`);
    deq(mine, theirs, `admin ${k} equals adminPreload.cjs`);
  }
  for (const k of ["downloadFile", "overlayShow", "overlayHide", "overlayUpdate"]) assert.equal(s.api[k]("x"), undefined);
  await tick();
  deq(s.invokes, [], "admin stubs send nothing");
}

// 3. Listeners --------------------------------------------------------------------------------
const LISTENERS = {
  onConfirmRestart: "update:confirm-restart",
  onMaximizedChange: "window:maximized",
  onAppVisibility: "app:visibility",
  onContentBox: "window:content-box",
  onReducedTransparencyChange: "native-theme:reduced-transparency-changed",
  onUpdateAvailable: "update-available",
  onUpdateDownloaded: "update-downloaded",
  onUpdateDownloading: "update:downloading",
  onUpdateInstalling: "update:installing",
  onUpdateProgress: "update:progress",
  onUpdateReady: "update:ready",
  onUpdateError: "update:error",
  onNotificationClick: "notification:click",
  onNotificationClicked: "notification:click",
  onCallAccept: "notification:call-accept",
  onCallDecline: "notification:call-decline",
  onOverlayAction: "descall:overlay:action",
  onMainError: "app:main-error",
};
// Same channel names as the Electron preload subscribes to.
for (const [k, channel] of Object.entries(LISTENERS)) {
  const before = electronMain.ipcCalls.length;
  electronMain.api[k](() => {});
  const subscribed = electronMain.ipcCalls.slice(before).filter((c) => c[0] === "on").map((c) => c[1]);
  deq(subscribed, [channel], `Electron ${k} listens to ${channel}`);
}
deq(Object.keys(LISTENERS).sort(), Object.keys(electronMain.api).filter((k) => /^on[A-Z]/.test(k)).sort(), "every on* member is covered");
for (const [k, channel] of Object.entries(LISTENERS)) {
  const s = loadShim();
  const got = [];
  const off = s.api[k]((...a) => got.push(a));
  await tick();
  assert.ok((s.listeners.get(channel) || []).length >= 1, `${k} listens to ${channel}`);
  s.emit(channel, { v: 1 });
  if (k === "onUpdateAvailable" || k === "onUpdateDownloaded") {
    deq(got[0][1], { v: 1 }, `${k} keeps Electron's (event, info) callback shape`);
  } else if (k === "onMaximizedChange" || k === "onReducedTransparencyChange") {
    deq(got[0], [true], `${k} passes a boolean`);
  } else {
    deq(got[0], [{ v: 1 }], `${k} passes the payload`);
  }
  if (typeof off === "function") {
    off();
    assert.ok(s.unlistened.includes(channel), `${k} unsubscribe removes the Tauri listener`);
  }
}
{
  const s = loadShim();
  let n = 0;
  s.api.onUpdateDownloaded(() => { n += 1; });
  await tick();
  s.api.removeAllListeners("update-downloaded");
  s.emit("update-downloaded", {});
  assert.equal(n, 0, "removeAllListeners drops the legacy listener");
  const v = [];
  s.api.onAppVisibility((p) => v.push(p));
  await tick();
  s.emit("app:visibility", { backgrounded: true });
  s.emit("app:visibility", null);
  deq(v, [{ backgrounded: true }, {}], "app:visibility payload as appVisibility.js expects");
}

// 4. Commands exist in main.rs -----------------------------------------------------------------
const handler = mainRs.slice(mainRs.indexOf("generate_handler!["), mainRs.indexOf("])", mainRs.indexOf("generate_handler![")));
const registered = new Set([...handler.matchAll(/::(\w+),/g)].map((m) => m[1]));
const fromShim = new Set([...shimSrc.matchAll(/(?:invoke|fire)\("(\w+)"/g)].map((m) => m[1]));
for (const cmd of new Set([...called, ...fromShim])) assert.ok(registered.has(cmd), `${cmd} is registered in main.rs`);
for (const cmd of ["notif_action", "overlay_action"]) assert.ok(registered.has(cmd), `${cmd} (shell pages) is registered`);
// The native screen-share lane (native-screen-share.js) is injected into the same page.
const nativeSrc = readFileSync(join(here, "native-screen-share.js"), "utf8");
const fromNative = new Set([...nativeSrc.matchAll(/invoke\("(\w+)"/g)].map((m) => m[1]));
assert.ok(fromNative.has("screen_share_start") && fromNative.has("screen_thumbnails"), "native lane commands found");
for (const cmd of fromNative) assert.ok(registered.has(cmd), `${cmd} (native screen share) is registered in main.rs`);
assert.match(mainRs, /include_str!\("\.\.\/\.\.\/shim\/native-screen-share\.js"\)/, "main.rs injects the native lane");
// Descall+ page bridges (premium plugin, HUD and launcher windows).
for (const f of ["premium-shim.js", "premium-hud-shim.js", "premium-launcher-shim.js"]) {
  const src = readFileSync(join(here, f), "utf8");
  const cmds = new Set([...src.matchAll(/invoke\("(\w+)"/g)].map((m) => m[1]));
  assert.ok(cmds.size > 0, `${f}: commands found`);
  for (const cmd of cmds) assert.ok(registered.has(cmd), `${cmd} (${f}) is registered in main.rs`);
}
assert.match(mainRs, /\.plugin\(premium::init\(\)\)/, "the Descall+ plugin is registered");
assert.match(mainRs, /\{SHIM\}\\n\{NATIVE_SHARE\}/, "the native lane loads with the main shim");

console.log("electron-api-shim.test: ok");
