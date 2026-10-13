import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, "google-signin.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const styles = readFileSync(join(here, "../styles.css"), "utf8");
const marketing = readFileSync(join(here, "../site/marketing-entry.css"), "utf8");

assert.match(styles, /@import '\.\/styles\/rail-icons\.css';\s*@import '\.\/styles\/google-signin\.css';/);
assert.match(marketing, /@import "\.\.\/styles\/google-signin\.css";/);
assert.match(css, /width:\s*100%/);
assert.match(css, /min-width:\s*0/);
assert.match(css, /padding:\s*10px 18px/);
assert.match(css, /justify-content:\s*center/);
assert.match(css, /container-type:\s*inline-size/);
assert.match(css, /@container google-signin \(max-width:\s*280px\)/);
assert.match(css, /@container google-signin \(max-width:\s*220px\)/);
assert.match(css, /white-space:\s*normal/);
assert.match(css, /text-overflow:\s*unset/);
assert.equal(/text-overflow:\s*ellipsis/.test(css), false);
assert.equal(/white-space:\s*nowrap/.test(css), false);
assert.match(css, /font-size:\s*14px/);
assert.match(css, /font-size:\s*13px/);

const face = readFileSync(join(here, "auth-splash.css"), "utf8");
const faceRule = face.slice(face.indexOf(".google-signin-glass-face {"));
assert.match(faceRule, /height:\s*auto/);
assert.match(faceRule, /white-space:\s*normal/);

console.log("google-signin.selftest ok");
