/**
 * Run: node frontend/src/components/dimaai/dimaScroll.selftest.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DIMA_STICK_THRESHOLD_PX, isDimaScrollerNearBottom } from "./dimaScroll.js";

assert.equal(isDimaScrollerNearBottom(null), true);
assert.equal(
  isDimaScrollerNearBottom({ scrollHeight: 800, scrollTop: 680, clientHeight: 120 }),
  true,
);
assert.equal(
  isDimaScrollerNearBottom({ scrollHeight: 800, scrollTop: 0, clientHeight: 120 }),
  false,
);
assert.equal(
  isDimaScrollerNearBottom(
    { scrollHeight: 800, scrollTop: 800 - 120 - DIMA_STICK_THRESHOLD_PX - 1, clientHeight: 120 },
  ),
  false,
);
assert.equal(
  isDimaScrollerNearBottom(
    { scrollHeight: 800, scrollTop: 800 - 120 - DIMA_STICK_THRESHOLD_PX, clientHeight: 120 },
  ),
  true,
);

const workspace = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "DimaAiWorkspace.jsx"), "utf8");
assert.match(workspace, /stickToBottomRef/);
assert.match(workspace, /isDimaScrollerNearBottom/);
assert.equal(
  /if \(el\) el\.scrollTop = el\.scrollHeight;\s*\}, \[messages, busy\]/.test(workspace),
  false,
  "streaming must not force-scroll unless the user is already at the bottom",
);

console.log("dimaScroll.selftest.mjs: ok");
