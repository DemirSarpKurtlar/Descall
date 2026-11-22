// Tauri title bar (owner reports, desktop 4.0.1): dead window buttons and a blurred bar over
// modals. In html.tauri-app the bar has no CSS drag region (WebView2 made it a native caption
// that swallowed the button clicks), drags through data-tauri-drag-region, and is never blurred.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, "titlebar.css"), "utf8");
const jsx = readFileSync(join(here, "..", "components", "TitleBar.jsx"), "utf8");
const shim = readFileSync(join(here, "..", "..", "..", "desktop", "app", "shim", "electron-api-shim.js"), "utf8");

assert.match(jsx, /className="titlebar" role="banner" data-tauri-drag-region="deep"/, "Tauri drags from the bar (buttons excluded by Tauri's drag script)");
assert.match(css, /html\.tauri-app \.titlebar,\s*html\.tauri-app \.titlebar \* \{[^}]*-webkit-app-region:\s*no-drag;[^}]*app-region:\s*no-drag;/, "no WebView2 caption over the bar in Tauri");
assert.match(css, /html\.tauri-app \.titlebar::after \{[^}]*backdrop-filter:\s*none !important;/, "the bar stays sharp over modals in Tauri");
// Electron keeps its drag region.
assert.match(css, /^\.titlebar \{[^}]*-webkit-app-region:\s*drag;/m, "Electron still drags through -webkit-app-region");
assert.match(shim, /classList\.add\("tauri-app"\)/, "the Tauri shim sets html.tauri-app");

// Every other window bar (admin panel, its loading / sign-in screens, signup stats window,
// app lock) had the same CSS drag region and so the same dead buttons in Tauri.
const read = (...p) => readFileSync(join(here, "..", ...p), "utf8");
const adminShell = read("components", "admin", "AdminShell.jsx");
const adminPage = read("components", "admin", "AdminPanelPage.jsx");
const stats = read("components", "admin", "signupStats", "SignupStatsWindow.jsx");
const lock = read("premium", "gaming", "AppLockScreen.jsx");
assert.match(adminShell, /className="adm-titlebar" data-tauri-drag-region="deep" onDoubleClick=\{titleBarDoubleClick\(/, "admin bar drags in Tauri, no double toggle");
assert.equal((adminPage.match(/adm-state" data-tauri-drag-region="deep"/g) || []).length, 3, "admin loading / error screens drag in Tauri");
assert.match(stats, /className="st-tb" \{\.\.\.\(electron \? \{ "data-tauri-drag-region": "deep" \} : \{\}\)\}/, "signup stats window bar drags in Tauri (only as its own window)");
assert.match(stats, /onDoubleClick=\{electron \? titleBarDoubleClick\(/);
assert.match(lock, /className="pgl-bar" data-tauri-drag-region="deep"/, "app lock bar drags in Tauri");
assert.match(css, /html\.tauri-app \[data-tauri-drag-region\],\s*html\.tauri-app \[data-tauri-drag-region\] \*,\s*html\.tauri-app \.st3 \.st-tb,\s*html\.tauri-app \.st3 \.st-tb \* \{[^}]*-webkit-app-region:\s*no-drag !important;[^}]*app-region:\s*no-drag !important;/, "no native caption under any Tauri drag bar");
// The shell opens the stats window natively and denies window.open (null): that is "opened",
// not "show the in-app copy too".
{
  const at = stats.indexOf("export function openSignupStatsWindow");
  const body = stats.slice(at, at + 700);
  assert.match(body, /const w = window\.open\(STATS_PATH, "descall-signup-stats"\);\s*(\/\/[^\n]*\n\s*)*if \(!w && window\.electronAPI\?\.isTauri\) return true;/, "Tauri: null from window.open means the native window opened");
}
// Scene themes give #root z-index 1: inside #root the bar sat under every <body> modal.
// It renders into its own host, the first child of <body> (harness: elementFromPoint over a
// body modal hit the modal with data-theme="emberfall").
assert.match(jsx, /document\.body\.insertBefore\(host, document\.body\.firstChild\)/, "title bar host is a body layer");
assert.match(jsx, /return host \? createPortal\(bar, host\) : bar;/, "title bar is portaled out of #root");
// Body-level inert shields must leave that host alone (useModalFocus keeps ".titlebar" by
// itself; the marketing auth modal walks body children).
{
  const { inertOutside } = await import("../hooks/useModalFocus.js");
  const mk = (tag, cls = "", id = "") => {
    const n = { tagName: tag, id, inert: false, children: [], parentElement: null, ownerDocument: null,
      matches: (sel) => sel === ".titlebar" && cls === "titlebar",
      querySelector: (sel) => (function find(x) { for (const c of x.children) { if (c.matches(sel)) return c; const f = find(c); if (f) return f; } return null; })(n),
      contains: (o) => { for (let p = o; p; p = p.parentElement) if (p === n) return true; return false; },
      append(...cs) { for (const c of cs) { c.parentElement = n; n.children.push(c); } return n; } };
    return n;
  };
  const body = mk("BODY");
  const host = mk("DIV", "", "descall-titlebar-host").append(mk("DIV", "titlebar"));
  const root = mk("DIV", "", "root");
  const modal = mk("DIV", "modal");
  body.append(host, root, modal);
  const doc = { body };
  for (const n of [body, host, host.children[0], root, modal]) n.ownerDocument = doc;
  const restore = inertOutside(modal);
  assert.equal(host.children[0].inert, false, "useModalFocus keeps the title bar in its body host");
  assert.equal(host.inert, false);
  assert.equal(root.inert, true, "the app behind the modal is inert");
  restore();
  const auth = read("site", "MarketingAuthModal.jsx");
  assert.match(auth, /if \(el\.id === "descall-titlebar-host"\) continue;/, "the marketing auth modal leaves the title bar host usable");
}
// Restore glyph while maximized (was the same square, smaller).
assert.match(jsx, /isMaximized \? \([\s\S]{0,120}<svg className="win-restore-glyph"/, "restore glyph while maximized");

// App lock bar: follows the window's maximized state (round 2; it always said "Maximize").
assert.match(lock, /const maximized = useWindowMaximized\(locked\);/, "app lock subscribes to the maximized state while locked");
assert.match(lock, /api\.onMaximizedChange\(\(v\) => setMaximized\(Boolean\(v\)\)\)/);
assert.match(lock, /title=\{maximized \? t\("Restore"\) : t\("Maximize"\)\}[\s\S]{0,200}\{maximized \? \([\s\S]{0,80}<svg className="win-restore-glyph"/, "app lock bar: restore glyph and label while maximized");

// titleBarDoubleClick: maximizes in Electron, does nothing in Tauri (the drag script did it).
const { titleBarDoubleClick, inTauriShell } = await import("../lib/windowDrag.js");
let calls = 0;
const handler = titleBarDoubleClick(() => { calls += 1; });
globalThis.window = { electronAPI: { isElectron: true } };
globalThis.document = { documentElement: { classList: { contains: () => false } } };
assert.equal(inTauriShell(), false);
handler({});
assert.equal(calls, 1, "Electron: double-click maximizes");
globalThis.window = { electronAPI: { isElectron: true, isTauri: true } };
assert.equal(inTauriShell(), true);
handler({});
assert.equal(calls, 1, "Tauri: no second toggle");
globalThis.window = {};
globalThis.document = { documentElement: { classList: { contains: (c) => c === "tauri-app" } } };
assert.equal(inTauriShell(), true, "html.tauri-app also counts");
delete globalThis.window;
delete globalThis.document;

console.log("tauriTitlebar.selftest: ok");
