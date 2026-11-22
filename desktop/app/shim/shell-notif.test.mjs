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
// 8. A Descall+ "toast" style notification opens the chat when clicked.
// 9. Unread messages put a dot on the tray icon.
// 10. While Descall+ app lock is locked, notifications show nothing personal.
// 11. A toast clicked in the Action Center after Descall was closed still opens its chat.
// 12. Taskbar thumbnail tooltips follow a language change live.
// 13. The native tray menu (panel fallback) has Electron's order.
// 14. Taskbar badge and tray dot count the same unread messages.
// 15. The process has Descall's AppUserModelID: one taskbar button however it was started.
// 16. Every way back to the window tells the page it is on screen; a page that loads in the
//     tray learns it is not (DM read receipts, html.app-backgrounded).
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
  // The shell pages' capability (shell.json: listen / unlisten only) and the per-window IPC
  // policy (ipc_policy.rs: overlay_action for the voice overlay) both cover the label.
  const cap = JSON.parse(read("desktop/app/src-tauri/capabilities/shell.json"));
  const globToRe = (g) => new RegExp(`^${g.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`);
  assert.ok(cap.windows.some((g) => globToRe(g).test(`${prefix}7`)), `capability covers ${prefix}<n>`);
  assert.ok(cap.windows.some((g) => globToRe(g).test("notif-12")), "capability covers notif-<n>");
  const policy = codeOnly(read("desktop/crates/descall-shell/src/ipc_policy.rs"));
  assert.match(policy, new RegExp(`l\\.starts_with\\("${prefix}"\\)[^=]*=> WindowClass::VoiceOverlay`), `ipc_policy: ${prefix}<n> is the voice overlay`);
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
  const body = notify.slice(notify.search(/pub (?:async )?fn notification_show\b/), notify.indexOf("fn flash_taskbar"));
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
  // A new taskbar button without the focus (shown from the tray while Windows refuses the
  // foreground, Explorer restarted) also gets its badge back, not only on the next focus.
  assert.match(proc, /ON_BUTTON_CREATED\.get\(\)\.copied\(\)[\s\S]{0,60}std::thread::spawn\(f\)/, "the subclass runs the hook on TaskbarButtonCreated");
  assert.match(tb, /fn start\(&self, h: &Host\) \{\s*platform::on_taskbar_button_created\(on_button_created\);/, "taskbar_plus registers it");
  assert.match(tb, /fn on_button_created\(\) \{\s*if let Some\(h\) = host\(\) \{\s*h\.bus\(Bus::Settings\("taskbar_plus"\.into\(\)\)\);/, "which re-applies badge and buttons");
  const other = platform.length; // stub keeps the non-Windows build type-checking
  assert.ok(other > 0 && /pub fn on_taskbar_button_created\(_f: fn\(\)\) \{\}/.test(read("desktop/app/src-tauri/src/premium/platform.rs")), "non-Windows stub");
}

// ---- 7: first close to the tray tells where Descall went (main.cjs 'close') ---------------------------
{
  const boot = codeOnly(read("desktop/app/src-tauri/src/boot.rs"));
  const close = boot.slice(boot.indexOf("WindowEvent::CloseRequested"), boot.indexOf("WindowEvent::Resized"));
  // One implementation (T5's background_notice_once with the unit-tested marker check).
  assert.match(close, /win\.hide\(\);\s*background_notice(?:_once)?\(app\);/, "notice right after hiding to the tray");
  const fn = boot.slice(boot.indexOf("const BACKGROUND_NOTICE"), boot.indexOf("pub fn bind_window_events"));
  assert.match(fn, /"background-notice-shown"/, "same marker file as Electron: once");
  assert.match(fn, /et\(&?app, "notice\.background"/, "shell text, all locales");
  assert.match(fn, /show_capsule\(/);
  for (const l of ["tr", "en", "de", "es", "fr", "pt-BR", "ru"]) {
    const j = JSON.parse(read(`frontend/electron/i18n/${l}.json`));
    assert.ok(j.notice && j.notice.background, `${l}: notice.background`);
  }
}

// ---- 8: Descall+ "toast" style: a click on the native toast opens the chat -----------------------
{
  // Electron's Notification click sent notification:click { title, body, tag, data };
  // tauri-plugin-notification has no click on Windows, so the toast goes through premium
  // toast.rs (activation handler) first and the plugin is only the fallback.
  const notify = codeOnly(read("desktop/app/src-tauri/src/commands/notify.rs"));
  const toastAt = notify.indexOf('Some("toast")');
  const branch = notify.slice(toastAt, notify.indexOf("let n = app.state::<Notifications>();", toastAt));
  assert.ok(branch.indexOf("show_toast(") >= 0 && branch.indexOf("show_toast(") < branch.indexOf(".notification()"), "native toast with click first, plugin fallback");
  assert.match(branch, /json!\(\{ "title": title, "body": body, "tag": tag, "data": data \}\)/, "same click envelope as Electron");
  const qr = codeOnly(read("desktop/app/src-tauri/src/premium/features/quick_reply.rs"));
  const act = qr.slice(qr.indexOf("pub(crate) fn on_activation"), qr.indexOf("fn flush()"));
  assert.ok(act.indexOf("parse_toast_click") >= 0 && act.indexOf("parse_toast_click") < act.indexOf("parse_toast_args"), "plain toast clicks handled before reply toasts");
  assert.match(act, /show_main\(\)[\s\S]*deliver_click\(h, click\)/, "click shows Descall and opens the chat");
  const toast = codeOnly(read("desktop/app/src-tauri/src/premium/toast.rs"));
  const plain = toast.slice(toast.indexOf("pub fn plain_toast_xml"), toast.indexOf("pub fn show("));
  assert.doesNotMatch(plain, /<input/, "no reply box on a plain toast");
}

// ---- 9: unread dot on the tray icon -------------------------------------------------------------------
{
  // Owner checklist: unread messages show a badge on the tray icon (Electron had none).
  const tm = codeOnly(read("desktop/app/src-tauri/src/tray_menu.rs"));
  const setState = tm.slice(tm.indexOf("pub fn tray_set_state"), tm.indexOf("pub fn tray_menu_state"));
  assert.match(setState, /"unreadMessages"[\s\S]*crate::tray::set_unread\(&app, unread\)/, "every page state drives the dot");
  assert.ok(setState.indexOf("set_unread") < setState.indexOf("i.app_state.as_ref() == Some(&next)"), "also when the panel state did not change");
  const tray = codeOnly(read("desktop/app/src-tauri/src/tray.rs"));
  const fn = tray.slice(tray.indexOf("pub fn set_unread"), tray.indexOf("pub fn rebuild"));
  assert.match(fn, /UNREAD_DOT\.swap\(unread/, "only a change touches the icon");
  assert.match(fn, /unread_dot_rgba\(rgba, \*w\)/);
  assert.match(fn, /else \{ rgba\.clone\(\) \}/, "no unread: the plain icon again");
  assert.match(codeOnly(read("desktop/crates/descall-shell/src/tray_panel.rs")), /fn unread_dot_on_the_tray_icon\(\)/, "pixel rules unit-tested in Rust");
}

// ---- 10: app lock redacts notifications (Electron notifyHooks.registerFinal) ----------------------
{
  const mod = codeOnly(read("desktop/app/src-tauri/src/premium/mod.rs"));
  const filter = mod.slice(mod.indexOf("pub fn notify_filter"), mod.indexOf("pub fn show_quick_reply"));
  assert.ok(filter.indexOf("quick_reply::filter") >= 0 && filter.indexOf("quick_reply::filter") < filter.indexOf("f.notify_filter(h, p)?"), "final filters run after quick reply");
  const lockRs = codeOnly(read("desktop/app/src-tauri/src/premium/features/app_lock.rs"));
  assert.match(lockRs, /fn notify_filter\(&self, h: &Host, payload: Value\) -> Option<Value> \{\s*if !self\.locked\.load/, "only while locked");
  assert.match(lockRs, /redact_locked\(&payload, &crate::state::et\(&h\.app, "notif\.locked"/, "Electron's text (shell catalogs)");
  const notify = codeOnly(read("desktop/app/src-tauri/src/commands/notify.rs"));
  const show = notify.slice(notify.search(/pub (?:async )?fn notification_show\b/), notify.indexOf("fn flash_taskbar"));
  assert.match(show, /let title = filtered\.get\("title"\)/, "the capsule uses the filtered title");
  assert.doesNotMatch(show.slice(show.indexOf("let title = filtered")), /payload\.title\b(?!\.as_str\(\)\))/, "never the raw sender after filtering");
  // One redaction path (round 1 had two): redact_locked is defined once and called only by
  // app_lock's final filter; the shell's notification code has no lock check of its own.
  const rustFiles = ["commands/notify.rs", "commands/app.rs", "boot.rs", "tray.rs", "tray_menu.rs", "state.rs", "premium/mod.rs", "premium/toast.rs", "premium/features/quick_reply.rs", "premium/features/app_lock.rs", "premium/logic/rules.rs"];
  const callers = rustFiles.filter((f) => {
    const src = codeOnly(read(`desktop/app/src-tauri/src/${f}`));
    const body = src.includes("#[cfg(test)]") ? src.slice(0, src.indexOf("#[cfg(test)]")) : src;
    return /redact_locked\(&/.test(body);
  });
  assert.deepEqual(callers, ["premium/features/app_lock.rs"], "redact_locked is called from app_lock only");
  assert.equal((codeOnly(read("desktop/app/src-tauri/src/premium/logic/rules.rs")).match(/pub fn redact_locked\(/g) || []).length, 1, "one redact_locked");
  assert.doesNotMatch(codeOnly(read("desktop/app/src-tauri/src/commands/notify.rs")), /locked|app_lock/i, "no second lock check in notify.rs");
  assert.equal((notify.match(/crate::premium::notify_filter\(/g) || []).length, 1, "notification_show runs the filter chain once");
  // The Rust port keeps Electron's rules (appLockRedact.cjs), checked side by side here.
  const { redactLockedNotification, LOCKED_TAG } = await import(join(repo, "frontend/electron/premium/appLockRedact.cjs"));
  const rules = codeOnly(read("desktop/app/src-tauri/src/premium/logic/rules.rs"));
  assert.match(rules, new RegExp(`pub const LOCKED_TAG: &str = "${LOCKED_TAG}"`), "same tag");
  const e = redactLockedNotification({ title: "Ayşe", options: { body: "gizli", data: { type: "dm", from: "Ayşe" } } }, { lockedText: "L" });
  assert.deepEqual(Object.keys(e.options).sort(), ["avatarUrl", "body", "data", "requireInteraction", "silent", "tag"]);
  for (const k of Object.keys(e.options)) assert.match(rules.slice(rules.indexOf("pub fn redact_locked")), new RegExp(`"${k}":`), `Rust sets options.${k}`);
}

// ---- capsules on a second monitor with another DPI ----------------------------------------------
// Electron places in DIPs of the chosen display. Tauri's LogicalPosition uses the scale of the
// monitor the window is on now, so the stack is laid out in the target monitor's logical px and
// every move goes out in that monitor's physical px (Anchor::to_physical).
{
  const notify = codeOnly(read("desktop/app/src-tauri/src/commands/notify.rs"));
  assert.doesNotMatch(notify, /LogicalPosition/, "no capsule move in logical px");
  assert.match(notify, /fn anchor_area<R: Runtime>\(app: &AppHandle<R>\) -> Anchor/);
  assert.match(notify, /origin_px: \(wa\.position\.x, wa\.position\.y\)/, "the work area's physical origin");
  assert.match(notify, /ease_to\(w, anchor\.to_physical\(p\.x, p\.y\), anchor\.scale\)/, "restack in physical px");
  assert.match(notify, /let target_px = anchor\.to_physical\(x, y\);/);
  const built = notify.slice(notify.indexOf("match built {"));
  assert.match(built.slice(0, built.indexOf("Err(e)")), /set_position\(PhysicalPosition::new\(target_px\.0, target_px\.1\)\)/, "a new capsule is put on its monitor once built");
  const shell = codeOnly(read("desktop/crates/descall-shell/src/notif.rs"));
  assert.match(shell, /self\.origin_px\.0 \+ \(\(x - self\.rect\.x\) \* s\)\.round\(\) as i32/);
  // The same arithmetic: a 150 % monitor right of a 100 % one; its centre is 1920 + 1280 px.
  const toPhysical = (a, x, y) => [a.origin[0] + Math.round((x - a.rect.x) * a.scale), a.origin[1] + Math.round((y - a.rect.y) * a.scale)];
  const second = { rect: { x: 1920 / 1.5, y: 0, width: 2560 / 1.5 }, origin: [1920, 0], scale: 1.5 };
  assert.deepEqual(toPhysical(second, second.rect.x + second.rect.width / 2, 10), [3200, 15]);
  // What the logical position did: 1280 + 853 = 2133 logical read at 100 % is x 2133 px,
  // left of the second monitor's centre by more than a capsule width.
  assert.ok(3200 - (second.rect.x + second.rect.width / 2) > 400);
}

// ---- 11: cold start from a toast click opens the chat ---------------------------------------------
{
  // The click envelope of a live toast lives in memory (quick_reply.rs LIVE). A toast clicked in
  // the Action Center after Descall was closed starts it through the COM activator: the envelope
  // is gone and the page is not loaded yet. The routing ids ride in the toast arguments and the
  // click waits until the page reported its state.
  const rules = codeOnly(read("desktop/app/src-tauri/src/premium/logic/rules.rs"));
  const keys = rules.match(/pub const TOAST_CLICK_KEYS: \[&str; (\d+)\] = \[([^\]]+)\];/);
  assert.ok(keys, "routing keys listed");
  const list = [...keys[2].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assert.equal(list.length, Number(keys[1]));
  // Every key App.jsx onNotifClick routes by (ids and the type), and no names or text.
  const app = read("frontend/src/App.jsx");
  const click = app.slice(app.indexOf("const onNotifClick"), app.indexOf("const onCallAction"));
  for (const k of list.filter((k) => k !== "type")) assert.match(click, new RegExp(`data\\.${k}\\b`), `App.jsx routes by data.${k}`);
  for (const k of ["conversationId", "fromId", "groupId", "serverId", "channelId"]) assert.ok(list.includes(k), `${k} carried`);
  for (const k of ["from", "preview", "groupName", "serverName", "channelName", "username"]) assert.ok(!list.includes(k), `${k} (a name or text) stays out of the toast arguments`);
  assert.match(rules, /fn toast_click_carries_the_chat_for_a_cold_start\(\)/, "argument rules unit-tested in Rust");
  const qr = codeOnly(read("desktop/app/src-tauri/src/premium/features/quick_reply.rs"));
  assert.match(qr, /toast_click_args\(&id, &route\)/, "the plain toast carries its click data");
  const act = qr.slice(qr.indexOf("pub(crate) fn on_activation"), qr.indexOf("fn flush()"));
  assert.match(act, /\.or_else\(\|\| route\.as_object\(\)/, "without the live envelope the ids from the arguments open the chat");
  assert.doesNotMatch(act, /emit_to\(/, "every activation goes through deliver_click (queued until the page is up)");
  const deliver = qr.slice(qr.indexOf("fn deliver_click"), qr.indexOf("pub(crate) fn flush_clicks"));
  assert.match(deliver, /if page_ready\(h\) \{[\s\S]*emit_to\(&h\.app, "main", "notification:click", click\)[\s\S]*\} else \{[\s\S]*push\(\(click, Instant::now\(\)\)\)/);
  const mod = codeOnly(read("desktop/app/src-tauri/src/premium/mod.rs"));
  const appState = mod.slice(mod.indexOf('"premium:app-state" =>'), mod.indexOf("_ => return None", mod.indexOf('"premium:app-state" =>')));
  assert.match(appState, /features::quick_reply::flush_clicks\(\)/, "the page's first state flushes waiting clicks, with or without quick_reply running");
  // The page sends that state as soon as the Descall+ host mounts, for every desktop user.
  const host = read("frontend/src/premium/desktop/PremiumDesktopHost.jsx");
  assert.match(host, /b\.invoke\("premium:app-state"/);
  assert.match(app, /const premiumDesktopHost = typeof window !== "undefined" && Boolean\(window\.descallPremium\) && !isPopoutWindow\(\);/);
  // JS mirror of the Rust rules (same inputs as the Rust test) to show the shape end to end.
  const ok = (v) => v.length >= 1 && v.length <= 64 && /^[A-Za-z0-9._:-]+$/.test(v);
  const args = (id, data) => [`descall-n|${id}`, ...list.flatMap((k) => (typeof data[k] === "string" || typeof data[k] === "number") && ok(String(data[k])) ? [`${k}=${data[k]}`] : [])].join("|");
  assert.equal(args("descall-n-1-2", { type: "dm", conversationId: "6a1f-22", fromId: "6a1f-22", from: "Ayşe", preview: "gizli" }), "descall-n|descall-n-1-2|type=dm|conversationId=6a1f-22|fromId=6a1f-22");
  assert.match(rules, /assert_eq!\(args, "descall-n\|descall-n-1-2\|type=dm\|conversationId=6a1f-22\|fromId=6a1f-22"\);/, "Rust test expects the same string");
}

// ---- 12: thumbnail tooltips follow the language ----------------------------------------------------
{
  const tb = codeOnly(read("desktop/app/src-tauri/src/premium/features/taskbar_plus.rs"));
  assert.match(tb, /let key = if on \{ format!\("\{\}\|\{\}\|\{\}", flag\("muted"\), flag\("deafened"\), h\.locale\(\)\)/, "language in the button key");
  assert.match(tb, /Bus::App => \{\s*self\.set_badge\(h\);\s*self\.set_buttons\(h, false\);/, "re-checked on Bus::App");
  const mod = codeOnly(read("desktop/app/src-tauri/src/premium/mod.rs"));
  const setLocale = mod.slice(mod.indexOf("pub fn set_locale"), mod.indexOf("pub fn set_tray_rebuilder"));
  assert.match(setLocale, /h\.refresh_tray\(\);\s*h\.bus\(Bus::App\);/, "a language change reaches the taskbar");
  const appRs = codeOnly(read("desktop/app/src-tauri/src/commands/app.rs"));
  assert.match(appRs, /crate::premium::set_locale\(&locale\);/, "app_set_locale tells Descall+");
}

// ---- 13: native tray menu order (main.cjs buildMenu) -----------------------------------------------
{
  const tray = codeOnly(read("desktop/app/src-tauri/src/tray.rs"));
  const build = tray.slice(tray.indexOf("fn build_menu"), tray.indexOf("pub fn quit"));
  const at = (needle) => { const i = build.indexOf(needle); assert.ok(i >= 0, needle); return i; };
  assert.ok(at("&[&open, &PredefinedMenuItem::separator(app)?]") < at("crate::premium::tray::append(a, m)"), "Open, then Descall+ items");
  assert.ok(at("crate::premium::tray::append(a, m)") < at("menu.append(&autostart)"), "then Start with Windows");
  assert.ok(at("menu.append(&autostart)") < at("menu.append(&quit)"), "then Quit");
  const main = read("frontend/electron/main.cjs");
  const em = main.slice(main.indexOf("const buildMenu = () => Menu.buildFromTemplate(["), main.indexOf("// Windows: right click opens the tray panel"));
  const ei = (n) => em.indexOf(n);
  assert.ok(ei("tray.open") < ei("premium.trayMenuItems()") && ei("premium.trayMenuItems()") < ei("tray.startWithWindows") && ei("tray.startWithWindows") < ei("tray.quit"), "Electron order");
}

// ---- 14: badge and tray dot agree ---------------------------------------------------------------------
{
  // Both count DM + group unread from the same App.jsx maps; both are off when signed out
  // (the dot by signedIn, the badge because Descall+ stops on sign-out).
  const snap = read("frontend/src/premium/desktop/usePremiumAppSnapshot.js");
  assert.match(snap, /unread: sum\(dmUnread\) \+ sum\(groupUnread\)/);
  const trayHook = read("frontend/src/hooks/useDesktopTray.js");
  assert.match(trayHook, /total\(dmUnread\) \+ total\(groupUnread\)/);
  const app = read("frontend/src/App.jsx");
  assert.match(app, /usePremiumAppSnapshot\(\{ me, friends, onlineUsers, dmUnread, groupUnread,/);
  assert.match(app, /useDesktopTray\(\{ me, myStatus, dmUnread, groupUnread,/);
  const tm = codeOnly(read("desktop/app/src-tauri/src/tray_menu.rs"));
  assert.match(tm, /let unread = next\.get\("signedIn"\)\.and_then\(Value::as_bool\) == Some\(true\) && next\.get\("unreadMessages"\)/);
}

// ---- 15: one taskbar button (process AppUserModelID) ---------------------------------------------------
{
  // Electron set it at boot (toastIdentity.cjs app.setAppUserModelId); Tauri never did, so only
  // a start from the Start Menu shortcut carried the id and an autostart / update / toast / link
  // start got its own taskbar button next to the pinned one (badge and thumbnail buttons on it).
  const platform = codeOnly(read("desktop/app/src-tauri/src/platform.rs"));
  const fn = platform.slice(platform.indexOf("pub fn set_app_user_model_id"), platform.indexOf("pub fn session_locked"));
  const id = fn.match(/SetCurrentProcessExplicitAppUserModelID\(w!\("([^"]+)"\)\)/);
  assert.ok(id, "SetCurrentProcessExplicitAppUserModelID with a literal id");
  const conf = JSON.parse(read("desktop/app/src-tauri/tauri.conf.json"));
  assert.equal(id[1], conf.identifier, "same id as the Tauri identifier");
  assert.match(read("desktop/app/src-tauri/nsis/hooks.nsh"), new RegExp(`!define DESCALL_AUMID "${id[1].replace(/\./g, "\\.")}"`), "and the installer's shortcut");
  assert.match(codeOnly(read("desktop/app/src-tauri/src/premium/toast.rs")), new RegExp(`APP_USER_MODEL_ID: &str = "${id[1].replace(/\./g, "\\.")}"`), "and the toasts");
  assert.match(read("frontend/electron/premium/toastIdentity.cjs"), new RegExp(`'${id[1].replace(/\./g, "\\.")}'`), "and Electron");
  const main = codeOnly(read("desktop/app/src-tauri/src/main.rs"));
  const body = main.slice(main.indexOf("fn main()"));
  assert.ok(body.indexOf("platform::set_app_user_model_id()") > 0 && body.indexOf("platform::set_app_user_model_id()") < body.indexOf("tauri::Builder::default()"), "set before the app and its first window");
}

// ---- 16: the page knows whether it is on screen ------------------------------------------------------
{
  // Descall+ (toast click, hotkeys, tray entries) brought the window back with its own
  // unminimize / show / focus: no app:visibility, no skip-taskbar reset. Electron's premium
  // ctx.showMainWindow is main.cjs showMainWindow, the one path.
  const mod = codeOnly(read("desktop/app/src-tauri/src/premium/mod.rs"));
  const sm = mod.slice(mod.indexOf("pub fn show_main(&self)"), mod.indexOf("// -- blobs"));
  assert.match(sm, /^pub fn show_main\(&self\) \{\s*crate::state::show_main\(&self\.app\);\s*\}/, "Descall+ uses the shell's show_main");
  const state = codeOnly(read("desktop/app/src-tauri/src/state.rs"));
  const shell = state.slice(state.indexOf("pub fn show_main"), state.indexOf("pub fn to_main"));
  assert.match(shell, /"app:visibility", serde_json::json!\(\{ "backgrounded": false \}\)/, "which tells the page");
  assert.match(read("frontend/electron/main.cjs"), /showMain: \(\) => showMainWindow\(\),/, "Electron: one path");
  // Loaded while in the tray (autostart --hidden, reload while hidden): no hide event follows.
  const boot = codeOnly(read("desktop/app/src-tauri/src/boot.rs"));
  const away = boot.slice(boot.indexOf("pub fn tell_page_if_away"), boot.indexOf("const BACKGROUND_NOTICE"));
  assert.match(away, /let away = !w\.is_visible\(\)\.unwrap_or\(true\) \|\| w\.is_minimized\(\)\.unwrap_or\(false\);\s*if !away \{\s*return;\s*\}\s*visibility\(&w, true\);/, "only while still away");
  const main = codeOnly(read("desktop/app/src-tauri/src/main.rs"));
  const finished = main.slice(main.indexOf("PageLoadEvent::Finished =>"), main.indexOf(".build()?", main.indexOf("PageLoadEvent::Finished =>")));
  assert.match(finished, /boot::tell_page_if_away\(&load_app\);/, "on every page load of the main window");
}

// The capsule's "time left" on resume is clamped to a capsule's lifetime in the shell.
assert.match(readFileSync(new URL("../src-tauri/src/commands/notify.rs", import.meta.url), "utf8"), /c\.remaining_ms = ms\.clamp\(0\.0, notif::DEFAULT_DURATION_MS as f64\) as u64;/, "resume time left is clamped");
console.log("shell-notif.test: ok");
