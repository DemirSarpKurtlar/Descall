// Chat hovers are a theme-ink tint, never an opaque #1e1f22 slab.
// Run: node frontend/src/styles/glass-desktop/messageHover.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));

function css(name) {
  return readFileSync(join(root, name), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
}

function block(source, selector) {
  const start = source.indexOf(selector);
  assert.notEqual(start, -1, `missing ${selector}`);
  const open = source.indexOf("{", start);
  const close = source.indexOf("}", open);
  return source.slice(open + 1, close);
}

const tokens = css("tokens.css");
assert.match(tokens, /--gd-row-hover:\s*color-mix\(in srgb, var\(--g-t1\) 5%, transparent\)/);
assert.match(tokens, /--gd-row-active:\s*color-mix\(in srgb, var\(--g-t1\) 9%, transparent\)/);
assert.match(tokens, /--gd-chip:\s*color-mix\(in srgb, var\(--g-t1\) 8%, transparent\)/);
assert.match(tokens, /--gd-chip-hover:\s*color-mix\(in srgb, var\(--g-t1\) 12%, transparent\)/);

const chat = css("chat.css");
const row = block(chat, "html.glass-desktop .message-group:hover {");
assert.match(row, /background-color:\s*var\(--gd-row-hover\)/);
assert.match(block(chat, "html.glass-desktop .message-group {"), /transition:\s*background-color/);
assert.match(row, /border-radius:\s*12px/);
assert.match(row, /backdrop-filter:\s*none/);
assert.equal(/backdrop-filter:\s*blur/.test(row), false);
assert.equal(/surface-1|#1e1f22|#1E1F22/.test(row), false);

const listHover = block(chat, "html.glass-desktop button.conv-row:hover,");
assert.match(listHover, /background-color:\s*var\(--gd-row-hover\)/);
assert.ok(listHover.length < 80);
assert.match(chat, /html\.glass-desktop \.dm-item:hover/);
assert.match(chat, /html\.glass-desktop \.group-item:hover/);
const listActive = block(chat, "html.glass-desktop button.conv-row.active,");
assert.match(listActive, /var\(--gd-row-active\)/);
assert.match(chat, /html\.glass-desktop \.dm-item\.active/);
assert.match(chat, /html\.glass-desktop \.group-item\.active/);
assert.match(block(chat, "html.glass-desktop .message-file:hover {"), /var\(--gd-row-active\)/);

const menus = css("menus.css");
assert.equal(menus.includes("#1e1f22"), false);
assert.equal(menus.includes("#1E1F22"), false);
assert.match(block(menus, "html.glass-desktop .reaction-chip,"), /var\(--gd-chip\)/);
assert.match(block(menus, "html.glass-desktop .reaction-chip:hover,"), /var\(--gd-chip-hover\)/);
assert.match(block(menus, "html.glass-desktop .message-reply-quote {"), /var\(--gd-row-hover\)/);
assert.match(block(menus, "html.glass-desktop .message-reply-quote:hover {"), /var\(--gd-row-active\)/);
const reply = block(menus, "html.glass-desktop .composer-reply-bar,");
assert.match(reply, /var\(--g-tint-base\)/);
assert.equal(/var\(--surface-1/.test(reply), false);
assert.match(block(menus, "html.glass-desktop .composer-reply-clear:hover {"), /var\(--gd-chip-hover\)/);
assert.match(block(menus, "html.glass-desktop .attachment-item:hover {"), /var\(--gd-chip-hover\)/);
assert.match(block(menus, "html.glass-desktop .gd-row-menu button:hover {"), /var\(--gd-chip-hover\)/);

const social = css("social.css");
assert.match(block(social, "html.glass-desktop .friend-item:hover {"), /background-color:\s*var\(--gd-row-hover\)/);

const rows = readFileSync(join(root, "../conv-rows.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
assert.match(block(rows, "html.glass-desktop .conv-group-wrap.is-desktop:hover,"), /var\(--gd-row-hover\)/);
assert.match(block(rows, "html.glass-desktop .conv-group-wrap.is-desktop.is-active-row,"), /var\(--gd-row-active\)/);
assert.equal(/rgba\(255,\s*255,\s*255,\s*0\.0[59]\)/.test(block(rows, "html.glass-desktop .conv-group-wrap.is-desktop:hover,")), false);

console.log("messageHover.selftest ok");
