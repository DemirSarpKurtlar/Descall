// UI audit #80: these sheets use the --r-sm/md/lg/xl radius tokens instead of
// one-off px values close to them. Run: node src/styles/radiusTokens.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const FILES = ["./admin-feedback-v3.css", "./feedback-a.css", "../components/servers/hub/svh.css"];
const NEAR_TOKEN = new Set([6, 7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 18, 19, 20, 24, 25, 26, 27, 28]);

for (const rel of FILES) {
  const css = readFileSync(new URL(rel, import.meta.url), "utf8");
  for (const m of css.matchAll(/border-radius\s*:\s*([^;}]+)/g)) {
    for (const px of m[1].matchAll(/(?<![\w.-])(\d+)px\b/g)) {
      assert.ok(!NEAR_TOKEN.has(Number(px[1])), `${rel}: border-radius ${m[1].trim()} should use a --r-* token`);
    }
  }
}
console.log("radiusTokens.selftest ok");
