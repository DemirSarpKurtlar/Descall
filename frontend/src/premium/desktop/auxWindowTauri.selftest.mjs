// Descall+ portal windows (pip_call, desktop_sidebar) in the Tauri shell. WebView2 turns a CSS
// drag region into a native caption that swallowed the bar's pin / open / close clicks, so in
// html.tauri-app the bar has no CSS drag region and a press on it asks the shell to drag that
// window (plugin:window|start_dragging with the portal's label). The portal also gets the
// app's @font-face rules with absolute URLs. Electron keeps -webkit-app-region.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const jsx = readFileSync(join(here, "AuxWindow.jsx"), "utf8");
const css = readFileSync(join(here, "auxWindows.css"), "utf8");
const winsRs = readFileSync(join(here, "..", "..", "..", "..", "desktop", "app", "src-tauri", "src", "premium", "wins.rs"), "utf8");

/** An exported function of AuxWindow.jsx as a plain function (no React in it). */
function fn(name) {
  const at = jsx.indexOf(`export function ${name}(`);
  assert.ok(at >= 0, `${name} exported`);
  const end = jsx.indexOf("\n}\n", at);
  const src = jsx.slice(at, end + 2).replace(/^export /, "");
  return new Function("TAURI_PORTAL_LABEL", "document", `${src}; return ${name};`)(LABELS, undefined);
}

// Labels as the shell names the portal windows.
const labelsSrc = jsx.match(/TAURI_PORTAL_LABEL = Object\.freeze\((\{[^}]*\})\)/);
assert.ok(labelsSrc, "TAURI_PORTAL_LABEL");
const LABELS = Function(`return (${labelsSrc[1]});`)();
assert.deepEqual(LABELS, { call: "pip", sidebar: "sidebar" });
assert.match(winsRs, /if kind == "call" \{\s*"pip"\s*\} else \{\s*"sidebar"\s*\}/, "same labels as wins.rs portal_label");

// Drag: a press on the bar drags, its buttons do not; other kinds / no IPC do nothing.
const attachTauriDrag = fn("attachTauriDrag");
const listeners = [];
const doc = { addEventListener: (t, f) => listeners.push([t, f]), removeEventListener: (t, f) => { const i = listeners.findIndex((l) => l[1] === f); if (i >= 0) listeners.splice(i, 1); } };
const calls = [];
const off = attachTauriDrag(doc, "call", (cmd, args) => { calls.push([cmd, args]); return Promise.resolve(); });
assert.equal(listeners.length, 1);
const el = (onBar, onButton) => ({ closest: (sel) => (sel === ".ax-bar" ? onBar : onButton) });
let prevented = 0;
const press = (target, button = 0) => listeners[0][1]({ button, target, preventDefault: () => { prevented += 1; } });
press(el(true, false));
press(el(true, true));
press(el(false, false));
press(el(true, false), 2);
await new Promise((r) => setTimeout(r, 0));
assert.deepEqual(calls, [["plugin:window|start_dragging", { label: "pip" }]], "only a left press on the bar itself drags the pip window");
assert.equal(prevented, 1);
off();
assert.equal(listeners.length, 0, "detached on close");
assert.equal(typeof attachTauriDrag(doc, "mini", () => {}), "function");
assert.equal(listeners.length, 0, "no drag for unknown kinds");

// Fonts: @font-face rules with absolute URLs; data: URLs kept; other rules skipped.
const fontFaceCss = fn("fontFaceCss");
const fake = {
  baseURI: "https://tauri.localhost/direct/ada",
  styleSheets: [
    { href: null, cssRules: [{ type: 1, cssText: "body { color: red; }" }, { type: 5, cssText: '@font-face { font-family: Inter; src: url("./assets/inter-400.woff2") format("woff2"); }' }] },
    { href: "https://tauri.localhost/assets/app.css", cssRules: [{ type: 5, cssText: "@font-face { font-family: X; src: url(data:font/woff2;base64,AA); }" }] },
    { get cssRules() { throw new Error("cross-origin"); } },
  ],
};
const out = fontFaceCss(fake);
assert.match(out, /url\("https:\/\/tauri\.localhost\/direct\/assets\/inter-400\.woff2"\)/);
assert.match(out, /url\(data:font\/woff2;base64,AA\)/);
assert.doesNotMatch(out, /color: red/);

// Wiring in the component and the stylesheet.
assert.match(jsx, /if \(isTauriShell\(document\)\) doc\.documentElement\.classList\.add\("tauri-app"\);/, "portal document marked html.tauri-app");
assert.match(jsx, /const detachDrag = invoke \? attachTauriDrag\(doc, kind, invoke\) : \(\) => \{\};/);
assert.match(jsx, /try \{ detachDrag\(\); \}/);
assert.match(css, /html\.tauri-app \.ax-bar,\s*html\.tauri-app \.ax-bar \* \{ -webkit-app-region: no-drag; app-region: no-drag; \}/, "no CSS drag region in Tauri");
assert.match(css, /^\.ax-bar \{\s*-webkit-app-region: drag;/m, "Electron keeps its drag region");
console.log("auxWindowTauri.selftest: ok");
