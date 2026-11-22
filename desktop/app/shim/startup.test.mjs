// Start-up of the Tauri main window: shown as soon as the boot splash is up, not after the
// main bundle ran. Run: node desktop/app/shim/startup.test.mjs
//
// The shell showed the window on PageLoadEvent::Finished (WebView2 NavigationCompleted, after
// the module scripts ran), so a cold start showed nothing until the whole bundle was parsed
// and executed; Electron put its splash window up at once. The shim now reports
// app_boot_state "splash" when index.html mounts #boot-splash, and the shell shows the window
// on that report for a normal start.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const DESKTOP = join(here, "..", "..");
const shimSrc = readFileSync(join(here, "electron-api-shim.js"), "utf8");
const code = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"])\/\/.*$/gm, "$1");

/** The shim in a vm with a fake Tauri bridge, a fake DOM with MutationObserver and timers. */
function loadShim({ label = "main", boot = { mode: "main" }, observer = true } = {}) {
  const invokes = [];
  const answer = (cmd, args) => { invokes.push([cmd, args]); return Promise.resolve(null); };
  const docListeners = new Map();
  const observers = [];
  const timers = [];
  const frames = [];
  let splash = null;
  const window = {
    __DESCALL_BOOT__: boot,
    __TAURI_INTERNALS__: { invoke: answer, transformCallback: () => 1, metadata: { currentWebview: { label } } },
    __TAURI__: { core: { invoke: answer }, event: { listen: () => Promise.resolve(() => {}) } },
    addEventListener() {},
  };
  window.top = window;
  const document = {
    addEventListener: (type, fn) => { if (!docListeners.has(type)) docListeners.set(type, []); docListeners.get(type).push(fn); },
    documentElement: { classList: { add() {} } },
    getElementById: (id) => (id === "boot-splash" ? splash : null),
  };
  class FakeObserver {
    constructor(cb) { this.cb = cb; this.on = false; observers.push(this); }
    observe() { this.on = true; }
    disconnect() { this.on = false; }
  }
  const ctx = {
    window,
    document,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    location: { href: "https://tauri.localhost/", origin: "https://tauri.localhost" },
    URL,
    console: { log() {}, warn() {}, error: console.error },
    Promise,
    Uint8Array,
    ArrayBuffer,
    performance: { now: () => 140.4 },
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimeout() {},
    requestAnimationFrame: (fn) => { frames.push(fn); return frames.length; },
    ...(observer ? { MutationObserver: FakeObserver } : {}),
  };
  ctx.window.performance = ctx.performance;
  vm.createContext(ctx);
  vm.runInContext(shimSrc, ctx, { filename: "electron-api-shim.js" });
  return {
    invokes,
    observers,
    timers,
    frames,
    mountSplash() { splash = { id: "boot-splash" }; for (const o of observers) if (o.on) o.cb([]); },
    domReady() { for (const fn of docListeners.get("DOMContentLoaded") || []) fn(); },
    splashReports: () => invokes.filter(([c, a]) => c === "app_boot_state" && a && a.phase === "splash"),
  };
}

// 1. Main window: nothing before the splash; one report once it is mounted and a frame ran.
{
  const s = loadShim();
  assert.equal(s.splashReports().length, 0, "no report before the splash exists");
  assert.equal(s.observers.length, 1, "watches the document for the splash");
  s.mountSplash();
  assert.equal(s.observers[0].on, false, "stops watching once the splash is there");
  assert.equal(s.splashReports().length, 0, "waits for a frame");
  s.frames.splice(0).forEach((f) => f());
  s.timers.filter((t) => t.ms === 0).forEach((t) => t.fn());
  assert.equal(s.splashReports().length, 1, "reports the splash after its first frame");
  assert.equal(JSON.stringify(s.splashReports()[0][1]), JSON.stringify({ phase: "splash", ms: 140 }));
  // The 120 ms fallback and DOMContentLoaded do not report twice.
  s.timers.forEach((t) => t.fn());
  s.domReady();
  assert.equal(s.splashReports().length, 1, "one report only");
}

// 2. No frame while the window is hidden: the 120 ms fallback reports.
{
  const s = loadShim();
  s.mountSplash();
  const fallback = s.timers.find((t) => t.ms === 120);
  assert.ok(fallback, "fallback timer");
  fallback.fn();
  assert.equal(s.splashReports().length, 1, "reported without a frame");
}

// 3. No MutationObserver: DOMContentLoaded still finds the splash.
{
  const s = loadShim({ observer: false });
  s.mountSplash();
  s.domReady();
  s.timers.forEach((t) => t.fn());
  assert.equal(s.splashReports().length, 1, "reported from DOMContentLoaded");
}

// 4. Not for admin windows, pop-outs or a page without a splash (logged-out marketing).
{
  const admin = loadShim({ label: "admin-panel", boot: { mode: "admin" } });
  admin.mountSplash();
  admin.domReady();
  admin.timers.forEach((t) => t.fn());
  admin.frames.forEach((f) => f());
  assert.equal(admin.splashReports().length, 0, "admin window: no start-up report");
  const popout = loadShim({ label: "premium-call" });
  popout.mountSplash();
  popout.domReady();
  popout.timers.forEach((t) => t.fn());
  assert.equal(popout.splashReports().length, 0, "other windows: no start-up report");
  const none = loadShim();
  none.domReady();
  none.timers.forEach((t) => t.fn());
  assert.equal(none.splashReports().length, 0, "no splash, no report (Finished shows the window)");
}

// 5. The shell side: accepted phase, normal starts only, not after the app mounted, not when
//    the window is already up; PageLoadEvent::Finished stays as the fallback.
{
  const wd = code(readFileSync(join(DESKTOP, "crates/descall-shell/src/watchdog.rs"), "utf8"));
  assert.match(wd, /pub const BOOT_PHASES: \[&str; \d+\] = \[[^\]]*"splash"[^\]]*\]/, "splash is a boot phase");
  assert.doesNotMatch(/pub fn ends_paint_watch[\s\S]*?\n\}/.exec(wd)[0], /"splash"/, "the splash does not end the paint watchdog");
  const app = code(readFileSync(join(DESKTOP, "app/src-tauri/src/commands/app.rs"), "utf8"));
  const cmd = /pub fn app_boot_state[\s\S]*?\n\}/.exec(app)[0];
  assert.match(cmd, /report\.phase == "splash" && shell\(&app\)\.show_on_load\.load\(Ordering::Acquire\)/, "only on a normal start");
  assert.match(cmd, /!mounted && !window\.is_visible\(\)\.unwrap_or\(true\)/, "not after the app mounted, not twice");
  assert.match(cmd, /state::show_main\(&app\)/, "shows like the Finished path");
  assert.ok(cmd.indexOf("window.label() != state::MAIN") < cmd.indexOf('"splash"'), "main window only");
  const main = code(readFileSync(join(DESKTOP, "app/src-tauri/src/main.rs"), "utf8"));
  assert.match(main, /if launch\.action == descall_shell::launch::StartAction::Show \{\s*state::shell\(&handle\)\.show_on_load\.store\(true/, "flag set for a normal start only (tray / minimized starts stay hidden)");
  assert.match(main, /PageLoadEvent::Finished => \{[\s\S]*?state::show_main\(&load_app\)/, "Finished still shows the window when no splash report came");
}

console.log("startup.test: ok");
