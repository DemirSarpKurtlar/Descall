// Chat image viewer + composer menu layering (2.13.14 bug fixes).
// The full check runs in Electron (electron/e2e/mediaViewerMenus.e2e.cjs); this
// pins the CSS rules it depends on. Run: node src/styles/mediaViewerLayering.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const read = (f) => readFileSync(join(here, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const messages = read("messages.css");
const layout = read("app-layout.css");
const gdMenus = read("glass-desktop/menus.css");

const block = (css, sel) => {
  const re = new RegExp(`(^|\\n)\\s*${sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`, "g");
  return [...css.matchAll(re)].map((m) => m[2]).join("\n");
};

// 1. The viewer starts under the Electron title bar and above a taskbar overlap.
const root = block(messages, ".mv-root");
assert.match(root, /padding:[^;]*var\(--electron-titlebar-h/, ".mv-root must pad by --electron-titlebar-h");
assert.match(root, /padding:[^;]*var\(--electron-bottom-inset/, ".mv-root must pad by --electron-bottom-inset");

// 2. The image is sized from the stage, not from a fixed 100vh offset.
assert.match(block(messages, ".mv-stage"), /container-type:\s*size/, ".mv-stage must be a size container");
assert.match(messages, /@supports \(height: 1cqh\)\s*\{\s*\.mv-img\s*\{[^}]*max-height:\s*calc\(100cqh/, ".mv-img must fit the stage height (cqh)");
for (const m of messages.matchAll(/\.mv-img\s*\{([^}]*)\}/g)) {
  const mh = /max-height:\s*([^;]+);/.exec(m[1]);
  if (mh && mh[1].includes("100vh")) assert.match(mh[1], /--electron-titlebar-h/, `.mv-img fallback "${mh[1]}" must subtract the title bar`);
}

// 3. Chat content never paints over the composer's in-place menus.
assert.match(block(messages, ".message-avatar"), /isolation:\s*isolate/, ".message-avatar must isolate its status dot");
const z = Number(/z-index:\s*(\d+)/.exec(block(layout, ".composer-container"))?.[1]);
assert.ok(z > 30, `.composer-container z-index ${z} must beat list content (menu-open bubble 25, inline picker 30)`);

// 4. The emoji picker fits a short window.
assert.match(block(gdMenus, "html.glass-desktop .emoji-picker"), /max-height:\s*min\(420px,\s*calc\(100vh - var\(--electron-titlebar-h/, "emoji picker max-height must follow the window");

console.log("mediaViewerLayering selftest OK");
