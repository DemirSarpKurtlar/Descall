/**
 * Run: node frontend/src/components/AuthView.selftest.mjs
 * The legacy split login panel must not be reachable from any route.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "AuthView.jsx"), "utf8");

assert.doesNotMatch(src, /auth-shell/, "legacy split auth shell is gone");
assert.doesNotMatch(src, /auth-brand-panel/, "legacy brand column is gone");
assert.match(src, /className=\{`gd-auth/, "desktop, Electron, and Android use the glass sheet");
assert.match(src, /className="g-auth"/, "iPhone keeps the phone glass sheet");
assert.match(src, /appearance="glass"/, "Google uses the glass face when it is offered");

console.log("AuthView.selftest.mjs: ok");
