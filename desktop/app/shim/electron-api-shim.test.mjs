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
function loadShim({ boot = {}, responses = {}, fail = [], realOrder = false, consoleImpl = null, label = boot.mode === "admin" ? "admin" : "main", session = null } = {}) {
  const invokes = [];
  const winListeners = new Map();
  const listeners = new Map();
  const unlistened = [];
  const store = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), _m: m }; };
  const answer = (cmd, args) => {
    invokes.push([cmd, args]);
    if (fail.includes(cmd)) return Promise.reject(new Error(`${cmd} failed`));
    const r = typeof responses[cmd] === "function" ? responses[cmd](args) : responses[cmd];
    return Promise.resolve(r ?? null);
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
    console: consoleImpl || Object.create(console), // the shim wraps warn / error: never the real console
    Promise,
    Uint8Array,
    ArrayBuffer,
    setTimeout,
    clearTimeout,
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
// descall:// links (src/lib/desktopDeepLinks.js): extras, so the Electron key set stays equal.
{
  const s = loadShim({ responses: { deep_link_take: "descall://dm/ayse" } });
  assert.equal(await s.api.takeDeepLink(), "descall://dm/ayse");
  deq(s.invokes.at(-1), ["deep_link_take", undefined], "takeDeepLink -> deep_link_take");
  const got = [];
  const off = s.api.onDeepLink((...a) => got.push(a));
  await tick();
  s.emit("app:deep-link", null);
  deq(got, [[undefined]], "onDeepLink is a bare signal: the page takes the link");
  off();
  assert.ok(s.unlistened.includes("app:deep-link"));
  const none = loadShim({ responses: { deep_link_take: null } });
  assert.equal(await none.api.takeDeepLink(), null);
  const failing = loadShim({ fail: ["deep_link_take"] });
  assert.equal(await failing.api.takeDeepLink(), null, "a failing command answers null");
  const admin = loadShim({ boot: { mode: "admin" } });
  assert.equal(await admin.api.takeDeepLink(), null);
  assert.equal(typeof admin.api.onDeepLink(() => {}), "function");
  await tick();
  deq(admin.invokes, [], "admin windows never take links");
}
// Installer hooks: the Start Menu shortcut gets the toast activator CLSID (installer.nsh
// Descall_SetToastClsid), the same CLSID as src/premium/toast.rs and the Electron installer.
{
  const hooks = readFileSync(join(here, "..", "src-tauri", "nsis", "hooks.nsh"), "utf8");
  const toastRs = readFileSync(join(here, "..", "src-tauri", "src", "premium", "toast.rs"), "utf8");
  const electronNsh = readFileSync(join(here, "..", "..", "..", "frontend", "electron", "installer.nsh"), "utf8");
  const clsid = (src, re) => (src.match(re) || [])[1];
  const ours = clsid(hooks, /!define DESCALL_TOAST_CLSID "(\{[0-9A-F-]+\})"/i);
  assert.equal(ours, clsid(toastRs, /TOAST_CLSID: &str = "(\{[0-9A-F-]+\})"/i), "hooks.nsh and toast.rs share the CLSID");
  assert.equal(ours, clsid(electronNsh, /!define DESCALL_TOAST_CLSID "(\{[0-9A-F-]+\})"/i), "same CLSID as the Electron installer");
  const post = hooks.slice(hooks.indexOf("!macro NSIS_HOOK_POSTINSTALL"), hooks.indexOf("!macroend", hooks.indexOf("!macro NSIS_HOOK_POSTINSTALL")));
  assert.match(post, /!insertmacro DESCALL_SET_TOAST_CLSID "\$SMPROGRAMS\\Descall\.lnk"/, "post-install stamps the Start Menu shortcut");
  const macro = hooks.slice(hooks.indexOf("!macro DESCALL_SET_TOAST_CLSID"), hooks.indexOf("!macroend", hooks.indexOf("!macro DESCALL_SET_TOAST_CLSID")));
  // PKEY_AppUserModel_ToastActivatorCLSID = {9F4C2855-...}, 26 as VT_CLSID (72), then Commit and Save.
  assert.match(macro, /\{9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3\}", i 26/);
  assert.match(macro, /&i2 72/);
  assert.match(macro, /\$3->7\(\)/);
  assert.match(macro, /\$2->6\(p 0, i 1\)/);
  const pushes = (macro.match(/^\s*Push \$\d/gm) || []).length;
  const pops = (macro.match(/^\s*Pop \$\d/gm) || []).length;
  assert.equal(pushes, pops, "registers restored");
}
// Update errors carry main.cjs's phase ('check' stays quiet in ElectronUpdateToast, 'download'
// shows the retry card) and check-for-updates answers `available` like Electron.
{
  const updatesRs = readFileSync(join(here, "..", "src-tauri", "src", "commands", "updates.rs"), "utf8");
  // One payload helper (T1 error_payload) with T6's scrubbed text (error_message).
  assert.match(updatesRs, /"update:error", error_payload\(&e, phase\)/);
  assert.match(updatesRs, /fn error_payload\(message: &str, phase: &'static str\) -> Value \{\s*json!\(\{ "message": error_message\(message\), "phase": phase \}\)/);
  assert.match(updatesRs, /map_err\(\|e\| \("download", e\.to_string\(\)\)\)/);
  assert.match(updatesRs, /Ok\(check_result\(version, ready, v\)\)/);
}
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
  // Signing out also stops the Descall+ desktop features (Electron: gate.reset()).
  const signOut = cmd === "token_clear" ? [["premium_invoke", { channel: "premium:entitlements", args: [{ keys: [], plan: null, token: "" }] }]] : [];
  deq(s.invokes.slice(1), signOut, `${path}: Descall+ sign-out push`);
  s.invokes.splice(1);
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
  // No native lane: no list, so the page opens one picker (WebView2's) instead of ours + WebView2's.
  deq(await s.api.getScreenSources(), []);
  s.window.__descallNativeShare = { supported: false, getSources: () => Promise.resolve([{ id: "screen:0:0", name: "x" }]) };
  deq(await s.api.getScreenSources(), [], "native lane without shared buffers: same");
  const native = { supported: true, getSources: () => s.window.__TAURI_INTERNALS__.invoke("screen_sources") };
  s.window.__descallNativeShare = native;
  deq(await s.api.getScreenSources(), [{ id: "screen:0:0", name: "Ekran 1", thumbnailDataURL: "data:image/jpeg;base64,x", appIconDataURL: null }]);
  assert.ok(s.invokes.some((c) => c[0] === "screen_sources"), "the native lane lists through screen_sources");
  called.add("screen_sources");
  // With the native lane present, selection goes there.
  let picked = null;
  s.window.__descallNativeShare = { supported: true, getSources: () => Promise.resolve([]), select: (id) => { picked = id; return Promise.resolve(true); } };
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
  // Descall+ state pushes made before the shell's own membership check passed ("locked")
  // are sent again once the feature runs (command center / workspace hotkeys stayed dead).
  let running = [];
  const answers = [];
  const s = loadShim({
    realOrder: true,
    responses: {
      premium_invoke: ({ channel, args }) => {
        if (channel === "premium:status") return { ok: true, keys: running, running };
        const r = running.includes(channel.split(":")[1]) ? { ok: true, hotkey: args[0] } : { ok: false, error: "locked" };
        answers.push([channel, args[0], r.ok]);
        return r;
      },
    },
  });
  assert.equal((await s.premium.invoke("premium:command_center:hotkey", "CommandOrControl+Shift+K")).error, "locked", "the renderer still sees the first answer");
  await s.premium.invoke("premium:command_center:hotkey", "CommandOrControl+Alt+K"); // newer state wins
  await s.premium.invoke("premium:global_mute:status"); // not a state push: never replayed
  running = ["command_center", "global_mute"];
  await new Promise((r) => setTimeout(r, 1150));
  await tick(); await tick();
  deq(answers.filter((a) => a[2]), [["premium:command_center:hotkey", "CommandOrControl+Alt+K", true]], "the newest hotkey is registered once the feature runs");
  const statusPolls = s.invokes.filter((c) => c[1] && c[1].channel === "premium:status").length;
  await new Promise((r) => setTimeout(r, 1700));
  assert.equal(s.invokes.filter((c) => c[1] && c[1].channel === "premium:status").length, statusPolls, "polling stops when nothing waits");
  assert.ok(!answers.some((a) => a[0] === "premium:global_mute:status" && a[2]), "status reads are not replayed");
  // Signing out drops what waits: nothing of that session is sent again later.
  running = [];
  await s.premium.invoke("premium:focus_mode:state", { until: 0 });
  await s.premium.invoke("premium:entitlements", { keys: [], plan: null, token: "" });
  running = ["focus_mode"];
  await new Promise((r) => setTimeout(r, 1150));
  assert.ok(!answers.some((a) => a[0] === "premium:focus_mode:state" && a[2]), "no resend after sign-out");
}
{
  // Switching a feature on: later calls wait for the settings:set, and a "locked" answer right
  // after it (host still starting the feature on its bus thread) is retried.
  let started = false;
  const order = [];
  let releaseSet;
  const s = loadShim({
    responses: {
      premium_invoke: ({ channel, args }) => {
        order.push(channel);
        if (channel === "premium:settings:set") {
          return new Promise((r) => { releaseSet = () => { setTimeout(() => { started = true; }, 200); r({ ok: true, settings: args[1] }); }; });
        }
        if (channel === "premium:global_ptt:status") return started ? { ok: true, mode: "hold" } : { ok: false, error: "locked" };
        return { ok: true };
      },
    },
  });
  const set = s.premium.invoke("premium:settings:set", "global_ptt", { enabled: true });
  const status = s.premium.invoke("premium:global_ptt:status");
  await tick(); await tick();
  deq(order, ["premium:settings:set"], "the status read waits for the settings:set in flight");
  releaseSet();
  await set;
  deq(await status, { ok: true, mode: "hold" }, "locked right after switching on is retried until the feature runs");
  assert.ok(order.filter((c) => c === "premium:global_ptt:status").length >= 2, "retried");
  started = false;
  await new Promise((r) => setTimeout(r, 2100));
  const before = order.length;
  deq(await s.premium.invoke("premium:global_ptt:status"), { ok: false, error: "locked" }, "no retries long after a settings:set");
  assert.equal(order.length, before + 1);
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
  s.window.getSelection = () => { throw new Error("detached"); };
  assert.equal(s.dispatch("contextmenu", ev({ target: el("DIV") })).defaultPrevented, true, "no selection API: no menu");
  delete s.window.getSelection;
  const webviewRsMenu = readFileSync(join(here, "..", "src-tauri", "src", "webview.rs"), "utf8");
  assert.match(webviewRsMenu, /HasSelection/, "WebView2 keeps the menu for selected text");
  assert.match(webviewRsMenu, /descall_shell::clipboard::electron_menu_items\(/, "WebView2 menu trimmed to Electron's items");
  const clipRs = readFileSync(join(here, "..", "..", "crates", "descall-shell", "src", "clipboard.rs"), "utf8");
  assert.match(clipRs, /"undo" \| "redo" \| "cut" \| "copy" \| "paste"/, "editable fields: undo, redo, cut, copy, paste");
  const key = (k, mods = {}) => s.dispatch("keydown", ev({ key: k, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods })).defaultPrevented;
  for (const [k, m] of [["F5"], ["r", { ctrlKey: true }], ["R", { ctrlKey: true, shiftKey: true }], ["ArrowLeft", { altKey: true }], ["ArrowRight", { altKey: true }], ["p", { ctrlKey: true }], ["BrowserBack"], ["I", { ctrlKey: true, shiftKey: true }], ["F12"]]) {
    assert.equal(key(k, m), true, `${k} ${JSON.stringify(m || {})} blocked`);
  }
  for (const [k, m] of [["c", { ctrlKey: true }], ["v", { ctrlKey: true }], ["x", { ctrlKey: true }], ["a", { ctrlKey: true }], ["z", { ctrlKey: true }], ["k", { ctrlKey: true }], ["ArrowLeft"], ["Enter"]]) {
    assert.equal(key(k, m), false, `${k} ${JSON.stringify(m || {})} stays with the app`);
  }
  // F11 toggles maximize like windowKeys.cjs; with a modifier or on auto-repeat it does nothing.
  s.invokes.length = 0;
  assert.equal(key("F11"), true, "F11 handled");
  deq(s.invokes.map((c) => c[0]), ["window_toggle_maximize"], "F11 toggles maximize");
  s.invokes.length = 0;
  for (const m of [{ ctrlKey: true }, { shiftKey: true }, { altKey: true }, { repeat: true }]) key("F11", m);
  deq(s.invokes, [], "F11 with a modifier or auto-repeat does not maximize");
  assert.equal(s.dispatch("mouseup", ev({ button: 3 })).defaultPrevented, true, "mouse back button does not navigate");
  // (F11 is covered just above: T1 and T8 both tested it; one copy kept.)
  // F12 / Ctrl+Shift+I ask the shell for DevTools (it opens them only with the opt-in).
  const devtools = () => s.invokes.filter((c) => c[0] === "window_toggle_devtools").length;
  s.invokes.length = 0;
  key("F12");
  key("I", { ctrlKey: true, shiftKey: true });
  assert.equal(devtools(), 2, "F12 and Ctrl+Shift+I ask for DevTools");
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
  // Electron's native menu, not WebView2's (Emoji, Share, Web capture, Inspect...), and no
  // autofill pop-ups under the login / search fields (Electron never showed any).
  // One rule (descall_shell::clipboard, Rust-tested): context_menu_keep + electron_menu_items.
  const clipRsMenu = readFileSync(join(here, "..", "..", "crates", "descall-shell", "src", "clipboard.rs"), "utf8");
  assert.match(clipRsMenu, /matches!\(name, "undo" \| "redo" \| "cut" \| "copy" \| "paste" \| "selectAll"\)/, "Electron's edit menu");
  assert.match(webviewRs, /electron_menu_items\(editable\.as_bool\(\), selection\.as_bool\(\), &items\)/, "menu trimmed per target");
  assert.match(webviewRs, /menu\.RemoveValueAtIndex\(i\)\?/, "the extra WebView2 items are removed");
  assert.match(webviewRs, /SetIsPasswordAutosaveEnabled\(false\)/, "WebView2 password saving off");
  const adminRs = readFileSync(join(here, "..", "src-tauri", "src", "admin.rs"), "utf8");
  assert.match(adminRs, /crate::webview::install_browser_guards\(&win\)/, "admin windows get the same WebView2 guards");
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
    // preload.cjs: handler = (_, data) => callback(data). The shim used to pass a fake
    // (event, info) pair and return nothing.
    deq(got[0], [{ v: 1 }], `${k} passes the payload like preload.cjs`);
    assert.equal(typeof off, "function", `${k} returns an unsubscribe function`);
  } else if (k === "onMaximizedChange" || k === "onReducedTransparencyChange") {
    deq(got[got.length - 1], [true], `${k} passes a boolean`);
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
  // onMaximizedChange answers its own window's state at subscribe time (window-shim.test.mjs);
  // only what arrives after that counts here.
  got.length = 0;
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
  got.length = 0; // the subscribe-time state of its own window (window-shim.test.mjs)
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
  const caps = ["default.json", "shell.json", "tray-menu.json"].map((f) => JSON.parse(readFileSync(join(capDir, f), "utf8")));
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
    "shell-overlay.js": ["overlay", "overlay-3"],
    "tray-menu-shim.js": ["tray-menu"],
  };
  const PLUGIN_PERM = {
    "plugin:window|minimize": "core:window:allow-minimize",
    "plugin:window|toggle_maximize": "core:window:allow-toggle-maximize",
    "plugin:window|is_maximized": "core:window:allow-is-maximized",
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
  // Labels built from a prefix constant (the in-call mini card is overlay-<n>, T4).
  for (const m of rs.matchAll(/const LABEL_PREFIX: &str = "([a-z-]+)-"/g)) labels.add(`${m[1]}-1`);
  // format!("x-{...}") builds window labels, except these secret-store / log keys.
  const NOT_WINDOWS = new Set(["account", "http"]);
  for (const m of rs.matchAll(/format!\("([a-z]+)-\{/g)) if (!NOT_WINDOWS.has(m[1])) labels.add(`${m[1]}-1`);
  for (const m of rs.matchAll(/Some\(\("([a-z-]+)", (?:STATS|PANEL)_PATH/g)) labels.add(m[1]);
  for (const want of ["overlay-1", "launcher", "tray-menu", "admin", "signup-stats", "notif-1", "popout-1", "acct-1", "hud-1", "widget-1"]) {
    assert.ok(labels.has(want), `window label ${want} found in the Rust sources`);
  }
  for (const label of labels) assert.equal(capsFor(label).length, 1, `${label} is covered by exactly one capability`);
}


// 3f. Shell-side event parity with main.cjs (read from the Rust sources) ----------------------
{
  const src = join(here, "..", "src-tauri", "src");
  const stateRs = readFileSync(join(src, "state.rs"), "utf8");
  const at = stateRs.indexOf("pub fn show_main");
  const showMain = stateRs.slice(at, stateRs.indexOf("\n}\n", at));
  // mainWindow.on('show') sent app:visibility false and the content box; focus alone was not
  // enough (Windows can refuse it after a tray / notification click: animations stayed paused).
  assert.match(showMain, /to_main\(app, "app:visibility", serde_json::json!\(\{ "backgrounded": false \}\)\)/, "show_main: app:visibility false");
  assert.match(showMain, /to_main\(app, "window:content-box"/, "show_main: content box");
  const bootRs = readFileSync(join(src, "boot.rs"), "utf8");
  assert.match(bootRs, /WindowEvent::Moved\(_\) => \{\s*publish_content_box\(&win\);\s*save_window_state_soon\(&win\);/, "a drag saves the window state debounced");
  assert.ok(!/WindowEvent::Moved\(_\) => \{[^}]*save_window_state\(&win\)/.test(bootRs), "not on every Moved event");
  const updatesRs = readFileSync(join(src, "commands", "updates.rs"), "utf8");
  assert.match(updatesRs, /"available": version\.is_some\(\) \|\| ready/, "check-for-updates answers available");
  assert.match(updatesRs, /"phase": phase/, "update:error carries the phase");
  assert.match(updatesRs, /map_err\(\|e\| \("download", e\.to_string\(\)\)\)/, "a failed download is phase download");
  const appRs = readFileSync(join(src, "commands", "app.rs"), "utf8");
  assert.match(appRs, /descall_shell::bridge::sets_ui_locale\(window\.label\(\)\)/, "admin windows may set the language (main.cjs app:locale)");
  const adminRs = readFileSync(join(src, "admin.rs"), "utf8");
  assert.match(adminRs, /install_browser_guards\(&win\)/, "admin windows get the WebView2 browser guards");
  assert.match(adminRs, /is_safe_external_url\((?:url|next)\.as_str\(\)\)[\s\S]{0,200}open_url/, "admin window.open opens the default browser");
  const overlayRs = readFileSync(join(src, "commands", "overlay.rs"), "utf8");
  for (const cmd of ["overlay_show", "overlay_update", "overlay_hide"]) {
    const at = overlayRs.search(new RegExp(`pub (?:async )?fn ${cmd}<`));
    assert.ok(at > 0 && /if !from_main\(&window\) \{\s*return;/.test(overlayRs.slice(at, at + 300)), `${cmd}: only the main window drives the voice overlay`);
  }
  const mainRsSrc = readFileSync(join(src, "main.rs"), "utf8");
  // One panic pipeline (T6 errors.rs): the hook hands the panic to errors::on_panic, which
  // builds a mainErrors.cjs summary (main_errors::panic_summary, paths scrubbed) and emits it
  // as app:main-error (or writes the crash file when the release build aborts).
  assert.match(mainRsSrc, /set_hook\(Box::new\(move \|info\| \{[\s\S]{0,120}errors::on_panic\(info\);/, "panics reach onMainError as a mainErrors.cjs summary");
  const errorsRs = readFileSync(join(src, "errors.rs"), "utf8");
  assert.match(errorsRs, /main_errors::panic_summary\(/);
  assert.match(errorsRs, /to_main\(&h, "app:main-error", s\.clone\(\)\)/);
  // will-navigate (main.cjs): a non-app URL is cancelled and a web or mail link goes to the browser.
  assert.match(mainRsSrc, /\.on_navigation\(\{\s*let app = handle\.clone\(\);\s*move \|url\| boot::main_navigation\(&app, url\)/, "main window navigation goes through main_navigation");
  const navAt = bootRs.indexOf("pub fn main_navigation");
  const nav = bootRs.slice(navAt, bootRs.indexOf("\n}\n", navAt));
  assert.match(nav, /if is_app_url\(url\) \{\s*return true;/, "the app navigates in place");
  assert.match(nav, /is_safe_external_url\(url\.as_str\(\)\)[\s\S]{0,120}open_url\(url\.as_str\(\)/, "a safe external URL opens in the default browser");
  assert.match(nav, /\n    false$/, "and the window itself never leaves the app");
  // nativeTheme 'updated' reached every window (getAllWindows), admin and Descall+ windows too.
  const watchAt = bootRs.indexOf("pub fn watch_reduced_transparency");
  const watch = bootRs.slice(watchAt, bootRs.indexOf("\n}\n", watchAt));
  assert.match(watch, /app\.emit\("native-theme:reduced-transparency-changed", now\)/, "reduced transparency change goes to every window");
  assert.ok(!/to_main\(&app, "native-theme/.test(watch), "not to the main window only");
  // mainWindow 'minimize' / 'restore': backgrounded true once, then false on restore even
  // when Windows does not give the restored window the focus.
  const resizedAt = bootRs.indexOf("WindowEvent::Resized(_) =>");
  const resized = bootRs.slice(resizedAt, bootRs.indexOf("WindowEvent::Moved", resizedAt));
  assert.match(resized, /minimized\.swap\(minimized,/, "the minimized state is tracked");
  assert.match(resized, /if !was_minimized \{\s*visibility\(&win, true\);/, "minimize: backgrounded");
  assert.match(resized, /if was_minimized(?: && win\.is_visible\(\)\.unwrap_or\(false\))? \{\s*visibility\(&win, false\);/, "restore: not backgrounded");
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
{
  // Free-form Descall+ hotkeys (command center, workspace profiles, media keys, clip) never take
  // an accelerator away from another feature (Electron compat.cjs only replaced its own).
  const hk = readFileSync(join(here, "..", "src-tauri", "src", "premium", "hotkeys.rs"), "utf8");
  const at = hk.indexOf("pub fn register_extra");
  const body = hk.slice(at, hk.indexOf("pub fn unregister_owner", at));
  assert.ok(at > 0 && /let mine = [^;]*extras\.get\(owner\)/.test(body), "register_extra checks this owner's own list");
  assert.match(body, /\} else if self\.gs\(\)\.is_registered\(p\.as_str\(\)\) \{\s*return false;\s*\}/, "an accelerator held elsewhere is refused, not unregistered");
}
{
  // Quick launcher window: same members and channels as launcherPreload.cjs, also when the
  // global API bundle (window.__TAURI__) does not exist yet.
  const exposed = {};
  const ipcCalls = [];
  const electron = {
    contextBridge: { exposeInMainWorld: (n, api) => { exposed[n] = api; } },
    ipcRenderer: { invoke: (ch, ...a) => { ipcCalls.push([ch, a]); return Promise.resolve(null); }, on: (ch) => ipcCalls.push(["on", ch]) },
  };
  vm.runInNewContext(readFileSync(join(electronDir, "premium", "launcher", "launcherPreload.cjs"), "utf8"), { require: () => electron, String, Boolean });
  const src = readFileSync(join(here, "premium-launcher-shim.js"), "utf8");
  for (const withGlobal of [false, true]) {
    const invokes = [];
    const answer = (cmd, args) => { invokes.push([cmd, args]); return Promise.resolve(cmd === "plugin:event|listen" ? 1 : null); };
    const handlers = [];
    const window = { __TAURI_INTERNALS__: { invoke: answer, transformCallback: (fn) => { handlers.push(fn); return handlers.length; } } };
    if (withGlobal) window.__TAURI__ = { core: { invoke: answer }, event: { listen: (event, h) => { handlers.push(h); invokes.push(["listen", { event }]); return Promise.resolve(() => {}); } } };
    window.top = window;
    vm.runInNewContext(src, { window, String, Boolean, Object, Promise });
    const api = window.launcherAPI;
    assert.ok(api, `launcherAPI exists (global bundle: ${withGlobal})`);
    deq(Object.keys(api).sort(), Object.keys(exposed.launcherAPI).sort(), "launcherAPI members as Electron");
    await api.strings();
    await api.query("x".repeat(200));
    await api.run({ id: "srv:1", focus: 1 });
    await api.close();
    ipcCalls.length = 0;
    await exposed.launcherAPI.strings();
    await exposed.launcherAPI.query("x".repeat(200));
    await exposed.launcherAPI.run({ id: "srv:1", focus: 1 });
    await exposed.launcherAPI.close();
    const got = invokes.filter((c) => c[0] === "premium_invoke").map((c) => [c[1].channel, c[1].args]);
    deq(got, ipcCalls.map(([ch, a]) => [ch, a]), "same channels and arguments as the Electron preload");
    let reset = null;
    api.onReset((s) => { reset = s; });
    await tick();
    assert.ok(invokes.some((c) => (c[0] === "plugin:event|listen" || c[0] === "listen") && c[1].event === "premium:launcher:reset"), "onReset listens to premium:launcher:reset");
    handlers[handlers.length - 1]({ payload: { lang: "tr" } });
    deq(reset, { lang: "tr" }, "reset strings reach the page");
  }
}
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
{
  // Every window: WebView2 shares one browser process per data folder and refuses a second
  // environment with other arguments, so each builder passes BROWSER_ARGS (the Descall+ portal
  // windows reuse the opener's environment through window_features). Windows that show the app
  // or a drop zone disable Tauri's drop handler, which on Windows swallowed every HTML5 drop
  // (files onto a chat, profile picker, admin sortable lists, quick drop).
  const rs = (p) => readFileSync(join(here, "..", "src-tauri", "src", ...p.split("/")), "utf8");
  const builders = ["main.rs", "admin.rs", "tray_menu.rs", "commands/overlay.rs", "commands/notify.rs", "premium/overlay.rs", "premium/features/multi_window.rs", "premium/features/multi_account.rs", "premium/features/quick_launcher.rs", "premium/wins.rs"];
  for (const file of builders) {
    const text = rs(file);
    const chains = text.split("WebviewWindowBuilder::new(").slice(1).map((c) => c.slice(0, c.indexOf(".build()")));
    assert.ok(chains.length, `${file} builds a window`);
    for (const chain of chains) {
      if (/\.window_features\(/.test(chain)) continue;
      assert.match(chain, /\.additional_browser_args\((crate::)?BROWSER_ARGS\)/, `${file}: window without the shared WebView2 browser arguments`);
    }
  }
  for (const file of ["main.rs", "admin.rs", "premium/overlay.rs", "premium/features/multi_window.rs", "premium/features/multi_account.rs"]) {
    assert.match(rs(file), /\.disable_drag_drop_handler\(\)/, `${file}: HTML5 drag and drop reaches the page`);
  }
  // HUD / widget / quick drop pages: a CSS drag region would be a WebView2 caption over their
  // close button and target picker; premium-hud-shim.js drags them instead.
  const hud = rs("premium/hud/hud.html");
  assert.doesNotMatch(hud, /app-region\s*:\s*drag/, "no CSS drag region on the HUD pages");
  const hudShim = readFileSync(join(here, "premium-hud-shim.js"), "utf8");
  assert.match(hudShim, /closest\("\.drag"\)[\s\S]{0,80}closest\("\.nodrag, select, button, input"\)[\s\S]{0,200}startDragging\(\)/, "the HUD shim drags .drag except its controls");
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

// 6. Descall+ HUD / widget / quick drop windows (premium-hud-shim.js).
{
  const hudSrc = readFileSync(join(here, "premium-hud-shim.js"), "utf8");
  const loadHud = () => {
    const invokes = [];
    const handlers = [];
    let releaseListen;
    const listenGate = new Promise((r) => { releaseListen = r; });
    let dragged = 0;
    const docListeners = new Map();
    const appended = [];
    const doc = {
      documentElement: { appendChild: (n) => appended.push(n) },
      head: null,
      getElementById: (id) => appended.find((n) => n.id === id) || null,
      createElement: (tag) => ({ tag, id: "", textContent: "" }),
      addEventListener: (type, fn) => { if (!docListeners.has(type)) docListeners.set(type, []); docListeners.get(type).push(fn); },
    };
    const T = {
      core: { invoke: (cmd, args) => { invokes.push([cmd, args]); return Promise.resolve(cmd === "premium_blob_put" ? { __blob: 7 } : null); } },
      // Tauri's listen() is an IPC round trip: it resolves later.
      event: { listen: (ev, h) => { handlers.push([ev, h]); return listenGate.then(() => () => {}); } },
      window: { getCurrentWindow: () => ({ startDragging: () => { dragged += 1; return Promise.resolve(); } }) },
    };
    const window = { __TAURI__: T };
    window.top = window;
    const ctx = { window, document: doc, Promise, Set, String, Array, Object, console };
    vm.createContext(ctx);
    vm.runInContext(hudSrc, ctx, { filename: "premium-hud-shim.js" });
    return { hud: window.descallHud, invokes, handlers, releaseListen, appended, docListeners, dragged: () => dragged };
  };
  const flush = () => new Promise((r) => setTimeout(r, 0));
  const t = loadHud();
  t.hud.onState(() => {});
  t.hud.action("ready");
  await flush();
  assert.ok(!t.invokes.some(([c, a]) => c === "premium_hud_action" && a.kind === "ready"), "'ready' waits until the state listener is registered");
  t.releaseListen();
  await flush();
  await flush();
  deq(t.invokes.filter(([c]) => c === "premium_hud_action"), [["premium_hud_action", { kind: "ready", payload: null }]], "'ready' goes out once the listener is live");
  assert.equal(t.handlers[0][0], "descall:hud:state");
  t.hud.action("close");
  t.hud.action("evil");
  await flush();
  deq(t.invokes.filter(([c]) => c === "premium_hud_action").map(([, a]) => a.kind), ["ready", "close"], "whitelisted actions only");
  // WebView2 turns CSS drag regions into a native caption that swallows clicks inside them
  // (quick drop close button and target list): the shim switches them off and drags itself.
  const st = t.appended.find((n) => n.id === "descall-hud-tauri");
  assert.ok(st && st.textContent.includes(".drag,.drag *,.nodrag{-webkit-app-region:no-drag!important;app-region:no-drag!important}"), "no CSS drag region in HUD pages");
  const down = (target) => t.docListeners.get("mousedown").forEach((fn) => fn({ button: 0, target }));
  const el = (inDrag, onButton) => ({ closest: (sel) => (sel === ".drag" ? inDrag : onButton) });
  down(el(true, false));
  down(el(true, true));
  down(el(false, false));
  assert.equal(t.dragged(), 1, "a press on '.drag' (not on its buttons / list) moves the window");
  // Quick drop: a file the shell refuses (too large, store full) is counted, not lost silently,
  // and a drop where every upload failed still reaches the shell so the zone can say so.
  const d = loadHud();
  const big = new ArrayBuffer(4);
  d.hud.action("drop", { target: "dm:1", files: [{ name: "a.txt", type: "text/plain", size: 1, data: new ArrayBuffer(1) }, { name: "b.bin", size: 4, data: big }] });
  await flush(); await flush(); await flush();
  const drops = d.invokes.filter(([c, a]) => c === "premium_hud_action" && a.kind === "drop").map(([, a]) => a.payload);
  assert.equal(drops.length, 1, "one drop action");
  assert.equal(drops[0].files.length, 2);
  assert.equal(drops[0].skipped, 0, "nothing skipped when every upload worked");
}
{
  const hudSrc = readFileSync(join(here, "premium-hud-shim.js"), "utf8");
  const invokes = [];
  const T = {
    core: { invoke: (cmd, args) => { invokes.push([cmd, args]); return cmd === "premium_blob_put" ? Promise.reject(new Error("too-large")) : Promise.resolve(null); } },
    event: { listen: () => Promise.resolve(() => {}) },
  };
  const window = { __TAURI__: T };
  window.top = window;
  const doc = { documentElement: { appendChild() {} }, createElement: () => ({}), getElementById: () => null, addEventListener() {} };
  const ctx = { window, document: doc, Promise, Set, String, Array, Object, console };
  vm.createContext(ctx);
  vm.runInContext(hudSrc, ctx, { filename: "premium-hud-shim.js" });
  window.descallHud.action("drop", { target: "dm:1", files: [{ name: "huge.iso", size: 1, data: new ArrayBuffer(1) }] });
  for (let i = 0; i < 4; i++) await new Promise((r) => setTimeout(r, 0));
  const drops = invokes.filter(([c, a]) => c === "premium_hud_action" && a.kind === "drop").map(([, a]) => a.payload);
  deq(drops.map((p) => [p.files.length, p.skipped]), [[0, 1]], "a refused upload is reported as skipped");
}

// 7. Every shell / Descall+ window the Rust side builds (static check of the builder chains).
{
  const srcDir = join(here, "..", "src-tauri", "src");
  const rsFiles = [];
  const walkRs = (d) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) walkRs(p);
      else if (n.endsWith(".rs")) rsFiles.push(p);
    }
  };
  walkRs(srcDir);
  const chains = [];
  for (const f of rsFiles) {
    const src = readFileSync(f, "utf8");
    let at = src.indexOf("WebviewWindowBuilder::new(");
    while (at >= 0) {
      const end = src.indexOf(".build()", at);
      const chain = src.slice(at, end);
      const label = chain.match(/WebviewWindowBuilder::new\([^,]+,\s*([^,]+),/);
      chains.push({ file: f.slice(srcDir.length + 1), label: label ? label[1].trim() : "?", chain });
      at = src.indexOf("WebviewWindowBuilder::new(", end);
    }
  }
  assert.ok(chains.length >= 10, `window builders found: ${chains.length}`);
  for (const c of chains) {
    // WebView2: windows sharing the main window's user data folder with other browser
    // arguments fail to start (ERROR_INVALID_STATE): HUDs, widgets, quick drop, pop-outs and
    // the launcher never opened. Portals reuse the opener's environment (window_features).
    const ok = /\.additional_browser_args\((crate::)?BROWSER_ARGS\)/.test(c.chain) || /\.window_features\(features\)/.test(c.chain);
    assert.ok(ok, `${c.file} (${c.label}): same WebView2 environment as the main window`);
  }
  // The app origin is https://tauri.localhost. A webview only serves its custom protocols on
  // the scheme it was built with, so a portal (about:blank, the main window's origin) built on
  // http lost every font and app image it asked for. Only the HUD pages run their own
  // http://descallhud.localhost origin.
  for (const c of chains) {
    if (c.file === "premium/overlay.rs") continue;
    assert.match(c.chain, /\.use_https_scheme\(true\)/, `${c.file} (${c.label}): served on https like the main window`);
  }
  // Tauri's own file-drop handler replaces WebView2's drop target and kills HTML5 drag and
  // drop: off in every window that runs the app or the quick drop zone.
  for (const [file, why] of [["main.rs", "main window"], ["premium/features/multi_window.rs", "pop-outs"], ["premium/features/multi_account.rs", "account windows"], ["premium/overlay.rs", "quick drop / HUD windows"]]) {
    const c = chains.find((x) => x.file === file);
    assert.ok(c && /\.disable_drag_drop_handler\(\)/.test(c.chain), `${why}: HTML5 drag and drop enabled (disable_drag_drop_handler)`);
  }
  for (const file of ["premium/features/multi_window.rs", "premium/features/multi_account.rs"]) {
    const src = readFileSync(join(srcDir, file), "utf8");
    assert.match(src, /crate::webview::install_browser_guards\(&w\)/, `${file}: no browser menu / shortcuts`);
    assert.match(src, /crate::webview::install_permission_handler\(&w\)/, `${file}: media permissions as in the main window`);
  }
  // Opacity survives tao's style rewrites (show, pin, click-through, restore).
  const winsRs = readFileSync(join(srcDir, "premium", "wins.rs"), "utf8");
  assert.match(winsRs, /crate::webview::install_browser_guards\(&w\);\s*track\(h, label, kind, portal_feature\(kind\)/, "portal windows: no browser menu / reload keys");
  assert.match(winsRs, /run_on_main_thread\(move \|\| platform::set_opacity\(hw, alpha\)\)/, "opacity is queued behind tao's style changes");
  // tao rewrites the extended style on every visibility change: pop-outs (built hidden), the
  // auto-hidden sidebar and windows hidden by app_lock get their opacity again after show().
  assert.match(winsRs, /pub fn show\([^)]*\) \{\s*let _ = w\.show\(\);[\s\S]{0,120}set_opacity\(w, opacity_for\(h, kind\)\)/, "wins::show re-applies the opacity");
  for (const f of ["multi_window.rs", "desktop_sidebar.rs", "app_lock.rs"]) {
    const src = readFileSync(join(srcDir, "premium", "features", f), "utf8");
    assert.doesNotMatch(src, /\bw\.show\(\)/, `${f}: shows windows through wins::show (opacity)`);
  }
  const ovRs = readFileSync(join(srcDir, "premium", "overlay.rs"), "utf8");
  assert.ok(ovRs.indexOf("w.set_ignore_cursor_events(o.click_through)") < ovRs.indexOf("wins::set_opacity(&w, o.opacity"), "overlay opacity after click-through");
  // HUDs never take the focus from the game: created visible + unfocused (SW_SHOWNOACTIVATE),
  // never shown later through show() (SW_SHOW activates).
  const ovChain = chains.find((x) => x.file === "premium/overlay.rs").chain;
  assert.match(ovChain, /\.focused\(false\)[\s\S]*\.visible\(true\)/, "overlays are created visible and unfocused");
  assert.doesNotMatch(ovRs, /w\.show\(\)/, "no show() (SW_SHOW) on overlay windows");
  // Tauri reports window moves during a drag (Electron's 'moved' came after the drop): widget
  // positions and edge snapping wait until no mouse button is held.
  for (const f of ["widgets.rs", "advanced_window_mgmt.rs"]) {
    const src = readFileSync(join(srcDir, "premium", "features", f), "utf8");
    assert.match(src, /if platform::mouse_button_down\(\)[^{]*\{\s*h\.tick\(/, `${f}: waits for the drop`);
  }
  // app_lock (appLockRedact.cjs + hideOtherWindows): while locked, toasts show no sender or
  // preview, and pop-outs / account windows hide until the PIN is entered.
  const premiumRs = readFileSync(join(srcDir, "premium", "mod.rs"), "utf8");
  // One redaction: the final notify_filter hook (after quick reply) of app_lock, with
  // rules::redact_locked (shell-notif.test.mjs compares it with appLockRedact.cjs).
  assert.match(premiumRs, /quick_reply::filter\(h, payload\)\?;[\s\S]{0,400}if h\.is_running\(f\.key\(\)\) \{\s*p = f\.notify_filter\(h, p\)\?;/, "locked toasts are redacted after quick reply");
  assert.match(readFileSync(join(srcDir, "premium", "features", "app_lock.rs"), "utf8"), /fn notify_filter\(&self, h: &Host, payload: Value\)[\s\S]{0,200}redact_locked\(&payload,/, "app_lock redacts while locked");
  const notifyRs = readFileSync(join(srcDir, "commands", "notify.rs"), "utf8");
  assert.match(notifyRs, /let title = filtered\.get\("title"\)/, "the capsule shows the filtered title");
  assert.doesNotMatch(notifyRs, /show_capsule\(&app, &payload\.title/, "not the sender's name while locked");
  const lockRs = readFileSync(join(srcDir, "premium", "features", "app_lock.rs"), "utf8");
  assert.match(lockRs, /matches!\(e\.kind\.as_str\(\), "popout" \| "account"\)/, "the lock hides pop-outs and account windows");
  assert.doesNotMatch(lockRs, /self\.locked\.store\(/, "every lock change goes through set_locked");
  const platRs = readFileSync(join(srcDir, "premium", "platform.rs"), "utf8");
  assert.equal((platRs.match(/pub fn mouse_button_down\(\) -> bool/g) || []).length, 2, "mouse_button_down on Windows and the stub");
  assert.match(platRs, /if ex & WS_EX_TRANSPARENT\.0 as isize == 0 \{\s*SetWindowLongPtrW\(h, GWL_EXSTYLE, ex & !\(WS_EX_LAYERED/, "a click-through HUD at 100 % keeps WS_EX_LAYERED");
}

console.log("electron-api-shim.test: ok");
