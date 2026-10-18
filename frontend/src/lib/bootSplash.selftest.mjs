// Boot splash watchdog (2.11.5). Runs the real inline scripts from index.html in
// a tiny fake DOM with a manual clock. Run from frontend/: node src/lib/bootSplash.selftest.mjs
// Regression: an app boot with a token got TWO #boot-splash nodes (the app-shell
// safety net injects one before the static markup is parsed). Dismiss / failure /
// retry only touched the first; the second painted on top forever (Electron
// "stuck on the splash", screenshot A).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, "..", "..", "index.html"), "utf8");
const preload = readFileSync(join(here, "..", "..", "electron", "preload.cjs"), "utf8");
const main = readFileSync(join(here, "..", "..", "electron", "main.cjs"), "utf8");

function inlineScript(marker) {
  const re = /<script>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html))) if (m[1].includes(marker)) return m[1];
  throw new Error(`inline script not found: ${marker}`);
}
const safetyNet = inlineScript("Safety net: prerender used to strip #boot-splash");
const splashScript = inlineScript("Boot splash only, prerender strips this with #boot-splash");

// ---- fake DOM ---------------------------------------------------------------
class ClassList {
  constructor() { this.set = new Set(); }
  add(...c) { c.forEach((x) => this.set.add(x)); }
  remove(...c) { c.forEach((x) => this.set.delete(x)); }
  contains(c) { return this.set.has(c); }
  toggle(c, on) { if (on ?? !this.set.has(c)) this.set.add(c); else this.set.delete(c); }
}
class El {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.attrs = {};
    this.classList = new ClassList();
    this.style = { setProperty() {} };
    this._text = "";
    this.listeners = {};
    this.height = 0;
  }
  get id() { return this.attrs.id || ""; }
  set id(v) { this.attrs.id = v; }
  get className() { return [...this.classList.set].join(" "); }
  set className(v) { this.classList = new ClassList(); String(v).split(/\s+/).filter(Boolean).forEach((c) => this.classList.add(c)); }
  setAttribute(k, v) { if (k === "class") this.className = v; else this.attrs[k] = String(v); }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  removeAttribute(k) { delete this.attrs[k]; }
  appendChild(c) { c.parentNode = this; this.children.push(c); return c; }
  insertBefore(c, ref) {
    c.parentNode = this;
    const i = ref ? this.children.indexOf(ref) : -1;
    if (i < 0) this.children.push(c); else this.children.splice(i, 0, c);
    return c;
  }
  removeChild(c) { this.children = this.children.filter((x) => x !== c); c.parentNode = null; return c; }
  get firstChild() { return this.children[0] || null; }
  get firstElementChild() { return this.children[0] || null; }
  get childElementCount() { return this.children.length; }
  set innerHTML(markup) { this.children = []; parseInto(this, markup); }
  set textContent(v) { this._text = String(v); this.children = []; }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(""); }
  get innerText() { return this.textContent; }
  addEventListener(t, fn) { (this.listeners[t] ||= []).push(fn); }
  click() { (this.listeners.click || []).forEach((fn) => fn({})); }
  focus() {}
  getBoundingClientRect() { return { height: this.height, width: 800 }; }
  get offsetHeight() { return 0; }
  walk(fn) { fn(this); this.children.forEach((c) => c.walk(fn)); }
  matches(sel) {
    if (sel.startsWith("#")) return this.id === sel.slice(1);
    if (sel.startsWith(".")) return this.classList.contains(sel.slice(1));
    return this.tagName === sel.toUpperCase();
  }
  querySelectorAll(sel) { const out = []; this.children.forEach((c) => c.walk((n) => { if (n.matches(sel)) out.push(n); })); return out; }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
}
// Enough of a parser for the splash markup: <tag attrs>…</tag>, <img …>.
function parseInto(parent, markup) {
  const re = /<(\/?)([a-z0-9]+)([^>]*)>|([^<]+)/gi;
  const stack = [parent];
  let m;
  while ((m = re.exec(markup))) {
    const top = stack[stack.length - 1];
    if (m[4]) { if (m[4].trim()) top._text += m[4].trim(); continue; }
    if (m[1]) { stack.pop(); continue; }
    const el = new El(m[2]);
    m[3].replace(/([a-z-]+)="([^"]*)"/gi, (_, k, v) => el.setAttribute(k, v));
    top.appendChild(el);
    if (!/^(img|br|input)$/i.test(m[2]) && !/\/\s*$/.test(m[3])) stack.push(el);
  }
}
const STATIC_SPLASH = '<div id="boot-splash" role="progressbar"><div class="boot-orb boot-orb--a"></div><div class="boot-card"><div class="boot-mark"><img id="boot-logo" src="/brand/descall-icon.png"></div><div class="boot-title">Descall</div><div class="boot-bar"><i></i></div><p class="boot-status" id="boot-status">Starting</p></div></div>';

function makeWorld({ electron = true, token = true, autoRetryUsed = false } = {}) {
  let now = 1_000_000;
  let seq = 0;
  const timers = new Map();
  const add = (fn, ms, every) => { const id = ++seq; timers.set(id, { fn, at: now + Math.max(0, ms || 0), every }); return id; };
  const clear = (id) => timers.delete(id);
  const advance = (ms) => {
    const end = now + ms;
    for (;;) {
      let next = null;
      for (const [id, t] of timers) if (t.at <= end && (!next || t.at < next[1].at)) next = [id, t];
      if (!next) break;
      const [id, t] = next;
      now = t.at;
      if (t.every) t.at = now + t.every; else timers.delete(id);
      t.fn();
    }
    now = end;
  };
  const documentElement = new El("html");
  const body = new El("body");
  const root = new El("div");
  root.id = "root";
  body.appendChild(root);
  const byId = (id) => { let f = null; body.walk((n) => { if (!f && n.id === id) f = n; }); return f; };
  const document = {
    documentElement, body,
    getElementById: byId,
    querySelectorAll: (s) => body.querySelectorAll(s),
    querySelector: (s) => body.querySelector(s),
    createElement: (t) => new El(t),
  };
  const ls = new Map(token ? [["descall_token", "tok"]] : []);
  const ss = new Map(autoRetryUsed ? [["descall:boot-auto-retry", String(now - 1000)]] : []);
  const store = (m) => ({ getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) });
  const calls = { reload: 0, retryBoot: 0 };
  const window = {
    document,
    localStorage: store(ls),
    sessionStorage: store(ss),
    navigator: { userAgent: electron ? "Mozilla/5.0 Electron/41" : "Mozilla/5.0 Chrome", language: "tr-TR" },
    location: { pathname: "/index.html", protocol: "descall:", search: "", reload: () => { calls.reload += 1; } },
    innerWidth: 1280,
    setTimeout: add,
    clearTimeout: clear,
    setInterval: (fn, ms) => add(fn, ms, ms),
    clearInterval: clear,
    requestAnimationFrame: (fn) => add(fn, 16),
    Date: { now: () => now },
    Intl,
    __descallBootHolds: 0,
  };
  if (electron) window.electronAPI = { isElectron: true, retryBoot: () => { calls.retryBoot += 1; } };
  window.window = window;
  const ctx = vm.createContext({ ...window, window, document, localStorage: window.localStorage, sessionStorage: window.sessionStorage, navigator: window.navigator, location: window.location, Date: { now: () => now }, Number, String, Math });
  // The globals the scripts read must be the same object as window.*
  Object.defineProperty(ctx, "__descallBootHolds", { get: () => window.__descallBootHolds, set: (v) => { window.__descallBootHolds = v; } });
  const run = (src) => vm.runInContext(src, ctx);
  return {
    ctx, window, document, body, root, calls, advance, run,
    parseStaticSplash() { const holder = new El("div"); holder.innerHTML = STATIC_SPLASH; const s = holder.children[0]; body.insertBefore(s, null); },
    splashes: () => body.querySelectorAll("#boot-splash"),
    paintApp() { const shell = new El("div"); shell._text = "Sohbetler"; root.appendChild(shell); root.height = 600; },
  };
}

function boot(opts) {
  const w = makeWorld(opts);
  w.run(safetyNet);     // runs before the static markup is parsed
  w.parseStaticSplash(); // parser reaches <div id="boot-splash">
  w.run(splashScript);   // the script right after it
  return w;
}

// 1. Exactly one splash after parse, on every platform (was 2 on Electron / desktop with a token).
{
  const w = boot({ electron: true });
  assert.equal(w.splashes().length, 1, "Electron app boot keeps exactly one #boot-splash");
  const web = boot({ electron: false });
  assert.equal(web.splashes().length, 1, "desktop web app boot keeps exactly one #boot-splash");
}

// 2. App paints late (after the 1.8s timer and every other dismiss call): splash still goes away.
{
  const w = boot({ electron: true });
  w.advance(1800);              // inline failsafe → not painted → waitForPaint
  w.ctx.window.__descallDismissBootSplash({ minMs: 450, maxMs: 1800 }); // main.jsx / App.jsx calls
  w.advance(4000);
  w.paintApp();
  w.advance(1000);
  assert.equal(w.splashes().length, 0, "a late paint removes every splash node");
}

// 3. App never paints: one automatic retry (Electron: retryBoot clears SW/cache), no failure yet.
{
  const w = boot({ electron: true });
  w.advance(1800 + 40 * 300 + 50);
  assert.equal(w.calls.retryBoot, 1, "watchdog retries the boot once through electronAPI.retryBoot");
  assert.equal(w.calls.reload, 0);
}

// 4. Retry already used in this session: the VISIBLE splash shows the error + "Tekrar dene".
{
  const w = boot({ electron: true, autoRetryUsed: true });
  w.advance(1800 + 40 * 300 + 50);
  const [splash] = w.splashes();
  assert.ok(splash, "splash still up");
  assert.equal(splash.getAttribute("data-boot-failed"), "1", "the on-screen splash is the one marked failed");
  const btn = splash.querySelector(".boot-retry");
  assert.ok(btn, "retry button is on the visible splash");
  assert.equal(btn.textContent, "Tekrar dene");
  assert.match(splash.querySelector(".boot-status").textContent, /Descall açılamadı/);
  btn.click();
  assert.equal(w.calls.retryBoot, 1, "Tekrar dene → electronAPI.retryBoot");
  // A paint after the failure still clears it.
  w.paintApp();
  w.advance(1000);
  assert.equal(w.splashes().length, 0, "late paint after the failure removes the splash");
}

// 5. Web (no bridge): retry falls back to location.reload().
{
  const w = boot({ electron: false });
  w.advance(1800 + 40 * 300 + 50);
  assert.equal(w.calls.reload, 1, "web watchdog reloads once");
}

// 6. boot().catch → __descallBootFailed marks the splash the user actually sees.
{
  const w = boot({ electron: true });
  w.ctx.window.__descallBootFailed();
  const all = w.splashes();
  assert.ok(all.length >= 1 && all.every((s) => s.getAttribute("data-boot-failed") === "1"));
}

// 7. Bridge wiring: preload exposes retryBoot, main clears only SW + Cache Storage + HTTP cache.
assert.match(preload, /retryBoot:\s*\(\)\s*=>\s*ipcRenderer\.send\('app:boot-retry'\)/);
assert.match(main, /ipcMain\.on\('app:boot-retry'/);
assert.match(main, /clearStorageData\(\{\s*storages:\s*BOOT_RETRY_STORAGES\s*\}\)/);
assert.match(main, /reloadIgnoringCache\(\)/);

console.log("bootSplash.selftest: ok");
