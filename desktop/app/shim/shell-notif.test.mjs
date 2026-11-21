// Notification capsule / voice overlay parity checks that need no browser and no Rust build.
// Run: node desktop/app/shim/shell-notif.test.mjs   (CI: tauri-build.yml)
// The full page run in Chromium is shell-pages.e2e.mjs.
//
// 1. window.notifAPI of shell-notif.js has the members of frontend/electron/notifPreload.cjs
//    and each one reaches notif_action with the action Electron sent (notif:<action>).
// 2. A grouped update from the shell (raw payload) reaches the card as
//    { title, body, context, count }, the shape main.cjs computed with describeNotification.
// 3. Window rules from the Rust sources: capsules and the voice overlay are shown without
//    activation (Electron showInactive): born visible and unfocused, never show() later.
// 3b. Both windows are built off the UI thread (WebView2 deadlock in sync commands).
// 4. notification_show keeps main.cjs order: "Descall in front" before the reply toast.
// 5. The tray icon is the embedded app icon at the small icon size, not the 32 px one.
// 6. Taskbar thumbnail buttons and the unread badge come back after the tray.
// 7. The first close to the tray shows the "keeps running in the background" capsule.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..", "..", "..");
const read = (p) => readFileSync(join(repo, p), "utf8");
const tick = () => new Promise((r) => setTimeout(r, 0));
// Values from the vm realm have other prototypes: compare their JSON shape.
const plain = (v) => JSON.parse(JSON.stringify(v));

// ---- 1 + 2: shell-notif.js against notifPreload.cjs --------------------------------------------
function electronNotifApi() {
  const exposed = {};
  const sent = [];
  const electron = {
    contextBridge: { exposeInMainWorld: (name, api) => { exposed[name] = api; } },
    ipcRenderer: { send: (ch, ...a) => sent.push([ch, ...a]), on: () => {} },
  };
  vm.runInNewContext(read("frontend/electron/notifPreload.cjs"), { require: () => electron });
  return { api: exposed.notifAPI, sent };
}

function loadShellNotif(input) {
  const invokes = [];
  const listeners = {};
  let mounted = null;
  const described = [];
  const card = {
    describeNotification: (o) => { described.push(o); return { name: `name:${o.title}`, preview: `preview:${o.body}`, context: "ctx", kind: "message" }; },
    buildNotificationHtml: (o) => `<html>${o.title}|${o.body}|${o.type}|${o.duration}|${o.count}</html>`,
  };
  const i18n = { setLocale: (l) => { i18n.locale = l; } };
  const window = {
    __DESCALL_NOTIF__: input,
    __TAURI__: {
      core: { invoke: (cmd, args) => { invokes.push([cmd, args]); return Promise.resolve(null); } },
      event: { listen: (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); return Promise.resolve(() => {}); } },
    },
    __descallShellRequire: (name) => (name === "./mainI18n.cjs" ? i18n : card),
    __descallMountShellPage: (html) => { mounted = html; },
  };
  vm.runInNewContext(read("desktop/app/shim/shell-notif.js"), { window, Object, Number, Boolean, console });
  return { api: window.notifAPI, invokes, listeners, mounted: () => mounted, i18n, described, window };
}

{
  const ref = electronNotifApi();
  const s = loadShellNotif({ locale: "de", title: "Ayşe", body: "selam", data: { type: "dm", from: "Ayşe" }, type: "default", duration: 5000, count: 1 });
  assert.deepEqual(Object.keys(s.api).sort(), Object.keys(ref.api).sort(), "notifAPI members = notifPreload.cjs");
  for (const k of Object.keys(ref.api)) assert.equal(typeof s.api[k], typeof ref.api[k], `notifAPI.${k} type`);
  assert.equal(s.i18n.locale, "de", "capsule speaks the shell language");
  assert.equal(s.mounted(), "<html>name:Ayşe|preview:selam|default|5000|1</html>", "markup from notificationCard.cjs");
  assert.ok(Object.isFrozen(s.api), "frozen bridge");

  // Each member -> the Electron channel's action, resume with the time left as a number.
  for (const [member, args, action, extra] of [
    ["click", [], "click"],
    ["close", [], "close"],
    ["accept", [], "accept"],
    ["decline", [], "decline"],
    ["pause", [], "pause"],
    ["resume", [1234.5], "resume", { remaining: 1234.5 }],
    ["resume", ["x"], "resume", { remaining: 0 }],
  ]) {
    const before = s.invokes.length;
    s.api[member](...args);
    ref.api[member](...args);
    assert.deepEqual(plain(s.invokes.slice(before)), [["notif_action", { action, ...(extra || {}) }]], `${member} -> notif_action ${action}`);
    const sent = ref.sent[ref.sent.length - 1];
    assert.equal(sent[0], `notif:${action}`, `Electron sent notif:${action}`);
  }

  // Grouped update: raw shell payload -> the card's update shape.
  const got = [];
  s.api.onUpdate((m) => got.push(m));
  s.api.onUpdate("not a function");
  assert.equal((s.listeners["notif:update"] || []).length, 1, "one shell listener");
  s.listeners["notif:update"][0]({ payload: { title: "Hafta Sonu", body: "Zeynep: ikinci", data: { type: "group", from: "Zeynep" }, avatarUrl: null, count: 3 } });
  await tick();
  assert.deepEqual(plain(got), [{ title: "name:Hafta Sonu", body: "preview:Zeynep: ikinci", context: "ctx", count: 3 }]);
  const last = s.described[s.described.length - 1];
  assert.deepEqual({ title: last.title, body: last.body, type: last.data.type }, { title: "Hafta Sonu", body: "Zeynep: ikinci", type: "group" });
}
{
  // Without the Tauri bridge or the runtime nothing is defined (no half-working capsule).
  const window = { __DESCALL_NOTIF__: {} };
  vm.runInNewContext(read("desktop/app/shim/shell-notif.js"), { window, Object, Number, Boolean, console });
  assert.equal(window.notifAPI, undefined);
}

// ---- 3: no activating show for capsules and the overlay ------------------------------------------
/** The builder chain that starts at `WebviewWindowBuilder::new(` and ends at `.build()`. */
function builderChain(src, marker) {
  const at = src.indexOf(marker);
  assert.ok(at >= 0, `builder ${marker}`);
  const start = src.lastIndexOf("WebviewWindowBuilder::new(", at + marker.length);
  const end = src.indexOf(".build()", start);
  assert.ok(start >= 0 && end > start, `builder chain for ${marker}`);
  return src.slice(start, end);
}
const codeOnly = (src) => src.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
{
  const notify = codeOnly(read("desktop/app/src-tauri/src/commands/notify.rs"));
  const chain = builderChain(notify, 'WebviewUrl::CustomProtocol(crate::shell_url("notif.html"))');
  assert.match(chain, /\.visible\(true\)/, "capsule is born visible (SW_SHOWNOACTIVATE)");
  assert.match(chain, /\.focused\(false\)/, "capsule is born unfocused, calls included");
  assert.doesNotMatch(chain, /\.visible\(false\)/);
  const reveal = notify.slice(notify.indexOf("fn reveal"), notify.indexOf("pub fn show_capsule"));
  assert.doesNotMatch(reveal, /\.show\(\)/, "reveal never calls show() (SW_SHOW takes the focus)");

  const overlay = codeOnly(read("desktop/app/src-tauri/src/commands/overlay.rs"));
  const oc = builderChain(overlay, 'WebviewUrl::CustomProtocol(crate::shell_url("overlay.html"))');
  assert.match(oc, /\.visible\(true\)/, "overlay is born visible");
  assert.match(oc, /\.focused\(false\)/, "overlay is born unfocused");
  assert.doesNotMatch(overlay, /\.show\(\)/, "the overlay is never hidden and shown again");
  assert.doesNotMatch(overlay, /\.hide\(\)/, "hiding destroys the overlay window instead");
  // Its window labels are covered by the capability that lets the page call overlay_action.
  const prefix = overlay.match(/LABEL_PREFIX: &str = "([^"]+)"/)[1];
  const cap = JSON.parse(read("desktop/app/src-tauri/capabilities/default.json"));
  const globToRe = (g) => new RegExp(`^${g.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`);
  assert.ok(cap.windows.some((g) => globToRe(g).test(`${prefix}7`)), `capability covers ${prefix}<n>`);
  assert.ok(cap.windows.some((g) => globToRe(g).test("notif-12")), "capability covers notif-<n>");
}

// ---- 3b: the capsule and overlay windows are built off the UI thread --------------------------------
{
  // notification_show / overlay_show are synchronous commands: they run on the UI thread inside
  // WebView2's IPC callback, where building a webview window deadlocks on Windows (Tauri's
  // documented WebView2 issue). The build goes to a blocking task instead.
  for (const file of ["notify.rs", "overlay.rs"]) {
    const src = codeOnly(read(`desktop/app/src-tauri/src/commands/${file}`));
    const builds = [...src.matchAll(/WebviewWindowBuilder::new\(/g)].map((m) => m.index);
    assert.ok(builds.length >= 1, `${file} builds a window`);
    for (const at of builds) {
      const before = src.slice(Math.max(0, at - 220), at);
      assert.match(before, /spawn_blocking\(move \|\| \{\s*let built = $/, `${file}: window built inside spawn_blocking`);
    }
    assert.match(src, /let _ = w\.destroy\(\);/, `${file}: a window that is no longer wanted when its build ends is destroyed`);
  }
  const notify = codeOnly(read("desktop/app/src-tauri/src/commands/notify.rs"));
  const built = notify.slice(notify.indexOf("spawn_blocking(move ||"));
  assert.match(built, /iter\(\)\.any\(\|c\| c\.id == id\)/, "capsule dismissed during its build is destroyed");
  const overlay = codeOnly(read("desktop/app/src-tauri/src/commands/overlay.rs"));
  const ensure = overlay.slice(overlay.indexOf("fn ensure"), overlay.indexOf("spawn_blocking"));
  assert.match(ensure, /if live\.window\.is_some\(\) \{\s*return;/, "one overlay at a time, also while it is being built");
}

// ---- 4: notification_show order --------------------------------------------------------------------
{
  const notify = codeOnly(read("desktop/app/src-tauri/src/commands/notify.rs"));
  const body = notify.slice(notify.indexOf("pub fn notification_show"), notify.indexOf("fn flash_taskbar"));
  const iSnooze = body.indexOf("suppress_notification");
  const iFront = body.indexOf("skip_in_front");
  const iReply = body.indexOf("show_quick_reply");
  const iCapsule = body.indexOf("show_capsule");
  assert.ok(iSnooze >= 0 && iFront > iSnooze && iReply > iFront && iCapsule > iReply, "snooze, in front, reply toast, capsule (main.cjs order)");
  assert.match(body.slice(iFront, iReply), /if !call/, "a call never becomes a reply toast");
  assert.match(body, /reply_toast_text/, "toast title / text like Electron (data.from, data.preview)");
  const mainRs = read("desktop/app/src-tauri/src/main.rs");
  for (const cmd of ["notif_action", "notification_show", "notification_close", "overlay_show", "overlay_hide", "overlay_update", "overlay_action", "tray_menu_state", "tray_menu_act", "tray_set_state"]) {
    assert.match(mainRs, new RegExp(`::${cmd}\\b`), `${cmd} registered`);
  }
}

// ---- 5: tray icon drawn at the tray's own size ---------------------------------------------------
{
  // Electron gave the tray icon.ico (Windows picks the 16 / 20 / 24 px entry); Tauri's default
  // window icon is the 32 px large one, shrunk into the tray without filtering.
  const tray = codeOnly(read("desktop/app/src-tauri/src/tray.rs"));
  const create = tray.slice(tray.indexOf("pub fn create"), tray.indexOf("pub fn rebuild"));
  assert.match(tray, /SM_CXSMICON/, "small icon metric");
  assert.match(tray, /from_app_icon_resource\(size\)/, "embedded app icon at that size");
  assert.ok(create.indexOf("small_icon()") >= 0 && create.indexOf("small_icon()") < create.indexOf("default_window_icon"), "small icon first, window icon as fallback");
}

// ---- 6: taskbar buttons and badge survive the tray ---------------------------------------------
{
  // Hiding to the tray removes the taskbar button; the new one has no thumbnail toolbar and
  // ThumbBarUpdateButtons alone never brings the mute / deafen / leave buttons back
  // (Electron re-added them on 'show').
  const platform = codeOnly(read("desktop/app/src-tauri/src/premium/platform.rs"));
  const proc = platform.slice(platform.indexOf("unsafe extern \"system\" fn thumb_proc"), platform.indexOf("fn icon_for"));
  assert.match(platform, /RegisterWindowMessageW\(w!\("TaskbarButtonCreated"\)\)/);
  assert.match(proc, /taskbar_created\(\)/, "the subclass hears TaskbarButtonCreated");
  assert.match(proc, /s\.added = false/, "and adds the toolbar again");
  assert.match(proc, /set_thumb_buttons\(/);
  assert.match(platform, /state\.last = buttons\.to_vec\(\)/, "the last buttons are kept for that");
  assert.match(platform, /ThumbBarUpdateButtons\(hw, &list\)\.is_err\(\)/, "update falls back to add");
  const tb = codeOnly(read("desktop/app/src-tauri/src/premium/features/taskbar_plus.rs"));
  assert.match(tb, /Bus::Focus\(l, true\) if l == "main" =>[\s\S]{0,120}set_badge/, "badge re-applied when the window comes back");
}

// ---- 7: first close to the tray tells where Descall went (main.cjs 'close') ---------------------------
{
  const boot = codeOnly(read("desktop/app/src-tauri/src/boot.rs"));
  const close = boot.slice(boot.indexOf("WindowEvent::CloseRequested"), boot.indexOf("WindowEvent::Resized"));
  assert.match(close, /win\.hide\(\);\s*background_notice\(app\);/, "notice right after hiding to the tray");
  const fn = boot.slice(boot.indexOf("fn background_notice"), boot.indexOf("pub fn bind_window_events"));
  assert.match(fn, /"background-notice-shown"/, "same marker file as Electron: once");
  assert.match(fn, /et\(app, "notice\.background"/, "shell text, all locales");
  assert.match(fn, /show_capsule\(/);
  for (const l of ["tr", "en", "de", "es", "fr", "pt-BR", "ru"]) {
    const j = JSON.parse(read(`frontend/electron/i18n/${l}.json`));
    assert.ok(j.notice && j.notice.background, `${l}: notice.background`);
  }
}

console.log("shell-notif.test: ok");
