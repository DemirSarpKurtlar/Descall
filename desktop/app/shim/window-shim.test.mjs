// Window behaviour of the Tauri shim (electron-api-shim.js): title bar maximize state,
// F11, zoom across a reload. Run: node desktop/app/shim/window-shim.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const shimSrc = readFileSync(join(here, "electron-api-shim.js"), "utf8");

const memoryStore = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m };
};

/** The shim in a vm with a fake Tauri bridge. `responses[cmd]` may be a value or a function returning a promise. */
function loadShim({ boot = {}, responses = {}, sessionStorage = memoryStore() } = {}) {
  const invokes = [];
  const listeners = new Map();
  const winListeners = new Map();
  const answer = (cmd, args) => {
    invokes.push([cmd, args]);
    const r = responses[cmd];
    return typeof r === "function" ? r(args) : Promise.resolve(r ?? null);
  };
  const window = {
    __DESCALL_BOOT__: boot,
    __TAURI_INTERNALS__: { invoke: answer, transformCallback: () => 1 },
    __TAURI__: {
      core: { invoke: answer },
      event: {
        listen: (event, handler) => {
          if (!listeners.has(event)) listeners.set(event, []);
          listeners.get(event).push(handler);
          return Promise.resolve(() => listeners.set(event, listeners.get(event).filter((h) => h !== handler)));
        },
      },
    },
    addEventListener: (type, fn) => { if (!winListeners.has(type)) winListeners.set(type, []); winListeners.get(type).push(fn); },
  };
  window.top = window;
  const ctx = {
    window,
    document: { addEventListener: () => {}, documentElement: { classList: { add() {} } } },
    localStorage: memoryStore(),
    sessionStorage,
    location: { href: "https://tauri.localhost/", origin: "https://tauri.localhost" },
    URL,
    console: { log() {}, warn() {}, error: console.error },
    Promise,
    Uint8Array,
    ArrayBuffer,
  };
  vm.createContext(ctx);
  vm.runInContext(shimSrc, ctx, { filename: "electron-api-shim.js" });
  const emit = (event, payload) => (listeners.get(event) || []).forEach((h) => h({ payload }));
  const key = (k, mods = {}) => {
    const ev = { key: k, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, repeat: false, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...mods };
    for (const fn of winListeners.get("keydown") || []) fn(ev);
    return ev;
  };
  return { api: window.electronAPI, invokes, emit, key, sessionStorage };
}
const tick = () => new Promise((r) => setTimeout(r, 0));
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };

// 1. A window that starts maximized (window-state.json) shows the Restore button. The shell
//    maximized it before the page subscribed, so only the answer at subscribe time tells.
{
  const s = loadShim({ responses: { "plugin:window|is_maximized": true } });
  const got = [];
  s.api.onMaximizedChange((v) => got.push(v));
  await tick();
  assert.deepEqual(got, [true], "the current maximized state reaches the title bar at once");
  assert.ok(s.invokes.some(([c]) => c === "plugin:window|is_maximized"), "asks the window plugin");
  s.emit("window:maximized", false);
  assert.deepEqual(got, [true, false], "later events still arrive");
}
{
  // An event that arrives before the answer wins: the late answer must not undo it.
  const d = deferred();
  const s = loadShim({ responses: { "plugin:window|is_maximized": () => d.promise } });
  const got = [];
  s.api.onMaximizedChange((v) => got.push(v));
  await tick();
  s.emit("window:maximized", false);
  d.resolve(true);
  await tick();
  assert.deepEqual(got, [false], "a real event is newer than the subscribe-time answer");
}
{
  // Unsubscribed before the answer: no callback on an unmounted title bar.
  const d = deferred();
  const s = loadShim({ responses: { "plugin:window|is_maximized": () => d.promise } });
  const got = [];
  const off = s.api.onMaximizedChange((v) => got.push(v));
  off();
  d.resolve(true);
  await tick();
  assert.deepEqual(got, [], "no callback after unsubscribe");
}
{
  // The query failing (old capability) leaves the listener working.
  const s = loadShim({ responses: { "plugin:window|is_maximized": () => Promise.reject(new Error("denied")) } });
  const got = [];
  s.api.onMaximizedChange((v) => got.push(v));
  await tick();
  s.emit("window:maximized", true);
  assert.deepEqual(got, [true]);
}

// 2. F11 maximizes / restores like Electron's windowKeys.cjs; never with modifiers or on repeat.
{
  const s = loadShim();
  const n = () => s.invokes.filter(([c]) => c === "window_toggle_maximize").length;
  assert.equal(s.key("F11").defaultPrevented, true, "F11 is handled");
  assert.equal(n(), 1, "F11 toggles maximize");
  s.key("F11", { repeat: true });
  s.key("F11", { ctrlKey: true });
  s.key("F11", { altKey: true });
  s.key("F11", { shiftKey: true });
  assert.equal(n(), 1, "no toggle on auto-repeat or with modifiers");
  s.key("F10");
  assert.equal(n(), 1);
}

// 3. zoom.get after a reload (boot retry): WebView2 keeps the zoom, the shim must too.
{
  const session = memoryStore();
  const a = loadShim({ sessionStorage: session });
  assert.equal(a.api.zoom.get(), 1, "a fresh start is at 100 %");
  a.api.zoom.set(1.5);
  assert.equal(a.api.zoom.get(), 1.5);
  assert.deepEqual(a.invokes.filter(([c]) => c === "window_set_zoom").map(([, x]) => x.factor), [1.5]);
  const b = loadShim({ sessionStorage: session });
  assert.equal(b.api.zoom.get(), 1.5, "the reloaded page reads the zoom WebView2 kept");
  b.api.zoom.set(7);
  assert.equal(b.api.zoom.get(), 1.5, "out-of-range values are ignored");
  session.setItem("__descall_zoom", "abc");
  assert.equal(loadShim({ sessionStorage: session }).api.zoom.get(), 1, "a bad stored value falls back to 1");
}

console.log("window-shim.test: ok");
