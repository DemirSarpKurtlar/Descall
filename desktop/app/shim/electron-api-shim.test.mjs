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
import { readdirSync, readFileSync, statSync } from "node:fs";
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
function loadShim({ boot = {}, responses = {}, fail = [], realOrder = false, label = boot.mode === "admin" ? "admin" : "main", session = null } = {}) {
  const invokes = [];
  const winListeners = new Map();
  const listeners = new Map();
  const unlistened = [];
  const store = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), _m: m }; };
  const answer = (cmd, args) => {
    invokes.push([cmd, args]);
    return fail.includes(cmd) ? Promise.reject(new Error(`${cmd} failed`)) : Promise.resolve(responses[cmd] ?? null);
  };
  const tauriGlobal = {
      core: { invoke: answer },
      event: {
        listen: (event, handler, options) => {
          if (!listeners.has(event)) listeners.set(event, []);
          handler.__target = (options && options.target) || { kind: "Any" };
          listeners.get(event).push(handler);
          return Promise.resolve(() => { unlistened.push(event); listeners.set(event, listeners.get(event).filter((h) => h !== handler)); });
        },
      },
  };
  const window = {
    __DESCALL_BOOT__: boot,
    __TAURI_INTERNALS__: { metadata: { currentWebview: { label } }, invoke: answer, transformCallback: () => 1 },
    addEventListener: (type, fn, capture) => { if (!winListeners.has(type)) winListeners.set(type, []); winListeners.get(type).push({ fn, capture: Boolean(capture) }); },
  };
  // Real Tauri order: plugin init scripts (premium-shim.js) run BEFORE the withGlobalTauri
  // bundle defines window.__TAURI__; the window's own scripts (electron-api-shim.js) after it.
  if (!realOrder) window.__TAURI__ = tauriGlobal;
  window.top = window;
  const ctx = {
    window,
    document: { addEventListener: () => {}, documentElement: { classList: { _s: new Set(), add(c) { this._s.add(c); } } } },
    localStorage: store(),
    sessionStorage: session || store(),
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
  window.__TAURI__ = tauriGlobal;
  vm.runInContext(shimSrc, ctx, { filename: "electron-api-shim.js" });
  // Calls the shim makes by itself at start (e.g. the reduced-transparency refresh).
  const startup = invokes.splice(0);
  // Tauri emit_to(label) semantics: a listener with target Any hears every event (that was
  // the leak); one with a label target only the events sent to that label. `to` omitted = this
  // window (Rust emit_to(own label)).
  const hears = (h, to) => {
    const t = h.__target || { kind: "Any" };
    return t.kind === "Any" || to === undefined || t.label === to;
  };
  const emit = (event, payload, to = label) => (listeners.get(event) || []).forEach((h) => { if (hears(h, to)) h({ payload }); });
  const dispatch = (type, ev) => { for (const l of winListeners.get(type) || []) l.fn(ev); return ev; };
  return { api: window.electronAPI, premium: window.descallPremium, window, invokes, startup, listeners, unlistened, emit, ctx, dispatch, winListeners };
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
  ["getScreenSources", [], "screen_sources", { thumbnails: true }],
  ["isWindowFocused", [], "window_is_focused", undefined],
  ["focusWindow", [], "window_focus", undefined],
  ["scanProcesses", [], "processes_scan", undefined],
  ["overlayShow", [{ title: "Genel" }], "overlay_show", { payload: { title: "Genel" } }],
  ["overlayHide", [], "overlay_hide", undefined],
  ["overlayUpdate", [{ muted: true }], "overlay_update", { payload: { muted: true } }],
  ["setTrayState", [{ name: "Demir", unreadMessages: 2 }], "tray_set_state", { state: { name: "Demir", unreadMessages: 2 } }],
  ["setTrayState", [null], "tray_set_state", { state: {} }],
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
  assert.equal(s.api.secureToken.set("x".repeat(16 * 1024 + 1)), false, "a token the store refuses answers false");
  assert.equal(s.api.secureToken.get(), "new.tok.en", "and is not cached");
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

{
  // Real init order (no window.__TAURI__ while premium-shim.js runs): the bridge must still
  // exist (it was missing: Settings > Descall+ showed every desktop feature as locked).
  const s = loadShim({ realOrder: true });
  assert.ok(s.premium && typeof s.premium.invoke === "function", "descallPremium with the real Tauri script order");
  assert.ok(s.window.__descallNativeClip, "native clip bridge with the real order");
  await s.premium.invoke("premium:settings:get", "global_mute");
  deq(s.invokes[0], ["premium_invoke", { channel: "premium:settings:get", args: ["global_mute"] }]);
  s.premium.on("premium:settings-changed", () => {});
  await tick();
  assert.ok((s.listeners.get("premium:settings-changed") || []).length === 1, "premium on() listens with the real order");
}
{
  // Title bar buttons: shell command, then Tauri's window command when it fails.
  for (const [member, cmd, core] of [["minimizeWindow", "window_minimize", "minimize"], ["maximizeWindow", "window_toggle_maximize", "toggle_maximize"], ["closeWindow", "window_close", "close"]]) {
    const s = loadShim({ fail: [cmd] });
    s.ctx.console = { warn() {}, log() {}, error() {} };
    s.api[member]();
    await tick(); await tick();
    deq(s.invokes.map((c) => c[0]), [cmd, `plugin:window|${core}`], `${member} falls back to plugin:window|${core}`);
  }
  const def = JSON.parse(readFileSync(join(here, "..", "src-tauri", "capabilities", "default.json"), "utf8"));
  assert.ok(def.windows.includes("main"), "the main window is in the app capability");
  for (const perm of ["core:window:allow-minimize", "core:window:allow-toggle-maximize", "core:window:allow-close", "core:window:allow-start-dragging", "core:window:allow-internal-toggle-maximize"]) {
    assert.ok(def.permissions.includes(perm), `capability has ${perm}`);
  }
  const winRs = readFileSync(join(here, "..", "src-tauri", "src", "commands", "window.rs"), "utf8");
  for (const cmd of ["window_minimize", "window_toggle_maximize", "window_close"]) {
    assert.match(winRs, new RegExp(`pub async fn ${cmd}<`), `${cmd} is async (off the UI thread, like Tauri's own window commands)`);
  }
}
{
  // No browser context menu outside editable fields; browser shortcuts never navigate.
  const s = loadShim();
  const ev = (extra) => ({ defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...extra });
  const el = (tag, extra = {}) => ({ nodeType: 1, tagName: tag, parentElement: null, isContentEditable: false, ...extra });
  assert.equal(s.dispatch("contextmenu", ev({ target: el("DIV") })).defaultPrevented, true, "no menu on plain content");
  assert.equal(s.dispatch("contextmenu", ev({ target: el("IMG") })).defaultPrevented, true, "no menu on images");
  assert.equal(s.dispatch("contextmenu", ev({ target: el("INPUT", { type: "text" }) })).defaultPrevented, false, "inputs keep cut/copy/paste");
  assert.equal(s.dispatch("contextmenu", ev({ target: el("TEXTAREA") })).defaultPrevented, false, "textareas keep the native menu");
  const composer = el("DIV", { isContentEditable: true });
  assert.equal(s.dispatch("contextmenu", ev({ target: el("SPAN", { parentElement: composer }) })).defaultPrevented, false, "contenteditable composer keeps it");
  assert.ok(s.winListeners.get("contextmenu").every((l) => !l.capture), "bubble phase: the app's own menus run first");
  const key = (k, mods = {}) => s.dispatch("keydown", ev({ key: k, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods })).defaultPrevented;
  for (const [k, m] of [["F5"], ["r", { ctrlKey: true }], ["R", { ctrlKey: true, shiftKey: true }], ["ArrowLeft", { altKey: true }], ["ArrowRight", { altKey: true }], ["p", { ctrlKey: true }], ["BrowserBack"], ["I", { ctrlKey: true, shiftKey: true }], ["F12"]]) {
    assert.equal(key(k, m), true, `${k} ${JSON.stringify(m || {})} blocked`);
  }
  for (const [k, m] of [["c", { ctrlKey: true }], ["v", { ctrlKey: true }], ["x", { ctrlKey: true }], ["a", { ctrlKey: true }], ["z", { ctrlKey: true }], ["k", { ctrlKey: true }], ["ArrowLeft"], ["Enter"]]) {
    assert.equal(key(k, m), false, `${k} ${JSON.stringify(m || {})} stays with the app`);
  }
  assert.equal(s.dispatch("mouseup", ev({ button: 3 })).defaultPrevented, true, "mouse back button does not navigate");
  assert.ok(s.ctx.document.documentElement.classList._s.has("tauri-app"), "html.tauri-app marks the Tauri shell");
  const webviewRs = readFileSync(join(here, "..", "src-tauri", "src", "webview.rs"), "utf8");
  assert.match(webviewRs, /SetAreBrowserAcceleratorKeysEnabled\(false\)/, "WebView2 browser accelerator keys off");
  assert.match(webviewRs, /add_ContextMenuRequested/, "WebView2 context menu handler installed");
  assert.match(mainRs, /webview::install_browser_guards\(&w\)/, "main window gets the WebView2 guards");
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
  for (const k of ["downloadFile", "overlayShow", "overlayHide", "overlayUpdate", "setTrayState"]) assert.equal(s.api[k]("x"), undefined);
  assert.equal(typeof s.api.onTrayAction(() => {}), "function", "admin onTrayAction: inert unsubscribe");
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
  onTrayAction: "tray:action",
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
    // preload.cjs: handler = (_, data) => callback(data). The shim used to pass a fake
    // (event, info) pair and return nothing.
    deq(got[0], [{ v: 1 }], `${k} passes the payload like preload.cjs`);
    assert.equal(typeof off, "function", `${k} returns an unsubscribe function`);
  } else if (k === "onMaximizedChange" || k === "onReducedTransparencyChange") {
    deq(got[0], [true], `${k} passes a boolean`);
  } else {
    deq(got[0], [{ v: 1 }], `${k} passes the payload`);
  }
  if (typeof off === "function") {
    off();
    const n = got.length;
    s.emit(channel, { v: 2 });
    s.emit(channel, null);
    assert.equal(got.length, n, `${k} unsubscribe stops the callback`);
    // The transparency value has one shell listener for the whole page (it keeps the sync
    // getter current); every other member drops its own Tauri listener.
    if (k !== "onReducedTransparencyChange") assert.ok(s.unlistened.includes(channel), `${k} unsubscribe removes the Tauri listener`);
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

// 3b. Kind parity, derived from the preload sources (no hand-kept list) ----------------------
// Every member a preload exposes is classified by what it does on the fake ipcRenderer:
//   on -> "listener" (returns what Electron returned: an unsubscribe function or nothing),
//   invoke -> "promise", sendSync -> "sync" (a plain value, never a promise),
//   send -> "fire" (returns undefined), no IPC -> by its return value.
// The shim member must exist and keep that kind. A new preload member, or a shim member that
// turns a sync answer into a promise (secureToken.get, getPrefersReducedTransparency, zoom.get),
// fails here.
const isThenable = (v) => Boolean(v) && typeof v.then === "function";
const membersOf = (obj, prefix = "") => Object.keys(obj).flatMap((k) => {
  const v = obj[k];
  return v && typeof v === "object" && !Array.isArray(v) ? membersOf(v, `${prefix}${k}.`) : [`${prefix}${k}`];
});
const argsFor = (path) => (/(^|\.)on[A-Z]\w*$/.test(path) ? [() => {}] : path === "descallHud.fileName" ? [{ name: "a.png" }] : ["ready", "y"]);
function classify(pre, obj, path) {
  const fn = get(obj, path);
  if (typeof fn !== "function") return { kind: `value:${typeof fn}` };
  const before = pre.ipcCalls.length;
  const out = fn(...argsFor(path));
  if (isThenable(out)) out.catch(() => {});
  const calls = pre.ipcCalls.slice(before).map((c) => c[0]);
  if (calls.includes("on")) return { kind: "listener", ret: typeof out };
  if (calls.includes("sendSync")) return { kind: "sync" };
  if (calls.includes("invoke") || isThenable(out)) return { kind: "promise" };
  if (calls.includes("send") || out === undefined) return { kind: "fire" };
  if (typeof out === "function") return { kind: "listener", ret: "function" };
  return { kind: "sync" };
}
function checkKind(label, ref, shimObj, path) {
  const fn = get(shimObj, path);
  if (ref.kind.startsWith("value:")) {
    assert.equal(`value:${typeof fn}`, ref.kind, `${label}.${path} is a ${ref.kind}`);
    return;
  }
  assert.equal(typeof fn, "function", `${label}.${path} exists as a function`);
  const out = fn(...argsFor(path));
  if (isThenable(out)) out.catch(() => {});
  if (ref.kind === "promise") assert.ok(isThenable(out), `${label}.${path} returns a promise like Electron's invoke`);
  if (ref.kind === "sync") assert.ok(!isThenable(out) && out !== undefined, `${label}.${path} answers synchronously like Electron's sendSync`);
  if (ref.kind === "fire") assert.equal(out, undefined, `${label}.${path} returns nothing like Electron's send`);
  if (ref.kind === "listener") assert.equal(typeof out, ref.ret, `${label}.${path} returns ${ref.ret === "function" ? "an unsubscribe function" : "nothing"} like the preload`);
}
let kindsChecked = 0;
for (const [label, pre, mk] of [["electronAPI(main)", electronMain, () => loadShim()], ["electronAPI(admin)", electronAdmin, () => loadShim({ boot: { mode: "admin" } })]]) {
  const shim = mk();
  for (const path of membersOf(pre.api)) {
    const ref = classify(pre, pre.api, path);
    checkKind(label, ref, shim.api, path);
    kindsChecked += 1;
  }
}
{
  const shim = loadShim();
  for (const path of membersOf(electronMain.premium)) {
    checkKind("descallPremium", classify(electronMain, electronMain.premium, path), shim.premium, path);
    kindsChecked += 1;
  }
}
// The same kinds hold for the secondary windows' bridges (notification capsule, voice overlay,
// Descall+ HUD and launcher, tray panel), each against its Electron preload.
function loadPreloadNamed(file) {
  const exposed = {};
  const ipcCalls = [];
  const ipc = {
    invoke: (ch, ...a) => { ipcCalls.push(["invoke", ch, a]); return Promise.resolve(null); },
    send: (ch, ...a) => ipcCalls.push(["send", ch, a]),
    sendSync: (ch, ...a) => { ipcCalls.push(["sendSync", ch, a]); return null; },
    on: (ch) => { ipcCalls.push(["on", ch]); return ipc; },
    off: () => ipc,
    removeListener: () => ipc,
  };
  const electron = { contextBridge: { exposeInMainWorld: (n, api) => { exposed[n] = api; } }, ipcRenderer: ipc, webUtils: { getPathForFile: (f) => f.name } };
  vm.runInNewContext(readFileSync(join(electronDir, file), "utf8"), { require: (m) => (m === "electron" ? electron : {}), console: { log() {} } }, { filename: file });
  return { exposed, ipcCalls };
}
function loadPage(file, label, extra = {}) {
  const invokes = [];
  const listens = [];
  const answer = (cmd, args) => { invokes.push([cmd, args]); return Promise.resolve(null); };
  const window = {
    __TAURI_INTERNALS__: { metadata: { currentWebview: { label } }, invoke: answer, transformCallback: () => 1 },
    __TAURI__: {
      core: { invoke: answer },
      event: { listen: (event, handler, options) => { listens.push({ event, handler, target: (options && options.target) || { kind: "Any" } }); return Promise.resolve(() => {}); } },
      window: { getCurrentWindow: () => ({ startDragging: () => Promise.resolve() }) },
    },
    __descallShellRequire: (m) => (m === "./mainI18n.cjs" ? { setLocale() {} } : {
      describeNotification: (x) => ({ name: x.title, preview: x.body }),
      buildNotificationHtml: () => "",
      buildOverlayHtml: () => "",
    }),
    __descallMountShellPage: () => {},
    ...extra,
  };
  window.top = window;
  const ctx = { window, document: { addEventListener() {} }, location: { hostname: "x" }, console, Promise, Object, String, Number, Boolean, Set, Array };
  vm.createContext(ctx);
  vm.runInContext(readFileSync(join(here, file), "utf8"), ctx, { filename: file });
  return { window, invokes, listens };
}
const PAGE_BRIDGES = [
  // [shim file, window label, Electron preload, exposed name]
  ["shell-notif.js", "notif-7", "notifPreload.cjs", "notifAPI"],
  ["shell-overlay.js", "overlay", "overlayPreload.cjs", "overlayAPI"],
  ["premium-hud-shim.js", "hud-3", "premium/hudPreload.cjs", "descallHud"],
  ["premium-launcher-shim.js", "launcher", "premium/launcher/launcherPreload.cjs", "launcherAPI"],
  ["tray-menu-shim.js", "tray-menu", "trayMenuPreload.cjs", "trayMenuAPI"],
];
for (const [file, label, preloadFile, name] of PAGE_BRIDGES) {
  const pre = loadPreloadNamed(preloadFile);
  const page = loadPage(file, label);
  const ref = pre.exposed[name];
  const mine = page.window[name];
  assert.ok(ref && mine, `${name}: exposed by ${preloadFile} and ${file}`);
  deq(Object.keys(mine).sort(), Object.keys(ref).sort(), `${name}: same keys as ${preloadFile}`);
  const refPre = { ipcCalls: pre.ipcCalls };
  for (const path of membersOf(ref)) {
    checkKind(name, classify(refPre, { [name]: ref }, `${name}.${path}`), { [name]: mine }, `${name}.${path}`);
    kindsChecked += 1;
  }
  // Every listener of a secondary window hears only the events sent to that window.
  for (const l of page.listens) {
    deq(l.target, { kind: "WebviewWindow", label }, `${file}: ${l.event} listens for its own window only`);
  }
}
console.log(`bridge members kind-checked against the Electron preloads: ${kindsChecked}`);

// 3c. Events reach only the window they were sent to ------------------------------------------
// Tauri's global listen() hears an emit_to() aimed at ANY window. A Descall+ pop-out
// (popout-*) or extra-account window (acct-*) runs this shim too, so before the fix a
// notification click, a call accept or a tray action sent to the main window also ran there,
// and the main window's maximize / content box / visibility leaked into them.
for (const label of ["popout-1", "acct-42"]) {
  const s = loadShim({ label });
  const got = [];
  for (const [k, channel] of Object.entries(LISTENERS)) s.api[k]((...a) => got.push([k, channel, a]));
  await tick();
  for (const channel of new Set(Object.values(LISTENERS))) s.emit(channel, { v: 1 }, "main");
  deq(got, [], `${label}: hears nothing that was sent to the main window`);
  s.emit("notification:click", { tag: "dm:1" }, label);
  deq(got.map((g) => g[0]).sort(), ["onNotificationClick", "onNotificationClicked"], `${label}: still hears what is sent to it`);
}
{
  const s = loadShim();
  const got = [];
  s.api.onCallAccept((d) => got.push(d));
  s.api.onMaximizedChange((d) => got.push(d));
  await tick();
  s.emit("notification:call-accept", { id: 1 }, "acct-42");
  s.emit("window:maximized", true, "admin");
  deq(got, [], "main: an admin window's maximize or another window's event is not heard");
  s.emit("window:maximized", true, "main");
  deq(got, [true]);
}
{
  // descallPremium.on in a pop-out does not hear the premium:* events sent to the main window.
  const s = loadShim({ label: "popout-2" });
  const got = [];
  s.premium.on("premium:settings-changed", (x) => got.push(x));
  await tick(); await tick();
  s.emit("premium:settings-changed", { a: 1 }, "main");
  await tick(); await tick();
  deq(got, [], "pop-out: premium events for the main window stay there");
}

// 3d. Sync answers that must survive a reload, and promises that never reject ----------------
{
  // zoom.get(): WebView2 keeps the controller zoom across a reload; the shim must too.
  const session = (() => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; })();
  const first = loadShim({ session });
  first.api.zoom.set(1.25);
  const reloaded = loadShim({ session });
  assert.equal(reloaded.api.zoom.get(), 1.25, "zoom.get() after a reload is the zoom the page set");
  deq(reloaded.startup.filter((c) => c[0] === "window_set_zoom"), [["window_set_zoom", { factor: 1.25 }]], "and the shell zoom is re-applied to match");
  const fresh = loadShim();
  assert.equal(fresh.api.zoom.get(), 1, "a new app start begins at 100 %");
  assert.ok(!fresh.startup.some((c) => c[0] === "window_set_zoom"), "no zoom call at a fresh start");
}
{
  // getPrefersReducedTransparency(): the boot snapshot is written once per window; a reload
  // later in the day asks the shell again and tells the listeners when it changed.
  const s = loadShim({ boot: { reducedTransparency: false }, responses: { app_reduced_transparency: true } });
  const seen = [];
  s.api.onReducedTransparencyChange((v) => seen.push(v));
  assert.ok(s.startup.some((c) => c[0] === "app_reduced_transparency"), "refresh asked at start");
  await tick();
  assert.equal(s.api.getPrefersReducedTransparency(), true, "getter follows the fresh answer");
  deq(seen, [true], "listeners told once");
  s.emit("native-theme:reduced-transparency-changed", false);
  assert.equal(s.api.getPrefersReducedTransparency(), false, "and the change event");
  deq(seen, [true, false]);
  s.emit("native-theme:reduced-transparency-changed", false);
  deq(seen, [true, false], "no duplicate for the same value");
}
{
  // Electron answered these without ever rejecting (main.cjs catches and returns a value).
  const s = loadShim({ fail: ["clipboard_read_image", "clipboard_write_text", "screen_sources", "updates_check"] });
  assert.equal(await s.api.readClipboardImage(), null, "clipboard image failure -> null");
  deq(await s.api.writeClipboardText("hi"), { ok: false }, "copy failure -> { ok: false }");
  deq(await s.api.getScreenSources(), [], "capture failure -> []");
  const upd = await s.api.checkForUpdates();
  assert.equal(upd.success, false, "update check failure -> { success: false }");
  s.window.__descallNativeShare = { getSources: () => Promise.reject(new Error("wgc")), select: () => Promise.reject(new Error("x")) };
  deq(await s.api.getScreenSources(), [], "native lane failure -> []");
  assert.equal(await s.api.selectDisplaySource("screen:0:0"), false, "native select failure -> false");
  const typed = loadShim({ responses: { clipboard_read_image: new Uint8Array([1, 2, 3]) } });
  assert.equal((await typed.api.readClipboardImage()).length, 3, "typed-array answer accepted");
}

{
  // secureToken.get() is sync and per-window cached; a sign-in / sign-out in another owner
  // window (the shell's secure-token:changed) updates it, as Electron's file read did.
  const s = loadShim({ boot: { token: "old.tok.en" } });
  await tick();
  s.emit("secure-token:changed", { token: "new.tok.en" });
  assert.equal(s.api.secureToken.get(), "new.tok.en", "another window signed in");
  s.emit("secure-token:changed", { token: null });
  assert.equal(s.api.secureToken.get(), null, "another window signed out");
  assert.equal(s.ctx.sessionStorage.getItem("__descall_token_override"), "", "and a reload sees it too");
  const acct = loadShim({ label: "acct-42", boot: { token: "acct.tok.en" } });
  await tick();
  acct.emit("secure-token:changed", { token: "owner.tok.en" }, "main");
  assert.equal(acct.api.secureToken.get(), "acct.tok.en", "an extra-account window keeps its own session");
  const systemRs = readFileSync(join(here, "..", "src-tauri", "src", "commands", "system.rs"), "utf8");
  assert.match(systemRs, /pub const TOKEN_EVENT: &str = "secure-token:changed";/);
  assert.match(systemRs, /crate::premium::signed_out\(\);/, "signing out resets the Descall+ gate (main.cjs premium.gate.reset())");
}

// 3e. Capabilities: every window a bridge runs in may use the plugin commands it calls -------
{
  const capDir = join(here, "..", "src-tauri", "capabilities");
  const caps = ["default.json", "tray-menu.json"].map((f) => JSON.parse(readFileSync(join(capDir, f), "utf8")));
  const glob = (pattern, label) => new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`).test(label);
  const capsFor = (label) => caps.filter((c) => c.windows.some((w) => glob(w, label)));
  // core:default bundles core:event:default (listen / unlisten), core:window:default, ...
  const allowed = (label, perm) => capsFor(label).some((c) => c.permissions.includes(perm)
    || (perm.startsWith("core:event:") && c.permissions.includes("core:default"))
    || (perm === "opener:allow-open-url" && c.permissions.includes("opener:allow-open-url")));
  // [shim, windows it is injected into (one sample label per glob)]
  const WINDOWS = {
    "electron-api-shim.js": ["main", "admin", "signup-stats", "popout-1", "acct-7"],
    "premium-shim.js": ["main", "popout-1", "acct-7", "launcher"],
    "native-screen-share.js": ["main", "popout-1"],
    "premium-hud-shim.js": ["hud-1", "widget-clock"],
    "premium-launcher-shim.js": ["launcher"],
    "shell-notif.js": ["notif-1"],
    "shell-overlay.js": ["overlay"],
    "tray-menu-shim.js": ["tray-menu"],
  };
  const PLUGIN_PERM = {
    "plugin:window|minimize": "core:window:allow-minimize",
    "plugin:window|toggle_maximize": "core:window:allow-toggle-maximize",
    "plugin:window|close": "core:window:allow-close",
    "plugin:opener|open_url": "opener:allow-open-url",
    "plugin:event|listen": "core:event:allow-listen",
    "plugin:event|unlisten": "core:event:allow-unlisten",
  };
  for (const [file, labels] of Object.entries(WINDOWS)) {
    const src = readFileSync(join(here, file), "utf8");
    const needs = new Set();
    for (const m of src.matchAll(/"(plugin:[a-z-]+\|[a-z_]+)"/g)) needs.add(m[1]);
    for (const m of src.matchAll(/winCmd\("\w+", "(\w+)"\)/g)) needs.add(`plugin:window|${m[1]}`);
    if (/\.listen\(/.test(src) || /plugin:event\|listen/.test(src)) { needs.add("plugin:event|listen"); needs.add("plugin:event|unlisten"); }
    if (/startDragging\(/.test(src)) needs.add("core:window:allow-start-dragging");
    for (const label of labels) {
      assert.ok(capsFor(label).length > 0, `${label} (${file}) is in a capability`);
      for (const need of needs) {
        const perm = PLUGIN_PERM[need] || need;
        assert.ok(allowed(label, perm), `${label} may use ${need} (${perm}) for ${file}`);
      }
    }
  }
  // Every window label the shell creates is in exactly one capability.
  const rsFiles = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name.endsWith(".rs")) rsFiles.push(readFileSync(p, "utf8"));
    }
  };
  walk(join(here, "..", "src-tauri", "src"));
  const rs = rsFiles.join("\n");
  const labels = new Set(["main", "pip", "sidebar"]);
  for (const m of rs.matchAll(/const LABEL: &str = "([a-z-]+)"/g)) labels.add(m[1]);
  // format!("x-{...}") builds window labels, except these secret-store / log keys.
  const NOT_WINDOWS = new Set(["account", "http"]);
  for (const m of rs.matchAll(/format!\("([a-z]+)-\{/g)) if (!NOT_WINDOWS.has(m[1])) labels.add(`${m[1]}-1`);
  for (const m of rs.matchAll(/Some\(\("([a-z-]+)", (?:STATS|PANEL)_PATH/g)) labels.add(m[1]);
  for (const want of ["overlay", "launcher", "tray-menu", "admin", "signup-stats", "notif-1", "popout-1", "acct-1", "hud-1", "widget-1"]) {
    assert.ok(labels.has(want), `window label ${want} found in the Rust sources`);
  }
  for (const label of labels) assert.equal(capsFor(label).length, 1, `${label} is covered by exactly one capability`);
}

// 4. Commands exist in main.rs -----------------------------------------------------------------
const handler = mainRs.slice(mainRs.indexOf("generate_handler!["), mainRs.indexOf("])", mainRs.indexOf("generate_handler![")));
const registered = new Set([...handler.matchAll(/::(\w+),/g)].map((m) => m[1]));
// Every plain string literal in the first argument, so fire(v ? "token_set" : "token_clear") counts both.
const commandsIn = (src) => new Set([...src.matchAll(/\b(?:invoke|fire|winCmd)\(([^,)\n]*)/g)].flatMap((m) => [...m[1].matchAll(/"(\w+)"/g)].map((x) => x[1])));
const fromShim = commandsIn(shimSrc);
assert.ok(fromShim.has("token_set") && fromShim.has("token_clear") && fromShim.has("window_minimize"), "command parser sees ternaries and winCmd");
for (const cmd of new Set([...called, ...fromShim])) assert.ok(registered.has(cmd), `${cmd} is registered in main.rs`);
for (const cmd of ["notif_action", "overlay_action"]) assert.ok(registered.has(cmd), `${cmd} (shell pages) is registered`);
// The native screen-share lane (native-screen-share.js) is injected into the same page.
const nativeSrc = readFileSync(join(here, "native-screen-share.js"), "utf8");
const fromNative = new Set([...nativeSrc.matchAll(/invoke\("(\w+)"/g)].map((m) => m[1]));
assert.ok(fromNative.has("screen_share_start") && fromNative.has("screen_thumbnails"), "native lane commands found");
for (const cmd of fromNative) assert.ok(registered.has(cmd), `${cmd} (native screen share) is registered in main.rs`);
assert.match(mainRs, /include_str!\("\.\.\/\.\.\/shim\/native-screen-share\.js"\)/, "main.rs injects the native lane");
// Descall+ page bridges (premium plugin, HUD and launcher windows).
for (const f of ["premium-shim.js", "premium-hud-shim.js", "premium-launcher-shim.js", "tray-menu-shim.js"]) {
  const src = readFileSync(join(here, f), "utf8");
  const cmds = new Set([...src.matchAll(/invoke\("(\w+)"/g)].map((m) => m[1]));
  assert.ok(cmds.size > 0, `${f}: commands found`);
  for (const cmd of cmds) assert.ok(registered.has(cmd), `${cmd} (${f}) is registered in main.rs`);
}
assert.match(mainRs, /\.plugin\(premium::init\(\)\)/, "the Descall+ plugin is registered");
assert.match(mainRs, /\{SHIM\}\\n\{NATIVE_SHARE\}/, "the native lane loads with the main shim");

// 5. Tray panel (draft B): its own window, capability and commands.
{
  const src = join(here, "..", "src-tauri");
  const trayMenuRs = readFileSync(join(src, "src", "tray_menu.rs"), "utf8");
  const cap = JSON.parse(readFileSync(join(src, "capabilities", "tray-menu.json"), "utf8"));
  const def = JSON.parse(readFileSync(join(src, "capabilities", "default.json"), "utf8"));
  deq(cap.windows, ["tray-menu"], "the tray panel capability covers that window only");
  deq(cap.permissions.sort(), ["core:event:allow-listen", "core:event:allow-unlisten"], "event listen only, no other plugin");
  assert.ok(!def.windows.includes("tray-menu"), "the panel is not in the app windows' capability");
  for (const cmd of ["tray_menu_state", "tray_menu_act"]) {
    const at = trayMenuRs.indexOf(`pub fn ${cmd}`);
    assert.ok(at > 0 && /if window\.label\(\) != LABEL \{\s*return/.test(trayMenuRs.slice(at, at + 400)), `${cmd} answers the panel window only`);
  }
  const setAt = trayMenuRs.indexOf("pub fn tray_set_state");
  assert.ok(/if window\.label\(\) != state::MAIN \{\s*return;/.test(trayMenuRs.slice(setAt, setAt + 300)), "only the main window sets the tray state");
  assert.match(trayMenuRs, /model::validate_action\(&action, &arg\.unwrap_or\(Value::Null\), &ids\)/, "allow list on every action");
  assert.match(trayMenuRs, /\.initialization_script\(SHIM\)/);
  assert.match(trayMenuRs, /include_str!\("\.\.\/\.\.\/shim\/tray-menu-shim\.js"\)/);
  assert.match(premiumShimSrc, /label === "tray-menu"/, "no descallPremium bridge in the panel");
  const notifyRs = readFileSync(join(src, "src", "commands", "notify.rs"), "utf8");
  assert.match(notifyRs, /crate::tray_menu::suppress_notification\(&app, &payload\.options\)/, "the snooze gates desktop cards");
  const trayRs = readFileSync(join(src, "src", "tray.rs"), "utf8");
  assert.match(trayRs, /if !crate::tray_menu::open\(&app, Some\(icon\), \(position\.x, position\.y\)\) \{[\s\S]{0,120}popup_native/, "native menu when the panel cannot open");
}

console.log("electron-api-shim.test: ok");
