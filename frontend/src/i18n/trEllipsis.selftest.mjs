// Turkish copy uses the ellipsis character (U+2026), never three full stops (UI audit #141).
// Run: node src/i18n/trEllipsis.selftest.mjs
import assert from "node:assert/strict";

const { default: tr } = await import("./locales/tr.js");

const bad = [];
function walk(node, path) {
  if (typeof node === "string") {
    if (node.includes("...")) bad.push(`${path}: ${node}`);
    return;
  }
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) walk(v, path ? `${path}.${k}` : k);
  }
}
walk(tr.nested, "nested");
walk(tr.phrases, "phrases");

assert.deepEqual(bad, [], `Turkish strings with "..." instead of "…":\n${bad.join("\n")}`);
console.log("trEllipsis.selftest ok");
