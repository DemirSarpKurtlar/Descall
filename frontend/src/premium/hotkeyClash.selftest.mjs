/**
 * hotkeyClash.js: quick launcher vs command center on the same global shortcut.
 *   node src/premium/hotkeyClash.selftest.mjs
 */
import assert from "node:assert/strict";
import { accelKey, commandCenterHotkeyResult, launcherCommandCenterClash, sameAccel, setCommandCenterHotkeyResult } from "./hotkeyClash.js";

assert.equal(accelKey("CommandOrControl+Shift+K"), "ctrl+shift+k");
assert.equal(accelKey("Shift+Control+k"), "ctrl+shift+k");
assert.equal(accelKey(""), "");
assert.ok(sameAccel("CommandOrControl+Shift+K", "Ctrl+Shift+K"));
assert.ok(!sameAccel("CommandOrControl+Shift+K", "CommandOrControl+Shift+Space"));
assert.ok(!sameAccel("", ""));

const all = () => true;
const base = { has: all, launcher: { enabled: true }, commandCenter: { hotkey: "CommandOrControl+Shift+K" }, custom: { bindings: {} } };
// Both defaults: clash.
assert.equal(launcherCommandCenterClash(base), "CommandOrControl+Shift+K");
// Quick launcher off by default: no clash.
assert.equal(launcherCommandCenterClash({ ...base, launcher: {} }), "");
assert.equal(launcherCommandCenterClash({ ...base, launcher: { enabled: false } }), "");
// Command center switched off: no clash.
assert.equal(launcherCommandCenterClash({ ...base, commandCenter: { enabled: false, hotkey: "CommandOrControl+Shift+K" } }), "");
// Plus plan (no command center): no clash.
assert.equal(launcherCommandCenterClash({ ...base, has: (k) => k !== "command_center" }), "");
// Either shortcut changed: no clash.
assert.equal(launcherCommandCenterClash({ ...base, custom: { bindings: { quick_launcher: "CommandOrControl+Shift+Space" } } }), "");
assert.equal(launcherCommandCenterClash({ ...base, commandCenter: { hotkey: "CommandOrControl+Alt+K" } }), "");
// Launcher unbound ("") or command center without a hotkey: no clash.
assert.equal(launcherCommandCenterClash({ ...base, custom: { bindings: { quick_launcher: "" } } }), "");
assert.equal(launcherCommandCenterClash({ ...base, commandCenter: { hotkey: "" } }), "");
// Custom bindings apply only while custom_hotkeys runs (Electron / Rust resolve_bindings).
assert.equal(launcherCommandCenterClash({ ...base, custom: { enabled: false, bindings: { quick_launcher: "CommandOrControl+Shift+Space" } } }), "CommandOrControl+Shift+K");
// Both moved to the same other shortcut: still a clash.
assert.equal(launcherCommandCenterClash({ ...base, custom: { bindings: { quick_launcher: "Alt+Space" } }, commandCenter: { hotkey: "Alt+Space" } }), "Alt+Space");

// The shell's answer store.
setCommandCenterHotkeyResult("CommandOrControl+Shift+K", { ok: false, hotkey: "", conflict: "quick_launcher" });
assert.deepEqual(commandCenterHotkeyResult(), { ok: false, accel: "CommandOrControl+Shift+K", conflict: "quick_launcher" });
// A "locked" answer (feature not started yet, the bridge resends) is not a failure.
setCommandCenterHotkeyResult("CommandOrControl+Alt+K", { ok: false, error: "locked" });
assert.deepEqual(commandCenterHotkeyResult(), { ok: false, accel: "CommandOrControl+Shift+K", conflict: "quick_launcher" });
setCommandCenterHotkeyResult("", { ok: true, hotkey: "" });
assert.equal(commandCenterHotkeyResult(), null);
setCommandCenterHotkeyResult("CommandOrControl+Shift+K", { ok: false, error: "locked" });
assert.equal(commandCenterHotkeyResult(), null, "locked leaves the result unknown");
setCommandCenterHotkeyResult("CommandOrControl+Shift+K", { ok: false, error: "Error invoking remote method 'premium:invoke': Error: No handler registered for 'premium:command_center:hotkey'" });
assert.equal(commandCenterHotkeyResult(), null, "Electron's not-started answer is not a failure either");

console.log("hotkeyClash.selftest ok");
