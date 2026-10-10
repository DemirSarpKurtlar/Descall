// Scene stages stay behind the shell (2.9.185). A fixed z-index:0 stage with a
// spinning child covered the conversation list on iOS. Run:
// node src/styles/glass/theme-scenes.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, "theme-scenes.css"), "utf8");
const keys = ["lagoon", "grove", "hanami", "emberfall", "borealis", "starwell", "chromeveil", "iriscape"];

const code = css.replace(/\/\*[\s\S]*?\*\//g, "");
assert.match(code, /z-index:\s*-1/);
assert.match(code, /position:\s*absolute/);
assert.doesNotMatch(code, /position:\s*fixed/);
assert.match(code, /contain:\s*paint/);
assert.match(css, /isolation:\s*isolate/);
assert.match(css, /:not\(\.mobile-keyboard-lock\)/);
assert.match(css, /color-mix\(in srgb, var\(--g-deep\) 62%, transparent\)/);
assert.doesNotMatch(css, /background-color:\s*transparent\s*!important/);
assert.match(css, /opacity:\s*0\.5/);
assert.doesNotMatch(css, /opacity:\s*0\.85/);
assert.match(css, /-webkit-mask:\s*linear-gradient\(#000 0 0\) content-box/);
assert.match(css, /-webkit-mask-composite:\s*xor/);
assert.match(
  code,
  /html\.glass-ui \.app-root\.g-shell:not\(\.in-conversation\) \.main-panel > \.messages-container > \.empty-state \{\s*visibility:\s*hidden;/,
);
assert.match(
  code,
  /html\.glass-ui \.app-root\.g-shell\.mobile-settings-open > \.app-sidebar-shell,\s*html\.glass-ui \.app-root\.g-shell\.mobile-settings-open > \.app-main-slot \{\s*visibility:\s*hidden;/,
);

for (const key of keys) {
  assert.ok(css.includes(`[data-theme="${key}"] .g-theme-stage`), `${key} stage`);
  assert.ok(css.includes(`[data-theme="${key}"] .app-root.g-shell`), `${key} shell`);
  assert.ok(
    css.includes(`[data-theme="${key}"]:not(.mobile-keyboard-lock) .app-root.g-shell`),
    `${key} keyboard lock`,
  );
}

for (const match of code.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
  const sel = match[1];
  const body = match[2];
  if (!/app-sidebar-shell|app-main-slot/.test(sel)) continue;
  assert.doesNotMatch(body, /position\s*:/, `position on ${sel.trim().slice(0, 60)}`);
  assert.doesNotMatch(body, /transform\s*:/, `transform on ${sel.trim().slice(0, 60)}`);
  assert.doesNotMatch(body, /contain\s*:/, `contain on ${sel.trim().slice(0, 60)}`);
  assert.doesNotMatch(body, /will-change\s*:/, `will-change on ${sel.trim().slice(0, 60)}`);
  assert.doesNotMatch(body, /z-index\s*:/, `z-index on ${sel.trim().slice(0, 60)}`);
}

const chat = readFileSync(join(here, "chat.css"), "utf8");
assert.match(
  chat,
  /html\.glass-ui\.kb-open \.app-root\.g-shell\.in-conversation \.composer-container \{[^}]*bottom:\s*calc\(var\(--kb-gap, 0px\) \+ 8px\)/,
);

console.log("theme-scenes.selftest ok");
