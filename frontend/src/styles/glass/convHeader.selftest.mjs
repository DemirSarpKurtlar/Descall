import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Compact iOS chat header: 44pt bar right under the safe area, thread 8pt below.
const css = readFileSync(new URL("./chat.css", import.meta.url), "utf8");
const tok = css.match(/html\.glass-ui \.app-root\.g-shell\.in-conversation \{([^}]*)\}/)[1];
assert.match(tok, /--g-conv-head-h: 44px;/);
assert.match(tok, /--g-conv-gap: 8px;/);
assert.match(tok, /--g-conv-top: calc\(var\(--g-chrome-top\) \+ var\(--g-conv-head-h\) \+ var\(--g-conv-gap\)\);/);

const rule = (sel) => {
  const i = css.indexOf(`${sel} {`);
  assert.ok(i >= 0, sel);
  return css.slice(i, css.indexOf("}", i));
};
const P = "html.glass-ui .app-root.g-shell.in-conversation";
assert.match(rule(`${P} .panel-header.g-conv`), /top: var\(--g-chrome-top\);[\s\S]*height: var\(--g-conv-head-h\);/);
assert.match(rule(`${P} .panel-header.g-conv .mobile-nav-btn`), /height: var\(--g-conv-head-h\) !important;/);
assert.match(rule(`${P} .panel-header.g-conv .header-identity`), /height: var\(--g-conv-head-h\);/);
assert.match(rule(`${P} .panel-header.g-conv .header-right`), /height: var\(--g-conv-head-h\);/);
assert.match(rule(`${P} .messages-container`), /padding: var\(--g-conv-top\) 14px/);
assert.match(rule(`${P} .chat-search-bar`), /top: var\(--g-conv-top\);/);
// No stale 48px header / 62px thread offsets left behind.
assert.doesNotMatch(css, /var\(--g-chrome-top\) \+ (62|112|56)px/);
// Safe area: native chrome top still comes from env(safe-area-inset-top).
const tokens = readFileSync(new URL("./tokens.css", import.meta.url), "utf8");
assert.match(tokens, /--g-chrome-top: max\(0px, calc\(env\(safe-area-inset-top, 0px\) - 2px\)\);/);

console.log("convHeader.selftest ok");
