// Tauri (WebView2) turns a CSS app-region: drag into a native caption that swallowed the clicks
// on the window buttons inside it (owner report, desktop 4.0.1, main title bar). Every CSS drag
// region the app ships must therefore be switched off under html.tauri-app and replaced by
// data-tauri-drag-region on the element (Tauri's drag script: drag, double click maximizes),
// and a React onDoubleClick that maximizes must not run a second toggle in Tauri.
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "..");

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}
const files = walk(src);
const cssFiles = files.filter((f) => f.endsWith(".css"));
const jsx = files.filter((f) => /\.(jsx|js)$/.test(f) && !/selftest|\.test\./.test(f)).map((f) => readFileSync(f, "utf8")).join("\n");

/** Portal windows (about:blank children of the main renderer) get neither the shim nor
 *  html.tauri-app; their bar is native-caption only. Listed so a new drag region is a choice. */
const NOT_TAURI_PAGES = new Set([".ax-bar"]);

const rules = (css) => [...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1].trim(), body: m[2] }));
const isDrag = (body) => /(^|[;\s])(-webkit-)?app-region\s*:\s*drag\b/.test(body);
const isNoDrag = (body) => /app-region\s*:\s*no-drag/.test(body);

const found = [];
for (const file of cssFiles) {
  const list = rules(readFileSync(file, "utf8"));
  for (const r of list) {
    if (!isDrag(r.body)) continue;
    for (const raw of r.sel.split(",").map((s) => s.trim()).filter(Boolean)) {
      if (/tauri-app/.test(raw)) continue;
      const leaf = raw.split(/\s+/).pop();
      const cls = (leaf.match(/\.[\w-]+/g) || []).pop();
      if (!cls || NOT_TAURI_PAGES.has(cls)) continue;
      found.push(cls);
      const ends = new RegExp(`\\${cls}(?![\\w-])[^\\s]*$`);
      const covered = list.some((o) => isNoDrag(o.body) && o.sel.split(",").some((s) => s.includes("html.tauri-app") && ends.test(s.trim())));
      assert.ok(covered, `${relative(src, file)}: "${raw}" is a CSS drag region with no html.tauri-app no-drag override`);
      const name = cls.slice(1);
      const tagged = new RegExp(`className=(?:"|\\{?\`)[^"\`]*\\b${name}\\b[^>]*data-tauri-drag-region|data-tauri-drag-region[^>]*className=(?:"|\\{?\`)[^"\`]*\\b${name}\\b`, "s");
      const tagged2 = new RegExp(`className="${name}"\\s*\\n?\\s*data-tauri-drag-region`);
      assert.ok(tagged.test(jsx) || tagged2.test(jsx), `${name}: no element carries data-tauri-drag-region, Tauri could not drag it`);
    }
  }
}
for (const cls of [".titlebar", ".adm-titlebar", ".adm-state", ".st-tb", ".pgl-bar"]) {
  assert.ok(found.includes(cls), `expected ${cls} among the drag regions (scan broken?)`);
}

// A second maximize toggle on double click undoes the one Tauri's drag script already did.
const shell = readFileSync(join(src, "components", "admin", "AdminShell.jsx"), "utf8");
assert.match(shell, /className="adm-titlebar" data-tauri-drag-region="deep" onDoubleClick=\{\(\) => \{ if \(!api\?\.isTauri\) api\?\.maximizeWindow\?\.\(\); \}\}/);
const stats = readFileSync(join(src, "components", "admin", "signupStats", "SignupStatsWindow.jsx"), "utf8");
assert.match(stats, /data-tauri-drag-region=\{electron \? "deep" : undefined\}/, "only the standalone window drags the native window");
assert.match(stats, /else if \(!window\.electronAPI\.isTauri\) window\.electronAPI\.maximizeWindow\?\.\(\);/);
console.log(`tauriDragRegions.selftest: ok (${found.length} drag regions)`);
