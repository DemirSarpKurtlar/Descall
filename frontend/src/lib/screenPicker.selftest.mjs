// Electron screen-share picker (polish pass): grouped, keyboard reachable, shared glass.
// Run: node src/lib/screenPicker.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { groupScreenSources } from "./webrtcScreenShare.js";

const here = dirname(fileURLToPath(import.meta.url));
const g = groupScreenSources([{ id: "screen:0:0" }, { id: "window:5:0" }, { id: "window:6:0" }, null, { id: 3 }]);
assert.deepEqual(g.screens.map((s) => s.id), ["screen:0:0"]);
assert.deepEqual(g.windows.map((s) => s.id), ["window:5:0", "window:6:0"]);
assert.deepEqual(groupScreenSources(undefined), { screens: [], windows: [] });

const js = readFileSync(join(here, "webrtcScreenShare.js"), "utf8");
const picker = js.slice(js.indexOf("export function showElectronScreenPicker"), js.indexOf("export async function captureScreenShareStream"));
assert.match(picker, /item\.type = "button"/, "tiles are buttons");
assert.match(picker, /e\.key === "Escape"/, "Escape cancels");
assert.match(picker, /role", "dialog"/, "dialog semantics");
assert.doesNotMatch(picker, /Object\.assign\([a-z]+\.style/, "no inline-styled DOM any more");
const css = (f) => readFileSync(join(here, "../styles", f), "utf8");
assert.match(css("overlay.css"), /\.electron-screen-picker-overlay/, "shared scrim");
assert.match(css("frost.css"), /\.electron-screen-picker-modal/, "heavy frost card");
const main = readFileSync(join(here, "../../electron/main.cjs"), "utf8");
assert.match(main, /appIconDataURL/, "window tiles get the app icon");
assert.match(main, /trustedHandle\('screen-share:select-source'/, "select-source is a trusted channel");
console.log("screenPicker.selftest ok");
