/**
 * Run: node frontend/src/components/dimaai/dimaArtifacts.selftest.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { isHtmlArtifact, isPythonArtifact, wrapHtmlPreview } from "./dimaArtifacts.js";

const root = dirname(fileURLToPath(import.meta.url));
const live = readFileSync(join(root, "DimaLiveArtifact.jsx"), "utf8");
const md = readFileSync(join(root, "DimaMarkdownView.jsx"), "utf8");

assert.equal(isHtmlArtifact("html", "<h1>Hi</h1>"), true);
assert.equal(isHtmlArtifact("svg", "<svg></svg>"), true);
assert.equal(isHtmlArtifact("js", "<h1>Hi</h1>"), false);
assert.equal(isHtmlArtifact("text", "<!DOCTYPE html><html></html>"), true);
assert.equal(isHtmlArtifact("text", "<div>nope</div>"), false);
assert.equal(isPythonArtifact("python"), true);
assert.equal(isPythonArtifact("py"), true);
assert.equal(isPythonArtifact("javascript"), false);

const wrapped = wrapHtmlPreview("<h1>Hello</h1>", "html");
assert.match(wrapped, /<!DOCTYPE html>/i);
assert.match(wrapped, /Hello/);
assert.match(wrapped, /Content-Security-Policy/);
assert.match(wrapHtmlPreview("<!DOCTYPE html><html><head></head><body>x</body></html>", "html"), /Content-Security-Policy/);

assert.match(live, /sandbox="allow-scripts allow-forms allow-modals"/);
assert.equal(/allow-same-origin/.test(live), false);
assert.match(live, /createPortal/);
assert.match(live, /runDimaPython/);
assert.match(live, /streaming \|\| block\?\.unclosed/);
assert.match(md, /renderDimaArtifact/);
assert.match(md, /unclosed=\{Boolean\(b\.unclosed\)\}/);

console.log("dimaArtifacts.selftest.mjs: ok");
