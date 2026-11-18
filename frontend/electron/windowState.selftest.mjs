/**
 * The main window comes back where the user left it, never off screen.
 * Run: node frontend/electron/windowState.selftest.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { parseWindowState, pickRestoreBounds, serializeWindowState } = require("./windowState.cjs");
const here = dirname(fileURLToPath(import.meta.url));
let failures = 0;
const assert = (c, m) => { if (!c) { failures += 1; console.error(`FAIL ${m}`); } };

const primary = { workArea: { x: 0, y: 0, width: 1920, height: 1040 } };
const second = { workArea: { x: 1920, y: 0, width: 1280, height: 984 } };

assert(parseWindowState("nope") === null, "garbage is ignored");
assert(parseWindowState('{"x":1,"y":2,"width":0,"height":5}') === null, "zero size is ignored");
const s = parseWindowState(serializeWindowState({ normalBounds: { x: 2000, y: 40, width: 1200, height: 800 }, maximized: true }));
assert(s && s.x === 2000 && s.maximized === true, "round trip keeps bounds and maximized");

const onSecond = pickRestoreBounds(s, [primary, second], { minWidth: 1200, minHeight: 700 });
assert(onSecond && onSecond.x >= 1920 && onSecond.width === 1200 && onSecond.maximized, "restores on the second monitor");
assert(pickRestoreBounds(s, [primary]) === null, "a monitor that is gone falls back to the default");
const big = pickRestoreBounds({ x: 100, y: 100, width: 3000, height: 2000, maximized: false }, [primary]);
assert(big.width === 1920 && big.height === 1040 && big.x === 0 && big.y === 0, "too large is fitted into the work area");

const main = readFileSync(join(here, "main.cjs"), "utf8");
assert(main.includes("require('./windowState.cjs')"), "main uses windowState");
assert(/saveWindowStateSoon/.test(main) && /mainWindow\.on\('resize'/.test(main), "main saves on resize/move");

if (failures) { console.error(`windowState.selftest: ${failures} failure(s)`); process.exit(1); }
console.log("windowState.selftest: ok");
