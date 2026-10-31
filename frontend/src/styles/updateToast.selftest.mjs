// Run: node src/styles/updateToast.selftest.mjs
// Desktop update card (3.7.14): theme glass like the friend-online toast, brand
// progress line (no fixed red), icon tile, no frost.css slab, ready = chip.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const css = read("./update-toast.css");
const jsx = read("../components/ElectronUpdateToast.jsx");
const polish = read("./ui-polish.css");
const frost = read("./frost.css");
const tr = read("../i18n/locales/tr.js");
const en = read("../i18n/locales/en.js");

assert.match(jsx, /import "\.\.\/styles\/update-toast\.css";/);
assert.match(jsx, /className="eut-card"/);
assert.match(jsx, /className="eut-ic"/);
assert.match(jsx, /import \{ Download, RefreshCw, CheckCircle \} from "\.\/ui\/Icon";/);
// Theme material under glass-desktop, opaque fallbacks, light theme, reduced motion.
assert.match(css, /html\.glass-desktop \.eut-card \{[\s\S]*?var\(--gd-glass-fill\)/);
assert.match(css, /html\.a11y-solid \.eut-card/);
assert.match(css, /:root\[data-theme="light"\]:not\(\.glass-desktop\) \.eut-card/);
assert.match(css, /prefers-reduced-motion/);
// Progress follows the brand colour; the old red gradient is gone everywhere.
assert.match(css, /\.eut-bar-fill \{[\s\S]*?rgba\(var\(--eut-brand\)/);
assert.doesNotMatch(css, /#ff4655/i);
assert.doesNotMatch(polish, /\.electron-update-toast/);
// Not a frost.css surface any more (that was the dark slab).
assert.doesNotMatch(frost, /electron-update-toast/);
// Only the ready chip takes clicks.
assert.match(css, /\.electron-update-toast \{[\s\S]*?pointer-events: none;/);
assert.match(css, /\.electron-update-toast\.is-chip \.eut-card \{[\s\S]*?pointer-events: auto;/);
for (const key of ["titleDownloading", "titleInstalling", "subDownloading", "subDownloadingStart", "subInstalling"]) {
  assert.match(tr, new RegExp(`"${key}":`), `tr ${key}`);
  assert.match(en, new RegExp(`"${key}":`), `en ${key}`);
}
console.log("updateToast.selftest ok");
