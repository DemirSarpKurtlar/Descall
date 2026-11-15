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

// 3.1: the panel chrome (close, menu) lives in AdminShell, not a top bar.
assert.match(panel, /<AdminShell/);
assert.doesNotMatch(panel, /RippleButton[\s\S]{0,80}admin-close/);
// The system switches moved to the Sistem page (components/admin/system/SystemUi.jsx).
const systemUi = readFileSync(join(here, "../components/admin/system/SystemUi.jsx"), "utf8");
assert.match(systemUi, /role="switch"/);
assert.match(systemUi, /onChange\(!checked\)/);
assert.match(panel, /tab === "system" && \(\s*<AdminSystem/);
// The old casino tab was the last user of .admin-split / .admin-pane; Oyunlar / Kredi is
// now its own page (components/admin/games/AdminGames.jsx, styles/admin-games.css).
assert.match(panel, /tab === "casino" && <AdminGames/);

console.log("admin-liquid.selftest ok");
