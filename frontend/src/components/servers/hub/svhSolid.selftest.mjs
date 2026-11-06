import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const css = readFileSync(new URL("./svh.css", import.meta.url), "utf8");
assert.match(css, /prefers-reduced-transparency: reduce\)\{\.svh-heavy/);
assert.match(css, /a11y-solid,\.gd-lite\) \.svh-heavy\{background:rgba\(24,25,36,\.97\)/);
const s = readFileSync(new URL("../../../styles/servers.css", import.meta.url), "utf8");
assert.match(s, /server-channel-mini-btn::after \{ content: ""; position: absolute; inset: -9px/);
console.log("svhSolid selftest ok");
