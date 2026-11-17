/**
 * Window shortcuts are per window (before-input-event), never OS-wide globalShortcut, and
 * DevTools stay closed in a packaged build without the support opt-in file.
 *
 * Run: node frontend/electron/windowKeys.selftest.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { windowKeyAction, devToolsAllowed, bindWindowKeys, DEVTOOLS_OPT_IN_FILE } = require("./windowKeys.cjs");
const here = dirname(fileURLToPath(import.meta.url));
let failures = 0;
const assert = (cond, msg) => { if (!cond) { failures += 1; console.error(`FAIL ${msg}`); } };

const down = (o) => ({ type: "keyDown", ...o });
assert(windowKeyAction(down({ key: "F11", code: "F11" }), { platform: "win32" }) === "maximize", "F11 maximizes");
assert(windowKeyAction(down({ key: "F12", code: "F12" }), { platform: "win32" }) === "devtools", "F12 opens DevTools");
assert(windowKeyAction(down({ key: "I", code: "KeyI", control: true, shift: true }), { platform: "win32" }) === "devtools", "Ctrl+Shift+I on Windows");
assert(windowKeyAction(down({ key: "I", code: "KeyI", meta: true, shift: true }), { platform: "darwin" }) === "devtools", "Cmd+Shift+I on macOS");
assert(windowKeyAction(down({ key: "I", code: "KeyI", control: true, shift: true }), { platform: "darwin" }) === null, "Ctrl+Shift+I is not the macOS chord");
assert(windowKeyAction(down({ key: "i", code: "KeyI", control: true }), { platform: "win32" }) === null, "Ctrl+I (italic) is left alone");
assert(windowKeyAction({ type: "keyUp", key: "F11", code: "F11" }) === null, "keyUp ignored");
assert(windowKeyAction(down({ key: "F11", code: "F11", isAutoRepeat: true })) === null, "auto-repeat ignored");
assert(windowKeyAction(down({ key: "F11", code: "F11", alt: true })) === null, "Alt chords ignored");
assert(windowKeyAction(null) === null, "no input");

assert(devToolsAllowed({ isPackaged: false }) === true, "dev runs keep DevTools");
assert(devToolsAllowed({ isPackaged: true, userDataDir: "/u", existsSync: () => false }) === false, "packaged: closed without opt-in");
assert(devToolsAllowed({ isPackaged: true, userDataDir: "/u", existsSync: (p) => p.endsWith(DEVTOOLS_OPT_IN_FILE) }) === true, "packaged: opt-in file opens them");
assert(devToolsAllowed({ isPackaged: true, userDataDir: "", existsSync: () => true }) === false, "packaged without userData stays closed");

// bindWindowKeys: consumes only handled keys.
const handlers = {};
let toggled = 0;
let maxed = 0;
const win = { webContents: { on: (ev, fn) => { handlers[ev] = fn; }, toggleDevTools: () => { toggled += 1; } } };
bindWindowKeys(win, { onMaximize: () => { maxed += 1; }, allowDevTools: false, platform: "win32" });
const ev = () => { const e = { prevented: false, preventDefault() { this.prevented = true; } }; return e; };
let e = ev(); handlers["before-input-event"](e, down({ key: "F12", code: "F12" }));
assert(!e.prevented && toggled === 0, "F12 without DevTools permission passes through untouched");
e = ev(); handlers["before-input-event"](e, down({ key: "F11", code: "F11" }));
assert(e.prevented && maxed === 1, "F11 handled and consumed");
e = ev(); handlers["before-input-event"](e, down({ key: "a", code: "KeyA" }));
assert(!e.prevented, "ordinary keys pass through");

// main.cjs must not register OS-wide shortcuts again.
const main = readFileSync(join(here, "main.cjs"), "utf8");
assert(!/globalShortcut\.register\(/.test(main), "main.cjs registers no globalShortcut");
assert(/bindWindowKeys\(mainWindow/.test(main), "main window binds its keys");
assert(/devtools-opened/.test(main), "packaged DevTools guard present");

if (failures) { console.error(`windowKeys.selftest: ${failures} failure(s)`); process.exit(1); }
console.log("windowKeys.selftest: ok");
