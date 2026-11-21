// Calls and media on Tauri: shell rules that keep a call from freezing or losing media.
// Run: node desktop/app/shim/media-calls.test.mjs   (CI: tauri-build.yml)
//
// 1. No sync #[tauri::command] builds a window (directly or through a helper). Sync commands
//    run inside WebView2's IPC callback on the UI thread; building a WebView2 there deadlocks
//    on Windows (WebviewWindowBuilder::build docs). overlay_show (in-call mini card, first
//    call at call start) and notification_show (incoming call capsule) did exactly that.
// 2. Every window shares the main window's WebView2 browser arguments (one environment:
//    autoplay without a gesture for ringtones, no background throttling during calls).
// 3. The CSP lets the noise suppression worklets / WASM and the screen share sinks run.
// 4. The page-side media helpers in electron-api-shim.js (see the cases below).
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const srcRoot = process.env.DESCALL_TAURI_SRC || join(here, "..", "src-tauri", "src");
const tauriConf = JSON.parse(readFileSync(join(here, "..", "src-tauri", "tauri.conf.json"), "utf8"));

// ---- a small Rust reader: strip comments / strings, find fn bodies ------------------------------
function stripRust(src) {
  let out = "";
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (c === "/" && n === "/") { while (i < src.length && src[i] !== "\n") i += 1; continue; }
    if (c === "/" && n === "*") { const e = src.indexOf("*/", i + 2); i = e < 0 ? src.length : e + 2; out += " "; continue; }
    const raw = /^r(#*)"/.exec(src.slice(i, i + 12));
    if (raw && !/[\w]/.test(src[i - 1] || "")) {
      const close = `"${raw[1]}`;
      const e = src.indexOf(close, i + raw[0].length);
      i = e < 0 ? src.length : e + close.length;
      out += '""';
      continue;
    }
    if (c === '"') {
      i += 1;
      while (i < src.length && src[i] !== '"') i += src[i] === "\\" ? 2 : 1;
      i += 1;
      out += '""';
      continue;
    }
    if (c === "'") {
      const ch = /^'(?:\\.[^']*|[^\\'])'/.exec(src.slice(i, i + 12));
      if (ch) { i += ch[0].length; out += "' '"; continue; }
    }
    out += c;
    i += 1;
  }
  return out;
}

/** fn name -> { body, isCommand, isAsync } for one file (methods included by bare name). */
function functions(code) {
  const fns = [];
  const re = /((?:#\[[^\]]*\]\s*)*)(pub(?:\([^)]*\))?\s+)?(async\s+)?(?:unsafe\s+)?fn\s+(\w+)/g;
  let m;
  while ((m = re.exec(code))) {
    let j = code.indexOf("{", m.index + m[0].length);
    const semi = code.indexOf(";", m.index + m[0].length);
    if (j < 0 || (semi >= 0 && semi < j)) continue; // trait method without body
    let depth = 0;
    const start = j;
    for (; j < code.length; j += 1) {
      if (code[j] === "{") depth += 1;
      else if (code[j] === "}") { depth -= 1; if (depth === 0) break; }
    }
    fns.push({ name: m[4], attrs: m[1] || "", isAsync: Boolean(m[3]), body: code.slice(start, j + 1) });
    re.lastIndex = start + 1;
  }
  return fns.map((f) => ({ ...f, isCommand: /#\[tauri::command/.test(f.attrs) }));
}

function rustFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) rustFiles(p, out);
    else if (name.endsWith(".rs")) out.push(p);
  }
  return out;
}

const files = rustFiles(srcRoot).map((p) => {
  const stem = basename(p, ".rs") === "mod" ? basename(dirname(p)) : basename(p, ".rs");
  const code = stripRust(readFileSync(p, "utf8"));
  return { path: p, stem, code, fns: functions(code) };
});

/** Fns that build a window, directly or by calling one that does (same file or module::fn). */
function windowBuilders() {
  const key = (f, fn) => `${f.stem}::${fn.name}`;
  const creators = new Set();
  for (const f of files) for (const fn of f.fns) if (/\bWebview(?:Window)?Builder::new\b/.test(fn.body)) creators.add(key(f, fn));
  let grew = true;
  while (grew) {
    grew = false;
    for (const f of files) {
      for (const fn of f.fns) {
        const k = key(f, fn);
        if (creators.has(k)) continue;
        const calls = [...fn.body.matchAll(/(?:(\w+)::)?(\w+)\s*(?:::<[^>]*>)?\s*\(/g)];
        const hit = calls.some(([, mod, name]) => {
          if (!mod || mod === "self" || mod === "Self" || mod === "super") return creators.has(`${f.stem}::${name}`);
          return creators.has(`${mod}::${name}`);
        });
        if (hit) { creators.add(k); grew = true; }
      }
    }
  }
  return creators;
}

{
  assert.ok(files.length > 10, `Rust sources found under ${srcRoot}`);
  const creators = windowBuilders();
  assert.ok(creators.has("overlay::ensure"), "overlay::ensure builds the overlay window");
  assert.ok(creators.has("notify::show_capsule"), "notify::show_capsule builds a capsule window");
  const bad = [];
  let commands = 0;
  for (const f of files) {
    for (const fn of f.fns) {
      if (!fn.isCommand) continue;
      commands += 1;
      if (!fn.isAsync && creators.has(`${f.stem}::${fn.name}`)) bad.push(`${f.stem}::${fn.name}`);
    }
  }
  assert.ok(commands > 30, "commands found");
  assert.deepEqual(bad, [], `sync commands that build a window (deadlock on Windows; make them async): ${bad.join(", ")}`);
}

// ---- 2. one WebView2 environment: every builder passes BROWSER_ARGS or shares the opener ------
{
  const mainRs = files.find((f) => f.path.endsWith(join("src", "main.rs")));
  const argsSrc = readFileSync(mainRs.path, "utf8");
  const args = /BROWSER_ARGS: &str = "([^"]+)"/s.exec(argsSrc)[1].replace(/\\\n\s*/g, "");
  assert.match(args, /--autoplay-policy=no-user-gesture-required/, "ringtones and join sounds play without a gesture");
  assert.match(args, /--disable-background-timer-throttling/, "call timers keep running in the background");
  assert.match(args, /--disable-renderer-backgrounding/, "a minimised call keeps its renderer priority");

  // WebView2 refuses a second environment on the same user data folder with other options
  // (HRESULT_FROM_WIN32(ERROR_INVALID_STATE)): a builder without BROWSER_ARGS does not open at
  // all next to the main window. window_features() reuses the opener's environment instead.
  const missing = [];
  for (const f of files) {
    for (const m of f.code.matchAll(/WebviewWindowBuilder::new\(/g)) {
      const chain = f.code.slice(m.index, f.code.indexOf(".build()", m.index));
      if (!/\.additional_browser_args\(\s*(?:crate::)?BROWSER_ARGS\s*\)/.test(chain) && !/\.window_features\(/.test(chain)) {
        const line = f.code.slice(0, m.index).split("\n").length;
        missing.push(`${f.stem}.rs:${line}`);
      }
    }
  }
  assert.deepEqual(missing, [], `window builders without BROWSER_ARGS (fail to open, or ring without autoplay): ${missing.join(", ")}`);

  // Windows that can hold a call grant the microphone / camera without WebView2's prompt,
  // like the main window (Electron: the session permission handlers covered every window).
  for (const [file, label] of [["premium/features/multi_window.rs", "pop-out"], ["premium/features/multi_account.rs", "account window"]]) {
    const code = stripRust(readFileSync(join(srcRoot, file), "utf8"));
    assert.match(code, /install_permission_handler\(/, `${label}: media permission handler`);
  }
}

// ---- 2a. the mini call card never takes focus (Electron: showInactive)
{
  const ov = stripRust(readFileSync(join(srcRoot, "commands", "overlay.rs"), "utf8"));
  const chain = ov.slice(ov.indexOf("WebviewWindowBuilder::new("), ov.indexOf(".build()", ov.indexOf("WebviewWindowBuilder::new(")));
  assert.match(chain, /\.focusable\(false\)/, "show() would activate the card: keyboard / game focus lost when a call starts");
}

// ---- 2b. a reload ends the call: the mini call card goes too (Electron resetVoiceBusyFromLifecycle)
{
  const main = stripRust(readFileSync(join(srcRoot, "main.rs"), "utf8"));
  const started = main.slice(main.indexOf("PageLoadEvent::Started"), main.indexOf("PageLoadEvent::Finished"));
  assert.match(started, /reset_voice\(/, "busy flags reset on reload");
  assert.match(started, /overlay::overlay_hide\(/, "a stale card would stay on top and keep updates deferred");
}

// ---- 3. CSP for the media pipeline --------------------------------------------------------------
{
  const csp = tauriConf.app.security.csp;
  assert.match(csp["script-src"], /'wasm-unsafe-eval'/, "noise suppression WASM (GTCRN / RNNoise / Speex) compiles");
  assert.match(csp["script-src"], /'self'/, "AudioWorklet modules load from the app origin");
  assert.match(csp["worker-src"], /blob:/, "screen share VideoTrackGenerator worker (blob:)");
  assert.match(csp["media-src"], /blob:/, "recorded voice messages and generated audio (blob:)");
  assert.match(csp["media-src"], /data:/, "call keep-alive silent WAV (data:)");
  for (const host of ["https://*.supabase.co", "https://descall.com"]) {
    assert.ok(csp["media-src"].includes(host), `custom ringtones / sounds from ${host}`);
  }
  assert.match(csp["connect-src"], /wss:\/\/\*\.livekit\.cloud/, "LiveKit signalling");
  // Windows + use_https_scheme(true): Tauri's IPC is https://ipc.localhost (core.js
  // convertFileSrc). "http://ipc.localhost" covers it (CSP3 lets an http: source match https:,
  // checked in Chromium at the Tauri origin), so the IPC never falls back to postMessage.
  assert.ok(csp["connect-src"].split(/\s+/).includes("http://ipc.localhost"), "app pages: IPC allowed");
  const pagesRs = readFileSync(join(here, "..", "..", "crates", "descall-shell", "src", "pages.rs"), "utf8");
  const shellCsp = /pub const CSP: &str = "([^"]+)"/.exec(pagesRs)[1];
  assert.ok(/connect-src[^;]*https?:\/\/ipc\.localhost/.test(shellCsp), "shell pages (mini call card, capsules): IPC allowed");
}

console.log("media-calls.test: ok");
