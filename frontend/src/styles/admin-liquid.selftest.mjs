import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, "admin-liquid.css"), "utf8");
const styles = readFileSync(join(here, "../styles.css"), "utf8");
const panel = readFileSync(join(here, "../components/admin/AdminPanel.jsx"), "utf8");

assert.match(
  styles,
  /@import '\.\/styles\/auth-fields\.css';\s*@import '\.\/styles\/admin-liquid\.css';/
);
assert.equal(css.includes("html.glass-ui"), false, "admin glass is not gated on html.glass-ui");
assert.equal(css.includes("html.glass-desktop"), false, "admin glass is not gated on html.glass-desktop");

const close = css.slice(css.indexOf(".admin-shell .admin-close {"), css.indexOf(".admin-shell .admin-close svg"));
assert.match(close, /padding:\s*0/);
assert.match(close, /border-radius:\s*50%/);
assert.match(close, /display:\s*inline-flex/);
assert.match(close, /align-items:\s*center/);
assert.match(close, /justify-content:\s*center/);
assert.match(close, /width:\s*36px/);
assert.match(close, /height:\s*36px/);

assert.match(panel, /<button type="button" className="admin-close"/);
assert.match(panel, /className="admin-top-bar"/);
assert.doesNotMatch(panel, /RippleButton[\s\S]{0,80}admin-close/);
assert.match(panel, /role="switch"/);
assert.match(panel, /onClick=\{\(\) => onChange\(!checked\)\}/);
assert.match(panel, /className="admin-pane"/);
assert.match(panel, /className="admin-split"/);

console.log("admin-liquid.selftest ok");
