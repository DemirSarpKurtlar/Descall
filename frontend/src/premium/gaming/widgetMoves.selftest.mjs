// Desktop widgets: the shell's "moved" reports must not echo back into a re-apply loop
// (the Tauri shell also reports the moves it makes itself when placing the widgets).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { widgetsAfterMove } from "./widgetMoves.js";

const list = [
  { id: "friends-0", kind: "friends", x: 40, y: 80, width: 240, height: 220 },
  { id: "calls-1", kind: "calls", x: 300, y: 80, width: 240, height: 220 },
];
assert.equal(widgetsAfterMove(list, { id: "friends-0", x: 40, y: 80, width: 240, height: 220 }), null, "same position (shell placement echo): nothing saved");
assert.equal(widgetsAfterMove(list, { id: "friends-0", x: 40.4, y: 79.6 }), null, "rounding noise is the same position");
assert.equal(widgetsAfterMove(list, { id: "nope", x: 1, y: 2 }), null, "unknown widget");
assert.equal(widgetsAfterMove(list, { id: "calls-1", x: "a", y: 2 }), null, "bad numbers");
assert.equal(widgetsAfterMove(list, null), null);
const next = widgetsAfterMove(list, { id: "calls-1", x: 512, y: 300, width: 999 });
assert.deepEqual(next[1], { id: "calls-1", kind: "calls", x: 512, y: 300, width: 240, height: 220 }, "a real drag moves only x / y");
assert.equal(next[0], list[0], "other widgets untouched");
assert.equal(list[1].x, 300, "input not mutated");

const here = dirname(fileURLToPath(import.meta.url));
const host = readFileSync(join(here, "PremiumGamingHost.jsx"), "utf8");
assert.match(host, /const next = widgetsAfterMove\(widgets\.widgets \|\| \[\], m\);\s*if \(next\) updateWidgets\(\{ widgets: next \}\);/, "the host saves only real moves");
console.log("widgetMoves.selftest: ok");
