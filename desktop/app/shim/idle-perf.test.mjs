/**
 * Run: node desktop/app/shim/idle-perf.test.mjs
 *
 * Idle CPU / RAM of the Tauri shell, checked on the sources:
 *
 * 1. Inventory of every timer in the shell (Rust sleeps, the Descall+ repeating ticks, shim
 *    setInterval). Each entry says when it runs and why it is bounded. A new sleep, poll or
 *    interval fails here until it is added with a reason: a forgotten poll keeps the CPU awake
 *    for the whole run of a tray app.
 * 2. The main window's WebView2 memory target goes low in the tray (webview::update_main_memory,
 *    descall_shell::memory_target) and back to normal when it is shown or a call starts; the
 *    page is never suspended (sockets, sounds and calls run in the tray).
 * 3. The Descall+ bus timers are async tasks, not an OS thread per tick.
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const DESKTOP = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel) => readFileSync(join(DESKTOP, rel), "utf8");
const code = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"])\/\/.*$/gm, "$1");

function walk(dir, ext, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "target" || name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, ext, out);
    else if (name.endsWith(ext)) out.push(relative(DESKTOP, p).split("\\").join("/"));
  }
  return out;
}

// ---- 1. inventory ------------------------------------------------------------------------
// file -> [count, "when it runs / why it is bounded"]. Counted: thread::sleep(, time::sleep(,
// Host::every( and Poll::start(h, "..." (Descall+ repeating ticks), outside #[cfg(test)].
const RUST = {
  "app/src-tauri/src/boot.rs": [4, "window-state save debounce 400 ms (one-shot); paint watchdog every 2 s until the first paint of a document; tell_page_if_away checks twice (2 s, 6 s) after a load in the tray, then stops; transparency watcher waits on RegNotifyChangeKeyValue, 3 s only if that call fails"],
  "app/src-tauri/src/main.rs": [1, "ready fallback, one-shot after start"],
  "app/src-tauri/src/state.rs": [1, "quit: page unload grace 400 ms before exit (one-shot)"],
  "app/src-tauri/src/tray_menu.rs": [2, "tray panel destroyed after it stayed hidden (one-shot); show delay (one-shot)"],
  "app/src-tauri/src/webview.rs": [2, "memory target low after 30 s in the tray (one-shot per hide); hung page asked once 10 s into a hang (one-shot per hang)"],
  "app/src-tauri/src/migration.rs": [3, "first run after the Electron migration only: auth retries (bounded tries), commit wait (bounded), legacy cleanup after 30 s"],
  "app/src-tauri/src/commands/notify.rs": [3, "capsule slide (8 x 15 ms per move), capsule expiry (one-shot per capsule), focus-check delay (one-shot)"],
  "app/src-tauri/src/commands/updates.rs": [3, "update check every 5 min (Electron UPDATE_CHECK_INTERVAL_MS), first one 45 s after start; install poll only while an update is staged"],
  "app/src-tauri/src/premium/mod.rs": [3, "bus timer task (one-shot debounces); Host::every for the features below; entitlement re-verify wait"],
  "app/src-tauri/src/premium/features/mod.rs": [1, "Poll::start (the repeating features below)"],
  "app/src-tauri/src/premium/features/app_lock.rs": [1, "Descall+ app lock on: idle check every 15 s (Electron app_lock.cjs)"],
  "app/src-tauri/src/premium/features/desktop_automations.rs": [1, "Descall+ automations on: idle check every 15 s (Electron desktop_automations.cjs)"],
  "app/src-tauri/src/premium/features/focus_mode.rs": [1, "Descall+ focus mode running: minute refresh (Electron focus_mode.cjs)"],
  "app/src-tauri/src/premium/features/screen_edge_actions.rs": [1, "Descall+ screen edge actions on: one GetCursorPos every 120 ms (Electron POLL_MS 120)"],
  "app/src-tauri/src/premium/features/instant_clip.rs": [1, "after a clip is saved (one-shot)"],
  "app/src-tauri/src/premium/features/multi_account.rs": [1, "removing an account: profile folder delete retries (10 x 500 ms)"],
  "crates/descall-shell/src/durable.rs": [1, "saving the login / settings file only: rename retry while Windows holds the file (6 x 100 ms, bounded, one-shot per save)"],
  "crates/descall-capture/src/wgc.rs": [1, "screen share running: drain wait on stop (bounded 5 s)"],
  "crates/descall-capture/src/helper.rs": [2, "screen share running: helper stop wait (bounded 3 s); stats every 500 ms while the helper runs"],
};
const RUST_RE = /thread::sleep\(|time::sleep\(|\.every\(|\.start\(h, "/g;
const rustFiles = [
  ...walk(join(DESKTOP, "app/src-tauri/src"), ".rs"),
  ...walk(join(DESKTOP, "crates/descall-shell/src"), ".rs"),
  ...walk(join(DESKTOP, "crates/descall-capture/src"), ".rs"),
];
const found = {};
for (const f of rustFiles) {
  // Unit tests may sleep; only shipped code counts.
  const text = code(read(f)).split(/#\[cfg\(test\)\]/)[0];
  const n = (text.match(RUST_RE) || []).length;
  if (n) found[f] = n;
}
for (const [f, n] of Object.entries(found)) {
  assert.ok(RUST[f], `${f}: ${n} new sleep / poll(s). Add it to the inventory in idle-perf.test.mjs with when it runs and why it stops (or make it event-driven).`);
  assert.equal(n, RUST[f][0], `${f}: ${n} sleeps / polls, inventory says ${RUST[f][0]} (${RUST[f][1]}). Update the entry with the reason.`);
}
for (const f of Object.keys(RUST)) assert.ok(found[f], `${f}: inventory entry without a timer any more: remove it`);

// Repeating Descall+ ticks: the interval each feature asks for (Electron parity, none faster).
const POLLS = {
  "app/src-tauri/src/premium/features/app_lock.rs": 15_000,
  "app/src-tauri/src/premium/features/desktop_automations.rs": 15_000,
  "app/src-tauri/src/premium/features/focus_mode.rs": 60_000,
  "app/src-tauri/src/premium/features/screen_edge_actions.rs": 120,
};
for (const [f, ms] of Object.entries(POLLS)) {
  const m = /\.start\(h, "[a-z_]+", "[a-z_]+", ([\d_]+)\)/.exec(code(read(f)));
  assert.ok(m, `${f}: Poll::start`);
  assert.equal(Number(m[1].replace(/_/g, "")), ms, `${f}: poll interval`);
}

// Shims: repeating timers only while something runs.
const SHIM_INTERVALS = {
  "app/shim/native-screen-share.js": [1, "screen share running: black-picture check every 2 s, cleared once the hint was shown or the share ends"],
  "app/shim/premium-shim.js": [1, "native instant-clip recorder running: info every 1 s, cleared when it stops"],
};
for (const f of walk(join(DESKTOP, "app/shim"), ".js")) {
  if (/\.test\.|\.e2e\./.test(f)) continue;
  const n = (code(read(f)).match(/setInterval\(/g) || []).length;
  if (!n) continue;
  assert.ok(SHIM_INTERVALS[f], `${f}: new setInterval in a shim. Add it to SHIM_INTERVALS with when it stops.`);
  assert.equal(n, SHIM_INTERVALS[f][0], `${f}: setInterval count (${SHIM_INTERVALS[f][1]})`);
}
{
  const share = code(read("app/shim/native-screen-share.js"));
  assert.match(share, /clearInterval\(s\.hintTimer\)/, "screen-share hint poll is cleared");
  const premium = code(read("app/shim/premium-shim.js"));
  assert.match(premium, /clearInterval\(this\.timer\)/, "clip info poll is cleared");
}

// ---- 2. memory target in the tray ---------------------------------------------------------
{
  const boot = code(read("app/src-tauri/src/boot.rs"));
  const vis = /fn visibility<R: Runtime>\(w: &WebviewWindow<R>, backgrounded: bool\) \{([\s\S]*?)\n\}/.exec(boot);
  assert.ok(vis, "boot.rs visibility()");
  assert.match(vis[1], /crate::webview::update_main_memory\(w\.app_handle\(\)\)/, "hide / minimize / restore / focus re-evaluate the memory target");
  const state = code(read("app/src-tauri/src/state.rs"));
  const show = /pub fn show_main<R: Runtime>[\s\S]*?\n\}/.exec(state);
  assert.match(show[0], /crate::webview::update_main_memory\(app\)/, "show_main (tray click, notification, second launch) sets it back to normal");
  assert.match(state, /pub memory: Mutex<descall_shell::memory_target::Target>/, "Shell keeps the applied target");
  const main = code(read("app/src-tauri/src/main.rs"));
  assert.ok(/StartAction::Hide => \{\s*log::info![^\n]*\n\s*webview::update_main_memory\(&handle\);/.test(main), "a start in the tray (no hide event) also gets the low target");
  const app = code(read("app/src-tauri/src/commands/app.rs"));
  const busy = /pub fn voice_set_busy[\s\S]*?\n\}/.exec(app);
  assert.match(busy[0], /update_main_memory\(&app\)/, "a call starting in the tray restores the normal target");
  const wv = code(read("app/src-tauri/src/webview.rs"));
  assert.match(wv, /ICoreWebView2_19/, "MemoryUsageTargetLevel through ICoreWebView2_19");
  assert.match(wv, /SetMemoryUsageTargetLevel\(level\)/);
  assert.match(wv, /let level = main_memory_level\(app, &w\);\s*let step = crate::state::shell\(app\)\.memory\.lock\(\)/, "the window is read before the lock is taken");
  assert.match(wv, /voice_busy\.load\([^)]*\) \|\| crate::commands::overlay::is_visible\(app\)/, "busy = call / ring / server voice / share, or the in-call card");
  for (const f of rustFiles) assert.doesNotMatch(code(read(f)), /TrySuspend/, `${f}: never suspend a webview (sockets, sounds and calls run in the tray)`);
  const mt = read("crates/descall-shell/src/memory_target.rs");
  const after = Number((/pub const LOW_AFTER_MS: u64 = ([\d_]+);/.exec(mt) || [])[1]?.replace(/_/g, ""));
  assert.ok(after >= 10_000, "low only after the window stayed in the background a while");
  assert.match(read("crates/descall-shell/src/lib.rs"), /pub mod memory_target;/);
}

// ---- 3. bus timers ------------------------------------------------------------------------
{
  const premium = code(read("app/src-tauri/src/premium/mod.rs"));
  const after = /pub fn after\(&self, ms: u64, ev: Bus\) \{([\s\S]*?)\n    \}/.exec(premium);
  assert.ok(after, "Host::after");
  assert.match(after[1], /tauri::async_runtime::spawn\(async move/, "one-shot bus timers are async tasks");
  assert.doesNotMatch(after[1], /std::thread::spawn/, "no OS thread per debounce tick");
}

console.log("idle-perf.test: ok");
