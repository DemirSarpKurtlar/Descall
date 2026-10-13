// Phone web: Safari's floating toolbar samples html/body. The document must
// scroll and the canvas color must be the aurora bottom, not black.
// Run: node src/styles/glass/safariToolbar.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const html = readFileSync(join(root, "index.html"), "utf8");
const shell = readFileSync(join(root, "src/styles/glass/shell.css"), "utf8");
const layout = readFileSync(join(root, "src/components/layout/AppLayout.jsx"), "utf8");

assert.match(html, /viewport-fit=cover/, "viewport-fit=cover stays on the viewport meta");
assert.doesNotMatch(html, /theme-color" content="#000/, "theme-color is never #000");
assert.match(html, /theme\.setAttribute\("content", "#101118"\)/, "phone web theme-color is the aurora bottom");

const lockAt = html.indexOf('html[data-app-shell="1"]');
const unlockAt = html.indexOf("html.boot-phone-web[data-app-shell=\"1\"]");
assert.ok(lockAt > 0 && unlockAt > lockAt, "phone-web unlock comes after the 100dvh shell lock");

const unlock = html.slice(unlockAt, html.indexOf("html.electron-app[data-app-shell=\"1\"]"));
assert.match(unlock, /min-height:\s*100lvh/);
assert.match(unlock, /overflow-y:\s*auto/);
assert.match(unlock, /background-color:\s*#101118/);
assert.match(unlock, /padding-bottom:\s*env\(safe-area-inset-bottom/);
assert.match(unlock, /#root[\s\S]*overflow:\s*visible/);
assert.match(unlock, /#root[\s\S]*background-color:\s*transparent/);
assert.match(html, /width < 960 && \(mobileUa \|\| \(width > 0 && width <= 768\)\)/, "phone UA counts even when innerWidth is still 0");

assert.match(shell, /html\.glass-ui:not\(\.native-app\):not\(\.mobile-keyboard-lock\) body[\s\S]*padding-bottom:\s*env\(safe-area-inset-bottom/);
assert.match(shell, /html\.glass-ui:not\(\.native-app\):not\(\.mobile-keyboard-lock\) #root[\s\S]*background-color:\s*transparent !important/);
assert.match(shell, /position:\s*relative !important/);
assert.match(shell, /\.sidebar-content[\s\S]*overflow:\s*visible !important/);
assert.match(shell, /html\.glass-ui:not\(\.native-app\) \.app-root\.is-mobile\.g-shell:not\(\.in-conversation\) \.g-list-head[\s\S]*position:\s*fixed/);

assert.match(
  layout,
  /if \(glassShell && !native\) return;[\s\S]*document\.body\.style\.overflow = "hidden"/,
  "phone web glass does not inline-lock body overflow"
);

console.log("safariToolbar.selftest ok");
