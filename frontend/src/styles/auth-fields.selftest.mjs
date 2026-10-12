import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, "auth-fields.css"), "utf8");
const styles = readFileSync(join(here, "../styles.css"), "utf8");

assert.match(styles, /@import '\.\/styles\/glass-desktop\/index\.css';\s*@import '\.\/styles\/auth-fields\.css';/);
assert.match(css, /\.auth-form \.input-wrapper > input:focus-visible/);
assert.match(css, /outline:\s*none/);
assert.match(css, /box-shadow:\s*none/);
assert.match(css, /background:\s*transparent/);
assert.match(css, /inset 0 0 0 2px #8fa6ff/);
assert.doesNotMatch(css, /border-right/);

const glassAuth = readFileSync(join(here, "glass/auth.css"), "utf8");
const autofill = glassAuth.slice(glassAuth.indexOf("input:-webkit-autofill"));
assert.ok(autofill.includes("-webkit-autofill"), "autofill rule present");
assert.doesNotMatch(autofill, /0\.5px/, "autofill plate must not draw an inner border");

console.log("auth-fields.selftest ok");
