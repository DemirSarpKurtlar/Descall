// Run from frontend/: node src/lib/clipboardImage.selftest.mjs
import assert from "node:assert/strict";
import { pastedImageFile } from "./clipboardImage.js";

const png = { type: "image/png", name: "a.png" };
assert.equal(pastedImageFile({ files: [png], items: [] }), png);
assert.equal(pastedImageFile({ files: [], items: [{ kind: "file", type: "image/jpeg", getAsFile: () => png }] }), png);
assert.equal(pastedImageFile({ files: [], items: [{ kind: "string", type: "text/plain" }] }), null, "text paste untouched");
assert.equal(pastedImageFile({ files: [{ type: "application/pdf" }], items: [] }), null);
assert.equal(pastedImageFile(null), null);
console.log("clipboardImage.selftest: ok");
