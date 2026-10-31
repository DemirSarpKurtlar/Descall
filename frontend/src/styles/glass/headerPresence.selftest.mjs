// node src/styles/glass/headerPresence.selftest.mjs
// iPhone conversation header (3.7.4): the presence dot on the 36px avatar is
// not clipped by the round button (it read as a leaf) and sits on the edge.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("./chat.css", import.meta.url), "utf8");
const scope = String.raw`html\.glass-ui \.app-root\.g-shell\.in-conversation \.panel-header\.g-conv \.header-identity \.header-avatar`;
assert.match(css, new RegExp(`${scope} \\{\\s*overflow: visible !important;`), "header avatar does not clip the dot");
const dot = css.match(new RegExp(`${scope} > \\.status-badge \\{([^}]*)\\}`));
assert.ok(dot, "header dot rule exists");
assert.match(dot[1], /width: 12px !important/);
assert.match(dot[1], /border-radius: 50% !important/);
assert.match(dot[1], /box-shadow: 0 0 0 2\.5px var\(--g-ring/);
console.log("headerPresence.selftest: ok");
