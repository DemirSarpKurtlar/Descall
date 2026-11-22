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
import { readdirSync, readFileSync } from "node:fs";
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
function loadShim({ boot = {}, responses = {}, fail = [], realOrder = false, consoleImpl = null } = {}) {
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
        listen: (event, handler) => {
          if (!listeners.has(event)) listeners.set(event, []);
          listeners.get(event).push(handler);
          return Promise.resolve(() => { unlistened.push(event); listeners.set(event, listeners.get(event).filter((h) => h !== handler)); });
        },
      },
  };
  const window = {
    __DESCALL_BOOT__: boot,
    __TAURI_INTERNALS__: { metadata: { currentWebview: { label: boot.mode === "admin" ? "admin" : "main" } }, invoke: answer, transformCallback: () => 1 },
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
    sessionStorage: store(),
    location: { href: "https://tauri.localhost/", origin: "https://tauri.localhost", hostname: "tauri.localhost" },
    navigator: {},
    URL,
    console: consoleImpl || Object.create(console), // the shim wraps warn / error: never the real console
    Promise,
    Uint8Array,
    ArrayBuffer,
  };
  // Same order as Tauri: plugin init scripts (premium-shim.js) run before the window's own.
  vm.createContext(ctx);
  vm.runInContext(premiumShimSrc, ctx, { filename: "premium-shim.js" });
  window.__TAURI__ = tauriGlobal;
  vm.runInContext(shimSrc, ctx, { filename: "electron-api-shim.js" });
  const emit = (event, payload) => (listeners.get(event) || []).forEach((h) => h({ payload }));
  const dispatch = (type, ev) => { for (const l of winListeners.get(type) || []) l.fn(ev); return ev; };
  return { api: window.electronAPI, premium: window.descallPremium, window, invokes, listeners, unlistened, emit, ctx, dispatch, winListeners };
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
  assert.equal(s.window.__DESCALL_BOOT__.token, undefined, "the token is not left on window");
  assert.equal(s.window.__DESCALL_BOOT__.version, "4.0.0", "other boot values stay");
  assert.ok(Object.isFrozen(s.window.__DESCALL_BOOT__));
  assert.ok(!JSON.stringify(s.window.__DESCALL_BOOT__).includes("boot.tok.en"));
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
  // Selected text on plain content: Electron's menu offered Copy; WebView2's is trimmed to it.
  s.window.getSelection = () => ({ toString: () => "selected words" });
  assert.equal(s.dispatch("contextmenu", ev({ target: el("DIV") })).defaultPrevented, false, "selected text keeps a (Copy) menu");
  s.window.getSelection = () => ({ toString: () => "   " });
  assert.equal(s.dispatch("contextmenu", ev({ target: el("DIV") })).defaultPrevented, true, "a blank selection does not");
  delete s.window.getSelection;
  const webviewRsMenu = readFileSync(join(here, "..", "src-tauri", "src", "webview.rs"), "utf8");
  assert.match(webviewRsMenu, /HasSelection/, "WebView2 keeps the menu for selected text");
  assert.match(webviewRsMenu, /context_menu_keep/, "WebView2 menu trimmed to Electron's items");
  const clipRs = readFileSync(join(here, "..", "..", "crates", "descall-shell", "src", "clipboard.rs"), "utf8");
  assert.match(clipRs, /"undo" \| "redo" \| "cut" \| "copy" \| "paste"/, "editable fields: undo, redo, cut, copy, paste");
  const key = (k, mods = {}) => s.dispatch("keydown", ev({ key: k, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods })).defaultPrevented;
  for (const [k, m] of [["F5"], ["r", { ctrlKey: true }], ["R", { ctrlKey: true, shiftKey: true }], ["ArrowLeft", { altKey: true }], ["ArrowRight", { altKey: true }], ["p", { ctrlKey: true }], ["BrowserBack"], ["I", { ctrlKey: true, shiftKey: true }], ["F12"]]) {
    assert.equal(key(k, m), true, `${k} ${JSON.stringify(m || {})} blocked`);
  }
  for (const [k, m] of [["c", { ctrlKey: true }], ["v", { ctrlKey: true }], ["x", { ctrlKey: true }], ["a", { ctrlKey: true }], ["z", { ctrlKey: true }], ["k", { ctrlKey: true }], ["ArrowLeft"], ["Enter"]]) {
    assert.equal(key(k, m), false, `${k} ${JSON.stringify(m || {})} stays with the app`);
  }
  assert.equal(s.dispatch("mouseup", ev({ button: 3 })).defaultPrevented, true, "mouse back button does not navigate");
  // F11: maximize / restore like Electron's windowKeys.cjs (never on repeat or with modifiers).
  const toggles = () => s.invokes.filter((c) => c[0] === "window_toggle_maximize").length;
  assert.equal(key("F11"), true, "F11 handled");
  assert.equal(toggles(), 1, "F11 toggles maximize");
  key("F11", { repeat: true });
  key("F11", { shiftKey: true });
  key("F11", { altKey: true });
  key("F11", { ctrlKey: true });
  assert.equal(toggles(), 1, "not on auto-repeat or with a modifier");
  // F12 / Ctrl+Shift+I ask the shell for DevTools (it opens them only with the opt-in).
  const devtools = () => s.invokes.filter((c) => c[0] === "window_toggle_devtools").length;
  assert.equal(devtools(), 2, "F12 and Ctrl+Shift+I (pressed above) ask for DevTools");
  key("F12", { repeat: true });
  key("F12", { ctrlKey: true });
  key("I", { ctrlKey: true, shiftKey: true, altKey: true });
  key("i", { ctrlKey: true });
  assert.equal(devtools(), 2, "not on repeat, with Ctrl on F12, with Alt, or without Shift");
  const windowRs = readFileSync(join(here, "..", "src-tauri", "src", "commands", "window.rs"), "utf8");
  assert.match(windowRs, /fn window_toggle_devtools[\s\S]*?if !crate::webview::devtools_allowed\(/, "DevTools toggle is gated by the opt-in");
  assert.match(mainRs, /commands::window::window_toggle_devtools,/, "DevTools toggle registered");
  const srcDir = join(here, "..", "src-tauri", "src");
  const rsFiles = readdirSync(srcDir, { recursive: true }).map(String).filter((f) => f.endsWith(".rs"));
  let builderFiles = 0;
  for (const f of rsFiles) {
    const rs = readFileSync(join(srcDir, f), "utf8");
    if (rs.includes("WebviewWindowBuilder::new(")) builderFiles += 1;
    const builders = rs.split("WebviewWindowBuilder::new(").length - 1;
    const set = rs.split(".devtools(crate::webview::devtools_allowed(").length - 1;
    assert.equal(set, builders, `${f}: every webview sets devtools from the opt-in (the tauri devtools feature defaults to on)`);
  }
  assert.ok(builderFiles >= 10, `window builders found (${builderFiles})`);
  // Sign out (secure-token:clear) resets the Descall+ gate, as Electron's gate.reset().
  const systemRs = readFileSync(join(srcDir, "commands", "system.rs"), "utf8");
  assert.match(systemRs, /fn token_clear[\s\S]*?crate::premium::signed_out\(\);/, "token_clear resets the Descall+ gate");
  assert.ok(s.ctx.document.documentElement.classList._s.has("tauri-app"), "html.tauri-app marks the Tauri shell");
  const webviewRs = readFileSync(join(here, "..", "src-tauri", "src", "webview.rs"), "utf8");
  assert.match(webviewRs, /SetAreBrowserAcceleratorKeysEnabled\(false\)/, "WebView2 browser accelerator keys off");
  assert.match(webviewRs, /add_ContextMenuRequested/, "WebView2 context menu handler installed");
  assert.match(mainRs, /webview::install_browser_guards\(&w\)/, "main window gets the WebView2 guards");
}
{
  // External links: after the app's own handlers (bubble on window), never over a link the
  // app cancelled (private file chip: it fetches a fresh signed URL first).
  const s = loadShim();
  const ev = (href, extra = {}) => ({
    defaultPrevented: false,
    button: 0,
    preventDefault() { this.defaultPrevented = true; },
    target: { closest: (sel) => (sel === "a[href]" && href ? { href } : null) },
    ...extra,
  });
  const opened = () => s.invokes.filter((c) => c[0] === "plugin:opener|open_url").map((c) => c[1].url);
  const clicks = s.winListeners.get("click") || [];
  assert.equal(clicks.length, 1, "one link listener on window");
  assert.equal(clicks[0].capture, false, "bubble phase: React's handlers run first");
  assert.equal(s.dispatch("click", ev("https://example.com/a")).defaultPrevented, true, "http(s) link: default browser");
  deq(opened(), ["https://example.com/a"]);
  s.dispatch("click", ev("https://example.com/cancelled", { defaultPrevented: true }));
  deq(opened(), ["https://example.com/a"], "a link the app cancelled is left alone");
  assert.equal(s.dispatch("click", ev("https://tauri.localhost/settings")).defaultPrevented, false, "app links stay in the app");
  s.dispatch("click", ev("mailto:a@b.c"));
  deq(opened(), ["https://example.com/a", "mailto:a@b.c"], "mailto opens the mail app");
  s.dispatch("click", ev("javascript:alert(1)"));
  s.dispatch("click", ev("file:///C:/x"));
  deq(opened(), ["https://example.com/a", "mailto:a@b.c"], "never javascript: or file:");

  // HTML5 drag and drop reaches the page (files into chats, reordering): Tauri's own drop
  // handler swallows every drop on Windows unless it is turned off per window.
  assert.match(mainRs, /\.disable_drag_drop_handler\(\)/, "main window: HTML5 drag and drop");
  // No WebView2 autofill dropdown under the app's fields (wry turns it on by default).
  assert.match(mainRs, /\.general_autofill_enabled\(false\)/, "main window: no browser autofill");
  for (const f of ["admin.rs", "premium/features/multi_account.rs", "premium/features/multi_window.rs"]) {
    const src = readFileSync(join(here, "..", "src-tauri", "src", f), "utf8");
    assert.match(src, /\.disable_drag_drop_handler\(\)/, `${f}: HTML5 drag and drop`);
    assert.match(src, /\.general_autofill_enabled\(false\)/, `${f}: no browser autofill`);
  }
  // <a download> / blob: exports land in Downloads and show in Explorer (downloadFile's way),
  // never in WebView2's Edge download bubble.
  assert.match(mainRs, /\.on_download\(webview::on_download\)/, "main window: page downloads handled by the shell");
  assert.match(readFileSync(join(here, "..", "src-tauri", "src", "admin.rs"), "utf8"), /\.on_download\(crate::webview::on_download\)/, "admin windows: exports handled by the shell");
  const webviewRsDl = readFileSync(join(here, "..", "src-tauri", "src", "webview.rs"), "utf8");
  // Permissions Electron refused without asking are refused, not left to WebView2's prompt.
  assert.match(webviewRsDl, /SetState\(COREWEBVIEW2_PERMISSION_STATE_DENY\)/, "no Edge permission prompts over the app");
  assert.match(webviewRsDl, /unique_path\(/, "downloads never overwrite a file");
  assert.match(webviewRsDl, /reveal_item_in_dir/, "the finished file is shown in Explorer");
  // IPC: with use_https_scheme(true) Tauri's invoke fetches https://ipc.localhost/<cmd>. A CSP
  // with only http://ipc.localhost blocked it (a securitypolicyviolation on every start) and
  // Tauri fell back to the slower postMessage IPC (binary bodies as JSON number arrays).
  const conf = JSON.parse(readFileSync(join(here, "..", "src-tauri", "tauri.conf.json"), "utf8"));
  assert.match(mainRs, /\.use_https_scheme\(true\)/);
  assert.ok(conf.app.security.csp["connect-src"].split(/\s+/).includes("https://ipc.localhost"), "app CSP allows the https IPC origin");
  const pagesRs = readFileSync(join(here, "..", "..", "crates", "descall-shell", "src", "pages.rs"), "utf8");
  const overlayRs = readFileSync(join(here, "..", "src-tauri", "src", "premium", "overlay.rs"), "utf8");
  const trayHtml = readFileSync(join(here, "..", "..", "..", "frontend", "public", "tray-menu", "tray-menu.html"), "utf8");
  for (const [name, src] of [["shell pages (pages.rs)", pagesRs], ["Descall+ overlay", overlayRs], ["tray menu page", trayHtml]]) {
    assert.match(src, /connect-src ipc: http:\/\/ipc\.localhost https:\/\/ipc\.localhost/, `${name}: https IPC origin in connect-src`);
  }
  // Descall+ portal windows (call, sidebar): links go to the browser, never a bare popup.
  assert.match(readFileSync(join(here, "..", "src-tauri", "src", "premium", "wins.rs"), "utf8"), /\.on_navigation\(\|u\| u\.scheme\(\) == "about"\)\s*\/\/[^\n]*\n(\s*\/\/[^\n]*\n)*\s*\.on_new_window\(/, "portal windows handle new-window requests");
  // Electron denied a plain about:blank window.open (only Descall+ portals and admin pages open).
  assert.doesNotMatch(mainRs, /url\.as_str\(\) == "about:blank"/, "no empty about:blank windows");
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
    deq(got[0][1], { v: 1 }, `${k} keeps Electron's (event, info) callback shape`);
  } else if (k === "onMaximizedChange" || k === "onReducedTransparencyChange") {
    deq(got[got.length - 1], [true], `${k} passes a boolean`);
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

// Page warnings / errors to main.log (app_log), like Electron's console-message logging.
{
  const sink = [];
  const s = loadShim({ boot: { version: "4.0.0" }, consoleImpl: { warn: (...a) => sink.push(["warn", a]), error: (...a) => sink.push(["error", a]), log() {} } });
  s.ctx.console.warn("[Shop] empty", { a: 1 });
  s.ctx.console.error(new Error("boom"));
  const logs = () => s.invokes.filter((c) => c[0] === "app_log").map((c) => c[1]);
  deq(logs(), [{ level: "warn", message: '[Shop] empty {"a":1}' }, { level: "error", message: "Error: boom" }], "console warn / error reach app_log");
  assert.equal(sink.length, 2, "the page's own console still prints");
  s.dispatch("error", { message: "x is not defined", filename: "https://tauri.localhost/assets/index.js?v=1", lineno: 7 });
  assert.equal(logs()[2].message, "uncaught: x is not defined @ https://tauri.localhost/assets/index.js:7");
  s.dispatch("unhandledrejection", { reason: new Error("nope") });
  assert.equal(logs()[3].message, "unhandled rejection: Error: nope");
  for (let i = 0; i < 200; i++) s.ctx.console.warn("spam", i);
  assert.equal(logs().length, 80, "at most 80 lines per page load");
}

// HUD bridge (premium-hud-shim.js): an unsubscribe before listen() resolved must still unlisten.
{
  const hudSrc = readFileSync(join(here, "premium-hud-shim.js"), "utf8");
  let resolveListen;
  const unlistened = [];
  const handlers = [];
  const window = {
    __TAURI__: {
      core: { invoke: () => Promise.resolve(null) },
      event: { listen: (event, h) => { handlers.push(h); return new Promise((r) => { resolveListen = () => r(() => unlistened.push(event)); }); } },
    },
  };
  window.top = window;
  const ctx = { window, document: { addEventListener() {} }, Promise, Set, String, Array };
  vm.createContext(ctx);
  vm.runInContext(hudSrc, ctx, { filename: "premium-hud-shim.js" });
  const seen = [];
  const off = window.descallHud.onState((s) => seen.push(s));
  off();
  resolveListen();
  await tick();
  deq(unlistened, ["descall:hud:state"], "early unsubscribe still removes the listener");
  const off2 = window.descallHud.onState((s) => seen.push(s));
  resolveListen();
  await tick();
  handlers[1]({ payload: { a: 1 } });
  deq(seen, [{ a: 1 }]);
  off2();
  deq(unlistened, ["descall:hud:state", "descall:hud:state"]);
  assert.equal(typeof window.descallHud.onState(null), "function", "a non-function callback gets a no-op unsubscribe");
}

console.log("electron-api-shim.test: ok");
