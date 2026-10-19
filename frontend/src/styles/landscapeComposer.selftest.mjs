// Landscape iPhone (glass-ui at >= 769px): the composer capsule must stay in the
// chat column and stop before the members panel instead of spanning the viewport.
import fs from "node:fs";
import assert from "node:assert/strict";
const css = fs.readFileSync(new URL("./glass/chat.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const block = css.match(/@media \(min-width: 769px\) \{([\s\S]*?)\n\}/);
assert.ok(block, "landscape composer @media block missing");
const body = block[1];
assert.match(body, /\.in-conversation \.chat-panel-shell \.composer-container \{\s*position: absolute;/, "composer must be absolute to the chat column");
assert.match(body, /\.chat-panel-shell:has\(> \.members-panel\) \.composer-container \{\s*right: calc\(var\(--g-members-w, 260px\) \+ 12px\);/, "composer must stop before the members panel");
// The portrait (single column) capsule stays viewport-fixed.
assert.match(css, /html\.glass-ui \.app-root\.g-shell\.in-conversation \.composer-container \{\s*position: fixed;/);
// Members panel width this relies on.
const layout = fs.readFileSync(new URL("./app-layout.css", import.meta.url), "utf8");
assert.match(layout, /\.members-panel \{\s*position: absolute;[\s\S]*?width: 260px;/);
console.log("landscapeComposer.selftest ok");
